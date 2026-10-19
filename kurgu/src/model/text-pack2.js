// Metin paketi 2: ek metin şablonları ve stilleri (catalog.js TEXT_PRESETS /
// TEXT_LAYOUTS biçiminde). Adlar src/i18n/packs/text2 altında:
//   text.preset.*, text.layout.*, text.sample.* (kimliğe göre) ve text.category.*.
// Hepsi Kurgu'ya özgün tasarımlardır. Renkler '#RRGGBBAA', boyutlar kare yüksekliğine
// oran; gelişmiş alanlar (color2, shadow*, box*, deco*) schema.js DEFAULT_TEXT_STYLE'da.

// Sık kullanılan görünüm parçaları
const NO_SHADOW = { shadow: false };
const SOFT_SHADOW = { shadow: true, shadowColor: '#00000099', shadowBlur: 0.22, shadowX: 0, shadowY: 0.06 };
const glow = (c, blur = 0.32) => ({ shadow: true, shadowColor: c, shadowBlur: blur, shadowX: 0, shadowY: 0 });
const hard = (c, d = 0.06) => ({ shadow: true, shadowColor: c, shadowBlur: 0, shadowX: d, shadowY: d });

// --- Stiller (Stil sekmesi): yalnızca görünüm; boyut ve hizalama korunur ---
export const TEXT_PRESETS_PACK2 = [
  // Sade / zarif
  { id: 'softShadow', category: 'minimal', style: { color: '#FFFFFFFF', bold: true, ...SOFT_SHADOW } },
  { id: 'thinSpaced', category: 'minimal', style: { color: '#FFFFFFFF', font: 'light', bold: false, letterSpacing: 0.25, ...SOFT_SHADOW } },
  { id: 'editorial', category: 'minimal', style: { color: '#FFFFFFFF', font: 'serif', bold: false, letterSpacing: 0.02, deco: 'rules', decoColor: '#FFFFFFCC', ...SOFT_SHADOW } },
  { id: 'inkOnWhite', category: 'minimal', style: { color: '#111111FF', background: '#FFFFFFFF', font: 'light', bold: false, boxRadius: 0, boxPad: 0.45, ...NO_SHADOW } },
  { id: 'hollow', category: 'minimal', style: { color: '#00000000', stroke: '#FFFFFFFF', strokeWidth: 0.0022, font: 'display', bold: true, ...NO_SHADOW } },
  { id: 'paper', category: 'quote', style: { color: '#2B2118FF', background: '#F4EBDCF2', font: 'serif', bold: false, boxRadius: 0.06, boxPad: 0.5, ...NO_SHADOW } },
  // Vurgu kutuları
  { id: 'markerYellow', category: 'caption', style: { color: '#111111FF', background: '#FFE24AFF', boxStyle: 'lines', boxRadius: 0.08, boxPad: 0.22, bold: true, ...NO_SHADOW } },
  { id: 'markerWhite', category: 'caption', style: { color: '#111111FF', background: '#FFFFFFF2', boxStyle: 'lines', boxRadius: 0.08, boxPad: 0.22, bold: true, ...NO_SHADOW } },
  { id: 'captionBand', category: 'caption', style: { color: '#FFFFFFFF', background: '#000000B3', boxStyle: 'lines', boxRadius: 0.16, boxPad: 0.28, bold: false, ...NO_SHADOW } },
  { id: 'pillBlue', category: 'social', style: { color: '#FFFFFFFF', background: '#2F6BFFFF', boxRadius: 1, boxPad: 0.5, bold: true, ...NO_SHADOW } },
  { id: 'pillPastel', category: 'social', style: { color: '#4A2B5EFF', background: '#FFD6E8FF', boxRadius: 1, boxPad: 0.5, font: 'casual', bold: true, ...NO_SHADOW } },
  { id: 'pillFrame', category: 'label', style: { color: '#FFFFFFFF', background: '#FFFFFFFF', boxStyle: 'frame', boxRadius: 1, boxPad: 0.5, bold: true, ...SOFT_SHADOW } },
  { id: 'glassDark', category: 'lowerThird', style: { color: '#FFFFFFFF', background: '#0E0E12B8', boxRadius: 0.45, boxPad: 0.5, font: 'light', bold: false, ...NO_SHADOW } },
  { id: 'redLabel', category: 'label', style: { color: '#FFFFFFFF', background: '#E5262DFF', font: 'condensed', bold: true, letterSpacing: 0.08, boxRadius: 0.12, boxPad: 0.3, ...NO_SHADOW } },
  // Süslü
  { id: 'accentBar', category: 'lowerThird', style: { color: '#FFFFFFFF', bold: true, deco: 'bar', decoColor: '#FF3B30FF', ...SOFT_SHADOW } },
  { id: 'goldUnderline', category: 'title', style: { color: '#FFFFFFFF', bold: true, deco: 'underline', decoColor: '#FFC940FF', ...SOFT_SHADOW } },
  { id: 'techBrackets', category: 'gaming', style: { color: '#7CF9FFFF', font: 'mono', bold: true, deco: 'brackets', decoColor: '#7CF9FFFF', ...glow('#00C8FFAA', 0.25) } },
  // Geçişli renkler
  { id: 'sunset', category: 'retro', style: { color: '#FFE07AFF', color2: '#FF4F7BFF', font: 'display', bold: true, ...SOFT_SHADOW } },
  { id: 'ocean', category: 'travel', style: { color: '#9AF6FFFF', color2: '#3A7BFFFF', font: 'display', bold: true, ...SOFT_SHADOW } },
  { id: 'goldFoil', category: 'wedding', style: { color: '#FFF3C4FF', color2: '#C8902AFF', font: 'serif', bold: true, ...SOFT_SHADOW } },
  { id: 'chrome', category: 'retro', style: { color: '#FFFFFFFF', color2: '#7D8AA8FF', stroke: '#1A1F33FF', strokeWidth: 0.0035, font: 'display', bold: true, ...hard('#1A1F33FF', 0.05) } },
  // Neon
  { id: 'neonPink', category: 'retro', style: { color: '#FFE9F6FF', stroke: '#FF2EA6FF', strokeWidth: 0.0018, font: 'condensed', bold: true, ...glow('#FF2EA6FF') } },
  { id: 'neonCyan', category: 'gaming', style: { color: '#E9FFFFFF', stroke: '#00E5FFFF', strokeWidth: 0.0018, font: 'condensed', bold: true, ...glow('#00E5FFFF') } },
  { id: 'neonLime', category: 'gaming', style: { color: '#F6FFE6FF', stroke: '#9BFF2EFF', strokeWidth: 0.0018, font: 'condensed', bold: true, ...glow('#9BFF2EFF') } },
  { id: 'terminal', category: 'gaming', style: { color: '#39FF88FF', background: '#07100BE6', font: 'mono', bold: false, boxRadius: 0.1, ...glow('#39FF8866', 0.18) } },
  // Kalın / retro
  { id: 'retroPop', category: 'retro', style: { color: '#FFE14DFF', font: 'display', bold: true, ...hard('#D7263DFF') } },
  { id: 'arcade', category: 'gaming', style: { color: '#FFE14DFF', stroke: '#2B0B3AFF', strokeWidth: 0.004, font: 'mono', bold: true, ...hard('#FF2E63FF', 0.07) } },
  { id: 'vintageCream', category: 'retro', style: { color: '#F3E3C3FF', font: 'serif', bold: true, ...hard('#7A3E1DFF', 0.045) } },
  { id: 'comic', category: 'vlog', style: { color: '#FFFFFFFF', stroke: '#111111FF', strokeWidth: 0.006, font: 'casual', bold: true, ...hard('#111111FF', 0.07) } },
  { id: 'sticker', category: 'vlog', style: { color: '#1B1B1BFF', stroke: '#FFFFFFFF', strokeWidth: 0.008, font: 'display', bold: true, ...SOFT_SHADOW } },
  // El yazısı
  { id: 'scriptGold', category: 'wedding', style: { color: '#FFE3A3FF', font: 'cursive', bold: false, ...SOFT_SHADOW } },
  { id: 'scriptGlow', category: 'wedding', style: { color: '#FFFFFFFF', font: 'cursive', bold: false, ...glow('#FFFFFFAA', 0.22) } },
];

// --- Şablonlar (Şablonlar sekmesi): konum, görünüm, animasyon ve örnek metin ---
export const TEXT_LAYOUT_CATEGORIES = [
  'title', 'lowerThird', 'caption', 'social', 'quote', 'label', 'news',
  'wedding', 'travel', 'vlog', 'gaming', 'minimal', 'retro',
];

// Temel düzenlerin (catalog.js) kategorileri
export const TEXT_LAYOUT_BASE_CATEGORY = { title: 'title', lowerThird: 'lowerThird', caption: 'caption', credits: 'minimal', cta: 'social' };

const L = (id, category, y, style, animIn, animOut, animLoop = 'none') => ({
  id,
  category,
  textKey: `text.sample.${id}`,
  y,
  style,
  animIn,
  animOut,
  animLoop,
});

export const TEXT_LAYOUTS_PACK2 = [
  // Başlıklar
  L('titleCinematic', 'title', 0.05, { size: 0.05, font: 'light', bold: false, letterSpacing: 0.35, ...SOFT_SHADOW }, 'blur', 'fade'),
  L('titleGradient', 'title', 0.12, { size: 0.085, color: '#FFE07AFF', color2: '#FF4F7BFF', font: 'display', ...SOFT_SHADOW }, 'elastic', 'zoomIn'),
  L('titleSerifRules', 'title', 0.1, { size: 0.058, font: 'serif', bold: false, letterSpacing: 0.04, deco: 'rules', decoColor: '#FFFFFFCC', ...SOFT_SHADOW }, 'letterFade', 'fade'),
  L('titleStacked', 'title', 0.1, { size: 0.09, font: 'display', lineHeight: 1.0, ...SOFT_SHADOW }, 'wordRise', 'slideUp'),
  L('titleHollow', 'title', 0.1, { size: 0.1, color: '#00000000', stroke: '#FFFFFFFF', strokeWidth: 0.0025, font: 'display', ...NO_SHADOW }, 'zoomOut', 'blur'),
  // Alt bantlar
  L('ltBar', 'lowerThird', -0.6, { size: 0.036, align: 'left', background: '#111111D9', boxRadius: 0.12, boxPad: 0.4, deco: 'bar', decoColor: '#FF3B30FF', ...NO_SHADOW }, 'slideRight', 'slideLeft'),
  L('ltMinimal', 'lowerThird', -0.6, { size: 0.036, align: 'left', font: 'light', bold: false, deco: 'bar', decoColor: '#FFFFFFFF', ...SOFT_SHADOW }, 'wordRise', 'fade'),
  L('ltPill', 'lowerThird', -0.62, { size: 0.034, background: '#2F6BFFFF', boxRadius: 1, boxPad: 0.5, ...NO_SHADOW }, 'elastic', 'zoomOut'),
  L('ltUnderline', 'lowerThird', -0.6, { size: 0.038, align: 'left', deco: 'underline', decoColor: '#FFD60AFF', ...SOFT_SHADOW }, 'letterFade', 'fade'),
  L('ltGlass', 'lowerThird', -0.6, { size: 0.034, font: 'light', bold: false, background: '#0E0E12B8', boxRadius: 0.45, boxPad: 0.5, ...NO_SHADOW }, 'blur', 'blur'),
  // Altyazılar
  L('capBand', 'caption', -0.75, { size: 0.036, bold: false, background: '#000000B3', boxStyle: 'lines', boxRadius: 0.16, boxPad: 0.28, ...NO_SHADOW }, 'fade', 'fade'),
  L('capMarker', 'caption', -0.75, { size: 0.038, color: '#111111FF', background: '#FFE24AFF', boxStyle: 'lines', boxRadius: 0.08, boxPad: 0.22, ...NO_SHADOW }, 'pop', 'fade'),
  L('capOutline', 'caption', -0.75, { size: 0.04, stroke: '#000000FF', strokeWidth: 0.004, ...SOFT_SHADOW }, 'fade', 'fade'),
  L('capWordPop', 'caption', -0.7, { size: 0.048, font: 'display', stroke: '#000000FF', strokeWidth: 0.005, ...SOFT_SHADOW }, 'wordRise', 'fade'),
  // Sosyal medya çağrıları
  L('ctaSubscribe', 'social', -0.45, { size: 0.045, font: 'display', background: '#FF0033FF', boxRadius: 1, boxPad: 0.55, letterSpacing: 0.04, ...NO_SHADOW }, 'elastic', 'zoomOut', 'pulse'),
  L('ctaFollow', 'social', -0.45, { size: 0.04, color: '#111111FF', background: '#FFFFFFFF', boxRadius: 1, boxPad: 0.5, ...NO_SHADOW }, 'bounce', 'fade', 'float'),
  L('ctaLink', 'social', -0.55, { size: 0.036, deco: 'underline', decoColor: '#7CF9FFFF', ...SOFT_SHADOW }, 'slideUp', 'fade', 'float'),
  L('ctaLike', 'social', -0.45, { size: 0.042, background: '#FF3D7FFF', boxRadius: 0.35, boxPad: 0.45, ...NO_SHADOW }, 'pop', 'pop', 'pulse'),
  L('ctaSwipe', 'social', -0.82, { size: 0.03, font: 'light', bold: false, letterSpacing: 0.3, ...SOFT_SHADOW }, 'fade', 'fade', 'float'),
  // Alıntılar
  L('quoteSerif', 'quote', 0, { size: 0.045, font: 'serif', bold: false, italic: true, lineHeight: 1.35, ...SOFT_SHADOW }, 'letterFade', 'fade'),
  L('quotePaper', 'quote', 0, { size: 0.04, color: '#2B2118FF', background: '#F4EBDCF2', font: 'serif', bold: false, lineHeight: 1.35, boxRadius: 0.06, boxPad: 0.6, ...NO_SHADOW }, 'wordRise', 'fade'),
  L('quoteScript', 'quote', 0.05, { size: 0.065, font: 'cursive', bold: false, ...glow('#FFFFFF99', 0.22) }, 'blur', 'blur'),
  L('quoteBrackets', 'quote', 0, { size: 0.04, font: 'light', bold: false, lineHeight: 1.3, deco: 'brackets', decoColor: '#FFFFFFFF', ...SOFT_SHADOW }, 'typeCursor', 'fade'),
  // Etiketler
  L('badgeNew', 'label', 0.62, { size: 0.032, font: 'condensed', letterSpacing: 0.1, background: '#E5262DFF', boxRadius: 0.15, boxPad: 0.32, ...NO_SHADOW }, 'elastic', 'zoomOut', 'pulse'),
  L('badgeLive', 'label', 0.78, { size: 0.03, font: 'condensed', letterSpacing: 0.12, background: '#FF2D55FF', boxRadius: 0.2, boxPad: 0.32, ...NO_SHADOW }, 'pop', 'fade', 'buzz'),
  L('badgeSale', 'label', 0.4, { size: 0.06, font: 'display', color: '#111111FF', background: '#FFE24AFF', boxRadius: 0.1, boxPad: 0.35, ...NO_SHADOW }, 'rotate', 'zoomOut', 'swing'),
  L('badgeTag', 'label', 0.62, { size: 0.032, font: 'mono', background: '#FFFFFFFF', boxStyle: 'frame', boxRadius: 1, boxPad: 0.5, ...SOFT_SHADOW }, 'typeCursor', 'typewriter'),
  L('badgeEpisode', 'label', 0.78, { size: 0.028, font: 'mono', letterSpacing: 0.2, background: '#FFFFFFFF', boxStyle: 'frame', boxRadius: 0, boxPad: 0.4, ...NO_SHADOW }, 'letterFade', 'fade'),
  // Haber
  L('newsBreaking', 'news', -0.5, { size: 0.042, font: 'condensed', letterSpacing: 0.06, background: '#C8102EFF', boxRadius: 0, boxPad: 0.35, deco: 'bar', decoColor: '#FFFFFFFF', ...NO_SHADOW }, 'slideRight', 'slideLeft'),
  L('newsHeadline', 'news', -0.66, { size: 0.034, color: '#111111FF', background: '#FFFFFFF2', boxRadius: 0, boxPad: 0.4, deco: 'bar', decoColor: '#C8102EFF', ...NO_SHADOW }, 'slideUp', 'fade'),
  L('newsTicker', 'news', -0.86, { size: 0.024, font: 'condensed', letterSpacing: 0.08, background: '#0A2A66E6', boxRadius: 0, boxPad: 0.35, ...NO_SHADOW }, 'slideLeft', 'slideLeft'),
  L('newsLocation', 'news', 0.8, { size: 0.03, font: 'condensed', letterSpacing: 0.12, deco: 'bar', decoColor: '#FFD60AFF', ...SOFT_SHADOW }, 'typeCursor', 'fade'),
  // Düğün
  L('weddingScript', 'wedding', 0.08, { size: 0.075, color: '#FFF6E8FF', font: 'cursive', bold: false, ...glow('#E8C27AAA', 0.24) }, 'blur', 'fade'),
  L('weddingDate', 'wedding', -0.1, { size: 0.03, font: 'serif', bold: false, letterSpacing: 0.3, deco: 'rules', decoColor: '#E8C27AFF', ...SOFT_SHADOW }, 'letterFade', 'fade'),
  L('weddingGold', 'wedding', 0.1, { size: 0.065, color: '#FFF3C4FF', color2: '#C8902AFF', font: 'serif', ...SOFT_SHADOW }, 'zoomOut', 'fade', 'float'),
  // Seyahat
  L('travelPlace', 'travel', 0.1, { size: 0.068, font: 'display', letterSpacing: 0.06, ...SOFT_SHADOW }, 'letterFade', 'blur'),
  L('travelPostcard', 'travel', 0.3, { size: 0.065, font: 'cursive', bold: false, deco: 'underline', decoColor: '#FFC940FF', ...SOFT_SHADOW }, 'bounce', 'fade'),
  L('travelCoords', 'travel', -0.75, { size: 0.026, font: 'mono', bold: false, letterSpacing: 0.12, ...SOFT_SHADOW }, 'typeCursor', 'fade'),
  // Vlog
  L('vlogDay', 'vlog', 0.55, { size: 0.065, font: 'casual', stroke: '#111111FF', strokeWidth: 0.006, ...hard('#111111FF', 0.07) }, 'bounce', 'zoomIn'),
  L('vlogSticker', 'vlog', 0.3, { size: 0.055, color: '#1B1B1BFF', stroke: '#FFFFFFFF', strokeWidth: 0.008, font: 'display', ...SOFT_SHADOW }, 'elastic', 'zoomOut', 'swing'),
  L('vlogTime', 'vlog', 0.75, { size: 0.034, font: 'mono', background: '#000000A6', boxRadius: 0.25, boxPad: 0.35, ...NO_SHADOW }, 'typeCursor', 'fade'),
  L('vlogNote', 'vlog', -0.3, { size: 0.06, color: '#FFE3A3FF', font: 'cursive', bold: false, ...SOFT_SHADOW }, 'wave', 'fade'),
  // Oyun
  L('gameLevel', 'gaming', 0.15, { size: 0.07, color: '#FFE14DFF', stroke: '#2B0B3AFF', strokeWidth: 0.004, font: 'display', ...hard('#FF2E63FF', 0.07) }, 'elastic', 'zoomIn', 'pulse'),
  L('gameNeon', 'gaming', 0.1, { size: 0.075, color: '#E9FFFFFF', stroke: '#00E5FFFF', strokeWidth: 0.0018, font: 'condensed', ...glow('#00E5FFFF') }, 'flicker', 'flicker', 'buzz'),
  L('gameHud', 'gaming', -0.4, { size: 0.036, color: '#7CF9FFFF', font: 'mono', deco: 'brackets', decoColor: '#7CF9FFFF', ...glow('#00C8FFAA', 0.25) }, 'typeCursor', 'typewriter'),
  L('gameOver', 'gaming', 0.1, { size: 0.075, color: '#FF2E63FF', font: 'display', ...glow('#FF2E63CC', 0.3) }, 'shake', 'blur'),
  // Sade
  L('minimalSpaced', 'minimal', 0.05, { size: 0.034, font: 'light', bold: false, letterSpacing: 0.45, ...SOFT_SHADOW }, 'letterFade', 'letterFade'),
  L('minimalLower', 'minimal', -0.2, { size: 0.045, bold: false, deco: 'underline', decoColor: '#FFFFFFFF', ...SOFT_SHADOW }, 'wordRise', 'wordRise'),
  L('minimalInk', 'minimal', 0, { size: 0.04, color: '#111111FF', background: '#FFFFFFFF', font: 'light', bold: false, boxRadius: 0, boxPad: 0.45, ...NO_SHADOW }, 'fade', 'fade'),
  L('minimalCorner', 'minimal', -0.86, { size: 0.024, color: '#FFFFFFD9', bold: false, letterSpacing: 0.25, ...SOFT_SHADOW }, 'fade', 'fade'),
  // Retro / neon
  L('retroSunset', 'retro', 0.1, { size: 0.09, color: '#FFE07AFF', color2: '#FF4F7BFF', font: 'display', ...hard('#3B1C5AFF', 0.06) }, 'zoomOut', 'zoomIn', 'float'),
  L('retroNeonSign', 'retro', 0.15, { size: 0.08, color: '#FFE9F6FF', stroke: '#FF2EA6FF', strokeWidth: 0.0018, font: 'cursive', bold: false, ...glow('#FF2EA6FF') }, 'flicker', 'flicker', 'buzz'),
  L('retroArcade', 'retro', 0.6, { size: 0.045, color: '#FFE14DFF', stroke: '#2B0B3AFF', strokeWidth: 0.004, font: 'mono', ...hard('#FF2E63FF', 0.07) }, 'typewriter', 'typewriter'),
  L('retroChrome', 'retro', 0.1, { size: 0.12, color: '#FFFFFFFF', color2: '#7D8AA8FF', stroke: '#1A1F33FF', strokeWidth: 0.0035, font: 'display', ...hard('#1A1F33FF', 0.05) }, 'rotate', 'zoomIn'),
  L('retroVhs', 'retro', 0.8, { size: 0.034, font: 'mono', letterSpacing: 0.1, ...glow('#FFFFFF88', 0.2) }, 'flicker', 'flicker', 'buzz'),
];
