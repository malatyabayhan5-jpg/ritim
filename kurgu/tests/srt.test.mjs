import test from 'node:test';
import assert from 'node:assert/strict';
import { addSrtCaptions, parseSrt, srtTime, toSrt } from '../src/model/captions';
import { projectWith, video } from './helpers.mjs';

test('SRT zaman biçimi', () => {
  assert.equal(srtTime(0), '00:00:00,000');
  assert.equal(srtTime(3723045), '01:02:03,045');
});

test('SRT gidiş-dönüş: üret, ayrıştır, ekle; çok satırlı, BOM, WebVTT noktası, bozuk blok', () => {
  let p = projectWith([video('a', 20000)]);
  const src = '﻿1\r\n00:00:01,000 --> 00:00:03,500\r\nMerhaba <i>dünya</i>\r\nikinci satır\r\n\r\nbozuk\r\n\r\n2\r\n00:00:04.200 --> 00:00:06.000\r\nمرحبا\r\n\r\n3\r\n00:00:30,000 --> 00:00:31,000\r\nvideo dışı\r\n';
  const entries = parseSrt(src);
  assert.equal(entries.length, 3);
  assert.deepEqual(entries[0], { start: 1000, end: 3500, text: 'Merhaba dünya\nikinci satır' });
  assert.equal(entries[1].start, 4200);
  const r = addSrtCaptions(p, entries, 20000);
  assert.equal(r.added, 2);
  const out = toSrt(r.project);
  const again = parseSrt(out);
  assert.deepEqual(again.map((e) => [e.start, e.end, e.text]), [[1000, 3500, 'Merhaba dünya\nikinci satır'], [4200, 6000, 'مرحبا']]);
  assert.ok(out.startsWith('1\n00:00:01,000 --> 00:00:03,500\n'));
});
