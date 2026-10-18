import { TEXT_LAYOUTS } from './catalog';
import { createMainClip, createProject, createText } from './schema';

/** Şablon + seçilen medya -> gerçek, düzenlenebilir proje. Saf fonksiyon. */
export function projectFromTemplate(template, media, { name, resolution = 1080, fps = 30, textFor = (k) => k }) {
  const p = createProject({ name, ratio: template.ratio, resolution, fps });
  for (const m of media) p.media[m.id] = m;
  const visual = media.filter((m) => m.kind !== 'audio');
  p.main = template.slots.map((slot, i) => {
    const m = visual[i % visual.length];
    const clip = createMainClip(m, { imageDurationMs: slot });
    if (m.kind === 'video') {
      // Kaynağın ortasından şablon süresi kadar al
      const dur = m.durationMs || slot;
      const len = Math.min(dur, slot);
      const start = Math.max(0, Math.floor((dur - len) / 2));
      clip.srcIn = start;
      clip.srcOut = start + len;
    }
    clip.filter = { id: template.filter, intensity: 0.8 };
    if (i > 0) clip.transition = { type: template.transition, durationMs: 500 };
    return clip;
  });
  p.texts = template.texts.map((tx) => {
    const lay = TEXT_LAYOUTS.find((l) => l.id === tx.layout);
    const item = createText(tx.at, textFor(lay.textKey), lay.style);
    return { ...item, duration: tx.duration, y: lay.y, animIn: lay.animIn, animOut: lay.animOut };
  });
  return p;
}
