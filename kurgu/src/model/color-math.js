// Renk matrisi yapı taşları (saf fonksiyonlar, hiçbir modüle bağımlı değil).
// filters-pack2.js bunları kullanır; color.js filtre paketini içe aktardığı için
// paket color.js'ten değer alamaz (ES modül döngüsü), ortak matematik burada.
//
// Matrisler 4x4, sütun öncelikli ve vec4(rgb, 1) üzerine uygulanır (4. sütun =
// ofset). Media3 SDR içeriği varsayılan olarak gamaya göre kodlanmış BT.709
// değerleriyle işler; bu yüzden orta ton ≈ 0.46 kabul edilir.

export const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

// Rec.709 parlaklık ağırlıkları
export const LUMA = [0.2126, 0.7152, 0.0722];

const rgb = (v) => (Array.isArray(v) ? v : [v, v, v]);

/** Satır öncelikli 3x3 + ofsetten sütun öncelikli 4x4 (her satır bir çıkış kanalı). */
export function rows(r0, r1, r2, offset = [0, 0, 0]) {
  return [r0[0], r1[0], r2[0], 0, r0[1], r1[1], r2[1], 0, r0[2], r1[2], r2[2], 0, offset[0], offset[1], offset[2], 1];
}

/** a * b (önce b, sonra a uygulanır). */
export function mul(a, b) {
  const out = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      out[c * 4 + r] = s;
    }
  }
  return out;
}

/** Soldan sağa uygulanan adımları tek matriste birleştirir. */
export const compose = (...ms) => ms.reduce((acc, m) => mul(m, acc), IDENTITY);

/** Matrisi birimden k oranında uzaklaştırır (k=0 etkisiz, k=1 tam). */
export const mix = (m, k) => m.map((v, i) => IDENTITY[i] + (v - IDENTITY[i]) * k);

/** Doygunluk (parlaklığı koruyarak). */
export function sat(s) {
  const i = 1 - s;
  const [r, g, b] = LUMA;
  return rows([r * i + s, g * i, b * i], [r * i, g * i + s, b * i], [r * i, g * i, b * i + s]);
}

/** Kanal kazancı. */
export function gain(r, g = r, b = r) {
  return rows([r, 0, 0], [0, g, 0], [0, 0, b]);
}

/** Kanal ofseti (kaldırma). */
export function offset(r, g = r, b = r) {
  return rows([1, 0, 0], [0, 1, 0], [0, 0, 1], [r, g, b]);
}

/** Orta ton etrafında kontrast. */
export function contrast(c, pivot = 0.46) {
  const o = pivot * (1 - c);
  return rows([c, 0, 0], [0, c, 0], [0, 0, c], [o, o, o]);
}

/** Gri ekseni etrafında ton döndürme (derece). */
export function hue(deg) {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return rows(
    [0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928],
    [0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.14, 0.072 - c * 0.072 - s * 0.283],
    [0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072],
  );
}

/**
 * Tek eksende renk vurgusu: `dir` yönündeki (ör. turuncu↔camgöbeği) renklilik k
 * oranında artırılır (negatif k azaltır). Griler etkilenmez.
 */
export function axis(dir, k) {
  const m = (dir[0] + dir[1] + dir[2]) / 3;
  const a = dir.map((v) => v - m);
  const n = a[0] * a[0] + a[1] * a[1] + a[2] * a[2];
  const row = (i) => a.map((v, j) => (i === j ? 1 : 0) + (k * a[i] * v) / n);
  return rows(row(0), row(1), row(2));
}

/** Renk sıcaklığı: + sıcak (turuncu), - soğuk (mavi). */
export const temp = (t) => gain(1 + 0.12 * t, 1 + 0.02 * t, 1 - 0.12 * t);

/** Renk tonu: + eflatun, - yeşil. */
export const tint = (t) => gain(1 + 0.05 * t, 1 - 0.09 * t, 1 + 0.05 * t);

/**
 * Ton aralığı: siyah `lo`, beyaz `hi` rengine eşlenir (kanal başına sayı ya da
 * [r,g,b]). Sıfırdan büyük lo mat siyahlar, birden küçük hi yumuşak beyazlar verir; renkli lo/hi
 * gölge ve ışıklara ayrı renk katar (bölünmüş ton yaklaşımı). tone(1, 0) negatiftir.
 */
export function tone(lo, hi) {
  const l = rgb(lo);
  const h = rgb(hi);
  return rows([h[0] - l[0], 0, 0], [0, h[1] - l[1], 0], [0, 0, h[2] - l[2]], l);
}

/** Çift ton: ağırlıklı parlaklık koyu renkten açık renge eşlenir. */
export function duo(dark, light, w = LUMA) {
  const d = rgb(dark);
  const l = rgb(light);
  const sum = w[0] + w[1] + w[2];
  const n = w.map((v) => v / sum);
  return rows(n.map((v) => v * (l[0] - d[0])), n.map((v) => v * (l[1] - d[1])), n.map((v) => v * (l[2] - d[2])), d);
}

/** Siyah-beyaz; `w` kanal ağırlıkları (renkli objektif filtresi benzetimi). */
export const mono = (w = LUMA) => duo(0, 1, w);
