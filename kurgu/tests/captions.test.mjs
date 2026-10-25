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

test('altyazı toplu düzenleme: seçilenleri sil, bul-değiştir, stili eşitle; altyazı olmayan metne dokunmaz', async () => {
  const { deleteCaptions, replaceInCaptions, matchCaptionStyle } = await import('../src/model/captions');
  let p = projectWith([video('a', 9000)]);
  p = addClipCaptions(p, p.main[0].id, [
    { t0: 0, t1: 1500, text: 'merhaba dunya' },
    { t0: 2000, t1: 3500, text: 'Dunya güzel (mi?)' },
    { t0: 4000, t1: 5500, text: 'son satır' },
  ]).project;
  p = TL.addText(p, 6000, 'dunya başlık').project;
  const caps = p.texts.filter((t) => t.caption).sort((a, b) => a.start - b.start);
  assert.equal(caps.length, 3);
  const title = p.texts.find((t) => !t.caption);
  // Bul-değiştir: büyük/küçük harf duyarsız, özel karakterler düz metin
  const r = replaceInCaptions(p, [...caps.map((c) => c.id), title.id], 'dunya', 'dünya');
  assert.equal(r.changed, 2);
  assert.equal(r.project.texts.find((t) => t.id === caps[0].id).text, 'merhaba dünya');
  assert.equal(r.project.texts.find((t) => t.id === caps[1].id).text, 'dünya güzel (mi?)');
  assert.equal(r.project.texts.find((t) => t.id === title.id).text, 'dunya başlık');
  assert.equal(replaceInCaptions(p, caps.map((c) => c.id), '(mi?)', '!').project.texts.find((t) => t.id === caps[1].id).text, 'Dunya güzel !');
  assert.equal(replaceInCaptions(p, caps.map((c) => c.id), '', 'x').changed, 0);
  // Stil eşitleme
  let q = TL.updateText(p, caps[0].id, { y: 0.2, style: { ...caps[0].style, color: '#FFCC00FF', size: 0.07 } });
  q = matchCaptionStyle(q, caps[0].id, caps.map((c) => c.id));
  for (const c of q.texts.filter((t) => t.caption)) {
    assert.equal(c.style.color, '#FFCC00FF');
    assert.equal(c.y, 0.2);
  }
  // Silme: yalnızca seçili altyazılar
  const d = deleteCaptions(p, [caps[0].id, caps[2].id, title.id]);
  assert.deepEqual(d.texts.filter((t) => t.caption).map((t) => t.id), [caps[1].id]);
  assert.ok(d.texts.some((t) => t.id === title.id));
});

test('altyazı stili: tüm altyazılara uygulanır, normal metne dokunmaz, yeni altyazılar stili alır', async () => {
  const { applyCaptionStyle, captionStyleOf, CAPTION_STYLE_IDS } = await import('../src/model/captions');
  let p = projectWith([video('a', 8000)]);
  p = TL.addText(p, 0, 'Başlık').project;
  p = addClipCaptions(p, p.main[0].id, [{ t0: 0, t1: 1500, text: 'merhaba dünya' }, { t0: 2000, t1: 3500, text: 'ikinci satır' }]).project;
  assert.equal(captionStyleOf(p).id, 'classic');
  p = applyCaptionStyle(p, 'yellow');
  const caps = p.texts.filter((t) => t.caption);
  assert.equal(caps.length, 2);
  for (const c of caps) assert.equal(c.style.color, '#FFD400FF');
  assert.equal(p.texts.find((t) => !t.caption).style.color, '#FFFFFFFF', 'normal metin değişmez');
  assert.equal(caps[0].text, 'merhaba dünya', 'metin korunur');
  p = removeCaptions(p);
  p = addClipCaptions(p, p.main[0].id, [{ t0: 4000, t1: 5500, text: 'yeni' }]).project;
  assert.equal(p.texts.find((t) => t.caption).style.color, '#FFD400FF', 'yeni altyazı proje stilini alır');
  assert.equal(applyCaptionStyle(p, 'yok'), p);
  assert.ok(CAPTION_STYLE_IDS.length >= 8);
});
