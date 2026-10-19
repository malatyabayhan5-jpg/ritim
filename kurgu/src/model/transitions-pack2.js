// Geçiş paketi 2: ek geçişler (catalog.js TRANSITIONS biçiminde; `n` 100 ve
// üzeri). Shader kodu kurgu_fx/_transitions2.glsl, adlar src/i18n/packs/transitions2.
// Hepsi özgün çizimdir; numara grupları: 100 silme, 110 şekil, 120 perspektif,
// 130 hareket/kamera, 140 organik, 150 ışık, 160 dijital, 170 çarpıtma.
export const TRANSITIONS_PACK2 = [
  // Silme (ek)
  { id: 'fanWipe', n: 100, category: 'wipe', icon: 'pie-chart-outline' },
  { id: 'spiralWipe', n: 101, category: 'wipe', icon: 'sync-circle-outline' },
  { id: 'waveWipe', n: 102, category: 'wipe', icon: 'boat-outline' },
  { id: 'zigzagWipe', n: 103, category: 'wipe', icon: 'analytics-outline' },
  { id: 'diagonalBlinds', n: 104, category: 'wipe', icon: 'reorder-three-outline' },
  { id: 'softSweep', n: 105, category: 'wipe', icon: 'color-wand-outline' },
  // Şekil
  { id: 'polkaDots', n: 110, category: 'shape', icon: 'ellipse-outline' },
  { id: 'hexReveal', n: 111, category: 'shape', icon: 'football-outline' },
  { id: 'triangleReveal', n: 112, category: 'shape', icon: 'triangle-outline' },
  { id: 'crossOpen', n: 113, category: 'shape', icon: 'close-outline' },
  { id: 'shutter', n: 114, category: 'shape', icon: 'aperture-outline' },
  { id: 'rings', n: 115, category: 'shape', icon: 'disc-outline' },
  // Perspektif (3B)
  { id: 'cubeLeft', n: 120, category: 'perspective', icon: 'cube-outline' },
  { id: 'cubeUp', n: 121, category: 'perspective', icon: 'cube' },
  { id: 'flipH', n: 122, category: 'perspective', icon: 'swap-horizontal-outline' },
  { id: 'flipV', n: 123, category: 'perspective', icon: 'swap-vertical-outline' },
  { id: 'doorOpen', n: 124, category: 'perspective', icon: 'enter-outline' },
  { id: 'pageCurl', n: 125, category: 'perspective', icon: 'document-text-outline' },
  { id: 'tileFlip', n: 126, category: 'perspective', icon: 'albums-outline' },
  { id: 'accordion', n: 127, category: 'perspective', icon: 'reorder-two-outline' },
  // Hareket
  { id: 'split4', n: 130, category: 'motion', icon: 'move-outline' },
  { id: 'bounceIn', n: 131, category: 'motion', icon: 'basketball-outline' },
  { id: 'jellySlide', n: 132, category: 'motion', icon: 'arrow-back-circle-outline' },
  { id: 'swapCards', n: 133, category: 'motion', icon: 'repeat-outline' },
  { id: 'interleave', n: 134, category: 'motion', icon: 'shuffle-outline' },
  { id: 'filmStrip', n: 135, category: 'motion', icon: 'film-outline' },
  { id: 'swingIn', n: 136, category: 'motion', icon: 'arrow-redo-outline' },
  // Kamera (ek)
  { id: 'zoomPortal', n: 137, category: 'camera', icon: 'browsers-outline' },
  { id: 'spinBlur', n: 138, category: 'camera', icon: 'reload-outline' },
  // Organik
  { id: 'inkReveal', n: 140, category: 'organic', icon: 'brush-outline' },
  { id: 'smokeReveal', n: 141, category: 'organic', icon: 'cloud-outline' },
  { id: 'paperBurn', n: 142, category: 'organic', icon: 'bonfire-outline' },
  { id: 'melt', n: 143, category: 'organic', icon: 'color-fill-outline' },
  { id: 'windBlow', n: 144, category: 'organic', icon: 'leaf-outline' },
  { id: 'frostGlass', n: 145, category: 'organic', icon: 'snow-outline' },
  { id: 'waterDrop', n: 146, category: 'organic', icon: 'water' },
  // Işık
  { id: 'lightSweep', n: 150, category: 'light', icon: 'flashlight-outline' },
  { id: 'flashZoom', n: 151, category: 'light', icon: 'camera-outline' },
  { id: 'prismWipe', n: 152, category: 'light', icon: 'prism-outline' },
  { id: 'sunburst', n: 153, category: 'light', icon: 'sunny' },
  // Dijital
  { id: 'scanlines', n: 160, category: 'digital', icon: 'menu-outline' },
  { id: 'vhsRewind', n: 161, category: 'digital', icon: 'play-back-circle-outline' },
  { id: 'blockGlitch', n: 162, category: 'digital', icon: 'qr-code-outline' },
  { id: 'pixelStreak', n: 163, category: 'digital', icon: 'code-working-outline' },
  { id: 'halftone', n: 164, category: 'digital', icon: 'dice-outline' },
  { id: 'tvOff', n: 165, category: 'digital', icon: 'tv-outline' },
  // Çarpıtma
  { id: 'twirl', n: 170, category: 'warp', icon: 'planet-outline' },
  { id: 'lensBulge', n: 171, category: 'warp', icon: 'eye-outline' },
  { id: 'liquidMorph', n: 172, category: 'warp', icon: 'beaker-outline' },
  { id: 'kaleidoDissolve', n: 173, category: 'warp', icon: 'flower-outline' },
];
export const TRANSITION_CATEGORIES_PACK2 = ['shape', 'perspective', 'motion', 'organic', 'light', 'digital', 'warp'];
