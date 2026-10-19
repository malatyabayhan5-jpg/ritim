// Çeviri paketleri: büyük kütüphaneler (efekt, filtre, geçiş, metin, ses ön
// ayarları) kendi paket dosyalarında tutulur ve temel sözlüğe birleştirilir.
// Aynı anahtar iki yerde tanımlanırsa birleştirme hata verir (npm run i18n:check da denetler).
import effects2Tr from './effects2/tr.json';
import effects2En from './effects2/en.json';
import effects2Ar from './effects2/ar.json';
import filters2Tr from './filters2/tr.json';
import filters2En from './filters2/en.json';
import filters2Ar from './filters2/ar.json';
import transitions2Tr from './transitions2/tr.json';
import transitions2En from './transitions2/en.json';
import transitions2Ar from './transitions2/ar.json';
import text2Tr from './text2/tr.json';
import text2En from './text2/en.json';
import text2Ar from './text2/ar.json';
import audioTr from './audio/tr.json';
import audioEn from './audio/en.json';
import audioAr from './audio/ar.json';
import photoTr from './photo/tr.json';
import photoEn from './photo/en.json';
import photoAr from './photo/ar.json';

export const PACKS = {
  tr: [effects2Tr, filters2Tr, transitions2Tr, text2Tr, audioTr, photoTr],
  en: [effects2En, filters2En, transitions2En, text2En, audioEn, photoEn],
  ar: [effects2Ar, filters2Ar, transitions2Ar, text2Ar, audioAr, photoAr],
};

/** Derin birleştirme; yaprak anahtar çakışması hatadır. */
export function mergeDict(base, pack, path = '') {
  const out = { ...base };
  for (const [k, v] of Object.entries(pack || {})) {
    const key = path ? `${path}.${k}` : k;
    if (v && typeof v === 'object') {
      if (out[k] !== undefined && (typeof out[k] !== 'object' || out[k] === null)) throw new Error(`I18N_PACK_CONFLICT ${key}`);
      out[k] = mergeDict(out[k] || {}, v, key);
    } else {
      if (out[k] !== undefined) throw new Error(`I18N_PACK_CONFLICT ${key}`);
      out[k] = v;
    }
  }
  return out;
}
