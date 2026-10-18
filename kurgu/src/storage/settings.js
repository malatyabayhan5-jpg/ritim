import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'kurgu.settings.v1';

export const DEFAULT_SETTINGS = {
  language: 'system', // 'system' | 'tr' | 'en' | 'ar'
  previewQuality: 'medium', // 'low' | 'medium' | 'high'
  defaultRatio: '9:16',
  defaultResolution: 1080,
  defaultFps: 30,
  imageDurationMs: 3000,
  autosave: true,
  haptics: true,
};

let cache = null;

export async function loadSettings() {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    cache = { ...DEFAULT_SETTINGS, ...(raw ? JSON.parse(raw) : {}) };
  } catch {
    cache = { ...DEFAULT_SETTINGS };
  }
  return cache;
}

export async function saveSettings(patch) {
  const current = await loadSettings();
  cache = { ...current, ...patch };
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    // Kalıcı depolama yazılamazsa ayar bu oturum için geçerli kalır.
  }
  return cache;
}
