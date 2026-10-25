package expo.modules.kurguengine

import android.Manifest
import android.content.Context
import android.os.Build
import android.os.PowerManager
import android.view.WindowManager
import expo.modules.interfaces.permissions.Permissions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class KurguEngineModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private var exporter: Exporter? = null

  override fun definition() = ModuleDefinition {
    Name("KurguEngine")

    Events("onExportProgress", "onAiProgress")

    AsyncFunction("probe") { uri: String ->
      MediaTools.probe(context, uri)
    }

    AsyncFunction("thumbnails") { uri: String, timesMs: List<Double>, heightPx: Int, outDir: String, isImage: Boolean ->
      MediaTools.thumbnails(context, uri, timesMs, heightPx, outDir, isImage)
    }

    AsyncFunction("keyColor") { uri: String, timeMs: Double, isImage: Boolean ->
      MediaTools.keyColor(context, uri, timeMs, isImage)
    }

    AsyncFunction("waveform") { uri: String, peaksPerSecond: Int, maxPeaks: Int ->
      MediaTools.waveform(context, uri, peaksPerSecond, maxPeaks)
    }

    AsyncFunction("sceneScores") { uri: String, fromMs: Double, toMs: Double, samplesPerSecond: Int ->
      SceneDetector.scores(context, uri, fromMs.toLong(), toMs.toLong(), samplesPerSecond)
    }

    // Hareket takibi: görünen karede kutu [cx, cy, w, h] (0..1) -> kaynak ms başına merkez
    AsyncFunction("trackMotion") { uri: String, fromMs: Double, toMs: Double, box: List<Double>, samplesPerSecond: Int, promise: Promise ->
      background("track", promise) {
        MotionTracker.track(context, uri, fromMs.toLong(), toMs.toLong(), box, samplesPerSecond) { p ->
          sendEvent("onAiProgress", mapOf("phase" to "track", "progress" to p))
        }
      }
    }

    AsyncFunction("synthesizeSpeech") { text: String, lang: String, outPath: String, rate: Double, pitch: Double, promise: Promise ->
      Speech.synthesize(context, text, lang, outPath.removePrefix("file://"), rate.toFloat(), pitch.toFloat(), promise)
    }

    // --- Otomatik altyazı (cihaz içi konuşma tanıma) ---
    AsyncFunction("captionModels") {
      mapOf("supported" to Captions.isAvailable(), "models" to Captions.models(context))
    }

    AsyncFunction("downloadCaptionModel") { id: String, promise: Promise ->
      background("download", promise) { Captions.download(context, id) { p -> sendEvent("onAiProgress", mapOf("phase" to "download", "progress" to p)) }; true }
    }

    AsyncFunction("deleteCaptionModel") { id: String ->
      Captions.deleteModel(context, id)
    }

    AsyncFunction("transcribe") { uri: String, fromMs: Double, toMs: Double, language: String, modelId: String, translate: Boolean, promise: Promise ->
      background("transcribe", promise) {
        sendEvent("onAiProgress", mapOf("phase" to "audio", "progress" to 0.0))
        Captions.transcribe(context, uri, fromMs.toLong(), toMs.toLong(), language, modelId, translate) { p ->
          sendEvent("onAiProgress", mapOf("phase" to "transcribe", "progress" to p))
        }
      }
    }

    // --- Fotoğraf düzenleyici ---
    AsyncFunction("renderPhoto") { specJson: String, outPath: String, maxSide: Int, format: String, quality: Int, promise: Promise ->
      background("photo", promise) { PhotoRenderer.render(context, specJson, outPath, maxSide, format, quality) }
    }

    AsyncFunction("segmentPerson") { uri: String, outPath: String, promise: Promise ->
      background("segment", promise) { Segmenter.segmentPerson(context, uri, outPath) }
    }

    AsyncFunction("eraseRect") { uri: String, x0: Double, y0: Double, x1: Double, y1: Double, outPath: String, promise: Promise ->
      background("erase", promise) { Segmenter.eraseRect(context, uri, x0, y0, x1, y1, outPath) }
    }

    AsyncFunction("imageStats") { uri: String, promise: Promise ->
      background("stats", promise) { PhotoRenderer.imageStats(context, uri) }
    }

    AsyncFunction("saveImageToGallery") { path: String, displayName: String ->
      PhotoRenderer.saveImageToGallery(context, path, displayName)
    }

    // --- Seslendirme kaydı ---
    AsyncFunction("requestMicPermission") { promise: Promise ->
      Permissions.askForPermissionsWithPermissionsManager(appContext.permissions, promise, Manifest.permission.RECORD_AUDIO)
    }

    AsyncFunction("startRecording") { outPath: String ->
      Recorder.start(context, outPath)
      true
    }

    AsyncFunction("recordingLevel") {
      Recorder.level()
    }

    AsyncFunction("stopRecording") {
      Recorder.stop()
    }

    AsyncFunction("cancelRecording") {
      Recorder.stopQuietly()
    }

    // Ters oynatma: kaynak aralığı sondan başa yeniden kodlanır
    AsyncFunction("reverseVideo") { uri: String, fromMs: Double, toMs: Double, outPath: String, maxSide: Int, promise: Promise ->
      background("reverse", promise) {
        Reverser.reverse(context, uri, fromMs.toLong(), toMs.toLong(), outPath, maxSide) { p ->
          sendEvent("onAiProgress", mapOf("phase" to "reverse", "progress" to p))
        }
      }
    }

    // Videoda arka plan kaldırma: kişi dışı anahtar yeşiline boyanmış yeni video (katmanda chroma key)
    AsyncFunction("cutoutVideo") { uri: String, fromMs: Double, toMs: Double, outPath: String, maxSide: Int, promise: Promise ->
      background("cutout", promise) {
        Cutout.run(context, uri, fromMs.toLong(), toMs.toLong(), outPath, maxSide) { p ->
          sendEvent("onAiProgress", mapOf("phase" to "cutout", "progress" to p))
        }
      }
    }

    AsyncFunction("cancelAi") {
      Cutout.cancel()
      Reverser.cancel()
      Captions.cancel()
      MotionTracker.cancel()
    }

    AsyncFunction("encoderCapabilities") {
      MediaTools.encoderCapabilities()
    }

    AsyncFunction("deviceStatus") {
      val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
      mapOf(
        "thermal" to (if (Build.VERSION.SDK_INT >= 29) pm.currentThermalStatus else -1),
        "powerSave" to pm.isPowerSaveMode,
        "sdk" to Build.VERSION.SDK_INT,
        "model" to Build.MODEL,
      )
    }

    AsyncFunction("exportVideo") { specJson: String, outPath: String, options: Map<String, Any?>, promise: Promise ->
      if (exporter?.isRunning == true) {
        promise.reject("EXPORT_BUSY", "An export is already running", null)
        return@AsyncFunction
      }
      val spec = try {
        RenderSpec.parse(specJson)
      } catch (e: Exception) {
        promise.reject("BAD_SPEC", e.message, e)
        return@AsyncFunction
      }
      val opts = ExportOptions(
        width = (options["width"] as? Number)?.toInt() ?: spec.width,
        height = (options["height"] as? Number)?.toInt() ?: spec.height,
        fps = (options["fps"] as? Number)?.toInt() ?: spec.fps,
        videoBitrate = (options["videoBitrate"] as? Number)?.toInt() ?: 10_000_000,
        audioBitrate = (options["audioBitrate"] as? Number)?.toInt() ?: 192_000,
        codec = options["codec"] as? String ?: "h264",
      )
      val ctx = context
      val title = options["notificationTitle"] as? String ?: "Kurgu"
      val text = options["notificationText"] as? String ?: ""
      val ex = Exporter(ctx) { p ->
        sendEvent("onExportProgress", mapOf("progress" to p))
        ExportService.update(ctx, title, text, p)
      }
      exporter = ex
      keepScreenOn(true)
      ExportService.start(ctx, title, text)
      try {
        ex.start(
          spec.copy(fps = opts.fps),
          opts,
          outPath,
          onDone = { result ->
            keepScreenOn(false)
            ExportService.stop(ctx)
            promise.resolve(result)
          },
          onFail = { code, message ->
            keepScreenOn(false)
            ExportService.stop(ctx)
            promise.reject(code, message, null)
          },
        )
      } catch (e: Exception) {
        keepScreenOn(false)
        ExportService.stop(ctx)
        exporter = null
        promise.reject("EXPORT_FAILED", e.message ?: e.javaClass.simpleName, e)
      }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("cancelExport") {
      val cancelled = exporter?.cancel() ?: false
      keepScreenOn(false)
      ExportService.stop(context)
      cancelled
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("saveToGallery") { path: String, displayName: String ->
      Exporter.saveToGallery(context, path, displayName)
    }

    View(KurguPreviewView::class) {
      Events("onPosition", "onPlaybackState", "onPreviewError")

      Prop("spec") { view: KurguPreviewView, spec: String? ->
        view.setSpec(spec)
      }

      Prop("live") { view: KurguPreviewView, live: String? ->
        view.setLive(live)
      }

      Prop("previewQuality") { view: KurguPreviewView, quality: String? ->
        view.setPreviewQuality(quality)
      }

      AsyncFunction("play") { view: KurguPreviewView ->
        view.play()
      }

      AsyncFunction("pause") { view: KurguPreviewView ->
        view.pause()
      }

      AsyncFunction("seekTo") { view: KurguPreviewView, ms: Double ->
        view.seekTo(ms)
      }

      AsyncFunction("setScrubbing") { view: KurguPreviewView, enabled: Boolean ->
        view.setScrubbing(enabled)
      }
    }
  }

  /** Uzun AI işlerini ayrı iş parçacığında çalıştırır; hata kodu istisna iletisinden gelir. */
  private fun background(name: String, promise: Promise, block: () -> Any?) {
    Thread({
      try {
        promise.resolve(block())
      } catch (e: Throwable) {
        val msg = e.message ?: ""
        val code = if (Regex("^[A-Z_]+$").matches(msg)) msg else "AI_FAILED"
        promise.reject(code, msg.ifEmpty { name }, e)
      }
    }, "kurgu-$name").start()
  }

  private fun keepScreenOn(on: Boolean) {
    val activity = appContext.currentActivity ?: return
    activity.runOnUiThread {
      if (on) {
        activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
      } else {
        activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
      }
    }
  }
}
