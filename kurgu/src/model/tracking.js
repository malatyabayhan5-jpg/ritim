// Hareket takibi: yerel izleyicinin kaynak karedeki noktalarını (0..1) üst katmanın
// kanvas konumu anahtar karelerine (NDC, y yukarı) çevirir. Ana klibin yerleşimi
// yerel motorla aynı sırayla uygulanır: çevirme/döndürme (ScaleAndRotate) ->
// kanvasa sığdır/doldur (Presentation) -> ölçek, serbest açı, konum (KeyedPlacement).

import { localAt } from './speed';
import { mainPropAt, overlayDuration, overlayPropAt } from './timeline';

/** Yerel izleyicinin "kayıp" eşiği (Tracker.LOST ile aynı). */
export const TRACK_LOST = 0.45;

/** Kaynak (döndürülmüş) en/boy oranının kanvastaki yarı genişlik/yükseklik kesirleri. */
export function fittedHalf(srcAspect, canvasAspect, fit) {
  const wide = srcAspect > canvasAspect;
  if ((fit || 'fit') === 'fill') return wide ? { fw: srcAspect / canvasAspect, fh: 1 } : { fw: 1, fh: canvasAspect / srcAspect };
  return wide ? { fw: 1, fh: canvasAspect / srcAspect } : { fw: srcAspect / canvasAspect, fh: 1 };
}

export function geometry(clip, media, canvas) {
  const W = media?.width || 16;
  const H = media?.height || 9;
  const rot = ((Math.round((clip.transform?.rotation || 0) / 90) * 90) % 360 + 360) % 360;
  const swap = rot === 90 || rot === 270;
  const rw = swap ? H : W;
  const rh = swap ? W : H;
  const { fw, fh } = fittedHalf(rw / rh, canvas.width / canvas.height, clip.transform?.fit || canvas.fit);
  return { W, H, rot, rw, rh, fw, fh, flipH: !!clip.transform?.flipH, flipV: !!clip.transform?.flipV };
}

// Saat yönünde (ekran, y aşağı) döndürme
function rotCw(x, y, deg) {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [x * c - y * s, x * s + y * c];
}

/** Ana klibin `localMs` anındaki yerleşimi (ölçek, konum NDC, açı). */
function placement(clip, localMs) {
  return {
    scale: mainPropAt(clip, 'scale', localMs),
    x: mainPropAt(clip, 'x', localMs),
    y: mainPropAt(clip, 'y', localMs),
    angle: mainPropAt(clip, 'angle', localMs),
  };
}

/** Kaynak karedeki (u, v) noktası -> kanvas NDC (x sağa, y yukarı). */
export function videoToCanvas(u, v, clip, media, canvas, localMs = 0) {
  const g = geometry(clip, media, canvas);
  let a = (g.flipH ? 0.5 - u : u - 0.5) * g.W;
  let b = (g.flipV ? 0.5 - v : v - 0.5) * g.H;
  [a, b] = rotCw(a, b, g.rot);
  const p = placement(clip, localMs);
  // Kanvas pikseli (y aşağı), kanvas merkezine göre
  let px = ((2 * a) / g.rw) * g.fw * p.scale * (canvas.width / 2);
  let py = ((2 * b) / g.rh) * g.fh * p.scale * (canvas.height / 2);
  [px, py] = rotCw(px, py, p.angle);
  return { x: px / (canvas.width / 2) + p.x, y: -py / (canvas.height / 2) + p.y };
}

/** Kanvas NDC noktası -> kaynak karedeki (u, v). */
export function canvasToVideo(x, y, clip, media, canvas, localMs = 0) {
  const g = geometry(clip, media, canvas);
  const p = placement(clip, localMs);
  let px = (x - p.x) * (canvas.width / 2);
  let py = -(y - p.y) * (canvas.height / 2);
  [px, py] = rotCw(px, py, -p.angle);
  const s = Math.max(1e-6, p.scale);
  let a = (px / (canvas.width / 2) / (g.fw * s)) * (g.rw / 2);
  let b = (py / (canvas.height / 2) / (g.fh * s)) * (g.rh / 2);
  [a, b] = rotCw(a, b, -g.rot);
  const u = a / g.W;
  const v = b / g.H;
  return { u: g.flipH ? 0.5 - u : u + 0.5, v: g.flipV ? 0.5 - v : v + 0.5 };
}

/**
 * Takip kutusu: katmanın kanvastaki merkezi ve boyutu kaynak kareye taşınır.
 * Boyut [0.06, 0.45] aralığına sıkıştırılır (çok küçük şablon gürültüye, çok büyük
 * şablon arka plana kilitlenir). `boxW`, `boxH` kanvas kesri (0..1).
 */
export function trackingBox(o, clip, media, canvas, overlayLocalMs, clipLocalMs, boxW, boxH) {
  return trackingBoxAt(overlayPropAt(o, 'x', overlayLocalMs), overlayPropAt(o, 'y', overlayLocalMs), clip, media, canvas, clipLocalMs, boxW, boxH);
}

/** Kanvas NDC merkezi (x, y) ve kanvas kesri boyutundan takip kutusu (metin katmanları için de). */
export function trackingBoxAt(x, y, clip, media, canvas, clipLocalMs, boxW, boxH) {
  const c = canvasToVideo(x, y, clip, media, canvas, clipLocalMs);
  const g = geometry(clip, media, canvas);
  const s = Math.max(1e-6, mainPropAt(clip, 'scale', clipLocalMs));
  // Kanvas kesri -> döndürülmüş kaynak kesri; 90/270'te eksenler yer değiştirir
  let bw = boxW / (g.fw * s);
  let bh = boxH / (g.fh * s);
  if (g.rot === 90 || g.rot === 270) [bw, bh] = [bh, bw];
  const clampBox = (v) => Math.min(0.45, Math.max(0.06, v));
  return [Math.min(1, Math.max(0, c.u)), Math.min(1, Math.max(0, c.v)), clampBox(bw), clampBox(bh)];
}

// Ramer–Douglas–Peucker: (t, x, y) dizisinde doğrusal ara değerden en çok `eps`
// sapan noktalar tutulur (x ve y birlikte).
export function simplify(pts, eps) {
  if (pts.length <= 2) return pts;
  const keep = new Array(pts.length).fill(false);
  keep[0] = keep[pts.length - 1] = true;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop();
    let worst = -1;
    let idx = -1;
    for (let k = i + 1; k < j; k++) {
      const f = (pts[k].t - pts[i].t) / Math.max(1e-9, pts[j].t - pts[i].t);
      const dx = pts[k].x - (pts[i].x + (pts[j].x - pts[i].x) * f);
      const dy = pts[k].y - (pts[i].y + (pts[j].y - pts[i].y) * f);
      const d = Math.hypot(dx, dy);
      if (d > worst) {
        worst = d;
        idx = k;
      }
    }
    if (worst > eps) {
      keep[idx] = true;
      stack.push([i, idx], [idx, j]);
    }
  }
  return pts.filter((_, k) => keep[k]);
}

/**
 * İzleyici noktalarını üst katman konum anahtar karelerine çevirir.
 * Katman ile hedef arasındaki ilk aralık korunur (kullanıcı katmanı nesnenin
 * yanına koyduysa yanında kalır). Güveni düşük noktalar atlanır.
 *
 * @param points [{ t: kaynak ms, x, y: 0..1, c }]
 * @param clipStart ana klibin zaman çizelgesi başlangıcı (ms)
 * @param anchorMs takibin başladığı zaman çizelgesi anı (ms)
 * @param durationMs, anchor öğe katman değilse (metin) süre ve başlangıç konumu {x, y}
 * @returns { keyframes: { x, y }, used, lost } ya da hedef yoksa null
 */
export function trackToOverlayKeys(points, { clip, clipStart, media, canvas, overlay, anchorMs, eps = 0.003, durationMs, anchor }) {
  const dur = durationMs ?? overlayDuration(overlay);
  const conv = [];
  let lost = 0;
  for (const p of points) {
    if (p.c < TRACK_LOST) {
      lost++;
      continue;
    }
    const local = localAt(clip, p.t);
    const T = clipStart + local;
    const t = Math.round(T - overlay.start);
    if (t < 0 || t > dur) continue;
    const n = videoToCanvas(p.x, p.y, clip, media, canvas, local);
    conv.push({ t, x: n.x, y: n.y });
  }
  if (!conv.length) return null;
  const anchorLocal = anchorMs - overlay.start;
  const a = anchor || { x: overlayPropAt(overlay, 'x', anchorLocal), y: overlayPropAt(overlay, 'y', anchorLocal) };
  const dx = a.x - conv[0].x;
  const dy = a.y - conv[0].y;
  const r3 = (v) => Math.round(v * 1000) / 1000;
  const pts = simplify(conv.map((p) => ({ t: p.t, x: p.x + dx, y: p.y + dy })), eps);
  // Aynı ms'ye düşen noktalar (hız > 1) tekilleştirilir
  const uniq = pts.filter((p, i) => i === 0 || p.t !== pts[i - 1].t);
  return {
    keyframes: {
      x: uniq.map((p) => ({ t: p.t, v: r3(p.x), e: 'linear' })),
      y: uniq.map((p) => ({ t: p.t, v: r3(p.y), e: 'linear' })),
    },
    used: conv.length,
    lost,
  };
}

/** Takip sonucunu katmana uygular: x/y izleri değiştirilir, diğer izler korunur. */
export function applyTrackKeys(overlay, keys) {
  return { keyframes: { ...overlay.keyframes, x: keys.x, y: keys.y } };
}
