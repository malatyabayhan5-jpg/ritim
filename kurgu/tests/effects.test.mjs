import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DICTIONARIES } from '../src/i18n/core';
import { FX_CATALOG, FX_CATEGORIES, createEffectInstance, effectById, effectRenderSpec, paramsArray, seedOf } from '../src/model/effects';
import { migrateProject } from '../src/model/schema';
import * as TL from '../src/model/timeline';
import { buildRenderSpec } from '../src/engine/renderSpec';
import { createHistory, pushHistory, undo, redo, COALESCE_MS } from '../src/model/history';
import { projectWith, video } from './helpers.mjs';

const root = process.cwd();
const shaderDir = join(root, 'modules/kurgu-engine/android/src/main/assets/kurgu_fx');
const uri = (m) => `file:///lib/${m.path}`;
const has = (lang, key) => {
  const node = key.split('.').reduce((n, k) => (n && typeof n === 'object' ? n[k] : undefined), DICTIONARIES[lang]);
  return typeof node === 'string' && node.trim().length > 0;
};

test('efekt kataloğu tutarlı: benzersiz kimlik, shader dosyası, parametre sınırları', () => {
  const ids = new Set();
  const shaders = new Set();
  for (const e of FX_CATALOG) {
    assert.ok(!ids.has(e.id), `yinelenen efekt: ${e.id}`);
    ids.add(e.id);
    assert.ok(!shaders.has(e.shader), `aynı shader iki efekte bağlı: ${e.shader}`);
    shaders.add(e.shader);
    assert.match(e.shader, /^[a-z0-9_]+$/);
    const file = join(shaderDir, `${e.shader}.glsl`);
    assert.ok(existsSync(file), `shader yok: ${file}`);
    assert.match(readFileSync(file, 'utf8'), /vec4\s+fx\s*\(\s*vec2/, `${e.shader}: fx(vec2) fonksiyonu yok`);
    assert.ok(['light', 'medium', 'heavy'].includes(e.perf), `${e.id}: perf`);
    assert.equal(e.license, 'original');
    assert.ok(e.params.length <= 8);
    const slots = e.params.map((p, i) => p.slot ?? i);
    assert.equal(new Set(slots).size, slots.length, `${e.id}: çakışan parametre yuvası`);
    slots.forEach((s) => assert.ok(s >= 0 && s < 8));
    for (const p of e.params) {
      const min = p.min ?? 0;
      const max = p.max ?? 1;
      assert.ok(min < max, `${e.id}.${p.key}: min < max`);
      assert.ok(p.default >= min && p.default <= max, `${e.id}.${p.key}: varsayılan sınır dışında`);
    }
    assert.ok(existsSync(join(root, 'assets/fx', `${e.id}.jpg`)), `${e.id}: küçük resim yok`);
  }
  assert.ok(FX_CATALOG.length >= 20);
});

test('her efektin adı, açıklaması, kategori ve parametre etiketleri üç dilde var', () => {
  const keys = ['fx.titleLayer', 'fx.titleClip', 'fx.amount', 'fx.remove', 'fx.maxReached', 'fx.perf.heavy', 'fx.category.all'];
  FX_CATEGORIES.forEach((c) => keys.push(`fx.category.${c}`));
  FX_CATALOG.forEach((e) => {
    keys.push(`fx.${e.id}.name`, `fx.${e.id}.desc`);
    e.params.forEach((p) => keys.push(`fx.param.${p.key}`));
  });
  const missing = [];
  for (const lang of Object.keys(DICTIONARIES)) for (const k of keys) if (!has(lang, k)) missing.push(`${lang}:${k}`);
  assert.deepEqual(missing, []);
});

test('paramsArray varsayılanla doldurur, sınırlara kırpar, 8 değer döndürür', () => {
  const glow = effectById('glow');
  const arr = paramsArray(glow, { radius: 99, threshold: -5 });
  assert.equal(arr.length, 8);
  const r = glow.params.find((p) => p.key === 'radius');
  const th = glow.params.find((p) => p.key === 'threshold');
  assert.equal(arr[r.slot ?? 0], r.max ?? 1);
  assert.equal(arr[th.slot ?? 1], th.min ?? 0);
  const warm = glow.params.find((p) => p.key === 'warmth');
  assert.equal(arr[warm.slot ?? 2], warm.default);
  assert.deepEqual(paramsArray(null), new Array(8).fill(0));
});

test('tohum kimlikten kararlıdır; bilinmeyen efekt render tanımına girmez', () => {
  assert.equal(seedOf('fx_abc'), seedOf('fx_abc'));
  assert.notEqual(seedOf('fx_abc'), seedOf('fx_abd'));
  assert.ok(seedOf('x') >= 0 && seedOf('x') < 1);
  assert.equal(effectRenderSpec({ id: 'a', effectId: 'yokBoyle', values: {} }, 0, 100), null);
});

test('klip efekt yığını: ekle, en fazla 4, değer birleştir, kaldır', () => {
  let p = projectWith([video('a', 4000)]);
  const clipId = p.main[0].id;
  const ids = [];
  for (const id of ['glow', 'vhs', 'shake', 'snow']) {
    const r = TL.addClipEffect(p, clipId, id);
    p = r.project;
    ids.push(r.newId);
  }
  const over = TL.addClipEffect(p, clipId, 'rain');
  assert.equal(over.newId, null);
  assert.equal(over.project, p);
  assert.deepEqual(p.main[0].effects.map((e) => e.effectId), ['glow', 'vhs', 'shake', 'snow']);
  p = TL.updateClipEffect(p, clipId, ids[0], { values: { radius: 0.9 } });
  p = TL.updateClipEffect(p, clipId, ids[0], { amount: 0.5 });
  const g = p.main[0].effects[0];
  assert.equal(g.values.radius, 0.9);
  assert.equal(g.values.threshold, effectById('glow').params.find((x) => x.key === 'threshold').default);
  assert.equal(g.amount, 0.5);
  p = TL.removeClipEffect(p, clipId, ids[1]);
  assert.deepEqual(p.main[0].effects.map((e) => e.effectId), ['glow', 'shake', 'snow']);
});

test('efekt katmanı: ekle, kırp, böl, çoğalt, sil', () => {
  let p = projectWith([video('a', 10000)]);
  let r = TL.addEffectLayer(p, 'duotone', 1000, 3000);
  p = r.project;
  const id = r.newId;
  p = TL.trimEffectLayer(p, id, 'start', 500);
  assert.deepEqual([p.effectLayers[0].start, p.effectLayers[0].duration], [1500, 2500]);
  p = TL.trimEffectLayer(p, id, 'end', 1000);
  assert.equal(p.effectLayers[0].duration, 3500);
  const s = TL.splitEffectLayerAt(p, id, 3000);
  assert.ok(s.changed);
  p = s.project;
  assert.deepEqual(p.effectLayers.map((e) => [e.start, e.duration]), [[1500, 1500], [3000, 2000]]);
  assert.equal(p.effectLayers[1].effectId, 'duotone');
  const d = TL.duplicateEffectLayer(p, id);
  p = d.project;
  assert.equal(p.effectLayers.length, 3);
  assert.equal(p.effectLayers[2].start, 3000);
  p = TL.deleteEffectLayer(p, id);
  assert.equal(p.effectLayers.length, 2);
  assert.ok(!TL.splitEffectLayerAt(p, p.effectLayers[0].id, 3050).changed);
});

test('render tanımı: klip efekti klibin zaman penceresini, katmanlar toplam süreye kırpılmış aralığı alır', () => {
  let p = projectWith([video('a', 4000), video('b', 3000)]);
  const second = p.main[1].id;
  p = TL.addClipEffect(p, second, 'glitch').project;
  // Katmanlar sonradan taşınmış olabilir: render tanımı toplam süreye kırpar
  p = TL.addEffectLayer(p, 'snow', 0, 3000).project;
  p = TL.updateEffectLayer(p, p.effectLayers[0].id, { start: 6000 });
  p = TL.addEffectLayer(p, 'rain', 500, 1000).project;
  p = TL.addEffectLayer(p, 'sparkle', 0, 1000).project;
  p = TL.updateEffectLayer(p, p.effectLayers[2].id, { start: 8000 }); // tamamen sonda: atlanır
  const s = buildRenderSpec(p, uri);
  assert.equal(s.main[0].effects.length, 0);
  const fx = s.main[1].effects[0];
  assert.equal(fx.shader, 'glitch');
  assert.equal(fx.startMs, 4000);
  assert.equal(fx.endMs, 7000);
  assert.equal(fx.params.length, 8);
  assert.deepEqual(s.effectLayers.map((e) => [e.shader, e.startMs, e.endMs]), [['rain', 500, 1500], ['snow', 6000, 7000]]);
});

test('efektler kaydet/aç sonrası aynı kalır ve aynı rastgele tohumu üretir', () => {
  let p = projectWith([video('a', 5000)]);
  p = TL.addClipEffect(p, p.main[0].id, 'lightLeak').project;
  p = TL.addEffectLayer(p, 'oldFilm', 0, 2000).project;
  const before = buildRenderSpec(p, uri);
  const reopened = migrateProject(JSON.parse(JSON.stringify(p)));
  const after = buildRenderSpec(reopened, uri);
  assert.deepEqual(after.main[0].effects, before.main[0].effects);
  assert.deepEqual(after.effectLayers, before.effectLayers);
});

test('eski tek efekt alanı yeni efekt yığınına taşınır', () => {
  const p = projectWith([video('a', 3000), video('b', 3000)]);
  const raw = JSON.parse(JSON.stringify(p));
  raw.main[0].fx = { id: 'vhs', intensity: 0.6 };
  delete raw.main[0].effects;
  raw.main[1].fx = { id: 'mosaic', intensity: 1 };
  raw.main[2] = { ...raw.main[1], id: 'clip_old3', fx: { id: 'vignette', intensity: 1 } };
  delete raw.effectLayers;
  const m = migrateProject(raw);
  assert.deepEqual(m.main[0].effects.map((e) => [e.effectId, e.amount]), [['vhs', 0.6]]);
  assert.equal(m.main[0].fx.id, 'none');
  assert.deepEqual(m.main[1].effects.map((e) => [e.effectId, e.values.cellSize]), [['mosaic', 0.8]]);
  // Karşılığı olmayan eski efekt eski yolla kalır
  assert.equal(m.main[2].fx.id, 'vignette');
  assert.deepEqual(m.main[2].effects, []);
  assert.deepEqual(m.effectLayers, []);
  // Taşıma idempotent: tekrar açınca çoğalmaz
  assert.equal(migrateProject(JSON.parse(JSON.stringify(m))).main[0].effects.length, 1);
});

test('geri al / yinele efekt ekleme ve parametre değişikliğini geri alır', () => {
  let p = projectWith([video('a', 3000)]);
  const clipId = p.main[0].id;
  let h = createHistory(p);
  const r = TL.addClipEffect(h.present, clipId, 'crt');
  h = pushHistory(h, r.project, null, 1000);
  h = pushHistory(h, TL.updateClipEffect(h.present, clipId, r.newId, { values: { curvature: 0.1 } }), 'k', 2000);
  h = pushHistory(h, TL.updateClipEffect(h.present, clipId, r.newId, { values: { curvature: 0.2 } }), 'k', 2100);
  assert.equal(h.past.length, 2); // sürükleme tek adım
  h = undo(h);
  assert.equal(h.present.main[0].effects[0].values.curvature, effectById('crt').params.find((x) => x.key === 'curvature').default);
  h = undo(h);
  assert.equal(h.present.main[0].effects.length, 0);
  h = redo(redo(h));
  assert.equal(h.present.main[0].effects[0].values.curvature, 0.2);
});

test('aynı anahtarlı değişiklikler yalnızca kısa süre içinde birleşir', () => {
  let h = createHistory({ v: 0 });
  h = pushHistory(h, { v: 1 }, 'slider', 0);
  h = pushHistory(h, { v: 2 }, 'slider', 100);
  assert.equal(h.past.length, 1);
  h = pushHistory(h, { v: 3 }, 'slider', 100 + COALESCE_MS + 1);
  assert.equal(h.past.length, 2);
  assert.equal(undo(h).present.v, 2);
});

test('yeni efekt örneği katalog varsayılanlarıyla oluşur', () => {
  const inst = createEffectInstance('kaleidoscope');
  assert.equal(inst.amount, 1);
  const e = effectById('kaleidoscope');
  e.params.forEach((p) => assert.equal(inst.values[p.key], p.default));
  assert.match(inst.id, /^fx_/);
});

test('oynatma kafası sondayken eklenen efekt katmanı ve metin videonun içine yerleşir', () => {
  let p = projectWith([video('a', 10000)]);
  const atEnd = TL.addEffectLayer(p, 'duotone', 10000, 3000).project.effectLayers[0];
  assert.deepEqual([atEnd.start, atEnd.duration], [7000, 3000]);
  const mid = TL.addEffectLayer(p, 'duotone', 2000, 3000).project.effectLayers[0];
  assert.deepEqual([mid.start, mid.duration], [2000, 3000]);
  const short = TL.addEffectLayer(projectWith([video('b', 1200)]), 'glow', 1200, 3000).project.effectLayers[0];
  assert.deepEqual([short.start, short.duration], [0, 1200]);
  const txt = TL.addText(p, 9990, 'Son').project.texts[0];
  assert.ok(txt.start + txt.duration <= 10000 && txt.duration === 3000, JSON.stringify([txt.start, txt.duration]));
  // render tanımında görünür aralıkta kalır
  const s = buildRenderSpec(TL.addEffectLayer(p, 'duotone', 10000, 3000).project, uri);
  assert.deepEqual([s.effectLayers[0].startMs, s.effectLayers[0].endMs], [7000, 10000]);
});
