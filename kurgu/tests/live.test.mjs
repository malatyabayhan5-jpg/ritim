import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRenderSpec } from '../src/engine/renderSpec';
import { splitLive } from '../src/engine/live';
import * as TL from '../src/model/timeline';
import { projectWith, video, audio } from './helpers.mjs';

const uri = (m) => `file:///lib/${m.path}`;
const fixture = () => {
  let p = projectWith([video('a', 4000), video('b', 3000)]);
  p = TL.addClipEffect(p, p.main[0].id, 'glow').project;
  p = TL.addEffectLayer(p, 'snow', 1000, 2000).project;
  p = TL.addAudio(p, audio('m', 5000), 0, 'music').project;
  return p;
};

test('kaydırıcı değerleri değişince yapı anahtarı aynı kalır, canlı değerler değişir', () => {
  let p = fixture();
  const a = splitLive(buildRenderSpec(p, uri));
  const clip = p.main[0];
  const inst = clip.effects[0];
  p = TL.updateClipEffect(p, clip.id, inst.id, { amount: 0.4, values: { radius: 0.9 } });
  p = TL.updateMain(p, clip.id, { volume: 0.5, fadeIn: 300, adjust: { ...clip.adjust, brightness: 0.3 } });
  p = TL.updateEffectLayer(p, p.effectLayers[0].id, { amount: 0.2 });
  p = TL.updateAudio(p, p.audio[0].id, { volume: 0.3, fadeOut: 500 });
  const b = splitLive(buildRenderSpec(p, uri));
  // parlaklık 0'dan çıkınca renk matrisi ilk kez oluşur: bu bir yapı değişikliğidir
  const c = splitLive(buildRenderSpec(TL.updateMain(p, clip.id, { adjust: { ...p.main[0].adjust, brightness: 0.1 } }), uri));
  assert.equal(b.structure, c.structure);
  assert.notEqual(a.structure, b.structure);
  assert.deepEqual(b.live[`fx:${clip.id}/${inst.id}`].slice(0, 1), [0.4]);
  assert.equal(b.live[`vol:${clip.id}`][0], 0.5);
  assert.equal(b.live[`vol:${clip.id}`][1], 300);
  assert.equal(b.live[`fx:${p.effectLayers[0].id}`][0], 0.2);
  assert.deepEqual(b.live[`vol:${p.audio[0].id}`], [0.3, 0, 500]);
  assert.equal(b.live[`cm:${clip.id}`].length, 16);
  assert.notDeepEqual(b.live[`cm:${clip.id}`], c.live[`cm:${clip.id}`]);
});

test('yapısal değişiklikler (efekt ekleme, bölme, yeni katman) yapı anahtarını değiştirir', () => {
  const p = fixture();
  const base = splitLive(buildRenderSpec(p, uri)).structure;
  const variants = [
    TL.addClipEffect(p, p.main[1].id, 'vhs').project,
    TL.splitMainAt(p, 1000).project,
    TL.addEffectLayer(p, 'rain', 0, 1000).project,
    TL.updateEffectLayer(p, p.effectLayers[0].id, { start: 1500 }),
    TL.moveMain(p, 0, 1),
  ];
  for (const v of variants) assert.notEqual(splitLive(buildRenderSpec(v, uri)).structure, base);
});

test('canlı anahtarlar benzersizdir ve her efekt için 9 değer taşır', () => {
  const p = fixture();
  const { live } = splitLive(buildRenderSpec(p, uri));
  const fxKeys = Object.keys(live).filter((k) => k.startsWith('fx:'));
  assert.equal(fxKeys.length, 2);
  fxKeys.forEach((k) => assert.equal(live[k].length, 9));
});

test('büyük proje: 300 klip + 50 efekt için render tanımı ve ayrıştırma hızlıdır', () => {
  const media = Array.from({ length: 300 }, (_, i) => video(`v${i}`, 3000 + (i % 7) * 500));
  let p = projectWith(media);
  for (let i = 0; i < 50; i++) p = TL.addClipEffect(p, p.main[i * 6].id, 'glow').project;
  // 5 tur × 10 çağrı; en iyi tur alınır (paralel yük altındaki ölçüm gürültüsüne karşı)
  let per = Infinity;
  for (let r = 0; r < 5; r++) {
    const t0 = performance.now();
    for (let k = 0; k < 10; k++) splitLive(buildRenderSpec(p, uri));
    per = Math.min(per, (performance.now() - t0) / 10);
  }
  console.log(`# render tanımı (300 klip): ${per.toFixed(1)} ms`);
  assert.ok(per < 25, `${per.toFixed(1)} ms`);
});

test('metni önizlemede sürüklemek, döndürmek ve opaklığı değiştirmek önizlemeyi yeniden kurmaz', () => {
  let p = TL.addText(fixture(), 500, 'Merhaba').project;
  const id = p.texts[0].id;
  const a = splitLive(buildRenderSpec(p, uri));
  assert.deepEqual(a.live[`tx:${id}`], [p.texts[0].x, p.texts[0].y, p.texts[0].rotation, p.texts[0].style.opacity ?? 1]);
  p = TL.updateText(p, id, { x: 0.3, y: -0.2, rotation: 15, style: { ...p.texts[0].style, opacity: 0.5 } });
  const b = splitLive(buildRenderSpec(p, uri));
  assert.equal(a.structure, b.structure);
  assert.deepEqual(b.live[`tx:${id}`], [0.3, -0.2, 15, 0.5]);
  // Metin içeriği ve ölçek (satır kırma) yapıdır
  const c = splitLive(buildRenderSpec(TL.updateText(p, id, { text: 'Selam' }), uri));
  const d = splitLive(buildRenderSpec(TL.updateText(p, id, { scale: 1.6 }), uri));
  assert.notEqual(b.structure, c.structure);
  assert.notEqual(b.structure, d.structure);
});

test('ana klibin ölçeği, konumu ve açısı önizlemede canlıdır (yeniden kurulum yok)', () => {
  let p = fixture();
  const id = p.main[0].id;
  const a = splitLive(buildRenderSpec(p, uri));
  assert.deepEqual(a.live[`tf:${id}`], [1, 0, 0, 0]);
  p = TL.updateMain(p, id, { transform: { ...p.main[0].transform, scale: 1.4, x: 0.2, y: -0.1, angle: 12 } });
  const b = splitLive(buildRenderSpec(p, uri));
  assert.equal(a.structure, b.structure);
  assert.deepEqual(b.live[`tf:${id}`], [1.4, 0.2, -0.1, 12]);
});
