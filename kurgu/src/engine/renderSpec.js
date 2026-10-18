// Proje -> yerel motorun anladığı düz render tanımı. Önizleme ve dışa aktarma
// aynı tanımı kullanır. Saf fonksiyondur; testlerde doğrudan çalıştırılır.

import { assignAudioLanes, audioDuration, clipDuration, mainLayout, totalDuration } from '../model/timeline';
import { clipVisuals } from '../model/color';
import { TRANSITION_MIN_MS } from '../model/catalog';

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

  const main = layout.map(({ clip }) => {
    const media = project.media[clip.mediaId] || {};
    const visuals = clipVisuals(clip);
    const isImage = clip.kind === 'image';
    return {
      uri: resolveUri(media),
      kind: isImage ? 'image' : 'video',
      srcInMs: Math.round(clip.srcIn),
      srcOutMs: Math.round(clip.srcOut),
      sourceDurationMs: Math.round(isImage ? clip.srcOut : media.durationMs || clip.srcOut || DEFAULT_IMAGE_SOURCE_MS),
      speed: isImage ? 1 : clip.speed,
      volume: clip.muted || media.hasAudio === false ? 0 : clamp(clip.volume, 0, 1),
      fadeInMs: Math.round(clip.fadeIn || 0),
      fadeOutMs: Math.round(clip.fadeOut || 0),
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

  const audioLanes = assignAudioLanes(project.audio.filter((a) => a.start < totalMs && project.media[a.mediaId])).map((lane) =>
    lane.map((a) => {
      const media = project.media[a.mediaId];
      return {
        uri: resolveUri(media),
        startMs: Math.round(a.start),
        srcInMs: Math.round(a.srcIn),
        srcOutMs: Math.round(a.srcOut),
        sourceDurationMs: Math.round(media.durationMs || a.srcOut),
        speed: a.speed || 1,
        volume: clamp(a.volume ?? 1, 0, 1),
        fadeInMs: Math.round(a.fadeIn || 0),
        fadeOutMs: Math.round(a.fadeOut || 0),
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
    }));

  return {
    width: project.canvas.width,
    height: project.canvas.height,
    fps: project.canvas.fps,
    totalMs,
    main,
    audioLanes,
    transitions,
    texts,
    globalFx: {},
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

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v ?? a));
}
