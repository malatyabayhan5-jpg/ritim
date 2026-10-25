package expo.modules.kurguengine

import android.content.Context
import android.media.Image
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.net.Uri
import android.util.Log
import expo.modules.kurguengine.vision.GlobalMotion
import expo.modules.kurguengine.vision.Tracker
import kotlin.math.max

/**
 * Hareket takibi: videoyu donanım kod çözücüsüyle çözer, saniyede `samplesPerSecond`
 * kareyi küçültülmüş (uzun kenar ≤ [MAX_SIDE]) parlaklık görüntüsüne çevirir ve
 * [Tracker] ile seçilen kutuyu izler ya da sabitleme için genel kamera kaymasını ölçer.
 * Kutu ve sonuçlar GÖRÜNEN karenin (döndürme meta verisi uygulanmış) 0..1 koordinatlarındadır. Anahtar kareye dönüştürme
 * JS tarafında yapılır (src/model/tracking.js). Cihaz içinde çalışır, model gerekmez.
 */
object MotionTracker {
  private const val MAX_SIDE = 256
  @Volatile private var cancelled = false

  fun cancel() { cancelled = true }

  /**
   * @param box görünen karede [merkez x, merkez y, genişlik, yükseklik] (0..1)
   * @return [{ t: kaynak ms, x, y: merkez (0..1), c: güven 0..1 }]
   */
  fun track(
    context: Context,
    uriString: String,
    fromMs: Long,
    toMs: Long,
    box: List<Double>,
    samplesPerSecond: Int,
    onProgress: (Double) -> Unit,
  ): List<Map<String, Double>> {
    var tracker: Tracker? = null
    val out = ArrayList<Map<String, Double>>()
    val info = frames(context, uriString, fromMs, toMs, samplesPerSecond, onProgress) { t, g ->
      val tr = tracker
      if (tr == null) {
        val created = Tracker(g.px, g.w, g.h, (box[0] * g.w).toFloat(), (box[1] * g.h).toFloat(), (box[2] * g.w).toFloat(), (box[3] * g.h).toFloat())
        tracker = created
        out.add(point(t, (created.x() / g.w).toDouble(), (created.y() / g.h).toDouble(), 1.0))
      } else {
        val r = tr.update(g.px)
        out.add(point(t, (r[0] / g.w).toDouble(), (r[1] / g.h).toDouble(), r[2].toDouble()))
      }
    }
    Log.i("KurguAI", "track points=${out.size} $info lost=${out.count { (it["c"] ?: 0.0) < Tracker.LOST }}")
    return out
  }

  /**
   * Sabitleme için kamera hareketi: ardışık örnekler arasındaki genel kayma ([GlobalMotion]).
   * İlk örnek dışında her örnek bir öncekine göre içeriğin kaymasıdır, görünen karenin
   * kesri olarak (dx genişliğe, dy yüksekliğe göre; y aşağı). Yol yumuşatma ve anahtar
   * kareye çevirme JS tarafında (src/model/stabilize.js).
   * @return [{ t: kaynak ms, dx, dy, c: güven 0..1 }]
   */
  fun stabilize(
    context: Context,
    uriString: String,
    fromMs: Long,
    toMs: Long,
    samplesPerSecond: Int,
    onProgress: (Double) -> Unit,
  ): List<Map<String, Double>> {
    var prev: Gray? = null
    val out = ArrayList<Map<String, Double>>()
    val info = frames(context, uriString, fromMs, toMs, samplesPerSecond, onProgress) { t, g ->
      val p = prev
      if (p == null || p.w != g.w || p.h != g.h) {
        out.add(mapOf("t" to t / 1000.0, "dx" to 0.0, "dy" to 0.0, "c" to 1.0))
      } else {
        val m = GlobalMotion.estimate(p.px, g.px, g.w, g.h)
        out.add(mapOf("t" to t / 1000.0, "dx" to (m[0] / g.w).toDouble(), "dy" to (m[1] / g.h).toDouble(), "c" to m[2].toDouble()))
      }
      prev = g
    }
    Log.i("KurguAI", "stabilize samples=${out.size} $info low=${out.count { (it["c"] ?: 0.0) < 0.15 }}")
    return out
  }

  /**
   * Videoyu donanım kod çözücüsüyle çözer; kaynak [fromMs, toMs] aralığında saniyede
   * `samplesPerSecond` kareyi küçültülmüş, görünen yöne döndürülmüş gri görüntü olarak verir.
   * @return günlük için "size=WxH rot=R"
   */
  private fun frames(
    context: Context,
    uriString: String,
    fromMs: Long,
    toMs: Long,
    samplesPerSecond: Int,
    onProgress: (Double) -> Unit,
    onFrame: (Long, Gray) -> Unit,
  ): String {
    cancelled = false
    val ex = MediaExtractor()
    var codec: MediaCodec? = null
    try {
      ex.setDataSource(context, Uri.parse(uriString), null)
      var track = -1
      var format: MediaFormat? = null
      for (i in 0 until ex.trackCount) {
        val f = ex.getTrackFormat(i)
        if (f.getString(MediaFormat.KEY_MIME)?.startsWith("video/") == true) { track = i; format = f; break }
      }
      if (track < 0 || format == null) throw IllegalStateException("NO_VIDEO")
      val rotation = if (format.containsKey(MediaFormat.KEY_ROTATION)) format.getInteger(MediaFormat.KEY_ROTATION) else 0
      ex.selectTrack(track)
      ex.seekTo(fromMs * 1000, MediaExtractor.SEEK_TO_PREVIOUS_SYNC)
      codec = MediaCodec.createDecoderByType(format.getString(MediaFormat.KEY_MIME)!!)
      codec.configure(format, null, null, 0)
      codec.start()

      val stepUs = 1_000_000L / samplesPerSecond.coerceIn(1, 30)
      val startUs = fromMs * 1000
      val endUs = toMs * 1000
      var nextUs = startUs
      var gw = 0
      var gh = 0
      val info = MediaCodec.BufferInfo()
      var inputDone = false
      var outputDone = false
      while (!outputDone) {
        if (cancelled) throw IllegalStateException("CANCELLED")
        if (!inputDone) {
          val inIdx = codec.dequeueInputBuffer(10_000)
          if (inIdx >= 0) {
            val buf = codec.getInputBuffer(inIdx)!!
            val size = ex.readSampleData(buf, 0)
            if (size < 0 || ex.sampleTime > endUs + 500_000) {
              codec.queueInputBuffer(inIdx, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
              inputDone = true
            } else {
              codec.queueInputBuffer(inIdx, 0, size, ex.sampleTime, 0)
              ex.advance()
            }
          }
        }
        val outIdx = codec.dequeueOutputBuffer(info, 10_000)
        if (outIdx >= 0) {
          val t = info.presentationTimeUs
          if (info.size > 0 && t >= nextUs && t <= endUs) {
            val image = codec.getOutputImage(outIdx)
            if (image != null) {
              val g = luma(image, rotation)
              image.close()
              gw = g.w
              gh = g.h
              onFrame(t, g)
              nextUs = t + stepUs
              if (endUs > startUs) onProgress(((t - startUs).toDouble() / (endUs - startUs)).coerceIn(0.0, 1.0))
            }
          }
          codec.releaseOutputBuffer(outIdx, false)
          if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0 || t > endUs) outputDone = true
        }
      }
      return "size=${gw}x$gh rot=$rotation"
    } finally {
      try { codec?.stop() } catch (e: Exception) {}
      codec?.release()
      ex.release()
    }
  }

  private fun point(tUs: Long, x: Double, y: Double, c: Double) =
    mapOf("t" to tUs / 1000.0, "x" to x, "y" to y, "c" to c)

  private class Gray(val px: ByteArray, val w: Int, val h: Int)

  /**
   * Y düzleminden kutu ortalamasıyla küçültülmüş, görünen yöne döndürülmüş gri görüntü.
   * Ortalama alma (yalnızca örnekleme değil) küçültmede örtüşmeyi azaltır.
   */
  private fun luma(image: Image, rotation: Int): Gray {
    val iw = image.width
    val ih = image.height
    val f = max(1, (max(iw, ih) + MAX_SIDE - 1) / MAX_SIDE)
    val sw = iw / f
    val sh = ih / f
    val plane = image.planes[0]
    val buf = plane.buffer
    val rs = plane.rowStride
    val ps = plane.pixelStride
    val small = ByteArray(sw * sh)
    val area = f * f
    for (y in 0 until sh) {
      for (x in 0 until sw) {
        var sum = 0
        for (j in 0 until f) {
          val row = (y * f + j) * rs
          for (i in 0 until f) sum += buf.get(row + (x * f + i) * ps).toInt() and 0xFF
        }
        small[y * sw + x] = (sum / area).toByte()
      }
    }
    val rot = ((rotation % 360) + 360) % 360
    if (rot == 0) return Gray(small, sw, sh)
    val dw = if (rot == 180) sw else sh
    val dh = if (rot == 180) sh else sw
    val d = ByteArray(dw * dh)
    for (y in 0 until sh) {
      for (x in 0 until sw) {
        // Ham (x, y) -> görünen (dx, dy), saat yönünde döndürme
        val (dx, dy) = when (rot) {
          90 -> Pair(sh - 1 - y, x)
          180 -> Pair(sw - 1 - x, sh - 1 - y)
          else -> Pair(y, sw - 1 - x)
        }
        d[dy * dw + dx] = small[y * sw + x]
      }
    }
    return Gray(d, dw, dh)
  }
}
