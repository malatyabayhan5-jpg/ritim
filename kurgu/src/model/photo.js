// Fotoğraf (görsel) projesi: tahribatsız katmanlı düzenleme. Kaynak görseller
// değişmez; tüm ayarlar JSON'da tutulur ve yerel motor (PhotoRenderer.kt) her
// önizleme/dışa aktarmada kaynaktan yeniden çizer. Saf fonksiyonlar, birim testli.
//
// Koordinatlar: katman merkezi x, y NDC (-1..1, y yukarı); ölçek 1 = katman kanvasa
// sığdırılmış (contain) boyutta; döndürme derece (saat yönü).

import { DEFAULT_ADJUST, DEFAULT_TEXT_STYLE, newId } from './schema';
import { clipVisuals } from './color';

export const PHOTO_FORMAT = 'kurgu.photo';
export const PHOTO_VERSION = 1;

/** Kanvas boyutları (genel adlar; marka adı kullanılmaz). */
export const CANVAS_PRESETS = [
  { id: 'original', w: 0, h: 0 },
  { id: 'square', w: 1080, h: 1080 },
  { id: 'portrait45', w: 1080, h: 1350 },
  { id: 'story', w: 1080, h: 1920 },
  { id: 'landscape169', w: 1920, h: 1080 },
  { id: 'thumbnail', w: 1280, h: 720 },
  { id: 'cover31', w: 1500, h: 500 },
  { id: 'photo32', w: 1800, h: 1200 },
  { id: 'photo23', w: 1200, h: 1800 },
  { id: 'a4', w: 2480, h: 3508 },
];

export const BLEND_MODES = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'add', 'difference', 'softLight', 'color', 'luminosity'];
export const SHAPES = ['rect', 'roundRect', 'ellipse', 'triangle', 'star', 'heart', 'line', 'arrow'];
export const HSL_BANDS = ['red', 'orange', 'yellow', 'green', 'aqua', 'blue', 'purple', 'magenta'];
export const STICKERS = ['😀', '😍', '🔥', '✨', '❤️', '👍', '🎉', '⭐', '🌈', '☀️', '🌙', '🌸', '🍀', '🎵', '📍', '💬', '✅', '❗', '➡️', '💯', '😎', '🥳', '🙌', '👀'];

export const PHOTO_ADJUST = { ...DEFAULT_ADJUST, blur: 0 };
const DEFAULT_GRADE = { shadowHue: 220, shadowSat: 0, highHue: 40, highSat: 0, balance: 0 };

export function createPhoto({ name = '', width = 1080, height = 1350, background = '#000000FF' } = {}) {
  const now = Date.now();
  return {
    format: PHOTO_FORMAT,
    version: PHOTO_VERSION,
    id: newId('pho'),
    name,
    createdAt: now,
    updatedAt: now,
    exportedAt: null,
    canvas: { width, height, preset: 'original', background, border: { width: 0, color: '#FFFFFFFF', radius: 0 } },
    media: {},
    luts: {},
    layers: [],
  };
}

const base = (type) => ({ id: newId('lay'), type, x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, blend: 'normal', flipH: false, flipV: false, visible: true });

export function createImageLayer(media, extra = {}) {
  return {
    ...base('image'),
    mediaId: media.id,
    crop: { x0: 0, y0: 0, x1: 1, y1: 1 },
    quarter: 0, // 90° adımlı döndürme (kanvas yönüyle birlikte)
    adjust: { ...PHOTO_ADJUST },
    filter: { id: 'none', intensity: 1 },
    lut: null,
    hsl: new Array(24).fill(0),
    grade: { ...DEFAULT_GRADE },
    mask: null, // { mediaId, lo, hi, invert } (gri maske görseli; ör. arka plan kaldırma)
    ...extra,
  };
}

export function createTextLayer(text, style = {}) {
  return { ...base('text'), text, style: { ...DEFAULT_TEXT_STYLE, size: 0.06, ...style } };
}

export function createShapeLayer(shape = 'rect') {
  return { ...base('shape'), shape, w: 0.5, h: 0.3, fill: '#FFD60AFF', stroke: '#00000000', strokeWidth: 0, radius: 0.15, scale: 1 };
}

const touch = (p) => ({ ...p, updatedAt: Date.now() });

/** İlk görsel: kanvas görselin boyutunu alır (uzun kenar ≤ 4096), katman tam sığar. */
export function photoFromMedia(media, name = '') {
  const w = media.width || 1080;
  const h = media.height || 1350;
  const k = Math.min(1, 4096 / Math.max(w, h));
  const p = createPhoto({ name, width: Math.round(w * k), height: Math.round(h * k) });
  const layer = createImageLayer(media);
  return { ...p, media: { [media.id]: media }, layers: [layer] };
}

export function addLayer(p, layer, media) {
  return touch({ ...p, media: media ? { ...p.media, [media.id]: media } : p.media, layers: [...p.layers, layer] });
}

const MERGE_KEYS = ['crop', 'adjust', 'filter', 'grade', 'style', 'mask'];
export function updateLayer(p, id, patch) {
  return touch({
    ...p,
    layers: p.layers.map((l) => {
      if (l.id !== id) return l;
      const out = { ...l, ...patch };
      for (const k of MERGE_KEYS) if (patch[k] && l[k] && typeof patch[k] === 'object') out[k] = { ...l[k], ...patch[k] };
      return out;
    }),
  });
}

export function removeLayer(p, id) {
  return touch({ ...p, layers: p.layers.filter((l) => l.id !== id) });
}

export function duplicateLayer(p, id) {
  const i = p.layers.findIndex((l) => l.id === id);
  if (i < 0) return { project: p, newId: null };
  const copy = { ...JSON.parse(JSON.stringify(p.layers[i])), id: newId('lay'), x: p.layers[i].x + 0.05, y: p.layers[i].y - 0.05 };
  const layers = [...p.layers];
  layers.splice(i + 1, 0, copy);
  return { project: touch({ ...p, layers }), newId: copy.id };
}

/** Sıra: +1 öne, -1 arkaya (dizide sonraki = üstte). */
export function moveLayer(p, id, dir) {
  const i = p.layers.findIndex((l) => l.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= p.layers.length) return p;
  const layers = [...p.layers];
  [layers[i], layers[j]] = [layers[j], layers[i]];
  return touch({ ...p, layers });
}

/** Kanvas boyutu: hazır boyut; 'original' ilk görselin oranını kullanır. Katmanlar NDC'de kaldığı için yerlerini korur. */
export function setCanvasPreset(p, presetId) {
  const preset = CANVAS_PRESETS.find((c) => c.id === presetId);
  if (!preset) return p;
  let { w, h } = preset;
  if (presetId === 'original') {
    const img = p.layers.find((l) => l.type === 'image');
    const m = img && p.media[img.mediaId];
    const c = img?.crop || { x0: 0, y0: 0, x1: 1, y1: 1 };
    w = m?.width ? Math.round(m.width * (c.x1 - c.x0)) : p.canvas.width;
    h = m?.height ? Math.round(m.height * (c.y1 - c.y0)) : p.canvas.height;
    if ((img?.quarter || 0) % 2) [w, h] = [h, w];
    const k = Math.min(1, 4096 / Math.max(w, h));
    w = Math.round(w * k);
    h = Math.round(h * k);
  }
  return touch({ ...p, canvas: { ...p.canvas, preset: presetId, width: w, height: h } });
}

export function setCanvas(p, patch) {
  return touch({ ...p, canvas: { ...p.canvas, ...patch, border: patch.border ? { ...p.canvas.border, ...patch.border } : p.canvas.border } });
}

/** Eski veya kısmen bozuk fotoğraf projelerini güncel biçime getirir. */
export function migratePhoto(raw) {
  if (!raw || typeof raw !== 'object' || raw.format !== PHOTO_FORMAT) throw new Error('PHOTO_INVALID');
  if ((raw.version || 1) > PHOTO_VERSION) throw new Error('PHOTO_TOO_NEW');
  const p = { ...createPhoto(), ...raw, version: PHOTO_VERSION };
  p.canvas = { ...createPhoto().canvas, ...(raw.canvas || {}) };
  p.media = raw.media || {};
  p.luts = raw.luts || {};
  p.layers = (raw.layers || []).filter((l) => l && l.type).map((l) => {
    if (l.type === 'image') {
      const d = createImageLayer({ id: l.mediaId });
      return { ...d, ...l, adjust: { ...PHOTO_ADJUST, ...(l.adjust || {}) }, crop: { ...d.crop, ...(l.crop || {}) }, grade: { ...DEFAULT_GRADE, ...(l.grade || {}) }, hsl: Array.isArray(l.hsl) && l.hsl.length === 24 ? l.hsl : d.hsl };
    }
    if (l.type === 'text') return { ...createTextLayer(''), ...l, style: { ...DEFAULT_TEXT_STYLE, ...(l.style || {}) } };
    return { ...createShapeLayer(), ...l };
  });
  return p;
}

export function usedPhotoMedia(p) {
  const ids = new Set();
  for (const l of p.layers) {
    if (l.mediaId) ids.add(l.mediaId);
    if (l.mask?.mediaId) ids.add(l.mask.mediaId);
    if (l.original?.mediaId) ids.add(l.original.mediaId);
  }
  return ids;
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v ?? a));

/** Yerel çizici için düz tanım (PhotoRenderer.kt). */
export function photoSpec(p, resolveUri) {
  return {
    width: p.canvas.width,
    height: p.canvas.height,
    background: p.canvas.background,
    border: p.canvas.border,
    layers: p.layers
      .filter((l) => l.visible !== false)
      .map((l) => {
        const common = { id: l.id, type: l.type, x: l.x, y: l.y, scale: l.scale, rotation: l.rotation, opacity: clamp(l.opacity ?? 1, 0, 1), blend: l.blend || 'normal', flipH: !!l.flipH, flipV: !!l.flipV };
        if (l.type === 'image') {
          const media = p.media[l.mediaId];
          if (!media) return null;
          const a = l.adjust || {};
          const visuals = clipVisuals({ filter: l.filter, adjust: a, fx: { id: 'none' } });
          const lut = l.lut && p.luts[l.lut.id];
          const maskMedia = l.mask?.mediaId && p.media[l.mask.mediaId];
          return {
            ...common,
            uri: resolveUri(media),
            srcW: media.width || 0,
            srcH: media.height || 0,
            crop: [l.crop.x0, l.crop.y0, l.crop.x1, l.crop.y1],
            quarter: ((l.quarter || 0) % 4 + 4) % 4,
            colorMatrix: visuals.colorMatrix,
            tone: [clamp(a.highlights, -1, 1), clamp(a.shadows, -1, 1), clamp(a.fade, 0, 1)],
            detail: [clamp(a.sharpen, 0, 1), clamp(a.blur, 0, 1), clamp(a.vignette, 0, 1), clamp(a.grain, 0, 1)],
            hsl: (l.hsl || []).some((v) => v) ? l.hsl : null,
            grade: l.grade && (l.grade.shadowSat > 0 || l.grade.highSat > 0) ? [l.grade.shadowHue, l.grade.shadowSat, l.grade.highHue, l.grade.highSat, l.grade.balance] : null,
            lut: lut ? { uri: resolveUri(lut), amount: clamp(l.lut.intensity ?? 1, 0, 1) } : null,
            mask: maskMedia ? { uri: resolveUri(maskMedia), lo: l.mask.lo ?? 0.35, hi: l.mask.hi ?? 0.65, invert: !!l.mask.invert } : null,
          };
        }
        if (l.type === 'text') {
          if (!String(l.text || '').trim()) return null;
          const s = l.style;
          return { ...common, text: l.text, size: s.size, color: s.color, background: s.background, stroke: s.stroke, strokeWidth: s.strokeWidth || 0, shadow: !!s.shadow, align: s.align, bold: !!s.bold, italic: !!s.italic, font: s.font, letterSpacing: s.letterSpacing || 0, lineHeight: s.lineHeight || 1.2 };
        }
        return { ...common, shape: l.shape, w: l.w, h: l.h, fill: l.fill, stroke: l.stroke, strokeWidth: l.strokeWidth || 0, radius: l.radius || 0 };
      })
      .filter(Boolean),
  };
}

/**
 * Katmanın kanvas pikselindeki kutusu (PhotoRenderer.kt ile aynı yerleşim):
 * { cx, cy, w, h, rot } — merkez, ölçekli boyut, derece. Metin için yaklaşık ölçü.
 */
export function layerBox(p, l) {
  const cw = p.canvas.width;
  const ch = p.canvas.height;
  const cx = ((l.x + 1) / 2) * cw;
  const cy = ((1 - l.y) / 2) * ch;
  const s = l.scale ?? 1;
  let w;
  let h;
  if (l.type === 'image') {
    const m = p.media[l.mediaId] || {};
    const c = l.crop || { x0: 0, y0: 0, x1: 1, y1: 1 };
    let a = m.width && m.height ? (m.width * (c.x1 - c.x0)) / (m.height * (c.y1 - c.y0)) : cw / ch;
    if ((l.quarter || 0) % 2) a = 1 / a;
    if (a > cw / ch) {
      w = cw * s;
      h = w / a;
    } else {
      h = ch * s;
      w = h * a;
    }
  } else if (l.type === 'text') {
    const size = (l.style?.size || 0.06) * ch;
    const lines = String(l.text || ' ').split('\n');
    const longest = Math.max(...lines.map((x) => x.length), 1);
    w = (Math.min(cw * 0.92 / Math.max(0.2, s), longest * size * 0.56) + size * 0.6) * s;
    h = (lines.length * size * (l.style?.lineHeight || 1.2) + size * 0.6) * s;
  } else {
    w = (l.w ?? 0.5) * cw * s;
    h = (l.h ?? 0.3) * ch * s;
  }
  return { cx, cy, w, h, rot: l.rotation || 0 };
}

/** Kanvas noktasının katman içindeki konumu (-0.5..0.5, döndürme ve çevirme geri alınmış). */
export function canvasToLayer(box, l, px, py) {
  const r = (-(box.rot || 0) * Math.PI) / 180;
  const dx = px - box.cx;
  const dy = py - box.cy;
  let u = (dx * Math.cos(r) - dy * Math.sin(r)) / box.w;
  let v = (dx * Math.sin(r) + dy * Math.cos(r)) / box.h;
  if (l.flipH) u = -u;
  if (l.flipV) v = -v;
  return { u, v };
}

/** Noktadaki en üstteki görünür katman (yoksa null). */
export function hitLayer(p, px, py) {
  for (let i = p.layers.length - 1; i >= 0; i--) {
    const l = p.layers[i];
    if (l.visible === false || l.locked) continue;
    const { u, v } = canvasToLayer(layerBox(p, l), l, px, py);
    if (Math.abs(u) <= 0.5 && Math.abs(v) <= 0.5) return l;
  }
  return null;
}

/**
 * Kanvas dikdörtgenini (iki köşe) görsel katmanının kaynak koordinatına çevirir
 * (0..1, y aşağı; kırpma dahil). Nesne silme için. Katman dışına taşan kısım kırpılır.
 */
export function canvasRectToSource(p, l, ax, ay, bx, by) {
  const box = layerBox(p, l);
  const c = l.crop || { x0: 0, y0: 0, x1: 1, y1: 1 };
  const pts = [
    [ax, ay],
    [bx, ay],
    [ax, by],
    [bx, by],
  ].map(([x, y]) => {
    const d = canvasToLayer(box, l, x, y);
    // Görüntülenen (çeyrek döndürülmüş) konumdan kaynak yönüne: saat yönünde q×90° geri alınır
    const q = ((l.quarter || 0) % 4 + 4) % 4;
    const [u, v] = [[d.u, d.v], [d.v, -d.u], [-d.u, -d.v], [-d.v, d.u]][q];
    const cu = Math.max(0, Math.min(1, u + 0.5));
    const cv = Math.max(0, Math.min(1, v + 0.5));
    return [c.x0 + cu * (c.x1 - c.x0), c.y0 + cv * (c.y1 - c.y0)];
  });
  const xs = pts.map((q) => q[0]);
  const ys = pts.map((q) => q[1]);
  const r = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
  return r.x1 - r.x0 < 0.005 || r.y1 - r.y0 < 0.005 ? null : r;
}

/** Görsel katmanının kaynağını değiştirir (ör. nesne silme sonucu); ilk kaynak geri dönüş için saklanır. */
export function replaceLayerMedia(p, layerId, media) {
  const l = p.layers.find((x) => x.id === layerId);
  if (!l || l.type !== 'image') return p;
  const original = l.original || { mediaId: l.mediaId };
  return updateLayer({ ...p, media: { ...p.media, [media.id]: media } }, layerId, { mediaId: media.id, original });
}

/** İlk kaynağa döner (tüm silme işlemleri geri alınır). */
export function restoreLayerMedia(p, layerId) {
  const l = p.layers.find((x) => x.id === layerId);
  if (!l?.original) return p;
  return updateLayer(p, layerId, { mediaId: l.original.mediaId, original: null });
}

/** Saydam kanvas (PNG ile dışa aktarılmalı). */
export const isTransparent = (p) => /^#[0-9a-f]{6}([0-9a-f]{2})$/i.test(p.canvas.background) && parseInt(p.canvas.background.slice(7, 9), 16) < 255;

/**
 * Görsel katmanını 90° döndürür (dir: 1 saat yönü, -1 ters). Katman ilk görselse ve
 * kanvas "orijinal" boyuttaysa kanvasın en/boyu da yer değiştirir.
 */
export function rotateQuarter(p, id, dir = 1) {
  const l = p.layers.find((x) => x.id === id);
  if (!l || l.type !== 'image') return p;
  let out = updateLayer(p, id, { quarter: (((l.quarter || 0) + dir) % 4 + 4) % 4 });
  const first = p.layers.find((x) => x.type === 'image');
  if (first?.id === id && p.canvas.preset === 'original') out = setCanvas(out, { width: p.canvas.height, height: p.canvas.width });
  return out;
}

/** Kırpma oranları; 'free' mevcut kırpmayı korur. */
export const CROP_RATIOS = [
  { id: 'free', r: 0 },
  { id: 'original', r: -1 },
  { id: '1:1', r: 1 },
  { id: '4:5', r: 4 / 5 },
  { id: '5:4', r: 5 / 4 },
  { id: '3:2', r: 3 / 2 },
  { id: '2:3', r: 2 / 3 },
  { id: '16:9', r: 16 / 9 },
  { id: '9:16', r: 9 / 16 },
];

/**
 * Oran + yakınlaştırma + merkezden kırpma dikdörtgeni (kaynak 0..1). Oran görüntülenen
 * yöne göredir (çeyrek döndürme hesaba katılır). zoom ≥ 1, cx/cy 0..1 merkez.
 */
export function cropRect(media, quarter, ratio, zoom = 1, cx = 0.5, cy = 0.5) {
  const mw = media?.width || 1;
  const mh = media?.height || 1;
  let r = ratio > 0 ? ratio : mw / mh;
  if (ratio > 0 && (quarter || 0) % 2) r = 1 / r;
  const A = mw / mh;
  let w = 1;
  let h = 1;
  if (r > A) h = A / r;
  else w = r / A;
  const z = Math.max(1, zoom);
  w /= z;
  h /= z;
  const x0 = Math.max(0, Math.min(1 - w, cx - w / 2));
  const y0 = Math.max(0, Math.min(1 - h, cy - h / 2));
  const round = (v) => Math.round(v * 1e4) / 1e4;
  return { x0: round(x0), y0: round(y0), x1: round(x0 + w), y1: round(y0 + h) };
}
