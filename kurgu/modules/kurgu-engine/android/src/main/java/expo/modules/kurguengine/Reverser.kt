package expo.modules.kurguengine

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Matrix
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
import java.nio.ByteOrder
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Ters oynatma: klibin kaynak aralığı sondan başa yeniden kodlanır (H.264 + AAC).
 * Görüntü: MediaMetadataRetriever.getFramesAtIndex ile sondan başa parça parça
 * (bellek sınırlı) okunur, YUV'ye çevrilip donanım kodlayıcısına verilir.
 * Ses: aralık PCM'e çözülür, örnek çerçeveleri ters çevrilir, AAC'ye kodlanır.
 * Android 9+ (API 28) gerekir. Cihaz içinde çalışır; ağ kullanmaz.
 */
object Reverser {
  private const val TAG = "KurguReverse"
  private const val CHUNK = 8 // aynı anda bellekte tutulan kare sayısı
  private const val MAX_FRAMES = 30 * 60 * 10 // 10 dk @30 fps üst sınırı
  @Volatile private var cancelled = false

  fun cancel() {
    cancelled = true
  }

  private fun checkCancel() {
    if (cancelled) throw IllegalStateException("CANCELLED")
  }

  private class Sample(val data: ByteArray, val ptsUs: Long, val flags: Int)

  fun reverse(context: Context, uriString: String, fromMs: Long, toMs: Long, outPath: String, maxSide: Int, onProgress: (Double) -> Unit): Map<String, Any> {
    if (Build.VERSION.SDK_INT < 28) throw IllegalStateException("REVERSE_UNSUPPORTED")
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
      if (durMs <= 0 || frameCount <= 0 || vw <= 0 || vh <= 0) throw IllegalStateException("REVERSE_NO_VIDEO")
      val fps = (frameCount * 1000.0 / durMs).coerceIn(1.0, 120.0)
      val first = floor(fromMs * fps / 1000.0).toInt().coerceIn(0, frameCount - 1)
      val last = (ceil(min(toMs, durMs) * fps / 1000.0).toInt() - 1).coerceIn(first, frameCount - 1)
      val n = last - first + 1
      if (n > MAX_FRAMES) throw IllegalStateException("REVERSE_TOO_LONG")

      // Çıktı boyutu: görüntülenen yönde, uzun kenar maxSide, çift sayılar
      val (dw, dh) = if (rot == 90 || rot == 270) vh to vw else vw to vh
      val k = min(1.0, maxSide.toDouble() / max(dw, dh))
      val outW = max(2, (dw * k / 2).roundToInt() * 2)
      val outH = max(2, (dh * k / 2).roundToInt() * 2)

      // 1) Ses: ters çevrilmiş AAC örnekleri ve biçimi (yoksa null)
      val audio = reverseAudio(context, uri, fromMs * 1000, min(toMs, durMs) * 1000) { p -> onProgress(p * 0.15) }
      checkCancel()

      // 2) Görüntü kodlayıcısı
      val fmt = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, outW, outH).apply {
        setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420Flexible)
        setInteger(MediaFormat.KEY_BIT_RATE, max(1_000_000, (outW * outH * fps * 0.12).toInt()))
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
      val info = MediaCodec.BufferInfo()
      val argb = IntArray(outW * outH)
      val frameUs = 1_000_000.0 / fps

      fun drain(endOfStream: Boolean) {
        while (true) {
          val idx = enc.dequeueOutputBuffer(info, if (endOfStream) 10_000 else 0)
          if (idx == MediaCodec.INFO_TRY_AGAIN_LATER) {
            if (!endOfStream) return
            continue
          }
          if (idx == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
            videoTrack = mux.addTrack(enc.outputFormat)
            val audioTrack = audio?.let { mux.addTrack(it.first) } ?: -1
            mux.start()
            started = true
            // Ses örnekleri bir kerede yazılır (MediaMuxer kendi içinde iç içe geçirir)
            if (audio != null) {
              val ai = MediaCodec.BufferInfo()
              for (s in audio.second) {
                ai.set(0, s.data.size, s.ptsUs, s.flags)
                mux.writeSampleData(audioTrack, ByteBuffer.wrap(s.data), ai)
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
      var i = last
      while (i >= first) {
        checkCancel()
        val start = max(first, i - CHUNK + 1)
        val frames = mmr.getFramesAtIndex(start, i - start + 1, params)
        for (f in frames.indices.reversed()) {
          val bmp = frames[f]
          val prepared = prepare(bmp, vw, vh, rot, outW, outH)
          prepared.getPixels(argb, 0, outW, 0, 0, outW, outH)
          if (prepared !== bmp) prepared.recycle()
          bmp.recycle()
          var inIdx: Int
          do {
            inIdx = enc.dequeueInputBuffer(10_000)
            if (inIdx < 0) drain(false)
          } while (inIdx < 0)
          val image = enc.getInputImage(inIdx) ?: throw IllegalStateException("REVERSE_ENCODER")
          writeYuv(argb, outW, outH, image)
          enc.queueInputBuffer(inIdx, 0, outW * outH * 3 / 2, (outIndex * frameUs).toLong(), 0)
          outIndex++
          drain(false)
        }
        i = start - 1
        onProgress(0.15 + 0.85 * (outIndex.toDouble() / n))
      }
      var inIdx: Int
      do {
        inIdx = enc.dequeueInputBuffer(10_000)
        if (inIdx < 0) drain(false)
      } while (inIdx < 0)
      enc.queueInputBuffer(inIdx, 0, 0, (outIndex * frameUs).toLong(), MediaCodec.BUFFER_FLAG_END_OF_STREAM)
      drain(true)
      val result = mapOf(
        "path" to "file://" + out.absolutePath,
        "durationMs" to (outIndex * frameUs / 1000.0).roundToInt(),
        "width" to outW,
        "height" to outH,
        "hasAudio" to (audio != null),
        "frames" to outIndex,
      )
      Log.i(TAG, "reversed frames=$outIndex fps=$fps size=${outW}x$outH audio=${audio != null}")
      return result
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

  /** Kareyi görüntülenen yöne çevirir (gerekirse) ve çıktı boyutuna ölçekler. */
  private fun prepare(bmp: Bitmap, vw: Int, vh: Int, rot: Int, outW: Int, outH: Int): Bitmap {
    var b = bmp
    // Bazı sürümler döndürmeyi uygulamaz: kare ham boyuttaysa burada döndürülür.
    if ((rot == 90 || rot == 270 || rot == 180) && b.width == vw && b.height == vh && (vw != vh || rot == 180)) {
      val m = Matrix().apply { postRotate(rot.toFloat()) }
      b = Bitmap.createBitmap(b, 0, 0, b.width, b.height, m, true)
    }
    if (b.width != outW || b.height != outH) {
      val s = Bitmap.createScaledBitmap(b, outW, outH, true)
      if (b !== bmp) b.recycle()
      b = s
    }
    return b
  }

  /** ARGB -> YUV 4:2:0 (BT.601 sınırlı aralık), kodlayıcının esnek düzlem düzenine yazılır. */
  private fun writeYuv(argb: IntArray, w: Int, h: Int, image: android.media.Image) {
    val yP = image.planes[0]
    val uP = image.planes[1]
    val vP = image.planes[2]
    val yb = yP.buffer
    val ub = uP.buffer
    val vb = vP.buffer
    for (y in 0 until h) {
      val row = y * w
      for (x in 0 until w) {
        val c = argb[row + x]
        val r = (c shr 16) and 0xFF
        val g = (c shr 8) and 0xFF
        val b = c and 0xFF
        val yy = ((66 * r + 129 * g + 25 * b + 128) shr 8) + 16
        yb.put(y * yP.rowStride + x * yP.pixelStride, yy.coerceIn(0, 255).toByte())
        if ((y and 1) == 0 && (x and 1) == 0) {
          val u = ((-38 * r - 74 * g + 112 * b + 128) shr 8) + 128
          val v = ((112 * r - 94 * g - 18 * b + 128) shr 8) + 128
          val ci = (y / 2) * uP.rowStride + (x / 2) * uP.pixelStride
          val cv = (y / 2) * vP.rowStride + (x / 2) * vP.pixelStride
          ub.put(ci, u.coerceIn(0, 255).toByte())
          vb.put(cv, v.coerceIn(0, 255).toByte())
        }
      }
    }
  }

  /**
   * Aralığın sesini çözer, örnek çerçevelerini ters çevirir ve AAC'ye kodlar.
   * Ses izi yoksa null. Dönüş: (çıktı biçimi, kodlanmış örnekler).
   */
  private fun reverseAudio(context: Context, uri: Uri, fromUs: Long, toUs: Long, onProgress: (Double) -> Unit): Pair<MediaFormat, List<Sample>>? {
    val ex = MediaExtractor()
    var dec: MediaCodec? = null
    var enc: MediaCodec? = null
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
      val inFmt = ex.getTrackFormat(track)
      ex.selectTrack(track)
      ex.seekTo(fromUs, MediaExtractor.SEEK_TO_PREVIOUS_SYNC)
      val d = MediaCodec.createDecoderByType(inFmt.getString(MediaFormat.KEY_MIME)!!)
      dec = d
      d.configure(inFmt, null, null, 0)
      d.start()
      var rate = inFmt.getInteger(MediaFormat.KEY_SAMPLE_RATE)
      var ch = inFmt.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
      val pcm = java.io.ByteArrayOutputStream()
      val info = MediaCodec.BufferInfo()
      var inDone = false
      var outDone = false
      while (!outDone) {
        checkCancel()
        if (!inDone) {
          val i = d.dequeueInputBuffer(10_000)
          if (i >= 0) {
            val size = ex.readSampleData(d.getInputBuffer(i)!!, 0)
            if (size < 0 || ex.sampleTime > toUs + 100_000) {
              d.queueInputBuffer(i, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
              inDone = true
            } else {
              d.queueInputBuffer(i, 0, size, ex.sampleTime, 0)
              ex.advance()
            }
          }
        }
        val o = d.dequeueOutputBuffer(info, 10_000)
        if (o == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
          rate = d.outputFormat.getInteger(MediaFormat.KEY_SAMPLE_RATE)
          ch = d.outputFormat.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
        } else if (o >= 0) {
          val buf = d.getOutputBuffer(o)!!
          if (info.size > 0) {
            // Aralık dışındaki örnekler kırpılır (kare hassasiyetinde)
            val frameBytes = 2 * ch
            val frames = info.size / frameBytes
            val bufStartUs = info.presentationTimeUs
            var a = 0
            var b = frames
            if (bufStartUs < fromUs) a = min(frames, ((fromUs - bufStartUs) * rate / 1_000_000L).toInt())
            val endUs = bufStartUs + frames * 1_000_000L / rate
            if (endUs > toUs) b = max(a, frames - ((endUs - toUs) * rate / 1_000_000L).toInt())
            if (b > a) {
              val bytes = ByteArray((b - a) * frameBytes)
              buf.position(info.offset + a * frameBytes)
              buf.get(bytes)
              pcm.write(bytes)
            }
          }
          d.releaseOutputBuffer(o, false)
          if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) outDone = true
        }
      }
      onProgress(0.5)
      // Çerçeve sırasını ters çevir (kanallar çerçeve içinde aynı kalır)
      val src = pcm.toByteArray()
      val frameBytes = 2 * ch
      val nFrames = src.size / frameBytes
      if (nFrames == 0) return null
      val rev = ByteArray(nFrames * frameBytes)
      for (f in 0 until nFrames) System.arraycopy(src, f * frameBytes, rev, (nFrames - 1 - f) * frameBytes, frameBytes)

      val outFmt = MediaFormat.createAudioFormat(MediaFormat.MIMETYPE_AUDIO_AAC, rate, ch).apply {
        setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC)
        setInteger(MediaFormat.KEY_BIT_RATE, 128_000)
        setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, 16_384)
      }
      val e = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_AUDIO_AAC)
      enc = e
      e.configure(outFmt, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
      e.start()
      val samples = ArrayList<Sample>()
      var format: MediaFormat? = null
      var pos = 0
      var inEos = false
      var outEos = false
      while (!outEos) {
        checkCancel()
        if (!inEos) {
          val i = e.dequeueInputBuffer(10_000)
          if (i >= 0) {
            val ib = e.getInputBuffer(i)!!
            ib.clear()
            val n = min(ib.capacity() / frameBytes * frameBytes, rev.size - pos)
            val pts = (pos / frameBytes).toLong() * 1_000_000L / rate
            if (n <= 0) {
              e.queueInputBuffer(i, 0, 0, pts, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
              inEos = true
            } else {
              ib.order(ByteOrder.nativeOrder())
              ib.put(rev, pos, n)
              e.queueInputBuffer(i, 0, n, pts, 0)
              pos += n
            }
          }
        }
        val o = e.dequeueOutputBuffer(info, 10_000)
        if (o == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
          format = e.outputFormat
        } else if (o >= 0) {
          val ob = e.getOutputBuffer(o)!!
          if (info.size > 0 && info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG == 0) {
            val data = ByteArray(info.size)
            ob.position(info.offset)
            ob.get(data)
            samples.add(Sample(data, info.presentationTimeUs, info.flags and MediaCodec.BUFFER_FLAG_KEY_FRAME))
          }
          e.releaseOutputBuffer(o, false)
          if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) outEos = true
        }
      }
      onProgress(1.0)
      return format?.let { it to samples }
    } finally {
      try { dec?.stop() } catch (e: Exception) {}
      dec?.release()
      try { enc?.stop() } catch (e: Exception) {}
      enc?.release()
      ex.release()
    }
  }
}
