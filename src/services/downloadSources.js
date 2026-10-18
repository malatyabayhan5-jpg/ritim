// Bir parçanın hangi kaynaktan geldiğine göre indirme seçeneklerini yükleyen tek giriş noktası.
// YouTube içerikleri için indirme yoktur (YouTube'un resmi API'si buna izin vermez).
import { getTrackOptions } from '../api/archive';
import { getDownloadOptions } from './mediaService';
import { extFromUrl, isVideoExt } from './audioFormat';
import { finalizeOptions } from './formats';
import { YOUTUBE_DOWNLOAD_BLOCK } from './youtubeService';

export function canDownload(track) {
  if (!track) return false;
  if (track.source === 'youtube' || track.source === 'local') return false;
  return true;
}

// İndirme menüsünün açılabildiği içerikler (YouTube'da menü açılır ama seçenekler engel nedeniyle kapalıdır)
export function canOpenDownloadMenu(track) {
  return !!track && track.source !== 'local';
}

export async function loadOptionsFor(track) {
  if (track && track.source === 'youtube') return { video: [], audio: [], blockedReason: YOUTUBE_DOWNLOAD_BLOCK };
  if (!canDownload(track)) return { video: [], audio: [] };
  if (track.source === 'server') {
    return getDownloadOptions({ id: track.itemId || String(track.id).replace(/^srv:/, '').split('#')[0] });
  }
  if (track.source === 'url') {
    const ext = track.ext || extFromUrl(track.url) || 'mp3';
    const kind = isVideoExt(ext) ? 'video' : 'audio';
    return finalizeOptions([
      { key: `${kind}-link`, kind, label: ext.toUpperCase(), detail: 'Linkteki dosya', ext, url: track.url, size: null, original: true },
    ]);
  }
  // Internet Archive (varsayılan)
  return getTrackOptions(track);
}
