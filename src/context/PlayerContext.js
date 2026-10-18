import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useLibrary } from './LibraryContext';

const PlayerContext = createContext(null);

export function PlayerProvider({ children }) {
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const { getLocalUri, addRecent } = useLibrary();

  const [queue, setQueue] = useState([]);
  const [index, setIndex] = useState(-1);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState('off'); // 'off' | 'all' | 'one'
  const finishedRef = useRef(false);

  // Arka planda ve sessiz modda çalmaya izin ver
  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'doNotMix',
      interruptionModeAndroid: 'doNotMix',
    }).catch((e) => console.warn('Ses modu ayarlanamadı', e));
  }, []);

  const current = index >= 0 && index < queue.length ? queue[index] : null;

  const startTrack = useCallback(
    (track) => {
      if (!track) return;
      const uri = getLocalUri(track.id) || track.url;
      finishedRef.current = false;
      player.replace({ uri });
      player.play();
      // Kilit ekranı / bildirim kontrolleri (destekleyen sürümlerde)
      if (typeof player.setActiveForLockScreen === 'function') {
        try {
          player.setActiveForLockScreen(true, {
            title: track.title,
            artist: track.artist,
            albumTitle: track.album,
            artworkUrl: track.artwork,
          });
        } catch (e) {
          // desteklenmiyorsa sessizce geç
        }
      }
      addRecent(track);
    },
    [player, getLocalUri, addRecent]
  );

  const playQueue = useCallback(
    (tracks, startIndex = 0, opts = {}) => {
      if (!tracks || !tracks.length) return;
      let list = tracks.slice();
      let i = Math.max(0, Math.min(startIndex, list.length - 1));
      if (opts.shuffle) {
        // Fisher-Yates
        for (let k = list.length - 1; k > 0; k--) {
          const j = Math.floor(Math.random() * (k + 1));
          [list[k], list[j]] = [list[j], list[k]];
        }
        i = 0;
        setShuffle(true);
      }
      setQueue(list);
      setIndex(i);
      startTrack(list[i]);
    },
    [startTrack]
  );

  const playAt = useCallback(
    (i) => {
      if (i < 0 || i >= queue.length) return;
      setIndex(i);
      startTrack(queue[i]);
    },
    [queue, startTrack]
  );

  const pickNext = useCallback(() => {
    if (!queue.length) return -1;
    if (shuffle && queue.length > 1) {
      let r = index;
      while (r === index) r = Math.floor(Math.random() * queue.length);
      return r;
    }
    const n = index + 1;
    if (n >= queue.length) return repeat === 'all' ? 0 : -1;
    return n;
  }, [queue, index, shuffle, repeat]);

  const next = useCallback(() => {
    const n = pickNext();
    if (n >= 0) playAt(n);
  }, [pickNext, playAt]);

  const previous = useCallback(() => {
    if (status.currentTime > 3 || index <= 0) {
      player.seekTo(0);
      return;
    }
    playAt(index - 1);
  }, [status.currentTime, index, player, playAt]);

  const togglePlay = useCallback(() => {
    if (!current) return;
    if (status.playing) {
      player.pause();
    } else {
      if (status.duration > 0 && status.currentTime >= status.duration - 0.5) {
        player.seekTo(0);
      }
      player.play();
    }
  }, [current, status.playing, status.duration, status.currentTime, player]);

  const seek = useCallback((seconds) => player.seekTo(Math.max(0, seconds)), [player]);

  const toggleShuffle = useCallback(() => setShuffle((s) => !s), []);

  const cycleRepeat = useCallback(() => {
    setRepeat((r) => (r === 'off' ? 'all' : r === 'all' ? 'one' : 'off'));
  }, []);

  const addNext = useCallback(
    (track) => {
      if (!current) {
        playQueue([track], 0);
        return;
      }
      if (current.id === track.id) return;
      const before = queue.slice(0, index).filter((t) => t.id !== track.id);
      const after = queue.slice(index + 1).filter((t) => t.id !== track.id);
      setQueue([...before, current, track, ...after]);
      setIndex(before.length);
    },
    [current, index, queue, playQueue]
  );

  const addToQueue = useCallback(
    (track) => {
      if (!current) {
        playQueue([track], 0);
        return;
      }
      setQueue((q) => (q.some((t) => t.id === track.id) ? q : [...q, track]));
    },
    [current, playQueue]
  );

  // Parça bittiğinde sıradakine geç
  useEffect(() => {
    if (status.didJustFinish && !finishedRef.current) {
      finishedRef.current = true;
      if (repeat === 'one') {
        player.seekTo(0);
        player.play();
        finishedRef.current = false;
      } else {
        const n = pickNext();
        if (n >= 0) playAt(n);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.didJustFinish]);

  const value = useMemo(
    () => ({
      current,
      queue,
      index,
      shuffle,
      repeat,
      isPlaying: !!status.playing,
      isBuffering: !!status.isBuffering,
      position: status.currentTime || 0,
      duration: status.duration || (current && current.duration) || 0,
      playQueue,
      playAt,
      next,
      previous,
      togglePlay,
      seek,
      toggleShuffle,
      cycleRepeat,
      addNext,
      addToQueue,
    }),
    [
      current,
      queue,
      index,
      shuffle,
      repeat,
      status.playing,
      status.isBuffering,
      status.currentTime,
      status.duration,
      playQueue,
      playAt,
      next,
      previous,
      togglePlay,
      seek,
      toggleShuffle,
      cycleRepeat,
      addNext,
      addToQueue,
    ]
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer, PlayerProvider içinde kullanılmalı');
  return ctx;
}
