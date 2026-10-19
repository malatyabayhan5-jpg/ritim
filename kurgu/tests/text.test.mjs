import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DICTIONARIES, LANGUAGES } from '../src/i18n/core';
import {
  FONTS,
  TEXT_ANIMATIONS_IN,
  TEXT_ANIMATIONS_LOOP,
  TEXT_ANIMATIONS_OUT,
  TEXT_LAYOUTS,
  TEXT_LAYOUTS_BASE,
  TEXT_PRESETS,
} from '../src/model/catalog';
import { TEXT_LAYOUTS_PACK2, TEXT_LAYOUT_BASE_CATEGORY, TEXT_LAYOUT_CATEGORIES, TEXT_PRESETS_PACK2 } from '../src/model/text-pack2';
import { DEFAULT_TEXT_STYLE, migrateProject } from '../src/model/schema';
import * as TL from '../src/model/timeline';
import { buildRenderSpec } from '../src/engine/renderSpec';
import { projectWith, video } from './helpers.mjs';

const engineDir = join(process.cwd(), 'modules/kurgu-engine/android/src/main/java/expo/modules/kurguengine');
const textAnimJava = readFileSync(join(engineDir, 'anim/TextAnim.java'), 'utf8');
const renderSpecKt = readFileSync(join(engineDir, 'RenderSpec.kt'), 'utf8');
const textLayerKt = readFileSync(join(engineDir, 'TextLayer.kt'), 'utf8');

const lookup = (lang, key) => key.split('.').reduce((n, k) => (n && typeof n === 'object' ? n[k] : undefined), DICTIONARIES[lang]);
const has = (lang, key) => typeof lookup(lang, key) === 'string' && lookup(lang, key).trim().length > 0;
const COLOR = /^#[0-9A-F]{8}$/;
const COLOR_FIELDS = ['color', 'color2', 'background', 'stroke', 'shadowColor', 'decoColor'];
const BOX_STYLES = ['block', 'lines', 'frame'];
const DECOS = ['none', 'bar', 'underline', 'rules', 'brackets'];

const templates = [...TEXT_PRESETS_PACK2, ...TEXT_LAYOUTS_PACK2];

test('en az 60 yeni metin şablonu (stil + düzen), kimlikler benzersiz', () => {
  assert.ok(templates.length >= 60, `şablon sayısı ${templates.length}`);
  for (const list of [TEXT_PRESETS, TEXT_LAYOUTS]) {
    const ids = list.map((x) => x.id);
    assert.equal(new Set(ids).size, ids.length, 'yinelenen kimlik');
  }
  for (const x of templates) assert.match(x.id, /^[a-z][A-Za-z0-9]+$/, x.id);
});

test('şablon stilleri geçerli: renkler #RRGGBBAA, boyutlar ve oranlar aralıkta', () => {
  const all = [...TEXT_PRESETS.map((p) => [p.id, p.style]), ...TEXT_LAYOUTS.map((l) => [l.id, l.style])];
  const known = new Set(Object.keys(DEFAULT_TEXT_STYLE));
  for (const [id, st] of all) {
    for (const k of Object.keys(st)) assert.ok(known.has(k), `${id}: bilinmeyen stil alanı ${k}`);
    for (const f of COLOR_FIELDS) if (st[f] !== undefined) assert.match(st[f], COLOR, `${id}.${f}`);
    if (st.size !== undefined) assert.ok(st.size >= 0.02 && st.size <= 0.16, `${id}: boyut ${st.size}`);
    if (st.strokeWidth !== undefined) assert.ok(st.strokeWidth >= 0 && st.strokeWidth <= 0.012, `${id}: kontur`);
    if (st.letterSpacing !== undefined) assert.ok(st.letterSpacing >= -0.05 && st.letterSpacing <= 0.5, `${id}: harf aralığı`);
    if (st.lineHeight !== undefined) assert.ok(st.lineHeight >= 0.8 && st.lineHeight <= 2.5, `${id}: satır aralığı`);
    if (st.font !== undefined) assert.ok(FONTS.includes(st.font), `${id}: yazı tipi ${st.font}`);
    if (st.align !== undefined) assert.ok(['left', 'center', 'right'].includes(st.align), `${id}: hizalama`);
    if (st.boxStyle !== undefined) assert.ok(BOX_STYLES.includes(st.boxStyle), `${id}: kutu biçimi`);
    if (st.deco !== undefined) assert.ok(DECOS.includes(st.deco), `${id}: süs`);
    for (const [k, lo, hi] of [['shadowBlur', 0, 1], ['shadowX', -0.5, 0.5], ['shadowY', -0.5, 0.5], ['boxRadius', 0, 2], ['boxPad', 0, 2]]) {
      if (st[k] !== undefined) assert.ok(st[k] >= lo && st[k] <= hi, `${id}: ${k}`);
    }
    // Görünmez şablon olmasın: dolgu saydamsa kontur olmalı
    const s = { ...DEFAULT_TEXT_STYLE, ...st };
    if (s.color.endsWith('00')) assert.ok(!s.stroke.endsWith('00') && s.strokeWidth > 0, `${id}: görünmez metin`);
  }
});

// WCAG göreli parlaklık; opak kutulu şablonlarda metin okunur olmalı
const lum = (c) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);

test('kutulu şablonlarda metin/kutu karşıtlığı yeterli', () => {
  for (const x of [...TEXT_PRESETS, ...TEXT_LAYOUTS]) {
    const s = { ...DEFAULT_TEXT_STYLE, ...x.style };
    const boxA = parseInt(s.background.slice(7, 9), 16);
    if (boxA < 0xb0 || s.boxStyle === 'frame' || s.color.endsWith('00')) continue;
    // Büyük/kalın metin için WCAG AA eşiği (3:1)
    assert.ok(contrast(s.color, s.background) >= 3, `${x.id}: karşıtlık ${contrast(s.color, s.background).toFixed(2)}`);
  }
});

test('düzen şablonları: konum, animasyon ve kategori geçerli', () => {
  for (const l of TEXT_LAYOUTS) {
    assert.ok(l.y >= -0.95 && l.y <= 0.95, `${l.id}: y`);
    assert.ok(TEXT_ANIMATIONS_IN.includes(l.animIn), `${l.id}: giriş ${l.animIn}`);
    assert.ok(TEXT_ANIMATIONS_OUT.includes(l.animOut), `${l.id}: çıkış ${l.animOut}`);
    assert.ok(TEXT_ANIMATIONS_LOOP.includes(l.animLoop || 'none'), `${l.id}: döngü ${l.animLoop}`);
    const cat = l.category || TEXT_LAYOUT_BASE_CATEGORY[l.id];
    assert.ok(TEXT_LAYOUT_CATEGORIES.includes(cat), `${l.id}: kategori ${cat}`);
  }
  for (const c of TEXT_LAYOUT_CATEGORIES) {
    const n = TEXT_LAYOUTS.filter((l) => (l.category || TEXT_LAYOUT_BASE_CATEGORY[l.id]) === c).length;
    assert.ok(n >= 3, `${c}: en az 3 şablon (${n})`);
  }
  for (const l of TEXT_LAYOUTS_BASE) assert.ok(TEXT_LAYOUT_BASE_CATEGORY[l.id], `${l.id}: temel düzen kategorisi`);
  for (const p of TEXT_PRESETS_PACK2) assert.ok(TEXT_LAYOUT_CATEGORIES.includes(p.category), `${p.id}: stil kategorisi`);
});

for (const { code } of LANGUAGES) {
  test(`${code}: şablon, stil, kategori ve animasyon adları çevrilmiş`, () => {
    const keys = [
      ...TEXT_PRESETS.map((p) => `text.preset.${p.id}`),
      ...TEXT_LAYOUTS.flatMap((l) => [`text.layout.${l.id}`, l.textKey]),
      ...TEXT_LAYOUT_CATEGORIES.map((c) => `text.category.${c}`),
      ...[...TEXT_ANIMATIONS_IN, ...TEXT_ANIMATIONS_OUT, ...TEXT_ANIMATIONS_LOOP].map((a) => `text.anim.${a}`),
      'text.animLoop',
      'text.tab.templates',
    ];
    assert.deepEqual(keys.filter((k) => !has(code, k)), []);
  });
}

test('Arapça örnek metinler Arapça, Türkçe örnekler İngilizceden farklı', () => {
  let arabic = 0;
  let differ = 0;
  for (const l of TEXT_LAYOUTS_PACK2) {
    if (/[؀-ۿ]/.test(lookup('ar', l.textKey))) arabic++;
    if (lookup('tr', l.textKey) !== lookup('en', l.textKey)) differ++;
  }
  assert.ok(arabic >= TEXT_LAYOUTS_PACK2.length - 2, `Arapça örnek: ${arabic}`);
  assert.ok(differ >= TEXT_LAYOUTS_PACK2.length - 3, `Türkçe örnek: ${differ}`);
});

test('her animasyonun yerel karşılığı var (TextAnim.java)', () => {
  const ids = new Set([...TEXT_ANIMATIONS_IN, ...TEXT_ANIMATIONS_OUT, ...TEXT_ANIMATIONS_LOOP]);
  ids.delete('none');
  for (const id of ids) assert.ok(textAnimJava.includes(`"${id}"`), `${id} TextAnim.java içinde yok`);
  assert.ok(TEXT_ANIMATIONS_IN.length - 6 >= 12, 'en az 12 yeni giriş animasyonu');
  assert.ok(TEXT_ANIMATIONS_OUT.length - 5 >= 12, 'en az 12 yeni çıkış animasyonu');
  // Kutu biçimleri ve süsler yerelde çiziliyor
  for (const b of BOX_STYLES.filter((x) => x !== 'block')) assert.ok(textLayerKt.includes(`"${b}"`), `kutu ${b}`);
  for (const d of DECOS.filter((x) => x !== 'none')) assert.ok(textLayerKt.includes(`"${d}"`), `süs ${d}`);
});

test('varsayılan görünüm alanları yerel varsayılanlarla aynı (eski projeler aynı çizilir)', () => {
  const nativeDefaults = {
    color2: '"color2", "#00000000"',
    shadowColor: '"shadowColor", "#000000A0"',
    shadowBlur: '"shadowBlur", 0.08',
    shadowX: '"shadowX", 0.0',
    shadowY: '"shadowY", 0.05',
    boxStyle: '"boxStyle", "block"',
    boxRadius: '"boxRadius", 0.25',
    boxPad: '"boxPad", 0.35',
    deco: '"deco", "none"',
    decoColor: '"decoColor", "#FFFFFFFF"',
  };
  for (const [k, frag] of Object.entries(nativeDefaults)) {
    assert.ok(renderSpecKt.includes(frag), `RenderSpec.kt ${k}`);
    const js = String(DEFAULT_TEXT_STYLE[k]);
    assert.ok(frag.includes(js) || frag.includes(`${js}.0`), `${k}: JS ${js} ≠ ${frag}`);
  }
  assert.ok(renderSpecKt.includes('"animLoop", "none"'));
});

test('render tanımı yeni alanları taşır; eski proje varsayılanlarla açılır', () => {
  let p = projectWith([video('v', 5000)]);
  p = TL.addText(p, 0, 'Merhaba', { ...TEXT_LAYOUTS_PACK2.find((l) => l.id === 'ltBar').style }, { animIn: 'wordRise', animOut: 'blur', animLoop: 'pulse' }).project;
  const s = buildRenderSpec(p, (m) => `file:///${m.path}`);
  const tx = s.texts[0];
  assert.equal(tx.deco, 'bar');
  assert.equal(tx.decoColor, '#FF3B30FF');
  assert.equal(tx.animIn, 'wordRise');
  assert.equal(tx.animOut, 'blur');
  assert.equal(tx.animLoop, 'pulse');
  assert.equal(tx.boxPad, 0.4);

  // Yeni alanlardan önceki bir proje kaydı
  const old = JSON.parse(JSON.stringify(p));
  const legacy = { font: 'sans', size: 0.05, color: '#FFFFFFFF', background: '#00000000', stroke: '#00000000', strokeWidth: 0, shadow: true, bold: true, italic: false, align: 'center', letterSpacing: 0, lineHeight: 1.2, opacity: 1 };
  old.texts = [{ ...old.texts[0], style: legacy, animLoop: undefined }];
  delete old.texts[0].animLoop;
  const m = migrateProject(old);
  const s2 = buildRenderSpec(m, (x) => `file:///${x.path}`).texts[0];
  assert.equal(s2.animLoop, 'none');
  assert.equal(s2.shadowColor, '#000000A0');
  assert.equal(s2.shadowBlur, 0.08);
  assert.equal(s2.shadowY, 0.05);
  assert.equal(s2.boxStyle, 'block');
  assert.equal(s2.boxRadius, 0.25);
  assert.equal(s2.boxPad, 0.35);
  assert.equal(s2.deco, 'none');
  assert.equal(s2.color2, '#00000000');
});
