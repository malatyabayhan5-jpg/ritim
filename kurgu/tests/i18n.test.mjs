import test from 'node:test';
import assert from 'node:assert/strict';
import { DICTIONARIES, LANGUAGES, createTranslator, detectLanguage, formatBytes, formatTimecode, isRTL } from '../src/i18n/core';
import { ADJUSTMENTS, EFFECTS, EFFECT_CATEGORIES, FILTERS, FILTER_CATEGORIES } from '../src/model/color';
import { FONTS, TEMPLATES, TEXT_ANIMATIONS_IN, TEXT_ANIMATIONS_OUT, TEXT_LAYOUTS, TRANSITIONS, TRANSITION_CATEGORIES } from '../src/model/catalog';

const has = (lang, key) => {
  const node = key.split('.').reduce((n, k) => (n && typeof n === 'object' ? n[k] : undefined), DICTIONARIES[lang]);
  return typeof node === 'string' && node.trim().length > 0;
};

// Katalogdaki her öğenin (dinamik anahtarlar) üç dilde çevirisi olmalı.
const dynamicKeys = [
  ...FILTERS.map((f) => `filters.${f.id}`),
  ...FILTER_CATEGORIES.map((c) => `filters.category.${c}`),
  ...EFFECTS.map((e) => `effects.${e.id}`),
  ...EFFECT_CATEGORIES.map((c) => `effects.category.${c}`),
  ...TRANSITIONS.map((x) => `transitions.${x.id}`),
  ...TRANSITION_CATEGORIES.map((c) => `transitions.category.${c}`),
  ...ADJUSTMENTS.map((a) => `adjust.${a.key}`),
  ...FONTS.map((f) => `fonts.${f}`),
  ...TEXT_ANIMATIONS_IN.map((a) => `text.anim.${a}`),
  ...TEXT_ANIMATIONS_OUT.map((a) => `text.anim.${a}`),
  ...TEXT_LAYOUTS.flatMap((l) => [`text.layout.${l.id}`, l.textKey]),
  ...TEMPLATES.flatMap((tp) => [`templates.${tp.id}.name`, `templates.${tp.id}.desc`]),
  ...['IMPORT_FAILED', 'UNSUPPORTED_CODEC', 'UNREADABLE'].map((c) => `errors.import.${c}`),
  ...['EXPORT_FAILED', 'EXPORT_BUSY', 'BAD_SPEC', 'ENGINE_UNAVAILABLE'].map((c) => `errors.export.${c}`),
  ...['saved', 'saving', 'pending', 'error'].map((s) => `editor.save.${s}`),
];

for (const { code } of LANGUAGES) {
  test(`${code}: tüm katalog öğeleri çevrilmiş`, () => {
    const missing = dynamicKeys.filter((k) => !has(code, k));
    assert.deepEqual(missing, []);
  });
}

test('ilk sürümde yalnızca TR, EN, AR; yalnızca AR sağdan sola', () => {
  assert.deepEqual(LANGUAGES.map((l) => l.code), ['tr', 'en', 'ar']);
  assert.equal(isRTL('ar'), true);
  assert.equal(isRTL('tr'), false);
  assert.equal(isRTL('en'), false);
});

test('cihaz dili algılama: desteklenmiyorsa Türkçe', () => {
  assert.equal(detectLanguage([{ languageCode: 'ar', languageTag: 'ar-EG' }]), 'ar');
  assert.equal(detectLanguage([{ languageTag: 'en-GB' }]), 'en');
  assert.equal(detectLanguage([{ languageCode: 'de' }, { languageCode: 'en' }]), 'en');
  assert.equal(detectLanguage([{ languageCode: 'fr' }]), 'tr');
  assert.equal(detectLanguage([]), 'tr');
});

test('çeviri: yer tutucu, temel dile düşme, çoğul', () => {
  const tEn = createTranslator('en');
  assert.equal(tEn('home.version', { version: '1.2' }), 'Version 1.2');
  assert.equal(tEn('home.clipCount', { count: 1 }), '1 clip');
  assert.equal(tEn('home.clipCount', { count: 3 }), '3 clips');
  const tAr = createTranslator('ar');
  assert.equal(tAr('home.clipCount', { count: 2 }), DICTIONARIES.ar.home.clipCount_two);
  const missing = [];
  const tx = createTranslator('en', (l, k) => missing.push(k));
  assert.equal(tx('does.not.exist'), 'does.not.exist');
  assert.deepEqual(missing, ['does.not.exist']);
});

test('kullanıcı içeriği çevrilmez: yer tutucuya giden metin olduğu gibi kalır', () => {
  const t = createTranslator('ar');
  assert.ok(t('home.deleteMessage', { name: 'Tatil 2026' }).includes('Tatil 2026'));
});

test('zaman kodu her dilde Latin rakamlı ve LTR', () => {
  assert.equal(formatTimecode(65300), '01:05.3');
  assert.equal(formatTimecode(3725000, { tenths: false }), '1:02:05');
});

test('boyut biçimi dile göre birim kullanır', () => {
  assert.match(formatBytes('tr', 5 * 1024 * 1024), /MB$/);
  assert.match(formatBytes('ar', 5 * 1024 * 1024), /م\.ب$/);
});
