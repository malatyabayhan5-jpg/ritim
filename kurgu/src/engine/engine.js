// Yerel motor sarmalayıcısı: medya bilgisi, küçük resim, dalga biçimi,
// kodlayıcı yetenekleri ve dışa aktarma. Önbellek burada yönetilir.

import { PermissionsAndroid, Platform } from 'react-native';
import * as FS from 'expo-file-system/legacy';
import { KurguEngine, isEngineAvailable } from '../../modules/kurgu-engine';
import { THUMBS_DIR, WAVES_DIR, mediaUri } from '../storage/library';

export { isEngineAvailable };

export class EngineError extends Error {
  constructor(code, message) {
    super(message || code);
    this.code = code;
  }
}

function requireEngine() {
  if (!KurguEngine) throw new EngineError('ENGINE_UNAVAILABLE');
  return KurguEngine;
}

export async function probe(uri) {
  return requireEngine().probe(uri);
}

// Küçük resim istekleri aynı anda en fazla 2 tane çalışır; zaman çizelgesi
// kaydırılırken cihaz bunalmaz.
let running = 0;
const queue = [];
function schedule(task) {
  return new Promise((resolve, reject) => {
    queue.push({ task, resolve, reject });
    pump();
  });
}
function pump() {
  while (running < 2 && queue.length) {
    const { task, resolve, reject } = queue.shift();
    running++;
    task()
      .then(resolve, reject)
      .finally(() => {
        running--;
        pump();
      });
  }
}

// Küçük resim istekleri en fazla THUMB_MEMO_MAX kayıtla önbelleğe alınır (LRU):
// uzun oturumlarda bellek sürekli artmaz. Dosyalar diskte kalır, yalnızca
// JS tarafındaki söz (promise) kayıtları sınırlanır.
const THUMB_MEMO_MAX = 600;
const thumbMemo = new Map();
function memoGet(map, key) {
  const v = map.get(key);
  if (v !== undefined) {
    map.delete(key);
    map.set(key, v);
  }
  return v;
}
function memoSet(map, key, v, max) {
  map.set(key, v);
  while (map.size > max) map.delete(map.keys().next().value);
}

/** Medya için belirli zamanlarda (ms) küçük resim URI'leri. */
export function thumbnails(media, timesMs, heightPx = 96) {
  if (!KurguEngine) return Promise.resolve(timesMs.map(() => null));
  const key = `${media.id}|${heightPx}|${timesMs.join(',')}`;
  const hit = memoGet(thumbMemo, key);
  if (hit) return hit;
  const p = schedule(() =>
    KurguEngine.thumbnails(mediaUri(media), timesMs, heightPx, `${THUMBS_DIR}${media.id}/`, media.kind === 'image'),
  ).catch(() => timesMs.map(() => null));
  memoSet(thumbMemo, key, p, THUMB_MEMO_MAX);
  return p;
}

/** Chroma key için anahtar renk tahmini ("#RRGGBB" veya null): karenin kenar halkasındaki baskın doygun renk. */
export async function keyColor(media, timeMs) {
  if (!KurguEngine || !media) return null;
  try {
    return await schedule(() => KurguEngine.keyColor(mediaUri(media), timeMs, media.kind === 'image'));
  } catch {
    return null;
  }
}

const waveMemo = new Map();

/** Saniyede 20 tepe değeri; dosyada önbelleğe alınır. */
export function waveform(media) {
  if (!KurguEngine || !media) return Promise.resolve([]);
  if (waveMemo.has(media.id)) return waveMemo.get(media.id);
  const file = `${WAVES_DIR}${media.id}.json`;
  const p = (async () => {
    try {
      const info = await FS.getInfoAsync(file);
      if (info.exists) return JSON.parse(await FS.readAsStringAsync(file));
    } catch {
      // önbellek bozuksa yeniden üret
    }
    const peaks = await schedule(() => KurguEngine.waveform(mediaUri(media), 20, 40000));
    const rounded = peaks.map((v) => Math.round(v * 100) / 100);
    FS.writeAsStringAsync(file, JSON.stringify(rounded)).catch(() => {});
    return rounded;
  })().catch(() => []);
  waveMemo.set(media.id, p);
  return p;
}

let capsPromise = null;
export function encoderCapabilities() {
  if (!KurguEngine) return Promise.resolve({ h264: { available: false, modes: [] } });
  if (!capsPromise) capsPromise = KurguEngine.encoderCapabilities().catch(() => ({ h264: { available: true, modes: ['720p30', '1080p30'] } }));
  return capsPromise;
}

export function deviceStatus() {
  if (!KurguEngine) return Promise.resolve({ thermal: -1, powerSave: false });
  return KurguEngine.deviceStatus().catch(() => ({ thermal: -1, powerSave: false }));
}

export async function exportVideo(spec, outPath, options, onProgress) {
  const engine = requireEngine();
  const sub = engine.addListener('onExportProgress', (e) => onProgress?.(e.progress));
  try {
    return await engine.exportVideo(JSON.stringify(spec), outPath, options);
  } finally {
    sub.remove();
  }
}

export function cancelExport() {
  return KurguEngine ? KurguEngine.cancelExport() : Promise.resolve(false);
}

export function saveToGallery(path, displayName) {
  return requireEngine().saveToGallery(path, displayName);
}

// --- Cihaz içi AI araçları (ham ölçüm yerelde, karar src/model/ai.js'de) ---

/** Sessizlik analizi için yüksek çözünürlüklü tepe değerleri (saniyede 50). */
export async function speechPeaks(media) {
  return requireEngine().waveform(mediaUri(media), 50, 200000);
}

/** Video kareleri arasındaki histogram farkları [{ t (ms), d (0..1) }]. */
export async function sceneScores(media, fromMs, toMs, samplesPerSecond = 6) {
  return requireEngine().sceneScores(mediaUri(media), fromMs, toMs, samplesPerSecond);
}

/** Cihazın TTS motoruyla WAV üretir; çıktı yolunu döndürür. */
export async function synthesizeSpeech(text, lang, outPath, { rate = 1, pitch = 1 } = {}) {
  try {
    return await requireEngine().synthesizeSpeech(text, lang, outPath, rate, pitch);
  } catch (e) {
    throw new EngineError(e?.code || 'TTS_FAILED', e?.message);
  }
}

// --- Otomatik altyazı ---

export async function captionModels() {
  if (!KurguEngine) return { supported: false, models: [] };
  return KurguEngine.captionModels();
}

async function withAiProgress(onProgress, run) {
  const engine = requireEngine();
  const sub = engine.addListener('onAiProgress', (e) => onProgress?.(e.phase, e.progress));
  try {
    return await run(engine);
  } catch (e) {
    throw new EngineError(e?.code || 'AI_FAILED', e?.message);
  } finally {
    sub.remove();
  }
}

/**
 * Hareket takibi: görünen karede kutu [cx, cy, w, h] (0..1) kaynak aralığında izlenir.
 * Dönüş [{ t (kaynak ms), x, y (0..1), c (güven) }]; iptal cancelAi ile.
 */
export function trackMotion(media, fromMs, toMs, box, onProgress, samplesPerSecond = 15) {
  return withAiProgress(onProgress, (engine) => engine.trackMotion(mediaUri(media), fromMs, toMs, box, samplesPerSecond));
}

export function downloadCaptionModel(id, onProgress) {
  return withAiProgress(onProgress, (engine) => engine.downloadCaptionModel(id));
}

export function deleteCaptionModel(id) {
  return requireEngine().deleteCaptionModel(id);
}

/** Klibin kaynak aralığını tanır: { lang, segments:[{t0,t1,text}] } (ms, srcIn'e göre). */
/** translate: true ise konuşma cihaz içinde İngilizceye çevrilerek yazılır (whisper). */
export async function transcribe(media, fromMs, toMs, language, modelId, onProgress, translate = false) {
  const json = await withAiProgress(onProgress, (engine) => engine.transcribe(mediaUri(media), fromMs, toMs, language, modelId, !!translate));
  return JSON.parse(json);
}

/**
 * Klibin kaynak aralığını ters çevrilmiş yeni bir MP4 olarak üretir (cihaz içi yeniden kodlama).
 * Dönüş: { path, durationMs, width, height, hasAudio, frames }.
 */
/** Videoda arka plan kaldırma: kişi dışı anahtar yeşiline boyanmış yeni video (Cutout.kt). */
export function cutoutVideo(media, fromMs, toMs, outPath, maxSide, onProgress) {
  return withAiProgress(onProgress, (engine) => engine.cutoutVideo(mediaUri(media), fromMs, toMs, outPath, maxSide));
}

export function reverseVideo(media, fromMs, toMs, outPath, maxSide, onProgress) {
  return withAiProgress(onProgress, (engine) => engine.reverseVideo(mediaUri(media), fromMs, toMs, outPath, maxSide));
}

// --- Fotoğraf düzenleyici ---

/** Fotoğraf projesini çizer; { path, width, height }. format: 'jpg' | 'png'. */
export function renderPhoto(spec, outPath, maxSide, format = 'jpg', quality = 90) {
  return requireEngine().renderPhoto(JSON.stringify(spec), outPath, maxSide, format, quality);
}

/** Cihaz içi kişi maskesi (gri PNG); { path, coverage, width, height }. */
export async function segmentPerson(media, outPath) {
  try {
    return await requireEngine().segmentPerson(mediaUri(media), outPath);
  } catch (e) {
    throw new EngineError(e?.code || 'AI_FAILED', e?.message);
  }
}

/** Dikdörtgen bölgedeki nesneyi klasik boyamayla siler; yeni görsel { path, width, height }. */
export async function eraseRect(media, rect, outPath) {
  try {
    return await requireEngine().eraseRect(mediaUri(media), rect.x0, rect.y0, rect.x1, rect.y1, outPath);
  } catch (e) {
    throw new EngineError(e?.code || 'AI_FAILED', e?.message);
  }
}

/** Görüntü istatistikleri (otomatik iyileştirme için); uri: file:// veya content:// */
export function imageStats(uri) {
  return requireEngine().imageStats(uri);
}

export function saveImageToGallery(path, displayName) {
  return requireEngine().saveImageToGallery(path, displayName);
}

// --- Seslendirme kaydı (mikrofon) ---

/** Mikrofon izni ister; { granted } döner. */
export async function requestMicPermission() {
  // Android: React Native'in izin API'si (Expo izin yöneticisi yolu CI #42'de sessizce başarısız oldu)
  if (Platform.OS === 'android') {
    const perm = PermissionsAndroid.PERMISSIONS.RECORD_AUDIO;
    if (await PermissionsAndroid.check(perm)) return { granted: true, canAskAgain: true };
    const r = await PermissionsAndroid.request(perm);
    return { granted: r === PermissionsAndroid.RESULTS.GRANTED, canAskAgain: r !== PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN };
  }
  const r = await requireEngine().requestMicPermission();
  return { granted: r?.granted === true || r?.status === 'granted', canAskAgain: r?.canAskAgain !== false };
}

export function startRecording(outPath) {
  return requireEngine().startRecording(outPath);
}

export function recordingLevel() {
  return KurguEngine ? KurguEngine.recordingLevel() : Promise.resolve(0);
}

export async function stopRecording() {
  try {
    return await requireEngine().stopRecording();
  } catch (e) {
    throw new EngineError(/TOO_SHORT/.test(String(e?.message)) ? 'RECORD_TOO_SHORT' : 'RECORD_FAILED', e?.message);
  }
}

export function cancelRecording() {
  return KurguEngine ? KurguEngine.cancelRecording() : Promise.resolve();
}

export function cancelAi() {
  return KurguEngine ? KurguEngine.cancelAi() : Promise.resolve();
}
