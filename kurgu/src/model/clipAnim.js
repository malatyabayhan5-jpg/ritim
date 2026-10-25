// Ana iz klip animasyonları (CapCut'taki klip araç çubuğu "Animasyonlar": giriş, çıkış, kombo).
// Yerel tarafta ayrı bir efekt yok: animasyon render tanımında klibin konum / ölçek / açı /
// opaklık anahtar kareleriyle birleştirilir (Fx.kt KeyedPlacement, KeyedOpacity). Kullanıcının
// kendi kareleri korunur: ölçek ve opaklık çarpılır, konum ve açı eklenir.
//
// clip.anim = { in, inMs, out, outMs, combo, comboMs }
// Konum birimi NDC'dir (2 = kanvas genişliği / yüksekliği), y yukarı doğru.

import { valueAt } from './keyframes';

export const CLIP_ANIMS_IN = ['none', 'fade', 'zoomIn', 'zoomOut', 'slideLeft', 'slideRight', 'slideUp', 'slideDown', 'rotate', 'spin'];
export const CLIP_ANIMS_OUT = ['none', 'fade', 'zoomIn', 'zoomOut', 'slideLeft', 'slideRight', 'slideUp', 'slideDown', 'rotate', 'spin'];
export const CLIP_ANIMS_COMBO = ['none', 'pulse', 'swing', 'float', 'shake', 'breathe'];
export const CLIP_ANIM_DEFAULT_MS = 500;
export const CLIP_ANIM_MIN_MS = 100;
export const CLIP_ANIM_MAX_MS = 5000;
export const ANIM_PROPS = ['x', 'y', 'scale', 'angle', 'opacity'];

const ID = { x: 0, y: 0, scale: 1, angle: 0, opacity: 1 };
const easeOut = (p) => 1 - (1 - p) ** 3;
const easeIn = (p) => p ** 3;

// Giriş: q 0 → 1 (yumuşak biten), q = 1'de kimlik
const IN = {
  fade: (q) => ({ opacity: q }),
  zoomIn: (q) => ({ scale: 0.6 + 0.4 * q, opacity: q }),
  zoomOut: (q) => ({ scale: 1.4 - 0.4 * q, opacity: q }),
  slideLeft: (q) => ({ x: 2 * (1 - q) }),
  slideRight: (q) => ({ x: -2 * (1 - q) }),
  slideUp: (q) => ({ y: -2 * (1 - q) }),
  slideDown: (q) => ({ y: 2 * (1 - q) }),
  rotate: (q) => ({ angle: -90 * (1 - q), scale: 0.5 + 0.5 * q, opacity: q }),
  spin: (q) => ({ angle: 360 * (1 - q), scale: 0.3 + 0.7 * q }),
};
// Çıkış: p 0 → 1 (yumuşak başlayan), p = 0'da kimlik
const OUT = {
  fade: (p) => ({ opacity: 1 - p }),
  zoomIn: (p) => ({ scale: 1 + 0.4 * p, opacity: 1 - p }),
  zoomOut: (p) => ({ scale: 1 - 0.4 * p, opacity: 1 - p }),
  slideLeft: (p) => ({ x: -2 * p }),
  slideRight: (p) => ({ x: 2 * p }),
  slideUp: (p) => ({ y: 2 * p }),
  slideDown: (p) => ({ y: -2 * p }),
  rotate: (p) => ({ angle: 90 * p, scale: 1 - 0.5 * p, opacity: 1 - p }),
  spin: (p) => ({ angle: -360 * p, scale: 1 - 0.7 * p }),
};
// Kombo: klip boyunca döngü; ms = bir tur
const COMBO = {
  pulse: (t, ms) => ({ scale: 1 + 0.06 * Math.sin((2 * Math.PI * t) / ms) }),
  swing: (t, ms) => ({ angle: 6 * Math.sin((2 * Math.PI * t) / ms) }),
  float: (t, ms) => ({ y: 0.04 * Math.sin((2 * Math.PI * t) / ms) }),
  shake: (t, ms) => ({ x: 0.025 * Math.sin((2 * Math.PI * t) / (ms / 8)), y: 0.015 * Math.cos((2 * Math.PI * t) / (ms / 6)) }),
  breathe: (t, ms) => ({ scale: 1.04 + 0.04 * Math.sin((2 * Math.PI * t) / ms) }),
};
export const COMBO_MS = { pulse: 800, swing: 1200, float: 1600, shake: 800, breathe: 2400 };

export function normalizeAnim(anim) {
  const a = anim || {};
  const ok = (list, v) => (list.includes(v) ? v : 'none');
  const ms = (v) => Math.max(CLIP_ANIM_MIN_MS, Math.min(CLIP_ANIM_MAX_MS, Math.round(v || CLIP_ANIM_DEFAULT_MS)));
  return { in: ok(CLIP_ANIMS_IN, a.in), inMs: ms(a.inMs), out: ok(CLIP_ANIMS_OUT, a.out), outMs: ms(a.outMs), combo: ok(CLIP_ANIMS_COMBO, a.combo), comboMs: a.comboMs ? ms(a.comboMs) : null };
}

export function hasAnim(anim) {
  const a = normalizeAnim(anim);
  return a.in !== 'none' || a.out !== 'none' || a.combo !== 'none';
}

/**
 * Giriş ve çıkış sürelerinin klibe sığan hâli: toplamları klip süresini aşarsa orantılı kısalır.
 */
export function animWindows(anim, durationMs) {
  const a = normalizeAnim(anim);
  let inMs = a.in !== 'none' ? a.inMs : 0;
  let outMs = a.out !== 'none' ? a.outMs : 0;
  if (inMs + outMs > durationMs) {
    const k = durationMs / (inMs + outMs);
    inMs = Math.floor(inMs * k);
    outMs = Math.floor(outMs * k);
  }
  return { ...a, inMs, outMs };
}

/** Klip içi `t` anında animasyonun katkısı (kimlik: x 0, y 0, ölçek 1, açı 0, opaklık 1). */
export function animAt(anim, durationMs, t) {
  const a = animWindows(anim, durationMs);
  const v = { ...ID };
  const apply = (d) => {
    for (const [k, x] of Object.entries(d)) v[k] = k === 'scale' || k === 'opacity' ? v[k] * x : v[k] + x;
  };
  if (a.in !== 'none' && a.inMs > 0 && t < a.inMs) apply(IN[a.in](easeOut(Math.max(0, t) / a.inMs)));
  if (a.out !== 'none' && a.outMs > 0 && t > durationMs - a.outMs) apply(OUT[a.out](easeIn(Math.min(1, (t - (durationMs - a.outMs)) / a.outMs))));
  if (a.combo !== 'none') apply(COMBO[a.combo](t, a.comboMs || COMBO_MS[a.combo]));
  return v;
}

const touches = (a, prop) => {
  const probe = (fn, q) => fn && fn(q)[prop] !== undefined;
  return (a.in !== 'none' && probe(IN[a.in], 0.5)) || (a.out !== 'none' && probe(OUT[a.out], 0.5)) || (a.combo !== 'none' && COMBO[a.combo](1, 1000)[prop] !== undefined);
};

/**
 * Animasyonu klibin anahtar kareleriyle birleştirir; render tanımına giden izleri döner
 * ({ prop: [{t, v, e}] }, yalnızca değişen özellikler). `base(prop)` kare yokken sabit değer.
 * Pencereler (ve kombo ya da kullanıcı karesi varsa tüm klip) 40 ms aralıkla örneklenir;
 * örnekler arası doğrusal.
 */
export function animTracks(clip, durationMs, base) {
  const a = animWindows(clip.anim, durationMs);
  if (a.in === 'none' && a.out === 'none' && a.combo === 'none') return {};
  const out = {};
  for (const prop of ANIM_PROPS) {
    if (!touches(a, prop)) continue;
    const user = clip.keyframes?.[prop];
    const b = base(prop);
    const userAt = (t) => valueAt(user, t, b);
    const times = new Set([0, Math.round(durationMs)]);
    const dense = a.combo !== 'none' || (user && user.length);
    const step = Math.max(40, Math.ceil(durationMs / 600));
    const sample = (from, to) => {
      for (let t = from; t < to; t += step) times.add(Math.round(t));
      times.add(Math.round(to));
    };
    if (dense) sample(0, durationMs);
    else {
      if (a.inMs > 0) sample(0, a.inMs);
      if (a.outMs > 0) sample(durationMs - a.outMs, durationMs);
    }
    const combine = (t) => {
      const d = animAt(clip.anim, durationMs, t)[prop];
      return prop === 'scale' || prop === 'opacity' ? userAt(t) * d : userAt(t) + d;
    };
    out[prop] = [...times].sort((x, y) => x - y).map((t) => ({ t, v: combine(t), e: 'linear' }));
  }
  return out;
}

/** Bölmede giriş ilk parçada, çıkış son parçada kalır; kombo ikisinde de sürer. */
export function splitAnim(anim) {
  if (!anim) return [anim, anim];
  return [{ ...anim, out: 'none' }, { ...anim, in: 'none' }];
}

