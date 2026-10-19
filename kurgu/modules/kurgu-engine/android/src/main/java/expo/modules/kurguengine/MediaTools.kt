package expo.modules.kurguengine

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.AudioFormat
import android.media.ExifInterface
import android.media.MediaCodec
import android.media.MediaCodecList
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Build
import java.io.File
import java.io.FileOutputStream
import java.nio.ByteOrder
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/** Medya bilgisi, küçük resim şeridi ve ses dalga biçimi. Hepsi arka plan iş parçacığında çalışır. */
object MediaTools {
  fun probe(context: Context, uriString: String): Map<String, Any?> {
    val uri = Uri.parse(uriString)
    val mime = context.contentResolver.getType(uri) ?: guessMime(uriString)
    if (mime?.startsWith("image/") == true || looksLikeImage(uriString)) return probeImage(context, uri, mime)

    val r = MediaMetadataRetriever()
    try {
      r.setDataSource(context, uri)
      val hasVideo = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_HAS_VIDEO) == "yes"
      val hasAudio = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_HAS_AUDIO) == "yes"
      val rotation = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)?.toIntOrNull() ?: 0
      var w = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toIntOrNull() ?: 0
      var h = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)?.toIntOrNull() ?: 0
      if (rotation == 90 || rotation == 270) { val t = w; w = h; h = t }
      val tracks = trackInfo(context, uri)
      return mapOf(
        "kind" to if (hasVideo) "video" else "audio",
        "durationMs" to (r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0L),
        "width" to w,
        "height" to h,
        "rotation" to rotation,
        "hasVideo" to hasVideo,
        "hasAudio" to hasAudio,
        "mimeType" to (r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_MIMETYPE) ?: mime),
        "bitrate" to (r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_BITRATE)?.toIntOrNull() ?: 0),
        "frameRate" to tracks["frameRate"],
        "videoCodec" to tracks["videoCodec"],
        "audioCodec" to tracks["audioCodec"],
        "videoDecodable" to tracks["videoDecodable"],
        "hdr" to tracks["hdr"],
      )
    } finally {
      r.release()
    }
  }

  private fun probeImage(context: Context, uri: Uri, mime: String?): Map<String, Any?> {
    val opts = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, opts) }
    var w = opts.outWidth
    var h = opts.outHeight
    if (w <= 0 || h <= 0) throw IllegalArgumentException("UNSUPPORTED_IMAGE")
    val orientation = try {
      context.contentResolver.openInputStream(uri)?.use {
        ExifInterface(it).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
      } ?: ExifInterface.ORIENTATION_NORMAL
    } catch (e: Exception) {
      ExifInterface.ORIENTATION_NORMAL
    }
    if (orientation == ExifInterface.ORIENTATION_ROTATE_90 || orientation == ExifInterface.ORIENTATION_ROTATE_270) {
      val t = w; w = h; h = t
    }
    return mapOf(
      "kind" to "image",
      "durationMs" to 0L,
      "width" to w,
      "height" to h,
      "rotation" to 0,
      "hasVideo" to true,
      "hasAudio" to false,
      "mimeType" to (opts.outMimeType ?: mime),
    )
  }

  private fun trackInfo(context: Context, uri: Uri): Map<String, Any?> {
    val ex = MediaExtractor()
    val out = mutableMapOf<String, Any?>()
    try {
      ex.setDataSource(context, uri, null)
      val codecs = MediaCodecList(MediaCodecList.REGULAR_CODECS)
      for (i in 0 until ex.trackCount) {
        val f = ex.getTrackFormat(i)
        val m = f.getString(MediaFormat.KEY_MIME) ?: continue
        if (m.startsWith("video/") && out["videoCodec"] == null) {
          out["videoCodec"] = m
          if (f.containsKey(MediaFormat.KEY_FRAME_RATE)) {
            out["frameRate"] = try { f.getInteger(MediaFormat.KEY_FRAME_RATE) } catch (e: Exception) { f.getFloat(MediaFormat.KEY_FRAME_RATE).roundToInt() }
          }
          // Döndürme anahtarı sorgulamayı bozabileceği için yalnızca codec + boyutla kontrol edilir.
          val q = MediaFormat.createVideoFormat(m, f.getInteger(MediaFormat.KEY_WIDTH), f.getInteger(MediaFormat.KEY_HEIGHT))
          out["videoDecodable"] = codecs.findDecoderForFormat(q) != null
          out["hdr"] = Build.VERSION.SDK_INT >= 24 && f.containsKey(MediaFormat.KEY_COLOR_TRANSFER) &&
            f.getInteger(MediaFormat.KEY_COLOR_TRANSFER).let { it == MediaFormat.COLOR_TRANSFER_ST2084 || it == MediaFormat.COLOR_TRANSFER_HLG }
        } else if (m.startsWith("audio/") && out["audioCodec"] == null) {
          out["audioCodec"] = m
        }
      }
    } catch (e: Exception) {
      // Bilgi alınamadıysa boş döner; içe aktarma yine de denenir.
    } finally {
      ex.release()
    }
    return out
  }

  /** Verilen zamanlarda kareleri JPEG olarak yazar; var olan dosyaları yeniden üretmez. */
  /** Chroma key anahtar rengi tahmini (vision/KeyColor). "#RRGGBB" veya bulunamazsa null. */
  fun keyColor(context: Context, uriString: String, timeMs: Double, isImage: Boolean): String? {
    val uri = Uri.parse(uriString)
    val bmp: Bitmap = if (isImage) {
      decodeScaledImage(context, uri, 360) ?: return null
    } else {
      val r = MediaMetadataRetriever()
      try {
        r.setDataSource(context, uri)
        val us = (timeMs * 1000).toLong()
        (if (Build.VERSION.SDK_INT >= 27) r.getScaledFrameAtTime(us, MediaMetadataRetriever.OPTION_CLOSEST_SYNC, 480, 480) else r.getFrameAtTime(us, MediaMetadataRetriever.OPTION_CLOSEST_SYNC))
          ?: return null
      } catch (e: Exception) {
        return null
      } finally {
        r.release()
      }
    }
    val small = if (bmp.width > 480 || bmp.height > 480) {
      val k = 480f / max(bmp.width, bmp.height)
      Bitmap.createScaledBitmap(bmp, max(1, (bmp.width * k).roundToInt()), max(1, (bmp.height * k).roundToInt()), true)
    } else bmp
    val px = IntArray(small.width * small.height)
    small.getPixels(px, 0, small.width, 0, 0, small.width, small.height)
    val c = expo.modules.kurguengine.vision.KeyColor.estimate(px, small.width, small.height)
    if (small !== bmp) small.recycle()
    bmp.recycle()
    return if (c < 0) null else String.format("#%06X", c and 0xFFFFFF)
  }

  fun thumbnails(context: Context, uriString: String, timesMs: List<Double>, heightPx: Int, outDir: String, isImage: Boolean): List<String?> {
    val dir = File(outDir.removePrefix("file://")).apply { mkdirs() }
    val uri = Uri.parse(uriString)
    val targetH = heightPx.coerceIn(32, 720)
    if (isImage) {
      val f = File(dir, "img_$targetH.jpg")
      if (!f.exists()) {
        val bmp = decodeScaledImage(context, uri, targetH) ?: return timesMs.map { null }
        writeJpeg(bmp, f)
        bmp.recycle()
      }
      return timesMs.map { "file://" + f.absolutePath }
    }
    val r = MediaMetadataRetriever()
    try {
      r.setDataSource(context, uri)
      val vw = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toIntOrNull() ?: 0
      val vh = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)?.toIntOrNull() ?: 0
      val rot = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)?.toIntOrNull() ?: 0
      val (dw, dh) = if (rot == 90 || rot == 270) vh to vw else vw to vh
      val targetW = if (dh > 0) max(16, (dw.toFloat() / dh * targetH).roundToInt()) else targetH
      return timesMs.map { t ->
        val f = File(dir, "t_${t.toLong()}_$targetH.jpg")
        if (f.exists()) return@map "file://" + f.absolutePath
        val us = (t * 1000).toLong()
        val bmp: Bitmap? = try {
          if (Build.VERSION.SDK_INT >= 27) {
            r.getScaledFrameAtTime(us, MediaMetadataRetriever.OPTION_CLOSEST_SYNC, targetW, targetH)
          } else {
            r.getFrameAtTime(us, MediaMetadataRetriever.OPTION_CLOSEST_SYNC)?.let { full ->
              Bitmap.createScaledBitmap(full, targetW, targetH, true).also { if (it != full) full.recycle() }
            }
          }
        } catch (e: Exception) {
          null
        }
        if (bmp == null) null else {
          writeJpeg(bmp, f)
          bmp.recycle()
          "file://" + f.absolutePath
        }
      }
    } finally {
      r.release()
    }
  }

  private fun decodeScaledImage(context: Context, uri: Uri, targetH: Int): Bitmap? {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
    if (bounds.outHeight <= 0) return null
    var sample = 1
    while (bounds.outHeight / (sample * 2) >= targetH) sample *= 2
    val opts = BitmapFactory.Options().apply { inSampleSize = sample }
    val bmp = context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, opts) } ?: return null
    val w = max(16, (bmp.width.toFloat() / bmp.height * targetH).roundToInt())
    val scaled = Bitmap.createScaledBitmap(bmp, w, targetH, true)
    if (scaled != bmp) bmp.recycle()
    return scaled
  }

  private fun writeJpeg(bmp: Bitmap, f: File) {
    val tmp = File(f.parentFile, f.name + ".tmp")
    FileOutputStream(tmp).use { bmp.compress(Bitmap.CompressFormat.JPEG, 80, it) }
    tmp.renameTo(f)
  }

  /**
   * Ses izini çözüp saniyede [peaksPerSecond] tepe değeri (0..1) döndürür.
   * Uzun dosyalarda bellek kullanımı sabittir: PCM tamponları akış halinde işlenir.
   */
  fun waveform(context: Context, uriString: String, peaksPerSecond: Int, maxPeaks: Int): List<Double> {
    val ex = MediaExtractor()
    var codec: MediaCodec? = null
    try {
      ex.setDataSource(context, Uri.parse(uriString), null)
      var track = -1
      var format: MediaFormat? = null
      for (i in 0 until ex.trackCount) {
        val f = ex.getTrackFormat(i)
        if (f.getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true) { track = i; format = f; break }
      }
      if (track < 0 || format == null) return emptyList()
      ex.selectTrack(track)
      val mime = format.getString(MediaFormat.KEY_MIME)!!
      val durationUs = if (format.containsKey(MediaFormat.KEY_DURATION)) format.getLong(MediaFormat.KEY_DURATION) else 0L
      var pps = peaksPerSecond.coerceIn(1, 200)
      if (durationUs > 0) {
        val total = durationUs / 1_000_000.0 * pps
        if (total > maxPeaks) pps = max(1, (maxPeaks / (durationUs / 1_000_000.0)).toInt())
      }
      codec = MediaCodec.createDecoderByType(mime)
      codec.configure(format, null, null, 0)
      codec.start()

      var sampleRate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE)
      var channels = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
      var isFloat = false
      var window = max(1, sampleRate * channels / pps)
      val peaks = ArrayList<Double>()
      var acc = 0f
      var count = 0
      val info = MediaCodec.BufferInfo()
      var inputDone = false
      var outputDone = false
      while (!outputDone) {
        if (!inputDone) {
          val inIdx = codec.dequeueInputBuffer(10_000)
          if (inIdx >= 0) {
            val buf = codec.getInputBuffer(inIdx)!!
            val size = ex.readSampleData(buf, 0)
            if (size < 0) {
              codec.queueInputBuffer(inIdx, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
              inputDone = true
            } else {
              codec.queueInputBuffer(inIdx, 0, size, ex.sampleTime, 0)
              ex.advance()
            }
          }
        }
        val outIdx = codec.dequeueOutputBuffer(info, 10_000)
        when {
          outIdx == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
            val of = codec.outputFormat
            sampleRate = of.getInteger(MediaFormat.KEY_SAMPLE_RATE)
            channels = of.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
            isFloat = Build.VERSION.SDK_INT >= 24 && of.containsKey(MediaFormat.KEY_PCM_ENCODING) &&
              of.getInteger(MediaFormat.KEY_PCM_ENCODING) == AudioFormat.ENCODING_PCM_FLOAT
            window = max(1, sampleRate * channels / pps)
          }
          outIdx >= 0 -> {
            val out = codec.getOutputBuffer(outIdx)
            if (out != null && info.size > 0) {
              out.position(info.offset)
              out.limit(info.offset + info.size)
              out.order(ByteOrder.nativeOrder())
              if (isFloat) {
                val fb = out.asFloatBuffer()
                while (fb.hasRemaining()) {
                  acc = max(acc, abs(fb.get()))
                  if (++count >= window) { peaks.add(min(1.0, acc.toDouble())); acc = 0f; count = 0 }
                }
              } else {
                val sb = out.asShortBuffer()
                while (sb.hasRemaining()) {
                  acc = max(acc, abs(sb.get().toFloat()) / 32768f)
                  if (++count >= window) { peaks.add(min(1.0, acc.toDouble())); acc = 0f; count = 0 }
                }
              }
            }
            codec.releaseOutputBuffer(outIdx, false)
            if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) outputDone = true
            if (peaks.size >= maxPeaks) outputDone = true
          }
        }
      }
      if (count > 0) peaks.add(min(1.0, acc.toDouble()))
      return peaks
    } finally {
      try { codec?.stop() } catch (e: Exception) {}
      codec?.release()
      ex.release()
    }
  }

  /** Cihazdaki donanım kodlayıcılarının desteklediği çözünürlük/kare hızı birleşimleri. */
  fun encoderCapabilities(): Map<String, Any?> {
    val list = MediaCodecList(MediaCodecList.REGULAR_CODECS)
    val result = mutableMapOf<String, Any?>()
    val mimes = mapOf("h264" to MediaFormat.MIMETYPE_VIDEO_AVC, "hevc" to MediaFormat.MIMETYPE_VIDEO_HEVC, "av1" to "video/av01")
    val sizes = listOf(720 to 1280, 1080 to 1920, 1440 to 2560, 2160 to 3840)
    val rates = listOf(24, 25, 30, 50, 60)
    for ((key, mime) in mimes) {
      val supported = mutableListOf<String>()
      var maxBitrate = 0
      var available = false
      for (info in list.codecInfos) {
        if (!info.isEncoder || info.supportedTypes.none { it.equals(mime, ignoreCase = true) }) continue
        available = true
        val caps = try { info.getCapabilitiesForType(mime).videoCapabilities } catch (e: Exception) { null } ?: continue
        maxBitrate = max(maxBitrate, caps.bitrateRange.upper)
        for ((short, long) in sizes) for (fps in rates) {
          val ok = try { caps.areSizeAndRateSupported(long, short, fps.toDouble()) } catch (e: Exception) { false }
          val tag = "${short}p$fps"
          if (ok && tag !in supported) supported.add(tag)
        }
      }
      result[key] = mapOf("available" to available, "modes" to supported, "maxBitrate" to maxBitrate)
    }
    return result
  }

  private fun guessMime(s: String): String? {
    val l = s.lowercase()
    return when {
      l.endsWith(".jpg") || l.endsWith(".jpeg") -> "image/jpeg"
      l.endsWith(".png") -> "image/png"
      l.endsWith(".webp") -> "image/webp"
      l.endsWith(".heic") || l.endsWith(".heif") -> "image/heif"
      l.endsWith(".gif") -> "image/gif"
      l.endsWith(".mp4") || l.endsWith(".m4v") -> "video/mp4"
      l.endsWith(".mov") -> "video/quicktime"
      l.endsWith(".webm") -> "video/webm"
      l.endsWith(".3gp") -> "video/3gpp"
      l.endsWith(".mkv") -> "video/x-matroska"
      l.endsWith(".mp3") -> "audio/mpeg"
      l.endsWith(".m4a") || l.endsWith(".aac") -> "audio/mp4"
      l.endsWith(".wav") -> "audio/wav"
      l.endsWith(".ogg") || l.endsWith(".opus") -> "audio/ogg"
      l.endsWith(".flac") -> "audio/flac"
      else -> null
    }
  }

  private fun looksLikeImage(s: String) = guessMime(s)?.startsWith("image/") == true
}
