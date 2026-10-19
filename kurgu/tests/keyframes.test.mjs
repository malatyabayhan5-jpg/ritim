import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { EASINGS, cubicBezier, ease, keyAt, packTrack, removeKey, setKey, shiftTrack, valueAt, valueAtPacked } from '../src/model/keyframes';

const near = (a, b, eps = 1e-4) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);

test('eğriler: uçlar sabit, doğrusal birebir, inOut simetrik, backOut aşar', () => {
  for (const id of Object.keys(EASINGS)) {
    if (id === 'hold') continue;
    near(ease(id, 0), 0);
    near(ease(id, 1), 1);
  }
  near(ease('linear', 0.3), 0.3);
  near(ease('inOut', 0.5), 0.5, 1e-3);
  near(ease('inOut', 0.25) + ease('inOut', 0.75), 1, 1e-3);
  assert.ok(ease('in', 0.3) < 0.3 && ease('out', 0.3) > 0.3);
  const peak = Math.max(...Array.from({ length: 50 }, (_, i) => ease('backOut', i / 49)));
  assert.ok(peak > 1.05, 'backOut hedefi aşmalı');
  // CSS ease-in-out (0.42,0,0.58,1) için bilinen değer: x=0.2 -> ~0.0816
  near(cubicBezier(0.42, 0, 0.58, 1, 0.2), 0.0816, 2e-3);
});

test('değer: sınırlar, ara değer, bekleme, tek kare, iz yoksa varsayılan', () => {
  const tr = [{ t: 0, v: 0, e: 'linear' }, { t: 1000, v: 10, e: 'hold' }, { t: 2000, v: 20 }];
  near(valueAt(tr, -50, 99), 0);
  near(valueAt(tr, 500, 99), 5);
  near(valueAt(tr, 1500, 99), 10);
  near(valueAt(tr, 2000, 99), 20);
  near(valueAt(tr, 5000, 99), 20);
  near(valueAt([{ t: 300, v: 7 }], 0, 99), 7);
  near(valueAt([], 0, 99), 99);
  near(valueAt(undefined, 0, 1.5), 1.5);
});

test('kare ekleme/güncelleme/silme sıralı ve toleranslı', () => {
  let tr = setKey([], 1000, 1);
  tr = setKey(tr, 0, 0);
  tr = setKey(tr, 1010, 2); // 15 ms içinde: günceller
  assert.deepEqual(tr.map((k) => [k.t, k.v]), [[0, 0], [1000, 2]]);
  assert.equal(keyAt(tr, 995).v, 2);
  tr = removeKey(tr, 1000);
  assert.equal(tr.length, 1);
});

test('kırpma kaydırması: sınır değerleri korunur', () => {
  const tr = [{ t: 0, v: 0, e: 'linear' }, { t: 1000, v: 100, e: 'linear' }, { t: 3000, v: 300, e: 'linear' }];
  // Baştan 500 ms kırpıldı, yeni süre 2000 ms
  const s = shiftTrack(tr, -500, 2000);
  near(valueAt(s, 0, -1), valueAt(tr, 500, -1));
  near(valueAt(s, 500, -1), 100);
  near(valueAt(s, 2000, -1), valueAt(tr, 2500, -1));
});

test('paketlenmiş iz aynı sonucu verir ve Java örnek dosyası güncel', () => {
  const rnd = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
  const kinds = ['linear', 'in', 'out', 'inOut', 'smooth', 'backOut', 'hold', [0.1, 0.7, 0.3, 1.2]];
  const lines = ['# Otomatik üretildi: tests/keyframes.test.mjs (UPDATE_FIXTURES=1). Biçim: iz | t | beklenen'];
  for (let n = 0; n < 12; n++) {
    let t = 0;
    const tr = [];
    const count = 1 + (n % 5);
    for (let i = 0; i < count; i++) {
      t += Math.round(100 + rnd() * 1500);
      tr.push({ t, v: Math.round((rnd() * 200 - 100) * 4) / 4, e: kinds[(n + i) % kinds.length] });
    }
    const packed = packTrack(tr);
    for (let j = 0; j < 8; j++) {
      const q = Math.round(rnd() * (t + 400) - 200);
      const v = valueAt(tr, q, -999);
      near(valueAtPacked(packed, q, -999), v, 1e-9);
      lines.push(`${packed.join(' ')} | ${q} | ${v.toFixed(6)}`);
    }
  }
  const file = join(process.cwd(), 'tests/fixtures/keyframes.txt');
  const text = `${lines.join('\n')}\n`;
  if (process.env.UPDATE_FIXTURES) writeFileSync(file, text);
  assert.equal(readFileSync(file, 'utf8'), text, 'örnek dosyası eski: UPDATE_FIXTURES=1 npm test');
});
