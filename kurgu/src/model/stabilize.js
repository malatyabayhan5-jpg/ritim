// Video sabitleme: yerel ölçerin örnekler arası genel kayması (MotionTracker.stabilize)
// birikimli kamera yoluna çevrilir, zamanda Gauss ile yumuşatılır; ham yol ile yumuşak yol
// arasındaki fark ana klibin konum anahtar karelerine yazılır. Kenarların görünmemesi için
// klip `zoom` kadar büyütülür ve düzeltme bu payla sınırlanır. Yalnızca kayma düzeltilir,
// dönme ve perspektif düzeltilmez.

import { localAt } from './speed';
import { mainPropAt } from './timeline';
import { geometry, simplify, videoToCanvas } from './tracking';

export const STAB_LEVELS = [
  { id: 'low', sigmaMs: 250, zoom: 1.05 },
  { id: 'medium', sigmaMs: 600, zoom: 1.1 },
  { id: 'high', sigmaMs: 1400, zoom: 1.15 },
];
export const STAB_LEVEL_IDS = STAB_LEVELS.map((l) => l.id);
/** Bu güvenin altındaki adımlar (düz görüntü, sahne geçişi) hareketsiz sayılır. */
export const STAB_MIN_CONF = 0.15;

export function stabLevel(id) {
  return STAB_LEVELS.find((l) => l.id === id) || STAB_LEVELS[1];
}

/** Örnekler [{ t, dx, dy, c }] -> birikimli yol [{ t, x, y }] (görünen kare kesri). */
export function cameraPath(samples) {
  let x = 0;
  let y = 0;
  let low = 0;
  const path = samples.map((s, i) => {
    if (i > 0) {
      if (s.c >= STAB_MIN_CONF) {
        x += s.dx;
        y += s.dy;
      } else low++;
    }
    return { t: s.t, x, y };
  });
  return { path, low };
}

// Uçtaki pencereye (σ ms) en küçük kareler doğrusu oturtulup uç anındaki değeri alınır.
function endAnchor(path, from, dir, sigmaMs) {
  const t0 = path[from].t;
  let n = 0;
  let st = 0;
  let sx = 0;
  let sy = 0;
  let stt = 0;
  let stx = 0;
  let sty = 0;
  for (let i = from; i >= 0 && i < path.length && Math.abs(path[i].t - t0) <= sigmaMs; i += dir) {
    const t = path[i].t - t0;
    n++;
    st += t;
    sx += path[i].x;
    sy += path[i].y;
    stt += t * t;
    stx += t * path[i].x;
    sty += t * path[i].y;
  }
  const den = n * stt - st * st;
  if (n < 3 || den <= 1e-9) return { x: path[from].x, y: path[from].y };
  // Doğrunun t = 0'daki değeri (kesişim)
  return { x: (sx * stt - st * stx) / den, y: (sy * stt - st * sty) / den };
}

/**
 * Gauss yumuşatma (σ ms). Uçlarda yol, uç penceresine oturtulan doğrunun uç değerine göre
 * tek yansıtılır: sabit hızlı kaydırma uçlarda da gecikmeden izlenir, uçtaki tek bir
 * titreşim yansımayla büyümez.
 */
export function smoothPath(path, sigmaMs) {
  const n = path.length;
  if (n < 3 || sigmaMs <= 0) return path.map((p) => ({ ...p }));
  const a0 = endAnchor(path, 0, 1, sigmaMs);
  const a1 = endAnchor(path, n - 1, -1, sigmaMs);
  const at = (i) => {
    if (i < 0) {
      const m = path[Math.min(n - 1, -i)];
      return { t: 2 * path[0].t - m.t, x: 2 * a0.x - m.x, y: 2 * a0.y - m.y };
    }
    if (i >= n) {
      const m = path[Math.max(0, 2 * (n - 1) - i)];
      return { t: 2 * path[n - 1].t - m.t, x: 2 * a1.x - m.x, y: 2 * a1.y - m.y };
    }
    return path[i];
  };
  const step = Math.max(1, (path[n - 1].t - path[0].t) / (n - 1));
  const R = Math.min(n - 1, Math.ceil((3 * sigmaMs) / step));
  return path.map((p, i) => {
    let w = 0;
    let x = 0;
    let y = 0;
    for (let k = -R; k <= R; k++) {
      const q = at(i + k);
      const d = (q.t - p.t) / sigmaMs;
      const g = Math.exp(-0.5 * d * d);
      w += g;
      x += q.x * g;
      y += q.y * g;
    }
    return { t: p.t, x: x / w, y: y / w };
  });
}

/** Sabitlemeyi kaldırır: konum izleri silinir, büyütme geri alınır. */
export function removeStabilizePatch(clip) {
  const st = clip.stabilize;
  if (!st) return null;
  const keyframes = { ...clip.keyframes };
  delete keyframes.x;
  delete keyframes.y;
  const patch = { stabilize: null, keyframes };
  if (keyframes.scale?.length) keyframes.scale = keyframes.scale.map((k) => ({ ...k, v: k.v / st.zoom }));
  else patch.transform = { scale: (clip.transform?.scale ?? 1) / st.zoom };
  return patch;
}

function withPatch(clip, patch) {
  if (!patch) return clip;
  return { ...clip, ...patch, transform: { ...clip.transform, ...patch.transform } };
}

/**
 * Ölçer örneklerinden ana klip yaması: konum anahtar kareleri, büyütme, `stabilize` bilgisi.
 * Önceki sabitleme önce kaldırılır (büyütme katlanmasın). Kullanıcının elle koyduğu konum
 * kareleri yerine sabitleme kareleri yazılır.
 * @returns { patch, keys, clamped, low } ya da yeterli örnek yoksa null
 */
export function stabilizePatch(samples, { clip, media, canvas, level = 'medium' }) {
  if (!samples || samples.length < 3) return null;
  const L = stabLevel(level);
  const base = withPatch(clip, removeStabilizePatch(clip));
  const keyframes = { ...base.keyframes };
  delete keyframes.x;
  delete keyframes.y;
  const zoomed = { ...base, keyframes, transform: { ...base.transform, x: 0, y: 0 } };
  if (keyframes.scale?.length) keyframes.scale = keyframes.scale.map((k) => ({ ...k, v: k.v * L.zoom }));
  else zoomed.transform.scale = (base.transform?.scale ?? 1) * L.zoom;

  const { path, low } = cameraPath(samples);
  const smooth = smoothPath(path, L.sigmaMs);
  const g = geometry(zoomed, media, canvas);
  const bx = base.transform?.x ?? 0;
  const by = base.transform?.y ?? 0;
  let clamped = 0;
  const pts = [];
  for (let i = 0; i < path.length; i++) {
    const t = Math.round(localAt(clip, path[i].t));
    if (pts.length && t <= pts[pts.length - 1].t) continue;
    const S = mainPropAt(zoomed, 'scale', t);
    // Kenar görünmeden kaydırılabilecek pay (NDC); sığdırmada bant olan eksende büyütme payı
    const lx = Math.max(g.fw * S - 1, (S - 1) * g.fw, 0);
    const ly = Math.max(g.fh * S - 1, (S - 1) * g.fh, 0);
    const c0 = videoToCanvas(0.5, 0.5, zoomed, media, canvas, t);
    const c1 = videoToCanvas(0.5 + smooth[i].x - path[i].x, 0.5 + smooth[i].y - path[i].y, zoomed, media, canvas, t);
    let ox = c1.x - c0.x;
    let oy = c1.y - c0.y;
    if (Math.abs(ox) > lx || Math.abs(oy) > ly) clamped++;
    ox = Math.max(-lx, Math.min(lx, ox));
    oy = Math.max(-ly, Math.min(ly, oy));
    pts.push({ t, x: bx + ox, y: by + oy });
  }
  if (pts.length < 2) return null;
  const r4 = (v) => Math.round(v * 10000) / 10000;
  const kept = simplify(pts, 0.002);
  const patch = {
    keyframes: {
      ...keyframes,
      x: kept.map((p) => ({ t: p.t, v: r4(p.x), e: 'linear' })),
      y: kept.map((p) => ({ t: p.t, v: r4(p.y), e: 'linear' })),
    },
    stabilize: { level: L.id, zoom: L.zoom },
  };
  if (!keyframes.scale?.length) patch.transform = { scale: zoomed.transform.scale };
  return { patch, keys: kept.length, clamped, low, samples: path.length };
}
