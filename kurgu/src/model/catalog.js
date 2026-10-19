// Geçiş, metin stili, metin animasyonu ve şablon katalogları. Hepsi özgün
// tanımlardır; adlar i18n anahtarlarıyla gösterilir. Yeni içerik eklemek için
// buraya bir satır ve üç dile çeviri eklemek yeterlidir.

import { TRANSITIONS_PACK2, TRANSITION_CATEGORIES_PACK2 } from './transitions-pack2';
import { TEXT_PRESETS_PACK2, TEXT_LAYOUTS_PACK2 } from './text-pack2';

// Geçişler: gerçek A/B karışımı. `n`, katman shader'ındaki tür numarasıdır
// (modules/kurgu-engine/.../kurgu_fx/_transitions.glsl). Tümü özgün çizimdir.
export const TRANSITIONS_BASE = [
  { id: 'none', n: 0, category: 'basic', icon: 'close-circle-outline' },
  { id: 'dissolve', n: 1, category: 'basic', icon: 'git-merge-outline' },
  { id: 'fade', n: 2, category: 'basic', icon: 'contrast-outline' },
  { id: 'white', n: 3, category: 'basic', icon: 'sunny-outline' },
  { id: 'flash', n: 4, category: 'basic', icon: 'flash-outline' },
  { id: 'blurDissolve', n: 5, category: 'basic', icon: 'water-outline' },
  { id: 'lumaFade', n: 6, category: 'basic', icon: 'invert-mode-outline' },
  { id: 'wipeLeft', n: 10, category: 'wipe', icon: 'arrow-back-outline' },
  { id: 'wipeRight', n: 11, category: 'wipe', icon: 'arrow-forward-outline' },
  { id: 'wipeUp', n: 12, category: 'wipe', icon: 'arrow-up-outline' },
  { id: 'wipeDown', n: 13, category: 'wipe', icon: 'arrow-down-outline' },
  { id: 'wipeDiagonal', n: 14, category: 'wipe', icon: 'trending-up-outline' },
  { id: 'irisOpen', n: 15, category: 'wipe', icon: 'radio-button-on-outline' },
  { id: 'irisClose', n: 16, category: 'wipe', icon: 'radio-button-off-outline' },
  { id: 'clockWipe', n: 17, category: 'wipe', icon: 'time-outline' },
  { id: 'blinds', n: 18, category: 'wipe', icon: 'reorder-four-outline' },
  { id: 'checker', n: 19, category: 'wipe', icon: 'grid-outline' },
  { id: 'noiseDissolve', n: 20, category: 'wipe', icon: 'sparkles-outline' },
  { id: 'splitH', n: 21, category: 'wipe', icon: 'code-outline' },
  { id: 'splitV', n: 22, category: 'wipe', icon: 'resize-outline' },
  { id: 'heartWipe', n: 23, category: 'wipe', icon: 'heart-outline' },
  { id: 'starWipe', n: 24, category: 'wipe', icon: 'star-outline' },
  { id: 'stripes', n: 25, category: 'wipe', icon: 'barcode-outline' },
  { id: 'diamond', n: 26, category: 'wipe', icon: 'diamond-outline' },
  { id: 'slideLeft', n: 30, category: 'slide', icon: 'arrow-back-outline' },
  { id: 'slideRight', n: 31, category: 'slide', icon: 'arrow-forward-outline' },
  { id: 'slideUp', n: 32, category: 'slide', icon: 'arrow-up-outline' },
  { id: 'slideDown', n: 33, category: 'slide', icon: 'arrow-down-outline' },
  { id: 'pushLeft', n: 34, category: 'slide', icon: 'play-back-outline' },
  { id: 'pushRight', n: 35, category: 'slide', icon: 'play-forward-outline' },
  { id: 'pushUp', n: 36, category: 'slide', icon: 'chevron-up-circle-outline' },
  { id: 'pushDown', n: 37, category: 'slide', icon: 'chevron-down-circle-outline' },
  { id: 'zoomIn', n: 40, category: 'camera', icon: 'expand-outline' },
  { id: 'zoomOut', n: 41, category: 'camera', icon: 'contract-outline' },
  { id: 'spin', n: 42, category: 'camera', icon: 'sync-outline' },
  { id: 'whipLeft', n: 43, category: 'camera', icon: 'play-skip-back-outline' },
  { id: 'whipRight', n: 44, category: 'camera', icon: 'play-skip-forward-outline' },
  { id: 'crossZoom', n: 45, category: 'camera', icon: 'scan-outline' },
  { id: 'ripple', n: 46, category: 'camera', icon: 'water-outline' },
  { id: 'glitch', n: 50, category: 'effect', icon: 'pulse-outline' },
  { id: 'lightLeak', n: 51, category: 'effect', icon: 'partly-sunny-outline' },
  { id: 'filmBurn', n: 52, category: 'effect', icon: 'flame-outline' },
  { id: 'pixelate', n: 53, category: 'effect', icon: 'apps-outline' },
  { id: 'rgbSplit', n: 54, category: 'effect', icon: 'color-filter-outline' },
];

export const TRANSITIONS = [...TRANSITIONS_BASE, ...TRANSITIONS_PACK2];
export const TRANSITION_CATEGORIES = [...new Set(['basic', 'wipe', 'slide', 'camera', 'effect', ...TRANSITION_CATEGORIES_PACK2])];

// Geçiş süresi sınırları (ms)
export const TRANSITION_MIN_MS = 100;
export const TRANSITION_MAX_MS = 2000;

export const TEXT_PRESETS_BASE = [
  { id: 'plain', style: { color: '#FFFFFFFF', shadow: true, bold: true } },
  { id: 'outline', style: { color: '#FFFFFFFF', stroke: '#000000FF', strokeWidth: 0.004, shadow: false, bold: true } },
  { id: 'boxDark', style: { color: '#FFFFFFFF', background: '#000000B3', shadow: false, bold: true } },
  { id: 'boxLight', style: { color: '#111111FF', background: '#FFFFFFE6', shadow: false, bold: true } },
  { id: 'accent', style: { color: '#FFD60AFF', stroke: '#000000FF', strokeWidth: 0.003, bold: true, font: 'display' } },
  { id: 'neon', style: { color: '#7CF9FFFF', stroke: '#1B6CFFFF', strokeWidth: 0.003, shadow: true, font: 'condensed' } },
  { id: 'serif', style: { color: '#FFFFFFFF', font: 'serif', bold: false, italic: true, shadow: true } },
  { id: 'mono', style: { color: '#E6FFE6FF', font: 'mono', bold: false, background: '#00000099' } },
  { id: 'pink', style: { color: '#FFFFFFFF', background: '#FF3D7FE6', bold: true, shadow: false } },
  { id: 'subtitle', style: { color: '#FFFFFFFF', background: '#00000080', bold: false, size: 0.04 } },
];

// Hazır metin düzenleri: alt bant, başlık, jenerik
export const TEXT_LAYOUTS_BASE = [
  { id: 'title', textKey: 'text.sample.title', y: 0.15, style: { size: 0.075, font: 'display' }, animIn: 'pop', animOut: 'fade' },
  { id: 'lowerThird', textKey: 'text.sample.lowerThird', y: -0.62, style: { size: 0.04, background: '#000000B3', align: 'center' }, animIn: 'slideLeft', animOut: 'fade' },
  { id: 'caption', textKey: 'text.sample.caption', y: -0.78, style: { size: 0.038, background: '#00000080', bold: false }, animIn: 'fade', animOut: 'fade' },
  { id: 'credits', textKey: 'text.sample.credits', y: 0, style: { size: 0.035, bold: false, font: 'serif' }, animIn: 'slideUp', animOut: 'fade' },
  { id: 'cta', textKey: 'text.sample.cta', y: -0.4, style: { size: 0.05, color: '#111111FF', background: '#FFD60AFF' }, animIn: 'pop', animOut: 'pop' },
];

export const TEXT_PRESETS = [...TEXT_PRESETS_BASE, ...TEXT_PRESETS_PACK2];
export const TEXT_LAYOUTS = [...TEXT_LAYOUTS_BASE, ...TEXT_LAYOUTS_PACK2];

// Metin animasyonları: yerel çizim modules/kurgu-engine/.../TextLayer.kt, hesap anim/TextAnim.java.
// Bütün metin (katman), kelime/harf (önbellekten parça kopyası), bulanıklık ve daktilo türleri vardır.
const TEXT_ANIMATIONS_SHARED = [
  'slideDown', 'slideRight', 'zoomIn', 'zoomOut', 'rotate', 'bounce', 'elastic',
  'blur', 'flicker', 'shake', 'wordRise', 'letterFade', 'wave',
];
export const TEXT_ANIMATIONS_IN = ['none', 'fade', 'pop', 'slideUp', 'slideLeft', 'typewriter', ...TEXT_ANIMATIONS_SHARED, 'typeCursor'];
export const TEXT_ANIMATIONS_OUT = ['none', 'fade', 'pop', 'slideUp', 'slideLeft', ...TEXT_ANIMATIONS_SHARED, 'typewriter', 'typeCursor'];
// Metnin ekranda kaldığı süre boyunca süren döngü animasyonları
export const TEXT_ANIMATIONS_LOOP = ['none', 'pulse', 'float', 'swing', 'waveLoop', 'buzz'];

export const FONTS = ['sans', 'display', 'condensed', 'light', 'serif', 'mono', 'casual', 'cursive'];

export const TEXT_COLORS = [
  '#FFFFFFFF', '#000000FF', '#FFD60AFF', '#FF3D7FFF', '#FF453AFF', '#FF9F0AFF',
  '#30D158FF', '#64D2FFFF', '#0A84FFFF', '#BF5AF2FF', '#8E8E93FF', '#7CF9FFFF',
];

/**
 * Şablonlar: seçildiğinde kullanıcıdan medya istenir ve gerçek, düzenlenebilir
 * bir proje oluşturulur (klipler, metinler, geçişler, filtreler normal proje öğeleridir).
 */
export const TEMPLATES = [
  {
    id: 'storyIntro',
    ratio: '9:16',
    slots: [2500, 2000, 2000, 2500],
    transition: 'fade',
    filter: 'vivid',
    texts: [{ layout: 'title', at: 0, duration: 2300 }],
  },
  {
    id: 'travel',
    ratio: '9:16',
    slots: [1500, 1500, 1500, 1500, 1500, 2500],
    transition: 'slideLeft',
    filter: 'golden',
    texts: [{ layout: 'title', at: 300, duration: 2000 }, { layout: 'caption', at: 7500, duration: 2000 }],
  },
  {
    id: 'youtubeIntro',
    ratio: '16:9',
    slots: [3000, 3000, 3000],
    transition: 'zoomIn',
    filter: 'cinema',
    texts: [{ layout: 'title', at: 0, duration: 2800 }, { layout: 'lowerThird', at: 3200, duration: 3000 }],
  },
  {
    id: 'squarePromo',
    ratio: '1:1',
    slots: [2000, 2000, 2000],
    transition: 'flash',
    filter: 'pop',
    texts: [{ layout: 'cta', at: 3500, duration: 2500 }],
  },
  {
    id: 'news',
    ratio: '16:9',
    slots: [4000, 4000],
    transition: 'white',
    filter: 'natural',
    texts: [{ layout: 'lowerThird', at: 400, duration: 3400 }, { layout: 'caption', at: 4400, duration: 3400 }],
  },
  {
    id: 'memories',
    ratio: '4:5',
    slots: [3000, 3000, 3000, 3000],
    transition: 'fade',
    filter: 'vintage',
    texts: [{ layout: 'credits', at: 9000, duration: 3000 }],
  },
];

export const ASPECT_OPTIONS = ['9:16', '16:9', '1:1', '4:5', '4:3', '3:4', '21:9'];
