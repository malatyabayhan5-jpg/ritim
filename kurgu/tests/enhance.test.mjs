import test from 'node:test';
import assert from 'node:assert/strict';
import { autoAdjust } from '../src/model/enhance';
import { adjustMatrix } from '../src/model/color';

const apply = (m, [r, g, b]) => [0, 1, 2].map((i) => m[i] * r + m[4 + i] * g + m[8 + i] * b + m[12 + i]);

test('otomatik iyileştirme: karanlık, düşük kontrastlı, mavi kayan görüntü düzelir', () => {
  const stats = { p01: 0.05, p50: 0.2, p99: 0.5, mean: [0.15, 0.2, 0.3], sat: 0.25 };
  const a = autoAdjust(stats);
  assert.ok(a.exposure > 0.2, `pozlama artar: ${a.exposure}`);
  assert.ok(a.contrast > 0, 'kontrast artar');
  assert.ok(a.temperature > 0, 'mavi kayma → sıcaklık artar');
  // Doygunluk hariç: beyaz dengesi kırmızı/mavi oranını 1'e yaklaştırır
  const [r, , b] = apply(adjustMatrix({ ...a, saturation: 0 }), stats.mean);
  assert.ok(Math.abs(Math.log(r / b)) < Math.abs(Math.log(stats.mean[0] / stats.mean[2])), `r/b ${(r / b).toFixed(2)}`);
});

test('otomatik iyileştirme: dengeli görüntüye neredeyse dokunmaz; aşırı değer üretmez', () => {
  const a = autoAdjust({ p01: 0.02, p50: 0.45, p99: 0.98, mean: [0.5, 0.5, 0.5], sat: 0.4 });
  assert.deepEqual([a.exposure, a.contrast, a.temperature, a.tint], [0, 0, 0, 0]);
  const extreme = autoAdjust({ p01: 0, p50: 0.001, p99: 0.01, mean: [0, 1, 0], sat: 0 });
  for (const [k, v] of Object.entries(extreme)) assert.ok(Math.abs(v) <= 0.6, `${k}=${v}`);
});

test('yeşil kayma (floresan) → negatif renk tonu yönünde değil, yeşili azaltan tint', () => {
  const stats = { p01: 0.05, p50: 0.45, p99: 0.95, mean: [0.45, 0.6, 0.45], sat: 0.35 };
  const a = autoAdjust(stats);
  const [r, g] = apply(adjustMatrix({ ...a, saturation: 0 }), stats.mean);
  assert.ok(g - r < 0.15, `yeşil fazlalığı azalır: ${(g - r).toFixed(3)}`);
});
