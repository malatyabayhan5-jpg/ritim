// Çeviri denetimi (CI'da her derlemede çalışır).
//  1) Her dil, temel dilin (tr) tüm anahtarlarını içermeli; fazladan anahtar olmamalı.
//  2) Boş çeviri olmamalı.
//  3) {yer tutucular} temel dille aynı olmalı ({n} çoğul biçimlerinde isteğe bağlıdır).
//  4) Koddaki her t('sabit.anahtar') temel dilde bulunmalı; t(`önek.${x}`) için en az bir eşleşme olmalı.
//  5) Arayüz koduna gömülü (çevrilmemiş) metin olmamalı.
// Dinamik anahtarların (filtre, efekt, geçiş adları) tam kapsamı tests/i18n.test.mjs'dedir.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const localesDir = join(root, 'src/i18n/locales');
const BASE = 'tr';
const PLURAL = /_(zero|one|two|few|many|other)$/;

const errors = [];
const fail = (msg) => errors.push(msg);

function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}

const placeholders = (s) => new Set([...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).filter((n) => n !== 'n'));
const logicalKey = (k) => k.replace(PLURAL, '');

const locales = Object.fromEntries(
  readdirSync(localesDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => [f.replace('.json', ''), flatten(JSON.parse(readFileSync(join(localesDir, f), 'utf8')))]),
);
const base = locales[BASE];
if (!base) throw new Error('base locale missing');
const baseLogical = new Set(Object.keys(base).map(logicalKey));

for (const [lang, dict] of Object.entries(locales)) {
  const logical = new Set(Object.keys(dict).map(logicalKey));
  for (const k of baseLogical) {
    if (!logical.has(k)) fail(`[${lang}] eksik çeviri: ${k}`);
    else if (Object.keys(base).some((b) => b !== k && logicalKey(b) === k) && !(`${k}_other` in dict)) {
      fail(`[${lang}] çoğul anahtarın "_other" biçimi eksik: ${k}`);
    }
  }
  for (const k of logical) if (!baseLogical.has(k)) fail(`[${lang}] temel dilde olmayan anahtar: ${k}`);
  for (const [k, v] of Object.entries(dict)) {
    if (typeof v !== 'string' || !v.trim()) fail(`[${lang}] boş çeviri: ${k}`);
    const ref = base[k] ?? base[`${logicalKey(k)}_other`] ?? base[logicalKey(k)];
    if (ref === undefined) continue;
    const a = placeholders(ref);
    const b = placeholders(v);
    const isPluralForm = PLURAL.test(k);
    for (const p of a) if (!b.has(p) && !isPluralForm) fail(`[${lang}] ${k}: {${p}} yer tutucusu eksik`);
    for (const p of b) if (!a.has(p)) fail(`[${lang}] ${k}: bilinmeyen yer tutucu {${p}}`);
  }
}

// --- Kod taraması ---
function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}
const files = [join(root, 'App.js'), ...walk(join(root, 'src'))].filter((f) => !f.includes('/i18n/'));

// Arayüzde çeviri gerektirmeyen teknik metinler
const ALLOWED_LITERALS = new Set(['Aa', 'H.264', 'H.265 / HEVC', 'AV1', 'MP4 · AAC', 'VHS', 'RGB', 'x']);

for (const file of files) {
  const src = readFileSync(file, 'utf8');
  const rel = relative(root, file);
  for (const m of src.matchAll(/\bt\(\s*'([^']+)'/g)) {
    if (!baseLogical.has(m[1])) fail(`${rel}: tanımsız anahtar '${m[1]}'`);
  }
  for (const m of src.matchAll(/\bt\(\s*`([^`]+)`/g)) {
    const pattern = new RegExp(`^${m[1].replace(/[.*+?^()|[\]\\]/g, '\\$&').replace(/\$\{[^}]+\}/g, '[^.]+(\\.[^.]+)*')}$`);
    if (![...baseLogical].some((k) => pattern.test(k))) fail(`${rel}: dinamik anahtar eşleşmiyor: ${m[1]}`);
  }
  // JSX içindeki düz metin: >Metin<
  for (const m of src.matchAll(/(.)>\s*([^<>{}\n]*[A-Za-zÇĞİÖŞÜçğıöşü؀-ۿ]{2,}[^<>{}\n]*)\s*</g)) {
    const text = m[2].trim();
    if (m[1] === '=' || m[1] === '-') continue; // "=>" veya "->": kod, JSX değil
    if (!text || ALLOWED_LITERALS.has(text)) continue;
    if (/[;=()[\]?*+]|\bconst\b|\breturn\b/.test(text)) continue; // karşılaştırma vb. kod parçası
    fail(`${rel}: çevrilmemiş arayüz metni: "${text}"`);
  }
  // Metin içeren özellikler: title="..." label="..." placeholder="..."
  for (const m of src.matchAll(/\b(title|label|placeholder|accessibilityLabel)="([^"]*[A-Za-zÇĞİÖŞÜçğıöşü]{2,}[^"]*)"/g)) {
    if (!ALLOWED_LITERALS.has(m[2])) fail(`${rel}: çevrilmemiş ${m[1]}="${m[2]}"`);
  }
  for (const m of src.matchAll(/\blabel=\{?'([^']*[A-Za-zÇĞİÖŞÜçğıöşü]{2,}[^']*)'\}?/g)) {
    if (!ALLOWED_LITERALS.has(m[1])) fail(`${rel}: çevrilmemiş label='${m[1]}'`);
  }
}

if (errors.length) {
  console.error(`Çeviri denetimi başarısız (${errors.length}):\n- ${errors.join('\n- ')}`);
  process.exit(1);
}
console.log(`Çeviri denetimi geçti: ${Object.keys(locales).join(', ')} · ${baseLogical.size} anahtar · ${files.length} dosya tarandı`);
