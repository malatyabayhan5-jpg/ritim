import test from 'node:test';
import assert from 'node:assert/strict';
import { addClipCaptions, captionChunks, captionableClips, hasCaptions, removeCaptions } from '../src/model/captions';
import { migrateProject } from '../src/model/schema';
import * as TL from '../src/model/timeline';
import { buildRenderSpec } from '../src/engine/renderSpec';
import { projectWith, video, image } from './helpers.mjs';

const uri = (m) => `file:///lib/${m.path}`;

test('konuşma dışı işaretler ve boş bölümler atılır, boşluklar düzeltilir', () => {
  const c = captionChunks([
    { t0: 0, t1: 1000, text: ' [MUSIC] ' },
    { t0: 1000, t1: 2500, text: '  Merhaba   dünya ' },
    { t0: 2600, t1: 3000, text: '(alkış)' },
    { t0: 3000, t1: 3000, text: 'sıfır süre' },
    { t0: 3200, t1: 4500, text: '�Bugün nasılsın?' },
    { t0: 5000, t1: 6000, text: '♪ ♪' },
  ]);
  assert.deepEqual(c.map((x) => x.text), ['Merhaba dünya', 'Bugün nasılsın?']);
});

test('uzun bölüm kelime sınırından bölünür, süre karakter oranında paylaştırılır', () => {
  const text = 'Bu cümle bir satıra sığmayacak kadar uzun olduğu için iki parçaya ayrılmalıdır';
  const c = captionChunks([{ t0: 1000, t1: 7000, text }], { maxChars: 42 });
  assert.ok(c.length >= 2);
  c.forEach((x) => assert.ok(x.text.length <= 42, x.text));
  assert.equal(c.map((x) => x.text).join(' '), text);
  assert.equal(c[0].t0, 1000);
  assert.equal(c[c.length - 1].t1, 7000);
  for (let i = 1; i < c.length; i++) assert.ok(c[i].t0 >= c[i - 1].t1 - 1);
});

test('çok kısa bitişik bölümler birleşir; kısa tek bölüm en az süreye uzatılır, çakışma olmaz', () => {
  const c = captionChunks([
    { t0: 0, t1: 300, text: 'Evet' },
    { t0: 350, t1: 700, text: 'tamam' },
    { t0: 3000, t1: 3200, text: 'Hı' },
    { t0: 3500, t1: 5000, text: 'Devam ediyoruz' },
  ]);
  assert.equal(c[0].text, 'Evet tamam');
  assert.equal(c[1].text, 'Hı');
  assert.ok(c[1].t1 - c[1].t0 >= 500 && c[1].t1 <= 3500);
});

test('altyazılar klibin zaman çizelgesi konumuna ve hızına göre yerleşir, klip dışına taşmaz', () => {
  let p = projectWith([video('a', 4000), video('b', 10000)]);
  const b = p.main[1].id;
  p = TL.updateMain(p, b, { srcIn: 2000, srcOut: 10000, speed: 2 }); // 4 sn, zaman çizelgesinde 4000'de başlar
  const r = addClipCaptions(p, b, [
    { t0: 0, t1: 2000, text: 'İlk cümle' },          // 4000–5000
    { t0: 6000, t1: 9000, text: 'Son cümle uzun' },   // 7000–8000 (klip sonu 8000)
    { t0: 9000, t1: 9500, text: 'Taşan' },            // klip dışı
  ]);
  assert.equal(r.added, 2);
  const [x, y] = r.project.texts;
  assert.deepEqual([x.start, x.duration, x.text], [4000, 1000, 'İlk cümle']);
  assert.deepEqual([y.start, y.start + y.duration], [7000, 8000]);
  assert.ok(x.caption && y.caption);
  assert.ok(x.y < 0, 'alt bölgede');
  // render tanımında metin olarak görünür
  assert.equal(buildRenderSpec(r.project, uri).texts.length, 2);
});

test('altyazılar kaydet/aç sonrası korunur ve topluca kaldırılır; kullanıcı metinleri kalır', () => {
  let p = projectWith([video('a', 5000)]);
  p = TL.addText(p, 0, 'Başlığım').project;
  p = addClipCaptions(p, p.main[0].id, [{ t0: 500, t1: 2000, text: 'Altyazı' }]).project;
  const reopened = migrateProject(JSON.parse(JSON.stringify(p)));
  assert.ok(hasCaptions(reopened));
  const cleared = removeCaptions(reopened);
  assert.deepEqual(cleared.texts.map((t) => t.text), ['Başlığım']);
  assert.ok(!hasCaptions(cleared));
  assert.equal(removeCaptions(cleared), cleared);
});

test('altyazı çıkarılabilecek klipler: sesli video, sessize alınmamış', () => {
  let p = projectWith([video('a', 3000), image('b'), video('c', 3000, { hasAudio: false }), video('d', 3000)]);
  p = TL.updateMain(p, p.main[3].id, { muted: true });
  assert.deepEqual(captionableClips(p).map((c) => c.mediaId), ['a']);
});
