import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { buildGenerateRequest, normalizeServerUrl, parseGenerateResponse } from '../src/model/cloud';
import { createProxy } from '../server/image-proxy.mjs';

test('sunucu adresi: yalnızca https (yerel geliştirmede localhost http)', () => {
  assert.equal(normalizeServerUrl(' https://ai.example.com/ '), 'https://ai.example.com');
  assert.equal(normalizeServerUrl('http://ai.example.com'), null, 'şifresiz bağlantı reddedilir');
  assert.equal(normalizeServerUrl('http://localhost:8787'), 'http://localhost:8787');
  assert.equal(normalizeServerUrl(''), null);
  assert.equal(normalizeServerUrl('javascript:alert(1)'), null);
});

test('istek ve yanıt doğrulaması: boş istem, hatalı yanıt ve HTTP hataları başarı sayılmaz', () => {
  assert.throws(() => buildGenerateRequest('  ', 100, 100), /CLOUD_EMPTY_PROMPT/);
  const r = buildGenerateRequest('kedi', 4000, 3000);
  assert.deepEqual([r.width, r.height], [1536, 1152]);
  assert.throws(() => parseGenerateResponse(200, { imageBase64: 'x', mime: 'image/png' }), /CLOUD_BAD_RESPONSE/);
  assert.throws(() => parseGenerateResponse(200, null), /CLOUD_BAD_RESPONSE/);
  assert.throws(() => parseGenerateResponse(401, {}), /CLOUD_UNAUTHORIZED/);
  assert.throws(() => parseGenerateResponse(500, {}), /CLOUD_HTTP 500/);
  const ok = parseGenerateResponse(200, { imageBase64: 'iVBOR' + 'A'.repeat(200), mime: 'image/png' });
  assert.equal(ok.ext, 'png');
});

const listen = (srv) => new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv.address().port)));

test('örnek vekil sunucu: anahtar yalnızca sunucuda, istek doğrulama, hız sınırı (sahte sağlayıcıyla)', async () => {
  let seenAuth = null;
  const upstream = createServer((req, res) => {
    seenAuth = req.headers.authorization;
    let b = '';
    req.on('data', (c) => (b += c));
    req.on('end', () => {
      const j = JSON.parse(b);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: [{ b64_json: 'iVBOR' + 'B'.repeat(300), size: j.size }] }));
    });
  });
  const up = await listen(upstream);
  const proxy = createProxy({ upstream: `http://127.0.0.1:${up}`, apiKey: 'sunucu-anahtari', perMinute: 3 });
  const port = await listen(proxy);
  const call = (body) => fetch(`http://127.0.0.1:${port}/v1/image/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    const res = await call(buildGenerateRequest('deniz kenarında fener', 1080, 1350));
    assert.equal(res.status, 200);
    const img = parseGenerateResponse(res.status, await res.json());
    assert.equal(img.mime, 'image/png');
    assert.equal(seenAuth, 'Bearer sunucu-anahtari', 'anahtar sağlayıcıya sunucudan eklenir');
    assert.equal((await call({ task: 'image.generate', prompt: '', width: 512, height: 512 })).status, 400);
    assert.equal((await call({ task: 'image.generate', prompt: 'x', width: 512, height: 512 })).status, 200);
    assert.equal((await call({ task: 'image.generate', prompt: 'x', width: 512, height: 512 })).status, 429, 'dakikada 3 istek sınırı');
  } finally {
    proxy.close();
    upstream.close();
  }
});
