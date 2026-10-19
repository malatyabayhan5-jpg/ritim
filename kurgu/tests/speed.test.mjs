import test from 'node:test';
import assert from 'node:assert/strict';
import * as TL from '../src/model/timeline';
import { SEGMENTS, SPEED_PRESETS, curveAt, localAt, packSegments, presetCurve, sourceAt, speedDuration, speedSegments } from '../src/model/speed';
import { buildRenderSpec } from '../src/engine/renderSpec';
import { projectWith, video } from './helpers.mjs';

const uri = (m) => `file:///lib/${m.path}`;
const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg || ''} ${a} ≈ ${b}`);

test('eğri süresi sayısal integralle tutarlı; sabit hızda eski formül', () => {
  const clip = { kind: 'video', srcIn: 1000, srcOut: 9000, speed: 1, speedCurve: presetCurve('rampUp') };
  // ∫ dx / v(x), v doğrusal 0.5 -> 3, kaynak 8000 ms
  let integral = 0;
  const n = 20000;
  for (let i = 0; i < n; i++) integral += 8000 / n / curveAt(clip.speedCurve.points, (i + 0.5) / n);
  near(speedDuration(clip), integral, integral * 0.01, 'süre');
  assert.equal(speedDuration({ kind: 'video', srcIn: 0, srcOut: 4000, speed: 2 }), 2000);
});

test('kaynak <-> zaman eşlemesi birbirinin tersi ve monoton', () => {
  for (const p of SPEED_PRESETS) {
    const clip = { kind: 'video', srcIn: 500, srcOut: 6500, speed: 1, speedCurve: presetCurve(p.id) };
    const d = speedDuration(clip);
    let prev = -1;
    for (let k = 0; k <= 50; k++) {
      const local = (d * k) / 50;
      const src = sourceAt(clip, local);
      assert.ok(src >= prev - 1e-6, `${p.id} monoton`);
      prev = src;
      near(localAt(clip, src), local, 0.01, `${p.id} ters`);
    }
    near(sourceAt(clip, 0), 500, 1e-6);
    near(sourceAt(clip, d), 6500, 0.01);
  }
});

test('bölme: toplam süre ve kesim noktasındaki hız korunur', () => {
  let p = projectWith([video('a', 8000)]);
  const id = p.main[0].id;
  p = TL.setSpeedCurve(p, id, presetCurve('slowCenter'));
  const before = TL.totalDuration(p);
  const r = TL.splitMainAt(p, before * 0.3);
  assert.ok(r.changed);
  const [a, b] = r.project.main;
  near(TL.totalDuration(r.project), before, before * 0.02, 'toplam süre');
  near(curveAt(a.speedCurve.points, 1), curveAt(b.speedCurve.points, 0), 1e-6, 'kesimde süreklilik');
  assert.equal(a.srcOut, b.srcIn);
  // Sabit hıza dönmek eğriyi kaldırır
  assert.equal(TL.setSpeed(r.project, a.id, 2).main[0].speedCurve, null);
});

test('render tanımı: parçalar kesin artan, süre JS ile aynı; geçiş kopyası kesim hızını kullanır', () => {
  let p = projectWith([video('a', 6000), video('b', 6000)]);
  p = TL.setSpeedCurve(p, p.main[0].id, presetCurve('rampDown'));
  p = TL.updateMain(p, p.main[1].id, { transition: { type: 'dissolve', durationMs: 600 } });
  const s = buildRenderSpec(p, uri);
  const m = s.main[0];
  assert.equal(m.speedSegments.length, SEGMENTS * 2);
  for (let i = 2; i < m.speedSegments.length; i += 2) assert.ok(m.speedSegments[i] > m.speedSegments[i - 2]);
  // Parçalardan süre (yerel motorun hesabı) = outMs
  let us = 0;
  const segs = m.speedSegments;
  for (let i = 0; i < segs.length; i += 2) {
    const end = i + 2 < segs.length ? segs[i + 2] : 6000;
    us += (end - segs[i]) / segs[i + 1];
  }
  near(us, m.outMs, 1, 'outMs');
  assert.equal(s.main[1].speedSegments, null);
  const [a] = s.layers[0];
  // Kırpılmamış klipte fazlalık yok: kesimdeki eğri hızı (0.5) yarıya iner
  near(a.speed, 0.25, 0.01, 'A kesimdeki eğri hızı');
  assert.deepEqual(packSegments({ kind: 'video', srcIn: 0, srcOut: 1000, speed: 2 }), null);
  assert.equal(speedSegments({ kind: 'video', srcIn: 0, srcOut: 1000, speed: 2 }).length, 1);
});

test('ters oynatma: ters medyaya bağlanır, eğri aynalanır, geri dönüş özgün aralığı verir', () => {
  let p = projectWith([video('a', 8000)]);
  const id = p.main[0].id;
  p = TL.updateMain(p, id, { srcIn: 1000, srcOut: 5000 });
  p = TL.setSpeedCurve(p, id, presetCurve('rampUp'));
  const rev = { id: 'rev1', kind: 'video', path: 'media/rev1.mp4', durationMs: 4000, reverseOf: { mediaId: 'a', srcIn: 1000, srcOut: 5000 } };
  const r = TL.reverseMain(p, id, rev);
  const c = r.main[0];
  assert.equal(c.mediaId, 'rev1');
  assert.deepEqual([c.srcIn, c.srcOut], [0, 4000]);
  near(curveAt(c.speedCurve.points, 0), 3, 1e-6, 'ayna');
  near(TL.totalDuration(r), TL.totalDuration(p), 1, 'süre aynı');
  assert.equal(TL.findReversedMedia(r, 'a', 1000, 5000).id, 'rev1');
  const back = TL.reverseMain(r, id);
  assert.equal(back.main[0].mediaId, 'a');
  assert.deepEqual([back.main[0].srcIn, back.main[0].srcOut], [1000, 5000]);
  assert.equal(back.main[0].reversed, null);
  near(curveAt(back.main[0].speedCurve.points, 0), 0.5, 1e-6, 'çift ayna = özgün');
});
