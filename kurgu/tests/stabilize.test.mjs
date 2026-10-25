import test from 'node:test';
import assert from 'node:assert/strict';
import { createMainClip } from '../src/model/schema';
import { cameraPath, removeStabilizePatch, smoothPath, stabilizePatch, STAB_MIN_CONF } from '../src/model/stabilize';
import { mainPropAt } from '../src/model/timeline';
import { videoToCanvas } from '../src/model/tracking';

const media = { id: 'm1', kind: 'video', width: 1920, height: 1080, durationMs: 10000 };
const landscape = { width: 1920, height: 1080, fit: 'fit' };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// Sabit kamera + titreşim: örnekler arası kayma = titreşim farkı
function shaky(n = 60, step = 66.667, amp = 0.01, pan = 0) {
  const jit = Array.from({ length: n }, (_, i) => amp * Math.sin(i * 2.3) + pan * i);
  return { jit, samples: jit.map((j, i) => ({ t: i * step, dx: i ? j - jit[i - 1] : 0, dy: i ? -(j - jit[i - 1]) / 2 : 0, c: 0.8 })) };
}

test('kamera yolu birikimlidir; güveni düşük adımlar hareketsiz sayılır', () => {
  const { path, low } = cameraPath([
    { t: 0, dx: 0, dy: 0, c: 1 },
    { t: 100, dx: 0.01, dy: 0.02, c: 0.9 },
    { t: 200, dx: 0.5, dy: 0.5, c: STAB_MIN_CONF / 2 },
    { t: 300, dx: 0.01, dy: 0, c: 0.9 },
  ]);
  assert.equal(low, 1);
  assert.ok(near(path[3].x, 0.02) && near(path[3].y, 0.02));
});

test('yumuşatma sabit hızlı kaydırmayı uçlar dahil korur, titreşimi bastırır', () => {
  const lin = Array.from({ length: 40 }, (_, i) => ({ t: i * 50, x: i * 0.01, y: -i * 0.005 }));
  const s = smoothPath(lin, 600);
  for (const [i, p] of s.entries()) assert.ok(near(p.x, lin[i].x, 1e-9) && near(p.y, lin[i].y, 1e-9), `${i} ${p.x}`);
  const zig = Array.from({ length: 40 }, (_, i) => ({ t: i * 50, x: i % 2 ? 0.01 : -0.01, y: 0 }));
  const z = smoothPath(zig, 600);
  assert.ok(Math.max(...z.slice(5, 35).map((p) => Math.abs(p.x))) < 0.002);
});

test('sabitleme titreşimi geri alır: görünen içerik merkezi neredeyse sabit kalır', () => {
  const clip = createMainClip(media);
  const { jit, samples } = shaky();
  const r = stabilizePatch(samples, { clip, media, canvas: landscape, level: 'medium' });
  assert.ok(r && r.keys > 5 && r.clamped === 0, JSON.stringify(r && { keys: r.keys, clamped: r.clamped }));
  const out = { ...clip, ...r.patch, transform: { ...clip.transform, ...r.patch.transform } };
  assert.ok(near(out.transform.scale, 1.1));
  assert.deepEqual(out.stabilize, { level: 'medium', zoom: 1.1 });
  // Kaynakta (0.5 + jit) konumundaki içerik noktası kanvasta sabit yerde görünmeli
  const seen = jit.map((j, i) => videoToCanvas(0.5 + j, 0.5 - j / 2 + jit[0] / 2, out, media, landscape, Math.round(samples[i].t)));
  const raw = jit.map((j) => videoToCanvas(0.5 + j, 0.5, { ...clip, transform: { ...clip.transform, scale: 1.1 } }, media, landscape, 0).x);
  const spread = (a) => Math.max(...a) - Math.min(...a);
  const sx = spread(seen.slice(10, 50).map((p) => p.x));
  assert.ok(sx < spread(raw.slice(10, 50)) * 0.25, `stabilized ${sx} raw ${spread(raw)}`);
});

test('düzeltme kenar payıyla sınırlanır; yeniden uygulama büyütmeyi katlamaz; kaldırma geri alır', () => {
  const clip = createMainClip(media);
  const { samples } = shaky(60, 66.667, 0.2);
  const r = stabilizePatch(samples, { clip, media, canvas: landscape, level: 'low' });
  assert.ok(r.clamped > 0);
  const out = { ...clip, ...r.patch, transform: { ...clip.transform, ...r.patch.transform } };
  for (const k of out.keyframes.x) assert.ok(Math.abs(k.v) <= 0.05 * 1 + 1e-9, String(k.v));
  const again = stabilizePatch(samples, { clip: out, media, canvas: landscape, level: 'high' });
  const out2 = { ...out, ...again.patch, transform: { ...out.transform, ...again.patch.transform } };
  assert.ok(near(out2.transform.scale, 1.15));
  const rm = removeStabilizePatch(out2);
  const back = { ...out2, ...rm, transform: { ...out2.transform, ...rm.transform } };
  assert.ok(near(back.transform.scale, 1) && !back.keyframes.x && !back.keyframes.y && back.stabilize === null);
  assert.ok(near(mainPropAt(back, 'x', 500), 0));
});

test('hızlandırılmış klipte kaynak zamanı klip zamanına çevrilir', () => {
  const clip = { ...createMainClip(media), speed: 2 };
  const { samples } = shaky(30, 100);
  const r = stabilizePatch(samples, { clip, media, canvas: landscape });
  const last = r.patch.keyframes.x[r.patch.keyframes.x.length - 1];
  assert.equal(last.t, Math.round(29 * 100 / 2));
});
