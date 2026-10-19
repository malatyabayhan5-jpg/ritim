// Merkezi efekt kataloğu (fx-catalog.json) yardımcıları. Katalog; efektin
// kimliğini, shader dosyasını, kategorisini, parametrelerini (varsayılan ve
// sınırlar), performans sınıfını, lisansını ve platformlarını tutar. Adlar,
// açıklamalar ve parametre etiketleri i18n dosyalarındaki `fx` bölümündedir.
// Yeni efekt eklemek: GLSL dosyası + katalog satırı + üç dilde ad.

import catalog from './fx-catalog.json';
import pack2 from './fx-pack2.json';
import { newId } from './schema';
import { packTrack } from './keyframes';

export const FX_CATALOG = [...catalog.effects, ...pack2.effects];

export const FX_CATEGORIES = FX_CATALOG.reduce((acc, e) => (acc.includes(e.category) ? acc : [...acc, e.category]), []);

export function effectById(id) {
  return FX_CATALOG.find((e) => e.id === id) || null;
}

export function defaultValues(effect) {
  const v = {};
  (effect?.params || []).forEach((p) => {
    v[p.key] = p.default;
  });
  return v;
}

/** Shader'a giden 8 parametre (uP0, uP1). Eksik değerler varsayılanla doldurulur. */
export function paramsArray(effect, values = {}) {
  const out = new Array(8).fill(0);
  (effect?.params || []).forEach((p, i) => {
    const v = values[p.key];
    out[p.slot ?? i] = clamp(typeof v === 'number' ? v : p.default, p.min ?? 0, p.max ?? 1);
  });
  return out;
}

export function createEffectInstance(effectId) {
  const effect = effectById(effectId);
  return { id: newId('fx'), effectId, amount: 1, values: defaultValues(effect) };
}

export function createEffectLayer(effectId, start, duration = 3000) {
  return { ...createEffectInstance(effectId), start: Math.max(0, Math.round(start)), duration };
}

/** Örnek kimliğinden kararlı tohum: önizleme ve dışa aktarma aynı rastgeleliği kullanır. */
export function seedOf(id) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

export function effectRenderSpec(inst, startMs, endMs, key = inst.id) {
  const effect = effectById(inst.effectId);
  if (!effect) return null;
  return {
    key,
    shader: effect.shader,
    heavy: effect.perf === 'heavy',
    amount: clamp(inst.amount ?? 1, 0, 1),
    params: paramsArray(effect, inst.values).map((v) => Math.round(v * 1000) / 1000),
    seed: seedOf(inst.id),
    startMs: Math.round(startMs),
    endMs: Math.round(endMs),
    // Yoğunluk anahtar kareleri (efekt başlangıcına göre); kfOriginMs pencere genişletilse de sabit kalır
    kfAmount: packTrack(inst.keyframes?.amount),
    kfOriginMs: Math.round(startMs),
  };
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}
