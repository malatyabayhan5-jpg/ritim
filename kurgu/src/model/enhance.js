// Otomatik iyileştirme (cihaz içi, klasik): görüntü istatistiklerinden (yerel
// imageStats: luminans yüzdelikleri, orta tonların ortalama rengi, ortalama doygunluk)
// ton ve beyaz dengesi ayarları türetir. Model kullanmaz; sonuç normal ayar
// kaydırıcılarına yazılır, kullanıcı ince ayar yapabilir. Düzeltmeler bilinçli olarak
// kısmidir (sahnenin ışık karakteri tamamen silinmesin).

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r2 = (v) => Math.round(v * 100) / 100;

/**
 * stats: { p01, p50, p99 (0..1 luminans), mean: [r, g, b] (orta tonlar, 0..1), sat (0..1) }
 * Dönüş: color.js adjustMatrix ile uyumlu { exposure, contrast, temperature, tint, saturation }.
 */
export function autoAdjust(stats) {
  const { p01 = 0, p50 = 0.45, p99 = 1, mean = [0.5, 0.5, 0.5], sat = 0.35 } = stats || {};
  // Pozlama: orta ton ~0.45'e (adjustMatrix: kazanç 2^(1.5·e))
  const exposure = clamp((Math.log2(0.45 / Math.max(0.02, p50)) / 1.5) * 0.7, -0.6, 0.6);
  const k = Math.pow(2, exposure * 1.5);
  // Kontrast: dar ton aralığını genişlet (kontrast kazancı 1 + 0.8c)
  const range = clamp(p99 * k, 0, 1) - clamp(p01 * k, 0, 1);
  const contrast = range < 0.85 ? clamp((0.9 / Math.max(0.1, range) - 1) / 0.8, 0, 0.45) : 0;
  // Beyaz dengesi (gri dünya varsayımı, kısmi düzeltme)
  const [r, g, b] = mean;
  const temperature = clamp(((b - r) / (0.18 * Math.max(0.05, r + b))) * 0.6, -0.6, 0.6);
  const m = (r + b) / 2;
  const tint = clamp(((g - m) / Math.max(0.02, 0.14 * g + 0.08 * m)) * 0.6, -0.5, 0.5);
  const saturation = sat < 0.2 ? 0.2 : sat < 0.3 ? 0.1 : sat > 0.6 ? -0.1 : 0.05;
  const out = { exposure: r2(exposure), contrast: r2(contrast), temperature: r2(temperature), tint: r2(tint), saturation: r2(saturation) };
  for (const key of Object.keys(out)) if (Math.abs(out[key]) < 0.03) out[key] = 0;
  return out;
}
