import test from 'node:test';
import assert from 'node:assert/strict';
import * as TL from '../src/model/timeline';
import { valueAt, valueAtPacked } from '../src/model/keyframes';
import { buildRenderSpec } from '../src/engine/renderSpec';
import { projectWith, video } from './helpers.mjs';

const uri = (m) => `file:///lib/${m.path}`;

test('ana iz anahtar kareleri: aç/kapat, kaydırıcı kareyi düzenler, iz silinince değer korunur', () => {
  let p = projectWith([video('a', 6000)]);
  const id = p.main[0].id;
  const c = () => p.main[0];
  p = TL.updateMain(p, id, TL.toggleMainKey(c(), 'scale', 0));
  p = TL.updateMain(p, id, TL.mainPropPatch(c(), 'scale', 2, 4000));
  assert.equal(c().keyframes.scale.length, 2);
  assert.ok(Math.abs(TL.mainPropAt(c(), 'scale', 2000) - 1.5) < 0.2);
  p = TL.updateMain(p, id, TL.toggleMainKey(c(), 'scale', 4000));
  p = TL.updateMain(p, id, TL.toggleMainKey(c(), 'scale', 0));
  assert.equal(c().keyframes.scale, undefined, 'iz birleştirmeyle geri gelmemeli');
  assert.equal(c().transform.scale, 1);
});

test('bölme ve baştan kırpma kareleri kaydırır; render tanımı paketli izleri taşır', () => {
  let p = projectWith([video('a', 6000)]);
  const id = p.main[0].id;
  p = TL.updateMain(p, id, { keyframes: { x: [{ t: 0, v: -1, e: 'linear' }, { t: 6000, v: 1, e: 'linear' }] } });
  const r = TL.splitMainAt(p, 3000);
  const [a, b] = r.project.main;
  assert.ok(Math.abs(valueAt(a.keyframes.x, 3000, 9) - valueAt(b.keyframes.x, 0, 9)) < 1e-9);
  const trimmed = TL.trimMain(p, id, 'start', 1000);
  assert.ok(Math.abs(valueAt(trimmed.main[0].keyframes.x, 0, 9) - valueAt(p.main[0].keyframes.x, 1000, 9)) < 1e-9);
  const s = buildRenderSpec(r.project, uri);
  assert.equal(s.main[1].startMs, 3000);
  assert.ok(Math.abs(valueAtPacked(s.main[1].kf.x, 0, 9)) < 1e-9);
});

test('efekt yoğunluğu anahtar kareleri: köken pencere genişletmede sabit', () => {
  let p = projectWith([video('a', 5000), video('b', 5000)]);
  const bId = p.main[1].id;
  const r = TL.addClipEffect(p, bId, 'glow');
  p = r.project;
  const inst = p.main[1].effects[0];
  p = TL.updateClipEffect(p, bId, inst.id, { keyframes: { amount: [{ t: 0, v: 0, e: 'linear' }, { t: 1000, v: 1 }] } });
  p = TL.updateMain(p, bId, { transition: { type: 'dissolve', durationMs: 800 } });
  const s = buildRenderSpec(p, uri);
  const fx = s.main[1].effects[0];
  assert.equal(fx.kfOriginMs, 5000);
  assert.equal(fx.kfAmount.length, 14);
  const copy = s.layers[1][0].effects[0];
  assert.ok(copy.startMs < fx.startMs);
  assert.equal(copy.kfOriginMs, 5000);
});
