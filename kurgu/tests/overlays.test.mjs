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

test('karışım modlu görsel katmanı şeritlerden ayrılır (blendLayers), video katmanı normal kalır', () => {
  let p = base();
  let r = TL.addOverlay(p, image('st'), 1000);
  p = TL.updateOverlay(r.project, r.newId, { blend: 'screen', transform: { x: 0.2 } });
  const stId = r.newId;
  r = TL.addOverlay(p, video('ov', 2000), 3000);
  p = TL.updateOverlay(r.project, r.newId, { blend: 'multiply' });
  r = TL.addOverlay(p, image('nm'), 6000);
  p = r.project;
  const spec = buildRenderSpec(p, uri);
  assert.equal(spec.blendLayers.length, 1);
  const bl = spec.blendLayers[0];
  assert.equal(bl.key, stId);
  assert.equal(bl.blend, 2); // BLEND_MODES: normal, multiply, screen…
  assert.equal(bl.kind, 'image');
  assert.equal(bl.xf[0], 0.2);
  const laneKeys = spec.layers.flat().map((l) => l.key);
  assert.ok(!laneKeys.includes(stId), 'karışım katmanı şeritte olmamalı');
  assert.equal(laneKeys.length, 2, 'video (normal çizilir) ve normal görsel şeritte');
  // Canlı ayrıştırma: konum değişince yapı aynı kalır, değer canlı anahtardan gelir
  const a = splitLive(spec);
  const moved = buildRenderSpec(TL.updateOverlay(p, stId, { transform: { x: 0.5 } }), uri);
  const b = splitLive(moved);
  assert.equal(a.structure, b.structure);
  assert.equal(b.live[`ly:${stId}`][0], 0.5);
  // Mod değişimi yapıdır (yeniden kurulur)
  const other = splitLive(buildRenderSpec(TL.updateOverlay(p, stId, { blend: 'overlay' }), uri));
  assert.notEqual(a.structure, other.structure);
});

test('videoda arka plan kaldırma: katman kopyaya geçer, chroma açılır, geri alınca her şey döner', () => {
  let p = projectWith([video('a', 8000)]);
  const r = TL.addOverlay(p, video('ov', 6000), 0);
  p = TL.updateOverlay(r.project, r.newId, { srcIn: 1000, srcOut: 4000, chroma: { tolerance: 0.5 } });
  const before = p.overlays[0];
  const cut = { id: 'cut1', kind: 'video', path: 'media/cut1.mp4', name: 'ov (kesik)', durationMs: 3000, width: 720, height: 1280, hasAudio: true, cutoutOf: { mediaId: 'ov', srcIn: 1000, srcOut: 4000 } };
  p = TL.applyCutout(p, r.newId, cut);
  const o = p.overlays[0];
  assert.equal(o.mediaId, 'cut1');
  assert.deepEqual([o.srcIn, o.srcOut], [0, 3000]);
  assert.equal(TL.overlayDuration(o), TL.overlayDuration(before), 'zamanlama aynı');
  assert.equal(o.chroma.on, true);
  assert.equal(o.chroma.color, '#00B140');
  assert.equal(TL.findCutoutMedia(p, 'ov', 1000, 4000).id, 'cut1');
  assert.equal(TL.applyCutout(p, r.newId, cut), p, 'iki kez uygulanmaz');
  p = TL.removeCutout(p, r.newId);
  const back = p.overlays[0];
  assert.deepEqual([back.mediaId, back.srcIn, back.srcOut, back.chroma.tolerance, back.chroma.on], ['ov', 1000, 4000, 0.5, false]);
  assert.equal(back.cutoutFrom, null);
});

test('video katmanı yoksa normal görsel katmanları da tek girişli yoldan çizilir (BUG-010)', () => {
  let p = projectWith([video('v1')]);
  let r = TL.addOverlay(p, image('st1'), 0);
  const first = r.newId;
  r = TL.addOverlay(r.project, image('st2'), 1000);
  p = r.project;
  let spec = buildRenderSpec(p, uri);
  // Çok girişli birleştirici gerekmez: şerit yok, iki görsel de karışım yolunda, normal kipte
  assert.equal(spec.layers.length, 0);
  assert.deepEqual(spec.blendLayers.map((l) => l.blend), [0, 0]);
  assert.ok(spec.blendLayers.some((l) => l.key === first));
  // Video katmanı eklenince şerit sırası korunur: normal görseller yeniden birleştiriciye döner
  p = TL.addOverlay(p, video('v2'), 0).project;
  spec = buildRenderSpec(p, uri);
  assert.ok(spec.layers.length >= 1);
  assert.equal(spec.blendLayers.length, 0);
});
