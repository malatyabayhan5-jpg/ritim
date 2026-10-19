// Kurgu bulut AI örnek vekil sunucusu (isteğe bağlı, bağımlılıksız Node.js).
//
// Neden: uygulama API anahtarı taşımaz. Bu sunucu anahtarı ortam değişkeninden okur,
// uygulamadan gelen isteği doğrular, sağlayıcıya iletir ve yalnızca görseli döndürür.
// Sağlayıcı tarafı "OpenAI Images API uyumlu" uç nokta biçimini kullanır
// (POST {UPSTREAM}/v1/images/generations, yanıt data[0].b64_json); farklı bir sağlayıcı
// için yalnızca callUpstream() değiştirilir.
//
// Çalıştırma:  KURGU_UPSTREAM=https://... KURGU_API_KEY=... KURGU_MODEL=... node server/image-proxy.mjs
// Uyarı: herkese açık yayında kullanıcı kimlik doğrulaması (ör. hesap girişi) eklenmelidir;
// bu örnek yalnızca IP başına hız sınırı uygular.
import { createServer } from 'node:http';

const MAX_BODY = 16 * 1024;

export function createProxy({ upstream, apiKey, model = '', perMinute = 6, fetchImpl = fetch } = {}) {
  if (!upstream || !apiKey) throw new Error('KURGU_UPSTREAM ve KURGU_API_KEY gerekli');
  const hits = new Map();
  const limited = (ip) => {
    const now = Date.now();
    const list = (hits.get(ip) || []).filter((t) => now - t < 60000);
    list.push(now);
    hits.set(ip, list);
    return list.length > perMinute;
  };
  const send = (res, status, obj) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(obj));
  };
  async function callUpstream(req) {
    const r = await fetchImpl(`${upstream.replace(/\/+$/, '')}/v1/images/generations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ ...(model ? { model } : {}), prompt: req.prompt, n: 1, size: `${req.width}x${req.height}`, response_format: 'b64_json' }),
    });
    if (!r.ok) return { status: r.status === 429 ? 429 : 502, body: { error: 'UPSTREAM_' + r.status } };
    const j = await r.json().catch(() => null);
    const b64 = j?.data?.[0]?.b64_json;
    if (typeof b64 !== 'string' || b64.length < 100) return { status: 502, body: { error: 'UPSTREAM_BAD_RESPONSE' } };
    const mime = b64.startsWith('iVBOR') ? 'image/png' : 'image/jpeg';
    return { status: 200, body: { imageBase64: b64, mime } };
  }
  return createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/v1/image/generate') return send(res, 404, { error: 'NOT_FOUND' });
    if (limited(req.socket.remoteAddress || '?')) return send(res, 429, { error: 'RATE_LIMIT' });
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) req.destroy();
      else chunks.push(c);
    });
    req.on('end', async () => {
      let body;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        return send(res, 400, { error: 'BAD_JSON' });
      }
      const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
      const w = Number(body?.width);
      const h = Number(body?.height);
      if (body?.task !== 'image.generate' || !prompt || prompt.length > 1000 || !(w >= 64 && w <= 2048 && h >= 64 && h <= 2048)) return send(res, 400, { error: 'BAD_REQUEST' });
      try {
        const out = await callUpstream({ prompt, width: Math.round(w), height: Math.round(h) });
        send(res, out.status, out.body);
      } catch {
        send(res, 502, { error: 'UPSTREAM_UNREACHABLE' });
      }
    });
  });
}

if (/image-proxy\.mjs$/.test(process.argv[1] || '')) {
  const port = Number(process.env.PORT || 8787);
  createProxy({ upstream: process.env.KURGU_UPSTREAM, apiKey: process.env.KURGU_API_KEY, model: process.env.KURGU_MODEL || '' }).listen(port, () => console.log(`kurgu image proxy :${port}`));
}
