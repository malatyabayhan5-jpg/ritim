package expo.modules.kurguengine

import android.content.Context
import android.media.AudioFormat
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.net.Uri
import android.os.Build
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.nio.ByteOrder
import java.security.MessageDigest
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin

/**
 * Otomatik altyazı: konuşma tanıma modeli (whisper.cpp, MIT) cihazda çalışır.
 * Ses cihaz dışına gönderilmez. Model yalnızca kullanıcı onayıyla bir kez indirilir
 * ve SHA-256 özetiyle doğrulanır; özet tutmazsa dosya silinir.
 */
// SHA-256 ve boyutlar, 2026-10-18'de CI'da indirilen dosyalardan alınmıştır (ggml-base-q5_1.bin, ggml-small-q5_1.bin).
private const val BASE_SHA256 = "422f1ae452ade6f30a004d7e5c6a43195e4433bc370bf23fac9cc591f01a8898"
private const val BASE_SIZE = 59_707_625L
private const val SMALL_SHA256 = "ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb"
private const val SMALL_SIZE = 190_085_487L

object Captions {
  data class Model(val id: String, val file: String, val url: String, val sha256: String, val sizeBytes: Long)

  // Kaynak: huggingface.co/ggerganov/whisper.cpp (MIT). Özetler CI'da indirilen dosyadan alındı.
  val MODELS = listOf(
    Model("base", "ggml-base-q5_1.bin", "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base-q5_1.bin", BASE_SHA256, BASE_SIZE),
    Model("small", "ggml-small-q5_1.bin", "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small-q5_1.bin", SMALL_SHA256, SMALL_SIZE),
  )

  private val cancelled = AtomicBoolean(false)

  private fun dir(context: Context) = File(context.filesDir, "kurgu_models").apply { mkdirs() }
  fun modelFile(context: Context, m: Model) = File(dir(context), m.file)

  fun models(context: Context): List<Map<String, Any>> = MODELS.map {
    mapOf("id" to it.id, "sizeBytes" to it.sizeBytes, "downloaded" to modelFile(context, it).isFile)
  }

  fun isAvailable() = WhisperNative.isAvailable()

  fun cancel() {
    cancelled.set(true)
    WhisperNative.cancel()
  }

  fun deleteModel(context: Context, id: String): Boolean = MODELS.find { it.id == id }?.let { modelFile(context, it).delete() } ?: false

  /** Modeli indirir ve doğrular. onProgress(0..1). */
  fun download(context: Context, id: String, onProgress: (Double) -> Unit) {
    val m = MODELS.find { it.id == id } ?: throw IllegalArgumentException("MODEL_UNKNOWN")
    val target = modelFile(context, m)
    if (target.isFile) return
    cancelled.set(false)
    val part = File(target.path + ".part")
    part.delete()
    var url = URL(m.url)
    var conn = url.openConnection() as HttpURLConnection
    var redirects = 0
    while (true) {
      conn.instanceFollowRedirects = false
      conn.connectTimeout = 20_000
      conn.readTimeout = 30_000
      val code = conn.responseCode
      if (code !in 300..399) {
        if (code != 200) throw IllegalStateException("MODEL_DOWNLOAD")
        break
      }
      val loc = conn.getHeaderField("Location")
      conn.disconnect()
      if (loc == null || ++redirects > 5) throw IllegalStateException("MODEL_DOWNLOAD")
      url = URL(url, loc)
      if (url.protocol != "https") throw IllegalStateException("MODEL_DOWNLOAD")
      conn = url.openConnection() as HttpURLConnection
    }
    val digest = MessageDigest.getInstance("SHA-256")
    val total = if (conn.contentLengthLong > 0) conn.contentLengthLong else m.sizeBytes
    var done = 0L
    var lastReport = 0L
    try {
      conn.inputStream.use { input ->
        FileOutputStream(part).use { out ->
          val buf = ByteArray(256 * 1024)
          while (true) {
            if (cancelled.get()) throw IllegalStateException("CANCELLED")
            val n = input.read(buf)
            if (n < 0) break
            out.write(buf, 0, n)
            digest.update(buf, 0, n)
            done += n
            if (done - lastReport > 1_000_000) {
              lastReport = done
              onProgress(min(1.0, done.toDouble() / total))
            }
          }
        }
      }
    } catch (e: Exception) {
      part.delete()
      throw if (e.message == "CANCELLED") e else IllegalStateException("MODEL_DOWNLOAD", e)
    } finally {
      conn.disconnect()
    }
    val hash = digest.digest().joinToString("") { "%02x".format(it) }
    if (!hash.equals(m.sha256, ignoreCase = true)) {
      part.delete()
      throw IllegalStateException("MODEL_CHECKSUM")
    }
    if (!part.renameTo(target)) throw IllegalStateException("MODEL_DOWNLOAD")
    onProgress(1.0)
  }

  /**
   * Kaynağın [fromMs, toMs) aralığını tanır. Dönen JSON: {lang, segments:[{t0,t1,text}]}
   * (zamanlar aralık başına göre ms). onProgress(0..1).
   */
  fun transcribe(context: Context, uri: String, fromMs: Long, toMs: Long, language: String, modelId: String, onProgress: (Double) -> Unit): String {
    if (!WhisperNative.isAvailable()) throw IllegalStateException("CAPTIONS_UNSUPPORTED")
    val m = MODELS.find { it.id == modelId } ?: throw IllegalArgumentException("MODEL_UNKNOWN")
    val file = modelFile(context, m)
    if (!file.isFile) throw IllegalStateException("MODEL_MISSING")
    cancelled.set(false)
    val pcm = decodeMono16k(context, uri, fromMs, toMs)
    if (cancelled.get()) throw IllegalStateException("CANCELLED")
    if (pcm.size < 16_000 / 2) return "{\"lang\":\"\",\"segments\":[]}"
    val poller = Thread {
      try {
        while (true) {
          Thread.sleep(400)
          onProgress(WhisperNative.currentProgress() / 100.0)
        }
      } catch (e: InterruptedException) {
      }
    }
    poller.start()
    try {
      return WhisperNative.transcribeJson(file.path, pcm, language, 0)
        ?: throw IllegalStateException(if (cancelled.get()) "CANCELLED" else "CAPTIONS_FAILED")
    } finally {
      poller.interrupt()
    }
  }

  /** Sesi çözer, kanalları karıştırır ve pencereli sinc ile 16 kHz'e indirir. */
  fun decodeMono16k(context: Context, uri: String, fromMs: Long, toMs: Long): FloatArray {
    val ex = MediaExtractor()
    var codec: MediaCodec? = null
    try {
      ex.setDataSource(context, Uri.parse(uri), null)
      var track = -1
      var format: MediaFormat? = null
      for (i in 0 until ex.trackCount) {
        val f = ex.getTrackFormat(i)
        if (f.getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true) { track = i; format = f; break }
      }
      if (track < 0 || format == null) throw IllegalStateException("NO_AUDIO")
      ex.selectTrack(track)
      ex.seekTo(fromMs * 1000, MediaExtractor.SEEK_TO_PREVIOUS_SYNC)
      codec = MediaCodec.createDecoderByType(format.getString(MediaFormat.KEY_MIME)!!)
      codec.configure(format, null, null, 0)
      codec.start()
      var rate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE)
      var channels = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
      var isFloat = false
      val endUs = if (toMs > fromMs) toMs * 1000 else Long.MAX_VALUE
      val maxSeconds = 60 * 60
      var mono = FloatArray(rate * 30)
      var n = 0
      val info = MediaCodec.BufferInfo()
      var inputDone = false
      var outputDone = false
      while (!outputDone) {
        if (cancelled.get()) throw IllegalStateException("CANCELLED")
        if (!inputDone) {
          val inIdx = codec.dequeueInputBuffer(10_000)
          if (inIdx >= 0) {
            val buf = codec.getInputBuffer(inIdx)!!
            val size = ex.readSampleData(buf, 0)
            if (size < 0 || ex.sampleTime > endUs) {
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
            rate = of.getInteger(MediaFormat.KEY_SAMPLE_RATE)
            channels = of.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
            isFloat = Build.VERSION.SDK_INT >= 24 && of.containsKey(MediaFormat.KEY_PCM_ENCODING) &&
              of.getInteger(MediaFormat.KEY_PCM_ENCODING) == AudioFormat.ENCODING_PCM_FLOAT
          }
          outIdx >= 0 -> {
            val out = codec.getOutputBuffer(outIdx)
            if (out != null && info.size > 0) {
              out.position(info.offset)
              out.limit(info.offset + info.size)
              out.order(ByteOrder.nativeOrder())
              val frames = info.size / ((if (isFloat) 4 else 2) * channels)
              // Aralık başındaki fazlalığı (anahtar kareden beri) atla
              val ptsUs = info.presentationTimeUs
              val skip = if (ptsUs < fromMs * 1000) min(frames.toLong(), (fromMs * 1000 - ptsUs) * rate / 1_000_000).toInt() else 0
              val keep = if (endUs != Long.MAX_VALUE) max(0, min(frames - skip, ((endUs - max(ptsUs, fromMs * 1000)) * rate / 1_000_000).toInt())) else frames - skip
              if (n + keep > mono.size) mono = mono.copyOf(max(mono.size * 2, n + keep))
              if (isFloat) {
                val fb = out.asFloatBuffer()
                for (f in 0 until frames) {
                  var s = 0f
                  for (c in 0 until channels) s += fb.get()
                  if (f >= skip && f < skip + keep) mono[n++] = s / channels
                }
              } else {
                val sb = out.asShortBuffer()
                for (f in 0 until frames) {
                  var s = 0f
                  for (c in 0 until channels) s += sb.get() / 32768f
                  if (f >= skip && f < skip + keep) mono[n++] = s / channels
                }
              }
              if (n > rate * maxSeconds) outputDone = true
            }
            codec.releaseOutputBuffer(outIdx, false)
            if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) outputDone = true
          }
        }
      }
      return resample(mono, n, rate, 16_000)
    } finally {
      try { codec?.stop() } catch (e: Exception) {}
      codec?.release()
      ex.release()
    }
  }

  /** Pencereli (Blackman) sinc ile yeniden örnekleme; alçak geçiren süzgeç kesimi hedef Nyquist'e göre. */
  fun resample(x: FloatArray, n: Int, from: Int, to: Int): FloatArray {
    if (from == to) return x.copyOf(n)
    val ratio = to.toDouble() / from
    val outN = floor(n * ratio).toInt()
    val out = FloatArray(outN)
    val cutoff = min(1.0, ratio) * 0.95
    val half = 16
    val support = half / cutoff
    for (i in 0 until outN) {
      val center = i / ratio
      val lo = max(0, (center - support).toInt())
      val hi = min(n - 1, (center + support).toInt() + 1)
      var acc = 0.0
      var wsum = 0.0
      for (j in lo..hi) {
        val t = (j - center) * cutoff
        val sinc = if (t == 0.0) 1.0 else sin(PI * t) / (PI * t)
        val wpos = (j - center) / support
        if (wpos <= -1.0 || wpos >= 1.0) continue
        val w = 0.42 + 0.5 * cos(PI * wpos) + 0.08 * cos(2 * PI * wpos)
        val k = sinc * w
        acc += x[j] * k
        wsum += k
      }
      out[i] = if (wsum != 0.0) (acc / wsum).toFloat() else 0f
    }
    return out
  }
}
