// Arama ve indirme servis katmanı.
// Arayüz bu dosyanın içini bilmez; yalnızca aşağıdaki fonksiyonları çağırır:
//
//   loadConfig()                 kayıtlı ayarları yükler
//   getConfig() / saveConfig()   { mode: 'mock' | 'api', baseUrl, token }
//   search(query)                -> Promise<MediaItem[]>
//   resolveDownload(item)        -> Promise<{ url, headers, ext?, mimeType? }>
//   testConnection()             -> Promise<{ ok, message }>
//
// MediaItem: { id, title, artist, duration (saniye), thumbnail, license }
//
// ----------------------------------------------------------------------------
// ÖZEL API SÖZLEŞMESİ (mode: 'api')
//
//   GET  {baseUrl}/search?q=<sorgu>
//        200 -> [ { id, title, artist?, duration?, thumbnail?, license? } ]
//               veya { results: [ ... ] }
//        duration: saniye (sayı) ya da "3:05" gibi metin
//
//   GET  {baseUrl}/media/{id}/download
//        200 -> { url, mimeType?, ext? }
//        url mutlak ya da baseUrl'e göre göreli olabilir. Dosya isteğine de
//        aynı Authorization başlığı eklenir.
//
//   token girilmişse her isteğe "Authorization: Bearer <token>" eklenir.
// ----------------------------------------------------------------------------

import AsyncStorage from '@react-native-async-storage/async-storage';

const CONFIG_KEY = 'ritim:mediaService:v1';
const TIMEOUT_MS = 15000;

const DEFAULTS = { mode: 'mock', baseUrl: '', token: '' };
let config = { ...DEFAULTS };

export async function loadConfig() {
  try {
    const raw = await AsyncStorage.getItem(CONFIG_KEY);
    if (raw) config = { ...DEFAULTS, ...JSON.parse(raw) };
  } catch (e) {
    config = { ...DEFAULTS };
  }
  return { ...config };
}

export function getConfig() {
  return { ...config };
}

export async function saveConfig(patch) {
  const next = { ...config, ...patch };
  next.baseUrl = String(next.baseUrl || '').trim().replace(/\/+$/, '');
  next.token = String(next.token || '').trim();
  if (next.mode !== 'api') next.mode = 'mock';
  config = next;
  await AsyncStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  return { ...config };
}

// ---------------------------------------------------------------------------
// Yardımcılar

export function parseDuration(d) {
  if (typeof d === 'number' && isFinite(d)) return Math.max(0, d);
  if (!d) return 0;
  const parts = String(d).trim().split(':');
  if (parts.some((p) => p === '' || isNaN(Number(p)))) return 0;
  return parts.reduce((acc, p) => acc * 60 + Number(p), 0);
}

function normalizeItem(raw, index) {
  if (!raw || typeof raw !== 'object') return null;
  const id = raw.id != null ? String(raw.id) : null;
  const title = raw.title != null ? String(raw.title).trim() : '';
  if (!id || !title) return null;
  return {
    id,
    title,
    artist: raw.artist ? String(raw.artist) : '',
    duration: parseDuration(raw.duration),
    thumbnail: raw.thumbnail || raw.thumbnailUrl || null,
    license: raw.license || null,
    _index: index,
  };
}

function authHeaders() {
  return config.token ? { Authorization: `Bearer ${config.token}` } : {};
}

function resolveUrl(url) {
  const u = String(url || '').trim();
  if (/^https?:\/\//i.test(u)) return u;
  if (!config.baseUrl) return u;
  return config.baseUrl + (u.startsWith('/') ? u : `/${u}`);
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(url, { headers: { Accept: 'application/json', ...authHeaders() }, signal: controller.signal });
  } catch (e) {
    if (e && e.name === 'AbortError') throw new Error('Sunucu 15 saniye içinde yanıt vermedi.');
    throw new Error('Sunucuya bağlanılamadı. Adresi ve internet bağlantını kontrol et.');
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 401 || res.status === 403) throw new Error('Sunucu erişimi reddetti. Erişim anahtarını kontrol et.');
  if (!res.ok) throw new Error(`Sunucu ${res.status} hatası döndürdü.`);
  try {
    return await res.json();
  } catch (e) {
    throw new Error('Sunucu yanıtı geçerli JSON değil.');
  }
}

// ---------------------------------------------------------------------------
// Mock sağlayıcı: harici servis gerekmeden test için.
// İndirmeler gerçekten yapılır; SoundHelix'in herkese açık test MP3'leri kullanılır.

const MOCK_LIBRARY = [
  { id: 'sh-1', title: 'Örnek parça 1', artist: 'SoundHelix', duration: 372 },
  { id: 'sh-2', title: 'Örnek parça 2', artist: 'SoundHelix', duration: 425 },
  { id: 'sh-3', title: 'Örnek parça 3', artist: 'SoundHelix', duration: 344 },
  { id: 'sh-4', title: 'Örnek parça 4', artist: 'SoundHelix', duration: 302 },
  { id: 'sh-5', title: 'Örnek parça 5', artist: 'SoundHelix', duration: 353 },
  { id: 'sh-6', title: 'Örnek parça 6', artist: 'SoundHelix', duration: 304 },
  { id: 'sh-7', title: 'Örnek parça 7', artist: 'SoundHelix', duration: 425 },
  { id: 'sh-8', title: 'Örnek parça 8', artist: 'SoundHelix', duration: 323 },
].map((m) => ({ ...m, thumbnail: null, license: 'Test amaçlı serbest kullanım (soundhelix.com)' }));

function mockFileUrl(id) {
  const n = String(id).replace('sh-', '');
  return `https://www.soundhelix.com/examples/mp3/SoundHelix-Song-${n}.mp3`;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const mockProvider = {
  async search(query) {
    await wait(350);
    const q = query.toLocaleLowerCase('tr');
    if (['örnek', 'ornek', 'test', 'hepsi', '*'].includes(q)) return MOCK_LIBRARY.slice();
    return MOCK_LIBRARY.filter(
      (m) => m.title.toLocaleLowerCase('tr').includes(q) || m.artist.toLocaleLowerCase('tr').includes(q)
    );
  },
  async resolveDownload(item) {
    await wait(200);
    return { url: mockFileUrl(item.id), headers: {}, ext: 'mp3', mimeType: 'audio/mpeg' };
  },
};

// ---------------------------------------------------------------------------
// Özel API sağlayıcı

const apiProvider = {
  async search(query) {
    if (!config.baseUrl) throw new Error('Sunucu adresi girilmemiş. Ayarlar\'dan ekle.');
    const data = await fetchJson(`${config.baseUrl}/search?q=${encodeURIComponent(query)}`);
    const list = Array.isArray(data) ? data : data && Array.isArray(data.results) ? data.results : null;
    if (!list) throw new Error('Sunucu yanıtında sonuç listesi bulunamadı.');
    return list;
  },
  async resolveDownload(item) {
    if (!config.baseUrl) throw new Error('Sunucu adresi girilmemiş. Ayarlar\'dan ekle.');
    const data = await fetchJson(`${config.baseUrl}/media/${encodeURIComponent(item.id)}/download`);
    if (!data || !data.url) throw new Error('Sunucu indirme adresi döndürmedi.');
    return { url: resolveUrl(data.url), headers: authHeaders(), ext: data.ext || null, mimeType: data.mimeType || null };
  },
};

function provider() {
  return config.mode === 'api' ? apiProvider : mockProvider;
}

// ---------------------------------------------------------------------------
// Dış arayüz

export async function search(query) {
  const q = String(query || '').trim();
  if (!q) throw new Error('Aramak için bir şey yaz.');
  if (q.length > 200) throw new Error('Arama metni çok uzun.');
  const raw = await provider().search(q);
  const seen = new Set();
  return raw
    .map(normalizeItem)
    .filter((it) => it && !seen.has(it.id) && seen.add(it.id));
}

export async function resolveDownload(item) {
  const res = await provider().resolveDownload(item);
  if (!res || !/^https?:\/\//i.test(res.url || '')) {
    throw new Error('Geçersiz indirme adresi.');
  }
  return { url: res.url, headers: res.headers || {}, ext: res.ext || null, mimeType: res.mimeType || null };
}

export async function testConnection() {
  if (config.mode !== 'api') return { ok: true, message: 'Mock modu: harici sunucu gerekmiyor.' };
  try {
    const list = await apiProvider.search('test');
    return { ok: true, message: `Bağlantı başarılı. "test" araması ${list.length} sonuç döndürdü.` };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

export const __test = { normalizeItem, mockProvider, MOCK_LIBRARY, mockFileUrl };
