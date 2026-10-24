// Proje -> yerel motorun anladığı düz render tanımı. Önizleme ve dışa aktarma
// aynı tanımı kullanır. Saf fonksiyondur; testlerde doğrudan çalıştırılır.

import { MAIN_KEY_PROPS, assignAudioLanes, audioDuration, clipDuration, mainLayout, totalDuration } from '../model/timeline';
import { MASK_TYPES } from '../model/schema';
import { KEYFRAME_PROPS, packTrack } from '../model/keyframes';
import { clipVisuals } from '../model/color';
import { TRANSITIONS, TRANSITION_MIN_MS } from '../model/catalog';
import { effectRenderSpec } from '../model/effects';
import { audioFxSpec } from '../model/audio-fx';
import { edgeSpeed, packSegments } from '../model/speed';

const DEFAULT_IMAGE_SOURCE_MS = 3000;

/**
 * @param project Kurgu projesi
 * @param resolveUri (media) => mutlak dosya URI'si
 * @param options { rtl } metin katmanlarının yön ipucu (boş metinler için)
 */
export function buildRenderSpec(project, resolveUri, options = {}) {
  const layout = mainLayout(project);
  const totalMs = Math.round(totalDuration(project));
  const fit = project.canvas.fit || 'fit';

  const main = layout.map(({ clip, start, end }) => {
    const media = project.media[clip.mediaId] || {};
    const visuals = clipVisuals(clip);
    const isImage = clip.kind === 'image';
    const kf = {};
    for (const prop of MAIN_KEY_PROPS) {
      const packed = packTrack(clip.keyframes?.[prop]);
      if (packed) kf[prop] = packed;
    }
    return {
      key: clip.id,
      startMs: Math.round(start),
      angle: clip.transform?.angle || 0,
      opacity: clamp(clip.opacity ?? 1, 0, 1),
      kf,
      uri: resolveUri(media),
      kind: isImage ? 'image' : 'video',
      srcInMs: Math.round(clip.srcIn),
      srcOutMs: Math.round(clip.srcOut),
      sourceDurationMs: Math.round(isImage ? clip.srcOut : media.durationMs || clip.srcOut || DEFAULT_IMAGE_SOURCE_MS),
      speed: isImage ? 1 : clip.speed,
      // Hız eğrisi: [kaynak başı ms, hız, ...] parçalı sabit hız (SegmentSpeed.kt); outMs zaman çizelgesi süresi
      speedSegments: isImage ? null : packSegments(clip),
      outMs: Math.round(clipDuration(clip)),
      volume: clip.muted || media.hasAudio === false ? 0 : clamp(clip.volume, 0, 1),
      // Ses düzeyi anahtar kareleri (klip içi çıktı ms); sessizde gönderilmez
      volumeKf: clip.muted || media.hasAudio === false ? null : packTrack(clip.keyframes?.volume),
      fadeInMs: Math.round(clip.fadeIn || 0),
      fadeOutMs: Math.round(clip.fadeOut || 0),
      denoise: clamp(clip.denoise || 0, 0, 1),
      audioFx: audioFxSpec(clip.audioFx),
      colorMatrix: visuals.colorMatrix,
      fit: clip.transform?.fit || fit,
      rotation: clip.transform?.rotation || 0,
      flipH: !!clip.transform?.flipH,
      flipV: !!clip.transform?.flipV,
      scale: clip.transform?.scale ?? 1,
      offsetX: clip.transform?.x || 0,
      offsetY: clip.transform?.y || 0,
      blur: visuals.blur,
      fx: visuals.fx,
      effects: (clip.effects || []).map((e) => effectRenderSpec(e, start, end, `${clip.id}/${e.id}`)).filter(Boolean),
      lut: lutSpec(project, clip, resolveUri),
    };
  });

  const transitions = [];
  for (let i = 1; i < layout.length; i++) {
    const tr = layout[i].clip.transition;
    if (!tr || tr.type === 'none') continue;
    const maxDur = Math.min(clipDuration(layout[i - 1].clip), clipDuration(layout[i].clip));
    const durationMs = Math.round(clamp(tr.durationMs || 500, TRANSITION_MIN_MS, maxDur));
    transitions.push({ type: tr.type, atMs: Math.round(layout[i].start), durationMs });
  }

  // Üst katman videolarının sesi: ses şeritlerinde ayrı öğe olarak çalınır (görüntü katman dizisinde).
  const overlays = (project.overlays || []).filter((o) => o.start < totalMs && project.media[o.mediaId]);
  const overlayAudio = overlays
    .filter((o) => o.kind === 'video' && !o.muted && (o.volume ?? 1) > 0 && project.media[o.mediaId].hasAudio !== false)
    .map((o) => ({ id: `${o.id}#a`, mediaId: o.mediaId, start: o.start, srcIn: o.srcIn, srcOut: o.srcOut, speed: o.speed || 1, volume: o.volume ?? 1, fadeIn: o.fadeIn || 0, fadeOut: o.fadeOut || 0, denoise: 0, audioFx: null }));

  const audioLanes = assignAudioLanes([...project.audio.filter((a) => a.start < totalMs && project.media[a.mediaId]), ...overlayAudio]).map((lane) =>
    lane.map((a) => {
      const media = project.media[a.mediaId];
      return {
        key: a.id,
        uri: resolveUri(media),
        startMs: Math.round(a.start),
        srcInMs: Math.round(a.srcIn),
        srcOutMs: Math.round(a.srcOut),
        sourceDurationMs: Math.round(media.durationMs || a.srcOut),
        speed: a.speed || 1,
        speedSegments: packSegments(a),
        outMs: Math.round(audioDuration(a)),
        volume: clamp(a.volume ?? 1, 0, 1),
        volumeKf: packTrack(a.keyframes?.volume),
        fadeInMs: Math.round(a.fadeIn || 0),
        fadeOutMs: Math.round(a.fadeOut || 0),
        denoise: clamp(a.denoise || 0, 0, 1),
        audioFx: audioFxSpec(a.audioFx),
        _endMs: Math.round(a.start + audioDuration(a)),
      };
    }).map(({ _endMs, ...rest }) => rest),
  );

  const texts = project.texts
    .filter((t) => t.start < totalMs && t.text && t.text.trim())
    .map((t) => ({
      text: t.text,
      startMs: Math.round(t.start),
      endMs: Math.round(Math.min(totalMs, t.start + t.duration)),
      x: t.x,
      y: t.y,
      scale: t.scale,
      rotation: t.rotation,
      // Anahtar kareler (metin başına göre ms; Keyframes.java paketi)
      kf: textKeyframes(t),
      sizeRel: t.style.size,
      color: t.style.color,
      background: t.style.background,
      stroke: t.style.stroke,
      strokeWidthRel: t.style.strokeWidth,
      shadow: !!t.style.shadow,
      align: t.style.align,
      bold: !!t.style.bold,
      italic: !!t.style.italic,
      font: t.style.font,
      letterSpacing: t.style.letterSpacing || 0,
      lineHeight: t.style.lineHeight || 1.2,
      opacity: t.style.opacity ?? 1,
      animIn: t.animIn || 'none',
      animOut: t.animOut || 'none',
      animMs: t.animMs || 400,
      rtl: !!options.rtl,
      animLoop: t.animLoop || 'none',
      color2: t.style.color2 || '#00000000',
      shadowColor: t.style.shadowColor || '#000000A0',
      shadowBlur: t.style.shadowBlur ?? 0.08,
      shadowX: t.style.shadowX ?? 0,
      shadowY: t.style.shadowY ?? 0.05,
      boxStyle: t.style.boxStyle || 'block',
      boxRadius: t.style.boxRadius ?? 0.25,
      boxPad: t.style.boxPad ?? 0.35,
      deco: t.style.deco || 'none',
      decoColor: t.style.decoColor || '#FFFFFFFF',
    }));

  const effectLayers = (project.effectLayers || [])
    .filter((e) => e.start < totalMs && e.duration > 0)
    .sort((a, b) => a.start - b.start)
    .map((e) => effectRenderSpec(e, e.start, Math.min(totalMs, e.start + e.duration)))
    .filter(Boolean);

  const laneIds = [...new Set(overlays.map((o) => o.lane))].sort((a, b) => a - b);
  const trLanes = transitionLayers(project, layout, main, transitions);
  const layers = [...trLanes, ...laneIds.map((lane) =>
    overlays
      .filter((o) => o.lane === lane)
      .sort((a, b) => a.start - b.start)
      .map((o) => overlaySpec(project, o, resolveUri)),
  )];

  return {
    width: project.canvas.width,
    height: project.canvas.height,
    fps: project.canvas.fps,
    totalMs,
    main,
    audioLanes,
    transitions,
    texts,
    effectLayers,
    layers,
    globalFx: {},
  };
}

const TR_N = Object.fromEntries(TRANSITIONS.map((x) => [x.id, x.n]));

/**
 * Gerçek A/B geçişleri: her kesmede [at - d/2, at + d/2] penceresinde giden klip (A)
 * ve gelen klip (B) ana izin üzerinde iki katman olarak çizilir (A şeridi altta, B üstte;
 * kullanıcı katmanlarının altında). Klibin kesim noktası ötesinde yeterli görüntü
 * (fazlalık) varsa normal hızda oynar; yoksa pencere boyunca yarım hızla oynatılır,
 * böylece ana izle arasında sıçrama olmaz. Görüntü ana izdeki gibi yerleşir
 * (sığdır/doldur, ölçek, konum, çevirme, 90° döndürme, renk, LUT, efektler).
 */
function transitionLayers(project, layout, mainSpecs, transitions) {
  const laneA = [];
  const laneB = [];
  for (const tr of transitions) {
    const n = TR_N[tr.type];
    if (!n) continue;
    const i = layout.findIndex((l) => Math.round(l.start) === tr.atMs);
    if (i < 1) continue;
    const half = tr.durationMs / 2;
    const win = [Math.round(tr.atMs - half), Math.round(tr.durationMs)];
    for (const role of [0, 1]) {
      const l = layout[role ? i : i - 1];
      const spec = mainSpecs[role ? i : i - 1];
      const clip = l.clip;
      const media = project.media[clip.mediaId] || {};
      const isImage = clip.kind === 'image';
      // Eğrili klipte kesim noktasındaki hız (A: sonu, B: başı)
      const sp = isImage ? 1 : edgeSpeed(clip, role ? 'start' : 'end');
      let srcIn;
      let srcOut;
      let speed = sp;
      if (isImage) {
        srcIn = 0;
        srcOut = win[1];
      } else if (role === 0) {
        const tail = (media.durationMs || clip.srcOut) - clip.srcOut;
        srcIn = clip.srcOut - half * sp;
        if (tail >= half * sp) srcOut = clip.srcOut + half * sp;
        else {
          srcOut = clip.srcOut;
          speed = sp / 2;
        }
      } else {
        srcOut = clip.srcIn + half * sp;
        if (clip.srcIn >= half * sp) srcIn = clip.srcIn - half * sp;
        else {
          srcIn = clip.srcIn;
          speed = sp / 2;
        }
      }
      const fit = (spec.fit || 'fit') === 'fill' ? 1 : 0;
      const item = {
        key: `tr:${layout[i].clip.id}:${role ? 'B' : 'A'}`,
        uri: spec.uri,
        kind: spec.kind,
        startMs: win[0],
        srcInMs: Math.round(srcIn),
        srcOutMs: Math.round(srcOut),
        sourceDurationMs: spec.sourceDurationMs,
        speed,
        colorMatrix: spec.colorMatrix,
        xf: [spec.offsetX || 0, spec.offsetY || 0, spec.scale ?? 1, 0],
        opacity: 1,
        flipH: spec.flipH,
        flipV: spec.flipV,
        crop: [0, 0, 1, 1],
        mask: [0, 0, 0, 0, 0.5, 0.5, 0.02, 0, 0],
        chroma: [0, 1, 0, 0, 0.4, 0.3, 0.5],
        kf: {},
        rot: ((Math.round((spec.rotation || 0) / 90) % 4) + 4) % 4,
        fit,
        tr: [n, win[0], win[1], role, 0.2],
        lut: spec.lut,
        // Klip efektleri pencere boyunca sürsün (kesim noktasının ötesinde de)
        effects: spec.effects.map((e) => ({ ...e, startMs: Math.min(e.startMs, win[0]), endMs: Math.max(e.endMs, win[0] + win[1]) })),
      };
      (role ? laneB : laneA).push(item);
    }
  }
  return [laneA, laneB].filter((lane) => lane.length);
}

function hexRgb(hex) {
  const h = String(hex || '').replace('#', '');
  if (h.length < 6) return [0, 1, 0];
  return [0, 2, 4].map((i) => Math.round((parseInt(h.slice(i, i + 2), 16) / 255) * 1e4) / 1e4);
}

function textKeyframes(t) {
  const kf = {};
  for (const prop of KEYFRAME_PROPS) {
    const packed = packTrack(t.keyframes?.[prop]);
    if (packed) kf[prop] = packed;
  }
  return kf;
}

/** Katman -> LayerClip (RenderSpec.kt). Dizi düzenleri LayerFx.kt / _layer.glsl ile aynıdır. */
function overlaySpec(project, o, resolveUri) {
  const media = project.media[o.mediaId] || {};
  const isImage = o.kind === 'image';
  const t = o.transform || {};
  const m = o.mask || {};
  const c = o.chroma || {};
  const crop = o.crop || {};
  const kf = {};
  for (const prop of KEYFRAME_PROPS) {
    const packed = packTrack(o.keyframes?.[prop]);
    if (packed) kf[prop] = packed;
  }
  return {
    key: o.id,
    uri: resolveUri(media),
    kind: isImage ? 'image' : 'video',
    startMs: Math.round(o.start),
    srcInMs: Math.round(o.srcIn),
    srcOutMs: Math.round(o.srcOut),
    sourceDurationMs: Math.round(isImage ? o.srcOut : media.durationMs || o.srcOut),
    speed: isImage ? 1 : o.speed || 1,
    colorMatrix: clipVisuals(o).colorMatrix,
    xf: [t.x || 0, t.y || 0, t.scale ?? 0.5, t.rotation || 0],
    opacity: clamp(o.opacity ?? 1, 0, 1),
    flipH: !!t.flipH,
    flipV: !!t.flipV,
    crop: [crop.x0 ?? 0, crop.y0 ?? 0, crop.x1 ?? 1, crop.y1 ?? 1],
    mask: [Math.max(0, MASK_TYPES.indexOf(m.type || 'none')), m.x || 0, m.y || 0, m.angle || 0, m.w ?? 0.5, m.h ?? 0.5, m.feather ?? 0.02, m.round || 0, m.invert ? 1 : 0],
    chroma: [...hexRgb(c.color), c.on ? 1 : 0, c.tolerance ?? 0.4, c.softness ?? 0.3, c.spill ?? 0.5],
    kf,
  };
}

/** Dışa aktarma çıktı boyutu: kanvas oranı korunur, kısa kenar = seçilen çözünürlük. */
export function exportSize(project, shortSide) {
  const { width, height } = project.canvas;
  const even = (v) => Math.max(2, Math.round(v / 2) * 2);
  if (width <= height) return { width: even(shortSide), height: even((shortSide * height) / width) };
  return { width: even((shortSide * width) / height), height: even(shortSide) };
}

/** Önerilen video bit hızı (bps): piksel sayısı x kare hızı x kalite katsayısı. */
export function suggestBitrate(width, height, fps, quality = 'recommended', codec = 'h264') {
  const factor = { low: 0.05, recommended: 0.09, high: 0.15 }[quality] ?? 0.09;
  const codecFactor = codec === 'hevc' || codec === 'av1' ? 0.65 : 1;
  const bps = width * height * fps * factor * codecFactor;
  return Math.round(Math.min(120e6, Math.max(1e6, bps)));
}

/** Tahmini dosya boyutu (bayt). */
export function estimateSize(durationMs, videoBitrate, audioBitrate = 192000) {
  return Math.round(((videoBitrate + audioBitrate) / 8) * (durationMs / 1000) * 1.02);
}

function lutSpec(project, clip, resolveUri) {
  const lut = clip.lut && project.luts?.[clip.lut.id];
  if (!lut) return null;
  const amount = clamp(clip.lut.intensity ?? 1, 0, 1);
  return amount > 0 ? { uri: resolveUri(lut), amount } : null;
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v ?? a));
}
