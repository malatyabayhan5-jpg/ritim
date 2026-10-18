// Otomatik altyazı: konuşma tanıma bölümlerini (kaynak zamanı) okunabilir altyazı
// metin katmanlarına dönüştürür. Saf fonksiyonlar; birim testlidir. Tanınan metin
// kullanıcı içeriğidir, çevrilmez.

import { createText } from './schema';
import { clipDuration, mainLayout } from './timeline';
import { TEXT_LAYOUTS } from './catalog';

const CAPTION = TEXT_LAYOUTS.find((l) => l.id === 'caption');

// Konuşma dışı işaretler: [MUSIC], (alkış), *gülüşmeler*, ♪ … ♪
const NON_SPEECH = /^\s*(\[[^\]]*\]|\([^)]*\)|\*[^*]*\*|[♪♫\s]+)\s*$/;

/** Bölümleri temizler, birleştirir/böler: ekranda en fazla `maxChars` karakter, en az `minMs` süre. */
export function captionChunks(segments, { maxChars = 42, minMs = 700, maxMs = 6000 } = {}) {
  const clean = (segments || [])
    .map((s) => ({ t0: Math.max(0, s.t0), t1: Math.max(s.t0, s.t1), text: String(s.text || '').replace(/�/g, '').replace(/\s+/g, ' ').trim() }))
    .filter((s) => s.text && !NON_SPEECH.test(s.text) && s.t1 > s.t0);
  const out = [];
  for (const s of clean) {
    const prev = out[out.length - 1];
    // Çok kısa ve bitişik bölümleri bir önceki satıra ekle
    if (prev && s.t0 - prev.t1 < 250 && (prev.t1 - prev.t0 < minMs || s.t1 - s.t0 < minMs) && (prev.text + ' ' + s.text).length <= maxChars) {
      prev.text = `${prev.text} ${s.text}`;
      prev.t1 = s.t1;
      continue;
    }
    // Uzun bölümleri kelime sınırından, süreyi karakter oranında paylaştırarak böl
    if (s.text.length > maxChars || s.t1 - s.t0 > maxMs) {
      const words = s.text.split(' ');
      const parts = [];
      let line = '';
      for (const w of words) {
        if (line && (line + ' ' + w).length > maxChars) {
          parts.push(line);
          line = w;
        } else line = line ? `${line} ${w}` : w;
      }
      if (line) parts.push(line);
      const total = parts.reduce((n, p) => n + p.length, 0);
      let t = s.t0;
      parts.forEach((p, i) => {
        const end = i === parts.length - 1 ? s.t1 : t + ((s.t1 - s.t0) * p.length) / total;
        out.push({ t0: Math.round(t), t1: Math.round(end), text: p });
        t = end;
      });
      continue;
    }
    out.push({ ...s });
  }
  // Çok kısa kalanları bir sonrakinin başına kadar uzat (çakışmadan)
  for (let i = 0; i < out.length; i++) {
    const next = out[i + 1];
    if (out[i].t1 - out[i].t0 < minMs) out[i].t1 = Math.round(next ? Math.min(next.t0, out[i].t0 + minMs) : out[i].t0 + minMs);
  }
  return out;
}

/**
 * Bir ana klibin tanınan bölümlerini zaman çizelgesine altyazı olarak ekler.
 * Bölüm zamanları klibin kaynak başlangıcına (srcIn) göredir; hız hesaba katılır.
 */
export function addClipCaptions(project, clipId, segments, opts = {}) {
  const hit = mainLayout(project).find((l) => l.clip.id === clipId);
  if (!hit) return { project, added: 0 };
  const { clip, start } = hit;
  const dur = clipDuration(clip);
  const texts = [];
  for (const c of captionChunks(segments, opts)) {
    const s = start + c.t0 / clip.speed;
    const e = Math.min(start + dur, start + c.t1 / clip.speed);
    if (e - s < 200 || s >= start + dur) continue;
    const t = createText(Math.round(s), c.text, { ...CAPTION.style });
    texts.push({ ...t, duration: Math.round(e - s), y: CAPTION.y, animIn: 'fade', animOut: 'fade', animMs: 150, caption: true });
  }
  if (!texts.length) return { project, added: 0 };
  return { project: { ...project, texts: [...project.texts, ...texts], updatedAt: Date.now() }, added: texts.length };
}

export function removeCaptions(project) {
  const texts = project.texts.filter((t) => !t.caption);
  return texts.length === project.texts.length ? project : { ...project, texts, updatedAt: Date.now() };
}

export const hasCaptions = (project) => project.texts.some((t) => t.caption);

/** Altyazı çıkarılabilecek klipler: sesi olan video klipler. */
export function captionableClips(project) {
  return project.main.filter((c) => c.kind === 'video' && !c.muted && project.media[c.mediaId]?.hasAudio !== false);
}
