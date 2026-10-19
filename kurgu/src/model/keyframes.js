// Anahtar kareler (keyframe): bir özelliğin zaman içindeki değeri.
// İz biçimi: [{ t, v, e }] — t: öğenin başlangıcına göre ms, v: değer,
// e: bu kareden SONRAKİ kareye geçişteki eğri (yumuşatma).
// Aynı hesap yerel motorda Keyframes.java ile yapılır; ortak örnekler
// tests/fixtures/keyframes.json ile iki tarafta da denetlenir.

/** Hazır eğriler: kübik Bézier kontrol noktaları (x1, y1, x2, y2). */
export const EASINGS = {
  linear: [0, 0, 1, 1],
  in: [0.42, 0, 1, 1],
  out: [0, 0, 0.58, 1],
  inOut: [0.42, 0, 0.58, 1],
  smooth: [0.25, 0.1, 0.25, 1],
  backOut: [0.34, 1.56, 0.64, 1],
  hold: null, // sonraki kareye kadar değer sabit kalır
};
export const EASING_IDS = Object.keys(EASINGS);

/** Anahtar kare desteklenen katman özellikleri ve varsayılan değerleri. */
export const KEYFRAME_PROPS = ['x', 'y', 'scale', 'rotation', 'opacity'];

function bezierCoord(t, a, b) {
  // B(t) = 3(1-t)^2 t a + 3(1-t) t^2 b + t^3  (P0 = 0, P3 = 1)
  const u = 1 - t;
  return 3 * u * u * t * a + 3 * u * t * t * b + t * t * t;
}

/** Kübik Bézier yumuşatma: x için t'yi ikiye bölmeyle bulur (24 adım, ~1e-7 hassasiyet). */
export function cubicBezier(x1, y1, x2, y2, x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  let lo = 0;
  let hi = 1;
  let t = x;
  for (let i = 0; i < 24; i++) {
    t = (lo + hi) / 2;
    if (bezierCoord(t, x1, x2) < x) lo = t;
    else hi = t;
  }
  return bezierCoord((lo + hi) / 2, y1, y2);
}

export function ease(e, p) {
  if (Array.isArray(e) && e.length === 4) return cubicBezier(e[0], e[1], e[2], e[3], p);
  if (e === 'hold') return 0;
  const c = EASINGS[e] || EASINGS.linear;
  return c === EASINGS.linear ? Math.min(1, Math.max(0, p)) : cubicBezier(c[0], c[1], c[2], c[3], p);
}

/** İz yoksa veya boşsa `fallback` döner. */
export function valueAt(track, t, fallback) {
  if (!Array.isArray(track) || track.length === 0) return fallback;
  if (t <= track[0].t) return track[0].v;
  const last = track[track.length - 1];
  if (t >= last.t) return last.v;
  // Kare sayısı küçük (tipik < 20): doğrusal arama yeterli ve yerel tarafla aynı.
  let i = 0;
  while (i < track.length - 2 && track[i + 1].t <= t) i++;
  const a = track[i];
  const b = track[i + 1];
  const span = b.t - a.t;
  if (span <= 0) return b.v;
  const k = ease(a.e || 'linear', (t - a.t) / span);
  return a.v + (b.v - a.v) * k;
}

/** Kareyi ekler veya aynı zamandakini (±tolerans) günceller; iz zamana göre sıralı kalır. */
export function setKey(track, t, v, e, toleranceMs = 15) {
  const list = Array.isArray(track) ? track : [];
  const time = Math.max(0, Math.round(t));
  const idx = list.findIndex((k) => Math.abs(k.t - time) <= toleranceMs);
  if (idx >= 0) {
    return list.map((k, i) => (i === idx ? { ...k, v, ...(e ? { e } : {}) } : k));
  }
  return [...list, { t: time, v, e: e || 'inOut' }].sort((a, b) => a.t - b.t);
}

export function removeKey(track, t, toleranceMs = 15) {
  return (track || []).filter((k) => Math.abs(k.t - t) > toleranceMs);
}

export function keyAt(track, t, toleranceMs = 15) {
  return (track || []).find((k) => Math.abs(k.t - t) <= toleranceMs) || null;
}

/** Öğe kırpıldığında/bölündüğünde kareleri kaydırır ve aralık dışındakileri atar (sınır değerleri korunur). */
export function shiftTrack(track, deltaMs, durationMs) {
  if (!Array.isArray(track) || track.length === 0) return track;
  const startV = valueAt(track, -deltaMs, track[0].v);
  const endV = valueAt(track, durationMs - deltaMs, track[track.length - 1].v);
  const inside = track.map((k) => ({ ...k, t: k.t + deltaMs })).filter((k) => k.t > 0 && k.t < durationMs);
  const hadBefore = track.some((k) => k.t + deltaMs <= 0);
  const hadAfter = track.some((k) => k.t + deltaMs >= durationMs);
  const out = [...inside];
  if (hadBefore) out.unshift({ t: 0, v: startV, e: 'linear' });
  if (hadAfter) out.push({ t: Math.round(durationMs), v: endV, e: 'linear' });
  return out;
}

/** Tüm izler için shiftTrack. */
export function shiftKeyframes(keyframes, deltaMs, durationMs) {
  if (!keyframes) return keyframes;
  const out = {};
  for (const [prop, track] of Object.entries(keyframes)) {
    const s = shiftTrack(track, deltaMs, durationMs);
    if (s && s.length) out[prop] = s;
  }
  return out;
}

/** Render tanımı için düz dizi: [t0, v0, easeKind, x1, y1, x2, y2, t1, ...] — Keyframes.java okur. */
export function packTrack(track) {
  if (!Array.isArray(track) || track.length === 0) return null;
  const out = [];
  for (const k of track) {
    const e = Array.isArray(k.e) ? k.e : EASINGS[k.e || 'linear'];
    const kind = k.e === 'hold' ? 2 : e === EASINGS.linear || !e ? 0 : 1;
    const c = kind === 1 ? e : [0, 0, 1, 1];
    out.push(Math.round(k.t), k.v, kind, c[0], c[1], c[2], c[3]);
  }
  return out;
}

/** packTrack'in tersi + değerlendirme (testlerde Java ile karşılaştırma için). */
export function valueAtPacked(packed, t, fallback) {
  if (!packed || packed.length < 7) return fallback;
  const n = packed.length / 7;
  const track = [];
  for (let i = 0; i < n; i++) {
    const o = i * 7;
    const kind = packed[o + 2];
    const e = kind === 2 ? 'hold' : kind === 1 ? packed.slice(o + 3, o + 7) : 'linear';
    track.push({ t: packed[o], v: packed[o + 1], e });
  }
  return valueAt(track, t, fallback);
}
