// Renk filtreleri, renk ayarları ve klip efektleri. Matrisler 4x4, sütun
// öncelikli ve vec4(rgb, 1) üzerine uygulanır (4. sütun = ofset). Yerel motor
// matrisi olduğu gibi kullanır; masaüstü sürümü aynı matematiği paylaşabilir.

import { FILTERS_PACK2, FILTER_CATEGORIES_PACK2 } from './filters-pack2';

export const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** a * b (önce b, sonra a uygulanır). */
export function mul(a, b) {
  const out = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      out[c * 4 + r] = s;
    }
  }
  return out;
}

export function lerpMatrix(m, k) {
  return m.map((v, i) => IDENTITY[i] + (v - IDENTITY[i]) * k);
}

export function isIdentity(m, eps = 1e-4) {
  return m.every((v, i) => Math.abs(v - IDENTITY[i]) < eps);
}

/** Satır öncelikli 3x3 + ofsetten sütun öncelikli 4x4. */
function fromRows(r0, r1, r2, offset = [0, 0, 0]) {
  return [r0[0], r1[0], r2[0], 0, r0[1], r1[1], r2[1], 0, r0[2], r1[2], r2[2], 0, offset[0], offset[1], offset[2], 1];
}

const LR = 0.2126;
const LG = 0.7152;
const LB = 0.0722;

export function saturationMatrix(s) {
  const i = 1 - s;
  return fromRows([LR * i + s, LG * i, LB * i], [LR * i, LG * i + s, LB * i], [LR * i, LG * i, LB * i + s]);
}

export function scaleMatrix(r, g, b) {
  return fromRows([r, 0, 0], [0, g, 0], [0, 0, b]);
}

export function offsetMatrix(r, g = r, b = r) {
  return fromRows([1, 0, 0], [0, 1, 0], [0, 0, 1], [r, g, b]);
}

/** Kontrast, doğrusal renk uzayında orta gri (≈0.2) etrafında. */
export function contrastMatrix(c, pivot = 0.2) {
  const o = pivot * (1 - c);
  return fromRows([c, 0, 0], [0, c, 0], [0, 0, c], [o, o, o]);
}

export const SEPIA = fromRows([0.393, 0.769, 0.189], [0.349, 0.686, 0.168], [0.272, 0.534, 0.131]);

const compose = (...ms) => ms.reduce((acc, m) => mul(m, acc), IDENTITY);

// --- Hazır filtreler (özgün ayarlar) ---

export const FILTERS_BASE = [
  { id: 'none', category: 'basic', matrix: IDENTITY },
  { id: 'vivid', category: 'basic', matrix: compose(saturationMatrix(1.45), contrastMatrix(1.08)) },
  { id: 'natural', category: 'basic', matrix: compose(saturationMatrix(1.12), scaleMatrix(1.03, 1.02, 1)) },
  { id: 'warm', category: 'basic', matrix: compose(scaleMatrix(1.12, 1.03, 0.88), saturationMatrix(1.08)) },
  { id: 'cool', category: 'basic', matrix: compose(scaleMatrix(0.9, 1.0, 1.14), saturationMatrix(1.04)) },
  {
    id: 'cinema',
    category: 'cinematic',
    // Gölgeler camgöbeği, ten renkleri turuncuya
    matrix: compose(
      fromRows([1.12, -0.06, -0.02], [-0.04, 1.02, 0.02], [-0.06, 0.1, 0.98], [0, 0.004, 0.012]),
      contrastMatrix(1.12),
      saturationMatrix(0.92),
    ),
    fx: { vignette: 0.25 },
  },
  { id: 'noirCine', category: 'cinematic', matrix: compose(saturationMatrix(0), contrastMatrix(1.35)), fx: { vignette: 0.45, grain: 0.15 } },
  { id: 'teal', category: 'cinematic', matrix: compose(scaleMatrix(0.86, 1.04, 1.1), contrastMatrix(1.1)) },
  { id: 'golden', category: 'cinematic', matrix: compose(scaleMatrix(1.16, 1.06, 0.82), contrastMatrix(1.05), saturationMatrix(1.1)) },
  { id: 'mono', category: 'bw', matrix: saturationMatrix(0) },
  { id: 'noir', category: 'bw', matrix: compose(saturationMatrix(0), contrastMatrix(1.5)) },
  { id: 'silver', category: 'bw', matrix: compose(saturationMatrix(0), contrastMatrix(0.85), offsetMatrix(0.02)) },
  { id: 'sepia', category: 'retro', matrix: SEPIA },
  { id: 'vintage', category: 'retro', matrix: compose(SEPIA, saturationMatrix(1.6), contrastMatrix(0.9)), fx: { vignette: 0.35, grain: 0.2, fade: 0.25 } },
  { id: 'polaroid', category: 'retro', matrix: compose(scaleMatrix(1.06, 1.02, 0.92), contrastMatrix(0.9), offsetMatrix(0.02, 0.015, 0)), fx: { fade: 0.2 } },
  { id: 'faded', category: 'retro', matrix: compose(saturationMatrix(0.7), contrastMatrix(0.85)), fx: { fade: 0.35 } },
  { id: 'sunset', category: 'mood', matrix: compose(scaleMatrix(1.18, 0.98, 0.86), saturationMatrix(1.15)) },
  { id: 'forest', category: 'mood', matrix: compose(scaleMatrix(0.94, 1.1, 0.92), saturationMatrix(1.1)) },
  { id: 'night', category: 'mood', matrix: compose(scaleMatrix(0.82, 0.92, 1.18), contrastMatrix(1.1), offsetMatrix(-0.01)) },
  { id: 'pastel', category: 'mood', matrix: compose(saturationMatrix(0.75), contrastMatrix(0.82), offsetMatrix(0.03, 0.025, 0.035)) },
  { id: 'pop', category: 'mood', matrix: compose(saturationMatrix(1.8), contrastMatrix(1.15)) },
];

export const FILTERS = [...FILTERS_BASE, ...FILTERS_PACK2];
export const FILTER_CATEGORIES = [...new Set(['basic', 'cinematic', 'bw', 'retro', 'mood', ...FILTER_CATEGORIES_PACK2])];

export function filterById(id) {
  return FILTERS.find((f) => f.id === id) || FILTERS[0];
}

// --- Renk ayarları ---

export const ADJUSTMENTS = [
  { key: 'brightness', min: -1, max: 1 },
  { key: 'contrast', min: -1, max: 1 },
  { key: 'saturation', min: -1, max: 1 },
  { key: 'exposure', min: -1, max: 1 },
  { key: 'temperature', min: -1, max: 1 },
  { key: 'tint', min: -1, max: 1 },
  { key: 'highlights', min: -1, max: 1 },
  { key: 'shadows', min: -1, max: 1 },
  { key: 'fade', min: 0, max: 1 },
  { key: 'sharpen', min: 0, max: 1 },
  { key: 'vignette', min: 0, max: 1 },
  { key: 'grain', min: 0, max: 1 },
];

export function adjustMatrix(a) {
  let m = IDENTITY;
  if (a.exposure) m = mul(scaleMatrix(...Array(3).fill(Math.pow(2, a.exposure * 1.5))), m);
  if (a.brightness) m = mul(mul(offsetMatrix(a.brightness * 0.04), scaleMatrix(...Array(3).fill(1 + a.brightness * 0.5))), m);
  if (a.contrast) m = mul(contrastMatrix(a.contrast >= 0 ? 1 + a.contrast * 0.8 : 1 + a.contrast * 0.6), m);
  if (a.saturation) m = mul(saturationMatrix(a.saturation >= 0 ? 1 + a.saturation : 1 + a.saturation), m);
  if (a.temperature) m = mul(scaleMatrix(1 + a.temperature * 0.18, 1 + a.temperature * 0.02, 1 - a.temperature * 0.18), m);
  if (a.tint) m = mul(scaleMatrix(1 + a.tint * 0.08, 1 - a.tint * 0.14, 1 + a.tint * 0.08), m);
  return m;
}

// --- Klip efektleri (shader tabanlı) ---

export const EFFECTS = [
  { id: 'none', category: 'basic', fx: {} },
  { id: 'glitch', category: 'distort', fx: { glitch: 0.7, rgbShift: 0.4 } },
  { id: 'rgbSplit', category: 'distort', fx: { rgbShift: 0.8 } },
  { id: 'pixelate', category: 'distort', fx: { pixelate: 0.35 } },
  { id: 'mosaic', category: 'distort', fx: { pixelate: 0.8 } },
  { id: 'blur', category: 'lens', fx: {}, blur: 0.5 },
  { id: 'dream', category: 'lens', fx: { fade: 0.2 }, blur: 0.15, matrix: offsetMatrix(0.02) },
  { id: 'vignette', category: 'lens', fx: { vignette: 0.7 } },
  { id: 'filmGrain', category: 'retro', fx: { grain: 0.6 } },
  { id: 'oldFilm', category: 'retro', fx: { grain: 0.55, vignette: 0.55, fade: 0.2 }, matrix: SEPIA },
  { id: 'vhs', category: 'retro', fx: { rgbShift: 0.35, grain: 0.35, glitch: 0.15 }, matrix: saturationMatrix(1.3) },
  { id: 'sharpen', category: 'basic', fx: { sharpen: 0.7 } },
];

export const EFFECT_CATEGORIES = ['basic', 'distort', 'lens', 'retro'];

export function effectById(id) {
  return EFFECTS.find((e) => e.id === id) || EFFECTS[0];
}

const FX_KEYS = ['vignette', 'grain', 'pixelate', 'rgbShift', 'glitch', 'sharpen', 'highlights', 'shadows', 'fade'];

/** Klibin tüm görsel ayarlarından yerel motora gidecek değerleri üretir. */
export function clipVisuals(clip) {
  const filter = filterById(clip.filter?.id);
  const fk = clamp01(clip.filter?.intensity ?? 1);
  const effect = effectById(clip.fx?.id);
  const ek = clamp01(clip.fx?.intensity ?? 1);
  const adjust = clip.adjust || {};

  let matrix = lerpMatrix(filter.matrix, fk);
  if (effect.matrix) matrix = mul(lerpMatrix(effect.matrix, ek), matrix);
  matrix = mul(adjustMatrix(adjust), matrix);

  const fx = {};
  for (const k of FX_KEYS) {
    const v = (filter.fx?.[k] || 0) * fk + (effect.fx?.[k] || 0) * ek + (adjust[k] || 0);
    fx[k] = k === 'highlights' || k === 'shadows' ? clamp(v, -1, 1) : clamp01(v);
  }
  const blur = clamp01((clip.blur || 0) + (effect.blur || 0) * ek);
  return { colorMatrix: isIdentity(matrix) ? null : matrix.map(round5), fx, blur };
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const clamp01 = (v) => clamp(v, 0, 1);
const round5 = (v) => Math.round(v * 1e5) / 1e5;
