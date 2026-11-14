// Tanılama raporunu toplar (Ayarlar ve çökme sonrası ana ekran bandı kullanır).
import Constants from 'expo-constants';
import { listProjects, loadProject, mediaUri } from '../storage/library';
import { loadSettings } from '../storage/settings';
import { crashInfo, diagnostics, keyframeInfo, probe } from './engine';
import { formatReport, jsSnapshot } from './diagnostics';

export async function buildReport() {
  const [device, crash, settings] = await Promise.all([diagnostics(), crashInfo(), loadSettings()]);
  // Son düzenlenen projenin medya biçimleri (en çok 4 video için codec ve anahtar kare aralığı)
  const latest = (await listProjects().catch(() => []))[0];
  const project = latest ? await loadProject(latest.id).catch(() => null) : null;
  const media = [];
  let probed = 0;
  for (const m of Object.values(project?.media || {})) {
    const row = { kind: m.kind, width: m.width, height: m.height, durationMs: m.durationMs, frameRate: m.frameRate, hdr: m.hdr, mimeType: m.mimeType, size: m.size };
    if (m.kind === 'video' && probed < 4) {
      probed++;
      const uri = mediaUri(m);
      const info = await probe(uri).catch(() => null);
      row.codec = info?.videoCodec || null;
      row.bitrate = info?.bitrate || 0;
      row.keyframes = await keyframeInfo(uri);
    }
    media.push(row);
  }
  const shape = project
    ? { clips: project.main?.length || 0, overlays: project.overlays?.length || 0, audio: project.audio?.length || 0, texts: project.texts?.length || 0, effects: project.effectLayers?.length || 0, transitions: (project.main || []).filter((c) => c.transition).length }
    : null;
  const text = formatReport({ version: Constants.expoConfig?.version, device, media, settings, jsLines: jsSnapshot(), crash });
  return shape ? `${text}\n--- project shape\n${JSON.stringify(shape)}` : text;
}
