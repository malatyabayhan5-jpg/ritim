// Medya içe aktarma: Android Photo Picker / iOS Photos Picker (expo-image-picker)
// ve dosya seçici (expo-document-picker). Seçilen dosyalar kütüphaneye alınır,
// yerel motorla incelenir; desteklenmeyen dosyalar açıklamalı hata ile döner.
// Ayrıca .cube LUT dosyaları doğrulanıp kütüphaneye alınır.

import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { ROOT, adoptFile } from './library';
import * as FS from 'expo-file-system/legacy';
import { probe, isEngineAvailable } from '../engine/engine';
import { LutError, lutDisplayName, parseCube } from '../model/lut';

export class ImportError extends Error {
  constructor(code, name) {
    super(code);
    this.code = code;
    this.fileName = name;
  }
}

/** Galeriden çoklu seçim. Sıra korunur. */
export async function pickFromGallery({ images = true, videos = true, multiple = true } = {}) {
  const mediaTypes = [...(videos ? ['videos'] : []), ...(images ? ['images'] : [])];
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes,
    allowsMultipleSelection: multiple,
    selectionLimit: multiple ? 0 : 1,
    orderedSelection: true,
    quality: 1,
    exif: false,
    base64: false,
    videoExportPreset: ImagePicker.VideoExportPreset?.Passthrough,
    preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode?.Current,
  });
  if (res.canceled) return [];
  return res.assets.map((a) => ({
    uri: a.uri,
    name: a.fileName || a.uri.split('/').pop(),
    mimeType: a.mimeType,
    size: a.fileSize,
    kind: a.type === 'video' ? 'video' : 'image',
    width: a.width,
    height: a.height,
    durationMs: a.duration || 0,
  }));
}

/** Dosya yöneticisinden seçim (video, görsel veya ses). */
export async function pickFiles(kind = 'any', multiple = true) {
  const type = { audio: ['audio/*'], visual: ['video/*', 'image/*'], any: ['video/*', 'image/*', 'audio/*'] }[kind] || ['*/*'];
  const res = await DocumentPicker.getDocumentAsync({ type, multiple, copyToCacheDirectory: true });
  if (res.canceled) return [];
  return res.assets.map((a) => ({
    uri: a.uri,
    name: a.name,
    mimeType: a.mimeType,
    size: a.size,
    kind: (a.mimeType || '').startsWith('audio/') ? 'audio' : (a.mimeType || '').startsWith('image/') ? 'image' : 'video',
  }));
}

/**
 * Seçilen öğeleri kütüphaneye alır ve medya kaydı üretir. Hatalı dosyalar
 * atlanır; `errors` listesinde kod ve dosya adıyla döner.
 */
export async function importPicked(items, onProgress) {
  const media = [];
  const errors = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    onProgress?.(i, items.length, it.name);
    try {
      const adopted = await adoptFile(it.uri, it.name, it.mimeType);
      const info = isEngineAvailable ? await probe(ROOT + adopted.path).catch(() => null) : null;
      const entry = describe(it, adopted, info);
      media.push(entry);
    } catch (e) {
      errors.push({ code: e.code || 'IMPORT_FAILED', name: it.name });
    }
  }
  onProgress?.(items.length, items.length, null);
  return { media, errors };
}

function describe(item, adopted, info) {
  let kind = item.kind;
  if (info?.kind) kind = info.kind === 'audio' && item.kind !== 'audio' ? 'audio' : info.kind;
  if (kind === 'video' && info && info.hasVideo === false) kind = 'audio';
  if (kind === 'video' && info && info.videoDecodable === false) throw new ImportError('UNSUPPORTED_CODEC', item.name);
  if ((kind === 'video' || kind === 'audio') && info && !(info.durationMs > 0)) throw new ImportError('UNREADABLE', item.name);
  return {
    id: adopted.id,
    kind,
    path: adopted.path,
    name: item.name,
    size: adopted.size || item.size || 0,
    mimeType: info?.mimeType || item.mimeType || null,
    durationMs: Math.round(info?.durationMs || item.durationMs || 0),
    width: info?.width || item.width || 0,
    height: info?.height || item.height || 0,
    hasAudio: kind === 'image' ? false : info ? !!info.hasAudio : true,
    frameRate: info?.frameRate || null,
    hdr: !!info?.hdr,
    importedAt: Date.now(),
  };
}

/**
 * .cube LUT seçer, doğrular ve kütüphaneye kopyalar. İptalde null döner.
 * Geçersiz dosyada `LutError` (kod: LUT_1D, LUT_SIZE, LUT_DATA, LUT_FORMAT, LUT_EMPTY) fırlatır.
 */
export async function importLutFile() {
  const res = await DocumentPicker.getDocumentAsync({ type: ['*/*'], multiple: false, copyToCacheDirectory: true });
  if (res.canceled || !res.assets?.length) return null;
  const a = res.assets[0];
  if (!/\.cube$/i.test(a.name || '')) throw new LutError('LUT_FORMAT', 'extension');
  if ((a.size || 0) > 20e6) throw new LutError('LUT_SIZE', 'file');
  const parsed = parseCube(await FS.readAsStringAsync(a.uri));
  const stored = await adoptFile(a.uri, a.name, 'text/plain');
  return { id: stored.id, path: stored.path, name: lutDisplayName(a.name, parsed.title), size: parsed.size };
}
