// Tanılama raporu (Ayarlar > Tanılama raporu): kullanıcının telefonundaki gerçek ölçümler tek
// metin olarak paylaşılır. Kişisel veri yok: dosya adı, proje adı ve konum yazılmaz; yalnızca
// cihaz modeli, medya biçimleri ve uygulamanın süre / sayı ölçümleri.

const JS_MAX = 150;
const jsLines = [];
let installed = false;

function stamp() {
  const d = new Date();
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}

/** `[Kurgu…]` ile başlayan konsol satırlarını bellekte tutar (son 150). Bir kez kurulur. */
export function installConsoleCapture(target = console) {
  if (installed) return;
  installed = true;
  for (const level of ['log', 'warn', 'error']) {
    const orig = target[level]?.bind(target);
    if (!orig) continue;
    target[level] = (...args) => {
      const first = typeof args[0] === 'string' ? args[0] : '';
      if (first.includes('[Kurgu')) recordJs(`${level === 'log' ? 'I' : level === 'warn' ? 'W' : 'E'} ${args.map(String).join(' ')}`);
      orig(...args);
    };
  }
}

export function recordJs(line) {
  jsLines.push(`${stamp()} ${String(line).slice(0, 400)}`);
  if (jsLines.length > JS_MAX) jsLines.splice(0, jsLines.length - JS_MAX);
}

export function jsSnapshot() {
  return jsLines.slice();
}

const mb = (bytes) => (bytes > 0 ? `${(bytes / 1048576).toFixed(1)} MB` : '?');

/**
 * Rapor metni. `device`: yerel diagnostics() sonucu (null olabilir); `media`: [{ kind, width,
 * height, durationMs, frameRate, hdr, mimeType, size, codec, bitrate, keyframes }];
 * `settings`: { previewQuality }; `jsLines` / `nativeLines`: ölçüm satırları.
 */
export function formatReport({ version, device, media = [], settings = {}, jsLines: js = [], nativeLines, maxChars = 14000 }) {
  const out = [];
  out.push(`Kurgu ${version || '?'} diagnostics`);
  if (device) {
    out.push(`device: ${device.manufacturer || '?'} ${device.model || '?'} · Android ${device.release || '?'} (SDK ${device.sdk}) · ${device.hardware || '?'} · ${device.cores} cores`);
    out.push(`memory: ${device.ramMb} MB total, ${device.availMb} MB free, heap ${device.heapMb} MB${device.lowRam ? ', low-RAM device' : ''}`);
  } else {
    out.push('device: native diagnostics unavailable');
  }
  out.push(`preview quality: ${settings.previewQuality || 'auto'}`);
  out.push(`media in latest project: ${media.length}`);
  media.forEach((m, i) => {
    const parts = [`#${i + 1} ${m.kind}`];
    if (m.width && m.height) parts.push(`${m.width}x${m.height}`);
    if (m.durationMs) parts.push(`${(m.durationMs / 1000).toFixed(1)} s`);
    if (m.frameRate) parts.push(`${Math.round(m.frameRate)} fps`);
    if (m.codec || m.mimeType) parts.push(m.codec || m.mimeType);
    if (m.bitrate) parts.push(`${(m.bitrate / 1e6).toFixed(1)} Mbps`);
    if (m.hdr) parts.push('HDR');
    if (m.size) parts.push(mb(m.size));
    if (m.keyframes) parts.push(`keyframes ${m.keyframes.syncCount} in ${(m.keyframes.spanMs / 1000).toFixed(1)} s, max gap ${m.keyframes.maxGapMs} ms`);
    out.push(parts.join(' · '));
  });
  const native = nativeLines || device?.lines || [];
  const head = out.join('\n');
  // Satırlar sondan kırpılmaz, baştan kırpılır: en yeni ölçümler kalır.
  const budget = Math.max(1000, maxChars - head.length - 64);
  const fit = (lines, share) => {
    const room = Math.floor(budget * share);
    const kept = [];
    let used = 0;
    for (let i = lines.length - 1; i >= 0; i--) {
      used += lines[i].length + 1;
      if (used > room) break;
      kept.unshift(lines[i]);
    }
    return kept;
  };
  const n = fit(native, 0.65);
  const j = fit(js, 0.35);
  return [head, '', `--- native (${n.length}/${native.length})`, ...n, '', `--- js (${j.length}/${js.length})`, ...j].join('\n');
}
