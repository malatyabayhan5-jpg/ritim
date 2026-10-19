// Kurgu proje biçimi (platformdan bağımsız). Android, iOS ve gelecekteki
// masaüstü sürümü aynı JSON'u okur. Medya yolları proje kütüphanesine göre
// görelidir; böylece proje arşivi başka cihaza taşınabilir.
//
// Sürüm değişikliklerinde migrateProject() içine adım ekleyin; eski projeler
// sessizce bozulmaz. Bilinmeyen efekt/geçiş türleri silinmez, `unsupported`
// listesinde kullanıcıya gösterilir.

export const PROJECT_FORMAT = 'kurgu.project';
export const PROJECT_VERSION = 1;

export const RATIOS = {
  '9:16': [9, 16],
  '16:9': [16, 9],
  '1:1': [1, 1],
  '4:5': [4, 5],
  '4:3': [4, 3],
  '3:4': [3, 4],
  '21:9': [21, 9],
  '2:1': [2, 1],
};

/** Kısa kenar çözünürlüğüne ve orana göre çift sayılı kanvas boyutu. */
export function canvasSize(ratio, shortSide = 1080) {
  const [rw, rh] = RATIOS[ratio] || RATIOS['9:16'];
  const even = (v) => Math.max(2, Math.round(v / 2) * 2);
  if (rw <= rh) return { width: even(shortSide), height: even((shortSide * rh) / rw) };
  return { width: even((shortSide * rw) / rh), height: even(shortSide) };
}

let counter = 0;
export function newId(prefix = 'id') {
  counter = (counter + 1) % 1e6;
  return `${prefix}_${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}${counter.toString(36)}`;
}

export const DEFAULT_ADJUST = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  exposure: 0,
  temperature: 0,
  tint: 0,
  highlights: 0,
  shadows: 0,
  fade: 0,
  sharpen: 0,
  vignette: 0,
  grain: 0,
};

export const DEFAULT_FX = { id: 'none', intensity: 1 };

export function createProject({ name, ratio = '9:16', resolution = 1080, fps = 30 } = {}) {
  const now = Date.now();
  const { width, height } = canvasSize(ratio, resolution);
  return {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    id: newId('prj'),
    name: name || '',
    createdAt: now,
    updatedAt: now,
    exportedAt: null,
    canvas: { ratio, width, height, fps, fit: 'fit' },
    media: {},
    main: [],
    audio: [],
    texts: [],
    effectLayers: [],
    overlays: [],
    luts: {},
    markers: [],
    unsupported: [],
  };
}

export function createMainClip(media, { imageDurationMs = 3000 } = {}) {
  const isImage = media.kind === 'image';
  return {
    id: newId('clip'),
    mediaId: media.id,
    kind: isImage ? 'image' : 'video',
    srcIn: 0,
    srcOut: isImage ? imageDurationMs : Math.max(100, media.durationMs || 0),
    speed: 1,
    volume: 1,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
    denoise: 0,
    filter: { id: 'none', intensity: 1 },
    adjust: { ...DEFAULT_ADJUST },
    fx: { ...DEFAULT_FX },
    transform: { rotation: 0, flipH: false, flipV: false, scale: 1, x: 0, y: 0, fit: null },
    blur: 0,
    effects: [],
    lut: null,
    transition: { type: 'none', durationMs: 500 },
  };
}

export function createAudioClip(media, start, role = 'music') {
  return {
    id: newId('aud'),
    mediaId: media.id,
    role,
    start: Math.max(0, Math.round(start)),
    srcIn: 0,
    srcOut: Math.max(100, media.durationMs || 0),
    speed: 1,
    volume: 1,
    fadeIn: 0,
    fadeOut: 0,
    denoise: 0,
  };
}

export const MASK_TYPES = ['none', 'rect', 'ellipse', 'linear', 'mirror', 'heart', 'star'];
export const DEFAULT_MASK = { type: 'none', x: 0, y: 0, w: 0.5, h: 0.5, angle: 0, feather: 0.02, round: 0, invert: false };
export const DEFAULT_CHROMA = { on: false, color: '#00B140', tolerance: 0.4, softness: 0.3, spill: 0.5 };

/**
 * Üst katman (resim içinde resim): ana izin üzerinde serbest konumlu video/görsel.
 * transform.x/y NDC (-1..1, y yukarı), scale kanvasa sığdırılmış boyuta göre,
 * rotation derece (saat yönü). lane: katman şeridi (büyük olan üstte çizilir).
 * keyframes: { x, y, scale, rotation, opacity } -> [{ t, v, e }] (src/model/keyframes.js).
 */
export function createOverlay(media, start, lane = 0, { imageDurationMs = 3000 } = {}) {
  const isImage = media.kind === 'image';
  return {
    id: newId('ovl'),
    mediaId: media.id,
    kind: isImage ? 'image' : 'video',
    start: Math.max(0, Math.round(start)),
    lane,
    srcIn: 0,
    srcOut: isImage ? imageDurationMs : Math.max(100, media.durationMs || 0),
    speed: 1,
    volume: 1,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
    transform: { x: 0, y: 0, scale: 0.5, rotation: 0, flipH: false, flipV: false },
    opacity: 1,
    blend: 'normal',
    crop: { x0: 0, y0: 0, x1: 1, y1: 1 },
    mask: { ...DEFAULT_MASK },
    chroma: { ...DEFAULT_CHROMA },
    filter: { id: 'none', intensity: 1 },
    adjust: { ...DEFAULT_ADJUST },
    keyframes: {},
  };
}

export const DEFAULT_TEXT_STYLE = {
  font: 'sans',
  size: 0.055, // kare yüksekliğine oran
  color: '#FFFFFFFF',
  background: '#00000000',
  stroke: '#00000000',
  strokeWidth: 0, // kare yüksekliğine oran
  shadow: true,
  bold: true,
  italic: false,
  align: 'center',
  letterSpacing: 0,
  lineHeight: 1.2,
  opacity: 1,
};

export function createText(start, text, style = {}) {
  return {
    id: newId('txt'),
    text,
    start: Math.max(0, Math.round(start)),
    duration: 3000,
    style: { ...DEFAULT_TEXT_STYLE, ...style },
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
    animIn: 'fade',
    animOut: 'fade',
    animMs: 400,
  };
}

// Eski sürümlerdeki tek efekt alanı (clip.fx) yeni efekt yığınına taşınır.
// Karşılığı olmayan eski efektler (bulanıklık, vinyet, gren, keskinlik) eski yolla çizilmeye devam eder.
const LEGACY_FX = {
  glitch: ['glitch', {}],
  rgbSplit: ['chromatic', {}],
  vhs: ['vhs', {}],
  oldFilm: ['oldFilm', {}],
  pixelate: ['mosaic', { cellSize: 0.35, grout: 0, bevel: 0 }],
  mosaic: ['mosaic', { cellSize: 0.8, grout: 0, bevel: 0 }],
  dream: ['glow', { warmth: 0.6 }],
};
function migrateClipEffects(c) {
  const effects = Array.isArray(c.effects) ? c.effects : [];
  const target = LEGACY_FX[c.fx?.id];
  if (!target) return { ...c, effects };
  return {
    ...c,
    effects: [...effects, { id: `${c.id}_legacyfx`, effectId: target[0], amount: c.fx.intensity ?? 1, values: { ...target[1] } }],
    fx: { ...DEFAULT_FX },
  };
}

/** Eski veya kısmen bozuk projeleri güncel biçime getirir. */
export function migrateProject(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('PROJECT_INVALID');
  if (raw.format && raw.format !== PROJECT_FORMAT) throw new Error('PROJECT_FORMAT');
  if ((raw.version || 1) > PROJECT_VERSION) throw new Error('PROJECT_TOO_NEW');
  const p = { ...createProject(), ...raw, format: PROJECT_FORMAT, version: PROJECT_VERSION };
  p.canvas = { ...createProject().canvas, ...(raw.canvas || {}) };
  p.media = raw.media || {};
  p.main = (raw.main || []).map((c) => migrateClipEffects({
    ...createMainClip({ id: c.mediaId, kind: c.kind, durationMs: c.srcOut }),
    ...c,
    adjust: { ...DEFAULT_ADJUST, ...(c.adjust || {}) },
    filter: { id: 'none', intensity: 1, ...(c.filter || {}) },
    fx: { ...DEFAULT_FX, ...(c.fx || {}) },
    transform: { rotation: 0, flipH: false, flipV: false, scale: 1, x: 0, y: 0, fit: null, ...(c.transform || {}) },
    transition: { type: 'none', durationMs: 500, ...(c.transition || {}) },
  }));
  p.audio = (raw.audio || []).map((a) => ({ speed: 1, volume: 1, fadeIn: 0, fadeOut: 0, role: 'music', ...a }));
  p.texts = (raw.texts || []).map((t) => ({
    ...createText(t.start || 0, t.text || ''),
    ...t,
    style: { ...DEFAULT_TEXT_STYLE, ...(t.style || {}) },
  }));
  p.effectLayers = (raw.effectLayers || []).filter((e) => e && e.effectId && e.duration > 0);
  p.overlays = (raw.overlays || []).filter((o) => o && o.mediaId && o.srcOut > o.srcIn).map((o) => {
    const base = createOverlay({ id: o.mediaId, kind: o.kind, durationMs: o.srcOut }, o.start || 0, o.lane || 0);
    return {
      ...base,
      ...o,
      transform: { ...base.transform, ...(o.transform || {}) },
      crop: { ...base.crop, ...(o.crop || {}) },
      mask: { ...DEFAULT_MASK, ...(o.mask || {}) },
      chroma: { ...DEFAULT_CHROMA, ...(o.chroma || {}) },
      filter: { ...base.filter, ...(o.filter || {}) },
      adjust: { ...DEFAULT_ADJUST, ...(o.adjust || {}) },
      keyframes: o.keyframes && typeof o.keyframes === 'object' ? o.keyframes : {},
    };
  });
  p.luts = raw.luts && typeof raw.luts === 'object' ? raw.luts : {};
  p.markers = raw.markers || [];
  p.unsupported = raw.unsupported || [];
  return p;
}
