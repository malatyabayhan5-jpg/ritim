// Cihaz içi "akıllı" araçların saf JS kısımları: ses tepe değerlerinden sessizlik
// bulma ve kare farkı puanlarından sahne kesmesi seçme. Yerel motor yalnızca ham
// ölçümü (tepe değerleri, kare farkları) üretir; karar mantığı burada ve birim
// testlidir. Hiçbir veri cihaz dışına gönderilmez.

/**
 * Sessiz aralıklar (kaynak zamanı, ms).
 * Eşik uyarlamalıdır: gürültü tabanı (10. yüzdelik) ile konuşma düzeyi (95.
 * yüzdelik) arasında `sensitivity` oranında bir noktadır; böylece hem stüdyo hem
 * sokak kaydında çalışır. Kesimlerin kelime başını/sonunu yememesi için `padMs`
 * kadar pay bırakılır.
 */
export function detectSilences(peaks, peaksPerSecond, { minSilenceMs = 700, padMs = 150, sensitivity = 0.5 } = {}) {
  if (!peaks?.length || !(peaksPerSecond > 0)) return [];
  const sorted = [...peaks].sort((a, b) => a - b);
  const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)))];
  const floor = q(0.1);
  const speech = q(0.95);
  if (speech < 0.02 || speech - floor < 0.02) return []; // tamamen sessiz ya da düz: karar verilemez
  const threshold = Math.max(0.008, floor + (speech - floor) * (0.06 + 0.24 * clamp01(sensitivity)));
  const step = 1000 / peaksPerSecond;
  const out = [];
  let start = -1;
  for (let i = 0; i <= peaks.length; i++) {
    const silent = i < peaks.length && peaks[i] < threshold;
    if (silent && start < 0) start = i;
    if (!silent && start >= 0) {
      const s = start * step + (start === 0 ? 0 : padMs);
      const e = i * step - (i === peaks.length ? 0 : padMs);
      if (e - s >= minSilenceMs) out.push({ start: Math.round(s), end: Math.round(e) });
      start = -1;
    }
  }
  return out;
}

/**
 * Kare farkı puanlarından sahne kesmeleri (ms). Puan, ardışık örnek kareler
 * arasındaki renk histogramı farkıdır (0..1). Kesme: puan hem mutlak eşiği hem
 * de çevresindeki ortalamanın belirgin üstünü aşmalı (kamera hareketinde yanlış
 * kesmeyi önler) ve iki kesme arası en az `minSceneMs` olmalı.
 */
export function pickSceneCuts(scores, { minSceneMs = 800, threshold = 0.3, contrast = 3 } = {}) {
  const cuts = [];
  for (let i = 0; i < scores.length; i++) {
    const { t, d } = scores[i];
    if (d < threshold) continue;
    let sum = 0;
    let n = 0;
    for (let j = Math.max(0, i - 6); j <= Math.min(scores.length - 1, i + 6); j++) {
      if (j === i) continue;
      sum += scores[j].d;
      n++;
    }
    const local = n ? sum / n : 0;
    if (d < local * contrast + 0.05) continue;
    const prev = cuts[cuts.length - 1];
    if (prev != null && t - prev < minSceneMs) continue;
    if (t < minSceneMs) continue;
    cuts.push(Math.round(t));
  }
  return cuts;
}

/**
 * Seslendirme dili: metindeki yazı sistemine göre (Arapça harf -> ar, Türkçeye
 * özgü harf -> tr), aksi hâlde arayüz dili. Kullanıcının metni çevrilmez.
 */
export function speechLanguage(text, uiLang = 'tr') {
  if (/[\u0600-\u06FF\u0750-\u077F]/.test(text)) return 'ar';
  if (/[ğĞşŞıİçÇöÖüÜ]/.test(text)) return 'tr';
  return uiLang === 'ar' ? 'en' : uiLang;
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}
