import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateProject } from '../src/model/schema';
import * as TL from '../src/model/timeline';
import { buildRenderSpec } from '../src/engine/renderSpec';
import { splitLive } from '../src/engine/live';
import { setKey, valueAt } from '../src/model/keyframes';
import { image, projectWith, video } from './helpers.mjs';

const uri = (m) => `file:///lib/${m.path}`;
const base = () => projectWith([video('v1', 10000)]);

test('katman ekleme: boş şeride yerleşir, çakışan yeni şeride çıkar, üst sınır', () => {
  let p = base();
  let r = TL.addOverlay(p, video('o1', 3000), 1000);
  p = r.project;
  assert.equal(p.overlays[0].lane, 0);
  r = TL.addOverlay(p, image('o2'), 2000); // 2000-5000 o1 ile çakışır
  p = r.project;
  assert.equal(p.overlays.find((o) => o.id === r.newId).lane, 1);
  r = TL.addOverlay(p, image('o3'), 5000); // 0. şerit 4000'de boşalır
  p = r.project;
  assert.equal(p.overlays.find((o) => o.id === r.newId).lane, 0);
  for (let i = 0; i < TL.MAX_OVERLAY_LANES; i++) p = TL.addOverlay(p, image(`x${i}`), 2500).project;
  const full = TL.addOverlay(p, image('y'), 2500);
  assert.equal(full.error, 'LANES_FULL');
  assert.equal(full.project, p);
});

test('katman videonun dışına başlamaz; medya projeye eklenir', () => {
  const r = TL.addOverlay(base(), video('o1', 3000), 9500);
  const o = r.project.overlays[0];
  assert.equal(o.start, 7000);
  assert.ok(r.project.media.o1);
  assert.ok(TL.usedMediaIds(r.project).has('o1'));
});

test('bölme ve kırpma anahtar kareleri kaydırır, değerler sürekli kalır', () => {
  let p = TL.addOverlay(base(), video('o1', 4000), 0).project;
  const id = p.overlays[0].id;
  let kf = setKey([], 0, -0.5, 'linear');
  kf = setKey(kf, 4000, 0.5, 'linear');
  p = TL.updateOverlay(p, id, { keyframes: { x: kf } });
  const s = TL.splitOverlayAt(p, id, 1000);
  assert.ok(s.changed);
  const a = s.project.overlays.find((o) => o.id === id);
  const b = s.project.overlays.find((o) => o.id === s.newId);
  assert.equal(a.srcOut, 1000);
  assert.equal(b.srcIn, 1000);
  assert.equal(b.start, 1000);
  assert.ok(Math.abs(valueAt(a.keyframes.x, 1000, 0) - valueAt(b.keyframes.x, 0, 0)) < 1e-9);
  assert.ok(Math.abs(valueAt(b.keyframes.x, 0, 0) - -0.25) < 1e-9);
  const t = TL.trimOverlay(s.project, s.newId, 'start', 1000, 4000);
  const bt = t.overlays.find((o) => o.id === s.newId);
  assert.equal(bt.start, 2000);
  assert.equal(bt.srcIn, 2000);
  assert.ok(Math.abs(valueAt(bt.keyframes.x, 0, 0) - 0) < 1e-9);
});

test('taşıma: dolu şeride taşınamazsa boş şerit seçilir', () => {
  let p = TL.addOverlay(base(), image('a'), 0).project; // 0-3000 şerit 0
  p = TL.addOverlay(p, image('b'), 5000).project; // 5000-8000 şerit 0
  const bId = p.overlays[1].id;
  p = TL.moveOverlay(p, bId, 1000, 0);
  const b = p.overlays.find((o) => o.id === bId);
  assert.equal(b.start, 1000);
  assert.equal(b.lane, 1);
});

test('render tanımı: şeritler alttan üste, maske/chroma dizileri, katman sesi ses şeridinde', () => {
  let p = TL.addOverlay(base(), video('o1', 3000), 1000).project;
  const id = p.overlays[0].id;
  p = TL.updateOverlay(p, id, {
    transform: { x: 0.3, scale: 0.4, rotation: 15 },
    mask: { type: 'ellipse', w: 0.6 },
    chroma: { on: true, color: '#00FF00' },
    opacity: 0.8,
    keyframes: { opacity: [{ t: 0, v: 0, e: 'linear' }, { t: 500, v: 1 }] },
  });
  p = TL.addOverlay(p, image('o2'), 1000).project;
  const spec = buildRenderSpec(p, uri);
  assert.equal(spec.layers.length, 2);
  const l = spec.layers[0][0];
  assert.equal(l.key, id);
  assert.deepEqual(l.xf, [0.3, 0, 0.4, 15]);
  assert.equal(l.mask[0], 2);
  assert.equal(l.mask[4], 0.6);
  assert.deepEqual(l.chroma.slice(0, 4), [0, 1, 0, 1]);
  assert.equal(l.opacity, 0.8);
  assert.equal(l.kf.opacity.length, 14);
  assert.equal(spec.layers[1][0].kind, 'image');
  const audioKeys = spec.audioLanes.flat().map((a) => a.key);
  assert.ok(audioKeys.includes(`${id}#a`));
  // Sessiz katmanın sesi eklenmez
  const muted = buildRenderSpec(TL.updateOverlay(p, id, { muted: true }), uri);
  assert.ok(!muted.audioLanes.flat().some((a) => a.key === `${id}#a`));
});

test('canlı ayrıştırma: konum/opaklık/maske değerleri yapıyı değiştirmez, maske türü değiştirir', () => {
  let p = TL.addOverlay(base(), image('o1'), 0).project;
  const id = p.overlays[0].id;
  const s1 = splitLive(buildRenderSpec(p, uri));
  const s2 = splitLive(buildRenderSpec(TL.updateOverlay(p, id, { transform: { x: 0.7 }, opacity: 0.3, mask: { feather: 0.2 } }), uri));
  assert.equal(s1.structure, s2.structure);
  assert.equal(s2.live[`ly:${id}`][0], 0.7);
  assert.equal(s2.live[`ly:${id}`][4], 0.3);
  assert.equal(s2.live[`ly:${id}`].length, 15);
  const s3 = splitLive(buildRenderSpec(TL.updateOverlay(p, id, { mask: { type: 'star' } }), uri));
  assert.notEqual(s1.structure, s3.structure);
});

test('eski proje (katmansız) açılır; bozuk katman ayıklanır, eksik alanlar tamamlanır', () => {
  const p = base();
  const { overlays, ...old } = p;
  const m = migrateProject(old);
  assert.deepEqual(m.overlays, []);
  const m2 = migrateProject({ ...p, overlays: [{ id: 'x', mediaId: 'v1', srcIn: 0, srcOut: 1000, start: 0, lane: 0, transform: { x: 0.2 } }, { id: 'bad' }] });
  assert.equal(m2.overlays.length, 1);
  assert.equal(m2.overlays[0].transform.x, 0.2);
  assert.equal(m2.overlays[0].transform.scale, 0.5);
  assert.equal(m2.overlays[0].mask.type, 'none');
  assert.deepEqual(m2.overlays[0].keyframes, {});
});

test('katman silme ve çoğaltma', () => {
  let p = TL.addOverlay(base(), image('o1'), 0).project;
  const id = p.overlays[0].id;
  const d = TL.duplicateOverlay(p, id);
  assert.equal(d.project.overlays.length, 2);
  assert.equal(d.project.overlays[1].start, 3000);
  p = TL.deleteOverlay(d.project, id);
  assert.equal(p.overlays.length, 1);
});
