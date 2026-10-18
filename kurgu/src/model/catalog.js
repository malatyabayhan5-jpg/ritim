// Geçiş, metin stili, metin animasyonu ve şablon katalogları. Hepsi özgün
// tanımlardır; adlar i18n anahtarlarıyla gösterilir. Yeni içerik eklemek için
// buraya bir satır ve üç dile çeviri eklemek yeterlidir.

export const TRANSITIONS = [
  { id: 'none', category: 'basic', icon: 'close-circle-outline' },
  { id: 'fade', category: 'basic', icon: 'contrast-outline' },
  { id: 'white', category: 'basic', icon: 'sunny-outline' },
  { id: 'flash', category: 'basic', icon: 'flash-outline' },
  { id: 'zoomIn', category: 'camera', icon: 'expand-outline' },
  { id: 'zoomOut', category: 'camera', icon: 'contract-outline' },
  { id: 'spin', category: 'camera', icon: 'sync-outline' },
  { id: 'slideLeft', category: 'slide', icon: 'arrow-back-outline' },
  { id: 'slideRight', category: 'slide', icon: 'arrow-forward-outline' },
  { id: 'slideUp', category: 'slide', icon: 'arrow-up-outline' },
  { id: 'slideDown', category: 'slide', icon: 'arrow-down-outline' },
  { id: 'glitch', category: 'effect', icon: 'pulse-outline' },
];

export const TRANSITION_CATEGORIES = ['basic', 'camera', 'slide', 'effect'];

// Geçiş süresi sınırları (ms)
export const TRANSITION_MIN_MS = 100;
export const TRANSITION_MAX_MS = 2000;

export const TEXT_PRESETS = [
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
export const TEXT_LAYOUTS = [
  { id: 'title', textKey: 'text.sample.title', y: 0.15, style: { size: 0.075, font: 'display' }, animIn: 'pop', animOut: 'fade' },
  { id: 'lowerThird', textKey: 'text.sample.lowerThird', y: -0.62, style: { size: 0.04, background: '#000000B3', align: 'center' }, animIn: 'slideLeft', animOut: 'fade' },
  { id: 'caption', textKey: 'text.sample.caption', y: -0.78, style: { size: 0.038, background: '#00000080', bold: false }, animIn: 'fade', animOut: 'fade' },
  { id: 'credits', textKey: 'text.sample.credits', y: 0, style: { size: 0.035, bold: false, font: 'serif' }, animIn: 'slideUp', animOut: 'fade' },
  { id: 'cta', textKey: 'text.sample.cta', y: -0.4, style: { size: 0.05, color: '#111111FF', background: '#FFD60AFF' }, animIn: 'pop', animOut: 'pop' },
];

export const TEXT_ANIMATIONS_IN = ['none', 'fade', 'pop', 'slideUp', 'slideLeft', 'typewriter'];
export const TEXT_ANIMATIONS_OUT = ['none', 'fade', 'pop', 'slideUp', 'slideLeft'];

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
