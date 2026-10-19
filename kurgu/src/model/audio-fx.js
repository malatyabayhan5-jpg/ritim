// Ses efektleri: parametre tanımları, ön ayarlar ve yerel motorun okuduğu düz
// tanım (audioFxSpec). İşleme yerel tarafta yapılır:
//   modules/kurgu-engine/.../dsp/AudioFxChain.java (efekt zinciri, saf Java)
//   modules/kurgu-engine/.../AudioFxProcessor.kt  (Media3 ses işlemcisi + perde)
// Parametre anahtarları, sınırları ve varsayılanları AudioFxChain.KEYS/MIN/MAX/
// DEFAULTS ile birebir aynıdır (tests/audio-fx.test.mjs Java dosyasını okuyup denetler).
//
// Proje durumu (klip/ses öğesi üzerinde `audioFx`):
//   { preset: 'podcast' | null, params: { anahtar: değer, ... } }
// `params` yalnızca varsayılandan farklı değerleri tutar; ön ayar seçmek params'ı
// ön ayarın değerleriyle değiştirir, kaydırıcılar üzerine yazar.

/** Bayrak parametresi (efekt açık/kapalı). */
const flag = (key) => ({ key, min: 0, max: 1, default: 0, step: 1, unit: 'bool' });
const p = (key, min, max, def, unit, step = 0) => ({ key, min, max, default: def, unit, step });

/**
 * Efektler zincir sırasıyla (perde en başta, Sonic ile). `toggle`: açma bayrağı;
 * null ise efekt değeri varsayılandan farklıysa etkindir (perde, kazanç).
 */
export const AUDIO_FX_EFFECTS = [
  { id: 'pitch', icon: 'musical-notes-outline', toggle: null, params: [p('pitch', -12, 12, 0, 'st', 1)] },
  {
    id: 'gate',
    icon: 'remove-circle-outline',
    toggle: 'gateOn',
    params: [p('gateThreshold', -80, 0, -50, 'db', 1), p('gateRange', -80, 0, -40, 'db', 1), p('gateAttack', 0.1, 50, 1, 'ms', 0.1), p('gateRelease', 10, 2000, 150, 'ms', 5)],
  },
  {
    id: 'eq',
    icon: 'options-outline',
    toggle: 'eqOn',
    params: [
      p('eqHpFreq', 20, 1000, 20, 'hz', 1),
      p('eqLpFreq', 1000, 20000, 20000, 'hz', 10),
      p('eqLowFreq', 30, 500, 120, 'hz', 1),
      p('eqLowGain', -18, 18, 0, 'db', 0.5),
      p('eqB1Freq', 40, 16000, 250, 'hz', 1),
      p('eqB1Gain', -18, 18, 0, 'db', 0.5),
      p('eqB1Q', 0.3, 10, 1, 'q', 0.1),
      p('eqB2Freq', 40, 16000, 1000, 'hz', 1),
      p('eqB2Gain', -18, 18, 0, 'db', 0.5),
      p('eqB2Q', 0.3, 10, 1, 'q', 0.1),
      p('eqB3Freq', 40, 16000, 4000, 'hz', 1),
      p('eqB3Gain', -18, 18, 0, 'db', 0.5),
      p('eqB3Q', 0.3, 10, 1, 'q', 0.1),
      p('eqHighFreq', 1500, 16000, 8000, 'hz', 10),
      p('eqHighGain', -18, 18, 0, 'db', 0.5),
    ],
  },
  {
    id: 'comp',
    icon: 'contract-outline',
    toggle: 'compOn',
    params: [
      p('compThreshold', -60, 0, -18, 'db', 0.5),
      p('compRatio', 1, 20, 3, 'ratio', 0.1),
      p('compAttack', 0.1, 200, 10, 'ms', 0.1),
      p('compRelease', 10, 2000, 150, 'ms', 5),
      p('compKnee', 0, 24, 6, 'db', 0.5),
      p('compMakeup', 0, 24, 0, 'db', 0.5),
    ],
  },
  { id: 'dist', icon: 'flame-outline', toggle: 'distOn', params: [p('distDrive', 0, 40, 12, 'db', 0.5), p('distTone', 0, 1, 0.6, 'pct', 0.01), p('distMix', 0, 1, 1, 'pct', 0.01)] },
  { id: 'crush', icon: 'grid-outline', toggle: 'crushOn', params: [p('crushBits', 2, 16, 8, 'bits', 1), p('crushRate', 1000, 48000, 11025, 'hz', 25), p('crushMix', 0, 1, 1, 'pct', 0.01)] },
  { id: 'ring', icon: 'radio-button-on-outline', toggle: 'ringOn', params: [p('ringFreq', 5, 2000, 40, 'hz', 1), p('ringMix', 0, 1, 0.5, 'pct', 0.01)] },
  { id: 'band', icon: 'call-outline', toggle: 'bandOn', params: [p('bandLow', 50, 3000, 300, 'hz', 5), p('bandHigh', 1000, 12000, 3400, 'hz', 10)] },
  {
    id: 'chorus',
    icon: 'people-outline',
    toggle: 'choOn',
    params: [p('choRate', 0.05, 8, 0.8, 'hzLfo', 0.05), p('choDepth', 0, 1, 0.5, 'pct', 0.01), p('choFeedback', 0, 0.9, 0, 'pct', 0.01), p('choMix', 0, 1, 0.5, 'pct', 0.01)],
  },
  {
    id: 'delay',
    icon: 'repeat-outline',
    toggle: 'dlyOn',
    params: [
      p('dlyTime', 10, 2000, 350, 'ms', 5),
      p('dlyFeedback', 0, 0.95, 0.35, 'pct', 0.01),
      p('dlyDamp', 0, 1, 0.3, 'pct', 0.01),
      p('dlyMix', 0, 1, 0.3, 'pct', 0.01),
      { ...flag('dlyPingPong') },
    ],
  },
  {
    id: 'reverb',
    icon: 'business-outline',
    toggle: 'revOn',
    params: [p('revSize', 0, 1, 0.5, 'pct', 0.01), p('revDamping', 0, 1, 0.5, 'pct', 0.01), p('revPreDelay', 0, 250, 20, 'ms', 1), p('revMix', 0, 1, 0.25, 'pct', 0.01)],
  },
  { id: 'widen', icon: 'resize-outline', toggle: 'widOn', params: [p('widWidth', 0, 2, 1.4, 'pct', 0.01)] },
  { id: 'gain', icon: 'volume-high-outline', toggle: null, params: [p('gainDb', -24, 12, 0, 'db', 0.5)] },
  { id: 'limiter', icon: 'pause-outline', toggle: 'limOn', params: [p('limCeiling', -12, 0, -1, 'db', 0.1), p('limRelease', 10, 1000, 80, 'ms', 5)] },
];

/** Tüm parametreler (bayraklar dahil), yerel dizideki sırayla; ardından 'pitch'. */
export const AUDIO_FX_PARAMS = (() => {
  const out = [];
  for (const e of AUDIO_FX_EFFECTS) {
    if (e.id === 'pitch') continue;
    if (e.toggle) out.push(flag(e.toggle));
    out.push(...e.params);
  }
  out.push(AUDIO_FX_EFFECTS[0].params[0]);
  return out;
})();

/** Yerel AudioFxChain.KEYS ile aynı sıra (perde hariç). */
export const NATIVE_KEYS = AUDIO_FX_PARAMS.filter((x) => x.key !== 'pitch').map((x) => x.key);

const PARAM_BY_KEY = Object.fromEntries(AUDIO_FX_PARAMS.map((x) => [x.key, x]));
export const AUDIO_FX_DEFAULTS = Object.fromEntries(AUDIO_FX_PARAMS.map((x) => [x.key, x.default]));

export function paramDef(key) {
  return PARAM_BY_KEY[key] || null;
}

export function effectById(id) {
  return AUDIO_FX_EFFECTS.find((e) => e.id === id) || null;
}

/** Değeri sınırlar içine alır ve adıma yuvarlar (adım yoksa 4 ondalık). */
export function clampParam(key, value) {
  const d = PARAM_BY_KEY[key];
  if (!d) return undefined;
  let v = Number(value);
  if (!Number.isFinite(v)) v = d.default;
  v = Math.max(d.min, Math.min(d.max, v));
  if (d.step) v = Math.round(v / d.step) * d.step;
  v = Math.max(d.min, Math.min(d.max, v));
  return Math.round(v * 10000) / 10000;
}

// --- Ön ayar yazımı için kısa yardımcılar (yalnızca varsayılandan farklı değerler) ---
const eq = (o) => {
  const r = { eqOn: 1 };
  if (o.hp != null) r.eqHpFreq = o.hp;
  if (o.lp != null) r.eqLpFreq = o.lp;
  if (o.low) [r.eqLowFreq, r.eqLowGain] = o.low;
  if (o.high) [r.eqHighFreq, r.eqHighGain] = o.high;
  for (const b of [1, 2, 3]) {
    const v = o[`b${b}`];
    if (v) [r[`eqB${b}Freq`], r[`eqB${b}Gain`], r[`eqB${b}Q`]] = [v[0], v[1], v[2] ?? 1];
  }
  return r;
};
const comp = (threshold, ratio, attack = 10, release = 150, knee = 6, makeup = 0) => ({
  compOn: 1, compThreshold: threshold, compRatio: ratio, compAttack: attack, compRelease: release, compKnee: knee, compMakeup: makeup,
});
const gate = (threshold, range = -40, attack = 1, release = 150) => ({ gateOn: 1, gateThreshold: threshold, gateRange: range, gateAttack: attack, gateRelease: release });
const dist = (drive, tone = 0.6, mix = 1) => ({ distOn: 1, distDrive: drive, distTone: tone, distMix: mix });
const crush = (bits, rate, mix = 1) => ({ crushOn: 1, crushBits: bits, crushRate: rate, crushMix: mix });
const ring = (freq, mix = 0.5) => ({ ringOn: 1, ringFreq: freq, ringMix: mix });
const band = (low, high) => ({ bandOn: 1, bandLow: low, bandHigh: high });
const chorus = (rate, depth, feedback = 0, mix = 0.5) => ({ choOn: 1, choRate: rate, choDepth: depth, choFeedback: feedback, choMix: mix });
const delay = (time, feedback, damp = 0.3, mix = 0.3, pingPong = 0) => ({ dlyOn: 1, dlyTime: time, dlyFeedback: feedback, dlyDamp: damp, dlyMix: mix, dlyPingPong: pingPong });
const reverb = (size, damping = 0.5, preDelay = 20, mix = 0.25) => ({ revOn: 1, revSize: size, revDamping: damping, revPreDelay: preDelay, revMix: mix });
const widen = (width) => ({ widOn: 1, widWidth: width });
const lim = (ceiling = -1, release = 80) => ({ limOn: 1, limCeiling: ceiling, limRelease: release });
const pitch = (st) => ({ pitch: st });
const gain = (db) => ({ gainDb: db });

export const AUDIO_PRESET_CATEGORIES = ['voice', 'music', 'fx', 'cleanup'];

/** Ön ayarlar. Adlar: audioFx.preset.<id> (src/i18n/packs/audio). */
export const AUDIO_PRESETS = [
  // --- Ses / konuşma ---
  { id: 'podcast', category: 'voice', icon: 'mic-outline', params: { ...gate(-55, -20, 2, 200), ...eq({ hp: 80, b1: [250, -3, 1], b3: [3500, 3, 0.8], high: [10000, 2] }), ...comp(-22, 3, 8, 150, 6, 6), ...lim(-1) } },
  { id: 'broadcast', category: 'voice', icon: 'radio-outline', params: { ...eq({ hp: 60, low: [120, 4], b2: [2500, 3, 1] }), ...comp(-26, 5, 3, 100, 6, 9), ...dist(4, 0.9, 0.3), ...lim(-1) } },
  { id: 'telephone', category: 'voice', icon: 'call-outline', params: { ...band(300, 3400), ...eq({ b2: [1500, 4, 1] }), ...comp(-24, 4, 5, 120, 6, 4), ...dist(10, 0.6, 0.4), ...crush(12, 8000, 1), ...lim(-1) } },
  { id: 'megaphone', category: 'voice', icon: 'megaphone-outline', params: { ...band(500, 4000), ...eq({ b2: [1800, 6, 1.5] }), ...comp(-20, 6, 2, 80, 3, 3), ...dist(22, 0.55, 1), ...lim(-1) } },
  { id: 'deepVoice', category: 'voice', icon: 'arrow-down-circle-outline', params: { ...pitch(-4), ...eq({ low: [150, 3] }), ...comp(-20, 3, 10, 150, 6, 3), ...lim(-1) } },
  { id: 'monster', category: 'voice', icon: 'skull-outline', params: { ...pitch(-8), ...eq({ low: [120, 5], b2: [900, -3, 1] }), ...dist(8, 0.4, 0.6), ...reverb(0.3, 0.6, 10, 0.15), ...lim(-1) } },
  { id: 'chipmunk', category: 'voice', icon: 'happy-outline', params: { ...pitch(7), ...eq({ hp: 120 }) } },
  { id: 'helium', category: 'voice', icon: 'balloon-outline', params: { ...pitch(4), ...eq({ hp: 150, high: [6000, 3] }), ...chorus(1.2, 0.2, 0, 0.25) } },
  { id: 'robot', category: 'voice', icon: 'hardware-chip-outline', params: { ...chorus(0.1, 0, 0.85, 0.5), ...crush(6, 12000, 0.7), ...ring(60, 0.5), ...comp(-20, 4, 5, 100, 6, 4), ...lim(-1) } },
  { id: 'whisper', category: 'voice', icon: 'ear-outline', params: { ...eq({ hp: 300, b1: [300, -6, 1], high: [6000, 6] }), ...comp(-30, 4, 5, 120, 6, 8), ...reverb(0.25, 0.6, 5, 0.1), ...lim(-1) } },
  { id: 'narrator', category: 'voice', icon: 'book-outline', params: { ...eq({ hp: 50, low: [100, 3], b3: [5000, 2, 1] }), ...comp(-20, 2.5, 15, 200, 8, 3), ...reverb(0.2, 0.7, 5, 0.08), ...lim(-1) } },
  { id: 'vlog', category: 'voice', icon: 'videocam-outline', params: { ...eq({ hp: 100, b2: [3000, 3, 1], high: [9000, 3] }), ...comp(-18, 4, 3, 90, 4, 5), ...lim(-1) } },
  { id: 'onStage', category: 'voice', icon: 'mic-circle-outline', params: { ...eq({ hp: 90, b2: [2000, 2, 1] }), ...comp(-20, 3, 8, 150, 6, 4), ...delay(120, 0.1, 0.5, 0.15), ...reverb(0.6, 0.5, 25, 0.22), ...lim(-1) } },

  // --- Müzik ---
  { id: 'warm', category: 'music', icon: 'sunny-outline', params: { ...eq({ low: [150, 3], high: [8000, -2] }), ...comp(-16, 2, 30, 300, 10, 1), ...dist(3, 0.5, 0.25), ...lim(-0.5) } },
  { id: 'bright', category: 'music', icon: 'sparkles-outline', params: { ...eq({ hp: 30, b3: [3000, 2, 1], high: [6000, 5] }), ...lim(-0.5) } },
  { id: 'bassBoost', category: 'music', icon: 'pulse-outline', params: { ...eq({ low: [100, 7], b1: [50, 3, 1] }), ...lim(-0.5, 120) } },
  { id: 'lofi', category: 'music', icon: 'cafe-outline', params: { ...eq({ hp: 120, lp: 5000 }), ...crush(10, 16000, 1), ...dist(6, 0.3, 0.5), ...chorus(0.4, 0.3, 0, 0.3), ...widen(0.6), ...lim(-1) } },
  { id: 'vinyl', category: 'music', icon: 'disc-outline', params: { ...eq({ hp: 40, lp: 9000, b2: [1000, 2, 0.7] }), ...dist(5, 0.6, 0.3), ...crush(12, 22050, 0.4), ...chorus(0.55, 0.15, 0, 0.2), ...widen(0.8), ...lim(-1) } },
  { id: 'liveHall', category: 'music', icon: 'musical-notes-outline', params: { ...reverb(0.75, 0.4, 30, 0.3), ...widen(1.2), ...lim(-1) } },
  { id: 'smallRoom', category: 'music', icon: 'home-outline', params: { ...reverb(0.2, 0.6, 5, 0.2) } },
  { id: 'cathedral', category: 'music', icon: 'business-outline', params: { ...reverb(0.95, 0.2, 60, 0.45), ...eq({ hp: 60 }), ...lim(-1) } },
  { id: 'stadium', category: 'music', icon: 'football-outline', params: { ...comp(-18, 3, 10, 150, 6, 2), ...delay(280, 0.2, 0.6, 0.15), ...reverb(0.85, 0.5, 90, 0.35), ...widen(1.5), ...lim(-1) } },
  { id: 'club', category: 'music', icon: 'flash-outline', params: { ...eq({ low: [80, 5], b2: [1000, -2, 0.8], high: [10000, 3] }), ...comp(-14, 4, 20, 120, 6, 3), ...lim(-0.3) } },
  { id: 'acoustic', category: 'music', icon: 'leaf-outline', params: { ...eq({ b1: [200, -2, 1], b3: [5000, 2, 1] }), ...comp(-20, 2, 20, 250, 8, 2), ...reverb(0.35, 0.5, 15, 0.15) } },
  { id: 'chiptune', category: 'music', icon: 'game-controller-outline', params: { ...eq({ hp: 150 }), ...crush(4, 8000, 1), ...lim(-1) } },
  { id: 'wideStereo', category: 'music', icon: 'expand-outline', params: { ...widen(1.8), ...chorus(0.3, 0.2, 0, 0.2) } },
  { id: 'popVocal', category: 'music', icon: 'star-outline', params: { ...eq({ hp: 100, b1: [300, -2, 1], high: [10000, 3] }), ...comp(-22, 4, 5, 120, 6, 6), ...delay(250, 0.2, 0.5, 0.12, 1), ...reverb(0.5, 0.4, 30, 0.2), ...lim(-1) } },
  { id: 'dreamy', category: 'music', icon: 'cloudy-night-outline', params: { ...chorus(0.5, 0.6, 0, 0.4), ...reverb(0.8, 0.3, 40, 0.4), ...eq({ high: [8000, -2] }), ...lim(-1) } },
  { id: 'punchy', category: 'music', icon: 'fitness-outline', params: { ...comp(-18, 2.5, 30, 120, 6, 4), ...eq({ low: [90, 2], b2: [2500, 1.5, 1] }), ...lim(-0.3, 60) } },

  // --- Efekt ---
  { id: 'echoCanyon', category: 'fx', icon: 'triangle-outline', params: { ...delay(600, 0.5, 0.4, 0.45), ...reverb(0.6, 0.5, 20, 0.2), ...lim(-1) } },
  { id: 'slapback', category: 'fx', icon: 'play-forward-outline', params: { ...delay(110, 0.1, 0.2, 0.35) } },
  { id: 'underwater', category: 'fx', icon: 'water-outline', params: { ...eq({ lp: 1000, low: [200, 4] }), ...chorus(0.3, 0.7, 0, 0.5), ...reverb(0.5, 0.9, 10, 0.3), ...lim(-1) } },
  { id: 'muffled', category: 'fx', icon: 'volume-low-outline', params: { ...eq({ lp: 1200 }), ...reverb(0.3, 0.7, 5, 0.25), ...gain(-3) } },
  { id: 'walkieTalkie', category: 'fx', icon: 'walk-outline', params: { ...gate(-40, -60, 1, 80), ...band(500, 2800), ...comp(-25, 6, 3, 100, 6, 6), ...dist(18, 0.4, 0.8), ...crush(8, 8000, 0.6), ...lim(-1) } },
  { id: 'cave', category: 'fx', icon: 'moon-outline', params: { ...eq({ low: [150, 3] }), ...delay(230, 0.3, 0.6, 0.2), ...reverb(0.9, 0.7, 40, 0.5), ...lim(-1) } },
  { id: 'alien', category: 'fx', icon: 'planet-outline', params: { ...pitch(3), ...ring(420, 0.6), ...chorus(3, 0.6, 0.5, 0.5), ...reverb(0.5, 0.5, 20, 0.2), ...lim(-1) } },
  { id: 'sciFi', category: 'fx', icon: 'rocket-outline', params: { ...pitch(-2), ...ring(90, 0.4), ...chorus(0.15, 0.4, 0.8, 0.5), ...delay(60, 0.3, 0.2, 0.25, 1), ...lim(-1) } },
  { id: 'ghost', category: 'fx', icon: 'snow-outline', params: { ...eq({ hp: 300 }), ...chorus(0.2, 0.8, 0, 0.5), ...delay(400, 0.4, 0.5, 0.3, 1), ...reverb(0.95, 0.4, 120, 0.6), ...lim(-1) } },
  { id: 'spaceEcho', category: 'fx', icon: 'infinite-outline', params: { ...delay(375, 0.55, 0.5, 0.4, 1), ...widen(1.3), ...lim(-1) } },
  { id: 'flanger', category: 'fx', icon: 'swap-vertical-outline', params: { ...chorus(0.25, 1, 0.7, 0.5), ...lim(-1) } },
  { id: 'vibrato', category: 'fx', icon: 'git-merge-outline', params: { ...chorus(5, 0.4, 0, 1) } },
  { id: 'tremolo', category: 'fx', icon: 'stats-chart-outline', params: { ...ring(6, 0.5) } },
  { id: 'oldRadio', category: 'fx', icon: 'time-outline', params: { ...band(200, 4500), ...dist(12, 0.5, 0.6), ...crush(8, 11025, 0.5), ...widen(0), ...reverb(0.1, 0.8, 0, 0.1), ...lim(-1) } },
  { id: 'fuzz', category: 'fx', icon: 'bonfire-outline', params: { ...eq({ low: [120, 2] }), ...comp(-20, 4, 5, 100, 6, 0), ...dist(36, 0.4, 1), ...lim(-1) } },
  { id: 'demon', category: 'fx', icon: 'flame-outline', params: { ...pitch(-12), ...dist(10, 0.4, 0.5), ...reverb(0.7, 0.5, 20, 0.3), ...lim(-1) } },

  // --- Temizleme ---
  { id: 'deMud', category: 'cleanup', icon: 'color-filter-outline', params: { ...eq({ hp: 70, b1: [300, -5, 1.2], b3: [3000, 1.5, 1] }) } },
  { id: 'deEss', category: 'cleanup', icon: 'cut-outline', params: { ...eq({ b3: [6500, -6, 3], high: [10000, -2] }), ...comp(-24, 2, 2, 60, 6, 1) } },
  { id: 'rumbleCut', category: 'cleanup', icon: 'trending-down-outline', params: { ...eq({ hp: 100 }) } },
  { id: 'loudness', category: 'cleanup', icon: 'speedometer-outline', params: { ...comp(-24, 3, 10, 200, 10, 9), ...lim(-1, 100) } },
  { id: 'silenceGate', category: 'cleanup', icon: 'volume-mute-outline', params: { ...gate(-45, -50, 0.5, 120), ...eq({ hp: 60 }) } },
  { id: 'clarity', category: 'cleanup', icon: 'bulb-outline', params: { ...eq({ hp: 100, b1: [250, -3, 1], b2: [2500, 4, 0.8], high: [8000, 2] }), ...comp(-20, 2.5, 10, 150, 6, 2), ...lim(-1) } },
  { id: 'humCut', category: 'cleanup', icon: 'flash-off-outline', params: { ...eq({ b1: [50, -18, 8], b2: [100, -12, 8], b3: [150, -8, 8] }) } },
  { id: 'windCut', category: 'cleanup', icon: 'leaf-outline', params: { ...eq({ hp: 150, low: [300, -4] }), ...comp(-20, 3, 2, 100, 6, 2), ...lim(-1) } },
  { id: 'loudBoost', category: 'cleanup', icon: 'volume-high-outline', params: { ...gain(9), ...lim(-1, 60) } },
];

const PRESET_BY_ID = Object.fromEntries(AUDIO_PRESETS.map((x) => [x.id, x]));

export function audioPresetById(id) {
  return PRESET_BY_ID[id] || null;
}

/** Ön ayar parametreleri (varsayılanlardan farklı olanlar), sınırlara kırpılmış. */
export function presetParams(id) {
  const pr = PRESET_BY_ID[id];
  if (!pr) return {};
  const out = {};
  for (const [k, v] of Object.entries(pr.params)) out[k] = clampParam(k, v);
  return out;
}

/** Varsayılandan farklı olmayan değerleri atar (durum küçük kalır). */
function sparse(params) {
  const out = {};
  for (const [k, v] of Object.entries(params || {})) {
    const c = clampParam(k, v);
    if (c !== undefined && c !== AUDIO_FX_DEFAULTS[k]) out[k] = c;
  }
  return out;
}

/** Yeni ses efekti durumu; presetId verilmezse hiçbir efekt yok. */
export function createAudioFx(presetId = null) {
  if (!presetId || !PRESET_BY_ID[presetId]) return { preset: null, params: {} };
  return { preset: presetId, params: sparse(presetParams(presetId)) };
}

export const applyAudioPreset = (_fx, presetId) => createAudioFx(presetId);

/** Tek parametreyi değiştirir (ön ayar kimliği korunur; isPresetModified ile değişiklik görülür). */
export function setAudioFxParam(fx, key, value) {
  if (!PARAM_BY_KEY[key]) return fx || createAudioFx();
  const base = fx || createAudioFx();
  return { preset: base.preset ?? null, params: sparse({ ...base.params, [key]: value }) };
}

/** Efekti aç/kapat. Bayraksız efektlerde (perde, kazanç) kapatmak varsayılana döndürür. */
export function setAudioEffectOn(fx, effectId, on) {
  const e = effectById(effectId);
  if (!e) return fx || createAudioFx();
  if (e.toggle) return setAudioFxParam(fx, e.toggle, on ? 1 : 0);
  if (on) return fx || createAudioFx();
  let next = fx || createAudioFx();
  for (const prm of e.params) next = setAudioFxParam(next, prm.key, prm.default);
  return next;
}

/** Tüm parametrelerin tam değer haritası. */
export function audioFxValues(fx) {
  const out = { ...AUDIO_FX_DEFAULTS };
  for (const [k, v] of Object.entries(fx?.params || {})) {
    const c = clampParam(k, v);
    if (c !== undefined) out[k] = c;
  }
  return out;
}

export function isEffectOn(fx, effectId) {
  const e = effectById(effectId);
  if (!e) return false;
  const v = audioFxValues(fx);
  if (e.toggle) return v[e.toggle] >= 0.5;
  return e.params.some((prm) => v[prm.key] !== prm.default);
}

/** Herhangi bir efekt etkin mi (perde, kazanç dahil)? */
export function isAudioFxActive(fx) {
  return AUDIO_FX_EFFECTS.some((e) => isEffectOn(fx, e.id));
}

/** Seçili ön ayardan sonra kullanıcı bir değeri değiştirdi mi? */
export function isPresetModified(fx) {
  if (!fx?.preset) return false;
  const a = sparse(fx.params);
  const b = sparse(presetParams(fx.preset));
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) if (a[k] !== b[k]) return true;
  return false;
}

/** Yarım ton → Sonic perde oranı. */
export function pitchRatio(semitones) {
  return Math.pow(2, (Number(semitones) || 0) / 12);
}

/**
 * Yerel motorun okuduğu düz tanım (render tanımında klip/ses öğesinin `audioFx`
 * alanı). Etkin efekt yoksa null (işlemci hiç eklenmez). Tüm anahtarlar sayıdır;
 * bayraklar 0/1. Kotlin: parseAudioFx(o.optJSONObject("audioFx")).
 */
export function audioFxSpec(fx) {
  if (!fx || !isAudioFxActive(fx)) return null;
  const v = audioFxValues(fx);
  const out = {};
  for (const key of NATIVE_KEYS) out[key] = v[key];
  out.pitch = v.pitch;
  return out;
}
