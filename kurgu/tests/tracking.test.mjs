import test from 'node:test';
import assert from 'node:assert/strict';
import { createMainClip, createOverlay } from '../src/model/schema';
import { canvasToVideo, fittedHalf, trackToOverlayKeys, trackingBox, trackingBoxAt, videoToCanvas } from '../src/model/tracking';
import { createText } from '../src/model/schema';
import { splitTextAt, textPropAt, textPropPatch, toggleTextKey, trimText } from '../src/model/timeline';
import { valueAt } from '../src/model/keyframes';

const media = { id: 'm1', kind: 'video', width: 1920, height: 1080, durationMs: 10000 };
const sticker = { id: 's1', kind: 'image', width: 512, height: 512 };
const portrait = { width: 1080, height: 1920, fit: 'fit' };
const landscape = { width: 1920, height: 1080, fit: 'fit' };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

test('sığdırma/doldurma yarı boyutları', () => {
  assert.deepEqual(fittedHalf(16 / 9, 9 / 16, 'fit'), { fw: 1, fh: (9 / 16) / (16 / 9) });
  const fill = fittedHalf(16 / 9, 9 / 16, 'fill');
  assert.ok(near(fill.fh, 1) && near(fill.fw, (16 / 9) / (9 / 16)));
});

test('yatay video dikey kanvasta: merkez, köşe ve kaynak-kanvas gidiş-dönüş', () => {
  const clip = createMainClip(media);
  const c = videoToCanvas(0.5, 0.5, clip, media, portrait);
  assert.ok(near(c.x, 0) && near(c.y, 0));
  // Sol üst köşe: x = -1, y = +fh (siyah bantlar arasında)
  const tl = videoToCanvas(0, 0, clip, media, portrait);
  assert.ok(near(tl.x, -1) && near(tl.y, (9 / 16) / (16 / 9)), JSON.stringify(tl));
  for (const tr of [{}, { scale: 1.5, x: 0.2, y: -0.1 }, { rotation: 90 }, { flipH: true, rotation: 270 }, { angle: 30, scale: 0.8 }, { fit: 'fill' }]) {
    const k = { ...clip, transform: { ...clip.transform, ...tr } };
    for (const [u, v] of [[0.2, 0.3], [0.8, 0.6], [0.5, 0.1]]) {
      const n = videoToCanvas(u, v, k, media, portrait);
      const back = canvasToVideo(n.x, n.y, k, media, portrait);
      assert.ok(near(back.u, u, 1e-9) && near(back.v, v, 1e-9), `${JSON.stringify(tr)} ${u},${v} -> ${JSON.stringify(back)}`);
    }
  }
});

test('90° döndürülmüş klipte sağa hareket kanvasta aşağı hareket olur', () => {
  const clip = { ...createMainClip(media), transform: { rotation: 90 } };
  const a = videoToCanvas(0.4, 0.5, clip, media, portrait);
  const b = videoToCanvas(0.6, 0.5, clip, media, portrait);
  assert.ok(near(a.x, b.x) && b.y < a.y, `${JSON.stringify(a)} ${JSON.stringify(b)}`);
});

test('takip noktaları anahtar karelere: zaman eşleme, aralık korunur, sadeleştirme, kayıp noktalar', () => {
  const clip = { ...createMainClip(media), srcIn: 2000, srcOut: 8000, speed: 2 };
  const clipStart = 1000;
  const overlay = { ...createOverlay(sticker, 1000), srcOut: 3000, transform: { x: 0.1, y: 0.05, scale: 0.3 } };
  // Nesne 0..2 sn (kaynak 2000..6000) doğrusal sağa gider; arada bir kayıp kare
  const points = [];
  for (let i = 0; i <= 40; i++) {
    const t = 2000 + i * 100;
    points.push({ t, x: 0.3 + i * 0.005, y: 0.5, c: i === 17 ? 0.2 : 0.95 });
  }
  const r = trackToOverlayKeys(points, { clip, clipStart, media, canvas: landscape, overlay, anchorMs: 1000 });
  assert.equal(r.lost, 1);
  // Hız 2: kaynak 4000 ms -> klip içi 2000 ms -> katman yerel 2000 ms
  const xs = r.keyframes.x;
  assert.equal(xs[0].t, 0);
  assert.equal(xs[xs.length - 1].t, 2000);
  // Doğrusal hareket tek doğruya sadeleşir
  assert.equal(xs.length, 2);
  // Başlangıçta katman kendi yerinde; aralık korunur
  assert.ok(near(xs[0].v, 0.1, 1e-3) && near(r.keyframes.y[0].v, 0.05, 1e-3));
  // 40 × 0.005 = 0.2 kaynak genişliği -> 1920 kanvasta 0.4 NDC
  assert.ok(near(valueAt(xs, 2000, 0) - valueAt(xs, 0, 0), 0.4, 2e-3));
  assert.ok(near(valueAt(xs, 1000, 0) - 0.1, 0.2, 2e-3));
});

test('eğri yol sadeleştirmede korunur (hata ≤ eps)', () => {
  const clip = createMainClip(media);
  const overlay = { ...createOverlay(sticker, 0), srcOut: 5000 };
  const points = [];
  for (let i = 0; i <= 75; i++) points.push({ t: i * 66.7, x: 0.5 + 0.2 * Math.sin(i * 0.15), y: 0.5 + 0.1 * Math.cos(i * 0.1), c: 0.9 });
  const r = trackToOverlayKeys(points, { clip, clipStart: 0, media, canvas: landscape, overlay, anchorMs: 0 });
  assert.ok(r.keyframes.x.length > 5 && r.keyframes.x.length < points.length, `kare sayısı ${r.keyframes.x.length}`);
  const dx = 0 - videoToCanvas(points[0].x, points[0].y, clip, media, landscape).x;
  for (const p of points) {
    const t = Math.round(p.t);
    if (t > 5000) continue; // katman süresi dışı
    const want = videoToCanvas(p.x, p.y, clip, media, landscape).x + dx;
    assert.ok(Math.abs(valueAt(r.keyframes.x, t, 0) - want) < 0.006, `t=${t}`);
  }
});

test('katman dışındaki ve tümü kayıp noktalar', () => {
  const clip = createMainClip(media);
  const overlay = { ...createOverlay(sticker, 5000), srcOut: 1000 };
  const pts = [{ t: 0, x: 0.5, y: 0.5, c: 1 }, { t: 9000, x: 0.5, y: 0.5, c: 1 }];
  assert.equal(trackToOverlayKeys(pts, { clip, clipStart: 0, media, canvas: landscape, overlay, anchorMs: 5000 }), null);
  assert.equal(trackToOverlayKeys([{ t: 5200, x: 0.5, y: 0.5, c: 0.1 }], { clip, clipStart: 0, media, canvas: landscape, overlay, anchorMs: 5000 }), null);
});

test('takip kutusu: katman merkezi kaynağa taşınır, boyut sınırlanır', () => {
  const clip = createMainClip(media);
  const overlay = { ...createOverlay(sticker, 0), transform: { x: 0.5, y: 0, scale: 0.3 } };
  const [u, v, w, h] = trackingBox(overlay, clip, media, landscape, 0, 0, 0.2, 0.9);
  assert.ok(near(u, 0.75) && near(v, 0.5));
  assert.ok(near(w, 0.2) && near(h, 0.45));
});

test('metin takibi: süre ve başlangıç konumu metinden', () => {
  const clip = createMainClip(media);
  const text = { ...createText(1000, 'Merhaba'), duration: 1500, x: -0.2, y: 0.3 };
  const points = [];
  for (let i = 0; i <= 30; i++) points.push({ t: 1000 + i * 100, x: 0.5 + i * 0.004, y: 0.5, c: 0.9 });
  const r = trackToOverlayKeys(points, { clip, clipStart: 0, media, canvas: landscape, overlay: text, anchorMs: 1000, durationMs: text.duration, anchor: { x: text.x, y: text.y } });
  const xs = r.keyframes.x;
  assert.equal(xs[0].t, 0);
  assert.equal(xs[xs.length - 1].t, 1500);
  assert.ok(near(xs[0].v, -0.2, 1e-3) && near(r.keyframes.y[0].v, 0.3, 1e-3));
  const [u, v] = trackingBoxAt(0, 0, clip, media, landscape, 0, 0.1, 0.1);
  assert.ok(near(u, 0.5) && near(v, 0.5));
});

test('metin anahtar kareleri: aç/kapat, düzenle, böl ve kırp', () => {
  let x = { ...createText(0, 'A'), duration: 2000, x: 0.1 };
  x = { ...x, ...toggleTextKey(x, 'x', 0) };
  assert.equal(x.keyframes.x.length, 1);
  x = { ...x, ...textPropPatch(x, 'x', 0.5, 1000) };
  assert.equal(x.keyframes.x.length, 2);
  assert.ok(near(textPropAt(x, 'x', 500), 0.3, 1e-6));
  // Opaklık izi yokken sabit değer stile yazılır
  assert.deepEqual(textPropPatch(x, 'opacity', 0.4, 0), { style: { opacity: 0.4 } });
  // Böl: ikinci parça kareleri kendi başına göre kayar
  const project = { texts: [x] };
  const s1 = splitTextAt(project, x.id, 1000);
  const [a, b] = s1.project.texts;
  assert.ok(near(textPropAt(a, 'x', 1000), 0.5, 1e-6));
  assert.ok(near(textPropAt(b, 'x', 0), 0.5, 1e-6));
  // Kırp (baş): ekrandaki konum aynı anda aynı kalır
  const tr = trimText({ texts: [x] }, x.id, 'start', 500).texts[0];
  assert.equal(tr.start, 500);
  assert.ok(near(textPropAt(tr, 'x', 0), textPropAt(x, 'x', 500), 1e-6));
  // Son kare kaldırılınca değer sabit alana yazılır
  let y = { ...createText(0, 'B'), duration: 1000, scale: 1.5 };
  y = { ...y, ...toggleTextKey(y, 'scale', 0) };
  y = { ...y, ...toggleTextKey(y, 'scale', 0) };
  assert.equal(y.keyframes.scale, undefined);
  assert.equal(y.scale, 1.5);
});
