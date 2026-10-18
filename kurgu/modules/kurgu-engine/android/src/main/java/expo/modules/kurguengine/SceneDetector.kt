package expo.modules.kurguengine

import android.content.Context
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.net.Uri
import android.util.Log
import kotlin.math.abs
import kotlin.math.max

/**
 * Sahne algılama için ham ölçüm: videoyu donanım kod çözücüsüyle çözer, saniyede
 * `samplesPerSecond` kare için seyrek örneklenmiş Y/U/V histogramı çıkarır ve
 * ardışık örnekler arasındaki farkı (0..1) döndürür. Kesme kararı JS tarafında
 * (src/model/ai.js pickSceneCuts) verilir. Cihaz içinde çalışır, model gerekmez.
 */
object SceneDetector {
  private const val Y_BINS = 16
  private const val C_BINS = 8

  fun scores(context: Context, uriString: String, fromMs: Long, toMs: Long, samplesPerSecond: Int): List<Map<String, Double>> {
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
      if (track < 0 || format == null) return emptyList()
      ex.selectTrack(track)
      ex.seekTo(fromMs * 1000, MediaExtractor.SEEK_TO_PREVIOUS_SYNC)
      codec = MediaCodec.createDecoderByType(format.getString(MediaFormat.KEY_MIME)!!)
      codec.configure(format, null, null, 0)
      codec.start()

      val stepUs = 1_000_000L / samplesPerSecond.coerceIn(1, 30)
      val endUs = if (toMs > fromMs) toMs * 1000 else Long.MAX_VALUE
      var nextUs = fromMs * 1000
      var prev: FloatArray? = null
      var decoded = 0
      var imageNull = 0
      val out = ArrayList<Map<String, Double>>()
      val info = MediaCodec.BufferInfo()
      var inputDone = false
      var outputDone = false
      while (!outputDone) {
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
          decoded++
          val t = info.presentationTimeUs
          if (info.size > 0 && t >= nextUs && t <= endUs) {
            val image = codec.getOutputImage(outIdx)
            if (image == null) imageNull++
            if (image != null) {
              val h = histogram(image)
              image.close()
              prev?.let { out.add(mapOf("t" to t / 1000.0, "d" to distance(it, h).toDouble())) }
              prev = h
              nextUs = t + stepUs
            }
          }
          codec.releaseOutputBuffer(outIdx, false)
          if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0 || t > endUs) outputDone = true
        }
      }
      Log.i("KurguAI", "sceneScores frames=$decoded sampled=${out.size + (if (prev != null) 1 else 0)} imageNull=$imageNull codec=${codec.name}")
      return out
    } finally {
      try { codec?.stop() } catch (e: Exception) {}
      codec?.release()
      ex.release()
    }
  }

  /** YUV_420_888 karesinden seyrek örneklenmiş, normalize Y(16)+U(8)+V(8) histogramı. */
  private fun histogram(image: android.media.Image): FloatArray {
    val h = FloatArray(Y_BINS + 2 * C_BINS)
    val w = image.width
    val ht = image.height
    val step = max(2, minOf(w, ht) / 72)
    val y = image.planes[0]
    val u = image.planes[1]
    val v = image.planes[2]
    var n = 0
    var row = 0
    while (row < ht) {
      var col = 0
      while (col < w) {
        val yy = y.buffer.get(row * y.rowStride + col * y.pixelStride).toInt() and 0xFF
        val ci = (row / 2) * u.rowStride + (col / 2) * u.pixelStride
        val cv = (row / 2) * v.rowStride + (col / 2) * v.pixelStride
        val uu = u.buffer.get(ci).toInt() and 0xFF
        val vv = v.buffer.get(cv).toInt() and 0xFF
        h[yy * Y_BINS / 256]++
        h[Y_BINS + uu * C_BINS / 256]++
        h[Y_BINS + C_BINS + vv * C_BINS / 256]++
        n++
        col += step
      }
      row += step
    }
    if (n > 0) for (i in h.indices) h[i] /= n.toFloat()
    return h
  }

  /** Histogram farkı: parlaklık %60, renk %40 ağırlıklı yarım L1 (0..1). */
  fun distance(a: FloatArray, b: FloatArray): Float {
    var dy = 0f
    var dc = 0f
    for (i in 0 until Y_BINS) dy += abs(a[i] - b[i])
    for (i in Y_BINS until a.size) dc += abs(a[i] - b[i])
    return 0.6f * dy * 0.5f + 0.4f * dc * 0.25f
  }
}
