import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { mockDownloadAPI } from '../api/server';

const STORAGE_KEY = 'ritim:library:v1';
const DOWNLOAD_DIR = FileSystem.documentDirectory + 'muzik/';
const MAX_RECENT = 30;

const LibraryContext = createContext(null);

const AUDIO_EXTS = ['mp3', 'm4a', 'aac', 'wav', 'ogg', 'oga', 'opus', 'flac'];

function extFromUrl(url) {
  const path = String(url || '').split('?')[0].split('#')[0];
  const m = path.match(/\.([a-zA-Z0-9]{2,5})$/);
  const ext = m ? m[1].toLowerCase() : '';
  return AUDIO_EXTS.includes(ext) ? ext : '';
}

function fileNameFor(track) {
  const ext = track.ext || extFromUrl(track.url) || 'mp3';
  const base = track.id.replace(/\.[a-zA-Z0-9]{2,5}$/, '').replace(/[^a-zA-Z0-9._-]/g, '_');
  const trimmed = base.length > 110 ? base.slice(base.length - 110) : base;
  return `${trimmed}.${ext}`;
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
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(DOWNLOAD_DIR, { intermediates: true });
  }
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function LibraryProvider({ children }) {
  const [loaded, setLoaded] = useState(false);
  const [favorites, setFavorites] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [downloads, setDownloads] = useState({}); // { [trackId]: { track, file, size } }
  const [recent, setRecent] = useState([]);
  const [progress, setProgress] = useState({}); // { [trackId]: 0..1 }
  const [pending, setPending] = useState({}); // { [trackId]: track } süren indirmeler
  const active = useRef({});

  // İlk açılışta kayıtlı kütüphaneyi yükle
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const data = JSON.parse(raw);
          setFavorites(data.favorites || []);
          setPlaylists(data.playlists || []);
          setRecent(data.recent || []);
          const dls = data.downloads || {};
          // Silinmiş dosyaları ayıkla
          const checked = {};
          for (const id of Object.keys(dls)) {
            try {
              const info = await FileSystem.getInfoAsync(DOWNLOAD_DIR + dls[id].file);
              if (info.exists) checked[id] = dls[id];
            } catch (e) {
              // dosya okunamadıysa listeden düşür
            }
          }
          setDownloads(checked);
        }
      } catch (e) {
        console.warn('Kütüphane yüklenemedi', e);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  // Değişiklikleri kaydet
  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ favorites, playlists, downloads, recent })
    ).catch((e) => console.warn('Kütüphane kaydedilemedi', e));
  }, [loaded, favorites, playlists, downloads, recent]);

  const isFavorite = useCallback((id) => favorites.some((t) => t.id === id), [favorites]);

  const toggleFavorite = useCallback((track) => {
    setFavorites((prev) =>
      prev.some((t) => t.id === track.id) ? prev.filter((t) => t.id !== track.id) : [track, ...prev]
    );
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
      prev.map((p) =>
        p.id === playlistId && !p.tracks.some((t) => t.id === track.id)
          ? { ...p, tracks: [...p.tracks, track] }
          : p
      )
    );
  }, []);

  const removeFromPlaylist = useCallback((playlistId, trackId) => {
    setPlaylists((prev) =>
      prev.map((p) => (p.id === playlistId ? { ...p, tracks: p.tracks.filter((t) => t.id !== trackId) } : p))
    );
  }, []);

  const getLocalUri = useCallback(
    (id) => (downloads[id] ? DOWNLOAD_DIR + downloads[id].file : null),
    [downloads]
  );

  const isDownloaded = useCallback((id) => !!downloads[id], [downloads]);

  // Ortak indirme çekirdeği: { ok, error } döndürür
  const runDownload = useCallback(async (track) => {
    if (active.current[track.id]) return { ok: false, error: 'Bu dosya zaten indiriliyor.' };
    active.current[track.id] = true;
    setPending((p) => ({ ...p, [track.id]: track }));
    setProgress((p) => ({ ...p, [track.id]: 0 }));
    const file = fileNameFor(track);
    const dest = DOWNLOAD_DIR + file;
    try {
      await ensureDir();
      const opts = track.headers ? { headers: track.headers } : {};
      const job = FileSystem.createDownloadResumable(track.url, dest, opts, (e) => {
        const total = e.totalBytesExpectedToWrite;
        const ratio = total > 0 ? e.totalBytesWritten / total : 0;
        setProgress((p) => ({ ...p, [track.id]: ratio }));
      });
      const res = await job.downloadAsync();
      if (!res) throw new Error('İndirme yarıda kesildi.');
      if (res.status && res.status >= 400) {
        throw new Error(`Sunucu ${res.status} hatası döndürdü. Linkin doğru ve herkese açık olduğundan emin ol.`);
      }
      const type = headerValue(res.headers, 'content-type').toLowerCase();
      if (type.includes('text/html') || type.includes('application/json')) {
        throw new Error('Bu link bir ses dosyası değil, bir web sayfası açıyor. Doğrudan .mp3 veya .m4a dosyasının linkini gir.');
      }
      const info = await FileSystem.getInfoAsync(dest);
      if (!info.exists || !info.size) throw new Error('İndirilen dosya boş.');
      const saved = { ...track };
      delete saved.headers; // kimlik bilgileri telefonda saklanmaz
      setDownloads((d) => ({ ...d, [track.id]: { track: saved, file, size: info.size || 0, at: Date.now() } }));
      return { ok: true };
    } catch (e) {
      console.warn('İndirme hatası', e);
      try {
        await FileSystem.deleteAsync(dest, { idempotent: true });
      } catch (err) {
        // yoksay
      }
      const msg = e && e.message ? e.message : 'İndirme başarısız oldu.';
      return { ok: false, error: /network|failed to connect|unable to resolve|cleartext/i.test(msg) ? 'Sunucuya bağlanılamadı. İnternet bağlantını ve linki kontrol et.' : msg };
    } finally {
      delete active.current[track.id];
      setPending((p) => {
        const next = { ...p };
        delete next[track.id];
        return next;
      });
      setProgress((p) => {
        const next = { ...p };
        delete next[track.id];
        return next;
      });
    }
  }, []);

  const downloadTrack = useCallback(async (track) => (await runDownload(track)).ok, [runDownload]);

  // Herhangi bir açık ses dosyası linkinden indir
  const downloadFromUrl = useCallback(
    async (rawUrl, meta = {}) => {
      const url = String(rawUrl || '').trim();
      if (!isValidAudioUrl(url)) {
        return { ok: false, error: 'Geçerli bir link gir (http:// veya https:// ile başlamalı).' };
      }
      const id = meta.id || `url:${hashString(url)}`;
      if (downloads[id]) return { ok: false, error: 'Bu dosya zaten indirilmiş.', exists: true };
      const ext = String(meta.ext || '').toLowerCase();
      const track = {
        id,
        title: (meta.title || '').trim() || titleFromUrl(url),
        artist: (meta.artist || '').trim() || 'Bilinmeyen sanatçı',
        album: meta.album || 'Linkten indirilenler',
        albumId: null,
        url,
        artwork: meta.artwork || null,
        duration: meta.duration || 0,
        ext: AUDIO_EXTS.includes(ext) ? ext : extFromUrl(url) || 'mp3',
        source: meta.source || 'url',
      };
      const res = await runDownload(track);
      return { ...res, track };
    },
    [downloads, runDownload]
  );

  // Kendi sunucundaki bir arama sonucunu indir (src/api/server.js)
  const downloadServerItem = useCallback(
    async (item) => {
      const id = `srv:${item.id}`;
      if (downloads[id]) return { ok: true, exists: true };
      let target;
      try {
        target = await mockDownloadAPI(item.url);
      } catch (e) {
        return { ok: false, error: (e && e.message) || 'Sunucudan indirme adresi alınamadı.' };
      }
      if (!target || !isValidAudioUrl(target.url)) {
        return { ok: false, error: 'Sunucu geçerli bir indirme adresi döndürmedi.' };
      }
      const dur =
        typeof item.duration === 'number'
          ? item.duration
          : String(item.duration || '')
              .split(':')
              .reduce((a, p) => a * 60 + (parseFloat(p) || 0), 0);
      const track = {
        id,
        title: item.title || 'İsimsiz parça',
        artist: item.artist || 'Arşivim',
        album: 'Arşivim',
        albumId: null,
        url: target.url,
        artwork: item.thumbnail || null,
        duration: dur || 0,
        ext: target.ext || extFromUrl(target.url) || 'mp3',
        headers: target.headers || null,
        source: 'server',
      };
      const res = await runDownload(track);
      return { ...res, track };
    },
    [downloads, runDownload]
  );

  const updateDownloadInfo = useCallback((id, patch) => {
    const clean = {};
    if (patch.title && patch.title.trim()) clean.title = patch.title.trim();
    if (patch.artist && patch.artist.trim()) clean.artist = patch.artist.trim();
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

  const downloadList = useMemo(
    () => Object.values(downloads).sort((a, b) => (b.at || 0) - (a.at || 0)),
    [downloads]
  );

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
