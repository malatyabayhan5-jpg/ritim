import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { I18nManager } from 'react-native';
import * as Localization from 'expo-localization';
import {
  createTranslator,
  detectLanguage,
  formatBytes,
  formatDate,
  formatDuration,
  formatNumber,
  formatRelative,
  isRTL,
  languageInfo,
} from './core';
import { loadSettings, saveSettings } from '../storage/settings';

// Yön yönetimi: Yerel (native) RTL çevirmesi kapalıdır; yön, kök görünümdeki
// `direction` stiliyle anında değiştirilir. Böylece dil değiştiğinde uygulama
// yeniden başlatılmaz ve açık proje kapanmaz. Zaman çizelgesi her dilde LTR kalır.
try {
  I18nManager.allowRTL(false);
  I18nManager.forceRTL(false);
} catch {
  // Bazı ortamlarda (testler) mevcut değildir.
}

const I18nContext = createContext(null);

const warned = new Set();
function reportMissing(lang, key) {
  if (__DEV__ && !warned.has(`${lang}:${key}`)) {
    warned.add(`${lang}:${key}`);
    console.warn(`[i18n] missing "${key}" for "${lang}"`);
  }
}

export function deviceLanguage() {
  try {
    return detectLanguage(Localization.getLocales());
  } catch {
    return detectLanguage([]);
  }
}

export function I18nProvider({ children }) {
  const [preference, setPreference] = useState('system');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    loadSettings().then((s) => {
      setPreference(s.language || 'system');
      setReady(true);
    });
  }, []);

  const lang = preference === 'system' ? deviceLanguage() : preference;

  const setLanguage = useCallback(async (next) => {
    setPreference(next);
    await saveSettings({ language: next });
  }, []);

  const value = useMemo(() => {
    const rtl = isRTL(lang);
    return {
      lang,
      preference,
      rtl,
      ready,
      intlLocale: languageInfo(lang).intl,
      t: createTranslator(lang, reportMissing),
      setLanguage,
      fmt: {
        number: (v, o) => formatNumber(lang, v, o),
        date: (ms) => formatDate(lang, ms),
        relative: (ms) => formatRelative(lang, ms),
        bytes: (b) => formatBytes(lang, b),
        duration: (ms) => formatDuration(lang, ms),
      },
      // Yön duyarlı yardımcılar
      dir: rtl ? 'rtl' : 'ltr',
      textAlign: rtl ? 'right' : 'left',
      row: rtl ? 'row-reverse' : 'row',
      flipIcon: (name) => (rtl ? MIRROR[name] || name : name),
    };
  }, [lang, preference, ready, setLanguage]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

// Yönlü simgeler: sağdan sola düzende aynalanır. Medya oynatma simgeleri
// (oynat, ileri sar) zaman akışını gösterdiği için aynalanmaz.
const MIRROR = {
  'chevron-back': 'chevron-forward',
  'chevron-forward': 'chevron-back',
  'arrow-back': 'arrow-forward',
  'arrow-forward': 'arrow-back',
  'arrow-undo': 'arrow-redo',
  'arrow-redo': 'arrow-undo',
};

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n outside I18nProvider');
  return ctx;
}

export function useT() {
  return useI18n().t;
}
