package expo.modules.kurguengine

import android.content.ContentValues
import android.content.Context
import android.media.MediaMetadataRetriever
import android.media.MediaScannerConnection
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.util.Log
import androidx.annotation.OptIn
import androidx.media3.common.MimeTypes
import androidx.media3.common.util.UnstableApi
import androidx.media3.effect.DebugTraceUtil
import androidx.media3.transformer.AudioEncoderSettings
import androidx.media3.transformer.Composition
import androidx.media3.transformer.DefaultAssetLoaderFactory
import androidx.media3.transformer.DefaultDecoderFactory
import androidx.media3.transformer.DefaultEncoderFactory
import androidx.media3.common.util.Clock
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.ProgressHolder
import androidx.media3.transformer.Transformer
import androidx.media3.transformer.VideoEncoderSettings
import java.io.File
import java.io.FileInputStream

data class ExportOptions(
  val width: Int,
  val height: Int,
  val fps: Int,
  val videoBitrate: Int,
  val audioBitrate: Int,
  val codec: String,
)

/**
 * Tek seferde bir dışa aktarma işi. Transformer ana iş parçacığında yaratılır ve
 * yönetilir; ağır iş Media3'ün kendi iş parçacıklarında yapılır.
 */
@OptIn(UnstableApi::class)
class Exporter(
  private val context: Context,
  private val onProgress: (Int) -> Unit,
) {
  private val main = Handler(Looper.getMainLooper())
  private var transformer: Transformer? = null
  private var outFile: File? = null
  private val holder = ProgressHolder()
  private var lastProgress = -1
  private var failCallback: ((String, String) -> Unit)? = null

  val isRunning: Boolean
    get() = transformer != null

  fun start(
    spec: RenderSpec,
    options: ExportOptions,
    outPath: String,
    onDone: (Map<String, Any?>) -> Unit,
    onFail: (String, String) -> Unit,
  ) {
    check(transformer == null) { "EXPORT_BUSY" }
    KurguPreviewView.suspendAll()
    val file = File(outPath.removePrefix("file://"))
    file.parentFile?.mkdirs()
    if (file.exists()) file.delete()
    outFile = file
    failCallback = onFail

    val composition: Composition = CompositionFactory.build(
      spec, options.width, options.height, forExport = true,
      padUri = if (CompositionFactory.needsCompositor(spec)) TransparentPad.uri(context) else null,
    )
    // Teşhis: dizi yapısı (iz türleri, öğe türleri, süreler, hızlar) — takılmalar CI günlüğünden çözülebilsin
    try {
      Log.i("KurguExport", "export start ${options.width}x${options.height}@${options.fps} totalMs=${spec.totalMs} layers=${spec.layers.size} audioLanes=${spec.audioLanes.size}")
      CompositionFactory.describe(composition).forEach { Log.i("KurguExport", it) }
    } catch (e: Exception) {
      Log.w("KurguExport", "describe failed: ${e.message}")
    }
    val videoMime = when (options.codec) {
      "hevc" -> MimeTypes.VIDEO_H265
      "av1" -> MimeTypes.VIDEO_AV1
      else -> MimeTypes.VIDEO_H264
    }
    val encoderFactory = DefaultEncoderFactory.Builder(context)
      .setRequestedVideoEncoderSettings(VideoEncoderSettings.Builder().setBitrate(options.videoBitrate).build())
      .setRequestedAudioEncoderSettings(AudioEncoderSettings.Builder().setBitrate(options.audioBitrate).build())
      .setEnableFallback(true)
      .build()

    val startedAt = System.currentTimeMillis()
    DebugTraceUtil.enableTracing = true
    val t = Transformer.Builder(context)
      .setVideoMimeType(videoMime)
      .setAudioMimeType(MimeTypes.AUDIO_AAC)
      .setEncoderFactory(encoderFactory)
      // Geçiş şeritlerinde aynı anda birden çok video çözücü açılır; donanım çözücüsünün
      // örnek sınırı aşılırsa (CI emülatörü: DECODER_INIT_FAILED) yazılım çözücüye geçilir.
      .setAssetLoaderFactory(
        DefaultAssetLoaderFactory(
          context,
          DefaultDecoderFactory.Builder(context).setEnableDecoderFallback(true).build(),
          Clock.DEFAULT,
          null,
        ),
      )
      // Yoğun efektli projelerde yavaş cihazlarda görüntü, sesin gerisinde kalabilir;
      // varsayılan 10 sn bekleme sınırı dışa aktarmayı gereksiz yere iptal ediyordu.
      // Gerçekten takılan bir işin yine de bitmesi için sınır 5 dakikadır: yazılımsal kod
      // çözmeli emülatörde ikinci ana klibe geçişte %70→%75 arası 3 dk 14 sn sürdü (CI #74),
      // 2 dakikalık sınır aynı yerde MUXING_TIMEOUT verdi (CI #72).
      .setMaxDelayBetweenMuxerSamplesMs(300_000L)
      .addListener(object : Transformer.Listener {
        override fun onCompleted(composition: Composition, exportResult: ExportResult) {
          finish()
          settle()
          onProgress(100)
          onDone(verify(file, System.currentTimeMillis() - startedAt, exportResult))
        }

        override fun onError(composition: Composition, exportResult: ExportResult, exportException: ExportException) {
          finish()
          settle()
          file.delete()
          // Teşhis: Media3'ün iç izleme özeti (hangi aşamanın durduğunu gösterir)
          Log.e("KurguExport", "export failed ${exportException.errorCodeName}: ${exportException.cause?.message ?: exportException.message}".take(4000))
          // Neden zinciri (ör. kodlayıcı yapılandırma hatasının asıl istisnası) ve en derin nedenin ilk kareleri
          var c: Throwable? = exportException.cause
          var depth = 0
          var deepest: Throwable? = null
          while (c != null && depth < 6) {
            Log.e("KurguExport", "cause[$depth] ${c.javaClass.name}: ${c.message?.substringBefore("DebugTrace")?.take(600)}")
            deepest = c
            c = c.cause
            depth++
          }
          deepest?.stackTrace?.take(8)?.forEach { Log.e("KurguExport", "  at $it") }
          // Media3 izleme özeti (hangi bileşenin en son ne zaman kare ürettiği): logcat satır
          // sınırına takılmasın diye parçalı yazılır (CI #79: %70'te 5 dk takılma teşhisi)
          (exportException.cause?.message ?: "").substringAfter("DebugTrace: ", "").chunked(3000).forEachIndexed { i, part ->
            Log.e("KurguExport", "trace[$i] $part")
          }
          onFail("EXPORT_FAILED", "${exportException.errorCodeName}: ${exportException.message ?: ""}")
        }
      })
      .build()
    transformer = t
    lastProgress = -1
    lastChangeAt = System.currentTimeMillis()
    stallDumps = 0
    t.start(composition, file.absolutePath)
    main.post(progressTick)
  }

  fun cancel(): Boolean {
    val t = transformer ?: return false
    t.cancel()
    finish()
    outFile?.delete()
    val cb = failCallback
    failCallback = null
    cb?.invoke("CANCELLED", "Export cancelled")
    return true
  }

  private fun finish() {
    main.removeCallbacks(progressTick)
    KurguPreviewView.resumeAll()
    transformer = null
  }

  private fun settle() {
    failCallback = null
  }

  private var lastChangeAt = 0L
  private var stallDumps = 0

  private val progressTick = object : Runnable {
    override fun run() {
      val t = transformer ?: return
      val now = System.currentTimeMillis()
      if (t.getProgress(holder) == Transformer.PROGRESS_STATE_AVAILABLE && holder.progress != lastProgress) {
        lastProgress = holder.progress
        lastChangeAt = now
        if (holder.progress % 5 == 0) Log.i("KurguExport", "progress ${holder.progress}%")
        onProgress(holder.progress)
      } else if (now - lastChangeAt > 30_000 && stallDumps < 3) {
        // Takılma teşhisi: ilerleme 30 sn değişmediyse Media3 izleme özeti (bileşen başına son
        // olaylar ve zamanları) parçalı yazılır; en çok 3 kez (CI #72/#74/#79: %70'te yavaşlama)
        stallDumps++
        lastChangeAt = now
        Log.w("KurguExport", "stall #$stallDumps at $lastProgress%")
        DebugTraceUtil.generateTraceSummary().chunked(3000).forEachIndexed { i, part -> Log.w("KurguExport", "stall$stallDumps[$i] $part") }
      }
      main.postDelayed(this, 250)
    }
  }

  /** Çıktı dosyasını yeniden açıp gerçekten oynatılabilir olduğunu doğrular. */
  private fun verify(file: File, elapsedMs: Long, result: ExportResult): Map<String, Any?> {
    val r = MediaMetadataRetriever()
    try {
      r.setDataSource(file.absolutePath)
      val rot = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)?.toIntOrNull() ?: 0
      var w = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toIntOrNull() ?: 0
      var h = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)?.toIntOrNull() ?: 0
      if (rot == 90 || rot == 270) { val x = w; w = h; h = x }
      return mapOf(
        "uri" to "file://" + file.absolutePath,
        "size" to file.length(),
        "durationMs" to (r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0L),
        "width" to w,
        "height" to h,
        "hasAudio" to (r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_HAS_AUDIO) == "yes"),
        "hasVideo" to (r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_HAS_VIDEO) == "yes"),
        "videoEncoder" to result.videoEncoderName,
        "audioEncoder" to result.audioEncoderName,
        "elapsedMs" to elapsedMs,
      )
    } finally {
      r.release()
    }
  }

  companion object {
    /** Dosyayı galeriye (Movies/Kurgu) kopyalar. Android 10+ izinsiz çalışır. */
    fun saveToGallery(context: Context, path: String, displayName: String): String {
      val src = File(path.removePrefix("file://"))
      require(src.exists()) { "FILE_NOT_FOUND" }
      if (Build.VERSION.SDK_INT >= 29) {
        val values = ContentValues().apply {
          put(MediaStore.Video.Media.DISPLAY_NAME, displayName)
          put(MediaStore.Video.Media.MIME_TYPE, "video/mp4")
          put(MediaStore.Video.Media.RELATIVE_PATH, Environment.DIRECTORY_MOVIES + "/Kurgu")
          put(MediaStore.Video.Media.IS_PENDING, 1)
        }
        val resolver = context.contentResolver
        val uri = resolver.insert(MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY), values)
          ?: throw IllegalStateException("MEDIASTORE_INSERT_FAILED")
        try {
          resolver.openOutputStream(uri)?.use { out -> FileInputStream(src).use { it.copyTo(out) } }
            ?: throw IllegalStateException("MEDIASTORE_WRITE_FAILED")
          values.clear()
          values.put(MediaStore.Video.Media.IS_PENDING, 0)
          resolver.update(uri, values, null, null)
        } catch (e: Exception) {
          resolver.delete(uri, null, null)
          throw e
        }
        return uri.toString()
      }
      @Suppress("DEPRECATION")
      val dir = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MOVIES), "Kurgu").apply { mkdirs() }
      val dest = File(dir, displayName)
      src.copyTo(dest, overwrite = true)
      MediaScannerConnection.scanFile(context, arrayOf(dest.absolutePath), arrayOf("video/mp4"), null)
      return Uri.fromFile(dest).toString()
    }
  }
}
