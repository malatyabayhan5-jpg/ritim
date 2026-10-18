// Zaman çizelgesi işlemleri. Hepsi saf fonksiyondur: projeyi değiştirmez,
// yeni proje döndürür (geri al / yinele geçmişi bu sayede basittir).
// Ana iz "manyetiktir": klipler arasında boşluk olmaz. Ses ve metin katmanları
// serbest konumludur.

import { createAudioClip, createMainClip, createText, newId } from './schema';
import { createEffectInstance, createEffectLayer } from './effects';

export const MIN_CLIP_MS = 100;
export const MAX_IMAGE_MS = 60 * 60 * 1000;
export const SPEED_MIN = 0.1;
export const SPEED_MAX = 10;

export const clipDuration = (c) => Math.max(1, (c.srcOut - c.srcIn) / (c.speed || 1));

export function mainLayout(project) {
  let t = 0;
  return project.main.map((clip, index) => {
    const start = t;
    t += clipDuration(clip);
    return { clip, index, start, end: t };
  });
}

export function totalDuration(project) {
  return project.main.reduce((sum, c) => sum + clipDuration(c), 0);
}

export function clipStart(project, clipId) {
  const item = mainLayout(project).find((l) => l.clip.id === clipId);
  return item ? item.start : 0;
}

/** t anındaki ana iz klibi. Son karede son klibi döndürür. */
export function clipAt(project, t) {
  const layout = mainLayout(project);
  if (!layout.length) return null;
  const hit = layout.find((l) => t >= l.start && t < l.end) || (t >= layout[layout.length - 1].end ? layout[layout.length - 1] : layout[0]);
  return { ...hit, offset: Math.max(0, Math.min(t - hit.start, hit.end - hit.start)) };
}

const touch = (p) => ({ ...p, updatedAt: Date.now() });

function replaceMain(project, main) {
  return touch({ ...project, main });
}

/** Klip sınırlarına göre en yakın ekleme noktası (indeks). */
export function insertionIndex(project, t) {
  const hit = clipAt(project, t);
  if (!hit) return 0;
  return hit.offset < (hit.end - hit.start) / 2 ? hit.index : hit.index + 1;
}

export function addMediaToProject(project, mediaList, t, options = {}) {
  const media = { ...project.media };
  const clips = [];
  for (const m of mediaList) {
    media[m.id] = m;
    if (m.kind === 'video' || m.kind === 'image') clips.push(createMainClip(m, options));
  }
  const at = t == null ? project.main.length : insertionIndex(project, t);
  const main = [...project.main.slice(0, at), ...clips, ...project.main.slice(at)];
  return { project: touch({ ...project, media, main }), added: clips.map((c) => c.id) };
}

export function updateMain(project, clipId, patch) {
  return replaceMain(
    project,
    project.main.map((c) => (c.id === clipId ? mergeClip(c, patch) : c)),
  );
}

export function updateAllMain(project, patch) {
  return replaceMain(project, project.main.map((c) => mergeClip(c, patch)));
}

function mergeClip(c, patch) {
  const next = { ...c };
  for (const [k, v] of Object.entries(patch)) {
    next[k] = v && typeof v === 'object' && !Array.isArray(v) && c[k] && typeof c[k] === 'object' ? { ...c[k], ...v } : v;
  }
  return next;
}

/** t anında ana izi böler. Kenarlara çok yakınsa değişiklik yapmaz. */
export function splitMainAt(project, t) {
  const hit = clipAt(project, t);
  if (!hit) return { project, changed: false };
  const { clip, offset } = hit;
  const dur = clipDuration(clip);
  if (offset < MIN_CLIP_MS || dur - offset < MIN_CLIP_MS) return { project, changed: false };
  const cut = clip.srcIn + offset * clip.speed;
  const a = { ...clip, srcOut: cut, fadeOut: 0 };
  const b = { ...clip, id: newId('clip'), srcIn: cut, fadeIn: 0, transition: { ...clip.transition, type: 'none' } };
  const main = [...project.main];
  main.splice(hit.index, 1, a, b);
  return { project: replaceMain(project, main), changed: true, newId: b.id };
}

export function deleteMain(project, clipId) {
  return replaceMain(project, project.main.filter((c) => c.id !== clipId));
}

export function duplicateMain(project, clipId) {
  const i = project.main.findIndex((c) => c.id === clipId);
  if (i < 0) return { project, newId: null };
  const copy = { ...project.main[i], id: newId('clip'), transition: { ...project.main[i].transition, type: 'none' } };
  const main = [...project.main];
  main.splice(i + 1, 0, copy);
  return { project: replaceMain(project, main), newId: copy.id };
}

export function moveMain(project, from, to) {
  if (from === to || from < 0 || from >= project.main.length) return project;
  const main = [...project.main];
  const [c] = main.splice(from, 1);
  main.splice(Math.max(0, Math.min(to, main.length)), 0, c);
  return replaceMain(project, main);
}

/**
 * Klibin başını veya sonunu kırpar. `delta` zaman çizelgesi milisaniyesidir
 * (hızla çarpılarak kaynağa çevrilir). Video kaynağın dışına taşamaz.
 */
export function trimMain(project, clipId, edge, delta) {
  const clip = project.main.find((c) => c.id === clipId);
  if (!clip) return project;
  const media = project.media[clip.mediaId];
  const srcDelta = delta * clip.speed;
  const minSrc = MIN_CLIP_MS * clip.speed;
  let { srcIn, srcOut } = clip;
  if (edge === 'start') {
    srcIn = clip.kind === 'image' ? 0 : Math.max(0, Math.min(srcOut - minSrc, srcIn + srcDelta));
    if (clip.kind === 'image') srcOut = Math.max(minSrc, Math.min(MAX_IMAGE_MS, srcOut - srcDelta));
  } else {
    const limit = clip.kind === 'image' ? MAX_IMAGE_MS : media?.durationMs || srcOut;
    srcOut = Math.max(srcIn + minSrc, Math.min(limit, srcOut + srcDelta));
  }
  return updateMain(project, clipId, { srcIn: Math.round(srcIn), srcOut: Math.round(srcOut) });
}

export function setSpeed(project, clipId, speed) {
  const s = Math.max(SPEED_MIN, Math.min(SPEED_MAX, speed));
  return updateMain(project, clipId, { speed: Math.round(s * 100) / 100 });
}

/** Görsel kliplerin süresini doğrudan ayarlar. */
export function setImageDuration(project, clipId, ms) {
  return updateMain(project, clipId, { srcIn: 0, srcOut: Math.round(Math.max(MIN_CLIP_MS, Math.min(MAX_IMAGE_MS, ms))) });
}

/** Videonun sesini ayrı ses katmanına çıkarır ve klibi sessize alır. */
export function extractAudio(project, clipId) {
  const layout = mainLayout(project).find((l) => l.clip.id === clipId);
  if (!layout || layout.clip.kind !== 'video') return { project, newId: null };
  const media = project.media[layout.clip.mediaId];
  if (media && media.hasAudio === false) return { project, newId: null };
  const a = {
    ...createAudioClip(media || { id: layout.clip.mediaId, durationMs: layout.clip.srcOut }, layout.start, 'extracted'),
    srcIn: layout.clip.srcIn,
    srcOut: layout.clip.srcOut,
    speed: layout.clip.speed,
    volume: layout.clip.volume,
  };
  const p = updateMain(project, clipId, { muted: true });
  return { project: touch({ ...p, audio: [...p.audio, a] }), newId: a.id };
}

/** t anındaki kareyi (önceden çıkarılmış görsel) klibin içine 3 sn olarak yerleştirir. */
export function insertFreezeFrame(project, t, imageMedia, durationMs = 3000) {
  const split = splitMainAt(project, t);
  let p = split.project;
  const media = { ...p.media, [imageMedia.id]: imageMedia };
  const clip = { ...createMainClip(imageMedia, { imageDurationMs: durationMs }) };
  const hit = clipAt(p, t);
  let index = hit ? (hit.offset < 1 ? hit.index : hit.index + 1) : p.main.length;
  if (split.changed) index = p.main.findIndex((c) => c.id === split.newId);
  const main = [...p.main];
  main.splice(index, 0, clip);
  p = touch({ ...p, media, main });
  return { project: p, newId: clip.id };
}

export function replaceMedia(project, clipId, media) {
  const clip = project.main.find((c) => c.id === clipId);
  if (!clip) return project;
  const dur = clip.srcOut - clip.srcIn;
  const isImage = media.kind === 'image';
  const srcOut = isImage ? dur : Math.min(media.durationMs || dur, dur);
  const p = { ...project, media: { ...project.media, [media.id]: media } };
  return updateMain(p, clipId, { mediaId: media.id, kind: isImage ? 'image' : 'video', srcIn: 0, srcOut: Math.max(MIN_CLIP_MS, srcOut) });
}

// --- Ses katmanı ---

export const audioDuration = clipDuration;

export function addAudio(project, media, start, role) {
  const a = createAudioClip(media, start, role);
  return { project: touch({ ...project, media: { ...project.media, [media.id]: media }, audio: [...project.audio, a] }), newId: a.id };
}

export function updateAudio(project, id, patch) {
  return touch({ ...project, audio: project.audio.map((a) => (a.id === id ? { ...a, ...patch } : a)) });
}

export function deleteAudio(project, id) {
  return touch({ ...project, audio: project.audio.filter((a) => a.id !== id) });
}

export function duplicateAudio(project, id) {
  const a = project.audio.find((x) => x.id === id);
  if (!a) return { project, newId: null };
  const copy = { ...a, id: newId('aud'), start: a.start + audioDuration(a) };
  return { project: touch({ ...project, audio: [...project.audio, copy] }), newId: copy.id };
}

export function splitAudioAt(project, id, t) {
  const a = project.audio.find((x) => x.id === id);
  if (!a) return { project, changed: false };
  const offset = t - a.start;
  const dur = audioDuration(a);
  if (offset < MIN_CLIP_MS || dur - offset < MIN_CLIP_MS) return { project, changed: false };
  const cut = a.srcIn + offset * a.speed;
  const first = { ...a, srcOut: cut, fadeOut: 0 };
  const second = { ...a, id: newId('aud'), start: Math.round(t), srcIn: cut, fadeIn: 0 };
  return {
    project: touch({ ...project, audio: project.audio.flatMap((x) => (x.id === id ? [first, second] : [x])) }),
    changed: true,
    newId: second.id,
  };
}

export function trimAudio(project, id, edge, delta) {
  const a = project.audio.find((x) => x.id === id);
  if (!a) return project;
  const media = project.media[a.mediaId];
  const srcDelta = delta * a.speed;
  const minSrc = MIN_CLIP_MS * a.speed;
  if (edge === 'start') {
    const srcIn = Math.max(0, Math.min(a.srcOut - minSrc, a.srcIn + srcDelta));
    const moved = (srcIn - a.srcIn) / a.speed;
    return updateAudio(project, id, { srcIn: Math.round(srcIn), start: Math.max(0, Math.round(a.start + moved)) });
  }
  const limit = media?.durationMs || a.srcOut;
  return updateAudio(project, id, { srcOut: Math.round(Math.max(a.srcIn + minSrc, Math.min(limit, a.srcOut + srcDelta))) });
}

/** Çakışmayan ses kliplerini şeritlere dağıtır (aralık bölümleme). */
export function assignAudioLanes(audio) {
  const sorted = [...audio].sort((x, y) => x.start - y.start);
  const laneEnds = [];
  const lanes = [];
  for (const a of sorted) {
    const end = a.start + audioDuration(a);
    let lane = laneEnds.findIndex((e) => e <= a.start + 1);
    if (lane < 0) {
      lane = laneEnds.length;
      laneEnds.push(0);
      lanes.push([]);
    }
    laneEnds[lane] = end;
    lanes[lane].push(a);
  }
  return lanes;
}

// --- Metin katmanı ---

export function addText(project, start, text, style, extra = {}) {
  const item = { ...createText(start, text, style), ...extra };
  return { project: touch({ ...project, texts: [...project.texts, item] }), newId: item.id };
}

export function updateText(project, id, patch) {
  return touch({
    ...project,
    texts: project.texts.map((x) =>
      x.id === id ? { ...x, ...patch, style: patch.style ? { ...x.style, ...patch.style } : x.style } : x,
    ),
  });
}

export function deleteText(project, id) {
  return touch({ ...project, texts: project.texts.filter((x) => x.id !== id) });
}

export function duplicateText(project, id) {
  const x = project.texts.find((tx) => tx.id === id);
  if (!x) return { project, newId: null };
  const copy = { ...x, id: newId('txt'), start: x.start + x.duration };
  return { project: touch({ ...project, texts: [...project.texts, copy] }), newId: copy.id };
}

export function splitTextAt(project, id, t) {
  const x = project.texts.find((tx) => tx.id === id);
  if (!x) return { project, changed: false };
  const offset = t - x.start;
  if (offset < MIN_CLIP_MS || x.duration - offset < MIN_CLIP_MS) return { project, changed: false };
  const a = { ...x, duration: Math.round(offset), animOut: 'none' };
  const b = { ...x, id: newId('txt'), start: Math.round(t), duration: Math.round(x.duration - offset), animIn: 'none' };
  return { project: touch({ ...project, texts: project.texts.flatMap((tx) => (tx.id === id ? [a, b] : [tx])) }), changed: true, newId: b.id };
}

export function trimText(project, id, edge, delta) {
  const x = project.texts.find((tx) => tx.id === id);
  if (!x) return project;
  if (edge === 'start') {
    const d = Math.max(-x.start, Math.min(x.duration - MIN_CLIP_MS, delta));
    return updateText(project, id, { start: Math.round(x.start + d), duration: Math.round(x.duration - d) });
  }
  return updateText(project, id, { duration: Math.round(Math.max(MIN_CLIP_MS, x.duration + delta)) });
}

// --- Efektler: klip efekt yığını ---

export const MAX_CLIP_EFFECTS = 4;

export function addClipEffect(project, clipId, effectId) {
  const clip = project.main.find((c) => c.id === clipId);
  if (!clip) return { project, newId: null };
  if ((clip.effects || []).length >= MAX_CLIP_EFFECTS) return { project, newId: null };
  const inst = createEffectInstance(effectId);
  const effects = [...(clip.effects || []), inst];
  return { project: updateMain(project, clipId, { effects }), newId: inst.id };
}

export function updateClipEffect(project, clipId, instId, patch) {
  const clip = project.main.find((c) => c.id === clipId);
  if (!clip) return project;
  const effects = (clip.effects || []).map((e) => (e.id === instId ? { ...e, ...patch, values: patch.values ? { ...e.values, ...patch.values } : e.values } : e));
  return updateMain(project, clipId, { effects });
}

export function removeClipEffect(project, clipId, instId) {
  const clip = project.main.find((c) => c.id === clipId);
  if (!clip) return project;
  return updateMain(project, clipId, { effects: (clip.effects || []).filter((e) => e.id !== instId) });
}

// --- Efektler: zaman çizelgesindeki efekt katmanları ---

export function addEffectLayer(project, effectId, start, duration = 3000) {
  const layer = createEffectLayer(effectId, start, duration);
  return { project: touch({ ...project, effectLayers: [...(project.effectLayers || []), layer] }), newId: layer.id };
}

export function updateEffectLayer(project, id, patch) {
  return touch({
    ...project,
    effectLayers: (project.effectLayers || []).map((e) => (e.id === id ? { ...e, ...patch, values: patch.values ? { ...e.values, ...patch.values } : e.values } : e)),
  });
}

export function deleteEffectLayer(project, id) {
  return touch({ ...project, effectLayers: (project.effectLayers || []).filter((e) => e.id !== id) });
}

export function duplicateEffectLayer(project, id) {
  const e = (project.effectLayers || []).find((x) => x.id === id);
  if (!e) return { project, newId: null };
  const copy = { ...e, id: newId('fx'), start: e.start + e.duration };
  return { project: touch({ ...project, effectLayers: [...project.effectLayers, copy] }), newId: copy.id };
}

export function trimEffectLayer(project, id, edge, delta) {
  const e = (project.effectLayers || []).find((x) => x.id === id);
  if (!e) return project;
  if (edge === 'start') {
    const d = Math.max(-e.start, Math.min(e.duration - MIN_CLIP_MS, delta));
    return updateEffectLayer(project, id, { start: Math.round(e.start + d), duration: Math.round(e.duration - d) });
  }
  return updateEffectLayer(project, id, { duration: Math.round(Math.max(MIN_CLIP_MS, e.duration + delta)) });
}

export function splitEffectLayerAt(project, id, t) {
  const e = (project.effectLayers || []).find((x) => x.id === id);
  if (!e) return { project, changed: false };
  const offset = t - e.start;
  if (offset < MIN_CLIP_MS || e.duration - offset < MIN_CLIP_MS) return { project, changed: false };
  const a = { ...e, duration: Math.round(offset) };
  const b = { ...e, id: newId('fx'), start: Math.round(t), duration: Math.round(e.duration - offset) };
  return { project: touch({ ...project, effectLayers: project.effectLayers.flatMap((x) => (x.id === id ? [a, b] : [x])) }), changed: true, newId: b.id };
}

// --- İşaretçiler ---

export function toggleMarker(project, t) {
  const near = project.markers.find((m) => Math.abs(m.time - t) < 150);
  const markers = near ? project.markers.filter((m) => m !== near) : [...project.markers, { id: newId('mk'), time: Math.round(t) }];
  return touch({ ...project, markers: markers.sort((a, b) => a.time - b.time) });
}

/** Manyetik hizalama: yakın klip sınırı, işaretçi veya oynatma kafasına yapıştırır. */
export function snapTime(project, t, thresholdMs, extra = []) {
  const points = [0, ...mainLayout(project).map((l) => l.end), ...project.markers.map((m) => m.time), ...extra];
  let best = t;
  let bestD = thresholdMs;
  for (const p of points) {
    const d = Math.abs(p - t);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

/** Projede kullanılan ama dosyası bulunmayan medya. */
export function missingMedia(project, exists) {
  return Object.values(project.media).filter((m) => !exists(m));
}

export function usedMediaIds(project) {
  const ids = new Set();
  project.main.forEach((c) => ids.add(c.mediaId));
  project.audio.forEach((a) => ids.add(a.mediaId));
  return ids;
}
