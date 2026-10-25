// Ritim işaretleri (referans uygulamanın klip araç çubuğundaki "Ritim"): sesin genlik zarfındaki ani
// yükselişler (başlangıçlar) vuruş sayılır. Girdi motorun waveform() tepe değerleridir
// (saniyede `rate` örnek, 0..1). Saf fonksiyon; birim testlidir.

/**
 * @returns {number[]} kaynak zamanı (ms), artan
 */
export function detectBeats(peaks, rate = 50, { minGapMs = 280, sensitivity = 1.5, fromMs = 0, toMs = Infinity } = {}) {
  if (!Array.isArray(peaks) || peaks.length < 3) return [];
  const step = 1000 / rate;
  // Zarf: 3 örneklik kayan ortalama; başlangıç gücü: zarfın pozitif farkı
  const env = peaks.map((_, i) => (peaks[Math.max(0, i - 1)] + peaks[i] + peaks[Math.min(peaks.length - 1, i + 1)]) / 3);
  const flux = env.map((v, i) => (i ? Math.max(0, v - env[i - 1]) : 0));
  // Uyarlanan eşik: yaklaşık 1 sn'lik pencerede ortalama + sensitivity × sapma
  const half = Math.max(2, Math.round(rate / 2));
  const out = [];
  let last = -Infinity;
  for (let i = 1; i < flux.length - 1; i++) {
    // 3 örneklik ortalama yükselişi bir örnek erken gösterir: başlangıç i + 1'dedir
    const t = (i + 1) * step;
    if (t < fromMs || t > toMs) continue;
    if (flux[i] < flux[i - 1] || flux[i] < flux[i + 1]) continue; // yerel tepe
    let sum = 0;
    let sq = 0;
    let n = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(flux.length - 1, i + half); j++) {
      sum += flux[j];
      sq += flux[j] * flux[j];
      n++;
    }
    const mean = sum / n;
    const sd = Math.sqrt(Math.max(0, sq / n - mean * mean));
    if (flux[i] < 0.02 || flux[i] < mean + sensitivity * sd) continue;
    if (t - last < minGapMs) continue;
    out.push(Math.round(t));
    last = t;
  }
  return out;
}
