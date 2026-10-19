// Hız ve hız eğrisi. Klibin `speedCurve` alanı varsa (değişken hız) sabit
// `speed` yerine geçer. Eğri, kaynak aralığının (srcIn..srcOut) 0..1 kesrine
// göre tanımlı hız noktalarıdır ve noktalar arası doğrusal değişir. Yerel motor
// eğriyi SEGMENTS parçalı sabit hızla oynatır (Media3 SpeedProvider adım işlevi
// ister); süre ve kaynak↔zaman eşlemesi burada aynı parçalarla hesaplanır, böylece
// zaman çizelgesi ile çıktı birebir tutar.

export const SPEED_MIN = 0.1;
export const SPEED_MAX = 10;
export const CURVE_SPEED_MIN = 0.1;
export const CURVE_SPEED_MAX = 10;
export const SEGMENTS = 32;

/** Hazır eğriler (özgün). x: kaynak kesri, v: hız. */
export const SPEED_PRESETS = [
  { id: 'rampUp', points: [[0, 0.5], [1, 3]] },
  { id: 'rampDown', points: [[0, 3], [1, 0.5]] },
  { id: 'slowCenter', points: [[0, 2.5], [0.35, 2.5], [0.5, 0.25], [0.65, 2.5], [1, 2.5]] },
  { id: 'fastCenter', points: [[0, 0.6], [0.4, 0.6], [0.5, 4], [0.6, 0.6], [1, 0.6]] },
  { id: 'heroMoment', points: [[0, 1], [0.45, 1.6], [0.6, 0.2], [0.75, 0.3], [1, 2]] },
  { id: 'burstIn', points: [[0, 6], [0.25, 4], [0.4, 1], [1, 1]] },
  { id: 'burstOut', points: [[0, 1], [0.6, 1], [0.75, 4], [1, 6]] },
  { id: 'pulse', points: [[0, 1], [0.2, 3], [0.4, 0.5], [0.6, 3], [0.8, 0.5], [1, 2]] },
];

export const CURVE_HANDLES = [0, 0.25, 0.5, 0.75, 1];

export function presetCurve(id) {
  const p = SPEED_PRESETS.find((x) => x.id === id);
  return p ? { preset: id, points: p.points.map(([x, v]) => ({ x, v })) } : null;
}

const clampV = (v) => Math.max(CURVE_SPEED_MIN, Math.min(CURVE_SPEED_MAX, v));

/** Eğrinin x (0..1) noktasındaki hızı. */
export function curveAt(points, x) {
  if (!points?.length) return 1;
  if (x <= points[0].x) return clampV(points[0].v);
  const last = points[points.length - 1];
  if (x >= last.x) return clampV(last.v);
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (x >= a.x && x <= b.x) {
      const k = b.x > a.x ? (x - a.x) / (b.x - a.x) : 0;
      return clampV(a.v + (b.v - a.v) * k);
    }
  }
  return clampV(last.v);
}

const isCurved = (c) => c.kind !== 'image' && !!c.speedCurve?.points?.length;

/** Parçalar: [{ s0, s1 (kaynak ms, klip başına göre), v, o0, o1 (çıktı ms) }] */
export function speedSegments(clip) {
  const len = Math.max(1, clip.srcOut - clip.srcIn);
  if (!isCurved(clip)) {
    const v = clip.kind === 'image' ? 1 : clip.speed || 1;
    return [{ s0: 0, s1: len, v, o0: 0, o1: len / v }];
  }
  const out = [];
  let o = 0;
  for (let k = 0; k < SEGMENTS; k++) {
    // Tam milisaniye sınırları ve 3 basamaklı hız: yerel motora giden değerlerle birebir aynı
    const s0 = k === 0 ? 0 : Math.round((len * k) / SEGMENTS);
    const s1 = k === SEGMENTS - 1 ? len : Math.round((len * (k + 1)) / SEGMENTS);
    // Parça hızı = harmonik ortalama (parçanın süresi eğrinin tam integraline eşit olur)
    let inv = 0;
    for (let j = 0; j < 8; j++) inv += 1 / curveAt(clip.speedCurve.points, (s0 + ((s1 - s0) * (j + 0.5)) / 8) / len);
    const v = Math.round((8 / inv) * 1000) / 1000;
    const d = (s1 - s0) / v;
    out.push({ s0, s1, v, o0: o, o1: o + d });
    o += d;
  }
  return out;
}

/** Klibin zaman çizelgesindeki süresi (ms). */
export function speedDuration(clip) {
  if (!isCurved(clip)) return Math.max(1, (clip.srcOut - clip.srcIn) / (clip.kind === 'image' ? 1 : clip.speed || 1));
  const segs = speedSegments(clip);
  return Math.max(1, segs[segs.length - 1].o1);
}

/** Klip içi çıktı zamanı (ms) -> kaynak zamanı (mutlak, ms). */
export function sourceAt(clip, localMs) {
  if (clip.kind === 'image') return clip.srcIn;
  if (!isCurved(clip)) return clip.srcIn + localMs * (clip.speed || 1);
  const segs = speedSegments(clip);
  const t = Math.max(0, Math.min(localMs, segs[segs.length - 1].o1));
  const seg = segs.find((s) => t <= s.o1) || segs[segs.length - 1];
  return clip.srcIn + seg.s0 + (t - seg.o0) * seg.v;
}

/** Kaynak zamanı (mutlak, ms) -> klip içi çıktı zamanı (ms). */
export function localAt(clip, srcMs) {
  if (clip.kind === 'image') return 0;
  if (!isCurved(clip)) return (srcMs - clip.srcIn) / (clip.speed || 1);
  const segs = speedSegments(clip);
  const s = Math.max(0, Math.min(srcMs - clip.srcIn, segs[segs.length - 1].s1));
  const seg = segs.find((x) => s <= x.s1) || segs[segs.length - 1];
  return seg.o0 + (s - seg.s0) / seg.v;
}

/** Ortalama hız (kaynak süresi / çıktı süresi). */
export function averageSpeed(clip) {
  return (clip.srcOut - clip.srcIn) / speedDuration(clip);
}

/** Eğrinin [f0, f1] kaynak kesri aralığı, 0..1'e yeniden ölçeklenmiş (parçalı doğrusal şekil aynen korunur). */
export function subCurve(curve, f0, f1) {
  if (!curve?.points?.length) return curve ?? null;
  const span = Math.max(1e-6, f1 - f0);
  const inner = curve.points.filter((p) => p.x > f0 + 1e-6 && p.x < f1 - 1e-6);
  const pts = [{ x: f0, v: curveAt(curve.points, f0) }, ...inner, { x: f1, v: curveAt(curve.points, f1) }];
  return { preset: null, points: pts.map((p) => ({ x: Math.round(((p.x - f0) / span) * 1e5) / 1e5, v: Math.round(p.v * 1000) / 1000 })) };
}

/** Eğriyi kaynak kesri f'de ikiye böler. */
export function splitCurve(curve, f) {
  return [subCurve(curve, 0, f), subCurve(curve, f, 1)];
}

/** Kırpma kenarındaki hız (kenar sürüklenirken kaynak değişimi için). */
export function edgeSpeed(clip, edge) {
  if (clip.kind === 'image') return 1;
  if (!isCurved(clip)) return clip.speed || 1;
  return curveAt(clip.speedCurve.points, edge === 'start' ? 0 : 1);
}

/** Yerel motor için parça dizisi: [kaynak başı ms (klip başına göre), hız, ...]; sabit hızda null. */
export function packSegments(clip) {
  if (!isCurved(clip)) return null;
  const out = [];
  for (const s of speedSegments(clip)) out.push(s.s0, s.v);
  return out;
}
