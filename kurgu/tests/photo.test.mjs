import test from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../src/model/photo';

const img = { id: 'm1', kind: 'image', path: 'media/m1.jpg', width: 4000, height: 3000 };
const uri = (m) => `file:///lib/${m.path}`;

test('fotoğraftan proje: kanvas görsel oranında (uzun kenar ≤ 4096), tek görsel katmanı', () => {
  const p = P.photoFromMedia(img, 'Deneme');
  assert.equal(p.format, P.PHOTO_FORMAT);
  assert.deepEqual([p.canvas.width, p.canvas.height], [4000, 3000]);
  assert.equal(p.layers.length, 1);
  assert.equal(p.layers[0].type, 'image');
});

test('katman işlemleri: ekle, güncelle (iç içe birleştirme), sırala, çoğalt, sil', () => {
  let p = P.photoFromMedia(img);
  p = P.addLayer(p, P.createTextLayer('Merhaba'));
  p = P.addLayer(p, P.createShapeLayer('star'));
  const [base, text, shape] = p.layers;
  p = P.updateLayer(p, base.id, { adjust: { brightness: 0.3 } });
  assert.equal(p.layers[0].adjust.brightness, 0.3);
  assert.equal(p.layers[0].adjust.contrast, 0, 'diğer ayarlar korunur');
  p = P.moveLayer(p, shape.id, -1);
  assert.deepEqual(p.layers.map((l) => l.id), [base.id, shape.id, text.id]);
  assert.equal(P.moveLayer(p, base.id, -1), p, 'en alttan aşağı gidilmez');
  const d = P.duplicateLayer(p, text.id);
  assert.equal(d.project.layers.length, 4);
  assert.notEqual(d.newId, text.id);
  p = P.removeLayer(d.project, text.id);
  assert.equal(p.layers.length, 3);
});

test('kanvas boyutu: hazır boyut ve özgün oran', () => {
  let p = P.photoFromMedia(img);
  p = P.setCanvasPreset(p, 'story');
  assert.deepEqual([p.canvas.width, p.canvas.height], [1080, 1920]);
  p = P.setCanvasPreset(p, 'original');
  assert.deepEqual([p.canvas.width, p.canvas.height], [4000, 3000]);
});

test('render tanımı: renk matrisi, ton/detay, maske, görünmez katman yok sayılır', () => {
  let p = P.photoFromMedia(img);
  const id = p.layers[0].id;
  p = P.updateLayer(p, id, { adjust: { brightness: 0.2, shadows: 0.5, sharpen: 0.4 }, filter: { id: 'vivid', intensity: 1 }, mask: { mediaId: 'mk', lo: 0.3, hi: 0.7 } });
  p = { ...p, media: { ...p.media, mk: { id: 'mk', kind: 'image', path: 'media/mk.png' } } };
  p = P.addLayer(p, { ...P.createTextLayer('Gizli'), visible: false });
  p = P.addLayer(p, P.createTextLayer('   '));
  const s = P.photoSpec(p, uri);
  assert.equal(s.layers.length, 1);
  const l = s.layers[0];
  assert.equal(l.uri, 'file:///lib/media/m1.jpg');
  assert.equal(l.colorMatrix.length, 16);
  assert.deepEqual(l.tone, [0, 0.5, 0]);
  assert.equal(l.detail[0], 0.4);
  assert.deepEqual(l.mask, { uri: 'file:///lib/media/mk.png', lo: 0.3, hi: 0.7, invert: false });
  assert.ok(P.usedPhotoMedia(p).has('mk'));
});

test('geçişler: biçim denetimi, eksik alanlar tamamlanır, bozuk katman atlanır', () => {
  assert.throws(() => P.migratePhoto({ format: 'kurgu.project' }));
  const p = P.migratePhoto({ format: P.PHOTO_FORMAT, layers: [{ type: 'image', mediaId: 'm1', adjust: { contrast: 0.2 } }, null, { foo: 1 }] });
  assert.equal(p.layers.length, 1);
  assert.equal(p.layers[0].adjust.contrast, 0.2);
  assert.equal(p.layers[0].adjust.blur, 0);
  assert.equal(p.layers[0].hsl.length, 24);
});

test('katman kutusu, isabet testi ve kanvas→kaynak dikdörtgeni (döndürme/çevirme dahil)', () => {
  let p = P.photoFromMedia(img); // 4000×3000 kanvas, görsel tam kaplar
  const base = p.layers[0];
  const box = P.layerBox(p, base);
  assert.deepEqual([box.cx, box.cy, box.w, box.h], [2000, 1500, 4000, 3000]);
  assert.equal(P.hitLayer(p, 10, 10).id, base.id);
  assert.equal(P.hitLayer(p, -10, 10), null);
  // Sol üst çeyrek → kaynakta da sol üst çeyrek
  let r = P.canvasRectToSource(p, base, 0, 0, 2000, 1500);
  assert.deepEqual(r, { x0: 0, y0: 0, x1: 0.5, y1: 0.5 });
  // Yatay çevrilmiş katmanda sol üst kanvas çeyreği kaynağın sağ üst çeyreği
  p = P.updateLayer(p, base.id, { flipH: true });
  r = P.canvasRectToSource(p, p.layers[0], 0, 0, 2000, 1500);
  assert.deepEqual(r, { x0: 0.5, y0: 0, x1: 1, y1: 0.5 });
  // Kırpma: kaynak yalnızca sağ yarı ise kanvasın tamamı kaynakta 0.5..1
  p = P.updateLayer(p, base.id, { flipH: false, crop: { x0: 0.5, y0: 0, x1: 1, y1: 1 } });
  r = P.canvasRectToSource(p, p.layers[0], 0, 0, 4000, 3000);
  assert.ok(Math.abs(r.x0 - 0.5) < 1e-9 && r.x1 === 1);
  // 90° döndürülmüş, yarı ölçekli şekil: isabet testi döndürülmüş kutuya göre
  const sh = { ...P.createShapeLayer('rect'), w: 0.5, h: 0.1, rotation: 90, scale: 1 };
  p = P.addLayer(p, sh);
  assert.equal(P.hitLayer(p, 2000, 1500 + 800).id, sh.id, 'dikey uzanan kutunun içi');
  assert.equal(P.hitLayer(p, 2000 + 800, 1500).id, base.id, 'yatay eksende kutu dışı → alttaki görsel');
  // Çok küçük dikdörtgen yok sayılır
  assert.equal(P.canvasRectToSource(p, p.layers[0], 10, 10, 11, 11), null);
});

test('kaynak değiştirme (nesne silme) ve ilk kaynağa dönüş; saydam kanvas tespiti', () => {
  let p = P.photoFromMedia(img);
  const id = p.layers[0].id;
  const e1 = { id: 'm2', kind: 'image', path: 'media/m2.jpg', width: 4000, height: 3000 };
  const e2 = { id: 'm3', kind: 'image', path: 'media/m3.jpg', width: 4000, height: 3000 };
  p = P.replaceLayerMedia(p, id, e1);
  p = P.replaceLayerMedia(p, id, e2);
  assert.equal(p.layers[0].mediaId, 'm3');
  assert.deepEqual(p.layers[0].original, { mediaId: 'm1' }, 'ilk kaynak korunur');
  assert.ok(P.usedPhotoMedia(p).has('m1'), 'ilk kaynak temizlikte silinmez');
  p = P.restoreLayerMedia(p, id);
  assert.equal(p.layers[0].mediaId, 'm1');
  assert.equal(p.layers[0].original, null);
  assert.equal(P.isTransparent(p), false);
  assert.equal(P.isTransparent(P.setCanvas(p, { background: '#00000000' })), true);
});

test('çeyrek döndürme: kanvas yer değiştirir, kutu ve kaynak eşlemesi döner', () => {
  let p = P.photoFromMedia(img); // 4000×3000
  const id = p.layers[0].id;
  p = P.setCanvasPreset(p, 'original');
  p = P.rotateQuarter(p, id, 1);
  assert.deepEqual([p.canvas.width, p.canvas.height], [3000, 4000]);
  assert.equal(p.layers[0].quarter, 1);
  const box = P.layerBox(p, p.layers[0]);
  assert.deepEqual([Math.round(box.w), Math.round(box.h)], [3000, 4000], 'döndürülmüş görsel dikey kanvası doldurur');
  assert.equal(P.photoSpec(p, () => 'u').layers[0].quarter, 1);
  // 90° saat yönü: görüntülenen üst şerit, kaynağın sol şeridi
  const r = P.canvasRectToSource(p, p.layers[0], 0, 0, 3000, 1000);
  assert.deepEqual(r, { x0: 0, y0: 0, x1: 0.25, y1: 1 });
  p = P.rotateQuarter(p, id, -1);
  assert.deepEqual([p.canvas.width, p.canvas.height, p.layers[0].quarter], [4000, 3000, 0]);
});

test('kırpma oranı: merkezden, yakınlaştırma ve sınırlar içinde', () => {
  assert.deepEqual(P.cropRect(img, 0, 1), { x0: 0.125, y0: 0, x1: 0.875, y1: 1 });
  assert.deepEqual(P.cropRect(img, 0, 16 / 9), { x0: 0, y0: 0.125, x1: 1, y1: 0.875 });
  const z = P.cropRect(img, 0, 1, 2, 0, 0);
  assert.deepEqual(z, { x0: 0, y0: 0, x1: 0.375, y1: 0.5 }, 'köşeye kaydırılan kırpma görüntü dışına taşmaz');
  // Çeyrek döndürülmüş görselde 9:16 (görüntülenen) = kaynakta 16:9
  assert.deepEqual(P.cropRect(img, 1, 9 / 16), P.cropRect(img, 0, 16 / 9));
  // Orijinal oran kırpmasız
  assert.deepEqual(P.cropRect(img, 0, -1), { x0: 0, y0: 0, x1: 1, y1: 1 });
});
