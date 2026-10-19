// Yerelleştirme çekirdeği: React'e bağımlı değildir (testlerde ve gelecekteki
// masaüstü sürümünde de kullanılabilir). Yeni dil eklemek için:
//   1) locales/<kod>.json ve her paket için packs/<paket>/<kod>.json oluşturun,
//   2) LANGUAGES listesine bir satır ekleyin,
//   3) `npm run i18n:check` ile eksik çeviri olmadığını doğrulayın.

import trBase from './locales/tr.json';
import enBase from './locales/en.json';
import arBase from './locales/ar.json';
import { PACKS, mergeDict } from './packs';

const withPacks = (base, packs) => packs.reduce((acc, p) => mergeDict(acc, p), base);
const tr = withPacks(trBase, PACKS.tr);
const en = withPacks(enBase, PACKS.en);
const ar = withPacks(arBase, PACKS.ar);

export const BASE_LANGUAGE = 'tr';

export const LANGUAGES = [
  { code: 'tr', native: 'Türkçe', rtl: false, intl: 'tr-TR' },
  { code: 'en', native: 'English', rtl: false, intl: 'en-US' },
  { code: 'ar', native: 'العربية', rtl: true, intl: 'ar' },
];

export const DICTIONARIES = { tr, en, ar };

export function languageInfo(code) {
  return LANGUAGES.find((l) => l.code === code) || LANGUAGES[0];
}

export function isRTL(code) {
  return languageInfo(code).rtl;
}

/** Cihaz yerel ayar listesinden desteklenen ilk dili seçer; yoksa Türkçe. */
export function detectLanguage(deviceLocales) {
  for (const loc of deviceLocales || []) {
    const code = String(loc?.languageCode || loc?.languageTag || loc || '')
      .toLowerCase()
      .split(/[-_]/)[0];
    if (DICTIONARIES[code]) return code;
  }
  return BASE_LANGUAGE;
}

function lookup(dict, key) {
  let node = dict;
  for (const part of key.split('.')) {
    if (node == null || typeof node !== 'object') return undefined;
    node = node[part];
  }
  return typeof node === 'string' ? node : undefined;
}

function interpolate(str, params) {
  if (!params) return str;
  return str.replace(/\{(\w+)\}/g, (m, name) => (params[name] === undefined ? m : String(params[name])));
}

/**
 * Çeviri fonksiyonu üretir. Eksik anahtar için önce temel dile (Türkçe)
 * düşer; orada da yoksa anahtarın kendisini döndürür ve geliştirme modunda uyarır.
 * Çoğul biçim: { count } parametresi verilirse "key_one"/"key_other" aranır.
 */
export function createTranslator(lang, onMissing) {
  const dict = DICTIONARIES[lang] || DICTIONARIES[BASE_LANGUAGE];
  const base = DICTIONARIES[BASE_LANGUAGE];
  const plural = safePluralRules(languageInfo(lang).intl);
  return function t(key, params) {
    let value;
    if (params && typeof params.count === 'number') {
      const form = plural ? plural.select(params.count) : params.count === 1 ? 'one' : 'other';
      value = lookup(dict, `${key}_${form}`) ?? lookup(dict, `${key}_other`);
    }
    value = value ?? lookup(dict, key);
    if (value === undefined) {
      if (onMissing) onMissing(lang, key);
      value = lookup(base, key) ?? key;
    }
    if (params && typeof params.count === 'number' && params.n === undefined) {
      params = { ...params, n: formatNumber(lang, params.count) };
    }
    return interpolate(value, params);
  };
}

function safePluralRules(locale) {
  try {
    return new Intl.PluralRules(locale);
  } catch {
    return null;
  }
}

// --- Biçimlendirme: tarih, saat, sayı, boyut ---

export function formatNumber(lang, value, options) {
  try {
    return new Intl.NumberFormat(languageInfo(lang).intl, options).format(value);
  } catch {
    return String(value);
  }
}

export function formatDate(lang, ms) {
  const d = new Date(ms);
  try {
    return new Intl.DateTimeFormat(languageInfo(lang).intl, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 16).replace('T', ' ');
  }
}

/** "5 dk önce" gibi göreli tarih; 7 günden eskiyse tam tarih. */
export function formatRelative(lang, ms, now = Date.now()) {
  const diff = Math.round((ms - now) / 1000);
  const abs = Math.abs(diff);
  if (abs > 7 * 86400) return formatDate(lang, ms);
  try {
    const rtf = new Intl.RelativeTimeFormat(languageInfo(lang).intl, { numeric: 'auto' });
    if (abs < 60) return rtf.format(diff, 'second');
    if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
    if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
    return rtf.format(Math.round(diff / 86400), 'day');
  } catch {
    return formatDate(lang, ms);
  }
}

const SIZE_UNITS = {
  tr: ['B', 'KB', 'MB', 'GB'],
  en: ['B', 'KB', 'MB', 'GB'],
  ar: ['بايت', 'ك.ب', 'م.ب', 'ج.ب'],
};

export function formatBytes(lang, bytes) {
  const units = SIZE_UNITS[lang] || SIZE_UNITS.en;
  let v = Math.max(0, bytes || 0);
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  const num = formatNumber(lang, v, { maximumFractionDigits: v < 10 && i > 0 ? 1 : 0 });
  return `${num} ${units[i]}`;
}

/**
 * Zaman kodu (ör. 01:05.3). Teknik bir değer olduğu için tüm dillerde Latin
 * rakamlarla ve soldan sağa gösterilir; Arapça arayüzde LTR yalıtımıyla sarılır.
 */
export function formatTimecode(ms, { tenths = true } = {}) {
  const total = Math.max(0, Math.round(ms || 0));
  const h = Math.floor(total / 3600000);
  const m = Math.floor((total % 3600000) / 60000);
  const s = Math.floor((total % 60000) / 1000);
  const d = Math.floor((total % 1000) / 100);
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  const core = h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  return tenths ? `${core}.${d}` : core;
}

/** Sağdan sola metin içinde soldan sağa kalması gereken parçalar için (LRI ... PDI). */
export function ltr(text) {
  return `⁦${text}⁩`;
}

export function formatDuration(lang, ms) {
  const sec = (ms || 0) / 1000;
  const unit = { tr: 'sn', en: 's', ar: 'ث' }[lang] || 's';
  return `${formatNumber(lang, sec, { maximumFractionDigits: 1, minimumFractionDigits: sec < 10 ? 1 : 0 })} ${unit}`;
}
