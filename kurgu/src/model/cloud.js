// Bulut AI bağlantısı (isteğe bağlı). Uygulama hiçbir API anahtarı taşımaz: istekler
// kullanıcının ayarlarda girdiği kendi sunucusuna (server/ klasöründeki örnek vekil
// sunucu gibi) gider; anahtar yalnızca o sunucuda tutulur. Sunucu adresi yoksa veya
// HTTPS değilse özellik kapalıdır — sahte sonuç üretilmez.

export const CLOUD_PROTOCOL = 1;
export const PROMPT_MAX = 1000;

/** Ayardaki adresi doğrular; geçersizse null. Yalnızca https (yerel geliştirme için http://localhost). */
export function normalizeServerUrl(raw) {
  const s = String(raw || '').trim().replace(/\/+$/, '');
  if (!s) return null;
  if (!/^https:\/\/[^\s/]+/i.test(s) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(s)) return null;
  return s;
}

/** Görsel üretme isteği (gövde). Kanvas oranı korunur, uzun kenar ≤ 1536. */
export function buildGenerateRequest(prompt, width, height) {
  const text = String(prompt || '').trim();
  if (!text) throw new CloudError('CLOUD_EMPTY_PROMPT');
  if (text.length > PROMPT_MAX) throw new CloudError('CLOUD_PROMPT_TOO_LONG');
  const k = Math.min(1, 1536 / Math.max(width || 1024, height || 1024));
  const r8 = (v) => Math.max(64, Math.round((v * k) / 8) * 8);
  return { protocol: CLOUD_PROTOCOL, task: 'image.generate', prompt: text, width: r8(width || 1024), height: r8(height || 1024) };
}

/** Sunucu yanıtı: { imageBase64, mime } — eksik/bozuksa hata (başarı gibi gösterilmez). */
export function parseGenerateResponse(status, body) {
  if (status === 401 || status === 403) throw new CloudError('CLOUD_UNAUTHORIZED');
  if (status === 429) throw new CloudError('CLOUD_RATE_LIMIT');
  if (status < 200 || status >= 300) throw new CloudError('CLOUD_HTTP', String(status));
  const b64 = body && typeof body.imageBase64 === 'string' ? body.imageBase64 : '';
  const mime = body?.mime === 'image/png' ? 'image/png' : body?.mime === 'image/jpeg' ? 'image/jpeg' : null;
  if (!mime || b64.length < 100 || !/^[A-Za-z0-9+/=\s]+$/.test(b64.slice(0, 200))) throw new CloudError('CLOUD_BAD_RESPONSE');
  return { base64: b64.replace(/\s+/g, ''), mime, ext: mime === 'image/png' ? 'png' : 'jpg' };
}

export class CloudError extends Error {
  constructor(code, detail) {
    super(detail ? `${code} ${detail}` : code);
    this.code = code;
  }
}
