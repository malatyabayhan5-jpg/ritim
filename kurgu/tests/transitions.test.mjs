import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TRANSITIONS, TRANSITION_CATEGORIES } from '../src/model/catalog';
import * as TL from '../src/model/timeline';
import { buildRenderSpec } from '../src/engine/renderSpec';
import { splitLive } from '../src/engine/live';
import { image, projectWith, video } from './helpers.mjs';

const uri = (m) => `file:///lib/${m.path}`;
const fxDir = join(process.cwd(), 'modules/kurgu-engine/android/src/main/assets/kurgu_fx');
const glsl = ['_transitions.glsl', '_transitions2.glsl'].map((f) => readFileSync(join(fxDir, f), 'utf8')).join('\n');

test('geçiş kataloğu: benzersiz kimlik ve numara, her numara shader içinde işleniyor', () => {
  const ids = new Set();
  const ns = new Set();
  for (const x of TRANSITIONS) {
    assert.ok(!ids.has(x.id), x.id);
    assert.ok(!ns.has(x.n), `${x.id}: numara ${x.n}`);
    ids.add(x.id);
    ns.add(x.n);
    assert.ok(TRANSITION_CATEGORIES.includes(x.category), x.id);
    if (x.n === 0) continue;
    const handled = glsl.includes(`type == ${x.n}.0`) || (x.n >= 30 && x.n <= 37 && glsl.includes('type >= 30.0 && type < 40.0'));
    assert.ok(handled, `${x.id} (${x.n}) _transitions.glsl içinde yok`);
  }
  assert.ok(TRANSITIONS.length - 1 >= 40, 'en az 40 geçiş');
});

function withTransition(type, durationMs, media = [video('a', 5000), video('b', 5000)]) {
  let p = projectWith(media);
  return TL.updateMain(p, p.main[1].id, { transition: { type, durationMs } });
}

test('A/B katmanları: pencere kesmeyi ortalar, A altta B üstte, kullanıcı katmanlarının altında', () => {
  let p = withTransition('dissolve', 1000);
  p = TL.addOverlay(p, image('o'), 0).project;
  const s = buildRenderSpec(p, uri);
  // Video katmanı yokken görsel katman tek girişli karışım yolundan, birleştiriciden sonra
  // (yani geçiş şeritlerinin üstünde) çizilir (BUG-010)
  assert.equal(s.layers.length, 2);
  const [a] = s.layers[0];
  const [b] = s.layers[1];
  assert.equal(a.key, `tr:${p.main[1].id}:A`);
  assert.equal(b.key, `tr:${p.main[1].id}:B`);
  assert.equal(a.startMs, 4500);
  assert.deepEqual(a.tr, [1, 4500, 1000, 0, 0.2]);
  assert.equal(b.tr[3], 1);
  assert.equal(s.blendLayers.length, 1);
  assert.equal(s.blendLayers[0].key, p.overlays[0].id);
  assert.equal(s.blendLayers[0].blend, 0);
});

test('fazlalık yoksa yarım hız (sıçrama yok), varsa normal hız', () => {
  // Kırpılmamış klipler: A'nın sonunda ve B'nin başında fazlalık yok
  let p = withTransition('wipeLeft', 1000);
  let s = buildRenderSpec(p, uri);
  let [a] = s.layers[0];
  let [b] = s.layers[1];
  assert.equal(a.speed, 0.5);
  assert.deepEqual([a.srcInMs, a.srcOutMs], [4500, 5000]);
  assert.equal(b.speed, 0.5);
  assert.deepEqual([b.srcInMs, b.srcOutMs], [0, 500]);
  // Kırpılmış klipler: her iki tarafta fazlalık var
  p = TL.updateMain(p, p.main[0].id, { srcOut: 4000 });
  p = TL.updateMain(p, p.main[1].id, { srcIn: 1000 });
  s = buildRenderSpec(p, uri);
  [a] = s.layers[0];
  [b] = s.layers[1];
  assert.equal(a.speed, 1);
  assert.deepEqual([a.srcInMs, a.srcOutMs], [3500, 4500]);
  assert.equal(b.speed, 1);
  assert.deepEqual([b.srcInMs, b.srcOutMs], [500, 1500]);
  // Pencere süresi = kaynak aralığı / hız
  for (const l of [a, b]) assert.equal((l.srcOutMs - l.srcInMs) / l.speed, 1000);
});

test('geçiş kopyası klibin görünümünü taşır: sığdır/doldur, döndürme, çevirme, renk, efekt penceresi', () => {
  let p = withTransition('pushLeft', 800);
  const bId = p.main[1].id;
  p = TL.updateMain(p, bId, { transform: { rotation: 90, flipH: true, fit: 'fill', scale: 1.2 }, filter: { id: 'vivid', intensity: 1 } });
  p = TL.addClipEffect(p, bId, 'glow').project;
  const s = buildRenderSpec(p, uri);
  const [b] = s.layers[1];
  assert.equal(b.rot, 1);
  assert.equal(b.fit, 1);
  assert.equal(b.flipH, true);
  assert.equal(b.xf[2], 1.2);
  assert.ok(b.colorMatrix);
  assert.equal(b.effects.length, 1);
  assert.ok(b.effects[0].startMs <= b.startMs, 'efekt pencerenin başından itibaren');
});

test('görsel klipler ve canlı ayrıştırma: geçiş kopyası kaydırıcıyla yeniden kurulmaz', () => {
  let p = withTransition('irisOpen', 600, [image('i1'), image('i2')]);
  let s = buildRenderSpec(p, uri);
  assert.equal(s.layers[0][0].kind, 'image');
  assert.equal(s.layers[0][0].srcOutMs - s.layers[0][0].srcInMs, 600);
  p = TL.updateMain(p, p.main[1].id, { adjust: { brightness: 0.1 } });
  const s1 = splitLive(buildRenderSpec(p, uri));
  const s2 = splitLive(buildRenderSpec(TL.updateMain(p, p.main[1].id, { adjust: { brightness: 0.4 } }), uri));
  assert.equal(s1.structure, s2.structure);
  // Geçişsiz projede katman yok (çok girişli birleştirici gerekmez)
  assert.equal(buildRenderSpec(projectWith([video('a', 5000), video('b', 5000)]), uri).layers.length, 0);
});
