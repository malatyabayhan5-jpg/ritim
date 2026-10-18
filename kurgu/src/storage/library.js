// Proje kütüphanesi: projeler, içe aktarılan medya, yedekler ve önbellek.
//
// documentDirectory/kurgu/
//   projects/<id>/project.json      güncel proje (atomik yazılır)
//   projects/<id>/project.bak.json  bir önceki kayıt (kurtarma için)
//   projects/<id>/cover.jpg          kapak küçük resmi
//   media/<mediaId>.<ext>            içe aktarılan medya (galeri önbelleğinden taşınır)
//   exports/                         dışa aktarılan videolar
// cacheDirectory/kurgu/thumbs, waves  yeniden üretilebilir önbellek

import * as FS from 'expo-file-system/legacy';
import { migrateProject, newId } from '../model/schema';

export const ROOT = `${FS.documentDirectory}kurgu/`;
export const PROJECTS_DIR = `${ROOT}projects/`;
export const MEDIA_DIR = `${ROOT}media/`;
export const EXPORTS_DIR = `${ROOT}exports/`;
export const CACHE_DIR = `${FS.cacheDirectory}kurgu/`;
export const THUMBS_DIR = `${CACHE_DIR}thumbs/`;
export const WAVES_DIR = `${CACHE_DIR}waves/`;

let ensured = false;
export async function ensureDirs() {
  if (ensured) return;
  for (const d of [ROOT, PROJECTS_DIR, MEDIA_DIR, EXPORTS_DIR, CACHE_DIR, THUMBS_DIR, WAVES_DIR]) {
    const info = await FS.getInfoAsync(d);
    if (!info.exists) await FS.makeDirectoryAsync(d, { intermediates: true });
  }
  ensured = true;
}

export function mediaUri(media) {
  if (!media) return '';
  if (media.path) return ROOT + media.path;
  return media.uri || '';
}

export async function mediaExists(media) {
  const uri = mediaUri(media);
  if (!uri) return false;
  try {
    return (await FS.getInfoAsync(uri)).exists;
  } catch {
    return false;
  }
}

const projectDir = (id) => `${PROJECTS_DIR}${id}/`;

// --- Projeler ---

export async function listProjects() {
  await ensureDirs();
  const ids = await FS.readDirectoryAsync(PROJECTS_DIR);
  const out = [];
  for (const id of ids) {
    const p = await loadProject(id).catch(() => null);
    if (!p) continue;
    const coverInfo = await FS.getInfoAsync(`${projectDir(id)}cover.jpg`);
    out.push({
      id: p.id,
      name: p.name,
      updatedAt: p.updatedAt,
      createdAt: p.createdAt,
      exportedAt: p.exportedAt,
      ratio: p.canvas.ratio,
      clips: p.main.length,
      durationMs: p.main.reduce((s, c) => s + (c.srcOut - c.srcIn) / (c.speed || 1), 0),
      cover: coverInfo.exists ? `${coverInfo.uri}?v=${p.coverVersion || 0}` : null,
      recovered: !!p._recovered,
    });
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function loadProject(id) {
  const dir = projectDir(id);
  try {
    const raw = await FS.readAsStringAsync(`${dir}project.json`);
    return migrateProject(JSON.parse(raw));
  } catch (e) {
    // Yarım kalmış yazma veya bozulma: önceki kayda dön.
    const bak = await FS.readAsStringAsync(`${dir}project.bak.json`);
    return { ...migrateProject(JSON.parse(bak)), _recovered: true };
  }
}

/** Atomik kayıt: önce geçici dosya, sonra eski kaydı yedeğe taşı, sonra yer değiştir. */
export async function saveProject(project) {
  await ensureDirs();
  const dir = projectDir(project.id);
  const info = await FS.getInfoAsync(dir);
  if (!info.exists) await FS.makeDirectoryAsync(dir, { intermediates: true });
  const { _recovered, ...clean } = project;
  const tmp = `${dir}project.tmp.json`;
  await FS.writeAsStringAsync(tmp, JSON.stringify(clean));
  const cur = await FS.getInfoAsync(`${dir}project.json`);
  if (cur.exists) {
    await FS.deleteAsync(`${dir}project.bak.json`, { idempotent: true });
    await FS.moveAsync({ from: `${dir}project.json`, to: `${dir}project.bak.json` });
  }
  await FS.moveAsync({ from: tmp, to: `${dir}project.json` });
}

export async function renameProject(id, name) {
  const p = await loadProject(id);
  await saveProject({ ...p, name, updatedAt: Date.now() });
}

export async function duplicateProject(id, nameSuffix) {
  const p = await loadProject(id);
  const copy = { ...p, id: newId('prj'), name: `${p.name} ${nameSuffix}`.trim(), createdAt: Date.now(), updatedAt: Date.now(), exportedAt: null };
  await saveProject(copy);
  const cover = `${projectDir(id)}cover.jpg`;
  if ((await FS.getInfoAsync(cover)).exists) await FS.copyAsync({ from: cover, to: `${projectDir(copy.id)}cover.jpg` });
  return copy.id;
}

/** Projeyi siler; başka projede kullanılmayan medya dosyalarını da temizler. */
export async function deleteProject(id) {
  const p = await loadProject(id).catch(() => null);
  await FS.deleteAsync(projectDir(id), { idempotent: true });
  if (p) await collectUnusedMedia();
}

export async function collectUnusedMedia() {
  const ids = await FS.readDirectoryAsync(PROJECTS_DIR);
  const used = new Set();
  for (const id of ids) {
    const p = await loadProject(id).catch(() => null);
    if (p) for (const m of Object.values(p.media)) if (m.path) used.add(m.path);
  }
  const files = await FS.readDirectoryAsync(MEDIA_DIR);
  let freed = 0;
  for (const f of files) {
    if (!used.has(`media/${f}`)) {
      const info = await FS.getInfoAsync(MEDIA_DIR + f);
      freed += info.size || 0;
      await FS.deleteAsync(MEDIA_DIR + f, { idempotent: true });
    }
  }
  return freed;
}

export async function setProjectCover(projectId, fromUri) {
  const dir = projectDir(projectId);
  await FS.deleteAsync(`${dir}cover.jpg`, { idempotent: true });
  await FS.copyAsync({ from: fromUri, to: `${dir}cover.jpg` });
}

/** Taşınabilir proje dosyası (medya dosyaları hariç; açılırken yeniden bağlanır). */
export async function writeProjectPackage(project) {
  await ensureDirs();
  const safe = (project.name || 'kurgu').replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 40);
  const uri = `${EXPORTS_DIR}${safe || 'kurgu'}.kurgu.json`;
  const { _recovered, ...clean } = project;
  await FS.writeAsStringAsync(uri, JSON.stringify({ ...clean, packagedAt: Date.now() }, null, 2));
  return uri;
}

export async function importProjectPackage(uri) {
  const raw = JSON.parse(await FS.readAsStringAsync(uri));
  const p = migrateProject(raw);
  const copy = { ...p, id: newId('prj'), updatedAt: Date.now() };
  await saveProject(copy);
  return copy.id;
}

// --- Medya ---

const EXT_BY_MIME = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'video/3gpp': '3gp',
  'video/x-matroska': 'mkv',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/gif': 'gif',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/x-wav': 'wav',
  'audio/wav': 'wav',
  'audio/ogg': 'ogg',
  'audio/flac': 'flac',
  'audio/opus': 'opus',
};

export function extensionFor(name, mime) {
  const fromName = (name || '').split('.').pop();
  if (fromName && fromName.length <= 5 && fromName !== name) return fromName.toLowerCase();
  return EXT_BY_MIME[mime] || 'bin';
}

/**
 * Seçilen dosyayı kütüphaneye alır. Galeri seçicisinin önbellek kopyası
 * taşınır (ek yer kaplamaz); diğer kaynaklar kopyalanır.
 */
export async function adoptFile(sourceUri, name, mime) {
  await ensureDirs();
  const id = newId('med');
  const ext = extensionFor(name, mime);
  const rel = `media/${id}.${ext}`;
  const dest = ROOT + rel;
  if (sourceUri.startsWith(FS.cacheDirectory || '\u0000')) {
    try {
      await FS.moveAsync({ from: sourceUri, to: dest });
    } catch {
      await FS.copyAsync({ from: sourceUri, to: dest });
    }
  } else {
    await FS.copyAsync({ from: sourceUri, to: dest });
  }
  const info = await FS.getInfoAsync(dest);
  return { id, path: rel, size: info.size || 0 };
}

export async function storageUsage() {
  await ensureDirs();
  const sizeOf = async (dir) => {
    let total = 0;
    const walk = async (d) => {
      for (const f of await FS.readDirectoryAsync(d)) {
        const info = await FS.getInfoAsync(d + f);
        if (info.isDirectory) await walk(`${d + f}/`);
        else total += info.size || 0;
      }
    };
    await walk(dir).catch(() => {});
    return total;
  };
  const [media, exports, cache, free] = await Promise.all([
    sizeOf(MEDIA_DIR),
    sizeOf(EXPORTS_DIR),
    sizeOf(CACHE_DIR),
    FS.getFreeDiskStorageAsync().catch(() => 0),
  ]);
  return { media, exports, cache, free };
}

/**
 * Uygulama içindeki dışa aktarma kopyalarını sınırlar: galeriye kaydedilen
 * videoların uygulama içi kopyaları en yeni `keep` tanesi dışında silinir.
 * Proje paketleri (.kurgu.json) dokunulmadan kalır.
 */
export async function pruneExports(keep = 2) {
  const names = (await FS.readDirectoryAsync(EXPORTS_DIR).catch(() => [])).filter((n) => n.toLowerCase().endsWith('.mp4'));
  const infos = await Promise.all(names.map((n) => FS.getInfoAsync(EXPORTS_DIR + n).then((i) => ({ uri: EXPORTS_DIR + n, time: i.modificationTime || 0 })).catch(() => null)));
  const old = infos.filter(Boolean).sort((a, b) => b.time - a.time).slice(keep);
  await Promise.all(old.map((f) => FS.deleteAsync(f.uri, { idempotent: true }).catch(() => {})));
  return old.length;
}

export async function clearCache() {
  await FS.deleteAsync(CACHE_DIR, { idempotent: true });
  await FS.deleteAsync(EXPORTS_DIR, { idempotent: true });
  ensured = false;
  await ensureDirs();
}

export async function freeDisk() {
  return FS.getFreeDiskStorageAsync().catch(() => Number.MAX_SAFE_INTEGER);
}
