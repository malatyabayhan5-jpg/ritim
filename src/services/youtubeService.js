// YouTube Data API v3 ile arama.
// Yalnızca arama ve video bilgisi alınır; oynatma YouTube'un resmi gömülü oynatıcısıyla yapılır.
// YouTube'dan ses/video indirmek YouTube Hizmet Şartları'na aykırıdır ve bu modülde yoktur.
//
// Anahtar: Google Cloud Console > API'ler ve Hizmetler > "YouTube Data API v3"ü etkinleştir >
//          Kimlik bilgileri > API anahtarı oluştur. Uygulamada YouTube aramasındaki ⚙ ile girilir.
// Kota: search.list her çağrıda 100 birim, videos.list 1 birim (günlük varsayılan kota 10.000 birim).

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_STORAGE = 'ritim:youtube:v1';
const API = 'https://www.googleapis.com/youtube/v3';
const TIMEOUT_MS = 15000;

let settings = { apiKey: '', creativeCommonsOnly: false };

export async function loadYouTubeSettings() {
  try {
    const raw = await AsyncStorage.getItem(KEY_STORAGE);
    if (raw) settings = { ...settings, ...JSON.parse(raw) };
  } catch (e) {
    // varsayılanlarla devam
  }
  return { ...settings };
}

export function getYouTubeSettings() {
  return { ...settings };
}

export async function saveYouTubeSettings(patch) {
  settings = {
    ...settings,
    ...patch,
    apiKey: String((patch && patch.apiKey) != null ? patch.apiKey : settings.apiKey).trim(),
  };
  await AsyncStorage.setItem(KEY_STORAGE, JSON.stringify(settings));
  return { ...settings };
}

// "PT1H2M3S" -> 3723
export function parseIsoDuration(iso) {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(String(iso || ''));
  if (!m) return 0;
  const [, d, h, min, s] = m.map((x) => (x ? Number(x) : 0));
  return d * 86400 + h * 3600 + min * 60 + s;
}

function decodeEntities(text) {
  return String(text || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function apiError(status, body) {
  const reason = body && body.error && body.error.errors && body.error.errors[0] && body.error.errors[0].reason;
  if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded') return 'Günlük YouTube API kotası doldu. Yarın tekrar dene.';
  if (reason === 'keyInvalid' || status === 400) return 'API anahtarı geçersiz. ⚙ menüsünden kontrol et.';
  if (reason === 'accessNotConfigured') return 'Bu anahtar için "YouTube Data API v3" etkin değil. Google Cloud Console\'dan etkinleştir.';
  if (status === 403) return 'YouTube isteği reddetti. Anahtarın kısıtlamalarını ve API\'nin etkin olduğunu kontrol et.';
  return `YouTube ${status} hatası döndürdü.`;
}

async function getJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(url, { signal: controller.signal });
  } catch (e) {
    if (e && e.name === 'AbortError') throw new Error('YouTube 15 saniye içinde yanıt vermedi.');
    throw new Error('YouTube\'a bağlanılamadı. İnternet bağlantını kontrol et.');
  } finally {
    clearTimeout(timer);
  }
  let body = null;
  try {
    body = await res.json();
  } catch (e) {
    body = null;
  }
  if (!res.ok) throw new Error(apiError(res.status, body));
  return body || {};
}

// Sonuç: [{ id, title, channel, thumbnail, duration (sn), publishedAt, license }]
export async function searchYouTube(query, { pageToken } = {}) {
  const q = String(query || '').trim();
  if (!q) throw new Error('Aramak için bir şey yaz.');
  if (!settings.apiKey) throw new Error('YouTube araması için API anahtarı gerekiyor. ⚙ menüsünden ekle.');

  const params = [
    'part=snippet',
    'type=video',
    'videoEmbeddable=true',
    'maxResults=20',
    'safeSearch=moderate',
    `q=${encodeURIComponent(q)}`,
    `key=${encodeURIComponent(settings.apiKey)}`,
  ];
  if (settings.creativeCommonsOnly) params.push('videoLicense=creativeCommon');
  if (pageToken) params.push(`pageToken=${encodeURIComponent(pageToken)}`);

  const search = await getJson(`${API}/search?${params.join('&')}`);
  const items = (search.items || []).filter((it) => it && it.id && it.id.videoId);
  if (!items.length) return { results: [], nextPageToken: null };

  const ids = items.map((it) => it.id.videoId);
  const details = await getJson(
    `${API}/videos?part=contentDetails,status&id=${ids.join(',')}&key=${encodeURIComponent(settings.apiKey)}`
  );
  const byId = {};
  (details.items || []).forEach((v) => {
    byId[v.id] = v;
  });

  const results = items
    .map((it) => {
      const v = byId[it.id.videoId];
      const sn = it.snippet || {};
      const thumbs = sn.thumbnails || {};
      const thumb = (thumbs.medium || thumbs.high || thumbs.default || {}).url || null;
      return {
        id: it.id.videoId,
        title: decodeEntities(sn.title) || 'Başlıksız video',
        channel: decodeEntities(sn.channelTitle),
        thumbnail: thumb,
        duration: v ? parseIsoDuration(v.contentDetails && v.contentDetails.duration) : 0,
        publishedAt: sn.publishedAt || null,
        license: v && v.status ? v.status.license : null, // 'youtube' | 'creativeCommon'
        live: sn.liveBroadcastContent === 'live',
      };
    })
    .filter((r) => !(byId[r.id] && byId[r.id].status && byId[r.id].status.embeddable === false));

  return { results, nextPageToken: search.nextPageToken || null };
}

// Anahtar gerektirmez: YouTube'un kendi arama sayfası (YouTube uygulaması yüklüyse orada açılır)
export function searchUrl(query) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(String(query || '').trim())}`;
}

// Yapıştırılan bir YouTube linkinden video kimliğini çıkarır; link değilse null
export function parseYouTubeId(text) {
  const t = String(text || '').trim();
  const patterns = [
    /^(?:https?:\/\/)?(?:www\.|m\.|music\.)?youtube\.com\/watch\?(?:[^#]*&)?v=([A-Za-z0-9_-]{11})/,
    /^(?:https?:\/\/)?(?:www\.|m\.)?youtube\.com\/(?:shorts|embed|live|v)\/([A-Za-z0-9_-]{11})/,
    /^(?:https?:\/\/)?youtu\.be\/([A-Za-z0-9_-]{11})/,
  ];
  for (const re of patterns) {
    const m = re.exec(t);
    if (m) return m[1];
  }
  return null;
}

export function hasApiKey() {
  return !!settings.apiKey;
}

export function watchUrl(videoId) {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}

export const __test = { decodeEntities, apiError };
