package expo.modules.kurguengine

import android.content.Context
import android.graphics.Bitmap
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMetadataRetriever
import android.media.MediaMuxer
import android.net.Uri
import android.os.Build
import android.util.Log
import java.io.File
import java.nio.ByteBuffer
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Videoda arka plan kaldırma: kaynak aralığın her karesinde kişi ayırılır (Segmenter, DeepLab v3)
 * ve kişi dışındaki her yer anahtar yeşiline (KEY_RGB) boyanarak yeniden kodlanır. MP4 saydamlık
 * taşımadığı için sonuç, katmanın chroma key'i bu yeşile ayarlanarak saydam gösterilir.
 * Maske kareler arasında üstel ortalamayla yumuşatılır (titreşmesin), kenar yumuşak eşikle
 * inceltilir. Ses olduğu gibi kopyalanır (yeniden kodlanmaz). Cihazda çalışır; ağ kullanmaz.
 * Android 9+ (getFramesAtIndex) gerekir.
 */
object Cutout {
  private const val TAG = "KurguCutout"
  private const val CHUNK = 4 // aynı anda bellekte tutulan kaynak kare sayısı
  private const val MAX_FRAMES = 30 * 60 // 60 sn @30 fps
  /** Anahtar yeşili: JS tarafındaki DEFAULT_CHROMA rengiyle aynı (#00B140). */
  const val KEY_RGB = 0x00B140
  private const val SMOOTH = 0.6f // yeni karenin maske ağırlığı
  private const val LO = 0.35f
  private const val HI = 0.65f
  @Volatile private var cancelled = false

  fun cancel() {
    cancelled = true
  }

  private fun checkCancel() {
    if (cancelled) throw IllegalStateException("CANCELLED")
  }

  fun run(context: Context, uriString: String, fromMs: Long, toMs: Long, outPath: String, maxSide: Int, onProgress: (Double) -> Unit): Map<String, Any> {
    if (Build.VERSION.SDK_INT < 28) throw IllegalStateException("CUTOUT_UNSUPPORTED")
    cancelled = false
    val uri = Uri.parse(uriString)
    val mmr = MediaMetadataRetriever()
    val out = File(outPath.removePrefix("file://"))
    out.parentFile?.mkdirs()
    var muxer: MediaMuxer? = null
    var encoder: MediaCodec? = null
    try {
      mmr.setDataSource(context, uri)
      val durMs = mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0L
      val frameCount = mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_FRAME_COUNT)?.toIntOrNull() ?: 0
      val vw = mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toIntOrNull() ?: 0
      val vh = mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)?.toIntOrNull() ?: 0
      val rot = mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)?.toIntOrNull() ?: 0
      if (durMs <= 0 || frameCount <= 0 || vw <= 0 || vh <= 0) throw IllegalStateException("CUTOUT_NO_VIDEO")
      val fps = (frameCount * 1000.0 / durMs).coerceIn(1.0, 120.0)
      val first = floor(fromMs * fps / 1000.0).toInt().coerceIn(0, frameCount - 1)
      val last = (ceil(min(toMs, durMs) * fps / 1000.0).toInt() - 1).coerceIn(first, frameCount - 1)
      val n = last - first + 1
      if (n > MAX_FRAMES) throw IllegalStateException("CUTOUT_TOO_LONG")

      val (dw, dh) = if (rot == 90 || rot == 270) vh to vw else vw to vh
      val k = min(1.0, maxSide.toDouble() / max(dw, dh))
      val outW = max(2, (dw * k / 2).roundToInt() * 2)
      val outH = max(2, (dh * k / 2).roundToInt() * 2)

      val audio = copyAudio(context, uri, fromMs * 1000, min(toMs, durMs) * 1000)
      checkCancel()

      val fmt = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, outW, outH).apply {
        setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420Flexible)
        // Yüksek bit hızı: yeşil kenarlarda sıkıştırma izi chroma key'i bozmasın
        setInteger(MediaFormat.KEY_BIT_RATE, max(2_000_000, (outW * outH * fps * 0.2).toInt()))
        setFloat(MediaFormat.KEY_FRAME_RATE, fps.toFloat())
        setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 1)
      }
      val enc = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_VIDEO_AVC)
      encoder = enc
      enc.configure(fmt, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
      enc.start()
      val mux = MediaMuxer(out.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
      muxer = mux
      var videoTrack = -1
      var started = false
      var audioWritten = false
      val info = MediaCodec.BufferInfo()
      val argb = IntArray(outW * outH)
      val frameUs = 1_000_000.0 / fps
      val grid = Segmenter.GRID
      var mask: FloatArray? = null
      var coverage = 0.0

      fun drain(endOfStream: Boolean) {
        while (true) {
          val idx = enc.dequeueOutputBuffer(info, if (endOfStream) 10_000 else 0)
          if (idx == MediaCodec.INFO_TRY_AGAIN_LATER) {
            if (!endOfStream) return
            continue
          }
          if (idx == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
            videoTrack = mux.addTrack(enc.outputFormat)
            // Kaynağın ses biçimi MP4'e eklenemiyorsa (ör. desteklenmeyen kodek) video sessiz çıkar
            val audioTrack = audio?.let { a -> try { mux.addTrack(a.first) } catch (e: Exception) { Log.w(TAG, "audio track skipped", e); -1 } } ?: -1
            mux.start()
            started = true
            if (audio != null && audioTrack >= 0) {
              audioWritten = true
              val ai = MediaCodec.BufferInfo()
              for ((data, pts, flags) in audio.second) {
                ai.set(0, data.size, pts, flags)
                mux.writeSampleData(audioTrack, ByteBuffer.wrap(data), ai)
              }
            }
            continue
          }
          if (idx < 0) continue
          val buf = enc.getOutputBuffer(idx)!!
          if (info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0) info.size = 0
          if (info.size > 0 && started) {
            buf.position(info.offset)
            buf.limit(info.offset + info.size)
            mux.writeSampleData(videoTrack, buf, info)
          }
          enc.releaseOutputBuffer(idx, false)
          if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) return
        }
      }

      val params = MediaMetadataRetriever.BitmapParams().apply { preferredConfig = Bitmap.Config.RGB_565 }
      var outIndex = 0
      var i = first
      while (i <= last) {
        checkCancel()
        val count = min(CHUNK, last - i + 1)
        val frames = mmr.getFramesAtIndex(i, count, params)
        for (bmp in frames) {
          val prepared = Reverser.prepare(bmp, vw, vh, rot, outW, outH)
          // Maske: yeni olasılıklar önceki karenin maskesiyle karıştırılır
          val probs = Segmenter.personProbs(context, prepared)
          val m = mask
          if (m == null) mask = probs else for (j in probs.indices) m[j] = m[j] * (1f - SMOOTH) + probs[j] * SMOOTH
          prepared.getPixels(argb, 0, outW, 0, 0, outW, outH)
          if (prepared !== bmp) prepared.recycle()
          bmp.recycle()
          coverage += composite(argb, outW, outH, mask!!, grid)
          var inIdx: Int
          do {
            inIdx = enc.dequeueInputBuffer(10_000)
            if (inIdx < 0) drain(false)
          } while (inIdx < 0)
          val image = enc.getInputImage(inIdx) ?: throw IllegalStateException("CUTOUT_ENCODER")
          Reverser.writeYuv(argb, outW, outH, image)
          enc.queueInputBuffer(inIdx, 0, outW * outH * 3 / 2, (outIndex * frameUs).toLong(), 0)
          outIndex++
          drain(false)
        }
        i += count
        onProgress(outIndex.toDouble() / n)
      }
      var inIdx: Int
      do {
        inIdx = enc.dequeueInputBuffer(10_000)
        if (inIdx < 0) drain(false)
      } while (inIdx < 0)
      enc.queueInputBuffer(inIdx, 0, 0, (outIndex * frameUs).toLong(), MediaCodec.BUFFER_FLAG_END_OF_STREAM)
      drain(true)
      val cov = if (outIndex > 0) coverage / outIndex else 0.0
      Log.i(TAG, "cutout frames=$outIndex fps=$fps size=${outW}x$outH audio=$audioWritten coverage=${"%.3f".format(cov)}")
      return mapOf(
        "path" to "file://" + out.absolutePath,
        "durationMs" to (outIndex * frameUs / 1000.0).roundToInt(),
        "width" to outW,
        "height" to outH,
        "hasAudio" to audioWritten,
        "frames" to outIndex,
        "coverage" to cov,
      )
    } catch (e: Throwable) {
      out.delete()
      throw e
    } finally {
      try { encoder?.stop() } catch (e: Exception) {}
      encoder?.release()
      try { muxer?.stop() } catch (e: Exception) {}
      try { muxer?.release() } catch (e: Exception) {}
      mmr.release()
    }
  }

  /**
   * Kişi dışını anahtar yeşiline boyar: maske ızgarası çift doğrusal örneklenir, yumuşak eşikle
   * (LO..HI) alfa olur, renk yeşille karıştırılır. Dönüş: kişi alanı oranı.
   */
  internal fun composite(argb: IntArray, w: Int, h: Int, mask: FloatArray, grid: Int): Double {
    val kr = (KEY_RGB shr 16) and 0xFF
    val kg = (KEY_RGB shr 8) and 0xFF
    val kb = KEY_RGB and 0xFF
    var sum = 0.0
    val sx = (grid - 1).toFloat() / max(1, w - 1)
    val sy = (grid - 1).toFloat() / max(1, h - 1)
    for (y in 0 until h) {
      val gy = y * sy
      val y0 = gy.toInt().coerceIn(0, grid - 1)
      val y1 = min(grid - 1, y0 + 1)
      val fy = gy - y0
      for (x in 0 until w) {
        val gx = x * sx
        val x0 = gx.toInt().coerceIn(0, grid - 1)
        val x1 = min(grid - 1, x0 + 1)
        val fx = gx - x0
        val p = (mask[y0 * grid + x0] * (1 - fx) + mask[y0 * grid + x1] * fx) * (1 - fy) +
          (mask[y1 * grid + x0] * (1 - fx) + mask[y1 * grid + x1] * fx) * fy
        val t = ((p - LO) / (HI - LO)).coerceIn(0f, 1f)
        val a = t * t * (3 - 2 * t)
        sum += a
        val idx = y * w + x
        if (a >= 0.999f) continue
        val c = argb[idx]
        val r = ((c shr 16) and 0xFF) * a + kr * (1 - a)
        val g = ((c shr 8) and 0xFF) * a + kg * (1 - a)
        val b = (c and 0xFF) * a + kb * (1 - a)
        argb[idx] = (0xFF shl 24) or (r.roundToInt() shl 16) or (g.roundToInt() shl 8) or b.roundToInt()
      }
    }
    return sum / (w * h)
  }

  /** Aralığın ses örnekleri olduğu gibi (yeniden kodlamadan); zaman 0'dan başlar. Ses yoksa null. */
  private fun copyAudio(context: Context, uri: Uri, fromUs: Long, toUs: Long): Pair<MediaFormat, List<Triple<ByteArray, Long, Int>>>? {
    val ex = MediaExtractor()
    try {
      ex.setDataSource(context, uri, null)
      var track = -1
      for (t in 0 until ex.trackCount) {
        if (ex.getTrackFormat(t).getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true) {
          track = t
          break
        }
      }
      if (track < 0) return null
      val fmt = ex.getTrackFormat(track)
      ex.selectTrack(track)
      ex.seekTo(fromUs, MediaExtractor.SEEK_TO_PREVIOUS_SYNC)
      val maxSize = if (fmt.containsKey(MediaFormat.KEY_MAX_INPUT_SIZE)) fmt.getInteger(MediaFormat.KEY_MAX_INPUT_SIZE) else 256 * 1024
      val buf = ByteBuffer.allocateDirect(maxSize)
      val samples = mutableListOf<Triple<ByteArray, Long, Int>>()
      while (true) {
        checkCancel()
        buf.clear()
        val size = ex.readSampleData(buf, 0)
        if (size < 0) break
        val pts = ex.sampleTime
        if (pts > toUs) break
        if (pts >= fromUs) {
          val data = ByteArray(size)
          buf.position(0)
          buf.get(data, 0, size)
          val flags = if (ex.sampleFlags and MediaExtractor.SAMPLE_FLAG_SYNC != 0) MediaCodec.BUFFER_FLAG_KEY_FRAME else 0
          samples.add(Triple(data, pts - fromUs, flags))
        }
        ex.advance()
      }
      return if (samples.isEmpty()) null else fmt to samples
    } finally {
      ex.release()
    }
  }
}
