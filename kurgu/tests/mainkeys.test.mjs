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

test('ses düzeyi anahtar kareleri: ekle, değerle, render tanımı, ses öğesi bölme kaydırması', () => {
  let p = projectWith([video('v1', 8000)]);
  const clip = p.main[0];
  p = TL.updateMain(p, clip.id, TL.toggleVolumeKey(p.main[0], 0));
  p = TL.updateMain(p, clip.id, TL.toggleVolumeKey(p.main[0], 4000));
  p = TL.updateMain(p, clip.id, TL.volumePatch(p.main[0], 0.2, 4000));
  assert.equal(p.main[0].keyframes.volume.length, 2);
  assert.ok(Math.abs(TL.volumeAt(p.main[0], 2000) - 0.6) < 1e-6, 'doğrusal ara değer');
  const spec = buildRenderSpec(p, (m) => `file:///${m.path}`);
  assert.equal(spec.main[0].volumeKf.length, 14, 'iki kare × 7 değer');
  p = TL.updateMain(p, clip.id, TL.toggleVolumeKey(p.main[0], 0));
  p = TL.updateMain(p, clip.id, TL.toggleVolumeKey(p.main[0], 4000));
  assert.equal(p.main[0].keyframes.volume, undefined, 'son kare silinince iz kalkar');
  assert.ok(Math.abs(p.main[0].volume - 0.2) < 1e-6, 'o anki değer sabit düzey olur');

  const au = { id: 'a1', kind: 'audio', path: 'media/a1.m4a', name: 'a', durationMs: 10000, hasAudio: true };
  const r0 = TL.addAudio(p, au, 0);
  p = r0.project;
  const a = p.audio.find((x) => x.id === r0.newId);
  p = TL.updateAudio(p, a.id, TL.toggleVolumeKey(a, 1000));
  p = TL.updateAudio(p, a.id, TL.toggleVolumeKey(p.audio.find((x) => x.id === a.id), 6000));
  assert.equal(buildRenderSpec(p, (m) => `file:///${m.path}`).audioLanes.flat().find((x) => x.key === a.id).volumeKf.length, 14);
  const r = TL.splitAudioAt(p, a.id, a.start + 3000);
  assert.ok(r.changed);
  const second = r.project.audio.find((x) => x.id === r.newId);
  const tr = second.keyframes.volume;
  assert.equal(tr[0].t, 0, 'ikinci parçada iz kesim noktasından başlar');
  assert.equal(tr[tr.length - 1].t, 3000);
});
