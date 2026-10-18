import React, { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Keyboard, Platform, Pressable, StyleSheet, Text, TextInput, ToastAndroid, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, formatTime, radius, space, type } from '../theme';
import { useLibrary } from '../context/LibraryContext';
import { usePlayer } from '../context/PlayerContext';
import { mockDownloadAPI, mockSearchAPI } from '../api/myServer';

function toast(msg) {
  if (Platform.OS === 'android') ToastAndroid.show(msg, ToastAndroid.SHORT);
}

function toSeconds(d) {
  if (typeof d === 'number') return d;
  if (!d) return 0;
  return String(d)
    .split(':')
    .reduce((acc, p) => acc * 60 + (parseFloat(p) || 0), 0);
}

const idFor = (item) => `srv:${item.id}`;

export default function ServerSearch() {
  const lib = useLibrary();
  const { playQueue } = usePlayer();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [preparing, setPreparing] = useState({}); // mockDownloadAPI beklenirken
  const reqId = useRef(0);

  const search = async () => {
    Keyboard.dismiss();
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    try {
      const r = await mockSearchAPI(query);
      if (id === reqId.current) {
        setResults(Array.isArray(r) ? r : []);
        setSearched(true);
      }
    } catch (e) {
      if (id === reqId.current) setError(e && e.message ? e.message : 'Arama başarısız oldu.');
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  };

  const downloadedTracks = useMemo(
    () => results.map((r) => lib.downloads[idFor(r)]).filter(Boolean).map((d) => d.track),
    [results, lib.downloads]
  );

  const onItem = async (item) => {
    const trackId = idFor(item);

    // Zaten indirildiyse yerel dosyadan çal
    if (lib.isDownloaded(trackId)) {
      const i = downloadedTracks.findIndex((t) => t.id === trackId);
      playQueue(downloadedTracks, Math.max(0, i));
      return;
    }
    if (preparing[trackId] || lib.progress[trackId] !== undefined) return;

    setPreparing((p) => ({ ...p, [trackId]: true }));
    try {
      const res = await mockDownloadAPI(item.url);
      if (!res || !res.fileUrl) throw new Error('Sunucu indirme linki döndürmedi.');
      setPreparing((p) => {
        const n = { ...p };
        delete n[trackId];
        return n;
      });
      const out = await lib.downloadFromUrl(res.fileUrl, {
        id: trackId,
        title: item.title,
        artist: item.artist,
        duration: toSeconds(item.duration),
        ext: res.ext,
        album: 'Sunucumdan',
        source: 'server',
      });
      if (out.ok) toast(`"${item.title}" indirildi`);
      else if (!out.exists) toast(out.error || 'İndirme başarısız oldu');
    } catch (e) {
      toast(e && e.message ? e.message : 'İndirme başarısız oldu');
      setPreparing((p) => {
        const n = { ...p };
        delete n[trackId];
        return n;
      });
    }
  };

  const renderStatus = (item) => {
    const trackId = idFor(item);
    if (lib.isDownloaded(trackId)) {
      return <Ionicons name="play-circle" size={30} color={colors.accent} />;
    }
    if (preparing[trackId]) return <ActivityIndicator color={colors.accent} />;
    const p = lib.progress[trackId];
    if (p !== undefined) return <Text style={styles.percent}>%{Math.round(p * 100)}</Text>;
    return <Ionicons name="arrow-down-circle-outline" size={30} color={colors.textDim} />;
  };

  return (
    <FlatList
      data={results}
      keyExtractor={(r) => String(r.id)}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingBottom: space.xxl }}
      ListHeaderComponent={
        <View style={styles.head}>
          <Text style={[type.bodyDim, { lineHeight: 20 }]}>
            Kendi sunucundaki ses dosyalarını ara. Bir sonuca dokunduğunda indirilir; indirildiyse çalar.
          </Text>
          <View style={styles.searchRow}>
            <View style={styles.inputWrap}>
              <Ionicons name="search" size={18} color={colors.textDim} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Sunucunda ara"
                placeholderTextColor={colors.textFaint}
                style={styles.input}
                returnKeyType="search"
                onSubmitEditing={search}
                autoCorrect={false}
                selectionColor={colors.accent}
              />
              {query ? (
                <Pressable onPress={() => setQuery('')} hitSlop={10}>
                  <Ionicons name="close-circle" size={18} color={colors.textFaint} />
                </Pressable>
              ) : null}
            </View>
            <Pressable onPress={search} style={({ pressed }) => [styles.searchBtn, pressed && { opacity: 0.8 }]}>
              {loading ? <ActivityIndicator color={colors.onAccent} /> : <Text style={styles.searchBtnText}>Ara</Text>}
            </Pressable>
          </View>
          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={18} color={colors.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
          {searched && !loading ? <Text style={[type.label, { marginTop: space.lg }]}>{results.length} sonuç</Text> : null}
        </View>
      }
      ListEmptyComponent={
        !loading ? (
          <View style={styles.empty}>
            <Ionicons name="server-outline" size={40} color={colors.textFaint} />
            <Text style={styles.emptyText}>
              {searched ? 'Sonuç bulunamadı.' : 'Bir şey yazıp Ara\'ya bas. Örnek kayıtları görmek için boş bırakabilirsin.'}
            </Text>
          </View>
        ) : null
      }
      renderItem={({ item }) => (
        <Pressable
          onPress={() => onItem(item)}
          style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surface }]}
          android_ripple={{ color: colors.surface2 }}
        >
          <View style={styles.thumb}>
            <Ionicons name="musical-note" size={20} color={colors.accent} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.title} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={styles.meta} numberOfLines={1}>
              {[item.artist, typeof item.duration === 'number' ? formatTime(item.duration) : item.duration].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <View style={styles.status}>{renderStatus(item)}</View>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  head: { paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.sm },
  searchRow: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space.md,
    height: 48,
  },
  input: { flex: 1, color: colors.text, fontSize: 15, paddingVertical: 0 },
  searchBtn: {
    height: 48,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 64,
  },
  searchBtnText: { color: colors.onAccent, fontSize: 15, fontWeight: '800' },
  errorBox: {
    flexDirection: 'row',
    gap: space.sm,
    alignItems: 'flex-start',
    backgroundColor: 'rgba(242,85,90,0.12)',
    borderRadius: radius.md,
    padding: space.md,
    marginTop: space.md,
  },
  errorText: { flex: 1, color: colors.text, fontSize: 13, lineHeight: 19 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.sm },
  thumb: {
    width: 48,
    height: 48,
    borderRadius: 6,
    backgroundColor: colors.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: colors.text, fontSize: 15, fontWeight: '600' },
  meta: { color: colors.textDim, fontSize: 13, marginTop: 3, fontVariant: ['tabular-nums'] },
  status: { width: 44, alignItems: 'center' },
  percent: { color: colors.accent, fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },
  empty: { alignItems: 'center', padding: space.xxl, gap: space.md },
  emptyText: { color: colors.textDim, fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
