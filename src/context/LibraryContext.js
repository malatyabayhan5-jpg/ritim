import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

const STORAGE_KEY = 'ritim:library:v1';
const DOWNLOAD_DIR = FileSystem.documentDirectory + 'muzik/';
const MAX_RECENT = 30;

const LibraryContext = createContext(null);

function fileNameFor(track) {
  const safe = track.id.replace(/[^a-zA-Z0-9._-]/g, '_');
  const trimmed = safe.length > 120 ? safe.slice(safe.length - 120) : safe;
  return trimmed.toLowerCase().endsWith('.mp3') ? trimmed : trimmed + '.mp3';
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

  const downloadTrack = useCallback(async (track) => {
    if (active.current[track.id]) return;
    active.current[track.id] = true;
    setProgress((p) => ({ ...p, [track.id]: 0 }));
    const file = fileNameFor(track);
    try {
      await ensureDir();
      const job = FileSystem.createDownloadResumable(track.url, DOWNLOAD_DIR + file, {}, (e) => {
        const total = e.totalBytesExpectedToWrite;
        const ratio = total > 0 ? e.totalBytesWritten / total : 0;
        setProgress((p) => ({ ...p, [track.id]: ratio }));
      });
      const res = await job.downloadAsync();
      if (!res || (res.status && res.status >= 400)) {
        throw new Error('İndirme başarısız oldu');
      }
      const info = await FileSystem.getInfoAsync(DOWNLOAD_DIR + file);
      setDownloads((d) => ({ ...d, [track.id]: { track, file, size: info.size || 0, at: Date.now() } }));
      return true;
    } catch (e) {
      console.warn('İndirme hatası', e);
      try {
        await FileSystem.deleteAsync(DOWNLOAD_DIR + file, { idempotent: true });
      } catch (err) {
        // yoksay
      }
      return false;
    } finally {
      delete active.current[track.id];
      setProgress((p) => {
        const next = { ...p };
        delete next[track.id];
        return next;
      });
    }
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
