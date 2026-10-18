// Geri al / yinele geçmişi. Proje nesneleri değişmez (immutable) olduğu için
// anlık görüntüleri saklamak ucuzdur: değişmeyen alt nesneler paylaşılır.

export const HISTORY_LIMIT = 100;

export function createHistory(present) {
  return { past: [], present, future: [] };
}

/** Yeni durum ekler. `coalesceKey` aynıysa (ör. kaydırıcı sürüklenirken) tek adımda birleştirir. */
export function pushHistory(h, next, coalesceKey = null) {
  if (next === h.present) return h;
  if (coalesceKey && h.lastKey === coalesceKey) {
    return { ...h, present: next, future: [] };
  }
  const past = [...h.past, h.present];
  if (past.length > HISTORY_LIMIT) past.shift();
  return { past, present: next, future: [], lastKey: coalesceKey };
}

export function undo(h) {
  if (!h.past.length) return h;
  const past = h.past.slice(0, -1);
  return { past, present: h.past[h.past.length - 1], future: [h.present, ...h.future], lastKey: null };
}

export function redo(h) {
  if (!h.future.length) return h;
  const [next, ...future] = h.future;
  return { past: [...h.past, h.present], present: next, future, lastKey: null };
}

export const canUndo = (h) => h.past.length > 0;
export const canRedo = (h) => h.future.length > 0;
