package expo.modules.kurguengine

import android.content.Context
import android.net.Uri
import androidx.annotation.OptIn
import androidx.media3.common.C
import androidx.media3.common.Effect
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.OverlaySettings
import androidx.media3.common.VideoCompositorSettings
import androidx.media3.common.util.Size
import androidx.media3.common.audio.AudioProcessor
import androidx.media3.common.audio.GainProcessor
import androidx.media3.common.audio.SpeedChangingAudioProcessor
import androidx.media3.common.audio.SpeedProvider
import androidx.media3.common.util.SpeedProviderUtil
import androidx.media3.common.util.TimestampConsumer
import androidx.media3.common.util.UnstableApi
import androidx.media3.effect.FrameDropEffect
import androidx.media3.effect.GaussianBlur
import androidx.media3.effect.OverlayEffect
import androidx.media3.effect.Presentation
import androidx.media3.effect.ScaleAndRotateTransformation
import androidx.media3.effect.TextureOverlay
import androidx.media3.effect.TimestampAdjustment
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
 * Katmansız proje: sıra 0 ana video izi (video + ses), sonrakiler yalnızca ses
 * şeritleri (müzik, ses efekti, seslendirme). Katmanlı proje: saydam saat dizisi,
 * katman şeritleri (üstten alta), ana iz, ses şeritleri. Metinler, geçişler ve
 * genel efektler kompozisyon düzeyinde (birleştirilmiş görüntüye) uygulanır.
 */
@OptIn(UnstableApi::class)
object CompositionFactory {
  /** Önizlemede saat dizisinin zaman çizelgesi sonrasındaki fazladan süresi (oynatılmaz). */
  const val PREVIEW_TAIL_US = 600_000_000L

  private val AUDIO_VIDEO: Set<Int> = setOf(C.TRACK_TYPE_AUDIO, C.TRACK_TYPE_VIDEO)
  private val AUDIO_ONLY: Set<Int> = setOf(C.TRACK_TYPE_AUDIO)
  private val VIDEO_ONLY: Set<Int> = setOf(C.TRACK_TYPE_VIDEO)

  /** Katman varsa çok girişli birleştirici gerekir (önizlemede MultipleInputVideoGraph). */
  fun needsCompositor(spec: RenderSpec): Boolean = spec.layers.isNotEmpty()

  /**
   * @param padUri saydam dolgu görseli (TransparentPad); yalnızca katman varsa kullanılır.
   */
  fun build(
    spec: RenderSpec,
    outWidth: Int = spec.width,
    outHeight: Int = spec.height,
    forExport: Boolean = false,
    live: Boolean = false,
    padUri: String? = null,
    context: Context? = null,
  ): Composition {
    require(spec.main.isNotEmpty()) { "EMPTY_TIMELINE" }
    val w = even(outWidth)
    val h = even(outHeight)

    // Her öğenin dizideki başlangıcı, Media3'ün hesapladığı gibi (önceki öğelerin gerçek
    // süreleri toplamı) izlenir: dışa aktarmadaki hız eşlemesi bu ofsete ihtiyaç duyar ve
    // diğer diziler (saat, katmanlar, ses şeritleri) ana izle aynı anda biter.
    var mainCursorUs = 0L
    // Arka plan resmi kompozisyon kurulurken arka planda çözülür (GL iş parçacığı beklemez)
    spec.backgroundImage?.let { uri -> context?.let { BlendPixels.get(it, uri, CanvasBgFx.imageLongSide(w, h)) } }
    val mainItems = spec.main.map { c ->
      mainItem(c, w, h, spec.fps, live, forExport, mainCursorUs, spec.background, spec.backgroundImage).also { mainCursorUs += mainOutUs(c) }
    }
    val totalUs = mainCursorUs
    val sequences = mutableListOf<EditedMediaItemSequence>()
    val pad = if (needsCompositor(spec)) padUri else null
    val layered = pad != null
    if (pad != null) {
      // Birleştiricide ilk dizi birincil olur: en üstte çizilir ve çıktı zaman damgalarını
      // belirler. Bu yüzden en üste kanvas boyunca süren saydam bir "saat" dizisi konur;
      // ardından katman şeritleri (üstten alta), en altta ana iz gelir.
      // Önizlemede saat dizisi zaman çizelgesinden uzun tutulur: çok girişli grafik hiç
      // "bitti" durumuna girmez (Media3 1.9.4 MultipleInputVideoGraph bitişten sonra
      // yeniden kullanılınca oynatma iş parçacığını düşürüyor ve video çözücüleri sızıyordu).
      // Oynatma, KurguPreviewView tarafından zaman çizelgesinin sonunda duraklatılır.
      val clockUs = if (forExport) totalUs else totalUs + PREVIEW_TAIL_US
      sequences.add(EditedMediaItemSequence.Builder(VIDEO_ONLY).addItem(padItem(pad, clockUs, spec.fps)).build())
      for (lane in spec.layers.asReversed()) {
        layerSequence(lane, pad, totalUs, w, h, spec.fps, live, forExport)?.let { sequences.add(it) }
      }
    }
    sequences.add(EditedMediaItemSequence.Builder(AUDIO_VIDEO).addItems(mainItems).build())
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
        // Şerit, videonun bitişini aşmasın: klip sonunu kırp (hız eğrili öğe kırpılamaz; sığmazsa atlanır).
        var srcOutMs = clip.srcOutMs
        val maxOutUs = totalUs - cursorUs
        val curved = clip.speedSegments != null
        val fullOutUs = if (curved && clip.outMs > 0) clip.outMs * 1000L else clipOutUs(clip.srcInMs, srcOutMs, clip.speed)
        if (fullOutUs > maxOutUs) {
          if (curved) continue
          srcOutMs = clip.srcInMs + (maxOutUs * clip.speed / 1000f).toLong()
        }
        if (srcOutMs - clip.srcInMs < 20) continue
        builder.addItem(audioItem(clip, srcOutMs, live))
        cursorUs += if (curved) fullOutUs else clipOutUs(clip.srcInMs, srcOutMs, clip.speed)
        added++
      }
      if (added == 0) continue
      if (totalUs - cursorUs > 1000) builder.addGap(totalUs - cursorUs)
      sequences.add(builder.build())
    }

    val compositionEffects = mutableListOf<Effect>()
    // Katman tabanlı (gerçek A/B) geçişler varsa eski tek görüntülü geçiş efektleri uygulanmaz.
    val layerTransitions = layered && spec.layers.any { lane -> lane.any { it.tr != null } }
    val transitions = if (layerTransitions) emptyList() else spec.transitions
    val colorTransitions = transitions.filter { it.type in setOf("fade", "dissolve", "white", "flash") }
    if (colorTransitions.isNotEmpty()) compositionEffects.add(TransitionColor(colorTransitions))
    val motionTransitions = transitions.filter {
      it.type in setOf("zoomIn", "zoomOut", "slideLeft", "slideRight", "slideUp", "slideDown", "spin")
    }
    if (motionTransitions.isNotEmpty()) compositionEffects.add(TransitionMotion(motionTransitions))
    val glitchTransitions = transitions.filter { it.type == "glitch" }
    if (!spec.globalFx.isNoOp || glitchTransitions.isNotEmpty()) {
      compositionEffects.add(FxEffect(spec.globalFx, glitchTransitions))
    }
    // Karışım modlu görsel katmanları: tüm alt katmanlar birleştikten sonra, efekt izinin ve
    // metinlerin altında çizilir (Media3 birleştiricisi yalnızca alfa karışımı yapar).
    spec.blendLayers.forEach {
      val fx = BlendLayerFx(it.layer, it.mode, w, h, if (live) "ly:${it.layer.key}" else null)
      context?.let(fx::prefetch)
      compositionEffects.add(fx)
    }
    // Efekt katmanları (zaman çizelgesindeki efekt izi): metinlerin altında kalır.
    spec.effectLayers.forEach { compositionEffects.add(ShaderFx(it, if (live) "fx:${it.key}" else null)) }
    val overlays: List<TextureOverlay> = spec.texts.filter { it.text.isNotBlank() && it.endMs > it.startMs }.map { if (live && it.key.isNotEmpty()) LiveTextOverlay(it) else TextLayerOverlay(it) }
    if (overlays.isNotEmpty()) compositionEffects.add(OverlayEffect(overlays))
    if (forExport) compositionEffects.add(FrameDropEffect.createDefaultFrameDropEffect(spec.fps.toFloat()))

    // HDR kaynaklar OpenGL ile SDR'ye ton eşlenir: efekt shader'ları SDR aralığında
    // çalışır, önizleme ile H.264 çıktısı aynı renkleri verir.
    val builder = Composition.Builder(sequences)
      .setEffects(Effects(emptyList(), compositionEffects))
      .setHdrMode(Composition.HDR_MODE_TONE_MAP_HDR_TO_SDR_USING_OPEN_GL)
    if (layered) builder.setVideoCompositorSettings(CanvasCompositorSettings(w, h))
    return builder.build()
  }

  /** Dolgu öğesinin gerçek süresi (ms'ye aşağı yuvarlanır; görsel süresi ms cinsindendir). */
  private fun padUs(durationUs: Long): Long = max(1L, durationUs / 1000L) * 1000L

  /** Saydam dolgu görseli öğesi: katman şeridindeki boşluklar (video boşlukları siyah kare üretir). */
  private fun padItem(padUri: String, durationUs: Long, fps: Int): EditedMediaItem {
    val ms = padUs(durationUs) / 1000L
    val item = MediaItem.Builder()
      .setUri(Uri.parse(padUri))
      .setMimeType(MimeTypes.IMAGE_PNG)
      .setImageDurationMs(ms)
      .build()
    return EditedMediaItem.Builder(item).setDurationUs(ms * 1000L).setFrameRate(fps).build()
  }

  /** Bir katman şeridi: öğeler zamana göre, aralar ve son saydam dolguyla; kanvas sonunda kırpılır. */
  private fun layerSequence(lane: List<LayerClip>, padUri: String, totalUs: Long, w: Int, h: Int, fps: Int, live: Boolean, forExport: Boolean): EditedMediaItemSequence? {
    // Önizleme (CompositionPlayer): hızı değişen öğe içeren şerit sesli dizi olur, ses sıfır
    // kazançla susturulur (katman sesi ses şeritlerinde ayrıca çalınır).
    // Dışa aktarma: hız, öğe ofsetini bilen kendi zaman eşlememizle uygulanır (ItemSpeedMap);
    // görüntü sese bağlı olmadığından şerit yalnızca görüntü dizisidir.
    val withAudio = !forExport && lane.any { it.kind != "image" && abs(it.speed - 1f) > 0.001f }
    val builder = EditedMediaItemSequence.Builder(if (withAudio) AUDIO_VIDEO else VIDEO_ONLY)
    // Media3'ün bu dizide hesaplayacağı konum (dolgular ms'ye yuvarlanır)
    var cursorUs = 0L
    var added = 0
    for (clip in lane.sortedBy { it.startMs }) {
      val startUs = clip.startMs * 1000L
      if (startUs >= totalUs - 20_000) break
      if (startUs < cursorUs - 1000) continue // çakışan öğe (JS şeritleri ayırır; güvenlik için atlanır)
      if (startUs - cursorUs >= 1000) {
        val gapUs = padUs(startUs - cursorUs)
        builder.addItem(padItem(padUri, gapUs, fps))
        cursorUs += gapUs
      }
      var srcOutMs = clip.srcOutMs
      val isImage = clip.kind == "image"
      val maxOutUs = totalUs - cursorUs
      if (clipOutUs(clip.srcInMs, srcOutMs, if (isImage) 1f else clip.speed) > maxOutUs) {
        srcOutMs = clip.srcInMs + (maxOutUs * (if (isImage) 1f else clip.speed) / 1000f).toLong()
      }
      if (srcOutMs - clip.srcInMs < 20) continue
      builder.addItem(layerItem(clip, srcOutMs, w, h, fps, live, withAudio, forExport, cursorUs))
      cursorUs += layerOutUs(clip, srcOutMs)
      added++
    }
    if (added == 0) return null
    if (totalUs - cursorUs >= 1000) builder.addItem(padItem(padUri, totalUs - cursorUs, fps))
    return builder.build()
  }

  private fun layerItem(
    clip: LayerClip,
    srcOutMs: Long,
    w: Int,
    h: Int,
    fps: Int,
    live: Boolean,
    mutedAudio: Boolean,
    forExport: Boolean,
    itemOffsetUs: Long,
  ): EditedMediaItem {
    val isImage = clip.kind == "image"
    val mediaItem = if (isImage) {
      MediaItem.Builder().setUri(Uri.parse(clip.uri)).setImageDurationMs(max(1L, srcOutMs - clip.srcInMs)).build()
    } else {
      MediaItem.Builder()
        .setUri(Uri.parse(clip.uri))
        .setClippingConfiguration(
          MediaItem.ClippingConfiguration.Builder().setStartPositionMs(clip.srcInMs).setEndPositionMs(srcOutMs).build(),
        )
        .build()
    }
    val video = mutableListOf<Effect>()
    clip.colorMatrix?.let { video.add(StaticColorMatrix(it, if (live) "cm:${clip.key}" else null)) }
    clip.lut?.takeIf { it.amount > 0f && CubeLut.fileOf(it.uri).isFile }?.let { video.add(LutFx(it, if (live) "lut:${clip.key}" else null)) }
    clip.effects.forEach { video.add(ShaderFx(it, if (live) "fx:${it.key}" else null)) }
    video.add(LayerFx(clip, w, h, if (live) "ly:${clip.key}" else null))
    val outUs = layerOutUs(clip, srcOutMs)
    val audio: List<AudioProcessor> = if (mutedAudio) listOf(GainProcessor(VolumeEnvelope(0f, 0, 0, outUs))) else emptyList()
    val speed = if (isImage) null else speedProviderOf(clip.speed, null)
    if (speed != null && forExport) video.add(0, exportSpeedEffect(itemOffsetUs, speed))
    val builder = EditedMediaItem.Builder(mediaItem)
      .setRemoveAudio(!mutedAudio) // katman sesi ses şeritlerinde ayrıca çalınır (renderSpec.js)
      .setEffects(Effects(audio, video))
    if (isImage) {
      builder.setDurationUs(max(1L, srcOutMs - clip.srcInMs) * 1000L).setFrameRate(fps)
    } else {
      builder.setDurationUs(max(clip.sourceDurationMs, srcOutMs) * 1000L)
      if (speed != null && !forExport) builder.setSpeed(speed)
    }
    return builder.build()
  }

  private fun mainItem(clip: MainClip, w: Int, h: Int, fps: Int, live: Boolean, forExport: Boolean, itemOffsetUs: Long, background: FloatArray, backgroundImage: String?): EditedMediaItem {
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
    if (clip.fit != "fill" && (live || !CanvasBgFx.isBlack(background))) {
      // Sığdırılan klibin boşlukları kanvas arka planıyla (renk / bulanık kopya) dolar. Önizlemede
      // her zaman bu yol kullanılır ki arka plan değişince kompozisyon yeniden kurulmasın.
      video.add(CanvasBgFx(w, h, background, if (live) "bg:canvas" else null, backgroundImage))
    } else {
      val layout = if (clip.fit == "fill") Presentation.LAYOUT_SCALE_TO_FIT_WITH_CROP else Presentation.LAYOUT_SCALE_TO_FIT
      video.add(Presentation.createForWidthAndHeight(w, h, layout))
    }
    val kf = clip.keyframes
    val animated = kf.keys.any { it in setOf("x", "y", "scale", "angle") } || abs(clip.angle) > 0.01f
    if (live) {
      // Önizleme: yerleşim her zaman canlı okunur, değeri değişince kompozisyon yeniden kurulmaz
      video.add(KeyedPlacement(clip.scale, clip.offsetX, clip.offsetY, clip.angle, kf, clip.startMs, "tf:${clip.key}"))
    } else if (animated) {
      video.add(KeyedPlacement(clip.scale, clip.offsetX, clip.offsetY, clip.angle, kf, clip.startMs))
    } else if (abs(clip.scale - 1f) > 0.001f || abs(clip.offsetX) > 0.0005f || abs(clip.offsetY) > 0.0005f) {
      video.add(ClipPlacement(clip.scale, clip.offsetX, clip.offsetY))
    }
    clip.colorMatrix?.let { video.add(StaticColorMatrix(it, if (live) "cm:${clip.key}" else null)) }
    // LUT renk ayarlarından sonra uygulanır; dosya silinmişse atlanır (proje yine açılır).
    clip.lut?.takeIf { it.amount > 0f && CubeLut.fileOf(it.uri).isFile }?.let { video.add(LutFx(it, if (live) "lut:${clip.key}" else null)) }
    if (clip.blur > 0.01f) video.add(GaussianBlur(max(0.5f, clip.blur * h * 0.02f)))
    if (!clip.fx.isNoOp) video.add(FxEffect(clip.fx))
    clip.effects.forEach { video.add(ShaderFx(it, if (live) "fx:${it.key}" else null)) }
    if (kf.containsKey("opacity") || clip.opacity < 0.999f) video.add(KeyedOpacity(clip.opacity, kf["opacity"], clip.startMs))

    val speed = if (isImage) null else speedProviderOf(clip.speed, clip.speedSegments)
    val audio = mutableListOf<AudioProcessor>()
    // Dışa aktarmada hız, setSpeed yerine Media3'ün eklediği zincirin eşdeğeriyle uygulanır:
    // ses için ilk işlemci SpeedChangingAudioProcessor (öğe başından sayar), görüntü için ilk
    // efekt öğe ofsetini bilen zaman eşlemesi (bkz. ItemSpeedMap).
    if (speed != null && forExport) {
      audio.add(SpeedChangingAudioProcessor(speed))
      video.add(0, exportSpeedEffect(itemOffsetUs, speed))
    }
    val outUs = mainOutUs(clip)
    if (clip.denoise > 0.01f && clip.volume > 0f) audio.add(DenoiseProcessor(clip.denoise))
    if (clip.volume > 0f) clip.audioFx?.let { audio.addAll(audioFxProcessors(it)) }
    // Önizlemede ses düzeyi canlı değişebilsin diye işlemci her zaman eklenir.
    if (live || VolumeEnvelope.isNeeded(clip.volume, clip.fadeInMs, clip.fadeOutMs, clip.volumeKf)) {
      audio.add(GainProcessor(VolumeEnvelope(clip.volume, clip.fadeInMs * 1000L, clip.fadeOutMs * 1000L, outUs, if (live) "vol:${clip.key}" else null, clip.volumeKf)))
    }

    val builder = EditedMediaItem.Builder(mediaItem)
      .setEffects(Effects(audio, video))
    if (isImage) {
      builder.setDurationUs(max(1L, clip.srcOutMs - clip.srcInMs) * 1000L).setFrameRate(fps)
    } else {
      builder.setDurationUs(max(clip.sourceDurationMs, clip.srcOutMs) * 1000L)
      if (speed != null && !forExport) builder.setSpeed(speed)
    }
    return builder.build()
  }

  /**
   * Ana iz öğesinin çıktı süresi, Media3'ün dizi ofsetinde kullandığı değerle aynı
   * (SequenceAssetLoader: EditedMediaItem.getDurationAfterEffectsApplied): görsel = görsel
   * süresi; video = kırpılmış süre, hız varsa SpeedProviderUtil ile.
   */
  private fun mainOutUs(c: MainClip): Long {
    if (c.kind == "image") return max(1L, c.srcOutMs - c.srcInMs) * 1000L
    val inUs = (c.srcOutMs - c.srcInMs) * 1000L
    val speed = speedProviderOf(c.speed, c.speedSegments) ?: return inUs
    return SpeedProviderUtil.getDurationAfterSpeedProviderApplied(speed, inUs)
  }

  /** Katman öğesinin çıktı süresi (mainOutUs ile aynı kurallar). */
  private fun layerOutUs(c: LayerClip, srcOutMs: Long): Long {
    if (c.kind == "image") return max(1L, srcOutMs - c.srcInMs) * 1000L
    val inUs = (srcOutMs - c.srcInMs) * 1000L
    val speed = speedProviderOf(c.speed, null) ?: return inUs
    return SpeedProviderUtil.getDurationAfterSpeedProviderApplied(speed, inUs)
  }

  private fun speedProviderOf(speed: Float, segments: FloatArray?): SpeedProvider? = when {
    segments != null -> SegmentSpeed(segments)
    abs(speed - 1f) > 0.001f -> ConstantSpeed(speed)
    else -> null
  }

  private fun exportSpeedEffect(itemOffsetUs: Long, speed: SpeedProvider): TimestampAdjustment =
    TimestampAdjustment(ItemSpeedMap(itemOffsetUs, speed), speed)

  /**
   * Teşhis: her dizinin iz türleri, öğe türleri, Media3'ün hesaplayacağı başlangıç/süreler (us)
   * ve hızlar. Dışa aktarma başında "KurguExport" etiketiyle günlüğe yazılır.
   */
  fun describe(composition: Composition): List<String> {
    val lines = mutableListOf<String>()
    composition.sequences.forEachIndexed { si, seq ->
      val types = seq.trackTypes.sorted().joinToString("+") {
        when (it) {
          C.TRACK_TYPE_AUDIO -> "audio"
          C.TRACK_TYPE_VIDEO -> "video"
          else -> it.toString()
        }
      }
      var cursorUs = 0L
      val items = seq.editedMediaItems.mapIndexed { ii, item ->
        val mi = item.mediaItem
        val uri = mi.localConfiguration?.uri?.toString() ?: ""
        val isGap = mi.mediaId == "androidx-media3-GapMediaItem"
        val isImage = (mi.localConfiguration?.imageDurationMs ?: C.TIME_UNSET) != C.TIME_UNSET
        val kind = when {
          isGap -> "gap"
          isImage && uri.endsWith(TransparentPad.FILE_NAME) -> "pad"
          isImage -> "image"
          else -> "video"
        }
        val map = (item.effects.videoEffects.firstOrNull() as? TimestampAdjustment)?.timestampMap as? ItemSpeedMap
        val provider: SpeedProvider? = map?.provider ?: item.speedProvider.takeIf { it != SpeedProvider.DEFAULT }
        val outUs = if (isGap || isImage) {
          item.durationUs
        } else {
          val clip = mi.clippingConfiguration
          val endUs = if (clip.endPositionUs == C.TIME_END_OF_SOURCE) item.durationUs else clip.endPositionUs
          val inUs = endUs - clip.startPositionUs
          if (provider != null) SpeedProviderUtil.getDurationAfterSpeedProviderApplied(provider, inUs) else inUs
        }
        val speedText = when {
          provider == null -> "1"
          map != null -> "$provider(map@${map.itemOffsetUs})"
          else -> "$provider(setSpeed)"
        }
        val flags = buildString {
          if (item.removeAudio) append(" -audio")
          if (item.removeVideo) append(" -video")
        }
        val line = "  #$ii $kind start=$cursorUs dur=$outUs speed=$speedText" +
          " fx=${item.effects.videoEffects.size}/${item.effects.audioProcessors.size}$flags"
        cursorUs += outUs
        line
      }
      lines.add("seq[$si] $types loop=${seq.isLooping} items=${seq.editedMediaItems.size} totalUs=$cursorUs")
      lines.addAll(items)
    }
    lines.add("compositionFx=${composition.effects.videoEffects.size} hdrMode=${composition.hdrMode}")
    return lines
  }

  private fun audioItem(clip: AudioClip, srcOutMs: Long, live: Boolean = false): EditedMediaItem {
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
    if (clip.denoise > 0.01f) audio.add(DenoiseProcessor(clip.denoise))
    clip.audioFx?.let { audio.addAll(audioFxProcessors(it)) }
    if (live || VolumeEnvelope.isNeeded(clip.volume, clip.fadeInMs, clip.fadeOutMs, clip.volumeKf)) {
      audio.add(GainProcessor(VolumeEnvelope(clip.volume, clip.fadeInMs * 1000L, clip.fadeOutMs * 1000L, outUs, if (live) "vol:${clip.key}" else null, clip.volumeKf)))
    }
    val builder = EditedMediaItem.Builder(mediaItem)
      .setRemoveVideo(true)
      .setDurationUs(max(clip.sourceDurationMs, srcOutMs) * 1000L)
      .setEffects(Effects(audio, emptyList()))
    val segs = clip.speedSegments
    if (segs != null) builder.setSpeed(SegmentSpeed(segs))
    else if (abs(clip.speed - 1f) > 0.001f) builder.setSpeed(ConstantSpeed(clip.speed))
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

  override fun toString(): String = "x$speed"
}

/**
 * Dışa aktarmada hız değişiminin görüntü zaman eşlemesi (TimestampAdjustment'a verilir).
 *
 * Media3 1.9.4'te EditedMediaItem.setSpeed, Transformer'da (Transformer.addSpeedChangingEffects)
 * görüntüye `TimestampAdjustment(SpeedChangingAudioProcessor::getSpeedAdjustedTimeAsync)` ekler.
 * Bu efektin gördüğü kare zamanı öğenin dizideki ofsetini de içerir (VideoSampleExporter
 * registerInputStream offsetToAddUs; ExternalTextureManager bunu kare zamanına ekler), oysa ses
 * işlemcisinin hız eğrisi öğe başından (0) sayar. Sonuç: dizinin ilk öğesi olmayan her hızlı
 * öğede kare zamanı `(ofset + t) / hız` olur. Örn. geçiş şeridindeki 0.5x kopya 9.8 sn yerine
 * ~19.6 sn'ye düşer; birleştirici bu kareleri hiç bırakmaz, şeridin sonraki öğesine geçilemez
 * ve ses/görüntü birbirini bekleyerek dışa aktarma kilitlenir (MUXING_TIMEOUT, %90).
 *
 * Burada eşleme `ofset + hızEğrisi(T - ofset)` olarak eşzamanlı hesaplanır; görüntü sese de
 * bağlı kalmaz. [itemOffsetUs], Media3'ün bu öğe için kullandığı dizi ofsetidir (önceki
 * öğelerin getDurationAfterEffectsApplied toplamı; CompositionFactory aynı kuralla hesaplar).
 */
@OptIn(UnstableApi::class)
class ItemSpeedMap(val itemOffsetUs: Long, val provider: SpeedProvider) : TimestampAdjustment.TimestampMap {
  override fun calculateOutputTimeUs(inputTimeUs: Long, outputTimeConsumer: TimestampConsumer) {
    val relUs = max(0L, inputTimeUs - itemOffsetUs)
    outputTimeConsumer.onTimestamp(itemOffsetUs + SpeedProviderUtil.getDurationAfterSpeedProviderApplied(provider, relUs))
  }
}

/** Çıktı her zaman kanvas boyutunda; her giriş tam kare (katmanlar kendi yerleşimini çizer). */
@OptIn(UnstableApi::class)
class CanvasCompositorSettings(private val w: Int, private val h: Int) : VideoCompositorSettings {
  override fun getOutputSize(inputSizes: List<Size>): Size = Size(w, h)

  override fun getOverlaySettings(inputId: Int, presentationTimeUs: Long): OverlaySettings = object : OverlaySettings {}
}

/**
 * Hız eğrisi: parçalı sabit hız. `segments` = [kaynak başı ms (klip başına göre), hız, ...]
 * (src/model/speed.js packSegments). Media3 zamanı kırpılmış klibin başına göredir.
 */
@OptIn(UnstableApi::class)
class SegmentSpeed(segments: FloatArray) : SpeedProvider {
  private val startsUs: LongArray
  private val speeds: FloatArray

  init {
    // Media3 değişim zamanlarının kesin artan olmasını ister: çakışan başlangıçlar atlanır.
    val st = ArrayList<Long>()
    val sp = ArrayList<Float>()
    for (i in 0 until segments.size / 2) {
      val us = (segments[i * 2].toDouble() * 1000.0).toLong()
      if (st.isNotEmpty() && us <= st.last()) continue
      st.add(us)
      sp.add(segments[i * 2 + 1].coerceIn(0.05f, 20f))
    }
    if (st.isEmpty()) {
      st.add(0L)
      sp.add(1f)
    }
    startsUs = st.toLongArray()
    speeds = sp.toFloatArray()
  }

  private fun index(timeUs: Long): Int {
    var i = 0
    while (i < startsUs.size - 1 && startsUs[i + 1] <= timeUs) i++
    return i
  }

  override fun getSpeed(timeUs: Long): Float = speeds[index(timeUs)]

  override fun getNextSpeedChangeTimeUs(timeUs: Long): Long {
    val i = index(timeUs)
    return if (i + 1 < startsUs.size) startsUs[i + 1] else C.TIME_UNSET
  }

  override fun toString(): String = "curve" + startsUs.indices.joinToString(",", "[", "]") { "${startsUs[it]}:${speeds[it]}" }
}
