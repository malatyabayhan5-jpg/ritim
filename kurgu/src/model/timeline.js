// Zaman çizelgesi işlemleri. Hepsi saf fonksiyondur: projeyi değiştirmez,
// yeni proje döndürür (geri al / yinele geçmişi bu sayede basittir).
// Ana iz "manyetiktir": klipler arasında boşluk olmaz. Ses ve metin katmanları
// serbest konumludur.

import { createAudioClip, createMainClip, createOverlay, createText, newId } from './schema';
import { removeKey, setKey, shiftKeyframes, valueAt } from './keyframes';
import { averageSpeed, edgeSpeed, localAt, sourceAt, speedDuration, splitCurve, subCurve } from './speed';
import { createEffectInstance, createEffectLayer } from './effects';

export const MIN_CLIP_MS = 100;
export const MAX_IMAGE_MS = 60 * 60 * 1000;
export const SPEED_MIN = 0.1;
export const SPEED_MAX = 100;

export const clipDuration = speedDuration;

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
    // Anahtar kareler ve hız eğrisi bütün olarak değişir (silinen iz birleştirmeyle geri gelmesin)
    const replace = k === 'keyframes' || k === 'speedCurve' || k === 'reversed' || k === 'audioFx';
    next[k] = !replace && v && typeof v === 'object' && !Array.isArray(v) && c[k] && typeof c[k] === 'object' ? { ...c[k], ...v } : v;
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
  const cut = Math.round(sourceAt(clip, offset));
  const a = { ...clip, srcOut: cut, fadeOut: 0 };
  const b = { ...clip, id: newId('clip'), srcIn: cut, fadeIn: 0, transition: { ...clip.transition, type: 'none' } };
  if (clip.speedCurve) [a.speedCurve, b.speedCurve] = splitCurve(clip.speedCurve, (cut - clip.srcIn) / (clip.srcOut - clip.srcIn));
  if (clip.keyframes) {
    a.keyframes = shiftKeyframes(clip.keyframes, 0, offset);
    b.keyframes = shiftKeyframes(clip.keyframes, -offset, dur - offset);
  }
  const main = [...project.main];
  main.splice(hit.index, 1, a, b);
  return { project: replaceMain(project, main), changed: true, newId: b.id };
}

/**
 * Klibi kaynak zamanındaki noktalardan böler (sahne algılama). Klibin dışındaki
 * ya da kenara MIN_CLIP_MS'den yakın noktalar atlanır.
 */
export function splitMainAtSourceTimes(project, clipId, timesMs) {
  const i = project.main.findIndex((c) => c.id === clipId);
  if (i < 0) return { project, added: 0 };
  const clip = project.main[i];
  const minSrc = MIN_CLIP_MS * averageSpeed(clip);
  const cuts = [...new Set(timesMs.map(Math.round))]
    .filter((t) => t > clip.srcIn + minSrc && t < clip.srcOut - minSrc)
    .sort((a, b) => a - b)
    .filter((t, k, arr) => k === 0 || t - arr[k - 1] >= minSrc);
  if (!cuts.length) return { project, added: 0 };
  const bounds = [clip.srcIn, ...cuts, clip.srcOut];
  const pieces = bounds.slice(0, -1).map((srcIn, k) => ({
    ...clip,
    id: k === 0 ? clip.id : newId('clip'),
    srcIn,
    srcOut: bounds[k + 1],
    fadeIn: k === 0 ? clip.fadeIn : 0,
    fadeOut: k === bounds.length - 2 ? clip.fadeOut : 0,
    transition: k === 0 ? clip.transition : { ...clip.transition, type: 'none' },
    ...(clip.speedCurve ? { speedCurve: subCurve(clip.speedCurve, (srcIn - clip.srcIn) / (clip.srcOut - clip.srcIn), (bounds[k + 1] - clip.srcIn) / (clip.srcOut - clip.srcIn)) } : {}),
    ...(clip.keyframes ? { keyframes: shiftKeyframes(clip.keyframes, -localAt(clip, srcIn), localAt(clip, bounds[k + 1]) - localAt(clip, srcIn)) } : {}),
  }));
  const main = [...project.main];
  main.splice(i, 1, ...pieces);
  return { project: replaceMain(project, main), added: pieces.length - 1 };
}

/**
 * Klipten kaynak zamanı aralıklarını çıkarır (sessizlik kaldırma). Kalan parçalar
 * sırayla ana ize yerleşir; MIN_CLIP_MS'den kısa parçalar atılır.
 * @returns {{ project, removedMs: number, pieces: number }}
 */
export function removeSourceRanges(project, clipId, ranges) {
  const i = project.main.findIndex((c) => c.id === clipId);
  if (i < 0) return { project, removedMs: 0, pieces: 0 };
  const clip = project.main[i];
  const minSrc = MIN_CLIP_MS * averageSpeed(clip);
  const keep = [];
  let cursor = clip.srcIn;
  for (const r of [...ranges].sort((a, b) => a.start - b.start)) {
    const s = Math.max(clip.srcIn, r.start);
    const e = Math.min(clip.srcOut, r.end);
    if (e <= s) continue;
    if (s - cursor >= minSrc) keep.push([cursor, s]);
    cursor = Math.max(cursor, e);
  }
  if (clip.srcOut - cursor >= minSrc) keep.push([cursor, clip.srcOut]);
  if (!keep.length) return { project, removedMs: 0, pieces: 1 };
  const before = clipDuration(clip);
  const pieces = keep.map(([srcIn, srcOut], k) => ({
    ...clip,
    id: k === 0 ? clip.id : newId('clip'),
    srcIn: Math.round(srcIn),
    srcOut: Math.round(srcOut),
    fadeIn: k === 0 ? clip.fadeIn : 0,
    fadeOut: k === keep.length - 1 ? clip.fadeOut : 0,
    transition: k === 0 ? clip.transition : { ...clip.transition, type: 'none' },
    ...(clip.speedCurve ? { speedCurve: subCurve(clip.speedCurve, (srcIn - clip.srcIn) / (clip.srcOut - clip.srcIn), (srcOut - clip.srcIn) / (clip.srcOut - clip.srcIn)) } : {}),
    ...(clip.keyframes ? { keyframes: shiftKeyframes(clip.keyframes, -localAt(clip, srcIn), localAt(clip, srcOut) - localAt(clip, srcIn)) } : {}),
  }));
  const after = pieces.reduce((sum, c) => sum + clipDuration(c), 0);
  if (before - after < 1) return { project, removedMs: 0, pieces: 1 };
  const main = [...project.main];
  main.splice(i, 1, ...pieces);
  return { project: replaceMain(project, main), removedMs: Math.round(before - after), pieces: pieces.length };
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
  const srcDelta = delta * edgeSpeed(clip, edge);
  const minSrc = MIN_CLIP_MS * averageSpeed(clip);
  let { srcIn, srcOut } = clip;
  if (edge === 'start') {
    srcIn = clip.kind === 'image' ? 0 : Math.max(0, Math.min(srcOut - minSrc, srcIn + srcDelta));
    if (clip.kind === 'image') srcOut = Math.max(minSrc, Math.min(MAX_IMAGE_MS, srcOut - srcDelta));
  } else {
    const limit = clip.kind === 'image' ? MAX_IMAGE_MS : media?.durationMs || srcOut;
    srcOut = Math.max(srcIn + minSrc, Math.min(limit, srcOut + srcDelta));
  }
  const patch = { srcIn: Math.round(srcIn), srcOut: Math.round(srcOut) };
  if (clip.keyframes && clip.kind !== 'image') {
    // Kareler klip içi zamana göredir: baştan kırpınca kayar, sondan kırpınca sınırlanır
    const shift = edge === 'start' ? -localAt(clip, patch.srcIn) : 0;
    patch.keyframes = shiftKeyframes(clip.keyframes, shift, speedDuration({ ...clip, ...patch }));
  }
  return updateMain(project, clipId, patch);
}

export function setSpeed(project, clipId, speed) {
  const s = Math.max(SPEED_MIN, Math.min(SPEED_MAX, speed));
  return updateMain(project, clipId, { speed: Math.round(s * 100) / 100, speedCurve: null });
}

/** Hız eğrisi (null = sabit hıza dön). */
export function setSpeedCurve(project, clipId, curve) {
  return updateMain(project, clipId, { speedCurve: curve });
}

/**
 * Ters oynatma. `reversedMedia` klibin [srcIn, srcOut] aralığının ters kodlanmış
 * kopyasıdır (reverseOf ile işaretli). Klip ters medyaya bağlanır; hız eğrisi
 * aynalanır, anahtar kareler (çıktı zamanına göre) aynen kalır. Klip zaten ters
 * ise özgün medyaya geri döner (yeniden kodlama gerekmez).
 */
export function reverseMain(project, clipId, reversedMedia) {
  const clip = project.main.find((c) => c.id === clipId);
  if (!clip || clip.kind !== 'video') return project;
  const mirror = (curve) => (curve?.points ? { preset: null, points: [...curve.points].reverse().map((p) => ({ x: Math.round((1 - p.x) * 1e5) / 1e5, v: p.v })) } : curve ?? null);
  if (clip.reversed) {
    const r = clip.reversed;
    return updateMain(project, clipId, { mediaId: r.mediaId, srcIn: r.srcIn, srcOut: r.srcOut, reversed: null, speedCurve: mirror(clip.speedCurve) });
  }
  if (!reversedMedia) return project;
  const p = touch({ ...project, media: { ...project.media, [reversedMedia.id]: reversedMedia } });
  return updateMain(p, clipId, {
    mediaId: reversedMedia.id,
    srcIn: 0,
    srcOut: Math.max(MIN_CLIP_MS, Math.round(reversedMedia.durationMs)),
    reversed: { mediaId: clip.mediaId, srcIn: clip.srcIn, srcOut: clip.srcOut },
    speedCurve: mirror(clip.speedCurve),
  });
}

/** Aynı kaynak aralığının daha önce üretilmiş ters kopyası (yeniden kullanım için). */
export function findReversedMedia(project, mediaId, srcIn, srcOut) {
  return Object.values(project.media).find((m) => m.reverseOf && m.reverseOf.mediaId === mediaId && Math.abs(m.reverseOf.srcIn - srcIn) < 2 && Math.abs(m.reverseOf.srcOut - srcOut) < 2) || null;
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
    speedCurve: layout.clip.speedCurve || null,
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
  // Ters çevrilmiş klibin özgün medya kaydı da düşer: yoksa sonraki "ters" eski videoya dönerdi
  return updateMain(p, clipId, { mediaId: media.id, kind: isImage ? 'image' : 'video', srcIn: 0, srcOut: Math.max(MIN_CLIP_MS, srcOut), reversed: null });
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
  const first = { ...a, srcOut: cut, fadeOut: 0, ...(a.keyframes ? { keyframes: shiftKeyframes(a.keyframes, 0, offset) } : {}) };
  const second = { ...a, id: newId('aud'), start: Math.round(t), srcIn: cut, fadeIn: 0, ...(a.keyframes ? { keyframes: shiftKeyframes(a.keyframes, -offset, dur - offset) } : {}) };
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
    const patch = { srcIn: Math.round(srcIn), start: Math.max(0, Math.round(a.start + moved)) };
    if (a.keyframes) patch.keyframes = shiftKeyframes(a.keyframes, -moved, audioDuration({ ...a, ...patch }));
    return updateAudio(project, id, patch);
  }
  const limit = media?.durationMs || a.srcOut;
  const patch = { srcOut: Math.round(Math.max(a.srcIn + minSrc, Math.min(limit, a.srcOut + srcDelta))) };
  if (a.keyframes) patch.keyframes = shiftKeyframes(a.keyframes, 0, audioDuration({ ...a, ...patch }));
  return updateAudio(project, id, patch);
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

/**
 * Yeni süreli öğenin (metin, efekt katmanı) yerleşimi: oynatma kafasından başlar,
 * ama videonun dışına taşmaz. Oynatma kafası sondaysa öğe sona hizalanır;
 * video istenen süreden kısaysa süre videoya eşitlenir. Boş projede dokunulmaz.
 */
export function fitToTimeline(project, start, duration) {
  const total = totalDuration(project);
  if (!(total > 0)) return { start: Math.max(0, Math.round(start)), duration };
  const d = Math.max(MIN_CLIP_MS, Math.min(duration, total));
  const s = Math.max(0, Math.min(start, total - d));
  return { start: Math.round(s), duration: Math.round(d) };
}

export function addText(project, start, text, style, extra = {}) {
  const base = createText(start, text, style);
  const fit = fitToTimeline(project, base.start, base.duration);
  const item = { ...base, ...fit, ...extra };
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
  const kf = (shift, dur) => (x.keyframes ? { keyframes: shiftKeyframes(x.keyframes, shift, dur) } : {});
  const a = { ...x, duration: Math.round(offset), animOut: 'none', ...kf(0, offset) };
  const b = { ...x, id: newId('txt'), start: Math.round(t), duration: Math.round(x.duration - offset), animIn: 'none', ...kf(-offset, x.duration - offset) };
  return { project: touch({ ...project, texts: project.texts.flatMap((tx) => (tx.id === id ? [a, b] : [tx])) }), changed: true, newId: b.id };
}

export function trimText(project, id, edge, delta) {
  const x = project.texts.find((tx) => tx.id === id);
  if (!x) return project;
  if (edge === 'start') {
    const d = Math.max(-x.start, Math.min(x.duration - MIN_CLIP_MS, delta));
    // Anahtar kareler ekranda yerinde kalır (metin başına göre kaydırılır)
    const kf = x.keyframes ? { keyframes: shiftKeyframes(x.keyframes, -d, x.duration - d) } : {};
    return updateText(project, id, { start: Math.round(x.start + d), duration: Math.round(x.duration - d), ...kf });
  }
  const dur = Math.round(Math.max(MIN_CLIP_MS, x.duration + delta));
  return updateText(project, id, { duration: dur, ...(x.keyframes ? { keyframes: shiftKeyframes(x.keyframes, 0, dur) } : {}) });
}

// Metin anahtar kareleri: konum/ölçek/döndürme/opaklık; zamanlar metnin başına göre ms.
const TEXT_BASE = {
  x: (x) => x.x ?? 0,
  y: (x) => x.y ?? 0,
  scale: (x) => x.scale ?? 1,
  rotation: (x) => x.rotation ?? 0,
  opacity: (x) => x.style?.opacity ?? 1,
};

export function textPropAt(x, prop, localMs) {
  return valueAt(x.keyframes?.[prop], localMs, TEXT_BASE[prop](x));
}

/** Metnin `localMs` anındaki konum/ölçek/döndürme değerleri (tutamaç ve önizleme için). */
export function textValuesAt(x, localMs) {
  return { x: textPropAt(x, 'x', localMs), y: textPropAt(x, 'y', localMs), scale: textPropAt(x, 'scale', localMs), rotation: textPropAt(x, 'rotation', localMs) };
}

export function textPropPatch(x, prop, value, localMs) {
  const track = x.keyframes?.[prop];
  if (track && track.length) return { keyframes: { ...x.keyframes, [prop]: setKey(track, localMs, value) } };
  return prop === 'opacity' ? { style: { opacity: value } } : { [prop]: value };
}

export function toggleTextKey(x, prop, localMs) {
  const track = x.keyframes?.[prop] || [];
  const v = textPropAt(x, prop, localMs);
  const exists = track.some((k) => Math.abs(k.t - localMs) <= 15);
  const next = exists ? removeKey(track, localMs) : setKey(track, localMs, v);
  const keyframes = { ...x.keyframes };
  if (next.length) keyframes[prop] = next;
  else delete keyframes[prop];
  const patch = { keyframes };
  if (!next.length) Object.assign(patch, prop === 'opacity' ? { style: { opacity: v } } : { [prop]: v });
  return patch;
}

// --- Üst katmanlar (resim içinde resim) ---

export const overlayDuration = clipDuration;
export const MAX_OVERLAY_LANES = 6;

function laneFree(project, lane, start, end, ignoreId) {
  return !(project.overlays || []).some(
    (o) => o.id !== ignoreId && o.lane === lane && start < o.start + overlayDuration(o) - 1 && o.start < end - 1,
  );
}

/** [start, end) aralığının boş olduğu en alttaki şerit; yoksa yeni şerit (üst sınıra kadar). */
export function freeOverlayLane(project, start, end, ignoreId) {
  const lanes = new Set((project.overlays || []).map((o) => o.lane));
  const max = lanes.size ? Math.max(...lanes) : -1;
  for (let l = 0; l <= max; l++) if (laneFree(project, l, start, end, ignoreId)) return l;
  return max + 1 < MAX_OVERLAY_LANES ? max + 1 : -1;
}

export function addOverlay(project, media, start) {
  const base = createOverlay(media, start, 0);
  const d = overlayDuration(base);
  const total = totalDuration(project);
  // Videonun dışına başlamasın; süre videoyu aşarsa sonda kırpılır (render tanımı).
  const s = total > 0 ? Math.max(0, Math.min(Math.round(start), Math.round(total - Math.min(d, total)))) : Math.max(0, Math.round(start));
  const lane = freeOverlayLane(project, s, s + d);
  if (lane < 0) return { project, newId: null, error: 'LANES_FULL' };
  const item = { ...base, start: s, lane };
  return {
    project: touch({ ...project, media: { ...project.media, [media.id]: media }, overlays: [...(project.overlays || []), item] }),
    newId: item.id,
  };
}

export function updateOverlay(project, id, patch) {
  const merge = (o) => {
    const out = { ...o, ...patch };
    for (const k of ['transform', 'crop', 'mask', 'chroma', 'filter', 'adjust']) {
      if (patch[k]) out[k] = { ...o[k], ...patch[k] };
    }
    return out;
  };
  return touch({ ...project, overlays: (project.overlays || []).map((o) => (o.id === id ? merge(o) : o)) });
}

export function deleteOverlay(project, id) {
  return touch({ ...project, overlays: (project.overlays || []).filter((o) => o.id !== id) });
}

export function duplicateOverlay(project, id) {
  const o = (project.overlays || []).find((x) => x.id === id);
  if (!o) return { project, newId: null };
  const start = o.start + overlayDuration(o);
  const lane = laneFree(project, o.lane, start, start + overlayDuration(o)) ? o.lane : freeOverlayLane(project, start, start + overlayDuration(o));
  if (lane < 0) return { project, newId: null, error: 'LANES_FULL' };
  const copy = { ...o, id: newId('ovl'), start, lane };
  return { project: touch({ ...project, overlays: [...project.overlays, copy] }), newId: copy.id };
}

/** Katmanı zamanda ve/veya şeritte taşır; hedef doluysa başka boş şerit aranır. */
export function moveOverlay(project, id, start, lane) {
  const o = (project.overlays || []).find((x) => x.id === id);
  if (!o) return project;
  const s = Math.max(0, Math.round(start));
  const end = s + overlayDuration(o);
  const want = lane ?? o.lane;
  const target = want >= 0 && want < MAX_OVERLAY_LANES && laneFree(project, want, s, end, id) ? want : freeOverlayLane(project, s, end, id);
  if (target < 0) return project;
  return updateOverlay(project, id, { start: s, lane: target });
}

export function splitOverlayAt(project, id, t) {
  const o = (project.overlays || []).find((x) => x.id === id);
  if (!o) return { project, changed: false };
  const offset = t - o.start;
  const dur = overlayDuration(o);
  if (offset < MIN_CLIP_MS || dur - offset < MIN_CLIP_MS) return { project, changed: false };
  const speed = o.kind === 'image' ? 1 : o.speed || 1;
  const cut = o.srcIn + offset * speed;
  const a = { ...o, srcOut: cut, fadeOut: 0, keyframes: shiftKeyframes(o.keyframes, 0, offset) };
  const b = { ...o, id: newId('ovl'), start: Math.round(t), srcIn: cut, fadeIn: 0, keyframes: shiftKeyframes(o.keyframes, -offset, dur - offset) };
  return { project: touch({ ...project, overlays: project.overlays.flatMap((x) => (x.id === id ? [a, b] : [x])) }), changed: true, newId: b.id };
}

export function trimOverlay(project, id, edge, delta, sourceDurationMs = Infinity) {
  const o = (project.overlays || []).find((x) => x.id === id);
  if (!o) return project;
  const speed = o.kind === 'image' ? 1 : o.speed || 1;
  const dur = overlayDuration(o);
  if (edge === 'start') {
    const d = Math.max(Math.max(-o.start, o.kind === 'image' ? -Infinity : -o.srcIn / speed), Math.min(dur - MIN_CLIP_MS, delta));
    const next = { start: Math.round(o.start + d), srcIn: o.kind === 'image' ? o.srcIn : o.srcIn + d * speed };
    if (o.kind === 'image') next.srcOut = o.srcOut - d;
    if (!laneFree(project, o.lane, next.start, next.start + dur - d, id)) return project;
    return updateOverlay(project, id, { ...next, keyframes: shiftKeyframes(o.keyframes, -d, dur - d) });
  }
  const maxOut = o.kind === 'image' ? MAX_IMAGE_MS : sourceDurationMs;
  const srcOut = Math.min(maxOut, Math.max(o.srcIn + MIN_CLIP_MS * speed, o.srcOut + delta * speed));
  const newDur = (srcOut - o.srcIn) / speed;
  if (!laneFree(project, o.lane, o.start, o.start + newDur, id)) return project;
  return updateOverlay(project, id, { srcOut, keyframes: shiftKeyframes(o.keyframes, 0, newDur) });
}

const OVERLAY_BASE = {
  x: (o) => o.transform?.x ?? 0,
  y: (o) => o.transform?.y ?? 0,
  scale: (o) => o.transform?.scale ?? 0.5,
  rotation: (o) => o.transform?.rotation ?? 0,
  opacity: (o) => o.opacity ?? 1,
};

/** Özelliğin katman içi `localMs` anındaki değeri (anahtar kare varsa izden). */
export function overlayPropAt(o, prop, localMs) {
  return valueAt(o.keyframes?.[prop], localMs, OVERLAY_BASE[prop](o));
}

/**
 * Özellik değişikliği yaması: özellikte anahtar kare izi varsa oynatma kafasındaki
 * kare eklenir/güncellenir, yoksa sabit değer değişir.
 */
export function overlayPropPatch(o, prop, value, localMs) {
  const track = o.keyframes?.[prop];
  if (track && track.length) return { keyframes: { ...o.keyframes, [prop]: setKey(track, localMs, value) } };
  if (prop === 'opacity') return { opacity: value };
  return { transform: { [prop]: value } };
}

/** Oynatma kafasında anahtar kare aç/kapat. İlk kare açılırken mevcut değer kullanılır. */
export function toggleOverlayKey(o, prop, localMs) {
  const track = o.keyframes?.[prop] || [];
  const v = overlayPropAt(o, prop, localMs);
  const exists = track.some((k) => Math.abs(k.t - localMs) <= 15);
  const next = exists ? removeKey(track, localMs) : setKey(track, localMs, v);
  const keyframes = { ...o.keyframes };
  if (next.length) keyframes[prop] = next;
  else delete keyframes[prop];
  // İz kalmadıysa son değer sabit değere yazılır (görüntü sıçramasın).
  const patch = { keyframes };
  if (!next.length) Object.assign(patch, prop === 'opacity' ? { opacity: v } : { transform: { [prop]: v } });
  return patch;
}

/** İki katman şeridinin sırasını değiştirir (öne getir / arkaya gönder). */
export function swapOverlayLanes(project, a, b) {
  if (a === b || a < 0 || b < 0 || a >= MAX_OVERLAY_LANES || b >= MAX_OVERLAY_LANES) return project;
  return touch({
    ...project,
    overlays: (project.overlays || []).map((o) => (o.lane === a ? { ...o, lane: b } : o.lane === b ? { ...o, lane: a } : o)),
  });
}

// --- Ana iz anahtar kareleri (konum, ölçek, serbest açı, opaklık) ---

export const MAIN_KEY_PROPS = ['x', 'y', 'scale', 'angle', 'opacity'];
const MAIN_BASE = {
  x: (c) => c.transform?.x ?? 0,
  y: (c) => c.transform?.y ?? 0,
  scale: (c) => c.transform?.scale ?? 1,
  angle: (c) => c.transform?.angle ?? 0,
  opacity: (c) => c.opacity ?? 1,
};

export function mainPropAt(clip, prop, localMs) {
  return valueAt(clip.keyframes?.[prop], localMs, MAIN_BASE[prop](clip));
}

export function mainPropPatch(clip, prop, value, localMs) {
  const track = clip.keyframes?.[prop];
  if (track && track.length) return { keyframes: { ...clip.keyframes, [prop]: setKey(track, localMs, value) } };
  return prop === 'opacity' ? { opacity: value } : { transform: { [prop]: value } };
}

export function toggleMainKey(clip, prop, localMs) {
  const track = clip.keyframes?.[prop] || [];
  const v = mainPropAt(clip, prop, localMs);
  const exists = track.some((k) => Math.abs(k.t - localMs) <= 15);
  const next = exists ? removeKey(track, localMs) : setKey(track, localMs, v);
  const keyframes = { ...clip.keyframes };
  if (next.length) keyframes[prop] = next;
  else delete keyframes[prop];
  const patch = { keyframes };
  if (!next.length) Object.assign(patch, prop === 'opacity' ? { opacity: v } : { transform: { [prop]: v } });
  return patch;
}

// --- LUT (.cube) ---

/** İçe aktarılan LUT'u projeye ekler; LUT dosyası kütüphanede (media/) tutulur. */
export function addLut(project, lut) {
  return touch({ ...project, luts: { ...(project.luts || {}), [lut.id]: lut } });
}

export function setClipLut(project, clipId, lutId, intensity = 1) {
  return updateMain(project, clipId, { lut: lutId ? { id: lutId, intensity } : null });
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
  const fit = fitToTimeline(project, start, duration);
  const layer = createEffectLayer(effectId, fit.start, fit.duration);
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
  (project.overlays || []).forEach((o) => ids.add(o.mediaId));
  return ids;
}

// --- Ses düzeyi anahtar kareleri (ana iz klipleri ve ses öğeleri; zaman öğe içi ms) ---

export function volumeAt(item, localMs) {
  return valueAt(item.keyframes?.volume, localMs, item.volume ?? 1);
}

/** Kaydırıcı değişikliği: iz varsa oynatma kafasındaki kare, yoksa sabit düzey. */
export function volumePatch(item, value, localMs) {
  const track = item.keyframes?.volume;
  if (track && track.length) return { keyframes: { ...item.keyframes, volume: setKey(track, localMs, value) }, muted: false };
  return { volume: value, muted: false };
}

export function toggleVolumeKey(item, localMs) {
  const track = item.keyframes?.volume || [];
  const v = volumeAt(item, localMs);
  const exists = track.some((k) => Math.abs(k.t - localMs) <= 15);
  const next = exists ? removeKey(track, localMs) : setKey(track, localMs, v);
  const keyframes = { ...item.keyframes };
  if (next.length) keyframes.volume = next;
  else delete keyframes.volume;
  return next.length ? { keyframes } : { keyframes, volume: v };
}

// --- Önizleme altındaki anahtar kare düğmesi (tüm özellikler birlikte) ---

const KEY_TARGETS = {
  main: { props: MAIN_KEY_PROPS, toggle: toggleMainKey, get: (p, id) => p.main.find((c) => c.id === id), update: updateMain },
  overlay: { props: Object.keys(OVERLAY_BASE), toggle: toggleOverlayKey, get: (p, id) => (p.overlays || []).find((o) => o.id === id), update: updateOverlay },
  text: { props: Object.keys(TEXT_BASE), toggle: toggleTextKey, get: (p, id) => p.texts.find((x) => x.id === id), update: updateText },
};

const keyOn = (item, prop, localMs) => (item.keyframes?.[prop] || []).some((k) => Math.abs(k.t - localMs) <= 15);

/** Seçili öğenin (`main`, `overlay`, `text`) herhangi bir özelliğinde `localMs` anında kare var mı. */
export function hasAnyKeyAt(project, type, id, localMs) {
  const tg = KEY_TARGETS[type];
  const item = tg && tg.get(project, id);
  return !!item && tg.props.some((k) => keyOn(item, k, localMs));
}

/**
 * Kare yoksa tüm özelliklere o anki değerleriyle kare ekler; varsa o andaki kareleri kaldırır.
 * İzi boşalan özellik son değerinde sabit kalır (toggle*Key ile aynı).
 */
export function toggleAllKeys(project, type, id, localMs) {
  const tg = KEY_TARGETS[type];
  let item = tg && tg.get(project, id);
  if (!item) return project;
  const remove = tg.props.some((k) => keyOn(item, k, localMs));
  let next = project;
  for (const k of tg.props) {
    if (keyOn(item, k, localMs) !== remove) continue;
    next = tg.update(next, id, tg.toggle(item, k, localMs));
    item = tg.get(next, id);
  }
  return next;
}

/** Oynatma kafasındaki karelerin yumuşatması (kareden sonraki geçişin eğrisi); kare yoksa null. */
export function keyEasingAt(project, type, id, localMs) {
  const tg = KEY_TARGETS[type];
  const item = tg && tg.get(project, id);
  if (!item) return null;
  for (const k of tg.props) {
    const f = (item.keyframes?.[k] || []).find((x) => Math.abs(x.t - localMs) <= 15);
    if (f) return f.e || 'linear';
  }
  return null;
}

/** Oynatma kafasındaki tüm özellik karelerinin yumuşatmasını `e` yapar. */
export function setKeysEasing(project, type, id, localMs, e) {
  const tg = KEY_TARGETS[type];
  const item = tg && tg.get(project, id);
  if (!item) return project;
  const keyframes = { ...item.keyframes };
  let changed = false;
  for (const k of tg.props) {
    const track = keyframes[k];
    if (!track) continue;
    const i = track.findIndex((x) => Math.abs(x.t - localMs) <= 15);
    if (i < 0) continue;
    keyframes[k] = track.map((x, j) => (j === i ? { ...x, e } : x));
    changed = true;
  }
  return changed ? tg.update(project, id, { keyframes }) : project;
}
