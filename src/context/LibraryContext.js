// Kütüphane ve yerel dosya yönetimi: favoriler, çalma listeleri, indirmeler.
//
// Not: expo-file-system'in "legacy" API'sini bilinçli olarak kullanıyoruz. SDK 54'teki yeni
// File/Directory API'si indirme ilerlemesi ve iptal desteği sunmuyor; legacy API SDK 54'te
// tam destekli ve createDownloadResumable ile ikisini de sağlıyor.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { resolveDownload } from '../services/mediaService';
import { AUDIO_EXTS, MEDIA_EXTS, base64ToBytes, decideFormat, extFromMime, extFromUrl, isVideoExt, sniffFormat } from '../services/audioFormat';

const STORAGE_KEY = 'ritim:library:v1';
const DOWNLOAD_DIR = FileSystem.documentDirectory + 'muzik/';
const MAX_RECENT = 30;

const LibraryContext = createContext(null);

function safeBase(id) {
  const base = String(id).replace(/\.[a-zA-Z0-9]{2,5}$/, '').replace(/[^a-zA-Z0-9._-]/g, '_');
  return base.length > 110 ? base.slice(base.length - 110) : base;
}

function hashString(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function titleFromUrl(url) {
  try {
    const path = String(url).split('?')[0].split('#')[0];
    const last = decodeURIComponent(path.split('/').pop() || '');
    const name = last.replace(/\.[a-zA-Z0-9]{2,5}$/, '').replace(/[_+]+/g, ' ').trim();
    return name || 'İsimsiz parça';
  } catch (e) {
    return 'İsimsiz parça';
  }
}

function titleFromFile(file) {
  return file.replace(/\.[a-zA-Z0-9]{2,5}$/, '').replace(/^(url|srv|local)_[a-z0-9]+_?/i, '').replace(/[_+]+/g, ' ').trim() || file;
}

function headerValue(headers, key) {
  if (!headers) return '';
  const k = Object.keys(headers).find((h) => h.toLowerCase() === key);
  return k ? String(headers[k]) : '';
}

export function isValidAudioUrl(text) {
  return /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(String(text || '').trim());
}

async function ensureDir() {
  const info = await FileSystem.getInfoAsync(DOWNLOAD_DIR);
  if (!info.exists) await FileSystem.makeDirectoryAsync(DOWNLOAD_DIR, { intermediates: true });
}

async function readHeadBytes(uri) {
  try {
    const b64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
      position: 0,
      length: 16,
    });
    return base64ToBytes(b64);
  } catch (e) {
    return [];
  }
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function friendlyError(e) {
  const msg = e && e.message ? e.message : 'İndirme başarısız oldu.';
  if (/network|failed to connect|unable to resolve|timed out|cleartext|connection/i.test(msg)) {
    return 'Sunucuya bağlanılamadı. İnternet bağlantını ve adresi kontrol et.';
  }
  return msg;
}

export function LibraryProvider({ children }) {
  const [loaded, setLoaded] = useState(false);
  const [favorites, setFavorites] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [downloads, setDownloads] = useState({}); // { [trackId]: { track, file, size, at } }
  const [recent, setRecent] = useState([]);
  const [progress, setProgress] = useState({}); // { [trackId]: 0..1 }
  const [pending, setPending] = useState({}); // { [trackId]: track } süren indirmeler
  const jobs = useRef({}); // { [trackId]: { job, cancelled } }

  // Açılışta: kayıtlı kütüphaneyi yükle, silinmiş dosyaları ayıkla,
  // klasörde olup kayıtta olmayan dosyaları yeniden keşfet.
  useEffect(() => {
    (async () => {
      let data = {};
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) data = JSON.parse(raw) || {};
      } catch (e) {
        console.warn('Kütüphane okunamadı', e);
      }
      setFavorites(Array.isArray(data.favorites) ? data.favorites : []);
      setPlaylists(Array.isArray(data.playlists) ? data.playlists : []);
      setRecent(Array.isArray(data.recent) ? data.recent : []);

      const stored = data.downloads && typeof data.downloads === 'object' ? data.downloads : {};
      const result = {};
      try {
        await ensureDir();
        const files = await FileSystem.readDirectoryAsync(DOWNLOAD_DIR);
        const onDisk = new Set(files);
        const known = new Set();
        Object.keys(stored).forEach((id) => {
          const entry = stored[id];
          if (entry && entry.file && onDisk.has(entry.file)) {
            result[id] = entry;
            known.add(entry.file);
          }
        });
        for (const file of files) {
          if (known.has(file)) continue;
          const ext = (file.split('.').pop() || '').toLowerCase();
          if (!MEDIA_EXTS.includes(ext)) continue;
          // eslint-disable-next-line no-await-in-loop
          const info = await FileSystem.getInfoAsync(DOWNLOAD_DIR + file);
          if (!info.exists || !info.size) continue;
          const id = `local:${file}`;
          result[id] = {
            track: {
              id,
              title: titleFromFile(file),
              artist: 'Bilinmeyen sanatçı',
              album: 'Cihazda bulunanlar',
              albumId: null,
              url: null,
              artwork: null,
              duration: 0,
              ext,
              kind: isVideoExt(ext) ? 'video' : 'audio',
              source: 'local',
            },
            file,
            size: info.size,
            at: info.modificationTime ? info.modificationTime * 1000 : Date.now(),
          };
        }
      } catch (e) {
        console.warn('İndirme klasörü taranamadı', e);
      }
      setDownloads(result);
      setLoaded(true);
    })();
  }, []);

  // Değişiklikleri kaydet
  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ favorites, playlists, downloads, recent })).catch((e) =>
      console.warn('Kütüphane kaydedilemedi', e)
    );
  }, [loaded, favorites, playlists, downloads, recent]);

  // Uygulama kapanırken süren indirmeleri durdur
  useEffect(
    () => () => {
      Object.values(jobs.current).forEach((j) => {
        try {
          j.job && j.job.cancelAsync();
        } catch (e) {
          // yoksay
        }
      });
    },
    []
  );

  const isFavorite = useCallback((id) => favorites.some((t) => t.id === id), [favorites]);

  const toggleFavorite = useCallback((track) => {
    setFavorites((prev) => (prev.some((t) => t.id === track.id) ? prev.filter((t) => t.id !== track.id) : [track, ...prev]));
  }, []);

  const addRecent = useCallback((track) => {
    setRecent((prev) => [track, ...prev.filter((t) => t.id !== track.id)].slice(0, MAX_RECENT));
  }, []);

  const createPlaylist = useCallback((name) => {
    const id = newId();
    const title = (name || '').trim() || 'Yeni çalma listesi';
    setPlaylists((prev) => [{ id, name: title, tracks: [], createdAt: Date.now() }, ...prev]);
    return id;
  }, []);

  const renamePlaylist = useCallback((id, name) => {
    const title = (name || '').trim();
    if (!title) return;
    setPlaylists((prev) => prev.map((p) => (p.id === id ? { ...p, name: title } : p)));
  }, []);

  const deletePlaylist = useCallback((id) => {
    setPlaylists((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const addToPlaylist = useCallback((playlistId, track) => {
    setPlaylists((prev) =>
      prev.map((p) => (p.id === playlistId && !p.tracks.some((t) => t.id === track.id) ? { ...p, tracks: [...p.tracks, track] } : p))
    );
  }, []);

  const removeFromPlaylist = useCallback((playlistId, trackId) => {
    setPlaylists((prev) => prev.map((p) => (p.id === playlistId ? { ...p, tracks: p.tracks.filter((t) => t.id !== trackId) } : p)));
  }, []);

  const getLocalUri = useCallback((id) => (downloads[id] ? DOWNLOAD_DIR + downloads[id].file : null), [downloads]);

  const isDownloaded = useCallback((id) => !!downloads[id], [downloads]);

  const clearJob = (id) => {
    delete jobs.current[id];
    setPending((p) => {
      const n = { ...p };
      delete n[id];
      return n;
    });
    setProgress((p) => {
      const n = { ...p };
      delete n[id];
      return n;
    });
  };

  // Ortak indirme çekirdeği. Sonuç: { ok, error?, cancelled? }
  // Başarılı sayılması için: HTTP < 400, boş olmayan dosya, tanınan ses biçimi.
  const runDownload = useCallback(async (track, headers, kind = 'audio') => {
    if (jobs.current[track.id]) return { ok: false, error: 'Bu dosya zaten indiriliyor.' };
    const slot = { job: null, cancelled: false };
    jobs.current[track.id] = slot;
    setPending((p) => ({ ...p, [track.id]: track }));
    setProgress((p) => ({ ...p, [track.id]: 0 }));

    const base = safeBase(track.id);
    const tmp = `${DOWNLOAD_DIR}${base}.part`;
    try {
      await ensureDir();
      const opts = headers && Object.keys(headers).length ? { headers } : {};
      slot.job = FileSystem.createDownloadResumable(track.url, tmp, opts, (e) => {
        const total = e.totalBytesExpectedToWrite;
        const ratio = total > 0 ? e.totalBytesWritten / total : 0;
        setProgress((p) => (p[track.id] === undefined ? p : { ...p, [track.id]: ratio }));
      });
      const res = await slot.job.downloadAsync();
      if (slot.cancelled) throw Object.assign(new Error('İndirme iptal edildi.'), { cancelled: true });
      if (!res) throw new Error('İndirme yarıda kesildi.');
      if (res.status && res.status >= 400) {
        throw new Error(`Sunucu ${res.status} hatası döndürdü. Adresin doğru ve erişilebilir olduğundan emin ol.`);
      }
      const info = await FileSystem.getInfoAsync(tmp);
      if (!info.exists || !info.size) throw new Error('İndirilen dosya boş.');
      if (info.size < 1024) throw new Error('İndirilen dosya bir medya dosyası olamayacak kadar küçük.');

      const mime = headerValue(res.headers, 'content-type');
      const sniffed = sniffFormat(await readHeadBytes(tmp));
      const ext = decideFormat({ sniffed, mime, expected: track.ext, kind });

      const file = `${base}.${ext}`;
      await FileSystem.deleteAsync(DOWNLOAD_DIR + file, { idempotent: true });
      await FileSystem.moveAsync({ from: tmp, to: DOWNLOAD_DIR + file });

      const saved = { ...track, ext, kind };
      setDownloads((d) => ({ ...d, [track.id]: { track: saved, file, size: info.size, at: Date.now() } }));
      return { ok: true, track: saved };
    } catch (e) {
      try {
        await FileSystem.deleteAsync(tmp, { idempotent: true });
      } catch (err) {
        // yoksay
      }
      if (slot.cancelled || (e && e.cancelled)) return { ok: false, cancelled: true, error: 'İndirme iptal edildi.' };
      console.warn('İndirme hatası', e);
      return { ok: false, error: friendlyError(e) };
    } finally {
      clearJob(track.id);
    }
  }, []);

  const cancelDownload = useCallback(async (id) => {
    const slot = jobs.current[id];
    if (!slot) return;
    slot.cancelled = true;
    try {
      if (slot.job) await slot.job.cancelAsync();
    } catch (e) {
      // yoksay
    }
  }, []);

  const downloadTrack = useCallback(async (track) => (await runDownload(track)).ok, [runDownload]);

  // Herhangi bir açık ses dosyası adresinden indir
  const downloadFromUrl = useCallback(
    async (rawUrl, meta = {}) => {
      const url = String(rawUrl || '').trim();
      if (!isValidAudioUrl(url)) return { ok: false, error: 'Geçerli bir link gir (http:// veya https:// ile başlamalı).' };
      const id = meta.id || `url:${hashString(url)}`;
      if (downloads[id]) return { ok: false, error: 'Bu dosya zaten indirilmiş.', exists: true };
      const track = {
        id,
        title: (meta.title || '').trim() || titleFromUrl(url),
        artist: (meta.artist || '').trim() || 'Bilinmeyen sanatçı',
        album: meta.album || 'Linkten indirilenler',
        albumId: null,
        url,
        artwork: meta.artwork || null,
        duration: meta.duration || 0,
        ext: extFromUrl(url) || 'mp3',
        kind: isVideoExt(extFromUrl(url)) ? 'video' : 'audio',
        source: meta.source || 'url',
      };
      const res = await runDownload(track, null, track.kind);
      return { ...res, track: res.track || track };
    },
    [downloads, runDownload]
  );

  // Arama servisindeki (mock ya da özel API) bir sonucu indir
  const downloadServerItem = useCallback(
    async (item) => {
      const id = `srv:${item.id}`;
      if (downloads[id]) return { ok: true, exists: true };
      if (jobs.current[id]) return { ok: false, error: 'Bu dosya zaten indiriliyor.' };
      let target;
      try {
        target = await resolveDownload(item);
      } catch (e) {
        return { ok: false, error: (e && e.message) || 'Sunucudan indirme adresi alınamadı.' };
      }
      const expected = (target.ext && AUDIO_EXTS.includes(String(target.ext).toLowerCase()) && String(target.ext).toLowerCase()) ||
        extFromMime(target.mimeType) ||
        extFromUrl(target.url) ||
        'mp3';
      const track = {
        id,
        title: item.title || 'İsimsiz parça',
        artist: item.artist || 'Arşivim',
        album: 'Arşivim',
        albumId: null,
        url: target.url,
        artwork: item.thumbnail || null,
        duration: item.duration || 0,
        ext: expected,
        license: item.license || null,
        source: 'server',
      };
      // Kimlik başlıkları yalnızca indirme sırasında kullanılır, telefonda saklanmaz
      const res = await runDownload(track, target.headers);
      return { ...res, track: res.track || track };
    },
    [downloads, runDownload]
  );

  // Kullanıcının menüden seçtiği bir biçimi indir (video ya da yalnızca ses)
  const downloadOption = useCallback(
    async (baseTrack, option) => {
      const baseId = baseTrack.baseId || baseTrack.id;
      const id = `${baseId}#${option.key === 'video-best' ? `video-${option.height || 'best'}` : option.key}`;
      if (downloads[id]) return { ok: false, exists: true, error: 'Bu biçim zaten indirilmiş.' };
      const track = {
        ...baseTrack,
        id,
        baseId,
        url: option.url,
        ext: option.ext,
        kind: option.kind,
        quality: option.best ? option.detail : option.label,
        source: baseTrack.source || 'archive',
      };
      delete track.headers;
      const res = await runDownload(track, option.headers, option.kind);
      return { ...res, track: res.track || track };
    },
    [downloads, runDownload]
  );

  // Bir içeriğin tüm indirilmiş biçimleri
  const downloadsFor = useCallback(
    (baseId) => Object.values(downloads).filter((d) => d.track.id === baseId || d.track.baseId === baseId),
    [downloads]
  );

  const updateDownloadInfo = useCallback((id, patch) => {
    const clean = {};
    if (patch.title && String(patch.title).trim()) clean.title = String(patch.title).trim();
    if (patch.artist && String(patch.artist).trim()) clean.artist = String(patch.artist).trim();
    if (typeof patch.duration === 'number' && isFinite(patch.duration) && patch.duration > 0) clean.duration = patch.duration;
    if (!Object.keys(clean).length) return;
    setDownloads((d) => (d[id] ? { ...d, [id]: { ...d[id], track: { ...d[id].track, ...clean } } } : d));
  }, []);

  const removeDownload = useCallback(
    async (id) => {
      const entry = downloads[id];
      if (!entry) return;
      try {
        await FileSystem.deleteAsync(DOWNLOAD_DIR + entry.file, { idempotent: true });
      } catch (e) {
        // yoksay
      }
      setDownloads((d) => {
        const next = { ...d };
        delete next[id];
        return next;
      });
    },
    [downloads]
  );

  const downloadList = useMemo(() => Object.values(downloads).sort((a, b) => (b.at || 0) - (a.at || 0)), [downloads]);

  const value = useMemo(
    () => ({
      loaded,
      favorites,
      playlists,
      recent,
      downloads,
      downloadList,
      progress,
      pending,
      isFavorite,
      toggleFavorite,
      addRecent,
      createPlaylist,
      renamePlaylist,
      deletePlaylist,
      addToPlaylist,
      removeFromPlaylist,
      getLocalUri,
      isDownloaded,
      downloadTrack,
      downloadFromUrl,
      downloadServerItem,
      downloadOption,
      downloadsFor,
      cancelDownload,
      updateDownloadInfo,
      removeDownload,
    }),
    [
      loaded,
      favorites,
      playlists,
      recent,
      downloads,
      downloadList,
      progress,
      pending,
      isFavorite,
      toggleFavorite,
      addRecent,
      createPlaylist,
      renamePlaylist,
      deletePlaylist,
      addToPlaylist,
      removeFromPlaylist,
      getLocalUri,
      isDownloaded,
      downloadTrack,
      downloadFromUrl,
      downloadServerItem,
      downloadOption,
      downloadsFor,
      cancelDownload,
      updateDownloadInfo,
      removeDownload,
    ]
  );

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary() {
  const ctx = useContext(LibraryContext);
  if (!ctx) throw new Error('useLibrary, LibraryProvider içinde kullanılmalı');
  return ctx;
}
