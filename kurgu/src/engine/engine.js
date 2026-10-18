// Yerel motor sarmalayıcısı: medya bilgisi, küçük resim, dalga biçimi,
// kodlayıcı yetenekleri ve dışa aktarma. Önbellek burada yönetilir.

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

const thumbMemo = new Map();

/** Medya için belirli zamanlarda (ms) küçük resim URI'leri. */
export function thumbnails(media, timesMs, heightPx = 96) {
  if (!KurguEngine) return Promise.resolve(timesMs.map(() => null));
  const key = `${media.id}|${heightPx}|${timesMs.join(',')}`;
  if (thumbMemo.has(key)) return thumbMemo.get(key);
  const p = schedule(() =>
    KurguEngine.thumbnails(mediaUri(media), timesMs, heightPx, `${THUMBS_DIR}${media.id}/`, media.kind === 'image'),
  ).catch(() => timesMs.map(() => null));
  thumbMemo.set(key, p);
  return p;
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

export function downloadCaptionModel(id, onProgress) {
  return withAiProgress(onProgress, (engine) => engine.downloadCaptionModel(id));
}

export function deleteCaptionModel(id) {
  return requireEngine().deleteCaptionModel(id);
}

/** Klibin kaynak aralığını tanır: { lang, segments:[{t0,t1,text}] } (ms, srcIn'e göre). */
export async function transcribe(media, fromMs, toMs, language, modelId, onProgress) {
  const json = await withAiProgress(onProgress, (engine) => engine.transcribe(mediaUri(media), fromMs, toMs, language, modelId));
  return JSON.parse(json);
}

export function cancelAi() {
  return KurguEngine ? KurguEngine.cancelAi() : Promise.resolve();
}
