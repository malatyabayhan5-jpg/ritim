import test from 'node:test';
import assert from 'node:assert/strict';
import { detectBeats } from '../src/model/beats';
import * as TL from '../src/model/timeline';
import { projectWith, video } from './helpers.mjs';

// 120 BPM vuruşlu sentetik zarf: 500 ms'de bir keskin tepe, arada sönen kuyruk ve gürültü
function beatPeaks(seconds, bpm = 120, rate = 50, noise = 0.03) {
  const n = seconds * rate;
  const period = (60 / bpm) * rate;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  return Array.from({ length: n }, (_, i) => {
    const ph = i % period;
    return Math.min(1, 0.15 + 0.8 * Math.exp(-ph / 4) + noise * rnd());
  });
}

test('120 BPM: vuruşlar 500 ms aralıkla bulunur', () => {
  const beats = detectBeats(beatPeaks(8));
  assert.ok(beats.length >= 14 && beats.length <= 16, `bulunan ${beats.length}`);
  const gaps = beats.slice(1).map((t, i) => t - beats[i]);
  for (const g of gaps) assert.ok(Math.abs(g - 500) <= 40, `aralık ${g}`);
});

test('sessizlik ve düz gürültüde vuruş yok; aralık sınırı uygulanır', () => {
  assert.deepEqual(detectBeats(new Array(400).fill(0)), []);
  assert.deepEqual(detectBeats(beatPeaks(8, 120, 50, 0).map(() => 0.3)), []);
  const beats = detectBeats(beatPeaks(8), 50, { fromMs: 2000, toMs: 4000 });
  assert.ok(beats.every((t) => t >= 2000 && t <= 4000) && beats.length >= 3);
});

test('ritim işaretleri: eklenir, aynı aralıkta ikinci kez kaldırılır, elle işaretler korunur', () => {
  let p = projectWith([video('a', 6000)]);
  p = TL.toggleMarker(p, 1000);
  let r = TL.toggleBeatMarkers(p, [500, 1010, 1500, 2000, 9000], 0, 6000);
  assert.equal(r.added, 3, '1010 elle işarete çok yakın, 9000 aralık dışı');
  r = TL.toggleBeatMarkers(r.project, [500], 0, 6000);
  assert.equal(r.removed, 3);
  assert.deepEqual(r.project.markers.map((m) => m.time), [1000]);
});
