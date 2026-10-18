import test from 'node:test';
import assert from 'node:assert/strict';
import { detectSilences, pickSceneCuts, speechLanguage } from '../src/model/ai';
import * as TL from '../src/model/timeline';
import { buildRenderSpec } from '../src/engine/renderSpec';
import { projectWith, video } from './helpers.mjs';
// Gerçek test videolarından (e2e/run.sh ile aynı ffmpeg tarifleri) yerel motorun
// ölçüm yöntemiyle çıkarılmış veriler: 50/sn ses tepe değeri, 6/sn histogram farkı.
import scene from './fixtures/ai_scene.json';
import speechlike from './fixtures/ai_speechlike.json';

const uri = (m) => `file:///lib/${m.path}`;

test('sahne algılama: 3 sahneli videoda 2 kesme, kesme noktaları ±200 ms', () => {
  const cuts = pickSceneCuts(scene.scores);
  assert.equal(cuts.length, 2);
  assert.ok(Math.abs(cuts[0] - 2500) <= 200, `${cuts[0]}`);
  assert.ok(Math.abs(cuts[1] - 5000) <= 200, `${cuts[1]}`);
});

test('sahne algılama: kesmesiz, sürekli renk/hareket değişen videoda yanlış kesme yok', () => {
  assert.deepEqual(pickSceneCuts(speechlike.scores), []);
});

test('sahne algılama: art arda flaşlar en kısa sahne süresine uyar', () => {
  const scores = Array.from({ length: 60 }, (_, i) => ({ t: (i + 1) * 166, d: 0.02 }));
  scores[10].d = 0.6;
  scores[12].d = 0.6; // 330 ms sonra: atlanmalı
  scores[30].d = 0.6;
  const cuts = pickSceneCuts(scores);
  assert.deepEqual(cuts, [scores[10].t, scores[30].t]);
});

test('sessizlik: 2–4 sn arası sessiz bölüm bulunur, pay bırakılır', () => {
  const s = detectSilences(scene.peaks, scene.peaksPerSecond);
  assert.equal(s.length, 1);
  assert.ok(s[0].start >= 2100 && s[0].start <= 2250, `${s[0].start}`);
  assert.ok(s[0].end >= 3750 && s[0].end <= 3900, `${s[0].end}`);
});

test('sessizlik: hece arası kısa duraklar korunur, gürültülü 1,6 sn duraklama bulunur', () => {
  const s = detectSilences(speechlike.peaks, speechlike.peaksPerSecond);
  assert.equal(s.length, 1, JSON.stringify(s));
  assert.ok(s[0].start >= 3000 && s[0].start <= 3500, `${s[0].start}`);
  assert.ok(s[0].end >= 4100 && s[0].end <= 4600, `${s[0].end}`);
});

test('sessizlik: tamamen sessiz veya düz kayıt için karar verilmez', () => {
  assert.deepEqual(detectSilences(new Array(500).fill(0), 50), []);
  assert.deepEqual(detectSilences(new Array(500).fill(0.5), 50), []);
  assert.deepEqual(detectSilences([], 50), []);
});

test('sessizlik kaldırma klibi parçalara ayırır, süre kısalır, tek adımda geri alınabilir', () => {
  let p = projectWith([video('a', 7500), video('b', 3000)]);
  const id = p.main[0].id;
  p = TL.updateMain(p, id, { fadeIn: 300, fadeOut: 400, transition: { type: 'fade', durationMs: 500 } });
  const r = TL.removeSourceRanges(p, id, [{ start: 2150, end: 3850 }]);
  assert.equal(r.pieces, 2);
  assert.equal(r.removedMs, 1700);
  const [a, b, c] = r.project.main;
  assert.deepEqual([a.srcIn, a.srcOut, b.srcIn, b.srcOut], [0, 2150, 3850, 7500]);
  assert.equal(a.id, id);
  assert.equal(a.fadeOut, 0);
  assert.equal(b.fadeIn, 0);
  assert.equal(b.fadeOut, 400);
  assert.equal(b.transition.type, 'none');
  assert.equal(c.mediaId, 'b');
  assert.equal(TL.totalDuration(r.project), 10500 - 1700);
  // Render tanımı geçerli kalır
  assert.equal(buildRenderSpec(r.project, uri).main.length, 3);
});

test('sessizlik kaldırma hız ve kırpmayı hesaba katar; klibin dışındaki aralıklar yok sayılır', () => {
  let p = projectWith([video('a', 10000)]);
  const id = p.main[0].id;
  p = TL.updateMain(p, id, { srcIn: 1000, srcOut: 9000, speed: 2 });
  const r = TL.removeSourceRanges(p, id, [{ start: 0, end: 500 }, { start: 3000, end: 5000 }, { start: 9500, end: 9900 }]);
  assert.equal(r.pieces, 2);
  assert.equal(r.removedMs, 1000); // 2000 ms kaynak / 2x hız
  const none = TL.removeSourceRanges(p, id, [{ start: 0, end: 900 }]);
  assert.equal(none.removedMs, 0);
  assert.equal(none.project, p);
});

test('sahnelere bölme: kesme noktalarından parçalar, kenara yakın noktalar atlanır', () => {
  let p = projectWith([video('a', 7500)]);
  const id = p.main[0].id;
  const r = TL.splitMainAtSourceTimes(p, id, [2500, 5000, 50, 7450, 5000]);
  assert.equal(r.added, 2);
  assert.deepEqual(r.project.main.map((c) => [c.srcIn, c.srcOut]), [[0, 2500], [2500, 5000], [5000, 7500]]);
  assert.equal(TL.totalDuration(r.project), 7500);
  assert.equal(TL.splitMainAtSourceTimes(p, id, []).added, 0);
});

test('seslendirme dili metnin yazı sisteminden seçilir', () => {
  assert.equal(speechLanguage('مرحبا بكم', 'tr'), 'ar');
  assert.equal(speechLanguage('Günaydın', 'en'), 'tr');
  assert.equal(speechLanguage('Hello world', 'tr'), 'tr');
  assert.equal(speechLanguage('Hello world', 'en'), 'en');
  assert.equal(speechLanguage('Hello world', 'ar'), 'en');
});
