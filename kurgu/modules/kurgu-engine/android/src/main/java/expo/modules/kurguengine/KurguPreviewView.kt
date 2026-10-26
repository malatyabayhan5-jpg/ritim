package expo.modules.kurguengine

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.view.SurfaceView
import androidx.annotation.OptIn
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.effect.MultipleInputVideoGraph
import androidx.media3.transformer.CompositionPlayer
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * Projeyi Media3 CompositionPlayer ile oynatan önizleme yüzeyi. Dışa aktarmayla
 * aynı Composition'ı kullanır; yalnızca çözünürlük düşüktür (önizleme kalitesi).
 */
@OptIn(UnstableApi::class)
class KurguPreviewView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  companion object {
    /** Önizleme yüzeyi tamponunun uzun kenarı (piksel); bkz. fixSurfaceSize. */
    private const val SURFACE_LONG_SIDE = 960
    private val views = java.util.Collections.newSetFromMap(java.util.WeakHashMap<KurguPreviewView, Boolean>())
    private val mainHandler = Handler(Looper.getMainLooper())

    /**
     * Dışa aktarma süresince önizleme oynatıcıları bırakılır: aynı anda açık video çözücü
     * sayısı sınırlıdır (emülatörde yazılımsal çözücüler; CI e2e: DECODER_INIT_FAILED).
     */
    fun suspendAll() = mainHandler.post { synchronized(views) { views.toList() }.forEach { it.releasePlayer() } }

    /** Dışa aktarma bitince önizlemeler aynı konumdan yeniden kurulur. */
    fun resumeAll() = mainHandler.post { synchronized(views) { views.toList() }.forEach { if (it.player == null) it.applyComposition() } }
  }

  private val onPosition by EventDispatcher()
  private val onPlaybackState by EventDispatcher()
  private val onPreviewError by EventDispatcher()

  override val shouldUseAndroidLayout: Boolean = true

  private val surfaceView = SurfaceView(context).apply {
    layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
  }
  private val main = Handler(Looper.getMainLooper())
  private var player: CompositionPlayer? = null
  private var spec: RenderSpec? = null
  private var specJson: String? = null
  private var builtSide = 0
  private var builtSpec: RenderSpec? = null
  private var pendingPositionMs = 0L
  private var lastReportedMs = -1L
  private var attached = false

  init {
    addView(surfaceView)
    PlaybackCrashGuard.install()
    synchronized(views) { views.add(this) }
    PlaybackCrashGuard.onRecover = { main.post { rebuildAt(player?.currentPosition ?: pendingPositionMs, playWhenReady = false) } }
  }

  fun setSpec(json: String?) {
    if (json == null || json == specJson) return
    specJson = json
    spec = try {
      RenderSpec.parse(json)
    } catch (e: Exception) {
      onPreviewError(mapOf("code" to "BAD_SPEC", "message" to (e.message ?: "")))
      null
    }
    spec?.let { LiveParams.seed(it) }
    LiveTexts.clear()
    // Yapı gecikmeli gelir (JS 180 ms): ondan sonra değişmemiş canlı değerler yeniden uygulanır,
    // yoksa tohumlama daha yeni kaydırıcı/metin değerlerinin üzerine eski değeri yazardı.
    lastLiveJson?.let { applyLive(it) }
    applyComposition()
  }

  private var lastLiveJson: String? = null

  /** Kaydırıcı değerleri: kompozisyonu yeniden kurmadan günceller, duraklatılmışsa kareyi yeniler. */
  fun setLive(json: String?) {
    if (json == null) return
    lastLiveJson = json
    if (applyLive(json)) requestRedraw()
  }

  private fun applyLive(json: String): Boolean {
    try {
      val o = org.json.JSONObject(json)
      val keys = o.keys()
      while (keys.hasNext()) {
        val k = keys.next()
        val arr = o.optJSONArray(k)
        if (arr != null) {
          LiveParams.put(k, FloatArray(arr.length()) { arr.optDouble(it, 0.0).toFloat() })
          continue
        }
        // Canlı metin tanımı (yazı, stil, süre, animasyon): LiveTextOverlay
        o.optJSONObject(k)?.let { LiveTexts.update(k, it) }
      }
    } catch (e: Exception) {
      return false
    }
    return true
  }

  private var lastRedraw = 0L
  private val redraw = Runnable {
    val p = player ?: return@Runnable
    lastRedraw = android.os.SystemClock.uptimeMillis()
    if (graphSpent && playerMulti) return@Runnable rebuildAt(p.currentPosition, playWhenReady = false)
    if (!p.isPlaying && p.playbackState != Player.STATE_IDLE) p.seekTo(p.currentPosition)
  }

  private fun requestRedraw() {
    main.removeCallbacks(redraw)
    val since = android.os.SystemClock.uptimeMillis() - lastRedraw
    main.postDelayed(redraw, if (since > 40) 0L else 40L - since)
  }

  private var quality = "auto"

  fun setPreviewQuality(q: String?) {
    quality = q ?: "auto"
    applyComposition()
  }

  /**
   * Önizleme çözünürlüğü (uzun kenar). "auto": ağır efekt ve katman sayısına göre
   * düşürülür; dışa aktarma kalitesi etkilenmez.
   */
  private fun previewSide(s: RenderSpec): Int = when (quality) {
    "low" -> 640
    "medium" -> 960
    "high" -> 1280
    else -> {
      val effects = s.main.sumOf { it.effects.size } + s.effectLayers.size
      val heavy = s.main.any { m -> m.effects.any { it.heavy } } || s.effectLayers.any { it.heavy }
      // Her katman şeridi (üst katman, geçiş) ayrı çözücü + tam kanvas geçişi demektir; orta
      // sınıf telefonda çok girişli önizleme çözünürlüğü düşürülür (dışa aktarma etkilenmez).
      val lanes = s.layers.size + s.blendLayers.size
      when {
        heavy || effects >= 4 || lanes >= 2 -> 640
        effects >= 1 || lanes >= 1 -> 800
        else -> 960
      }
    }
  }

  private var playerMulti = false

  /**
   * Çok girişli video grafiği bir kez sona ulaştıysa yeniden kullanılamaz: Media3 1.9.4
   * `MultipleInputVideoGraph.flush()` yalnızca ön işlemcileri sıfırlar; birleştiricinin
   * bitiş durumu ve son işlemcinin `inputStreamEnded` bayrağı kalır, başa sarıp yeniden
   * sona gelince `DefaultVideoFrameProcessor.signalEndOfInput` denetimi uygulamayı
   * çökertir (CI #42, 1. akış). Bu yüzden bitişten sonraki ilk arama/oynatmada oynatıcı
   * yeniden kurulur.
   */
  private var graphSpent = false

  /** Arka arkaya otomatik kurtarma sayısı (sonsuz döngüye karşı); yeni kompozisyonda sıfırlanır. */
  private var recoveries = 0

  /**
   * Grafik, oynatıcı STATE_ENDED bildirmeden önce (kaynaklar önden okunup bittiğinde) içeride
   * sona erebilir; o arada yapılan arama da ikinci bitişe yol açar (CI #52). Bu yüzden çok
   * girişli modda oynatma sona 1,5 sn'den fazla yaklaştıysa grafik harcanmış sayılır.
   */
  /**
   * Çok girişli modda saat dizisi zaman çizelgesinden uzundur (CompositionFactory.PREVIEW_TAIL_US):
   * oynatıcı sona hiç ulaşmaz, burada zaman çizelgesinin sonunda duraklatılır ve son kareye
   * konumlanır. Grafik bitişe girmediği için yeniden kurmaya gerek kalmaz.
   */
  private fun stopAtTimelineEnd() {
    val p = player ?: return
    val total = spec?.totalMs ?: return
    if (!playerMulti || !p.isPlaying) return
    if (p.currentPosition >= total - 35) {
      p.pause()
      p.seekTo(max(0L, total - 1))
      atTimelineEnd = true
      emitPosition(force = true)
      onPlaybackState(mapOf("isPlaying" to false, "ended" to true, "buffering" to false, "positionMs" to total))
    }
  }

  private var atTimelineEnd = false

  /**
   * SurfaceView tamponunun boyutu sabitlenir (kanvas oranı, uzun kenar [SURFACE_LONG_SIDE]).
   * Android 12+ SurfaceView'ın boyutu değişince arayüz, video üreticisi yeni boyutta bir kare
   * verene kadar bir sonraki kareyi çizmez; panel açılıp kapanınca önizleme alanı küçülüp
   * büyüdüğü için arayüz her seferinde video grafiğini bekliyordu (CI #133–#136: çok girişli
   * önizlemede 70–110 sn donma, ana iş parçacığı HardwareRenderer.nSyncAndDrawFrame içinde).
   * Sabit tamponda görünüm yalnızca ölçeklenir, yeni kare beklenmez. Önizleme çözünürlüğü
   * (previewSide) bundan bağımsızdır; Media3 son kareyi yüzey boyutuna ölçekler.
   */
  private var fixedW = 0
  private var fixedH = 0
  private fun fixSurfaceSize(s: RenderSpec) {
    val k = SURFACE_LONG_SIDE.toFloat() / max(1, max(s.width, s.height))
    val bw = max(2, (s.width * k).roundToInt() and 1.inv())
    val bh = max(2, (s.height * k).roundToInt() and 1.inv())
    if (bw == fixedW && bh == fixedH) return
    fixedW = bw
    fixedH = bh
    surfaceView.holder.setFixedSize(bw, bh)
  }

  /** Taze oynatıcıyla aynı kompozisyonu verilen konumdan kurar. */
  private fun rebuildAt(positionMs: Long, playWhenReady: Boolean) {
    releasePlayer()
    pendingPositionMs = positionMs
    applyComposition()
    player?.playWhenReady = playWhenReady
  }

  /** Katman varsa çok girişli video grafiği gerekir; mod değişince oynatıcı yeniden kurulur. */
  private fun ensurePlayer(multi: Boolean): CompositionPlayer {
    player?.let { if (playerMulti == multi) return it }
    if (player != null) releasePlayer()
    playerMulti = multi
    graphSpent = false
    val builder = CompositionPlayer.Builder(context)
    if (multi) builder.setVideoGraphFactory(MultipleInputVideoGraph.Factory())
    val p = builder.build()
    p.addListener(object : Player.Listener {
      override fun onIsPlayingChanged(isPlaying: Boolean) {
        emitState()
        if (isPlaying) main.post(positionTick) else main.removeCallbacks(positionTick)
      }

      override fun onPlaybackStateChanged(playbackState: Int) {
        if (playbackState == Player.STATE_ENDED && playerMulti) graphSpent = true
        if (playbackState == Player.STATE_READY) finishSeek()
        emitState()
      }

      override fun onRenderedFirstFrame() {
        finishSeek()
      }

      override fun onPlayerError(error: PlaybackException) {
        // Tanılama: tam neden zinciri günlüğe (logcat KurguPreview)
        android.util.Log.e("KurguPreview", "player error ${error.errorCodeName}", error)
        // Çok girişli grafik bitişten sonra kullanılınca (Media3 1.9.4, bkz. graphSpent) kare
        // işleme hatası verir: kullanıcıya hata göstermeden oynatıcı aynı konumdan yeniden kurulur.
        // ERROR_CODE_TIMEOUT: oynatma iş parçacığı yoğun işte (ör. ters oynatma kodlaması) zamanında
        // yanıt veremedi (CI #74); oynatıcı aynı yoldan yeniden kurulur.
        // Kare işleme iş parçacığı Media3'ün 500 ms'lik eşzamanlı çağrısına yetişemediğinde
        // (TimeoutException, CI #82: emülatörde ağır kompozisyon) de aynı şekilde yeniden kurulur.
        val timedOut = generateSequence(error.cause) { it.cause }.any { it is java.util.concurrent.TimeoutException }
        val recoverable = (error.errorCode == PlaybackException.ERROR_CODE_VIDEO_FRAME_PROCESSING_FAILED && (playerMulti || timedOut)) ||
          error.errorCode == PlaybackException.ERROR_CODE_TIMEOUT
        if (recoverable && recoveries < 3) {
          recoveries++
          val pos = player?.currentPosition ?: pendingPositionMs
          android.util.Log.w("KurguPreview", "player recovery #$recoveries (${error.errorCodeName}) at $pos ms")
          main.post { rebuildAt(pos, playWhenReady = false) }
          return
        }
        var cause: Throwable? = error.cause
        var detail = error.message ?: ""
        while (cause != null) {
          detail += " | ${cause.javaClass.simpleName}: ${cause.message}"
          cause = cause.cause
        }
        onPreviewError(mapOf("code" to error.errorCodeName, "message" to detail.take(600)))
      }
    })
    p.setVideoSurfaceView(surfaceView)
    player = p
    return p
  }

  private fun applyComposition() {
    val s = spec ?: return
    if (!attached) return
    if (s.main.isEmpty()) {
      releasePlayer()
      return
    }
    val side = previewSide(s)
    if (side == builtSide && s === builtSpec) return
    builtSide = side
    if (s !== builtSpec) recoveries = 0
    builtSpec = s
    val scale = minOf(1f, side.toFloat() / max(s.width, s.height))
    val w = (s.width * scale).roundToInt()
    val h = (s.height * scale).roundToInt()
    fixSurfaceSize(s)
    try {
      // Tanı: ana iş parçacığında geçen süre parça parça (donma araştırması, CI #129–#132)
      val t0 = android.os.SystemClock.uptimeMillis()
      val multi = CompositionFactory.needsCompositor(s)
      if (multi && graphSpent) releasePlayer()
      val t1 = android.os.SystemClock.uptimeMillis()
      val composition = CompositionFactory.build(s, w, h, forExport = false, live = true, padUri = if (multi) TransparentPad.uri(context) else null, context = context)
      val t2 = android.os.SystemClock.uptimeMillis()
      val p = ensurePlayer(multi)
      val wasPlaying = p.playWhenReady
      val pos = if (p.playbackState == Player.STATE_IDLE) pendingPositionMs else p.currentPosition
      val clamped = pos.coerceIn(0L, max(0L, s.totalMs - 1))
      val t3 = android.os.SystemClock.uptimeMillis()
      p.setComposition(composition, clamped)
      p.prepare()
      p.playWhenReady = wasPlaying
      val t4 = android.os.SystemClock.uptimeMillis()
      android.util.Log.i("KurguPerf", "compose total=${t4 - t0} release=${t1 - t0} build=${t2 - t1} player=${t3 - t2} set=${t4 - t3} multi=$multi clips=${s.main.size}")
    } catch (e: Exception) {
      onPreviewError(mapOf("code" to "COMPOSITION_FAILED", "message" to (e.message ?: e.javaClass.simpleName)))
    }
  }

  fun play() {
    if (player == null) applyComposition()
    val p = player ?: return
    // Zaman çizelgesinin sonunda duraklatıldıysa baştan oynat
    val total = spec?.totalMs ?: 0L
    if (playerMulti && (atTimelineEnd || p.currentPosition >= total - 40)) {
      atTimelineEnd = false
      p.seekTo(0)
    }
    if (p.playbackState == Player.STATE_ENDED || graphSpent) {
      if (playerMulti) return rebuildAt(0L, playWhenReady = true)
      p.seekTo(0)
    }
    p.play()
  }

  fun pause() {
    // Yalnızca oynarken durduğu konumu bildirir: durmuşken bir arama sürüyorsa currentPosition
    // eski konumu verir ve JS'teki (yeni) oynatma kafasını ezerdi.
    val wasPlaying = player?.isPlaying == true
    player?.pause()
    if (wasPlaying) emitPosition(force = true)
  }

  fun seekTo(ms: Double) {
    val target = max(0L, ms.toLong())
    pendingPositionMs = target
    atTimelineEnd = false
    if (graphSpent && playerMulti) {
      rebuildAt(target, playWhenReady = false)
      return reportSeekTarget(target)
    }
    if (player == null) return applyComposition()
    // Kaydırırken bir arama işlenirken gelen hedefler birikmez: yalnızca sonuncusu saklanır
    if (scrubbing && seekInFlight) {
      queuedSeekMs = target
      return
    }
    issueSeek(target)
    reportSeekTarget(target)
  }

  /**
   * Duraklatılmışken konum olayı gelmez; pause() hemen öncesinde eski konumu bildirdiyse
   * (duraklat + atla) JS'teki oynatma kafası o eski konumda kalırdı. Hedef doğrudan bildirilir:
   * CompositionPlayer aramayı eşzamansız işler, currentPosition bu anda hâlâ eski konumu verir
   * (CI #127'de ilk sürüm bu yüzden kafayı sona geri taşıdı).
   */
  private fun reportSeekTarget(target: Long) {
    if (scrubbing || player?.isPlaying == true) return
    lastReportedMs = target
    onPosition(mapOf("positionMs" to target))
  }

  // Kaydırma sırasında arama birleştirme: çok girişli grafikte her arama tüm boru hattını
  // boşaltır; parmak hızında art arda gelen aramalar kuyruğa dizilince önizleme geride kalıp
  // donuyordu. Aynı anda en çok bir arama işlenir, son gelen hedef kazanır.
  private var scrubbing = false
  private var seekInFlight = false
  private var queuedSeekMs = -1L
  private val seekWatchdog = Runnable { finishSeek() }

  private fun issueSeek(target: Long) {
    val p = player ?: return
    seekInFlight = scrubbing
    p.seekTo(target)
    if (seekInFlight) {
      main.removeCallbacks(seekWatchdog)
      // Kare gelmese bile (aynı kare, arabellekte) birleştirme kilitli kalmasın
      main.postDelayed(seekWatchdog, 250)
    }
  }

  private fun finishSeek() {
    main.removeCallbacks(seekWatchdog)
    if (!seekInFlight) return
    seekInFlight = false
    val q = queuedSeekMs
    queuedSeekMs = -1L
    if (q >= 0 && scrubbing) issueSeek(q)
  }

  fun setScrubbing(enabled: Boolean) {
    scrubbing = enabled
    if (!enabled) {
      // Kaydırma bitti: son konuma arama JS'ten ayrıca gelir
      main.removeCallbacks(seekWatchdog)
      seekInFlight = false
      queuedSeekMs = -1L
    }
    try {
      player?.setScrubbingModeEnabled(enabled)
    } catch (e: Exception) {
      // Eski cihazlarda desteklenmeyebilir; normal arama yine çalışır.
    }
  }

  private val positionTick = object : Runnable {
    override fun run() {
      emitPosition(force = false)
      stopAtTimelineEnd()
      if (player?.isPlaying == true) main.postDelayed(this, 16)
    }
  }

  private fun emitPosition(force: Boolean) {
    val p = player ?: return
    val ms = p.currentPosition
    if (force || ms != lastReportedMs) {
      lastReportedMs = ms
      onPosition(mapOf("positionMs" to ms))
    }
  }

  private fun emitState() {
    val p = player ?: return
    onPlaybackState(
      mapOf(
        "isPlaying" to p.isPlaying,
        "ended" to (p.playbackState == Player.STATE_ENDED),
        "buffering" to (p.playbackState == Player.STATE_BUFFERING),
        "positionMs" to p.currentPosition,
      ),
    )
  }

  private fun releasePlayer() {
    builtSpec = null
    main.removeCallbacks(positionTick)
    main.removeCallbacks(seekWatchdog)
    seekInFlight = false
    queuedSeekMs = -1L
    player?.let {
      pendingPositionMs = it.currentPosition
      val r0 = android.os.SystemClock.uptimeMillis()
      try {
        it.release()
        val took = android.os.SystemClock.uptimeMillis() - r0
        if (took > 100) android.util.Log.w("KurguPerf", "release ms=$took")
      } catch (e: IllegalStateException) {
        // Oynatma iş parçacığı Media3 hatasıyla ölmüşse release() denetime takılır
        // (CompositionPlayer.handleRelease: playbackThread.isAlive). Oynatıcı bırakılır.
        android.util.Log.w("KurguPreview", "release after dead playback thread", e)
      }
    }
    player = null
  }

  // Tanı: ana iş parçacığı 700 ms'den uzun tıkanırsa süresi günlüğe yazılır (KurguPerf). Kare
  // geri çağrısı yerine seyrek bir zamanlayıcı: boşta ekran çizimini zorlamaz.
  private var stallDueAt = 0L
  @Volatile private var mainBeat = 0L
  private val stallWatch = object : Runnable {
    override fun run() {
      val now = android.os.SystemClock.uptimeMillis()
      val late = now - stallDueAt
      if (stallDueAt > 0 && late > 700) android.util.Log.w("KurguPerf", "main stall ms=$late")
      stallDueAt = now + 500
      mainBeat = now
      main.postDelayed(this, 500)
    }
  }

  // Tıkanma sürerken ana iş parçacığının (ve JS / oynatma / GL iş parçacıklarının) o anki yığını
  // arka plandan bir kez yazılır: neyin beklettiği doğrudan görünür.
  @Volatile private var samplerOn = false
  private fun startStallSampler() {
    if (samplerOn) return
    samplerOn = true
    Thread({
      var dumpedFor = 0L
      while (samplerOn) {
        try { Thread.sleep(1000) } catch (e: InterruptedException) { break }
        val beat = mainBeat
        if (beat == 0L) continue
        val stuck = android.os.SystemClock.uptimeMillis() - beat
        if (stuck > 3000 && dumpedFor != beat) {
          dumpedFor = beat
          dumpThreads(stuck)
        }
      }
    }, "kurgu-stall-sampler").apply { isDaemon = true }.start()
  }

  private fun dumpThreads(stuckMs: Long) {
    try {
      val all = Thread.getAllStackTraces()
      for ((t, frames) in all) {
        val n = t.name
        val interesting = t === Looper.getMainLooper().thread || n.startsWith("mqt_js") || n.contains("Playback") ||
          n.contains("Effect") || n.contains("GL") || n.contains("Composition") || n.contains("VideoFrame")
        if (!interesting) continue
        val top = frames.take(14).joinToString(" < ") { "${it.className.substringAfterLast('.')}.${it.methodName}:${it.lineNumber}" }
        android.util.Log.w("KurguPerf", "stack stuck=${stuckMs}ms thread=$n state=${t.state} :: $top")
      }
    } catch (e: Throwable) {
      android.util.Log.w("KurguPerf", "stack dump failed ${e.javaClass.simpleName}")
    }
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    attached = true
    stallDueAt = 0L
    main.post(stallWatch)
    startStallSampler()
    applyComposition()
  }

  override fun onDetachedFromWindow() {
    attached = false
    main.removeCallbacks(stallWatch)
    samplerOn = false
    mainBeat = 0L
    releasePlayer()
    super.onDetachedFromWindow()
  }
}

/**
 * Media3 1.9.4 MultipleInputVideoGraph, bitişten sonra yeniden kullanıldığında oynatma iş
 * parçacığında (CompositionPlaybackThread) yakalanmamış IllegalStateException fırlatır ve
 * uygulamayı kapatır (CI #42–#53, DefaultVideoFrameProcessor.signalEndOfInput). Yalnızca bu
 * iş parçacığı + bu yığın için istisna yutulur ve önizleme yeniden kurulur; diğer tüm
 * çökmeler önceki işleyiciye aynen iletilir.
 */
object PlaybackCrashGuard {
  @Volatile var onRecover: (() -> Unit)? = null
  private var installed = false

  @Synchronized
  fun install() {
    if (installed) return
    installed = true
    val previous = Thread.getDefaultUncaughtExceptionHandler()
    Thread.setDefaultUncaughtExceptionHandler { thread, e ->
      val ours = thread.name == "CompositionPlaybackThread" &&
        e is IllegalStateException &&
        e.stackTrace.any { it.className.startsWith("androidx.media3.effect.MultipleInputVideoGraph") || it.className.startsWith("androidx.media3.effect.DefaultVideoCompositor") }
      if (ours) {
        android.util.Log.e("KurguPreview", "multi-input graph crash suppressed; rebuilding preview", e)
        onRecover?.invoke()
      } else {
        previous?.uncaughtException(thread, e)
      }
    }
  }
}
