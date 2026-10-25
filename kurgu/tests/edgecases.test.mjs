// replica-test uç durumları (replica/test-plan.md): F02-E1, F03-E1, F03-E3, F04-E1, F06-E1, F09-E1, F10-H1
import test from 'node:test';
import assert from 'node:assert/strict';
import * as TL from '../src/model/timeline';
import { addClipCaptions } from '../src/model/captions';
import { canvasSize } from '../src/model/schema';
import { buildRenderSpec } from '../src/engine/renderSpec';
import { projectWith, video } from './helpers.mjs';

const uri = (m) => `file:///lib/${m.path}`;
const durs = (p) => p.main.map((c) => TL.clipDuration(c));

test('F02-E1 baştan, sondan ve dışarıdan bölme sıfır uzunlukta parça üretmez', () => {
  const p = projectWith([video('a', 4000), video('b', 3000)]);
  for (const t of [0, 1, 4000, 6999, 7000, 9000]) assert.deepEqual(durs(TL.splitMainAt(p, t).project), [4000, 3000], `t=${t}`);
  assert.deepEqual(durs(TL.splitMainAt(p, 2000).project), [2000, 2000, 3000]);
});

test('F03-E1 boş metin çizilmez; F03-E3 sonda eklenen metin videoya sığdırılır', () => {
  const p = projectWith([video('a', 4000), video('b', 3000)]);
  assert.equal(buildRenderSpec(TL.addText(p, 6500, '').project, uri).texts.length, 0);
  const s = buildRenderSpec(TL.addText(p, 6500, 'Son').project, uri);
  assert.ok(s.texts[0].endMs <= s.totalMs, 'metin video sonunu aşmamalı');
});

test('F04-E1 konuşma yoksa altyazı katmanı eklenmez', () => {
  const p = projectWith([video('a', 4000)]);
  const r = addClipCaptions(p, p.main[0].id, []);
  assert.equal(r.added, 0);
  assert.equal(r.project.texts.length, 0);
});

test('F06-E1 geçişi tümüne uygula: her çift alır, kısa klibe göre kısaltılır', () => {
  let p = projectWith([video('a', 4000), video('b', 600), video('c', 3000)]);
  p = TL.updateAllMain(p, { transition: { type: 'fade', durationMs: 1000 } });
  const s = buildRenderSpec(p, uri);
  assert.equal(s.transitions.length, 2);
  for (const tr of s.transitions) assert.ok(tr.durationMs <= 600, JSON.stringify(tr));
});

test('F09-E1 videodan uzun katman 0 da başlar, render tanımında video sonunda kesilir', () => {
  let p = projectWith([video('a', 4000)]);
  const r = TL.addOverlay(p, video('ov', 9000), 1000);
  assert.equal(r.project.overlays[0].start, 0);
  const s = buildRenderSpec(r.project, uri);
  assert.equal(s.totalMs, 4000);
});

test('F10-H1 9:16 ve 16:9 kanvas boyutları çift sayı ve doğru yönde', () => {
  assert.deepEqual(canvasSize('9:16'), { width: 1080, height: 1920 });
  assert.deepEqual(canvasSize('16:9'), { width: 1920, height: 1080 });
  const { width, height } = canvasSize('4:5', 1081);
  assert.equal(width % 2 + height % 2, 0);
});
