import test from 'node:test';
import assert from 'node:assert/strict';
import { DICTIONARIES, LANGUAGES } from '../src/i18n/core';
import { FILTERS, FILTERS_BASE, FILTER_CATEGORIES, clipVisuals, filterById } from '../src/model/color';
import { FILTERS_PACK2, FILTER_CATEGORIES_PACK2 } from '../src/model/filters-pack2';
import { IDENTITY, axis, compose, contrast, duo, gain, mono, offset, sat, tone } from '../src/model/color-math';

const lookup = (lang, key) => key.split('.').reduce((n, k) => (n && typeof n === 'object' ? n[k] : undefined), DICTIONARIES[lang]);

/** Sütun öncelikli 4x4 matrisi bir renge uygular (kırpmasız). */
const applyRaw = (m, [r, g, b]) => [0, 1, 2].map((i) => m[i] * r + m[4 + i] * g + m[8 + i] * b + m[12 + i]);
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const apply = (m, c) => applyRaw(m, c).map(clamp01);
const luma = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

function hsv(h, s, v) {
  const f = (n) => {
    const k = (n + h * 6) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return [f(5), f(3), f(1)];
}

// Sabit palet: 6 nötr, 6 ten tonu, 12 renk (iki doygunlukta ton çemberi) = 24
const PALETTE = [
  ...[0.05, 0.2, 0.4, 0.6, 0.8, 0.95].map((v) => [v, v, v]),
  ...[[255, 224, 196], [241, 194, 160], [224, 172, 130], [198, 134, 96], [161, 102, 70], [88, 54, 38]].map((c) => c.map((v) => v / 255)),
  ...Array.from({ length: 6 }, (_, i) => [hsv(i / 6, 0.85, 0.85), hsv(i / 6 + 1 / 12, 0.45, 0.65)]).flat(),
];

/** İki filtrenin palet üzerindeki ortalama renk farkı (kırpılmış çıktı, Öklid). */
function distance(a, b) {
  let s = 0;
  for (const c of PALETTE) {
    const x = apply(a.matrix, c);
    const y = apply(b.matrix, c);
    s += Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
  }
  return s / PALETTE.length;
}

// Yeni filtrelerin her birinin diğer tüm filtrelerden en az bu kadar farklı olması gerekir.
// (Temel kütüphanedeki en yakın çift ≈ 0.036; paket çiftlerinin en küçüğü ≈ 0.044.)
const MIN_DISTANCE = 0.04;
const FX_RANGES = { vignette: [0, 1], grain: [0, 1], sharpen: [0, 1], fade: [0, 1], highlights: [-1, 1], shadows: [-1, 1] };

test('filtre kütüphanesi: en az 100 filtre, benzersiz kimlikler', () => {
  assert.ok(FILTERS.length >= 100, `toplam ${FILTERS.length}`);
  assert.ok(FILTERS_PACK2.length >= 80, `paket ${FILTERS_PACK2.length}`);
  const ids = FILTERS.map((f) => f.id);
  assert.equal(new Set(ids).size, ids.length, 'yinelenen kimlik');
  for (const id of ids) assert.match(id, /^[a-z][a-zA-Z0-9]*$/);
  assert.equal(FILTERS[0].id, 'none');
  assert.equal(filterById('infrared').id, 'infrared');
});

test('her filtrenin kategorisi var; her kategoride filtre var', () => {
  for (const c of FILTER_CATEGORIES_PACK2) assert.ok(FILTER_CATEGORIES.includes(c), c);
  assert.equal(new Set(FILTER_CATEGORIES).size, FILTER_CATEGORIES.length);
  for (const f of FILTERS) assert.ok(FILTER_CATEGORIES.includes(f.category), `${f.id}: ${f.category}`);
  for (const c of FILTER_CATEGORIES) assert.ok(FILTERS.some((f) => f.category === c), `boş kategori ${c}`);
});

test('matrisler 16 sonlu sayı, son satır (0,0,0,1); fx değerleri sınırlar içinde', () => {
  for (const f of FILTERS) {
    assert.equal(f.matrix.length, 16, f.id);
    assert.ok(f.matrix.every(Number.isFinite), f.id);
    assert.deepEqual([f.matrix[3], f.matrix[7], f.matrix[11], f.matrix[15]], [0, 0, 0, 1], f.id);
    for (const [k, v] of Object.entries(f.fx || {})) {
      assert.ok(k in FX_RANGES, `${f.id}: bilinmeyen fx ${k}`);
      assert.ok(v >= FX_RANGES[k][0] && v <= FX_RANGES[k][1] && v !== 0, `${f.id}: ${k}=${v}`);
    }
  }
});

test('her filtrenin ve kategorinin adı üç dilde var; adlar dil içinde benzersiz', () => {
  for (const { code } of LANGUAGES) {
    const names = new Map();
    for (const f of FILTERS) {
      const name = lookup(code, `filters.${f.id}`);
      assert.ok(typeof name === 'string' && name.trim(), `${code}: filters.${f.id}`);
      assert.ok(!names.has(name), `${code}: "${name}" hem ${names.get(name)} hem ${f.id}`);
      names.set(name, f.id);
    }
    for (const c of FILTER_CATEGORIES) assert.ok(lookup(code, `filters.category.${c}`), `${code}: filters.category.${c}`);
  }
});

test('yeni filtreler birbirinden ve temel filtrelerden belirgin biçimde farklı', () => {
  let min = Infinity;
  let pair = null;
  for (const a of FILTERS_PACK2) {
    for (const b of FILTERS) {
      if (a === b) continue;
      const d = distance(a, b);
      assert.ok(d >= MIN_DISTANCE, `${a.id} ~ ${b.id}: ${d.toFixed(4)}`);
      if (d < min) [min, pair] = [d, `${a.id}~${b.id}`];
    }
  }
  assert.ok(min >= MIN_DISTANCE, `${pair} ${min}`);
  // Hiçbir yeni filtre etkisiz olmamalı
  for (const f of FILTERS_PACK2) assert.ok(distance(f, FILTERS_BASE[0]) >= MIN_DISTANCE, f.id);
});

test('palet çıktıları makul aralıkta: aşırı taşma yok, ton aralığı korunur', () => {
  for (const f of FILTERS) {
    const raw = PALETTE.flatMap((c) => applyRaw(f.matrix, c));
    assert.ok(Math.min(...raw) > -1 && Math.max(...raw) < 2, `${f.id}: ${Math.min(...raw)}..${Math.max(...raw)}`);
    const lum = PALETTE.map((c) => luma(apply(f.matrix, c)));
    // Siyah ile beyaz arasında yeterli ayrım (negatif filtrelerde ters yönde)
    const span = Math.abs(luma(apply(f.matrix, [1, 1, 1])) - luma(apply(f.matrix, [0, 0, 0])));
    assert.ok(span >= 0.5, `${f.id}: siyah-beyaz farkı ${span}`);
    // Orta gri ne simsiyah ne bembeyaz
    const mid = luma(apply(f.matrix, [0.46, 0.46, 0.46]));
    assert.ok(mid > 0.15 && mid < 0.8, `${f.id}: orta gri ${mid}`);
    // Görüntü düzleşmemeli
    const mean = lum.reduce((a, b) => a + b, 0) / lum.length;
    const sd = Math.sqrt(lum.reduce((a, b) => a + (b - mean) ** 2, 0) / lum.length);
    assert.ok(sd > 0.1, `${f.id}: parlaklık sapması ${sd}`);
  }
});

test('portre filtreleri ten tonlarını doğal aralıkta tutar (R ≥ G ≥ B, aşırı doygunluk yok)', () => {
  const skins = PALETTE.slice(6, 12);
  for (const f of FILTERS_PACK2.filter((x) => x.category === 'portrait')) {
    for (const s of skins) {
      const [r, g, b] = apply(f.matrix, s);
      assert.ok(r >= g && g >= b - 0.01, `${f.id}: ${[r, g, b].map((v) => v.toFixed(2))}`);
      assert.ok(r - b < 0.65, `${f.id}: ten fazla doygun`);
    }
  }
});

test('renk matematiği yapı taşları', () => {
  const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-9);
  // compose soldan sağa uygular: önce kazanç, sonra ofset
  assert.deepEqual(apply(compose(gain(0.5), offset(0.1)), [1, 1, 1]), [0.6, 0.6, 0.6]);
  assert.ok(near(sat(1), IDENTITY) && near(contrast(1), IDENTITY) && near(axis([1, 0, -1], 0), IDENTITY));
  // Griler: doygunluk, eksen vurgusu ve siyah-beyaz dokunmaz
  for (const m of [sat(1.6), axis([1, 0.45, -0.7], 0.8), mono([0.6, 0.3, 0.1])]) {
    const out = applyRaw(m, [0.3, 0.3, 0.3]);
    assert.ok(out.every((v) => Math.abs(v - 0.3) < 1e-9), JSON.stringify(out));
  }
  assert.ok(near(applyRaw(tone(1, 0), [0.2, 0.5, 0.9]), [0.8, 0.5, 0.1]));
  assert.ok(near(applyRaw(duo([0.1, 0, 0.2], [0.9, 1, 0.6]), [1, 1, 1]), [0.9, 1, 0.6]));
  assert.ok(near(applyRaw(contrast(1.5, 0.46), [0.46, 0.46, 0.46]), [0.46, 0.46, 0.46]));
});

test('paket filtresi klibe uygulanınca yoğunlukla ölçeklenen matris üretir', () => {
  const clip = { filter: { id: 'cyanotype', intensity: 1 } };
  const full = clipVisuals(clip).colorMatrix;
  assert.equal(full.length, 16);
  const half = clipVisuals({ filter: { id: 'cyanotype', intensity: 0.5 } }).colorMatrix;
  half.forEach((v, i) => assert.ok(Math.abs(v - (IDENTITY[i] + full[i]) / 2) < 1e-4));
  assert.equal(clipVisuals({ filter: { id: 'cyanotype', intensity: 0 } }).colorMatrix, null);
  assert.ok(clipVisuals({ filter: { id: 'drama', intensity: 1 } }).fx.vignette > 0);
});
