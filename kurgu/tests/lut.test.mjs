import test from 'node:test';
import assert from 'node:assert/strict';
import { LUT_MAX_SIZE, applyLut, lutDisplayName, parseCube } from '../src/model/lut';
import { migrateProject } from '../src/model/schema';
import * as TL from '../src/model/timeline';
import { buildRenderSpec } from '../src/engine/renderSpec';
import { projectWith, video } from './helpers.mjs';

const uri = (m) => `file:///lib/${m.path}`;

function cube(n, fn, header = '') {
  const lines = [`# test`, header, `LUT_3D_SIZE ${n}`];
  for (let b = 0; b < n; b++) for (let g = 0; g < n; g++) for (let r = 0; r < n; r++) lines.push(fn(r / (n - 1), g / (n - 1), b / (n - 1)).join(' '));
  return lines.join('\n');
}
const identity = (n) => cube(n, (r, g, b) => [r, g, b]);

test('geçerli .cube ayrıştırılır: başlık, boyut, alan, kırmızı en hızlı sıra', () => {
  const text = cube(3, (r, g, b) => [r, g * 0.5, b], 'TITLE "Sıcak Ton"\r\nDOMAIN_MIN 0 0 0\nDOMAIN_MAX 1 1 1');
  const l = parseCube(text);
  assert.equal(l.title, 'Sıcak Ton');
  assert.equal(l.size, 3);
  assert.equal(l.data.length, 27 * 3);
  // ikinci satır: r=0.5, g=0, b=0
  assert.deepEqual([...l.data.slice(3, 6)], [0.5, 0, 0]);
  // r=0, g=1 (index 6)
  assert.equal(l.data[6 * 3 + 1], 0.5);
});

test('birim LUT rengi değiştirmez, ara değer üç doğrusal', () => {
  const l = parseCube(identity(5));
  for (const c of [[0, 0, 0], [1, 1, 1], [0.13, 0.57, 0.91], [0.5, 0.25, 0.75]]) {
    applyLut(l, c).forEach((v, i) => assert.ok(Math.abs(v - c[i]) < 1e-6));
  }
  const inv = parseCube(cube(2, (r, g, b) => [1 - r, 1 - g, 1 - b]));
  applyLut(inv, [0.2, 0.4, 0.9]).forEach((v, i) => assert.ok(Math.abs(v - [0.8, 0.6, 0.1][i]) < 1e-6));
});

test('LUT_3D_INPUT_RANGE ve DOMAIN alanı uygulanır', () => {
  const l = parseCube(`LUT_3D_INPUT_RANGE 0 2\n${identity(2).split('\n').slice(2).join('\n')}`);
  assert.deepEqual(l.domainMax, [2, 2, 2]);
  // 1.0 girdi alan içinde 0.5'e karşılık gelir
  applyLut(l, [1, 1, 1]).forEach((v) => assert.ok(Math.abs(v - 0.5) < 1e-6));
});

test('geçersiz LUT dosyaları açıklayıcı kodla reddedilir', () => {
  const code = (text) => {
    try {
      parseCube(text);
      return 'OK';
    } catch (e) {
      return e.code;
    }
  };
  assert.equal(code(''), 'LUT_EMPTY');
  assert.equal(code('LUT_1D_SIZE 1024\n0 0 0'), 'LUT_1D');
  assert.equal(code(`LUT_3D_SIZE ${LUT_MAX_SIZE + 1}`), 'LUT_SIZE');
  assert.equal(code('LUT_3D_SIZE 1'), 'LUT_SIZE');
  assert.equal(code('0 0 0\nLUT_3D_SIZE 2'), 'LUT_FORMAT');
  assert.equal(code('TITLE "x"'), 'LUT_FORMAT');
  assert.equal(code(identity(3).split('\n').slice(0, -1).join('\n')), 'LUT_DATA');
  assert.equal(code(`${identity(2)}\n0 0 0`), 'LUT_DATA');
  assert.equal(code(identity(2).replace('1 1 1', 'nan nan nan')), 'LUT_DATA');
  assert.equal(code(identity(2).replace('0 0 0', '0 0')), 'LUT_DATA');
  assert.equal(code(`DOMAIN_MIN 1 1 1\nDOMAIN_MAX 0 0 0\n${identity(2)}`), 'LUT_FORMAT');
  assert.equal(code(identity(17)), 'OK');
});

test('LUT adı dosya adından ya da başlıktan gelir, çevrilmez', () => {
  assert.equal(lutDisplayName('Film Look.CUBE', ''), 'Film Look');
  assert.equal(lutDisplayName('a.cube', 'Teal & Orange'), 'Teal & Orange');
  assert.equal(lutDisplayName('', ''), 'LUT');
});

test('klip LUT render tanımına girer; eksik LUT veya sıfır yoğunluk atlanır; kaydet/aç korunur', () => {
  let p = projectWith([video('a', 3000), video('b', 3000), video('c', 3000)]);
  p = TL.addLut(p, { id: 'med_lut1', path: 'media/med_lut1.cube', name: 'Look', size: 33 });
  p = TL.setClipLut(p, p.main[0].id, 'med_lut1', 0.7);
  p = TL.setClipLut(p, p.main[1].id, 'yok_boyle');
  p = TL.setClipLut(p, p.main[2].id, 'med_lut1', 0);
  const s = buildRenderSpec(p, uri);
  assert.deepEqual(s.main[0].lut, { uri: 'file:///lib/media/med_lut1.cube', amount: 0.7 });
  assert.equal(s.main[1].lut, null);
  assert.equal(s.main[2].lut, null);
  const reopened = migrateProject(JSON.parse(JSON.stringify(p)));
  assert.deepEqual(buildRenderSpec(reopened, uri).main[0].lut, s.main[0].lut);
  // LUT'suz eski proje
  const raw = JSON.parse(JSON.stringify(projectWith([video('x', 1000)])));
  delete raw.luts;
  delete raw.main[0].lut;
  const m = migrateProject(raw);
  assert.deepEqual(m.luts, {});
  assert.equal(buildRenderSpec(m, uri).main[0].lut, null);
  // Tümüne uygula
  const all = TL.updateAllMain(p, { lut: { id: 'med_lut1', intensity: 1 } });
  assert.ok(all.main.every((c) => c.lut?.id === 'med_lut1'));
});
