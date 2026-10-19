package expo.modules.kurguengine

import android.content.Context
import android.media.MediaRecorder
import android.os.Build
import android.os.SystemClock
import java.io.File

/**
 * Mikrofonla seslendirme kaydı (AAC/MPEG-4, 44,1 kHz, mono). Kayıt yalnızca
 * cihazda tutulur; izin istenmeden başlamaz (KurguEngineModule.requestMicPermission).
 */
object Recorder {
  private var recorder: MediaRecorder? = null
  private var file: File? = null
  private var startedAt = 0L

  fun start(context: Context, outPath: String) {
    stopQuietly()
    val f = File(outPath.removePrefix("file://"))
    f.parentFile?.mkdirs()
    val r = if (Build.VERSION.SDK_INT >= 31) MediaRecorder(context) else @Suppress("DEPRECATION") MediaRecorder()
    try {
      r.setAudioSource(MediaRecorder.AudioSource.MIC)
      r.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
      r.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
      r.setAudioSamplingRate(44_100)
      r.setAudioChannels(1)
      r.setAudioEncodingBitRate(128_000)
      r.setOutputFile(f.absolutePath)
      r.prepare()
      r.start()
    } catch (e: Exception) {
      r.release()
      throw IllegalStateException("RECORD_FAILED")
    }
    recorder = r
    file = f
    startedAt = SystemClock.elapsedRealtime()
  }

  /** Anlık seviye 0..1 (görsel ölçer için). */
  fun level(): Double = try {
    (recorder?.maxAmplitude ?: 0) / 32767.0
  } catch (e: Exception) {
    0.0
  }

  fun stop(): Map<String, Any> {
    val r = recorder ?: throw IllegalStateException("NOT_RECORDING")
    val f = file!!
    val ms = SystemClock.elapsedRealtime() - startedAt
    recorder = null
    file = null
    try {
      r.stop()
    } catch (e: RuntimeException) {
      // Çok kısa kayıtta stop() istisna atar: dosya geçersizdir
      r.release()
      f.delete()
      throw IllegalStateException("RECORD_TOO_SHORT")
    }
    r.release()
    return mapOf("path" to "file://" + f.absolutePath, "durationMs" to ms)
  }

  fun stopQuietly() {
    val r = recorder ?: return
    recorder = null
    try { r.stop() } catch (e: Exception) {}
    r.release()
    file?.delete()
    file = null
  }
}
