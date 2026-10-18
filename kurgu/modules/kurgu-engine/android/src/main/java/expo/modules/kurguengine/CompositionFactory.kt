package expo.modules.kurguengine

import android.net.Uri
import androidx.annotation.OptIn
import androidx.media3.common.C
import androidx.media3.common.Effect
import androidx.media3.common.MediaItem
import androidx.media3.common.audio.AudioProcessor
import androidx.media3.common.audio.GainProcessor
import androidx.media3.common.audio.SpeedProvider
import androidx.media3.common.util.UnstableApi
import androidx.media3.effect.FrameDropEffect
import androidx.media3.effect.GaussianBlur
import androidx.media3.effect.OverlayEffect
import androidx.media3.effect.Presentation
import androidx.media3.effect.ScaleAndRotateTransformation
import androidx.media3.effect.TextureOverlay
import androidx.media3.transformer.Composition
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.EditedMediaItemSequence
import androidx.media3.transformer.Effects
import kotlin.math.abs
import kotlin.math.max

/**
 * RenderSpec -> Media3 Composition. Önizleme (CompositionPlayer) ve dışa aktarma
 * (Transformer) aynı fonksiyonu kullanır; aralarındaki tek fark çıktı boyutudur.
 *
 * Sıra 0: ana video izi (video + ses). Sonraki sıralar: yalnızca ses şeritleri
 * (müzik, ses efekti, seslendirme). Metinler, geçişler ve genel efektler
 * kompozisyon düzeyinde uygulanır.
 */
@OptIn(UnstableApi::class)
object CompositionFactory {
  private val AUDIO_VIDEO: Set<Int> = setOf(C.TRACK_TYPE_AUDIO, C.TRACK_TYPE_VIDEO)
  private val AUDIO_ONLY: Set<Int> = setOf(C.TRACK_TYPE_AUDIO)

  fun build(spec: RenderSpec, outWidth: Int = spec.width, outHeight: Int = spec.height, forExport: Boolean = false): Composition {
    require(spec.main.isNotEmpty()) { "EMPTY_TIMELINE" }
    val w = even(outWidth)
    val h = even(outHeight)

    val mainItems = spec.main.map { mainItem(it, w, h, spec.fps) }
    val sequences = mutableListOf(
      EditedMediaItemSequence.Builder(AUDIO_VIDEO).addItems(mainItems).build(),
    )

    val totalUs = spec.main.sumOf { clipOutUs(it.srcInMs, it.srcOutMs, it.speed) }
    for (lane in spec.audioLanes) {
      val builder = EditedMediaItemSequence.Builder(AUDIO_ONLY)
      var cursorUs = 0L
      var added = 0
      for (clip in lane.sortedBy { it.startMs }) {
        val startUs = clip.startMs * 1000L
        if (startUs >= totalUs) break
        if (startUs > cursorUs) {
          builder.addGap(startUs - cursorUs)
          cursorUs = startUs
        }
        // Şerit, videonun bitişini aşmasın: klip sonunu kırp.
        var srcOutMs = clip.srcOutMs
        val maxOutUs = totalUs - cursorUs
        if (clipOutUs(clip.srcInMs, srcOutMs, clip.speed) > maxOutUs) {
          srcOutMs = clip.srcInMs + (maxOutUs * clip.speed / 1000f).toLong()
        }
        if (srcOutMs - clip.srcInMs < 20) continue
        builder.addItem(audioItem(clip, srcOutMs))
        cursorUs += clipOutUs(clip.srcInMs, srcOutMs, clip.speed)
        added++
      }
      if (added == 0) continue
      if (totalUs - cursorUs > 1000) builder.addGap(totalUs - cursorUs)
      sequences.add(builder.build())
    }

    val compositionEffects = mutableListOf<Effect>()
    val colorTransitions = spec.transitions.filter { it.type in setOf("fade", "dissolve", "white", "flash") }
    if (colorTransitions.isNotEmpty()) compositionEffects.add(TransitionColor(colorTransitions))
    val motionTransitions = spec.transitions.filter {
      it.type in setOf("zoomIn", "zoomOut", "slideLeft", "slideRight", "slideUp", "slideDown", "spin")
    }
    if (motionTransitions.isNotEmpty()) compositionEffects.add(TransitionMotion(motionTransitions))
    val glitchTransitions = spec.transitions.filter { it.type == "glitch" }
    if (!spec.globalFx.isNoOp || glitchTransitions.isNotEmpty()) {
      compositionEffects.add(FxEffect(spec.globalFx, glitchTransitions))
    }
    // Efekt katmanları (zaman çizelgesindeki efekt izi): metinlerin altında kalır.
    spec.effectLayers.forEach { compositionEffects.add(ShaderFx(it)) }
    val overlays: List<TextureOverlay> = spec.texts.filter { it.text.isNotBlank() && it.endMs > it.startMs }.map { TextLayerOverlay(it) }
    if (overlays.isNotEmpty()) compositionEffects.add(OverlayEffect(overlays))
    if (forExport) compositionEffects.add(FrameDropEffect.createDefaultFrameDropEffect(spec.fps.toFloat()))

    // HDR kaynaklar OpenGL ile SDR'ye ton eşlenir: efekt shader'ları SDR aralığında
    // çalışır, önizleme ile H.264 çıktısı aynı renkleri verir.
    return Composition.Builder(sequences)
      .setEffects(Effects(emptyList(), compositionEffects))
      .setHdrMode(Composition.HDR_MODE_TONE_MAP_HDR_TO_SDR_USING_OPEN_GL)
      .build()
  }

  private fun mainItem(clip: MainClip, w: Int, h: Int, fps: Int): EditedMediaItem {
    val isImage = clip.kind == "image"
    val mediaItem = if (isImage) {
      MediaItem.Builder()
        .setUri(Uri.parse(clip.uri))
        .setImageDurationMs(max(1L, clip.srcOutMs - clip.srcInMs))
        .build()
    } else {
      MediaItem.Builder()
        .setUri(Uri.parse(clip.uri))
        .setClippingConfiguration(
          MediaItem.ClippingConfiguration.Builder()
            .setStartPositionMs(clip.srcInMs)
            .setEndPositionMs(clip.srcOutMs)
            .build(),
        )
        .build()
    }

    val video = mutableListOf<Effect>()
    if (clip.flipH || clip.flipV || clip.rotation % 360f != 0f) {
      video.add(
        ScaleAndRotateTransformation.Builder()
          .setScale(if (clip.flipH) -1f else 1f, if (clip.flipV) -1f else 1f)
          .setRotationDegrees(-clip.rotation)
          .build(),
      )
    }
    val layout = if (clip.fit == "fill") Presentation.LAYOUT_SCALE_TO_FIT_WITH_CROP else Presentation.LAYOUT_SCALE_TO_FIT
    video.add(Presentation.createForWidthAndHeight(w, h, layout))
    if (abs(clip.scale - 1f) > 0.001f || abs(clip.offsetX) > 0.0005f || abs(clip.offsetY) > 0.0005f) {
      video.add(ClipPlacement(clip.scale, clip.offsetX, clip.offsetY))
    }
    clip.colorMatrix?.let { video.add(StaticColorMatrix(it)) }
    if (clip.blur > 0.01f) video.add(GaussianBlur(max(0.5f, clip.blur * h * 0.02f)))
    if (!clip.fx.isNoOp) video.add(FxEffect(clip.fx))
    clip.effects.forEach { video.add(ShaderFx(it)) }

    val audio = mutableListOf<AudioProcessor>()
    val outUs = clipOutUs(clip.srcInMs, clip.srcOutMs, clip.speed)
    if (VolumeEnvelope.isNeeded(clip.volume, clip.fadeInMs, clip.fadeOutMs)) {
      audio.add(GainProcessor(VolumeEnvelope(clip.volume, clip.fadeInMs * 1000L, clip.fadeOutMs * 1000L, outUs)))
    }

    val builder = EditedMediaItem.Builder(mediaItem)
      .setEffects(Effects(audio, video))
    if (isImage) {
      builder.setDurationUs(max(1L, clip.srcOutMs - clip.srcInMs) * 1000L).setFrameRate(fps)
    } else {
      builder.setDurationUs(max(clip.sourceDurationMs, clip.srcOutMs) * 1000L)
      if (abs(clip.speed - 1f) > 0.001f) builder.setSpeed(ConstantSpeed(clip.speed))
    }
    return builder.build()
  }

  private fun audioItem(clip: AudioClip, srcOutMs: Long): EditedMediaItem {
    val mediaItem = MediaItem.Builder()
      .setUri(Uri.parse(clip.uri))
      .setClippingConfiguration(
        MediaItem.ClippingConfiguration.Builder()
          .setStartPositionMs(clip.srcInMs)
          .setEndPositionMs(srcOutMs)
          .build(),
      )
      .build()
    val outUs = clipOutUs(clip.srcInMs, srcOutMs, clip.speed)
    val audio = mutableListOf<AudioProcessor>()
    if (VolumeEnvelope.isNeeded(clip.volume, clip.fadeInMs, clip.fadeOutMs)) {
      audio.add(GainProcessor(VolumeEnvelope(clip.volume, clip.fadeInMs * 1000L, clip.fadeOutMs * 1000L, outUs)))
    }
    val builder = EditedMediaItem.Builder(mediaItem)
      .setRemoveVideo(true)
      .setDurationUs(max(clip.sourceDurationMs, srcOutMs) * 1000L)
      .setEffects(Effects(audio, emptyList()))
    if (abs(clip.speed - 1f) > 0.001f) builder.setSpeed(ConstantSpeed(clip.speed))
    return builder.build()
  }

  fun clipOutUs(srcInMs: Long, srcOutMs: Long, speed: Float): Long =
    ((srcOutMs - srcInMs) * 1000.0 / max(0.01f, speed)).toLong()

  private fun even(v: Int) = max(2, v - (v % 2))
}

@OptIn(UnstableApi::class)
class ConstantSpeed(private val speed: Float) : SpeedProvider {
  override fun getSpeed(timeUs: Long): Float = speed

  override fun getNextSpeedChangeTimeUs(timeUs: Long): Long = C.TIME_UNSET
}
