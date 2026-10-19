package expo.modules.kurguengine

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.view.SurfaceView
import androidx.annotation.OptIn
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
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
    applyComposition()
  }

  /** Kaydırıcı değerleri: kompozisyonu yeniden kurmadan günceller, duraklatılmışsa kareyi yeniler. */
  fun setLive(json: String?) {
    if (json == null) return
    try {
      val o = org.json.JSONObject(json)
      val keys = o.keys()
      while (keys.hasNext()) {
        val k = keys.next()
        val arr = o.optJSONArray(k) ?: continue
        LiveParams.put(k, FloatArray(arr.length()) { arr.optDouble(it, 0.0).toFloat() })
      }
    } catch (e: Exception) {
      return
    }
    requestRedraw()
  }

  private var lastRedraw = 0L
  private val redraw = Runnable {
    val p = player ?: return@Runnable
    lastRedraw = android.os.SystemClock.uptimeMillis()
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
      when {
        heavy || effects >= 4 -> 640
        effects >= 1 -> 800
        else -> 960
      }
    }
  }

  private fun ensurePlayer(): CompositionPlayer {
    player?.let { return it }
    val p = CompositionPlayer.Builder(context).build()
    p.addListener(object : Player.Listener {
      override fun onIsPlayingChanged(isPlaying: Boolean) {
        emitState()
        if (isPlaying) main.post(positionTick) else main.removeCallbacks(positionTick)
      }

      override fun onPlaybackStateChanged(playbackState: Int) {
        emitState()
      }

      override fun onPlayerError(error: PlaybackException) {
        onPreviewError(mapOf("code" to error.errorCodeName, "message" to (error.message ?: "")))
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
    builtSpec = s
    val scale = minOf(1f, side.toFloat() / max(s.width, s.height))
    val w = (s.width * scale).roundToInt()
    val h = (s.height * scale).roundToInt()
    try {
      val composition = CompositionFactory.build(s, w, h, forExport = false, live = true)
      val p = ensurePlayer()
      val wasPlaying = p.playWhenReady
      val pos = if (p.playbackState == Player.STATE_IDLE) pendingPositionMs else p.currentPosition
      val clamped = pos.coerceIn(0L, max(0L, s.totalMs - 1))
      p.setComposition(composition, clamped)
      p.prepare()
      p.playWhenReady = wasPlaying
    } catch (e: Exception) {
      onPreviewError(mapOf("code" to "COMPOSITION_FAILED", "message" to (e.message ?: e.javaClass.simpleName)))
    }
  }

  fun play() {
    val p = player ?: return
    if (p.playbackState == Player.STATE_ENDED) p.seekTo(0)
    p.play()
  }

  fun pause() {
    player?.pause()
    emitPosition(force = true)
  }

  fun seekTo(ms: Double) {
    val target = max(0L, ms.toLong())
    pendingPositionMs = target
    player?.seekTo(target)
  }

  fun setScrubbing(enabled: Boolean) {
    try {
      player?.setScrubbingModeEnabled(enabled)
    } catch (e: Exception) {
      // Eski cihazlarda desteklenmeyebilir; normal arama yine çalışır.
    }
  }

  private val positionTick = object : Runnable {
    override fun run() {
      emitPosition(force = false)
      if (player?.isPlaying == true) main.postDelayed(this, 33)
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
    player?.let {
      pendingPositionMs = it.currentPosition
      it.release()
    }
    player = null
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    attached = true
    applyComposition()
  }

  override fun onDetachedFromWindow() {
    attached = false
    releasePlayer()
    super.onDetachedFromWindow()
  }
}
