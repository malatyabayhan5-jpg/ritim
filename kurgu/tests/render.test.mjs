import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRenderSpec, estimateSize, exportSize, suggestBitrate } from '../src/engine/renderSpec';
import * as TL from '../src/model/timeline';
import { clipVisuals, mul, IDENTITY, FILTERS, EFFECTS } from '../src/model/color';
import { audio, image, projectWith, video } from './helpers.mjs';

const uri = (m) => `file:///lib/${m.path}`;

test('render tanımı ana iz, geçişler ve toplam süreyi içerir', () => {
  let p = projectWith([video('a', 4000), image('b'), video('c', 3000)], { imageDurationMs: 2000 });
  p = TL.updateMain(p, p.main[1].id, { transition: { type: 'fade', durationMs: 800 } });
  p = TL.updateMain(p, p.main[2].id, { transition: { type: 'zoomIn', durationMs: 5000 } });
  const s = buildRenderSpec(p, uri);
  assert.equal(s.totalMs, 9000);
  assert.equal(s.main.length, 3);
  assert.equal(s.main[1].kind, 'image');
  assert.equal(s.main[0].uri, 'file:///lib/media/a.mp4');
  assert.deepEqual(s.transitions[0], { type: 'fade', atMs: 4000, durationMs: 800 });
  // Geçiş, komşu kliplerden uzun olamaz
  assert.equal(s.transitions[1].durationMs, 2000);
});

test('sessize alınan klip ve sessiz kaynak 0 ses düzeyiyle gider', () => {
  let p = projectWith([video('a', 4000), video('b', 4000, { hasAudio: false })]);
  p = TL.updateMain(p, p.main[0].id, { muted: true });
  const s = buildRenderSpec(p, uri);
  assert.equal(s.main[0].volume, 0);
  assert.equal(s.main[1].volume, 0);
});

test('ses şeritleri: video sonrasındaki klipler atılır, çakışanlar ayrı şeride', () => {
  let p = projectWith([video('v', 10000)]);
  p = TL.addAudio(p, audio('m1', 6000), 0).project;
  p = TL.addAudio(p, audio('m2', 6000), 3000).project;
  p = TL.addAudio(p, audio('m3', 6000), 12000).project;
  const s = buildRenderSpec(p, uri);
  assert.equal(s.audioLanes.length, 2);
  assert.equal(s.audioLanes.flat().length, 2);
});

test('metin katmanları video süresiyle sınırlanır, boşlar atılır', () => {
  let p = projectWith([video('v', 5000)]);
  // Öğeler eklendikten sonra taşınmış/klip kısalmış olabilir: render tanımı yine kırpar
  p = TL.addText(p, 0, 'Son').project;
  p = TL.updateText(p, p.texts[0].id, { start: 4000 });
  p = TL.addText(p, 1000, '   ').project;
  p = TL.addText(p, 0, 'Dışarıda').project;
  p = TL.updateText(p, p.texts[2].id, { start: 6000 });
  const s = buildRenderSpec(p, uri, { rtl: true });
  assert.equal(s.texts.length, 1);
  assert.equal(s.texts[0].endMs, 5000);
  assert.equal(s.texts[0].rtl, true);
});

test('renk: filtresiz ve ayarsız klipte matris gönderilmez', () => {
  const p = projectWith([video('a', 1000)]);
  assert.equal(clipVisuals(p.main[0]).colorMatrix, null);
});

test('renk: filtre yoğunluğu 0 iken etkisiz, 1 iken filtre matrisi', () => {
  const p = projectWith([video('a', 1000)]);
  const c = { ...p.main[0], filter: { id: 'mono', intensity: 0 } };
  assert.equal(clipVisuals(c).colorMatrix, null);
  const full = clipVisuals({ ...c, filter: { id: 'mono', intensity: 1 } }).colorMatrix;
  assert.equal(full.length, 16);
  // Gri tonlama: R, G, B sütunları aynı satır katsayılarını üretir
  assert.ok(Math.abs(full[0] - full[1]) < 1e-4);
});

test('renk: matris çarpımı birim matrisle değişmez', () => {
  const m = FILTERS.find((f) => f.id === 'warm').matrix;
  assert.deepEqual(mul(IDENTITY, m).map((v) => +v.toFixed(6)), m.map((v) => +v.toFixed(6)));
});

test('efektler shader parametrelerine çevrilir', () => {
  const p = projectWith([video('a', 1000)]);
  for (const e of EFFECTS) {
    const v = clipVisuals({ ...p.main[0], fx: { id: e.id, intensity: 1 } });
    Object.values(v.fx).forEach((x) => assert.ok(x >= -1 && x <= 1));
  }
  const g = clipVisuals({ ...p.main[0], fx: { id: 'glitch', intensity: 0.5 } });
  assert.ok(g.fx.glitch > 0.3 && g.fx.glitch < 0.4);
});

test('dışa aktarma boyutu oranı korur, bit hızı ve boyut tahmini makul', () => {
  const p = projectWith([video('a', 60000)]);
  assert.deepEqual(exportSize(p, 720), { width: 720, height: 1280 });
  const b = suggestBitrate(1080, 1920, 30, 'recommended', 'h264');
  assert.ok(b > 4e6 && b < 12e6, String(b));
  assert.ok(suggestBitrate(1080, 1920, 30, 'recommended', 'hevc') < b);
  const size = estimateSize(60000, b);
  assert.ok(size > 30e6 && size < 100e6);
});
