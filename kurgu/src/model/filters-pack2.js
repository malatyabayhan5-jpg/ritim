// Filtre paketi 2: ek filtreler (color.js FILTERS biçiminde). Adlar
// src/i18n/packs/filters2 altında. Kategoriler FILTER_CATEGORIES'e eklenir.
//
// Tüm görünümler bu proje için özgün olarak tasarlandı; hiçbir ürünün hazır
// ayarı kopyalanmadı. Matrisler color-math.js yapı taşlarıyla, soldan sağa
// uygulanan adımlar olarak kurulur. Katmanlar yalnızca matrisi kullandığı için
// görünümün asıl kısmı matriste; fx (vinyet, gren, ışık/gölge…) yalnızca süs.
// Değerler gamaya göre kodlanmış [0,1] RGB içindir (orta ton ≈ 0.46).

import { axis, compose, contrast, duo, gain, hue, mix, mono, offset, rows, sat, temp, tint, tone } from './color-math';

// Turuncu (ten) ↔ camgöbeği ekseni: sinematik turuncu-camgöbeği ayrımı
const ORANGE = [1, 0.45, -0.7];
// Mavi ↔ sarı ekseni: gökyüzü ve su (tenleri bir miktar ısıtır)
const BLUE = [-0.7, -0.1, 1];
// Yeşil ↔ eflatun ekseni ten rengine neredeyse diktir: yeşilleri ten bozulmadan canlandırır
const GREEN = [-0.5, 1, -0.5];
// Yeşilleri sarıya/altına kaydırır, kırmızılara ve grilere dokunmaz (R += k·(G−B))
const GOLD = (k) => rows([1, k, -k], [0, 1, 0], [0, 0, 1]);

const F = (id, category, matrix, fx) => (fx ? { id, category, matrix, fx } : { id, category, matrix });

export const FILTERS_PACK2 = [
  // --- Portre: ten rengini doğal tutan, yumuşak görünümler ---
  F('skinGlow', 'portrait', compose(temp(0.35), sat(1.06), contrast(0.92), offset(0.025)), { highlights: 0.12 }),
  F('peach', 'portrait', compose(sat(0.94), tint(0.2), tone([0.04, 0.02, 0.03], [1.04, 0.93, 0.87]))),
  F('porcelain', 'portrait', compose(sat(0.85), temp(-0.25), tint(0.15), contrast(0.92), gain(1.05))),
  F('honey', 'portrait', compose(gain(1.02, 1.03, 0.87), offset(0.035, 0.025, 0), contrast(0.97))),
  F('rosy', 'portrait', compose(tint(0.5), temp(0.2), sat(1.04), offset(0.02, 0, 0.015))),
  F('softLight', 'portrait', compose(contrast(0.82), sat(0.95), temp(0.35), gain(1.08), offset(0.02)), { highlights: 0.1 }),
  F('bronze', 'portrait', compose(temp(0.45), tint(0.1), sat(1.12), contrast(1.15), gain(0.94)), { vignette: 0.15 }),
  F('studio', 'portrait', compose(contrast(1.12), temp(-0.2), gain(1.03)), { sharpen: 0.2 }),
  F('ivory', 'portrait', compose(sat(0.78), tone([0.06, 0.05, 0.03], [1, 0.97, 0.88]), gain(1.04))),
  F('mattePortrait', 'portrait', compose(sat(0.75), contrast(1.15), tone([0.13, 0.125, 0.12], [0.96, 0.95, 0.94]))),

  // --- Sinematik ---
  F('blockbuster', 'cinematic', compose(sat(0.75), axis(ORANGE, 0.55), tone([0, 0.03, 0.05], [1, 0.98, 0.94]), contrast(1.15)), { vignette: 0.2 }),
  F('harbor', 'cinematic', compose(sat(0.65), axis(ORANGE, 0.35), tone([0.02, 0.05, 0.07], [0.98, 0.96, 0.93])), { fade: 0.1 }),
  F('steel', 'cinematic', compose(sat(0.4), contrast(1.2), temp(-0.15), gain(0.96)), { shadows: -0.2, sharpen: 0.2 }),
  F('moonlight', 'cinematic', compose(sat(0.35), gain(0.45, 0.55, 0.72), contrast(1.15, 0.3), offset(0, 0.005, 0.02))),
  F('desert', 'cinematic', compose(temp(0.5), tint(-0.1), sat(0.8), contrast(1.1), tone([0.04, 0.025, 0], [1, 0.97, 0.88]))),
  F('noirBlue', 'cinematic', compose(duo([0, 0.02, 0.06], [0.92, 0.97, 1]), contrast(1.25)), { vignette: 0.35 }),
  F('thriller', 'cinematic', compose(sat(0.6), tint(-0.45), temp(-0.2), contrast(1.18)), { vignette: 0.25 }),
  F('epic', 'cinematic', compose(sat(0.7), tone([0, 0.02, 0.05], [1, 0.95, 0.85]), contrast(1.3), gain(0.95)), { vignette: 0.3 }),
  F('neoNoir', 'cinematic', compose(sat(0.7), tone([0.06, 0, 0.08], [0.9, 1, 1]), contrast(1.2), gain(0.92))),
  F('frontier', 'cinematic', compose(sat(0.55), temp(0.6), contrast(1.2), tone([0.03, 0.02, 0], [1, 0.95, 0.86]))),
  F('arctic', 'cinematic', compose(sat(0.6), temp(-0.7), contrast(0.95), gain(1.08), offset(0, 0.01, 0.03))),
  F('scifi', 'cinematic', compose(mix(duo([0, 0.04, 0.06], [0.85, 1, 1]), 0.7), contrast(1.2))),
  F('drama', 'cinematic', compose(sat(0.72), contrast(1.28)), { vignette: 0.4, shadows: -0.1 }),

  // --- Film esintili (özgün) ---
  F('warmNegative', 'film', compose(sat(0.92), temp(0.3), tone([0.03, 0.07, 0.05], [1, 0.96, 0.88]), contrast(0.92)), { grain: 0.08 }),
  F('coolSlide', 'film', compose(sat(1.35), temp(-0.25), contrast(1.25), gain(0.97), tone([0, 0.005, 0.03], 1))),
  F('fadedPrint', 'film', compose(sat(0.65), tint(0.45), tone([0.1, 0.07, 0.09], [0.95, 0.9, 0.86])), { grain: 0.1 }),
  F('tungsten', 'film', compose(temp(-1), sat(0.95), contrast(1.08), tone([0.02, 0.03, 0.08], [0.95, 0.97, 1])), { grain: 0.12 }),
  F('expired', 'film', compose(sat(0.75), tint(-0.35), tone([0.06, 0.09, 0.03], [0.98, 0.95, 0.84]), contrast(0.92)), { grain: 0.2, vignette: 0.2 }),
  F('crossProcess', 'film', compose(sat(1.25), contrast(1.2), tone([0, 0.02, 0.12], [1, 1, 0.78]), tint(-0.2))),
  F('softNegative', 'film', compose(sat(0.9), axis(ORANGE, 0.2), tone([0.03, 0.05, 0.06], [1, 0.98, 0.95]), contrast(0.9))),
  F('homeMovie', 'film', compose(sat(0.85), temp(0.6), tone([0.07, 0.05, 0.02], [1, 0.95, 0.8]), contrast(1.05)), { vignette: 0.35, grain: 0.25 }),
  F('cineNegative', 'film', compose(sat(0.8), axis(ORANGE, 0.2), tone([0.03, 0.07, 0.06], [0.96, 0.95, 0.92]), contrast(0.88))),
  F('pushed', 'film', compose(sat(0.9), contrast(1.25), gain(0.97)), { grain: 0.3, sharpen: 0.15 }),

  // --- Siyah-beyaz ---
  F('redFilter', 'bw', compose(mono([0.68, 0.3, 0.02]), contrast(1.15))),
  F('greenFilter', 'bw', compose(mono([0.05, 0.85, 0.1]), contrast(1.08))),
  F('ortho', 'bw', compose(mono([0.04, 0.36, 0.6]), contrast(1.1))),
  F('softGray', 'bw', compose(mono(), tone(0.15, 0.88))),
  F('ink', 'bw', compose(mono([0.4, 0.5, 0.1]), contrast(1.6))),
  F('selenium', 'bw', compose(contrast(1.15), duo([0.09, 0.03, 0.1], [1, 0.96, 0.95]))),
  F('cyanotype', 'bw', duo([0, 0.15, 0.35], [0.88, 0.95, 1])),
  F('platinum', 'bw', compose(contrast(0.95), duo([0.03, 0.025, 0.02], [1, 0.95, 0.86]))),
  F('newsprint', 'bw', compose(mono(), contrast(1.25), tone([0.2, 0.2, 0.19], [0.9, 0.89, 0.86])), { grain: 0.25 }),
  F('charcoal', 'bw', compose(mono(), contrast(1.25), gain(0.8)), { vignette: 0.3 }),
  F('highKey', 'bw', compose(mono(), contrast(0.8), offset(0.15))),
  F('splitMono', 'bw', compose(mono(), contrast(1.1), tone([0, 0.05, 0.16], [1, 0.96, 0.86]))),

  // --- Manzara ---
  F('meadow', 'landscape', compose(axis(GREEN, 0.35), GOLD(0.12), sat(1.1), temp(0.1), contrast(1.06))),
  F('ocean', 'landscape', compose(axis(BLUE, 0.35), temp(-0.3), sat(1.1), contrast(1.15), gain(0.95))),
  F('fog', 'landscape', compose(sat(0.65), contrast(0.75), tone([0.12, 0.13, 0.15], [0.96, 0.97, 0.98]), temp(-0.1))),
  F('alpine', 'landscape', compose(temp(-0.4), hue(8), axis(GREEN, 0.2), sat(1.12), contrast(1.1), gain(1.04)), { sharpen: 0.25 }),
  F('tropical', 'landscape', compose(hue(12), sat(1.35), gain(1.04), contrast(1.05))),
  F('rainforest', 'landscape', compose(sat(1.15), gain(0.9, 1, 0.95), contrast(1.12), tint(-0.2), offset(-0.01)), { vignette: 0.2 }),
  F('dusk', 'landscape', compose(tint(0.5), temp(0.1), gain(0.92), sat(1.1), tone([0.04, 0, 0.08], 1))),
  F('canyon', 'landscape', compose(axis([1, 0.1, -0.6], 0.4), temp(0.25), contrast(1.18), gain(0.94))),
  // Maviye yeşil katarak suyu turkuaza çevirir
  F('lagoon', 'landscape', compose(rows([1, 0, 0], [0, 0.7, 0.3], [0, 0, 1]), sat(1.15), temp(-0.1), gain(1.04))),

  // --- Yemek ---
  F('fresh', 'food', compose(axis([-0.3, 1, -0.5], 0.25), sat(1.15), gain(1.05), contrast(1.06), offset(0.02)), { sharpen: 0.2 }),
  F('bakery', 'food', compose(temp(0.6), sat(1.05), contrast(1.12), tone([0.04, 0.02, 0], 1))),
  F('brunch', 'food', compose(sat(1.05), contrast(0.9), gain(1.08), temp(0.1), offset(0.02))),
  F('spice', 'food', compose(axis([1, 0.55, -0.8], 0.45), sat(1.15), contrast(1.1), temp(0.3), gain(0.97))),
  F('citrus', 'food', compose(axis([1, 1, -1.4], 0.5), gain(1.06), sat(1.1))),
  F('sweet', 'food', compose(tint(0.3), sat(1.1), contrast(0.9), offset(0.04, 0.02, 0.04))),
  F('bistro', 'food', compose(temp(0.4), sat(1.05), contrast(1.2), gain(0.85)), { vignette: 0.35 }),

  // --- Mevsimler ---
  F('spring', 'season', compose(axis(GREEN, 0.35), sat(1.05), tone([0.05, 0.04, 0.05], [1.02, 1, 0.98]), contrast(0.95)), { highlights: 0.1 }),
  F('summer', 'season', compose(sat(1.25), axis(BLUE, 0.25), temp(0.35), gain(1.08), offset(0.01))),
  // Yapraklar zeytin/turuncuya döner; kırmızılar macentaya kaymaz (ton döndürmenin aksine)
  F('autumn', 'season', compose(rows([1, 0.35, -0.35], [0.05, 0.88, 0.07], [0, 0, 1]), temp(0.35), sat(1.15), contrast(1.06))),
  F('winter', 'season', compose(sat(0.55), temp(-0.55), contrast(1.1), gain(0.97))),
  F('lateSummer', 'season', compose(GOLD(0.15), sat(0.85), temp(0.5), tone([0.08, 0.06, 0.03], [1.02, 0.98, 0.86]), contrast(0.88)), { highlights: 0.1 }),
  F('snow', 'season', compose(sat(0.7), temp(-0.3), contrast(0.9), gain(1.12), offset(0.04))),

  // --- Retro ---
  F('seventies', 'retro', compose(hue(-10), sat(0.85), temp(0.55), tone([0.07, 0.05, 0.02], [0.98, 0.93, 0.8])), { grain: 0.15 }),
  F('eighties', 'retro', compose(sat(1.3), tone([0.06, 0, 0.1], [1, 0.95, 1]), contrast(1.15), tint(0.05))),
  F('album', 'retro', compose(sat(0.7), tint(0.3), temp(0.35), tone([0.1, 0.07, 0.06], [0.95, 0.9, 0.82])), { fade: 0.1 }),
  F('camcorder', 'retro', compose(sat(1.35), tone([0.03, 0.04, 0.08], [1, 0.97, 0.95]), contrast(0.9)), { sharpen: 0.35, grain: 0.12 }),
  F('threeStrip', 'retro', compose(rows([1.35, -0.2, -0.15], [-0.12, 1.25, -0.13], [-0.12, -0.2, 1.32]), contrast(1.12), temp(0.15))),
  F('sixties', 'retro', compose(sat(0.75), tone([0.02, 0.1, 0.12], [1, 0.95, 0.8]))),
  F('postcard', 'retro', compose(sat(0.5), tone([0.1, 0.08, 0.06], [0.97, 0.92, 0.82]))),
  F('toyCamera', 'retro', compose(sat(1.4), contrast(1.25), tone([0, 0.02, 0.1], [1, 1, 0.85])), { vignette: 0.6 }),
  F('coffee', 'retro', compose(contrast(1.1), duo([0.08, 0.04, 0.02], [0.96, 0.86, 0.7]))),

  // --- Atmosfer ---
  F('dreamy', 'mood', compose(sat(0.85), tint(0.15), contrast(0.85), tone([0.08, 0.06, 0.12], 1), gain(1.04)), { highlights: 0.2 }),
  F('moody', 'mood', compose(sat(0.7), gain(0.85), tone([0, 0.03, 0.04], [0.98, 0.98, 0.95]), contrast(1.12)), { vignette: 0.3 }),
  F('neonNight', 'mood', compose(sat(1.45), tone([0.05, 0, 0.12], [1, 0.9, 1]), contrast(1.2), tint(0.3), gain(0.92))),
  F('vaporwave', 'mood', compose(sat(0.8), mix(duo([0.25, 0.1, 0.5], [1, 0.75, 0.9]), 0.55), contrast(0.95))),
  F('melancholy', 'mood', compose(sat(0.45), temp(-0.35), contrast(0.95), gain(0.92), tone([0.04, 0.05, 0.07], 1))),
  F('romance', 'mood', compose(tint(0.4), temp(0.3), sat(0.95), contrast(0.9), offset(0.03, 0.01, 0.02)), { highlights: 0.15 }),
  F('mystic', 'mood', compose(sat(0.8), tone([0.08, 0, 0.12], [0.92, 1, 0.94]), contrast(1.1), gain(0.9))),
  F('ember', 'mood', compose(temp(0.9), tint(0.1), sat(1.2), gain(0.9), contrast(1.15))),
  F('candy', 'mood', compose(sat(1.35), tint(0.6), gain(1.08), offset(0.02, 0, 0.03))),
  F('storm', 'mood', compose(sat(0.35), temp(-0.2), contrast(1.25), gain(0.85)), { vignette: 0.35 }),

  // --- Sanat: çift tonlar ve yanlış renkler ---
  F('berry', 'art', duo([0.18, 0.02, 0.22], [1, 0.65, 0.8])),
  F('deepSea', 'art', duo([0, 0.08, 0.2], [0.6, 1, 0.95])),
  F('mint', 'art', duo([0.02, 0.15, 0.12], [0.85, 1, 0.88])),
  F('fire', 'art', duo([0.3, 0, 0.05], [1, 0.92, 0.3])),
  F('electric', 'art', duo([0.1, 0.05, 0.45], [1, 0.5, 0.8])),
  F('goldLeaf', 'art', duo([0.12, 0.07, 0.02], [1, 0.86, 0.45])),
  F('negative', 'art', tone(1, 0)),
  F('xray', 'art', compose(mono(), tone([0.95, 0.98, 1], [0, 0.05, 0.12]))),
  F('colorSwap', 'art', rows([0, 0, 1], [0, 1, 0], [1, 0, 0])),
  // Yanlış renkli kızılötesi: bitki örtüsü pembe, gökyüzü koyu mavi, ten açık şeftali
  // (hedef renk çiftlerine en küçük kareler uydurmasıyla bulundu; beyaz/gri korunur)
  F('infrared', 'art', rows([0.72, 1.57, -1.34], [0.72, 0.33, -0.09], [-0.07, 0.88, 0.16], [0.03, 0.01, 0.02])),
];

export const FILTER_CATEGORIES_PACK2 = ['portrait', 'film', 'landscape', 'food', 'season', 'art'];
