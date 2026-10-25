// Otomatik altyazı: konuşma tanıma bölümlerini (kaynak zamanı) okunabilir altyazı
// metin katmanlarına dönüştürür. Saf fonksiyonlar; birim testlidir. Tanınan metin
// kullanıcı içeriğidir, çevrilmez.

import { DEFAULT_TEXT_STYLE, createText } from './schema';
import { clipDuration, mainLayout } from './timeline';
import { TEXT_LAYOUTS } from './catalog';
import { localAt } from './speed';

const CAPTION = TEXT_LAYOUTS.find((l) => l.id === 'caption');

// Altyazı stilleri (Kurgu'nun kendi görünümleri): otomatik altyazı panelinde seçilir, tüm
// altyazılara uygulanır ve sonra eklenenler için projede (captionStyle) hatırlanır.
export const CAPTION_STYLES = [
  { id: 'classic', y: CAPTION.y, style: { ...CAPTION.style } },
  { id: 'clean', y: -0.78, style: { size: 0.04, background: '#00000000', bold: true, shadow: true } },
  { id: 'outline', y: -0.78, style: { size: 0.042, background: '#00000000', stroke: '#000000FF', strokeWidth: 0.006, shadow: false, bold: true } },
  { id: 'yellow', y: -0.78, style: { size: 0.044, color: '#FFD400FF', background: '#00000000', stroke: '#000000FF', strokeWidth: 0.005, shadow: false, bold: true } },
  { id: 'boxed', y: -0.75, style: { size: 0.04, color: '#111111FF', background: '#FFFFFFFF', boxStyle: 'lines', boxRadius: 0.2, shadow: false, bold: true } },
  { id: 'neon', y: -0.78, style: { size: 0.042, background: '#00000000', shadow: true, shadowColor: '#22D3EEFF', shadowBlur: 0.25, shadowX: 0, shadowY: 0, bold: true } },
  { id: 'big', y: -0.55, style: { size: 0.06, background: '#00000000', stroke: '#000000FF', strokeWidth: 0.007, shadow: false, bold: true } },
  { id: 'top', y: 0.78, style: { ...CAPTION.style } },
];
export const CAPTION_STYLE_IDS = CAPTION_STYLES.map((c) => c.id);

/** Projenin altyazı stili (yoksa klasik). */
export function captionStyleOf(project) {
  return CAPTION_STYLES.find((c) => c.id === project?.captionStyle) || CAPTION_STYLES[0];
}

/** Stili tüm altyazılara uygular (görünüm ve dikey konum; metin, zaman ve animasyon korunur). */
export function applyCaptionStyle(project, styleId) {
  const c = CAPTION_STYLES.find((x) => x.id === styleId);
  if (!c) return project;
  const texts = project.texts.map((t) => (t.caption ? { ...t, style: { ...DEFAULT_TEXT_STYLE, ...c.style }, y: c.y } : t));
  return { ...project, texts, captionStyle: c.id, updatedAt: Date.now() };
}

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
  const look = captionStyleOf(project);
  const texts = [];
  for (const c of captionChunks(segments, opts)) {
    const s = start + localAt(clip, clip.srcIn + c.t0);
    const e = Math.min(start + dur, start + localAt(clip, clip.srcIn + c.t1));
    if (e - s < 200 || s >= start + dur) continue;
    const t = createText(Math.round(s), c.text, { ...look.style });
    texts.push({ ...t, duration: Math.round(e - s), y: look.y, animIn: 'fade', animOut: 'fade', animMs: 150, caption: true });
  }
  if (!texts.length) return { project, added: 0 };
  return { project: { ...project, texts: [...project.texts, ...texts], updatedAt: Date.now() }, added: texts.length };
}

export function removeCaptions(project) {
  const texts = project.texts.filter((t) => !t.caption);
  return texts.length === project.texts.length ? project : { ...project, texts, updatedAt: Date.now() };
}

export const hasCaptions = (project) => project.texts.some((t) => t.caption);

// --- Toplu düzenleme (altyazı listesinde çoklu seçim) ---

const isCap = (ids) => (t) => t.caption && ids.has(t.id);

/** Seçili altyazıları siler. */
export function deleteCaptions(project, ids) {
  const set = new Set(ids);
  const texts = project.texts.filter((t) => !isCap(set)(t));
  return texts.length === project.texts.length ? project : { ...project, texts, updatedAt: Date.now() };
}

/**
 * Seçili altyazılarda bul ve değiştir (büyük/küçük harf duyarsız, Türkçe kurallarıyla
 * değil düz eşleme; aranan metin düzenli ifade olarak yorumlanmaz). Değişen satır sayısını döner.
 */
export function replaceInCaptions(project, ids, find, replace) {
  if (!find) return { project, changed: 0 };
  const set = new Set(ids);
  const re = new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  let changed = 0;
  const texts = project.texts.map((t) => {
    if (!isCap(set)(t)) return t;
    const next = t.text.replace(re, replace);
    if (next === t.text) return t;
    changed++;
    return { ...t, text: next };
  });
  return changed ? { project: { ...project, texts, updatedAt: Date.now() }, changed } : { project, changed: 0 };
}

/** Kaynak altyazının stilini (ve konumunu) seçili altyazılara uygular. */
export function matchCaptionStyle(project, sourceId, ids) {
  const src = project.texts.find((t) => t.id === sourceId);
  if (!src) return project;
  const set = new Set(ids);
  set.delete(sourceId);
  const texts = project.texts.map((t) => (isCap(set)(t) ? { ...t, style: { ...src.style }, x: src.x, y: src.y, scale: src.scale, animIn: src.animIn, animOut: src.animOut } : t));
  return { ...project, texts, updatedAt: Date.now() };
}

/** Altyazı çıkarılabilecek klipler: sesi olan video klipler. */
export function captionableClips(project) {
  return project.main.filter((c) => c.kind === 'video' && !c.muted && project.media[c.mediaId]?.hasAudio !== false);
}

// --- SRT (SubRip) ---

const pad = (n, w = 2) => String(n).padStart(w, '0');

/** ms -> "HH:MM:SS,mmm" */
export function srtTime(ms) {
  const t = Math.max(0, Math.round(ms));
  const h = Math.floor(t / 3600000);
  const m = Math.floor((t % 3600000) / 60000);
  const s = Math.floor((t % 60000) / 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(t % 1000, 3)}`;
}

/**
 * Projedeki metinlerden SRT üretir. `onlyCaptions` true ise yalnızca altyazılar,
 * değilse tüm metin katmanları (zamana göre sıralı). Satır sonları korunur.
 */
export function toSrt(project, { onlyCaptions = true } = {}) {
  const items = project.texts
    .filter((t) => (onlyCaptions ? t.caption : true) && String(t.text || '').trim())
    .sort((a, b) => a.start - b.start);
  return items
    .map((t, i) => `${i + 1}\n${srtTime(t.start)} --> ${srtTime(t.start + t.duration)}\n${String(t.text).replace(/\r/g, '').trim()}\n`)
    .join('\n');
}

/** SRT metnini ayrıştırır: [{ start, end, text }] (ms). Bozuk bloklar atlanır; WebVTT zaman biçimi de kabul edilir. */
export function parseSrt(text) {
  const out = [];
  const blocks = String(text || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n').split(/\n\s*\n/);
  const time = /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/;
  const ms = (h, m, s, f) => ((+h * 60 + +m) * 60 + +s) * 1000 + Math.round(+f.padEnd(3, '0'));
  for (const b of blocks) {
    const lines = b.split('\n').filter((l) => l.trim() !== '');
    const i = lines.findIndex((l) => time.test(l));
    if (i < 0) continue;
    const m = lines[i].match(time);
    const start = ms(m[1], m[2], m[3], m[4]);
    const end = ms(m[5], m[6], m[7], m[8]);
    const body = lines.slice(i + 1).join('\n').replace(/<[^>]+>/g, '').trim();
    if (!body || end <= start) continue;
    out.push({ start, end, text: body });
  }
  return out;
}

/** SRT girdilerini altyazı metin katmanları olarak ekler (videonun dışına taşanlar kırpılır). */
export function addSrtCaptions(project, entries, total = Infinity) {
  const look = captionStyleOf(project);
  const texts = [];
  for (const e of entries) {
    if (e.start >= total) continue;
    const end = Math.min(e.end, total);
    if (end - e.start < 100) continue;
    const tx = createText(e.start, e.text, look.style);
    texts.push({ ...tx, duration: Math.round(end - e.start), y: look.y, animIn: 'fade', animOut: 'fade', animMs: 150, caption: true });
  }
  return { project: { ...project, texts: [...project.texts, ...texts], updatedAt: Date.now() }, added: texts.length };
}
