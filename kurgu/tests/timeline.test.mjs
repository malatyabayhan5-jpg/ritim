import test from 'node:test';
import assert from 'node:assert/strict';
import * as TL from '../src/model/timeline';
import { createHistory, pushHistory, undo, redo, canUndo } from '../src/model/history';
import { migrateProject, canvasSize } from '../src/model/schema';
import { projectFromTemplate } from '../src/model/templates';
import { TEMPLATES } from '../src/model/catalog';
import { audio, image, projectWith, video } from './helpers.mjs';

test('medya eklenince ana iz sırayla oluşur, görseller varsayılan süre alır', () => {
  const p = projectWith([video('a', 5000), image('b'), video('c', 2000)], { imageDurationMs: 3000 });
  assert.equal(p.main.length, 3);
  assert.equal(TL.totalDuration(p), 10000);
  assert.deepEqual(TL.mainLayout(p).map((l) => [l.start, l.end]), [[0, 5000], [5000, 8000], [8000, 10000]]);
});

test('bölme: oynatma kafasında iki parçaya ayırır, toplam süre korunur', () => {
  const p = projectWith([video('a', 5000), video('b', 4000)]);
  const r = TL.splitMainAt(p, 6500);
  assert.ok(r.changed);
  assert.equal(r.project.main.length, 3);
  assert.equal(r.project.main[1].srcOut, 1500);
  assert.equal(r.project.main[2].srcIn, 1500);
  assert.equal(TL.totalDuration(r.project), 9000);
  assert.notEqual(r.project.main[1].id, r.project.main[2].id);
});

test('bölme: kenara çok yakınsa değişiklik yapmaz', () => {
  const p = projectWith([video('a', 5000)]);
  assert.equal(TL.splitMainAt(p, 30).changed, false);
  assert.equal(TL.splitMainAt(p, 4970).changed, false);
});

test('bölme hızla birlikte kaynak zamanını doğru hesaplar', () => {
  let p = projectWith([video('a', 10000)]);
  p = TL.setSpeed(p, p.main[0].id, 2);
  assert.equal(TL.totalDuration(p), 5000);
  const r = TL.splitMainAt(p, 1000);
  assert.equal(r.project.main[0].srcOut, 2000);
});

test('kırpma: kaynak dışına taşmaz ve en kısa süreyi korur', () => {
  const p = projectWith([video('a', 5000)]);
  const id = p.main[0].id;
  let q = TL.trimMain(p, id, 'start', 1000);
  assert.equal(q.main[0].srcIn, 1000);
  q = TL.trimMain(q, id, 'start', -5000);
  assert.equal(q.main[0].srcIn, 0);
  q = TL.trimMain(q, id, 'end', 9000);
  assert.equal(q.main[0].srcOut, 5000);
  q = TL.trimMain(q, id, 'end', -99999);
  assert.equal(q.main[0].srcOut - q.main[0].srcIn, TL.MIN_CLIP_MS);
});

test('görsel klibi kırpma süresini uzatabilir', () => {
  const p = projectWith([image('i')], { imageDurationMs: 3000 });
  const q = TL.trimMain(p, p.main[0].id, 'end', 2000);
  assert.equal(TL.totalDuration(q), 5000);
});

test('taşıma, çoğaltma ve silme', () => {
  let p = projectWith([video('a', 1000), video('b', 2000), video('c', 3000)]);
  p = TL.moveMain(p, 0, 2);
  assert.deepEqual(p.main.map((c) => c.mediaId), ['b', 'c', 'a']);
  const d = TL.duplicateMain(p, p.main[0].id);
  assert.deepEqual(d.project.main.map((c) => c.mediaId), ['b', 'b', 'c', 'a']);
  const del = TL.deleteMain(d.project, d.newId);
  assert.equal(del.main.length, 3);
});

test('ses: ekleme, bölme, şerit ataması', () => {
  let p = projectWith([video('v', 20000)]);
  const a = TL.addAudio(p, audio('m', 8000), 1000);
  p = a.project;
  const s = TL.splitAudioAt(p, a.newId, 4000);
  assert.ok(s.changed);
  p = s.project;
  assert.equal(p.audio.length, 2);
  assert.equal(p.audio[1].start, 4000);
  assert.equal(p.audio[1].srcIn, 3000);
  const extra = TL.addAudio(p, audio('n', 5000), 2000).project;
  const lanes = TL.assignAudioLanes(extra.audio);
  assert.equal(lanes.length, 2);
});

test('sesi ayırma klibi sessize alır ve hizalı ses klibi ekler', () => {
  let p = projectWith([video('x', 3000), video('v', 6000)]);
  const r = TL.extractAudio(p, p.main[1].id);
  assert.ok(r.newId);
  assert.equal(r.project.main[1].muted, true);
  const a = r.project.audio.find((x) => x.id === r.newId);
  assert.equal(a.start, 3000);
  assert.equal(a.role, 'extracted');
});

test('metin: ekleme, bölme, kırpma', () => {
  let p = projectWith([video('v', 10000)]);
  const r = TL.addText(p, 2000, 'Merhaba');
  p = r.project;
  const s = TL.splitTextAt(p, r.newId, 3000);
  assert.ok(s.changed);
  assert.equal(s.project.texts.length, 2);
  const tr = TL.trimText(s.project, s.newId, 'start', 500);
  assert.equal(tr.texts.find((x) => x.id === s.newId).start, 3500);
});

test('manyetik hizalama klip sınırına yapıştırır', () => {
  const p = projectWith([video('a', 5000), video('b', 5000)]);
  assert.equal(TL.snapTime(p, 5080, 100), 5000);
  assert.equal(TL.snapTime(p, 5300, 100), 5300);
});

test('donmuş kare oynatma kafasına eklenir', () => {
  const p = projectWith([video('a', 6000)]);
  const r = TL.insertFreezeFrame(p, 2000, image('f'));
  assert.deepEqual(r.project.main.map((c) => c.kind), ['video', 'image', 'video']);
  assert.equal(TL.totalDuration(r.project), 9000);
});

test('geçmiş: geri al / yinele ve kaydırıcı birleştirme', () => {
  const p0 = projectWith([video('a', 5000)]);
  let h = createHistory(p0);
  const p1 = TL.setSpeed(p0, p0.main[0].id, 1.5);
  const p2 = TL.setSpeed(p1, p0.main[0].id, 2);
  h = pushHistory(h, p1, 'speed');
  h = pushHistory(h, p2, 'speed');
  assert.equal(h.past.length, 1);
  h = undo(h);
  assert.equal(h.present, p0);
  h = redo(h);
  assert.equal(h.present, p2);
  assert.ok(canUndo(h));
});

test('proje biçimi: eksik alanlar tamamlanır, yeni sürüm reddedilir', () => {
  const m = migrateProject({ format: 'kurgu.project', version: 1, main: [{ id: 'c', mediaId: 'a', kind: 'video', srcIn: 0, srcOut: 1000 }] });
  assert.equal(m.main[0].speed, 1);
  assert.equal(m.main[0].adjust.brightness, 0);
  assert.throws(() => migrateProject({ format: 'kurgu.project', version: 99 }), /PROJECT_TOO_NEW/);
  assert.throws(() => migrateProject({ format: 'other' }), /PROJECT_FORMAT/);
});

test('kanvas boyutları çift sayı ve orana uygun', () => {
  assert.deepEqual(canvasSize('9:16', 1080), { width: 1080, height: 1920 });
  assert.deepEqual(canvasSize('16:9', 720), { width: 1280, height: 720 });
  assert.deepEqual(canvasSize('4:5', 1080), { width: 1080, height: 1350 });
});

test('şablonlar düzenlenebilir proje üretir', () => {
  for (const tpl of TEMPLATES) {
    const p = projectFromTemplate(tpl, [video('a', 10000), image('b')], { name: 'x' });
    assert.equal(p.main.length, tpl.slots.length);
    assert.equal(p.texts.length, tpl.texts.length);
    assert.equal(p.canvas.ratio, tpl.ratio);
    p.main.forEach((c) => assert.ok(c.srcOut > c.srcIn));
  }
});
