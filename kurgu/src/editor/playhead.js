// Oynatma kafası konumu: React durumu yerine abonelikli küçük bir depo. Önizleme konumu
// oynatma ve kaydırma sırasında saniyede ~60 kez gelir; durum olarak tutulduğunda editör
// ekranının tamamı (zaman çizelgesi, araç çubuğu, paneller) her seferinde yeniden çizilip
// gerçek cihazda donmaya yol açıyordu. Artık yalnızca konuma ihtiyaç duyan küçük bileşenler
// (zaman göstergesi, tutamaçlar) abone olur; zaman çizelgesi kaydırmayı doğrudan yapar.

import { useEffect, useState } from 'react';

export function createPlayhead(initial = 0) {
  let ms = initial;
  const subs = new Set();
  return {
    get: () => ms,
    set(v) {
      if (v === ms) return;
      ms = v;
      for (const f of subs) f(v);
    },
    subscribe(f) {
      subs.add(f);
      return () => subs.delete(f);
    },
  };
}

/**
 * Konumu bileşen durumuna yansıtır. `stepMs` > 0 ise yalnızca o adımın katı değişince
 * yeniden çizilir (ör. zaman göstergesi 100 ms). `enabled` false iken son değer korunur;
 * yeniden açılınca güncel konuma eşitlenir.
 */
export function usePlayhead(store, { stepMs = 0, enabled = true } = {}) {
  const [value, setValue] = useState(store.get());
  useEffect(() => {
    if (!enabled) return undefined;
    const bucket = (v) => (stepMs > 0 ? Math.floor(v / stepMs) : v);
    let last = bucket(store.get());
    setValue(store.get());
    return store.subscribe((v) => {
      const b = bucket(v);
      if (b === last) return;
      last = b;
      setValue(v);
    });
  }, [store, stepMs, enabled]);
  return value;
}

/** Çocuğu konumla çizen küçük sarmalayıcı: `{(ms) => ...}`. */
export function PlayheadValue({ store, stepMs = 0, children }) {
  const ms = usePlayhead(store, { stepMs });
  return children(ms);
}
