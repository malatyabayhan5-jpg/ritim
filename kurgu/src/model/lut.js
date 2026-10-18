// .cube (Adobe/Resolve 3B LUT) ayrıştırıcı. İçe aktarmada dosyayı doğrulamak
// için kullanılır; yerel motor aynı kurallarla dosyayı yeniden okur (LutFx.kt).
//
// Biçim: TITLE "ad", LUT_3D_SIZE N, isteğe bağlı DOMAIN_MIN / DOMAIN_MAX
// (veya Resolve'un LUT_3D_INPUT_RANGE min max), ardından N³ satır "r g b".
// Satır sırası: kırmızı en hızlı, mavi en yavaş değişir. # ile başlayan satırlar
// yorumdur. 1B LUT'lar (LUT_1D_SIZE) desteklenmez.

export const LUT_MIN_SIZE = 2;
export const LUT_MAX_SIZE = 65;

export class LutError extends Error {
  constructor(code, detail) {
    super(detail ? `${code}: ${detail}` : code);
    this.code = code;
  }
}

/** @returns {{ title: string, size: number, domainMin: number[], domainMax: number[], data: Float32Array }} */
export function parseCube(text) {
  if (typeof text !== 'string' || !text.trim()) throw new LutError('LUT_EMPTY');
  let title = '';
  let size = 0;
  let domainMin = [0, 0, 0];
  let domainMax = [1, 1, 1];
  let data = null;
  let n = 0;
  const lines = text.split(/\r?\n/);
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li].trim();
    if (!line || line.startsWith('#')) continue;
    const first = line.charCodeAt(0);
    const isNumber = (first >= 48 && first <= 57) || first === 45 || first === 43 || first === 46;
    if (!isNumber) {
      const [key, ...rest] = line.split(/\s+/);
      switch (key.toUpperCase()) {
        case 'TITLE':
          title = line.slice(5).trim().replace(/^"|"$/g, '');
          break;
        case 'LUT_3D_SIZE':
          size = parseInt(rest[0], 10);
          if (!(size >= LUT_MIN_SIZE && size <= LUT_MAX_SIZE)) throw new LutError('LUT_SIZE', String(rest[0]));
          data = new Float32Array(size * size * size * 3);
          break;
        case 'LUT_1D_SIZE':
          throw new LutError('LUT_1D');
        case 'DOMAIN_MIN':
          domainMin = triple(rest, li);
          break;
        case 'DOMAIN_MAX':
          domainMax = triple(rest, li);
          break;
        case 'LUT_3D_INPUT_RANGE': {
          const a = Number(rest[0]);
          const b = Number(rest[1]);
          if (!Number.isFinite(a) || !Number.isFinite(b)) throw new LutError('LUT_DATA', `line ${li + 1}`);
          domainMin = [a, a, a];
          domainMax = [b, b, b];
          break;
        }
        default:
          // Bilinmeyen anahtar kelimeler (LUT_1D_INPUT_RANGE vb.) yok sayılır.
          break;
      }
      continue;
    }
    if (!data) throw new LutError('LUT_FORMAT', 'data before LUT_3D_SIZE');
    if (n >= size * size * size) throw new LutError('LUT_DATA', 'too many entries');
    const v = triple(line.split(/\s+/), li);
    data[n * 3] = v[0];
    data[n * 3 + 1] = v[1];
    data[n * 3 + 2] = v[2];
    n++;
  }
  if (!data) throw new LutError('LUT_FORMAT', 'missing LUT_3D_SIZE');
  if (n !== size * size * size) throw new LutError('LUT_DATA', `${n}/${size * size * size} entries`);
  for (let i = 0; i < 3; i++) if (!(domainMax[i] > domainMin[i])) throw new LutError('LUT_FORMAT', 'domain');
  return { title, size, domainMin, domainMax, data };
}

function triple(parts, li) {
  if (parts.length < 3) throw new LutError('LUT_DATA', `line ${li + 1}`);
  const v = [Number(parts[0]), Number(parts[1]), Number(parts[2])];
  if (!v.every(Number.isFinite)) throw new LutError('LUT_DATA', `line ${li + 1}`);
  return v;
}

/** Bir rengi LUT'tan geçirir (üç doğrusal ara değer). Testler ve CPU tarafı önizleme için. */
export function applyLut(lut, rgb) {
  const { size: s, data, domainMin, domainMax } = lut;
  const c = rgb.map((v, i) => Math.max(0, Math.min(1, (v - domainMin[i]) / (domainMax[i] - domainMin[i]))) * (s - 1));
  const i0 = c.map((v) => Math.floor(v));
  const i1 = i0.map((v) => Math.min(s - 1, v + 1));
  const f = c.map((v, i) => v - i0[i]);
  const at = (r, g, b, k) => data[(r + g * s + b * s * s) * 3 + k];
  const out = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    const lerp = (a, b, t) => a + (b - a) * t;
    const c00 = lerp(at(i0[0], i0[1], i0[2], k), at(i1[0], i0[1], i0[2], k), f[0]);
    const c10 = lerp(at(i0[0], i1[1], i0[2], k), at(i1[0], i1[1], i0[2], k), f[0]);
    const c01 = lerp(at(i0[0], i0[1], i1[2], k), at(i1[0], i0[1], i1[2], k), f[0]);
    const c11 = lerp(at(i0[0], i1[1], i1[2], k), at(i1[0], i1[1], i1[2], k), f[0]);
    out[k] = lerp(lerp(c00, c10, f[1]), lerp(c01, c11, f[1]), f[2]);
  }
  return out;
}

/** Dosya adından kullanıcıya gösterilecek LUT adı (çevrilmez: kullanıcı içeriği). */
export function lutDisplayName(fileName, title) {
  const base = (fileName || '').replace(/\.cube$/i, '').trim();
  return (title || base || 'LUT').slice(0, 40);
}
