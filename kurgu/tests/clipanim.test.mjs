import test from 'node:test';
import assert from 'node:assert/strict';
import * as TL from '../src/model/timeline';
import { animAt, animTracks, animWindows, hasAnim, normalizeAnim } from '../src/model/clipAnim';
import { buildRenderSpec } from '../src/engine/renderSpec';
import { valueAtPacked } from '../src/model/keyframes';
import { projectWith, video } from './helpers.mjs';

const uri = (m) => `file:///lib/${m.path}`;
const near = (a, b, eps = 1e-3) => Math.abs(a - b) <= eps;

test('klip animasyonu: giriş sonunda ve çıkış başında kimlik; uçlarda tam etki', () => {
  const anim = { in: 'zoomIn', inMs: 500, out: 'slideLeft', outMs: 400 };
  const a0 = animAt(anim, 4000, 0);
  assert.ok(near(a0.scale, 0.6) && near(a0.opacity, 0));
  const mid = animAt(anim, 4000, 2000);
  assert.deepEqual(mid, { x: 0, y: 0, scale: 1, angle: 0, opacity: 1 });
  assert.ok(near(animAt(anim, 4000, 4000).x, -2), 'çıkışta sola kayar');
  assert.ok(near(animAt(anim, 4000, 3600).x, 0));
});

test('giriş + çıkış klipten uzunsa orantılı kısalır; geçersiz değerler normalleşir', () => {
  const w = animWindows({ in: 'fade', inMs: 3000, out: 'fade', outMs: 1000 }, 2000);
  assert.equal(w.inMs + w.outMs, 2000);
  assert.equal(w.inMs, 1500);
  assert.deepEqual(normalizeAnim({ in: 'yok', inMs: 99999 }).in, 'none');
  assert.equal(normalizeAnim({ inMs: 99999 }).inMs, 5000);
  assert.equal(hasAnim(null), false);
});

test('render tanımı: animasyon kullanıcının ölçek karesiyle çarpılır, açısı korunur', () => {
  let p = projectWith([video('a', 4000)]);
  const id = p.main[0].id;
  p = TL.updateMain(p, id, { transform: { scale: 1.5, angle: 10 } });
  p = TL.setClipAnim(p, id, { in: 'zoomIn', inMs: 500 });
  const m = buildRenderSpec(p, uri).main[0];
  assert.ok(near(valueAtPacked(m.kf.scale, 0, 0), 0.9), 'başta 0.6 × 1.5');
  assert.ok(near(valueAtPacked(m.kf.scale, 1000, 0), 1.5), 'giriş sonrası kullanıcı ölçeği');
  assert.ok(near(valueAtPacked(m.kf.opacity, 0, 1), 0));
  assert.equal(m.kf.angle, undefined, 'zoomIn açıya dokunmaz');
  // Kullanıcı karesi varsa birlikte: x izi + kayma
  p = TL.updateMain(p, id, { keyframes: { x: [{ t: 0, v: 0, e: 'linear' }, { t: 4000, v: 0.4, e: 'linear' }] } });
  p = TL.setClipAnim(p, id, { in: 'none', out: 'slideUp', outMs: 500 });
  const m2 = buildRenderSpec(p, uri).main[0];
  assert.ok(near(valueAtPacked(m2.kf.x, 2000, 0), 0.2, 2e-3), 'kullanıcının x izi korunur');
  assert.ok(near(valueAtPacked(m2.kf.y, 4000, 0), 2), 'çıkışta yukarı kayar');
});

test('kombo tüm klip boyunca örneklenir; animasyon kaldırılınca alan silinir', () => {
  let p = projectWith([video('a', 3000)]);
  const id = p.main[0].id;
  p = TL.setClipAnim(p, id, { combo: 'swing' });
  const tr = animTracks(p.main[0], 3000, () => 0);
  assert.ok(tr.angle.length > 50);
  assert.ok(Math.max(...tr.angle.map((k) => Math.abs(k.v))) > 5);
  p = TL.setClipAnim(p, id, { combo: 'none' });
  assert.equal(p.main[0].anim, null);
  assert.equal(buildRenderSpec(p, uri).main[0].kf.angle, undefined);
});

test('bölme: giriş ilk parçada, çıkış ikinci parçada kalır', () => {
  let p = projectWith([video('a', 4000)]);
  p = TL.setClipAnim(p, p.main[0].id, { in: 'fade', out: 'zoomOut', combo: 'pulse' });
  const [a, b] = TL.splitMainAt(p, 2000).project.main;
  assert.deepEqual([a.anim.in, a.anim.out, a.anim.combo], ['fade', 'none', 'pulse']);
  assert.deepEqual([b.anim.in, b.anim.out, b.anim.combo], ['none', 'zoomOut', 'pulse']);
  const pieces = TL.splitMainAtSourceTimes(p, p.main[0].id, [1000, 2000]).project.main;
  assert.deepEqual(pieces.map((c) => [c.anim.in, c.anim.out]), [['fade', 'none'], ['none', 'none'], ['none', 'zoomOut']]);
});
