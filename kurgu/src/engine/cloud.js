// Bulut isteklerinin ağ tarafı. Saf kısımlar src/model/cloud.js'dedir (birim testli).
import * as FS from 'expo-file-system/legacy';
import { loadSettings } from '../storage/settings';
import { CloudError, buildGenerateRequest, normalizeServerUrl, parseGenerateResponse } from '../model/cloud';

export { CloudError };

/** Yapılandırılmış sunucu adresi ya da null (özellik kapalı). */
export async function cloudServer() {
  const s = await loadSettings();
  return normalizeServerUrl(s.cloudServerUrl);
}

/** Metinden görsel üretir; dosyayı outBase (uzantısız) yoluna yazar. Zaman aşımı 90 sn. */
export async function generateImage(prompt, width, height, outBase) {
  const server = await cloudServer();
  if (!server) throw new CloudError('CLOUD_NOT_CONFIGURED');
  const body = buildGenerateRequest(prompt, width, height);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 90000);
  let res;
  let json = null;
  try {
    res = await fetch(`${server}/v1/image/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal });
    json = await res.json().catch(() => null);
  } catch (e) {
    throw new CloudError(e?.name === 'AbortError' ? 'CLOUD_TIMEOUT' : 'CLOUD_NETWORK');
  } finally {
    clearTimeout(timer);
  }
  const img = parseGenerateResponse(res.status, json);
  const path = `${outBase}.${img.ext}`;
  await FS.writeAsStringAsync(path, img.base64, { encoding: FS.EncodingType.Base64 });
  return { path, mime: img.mime, width: body.width, height: body.height };
}
