import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Keyboard, Platform, Pressable, StyleSheet, Text, TextInput, ToastAndroid, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Artwork from '../components/Artwork';
import { colors, formatTime, radius, space, type } from '../theme';
import ServiceSettings from '../components/ServiceSettings';
import { getConfig, loadConfig, search as searchMedia } from '../services/mediaService';
import { useLibrary } from '../context/LibraryContext';
import { usePlayer } from '../context/PlayerContext';

function toast(msg) {
  if (Platform.OS === 'android') ToastAndroid.show(msg, ToastAndroid.SHORT);
}

function durationLabel(d) {
  if (typeof d === 'number') return formatTime(d);
  return d || '';
}

function ResultRow({ item, state, progress, onPress, onCancel }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surface }]}
      android_ripple={{ color: colors.surface2 }}
    >
      <Artwork uri={item.thumbnail} size={52} radius={6} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.title, state === 'playing' && { color: colors.accent }]} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {[item.artist, durationLabel(item.duration)].filter(Boolean).join(' · ')}
        </Text>
        {state === 'downloading' ? (
          <View style={styles.bar}>
            <View style={[styles.barFill, { width: `${Math.max(4, (progress || 0) * 100)}%` }]} />
          </View>
        ) : null}
      </View>
      <View style={styles.stateBox}>
        {state === 'downloading' ? (
          <Pressable onPress={onCancel} hitSlop={10} style={{ alignItems: 'center' }}>
            <Text style={styles.percent}>%{Math.round((progress || 0) * 100)}</Text>
            <Text style={styles.cancel}>İptal</Text>
          </Pressable>
        ) : state === 'starting' ? (
          <ActivityIndicator color={colors.accent} />
        ) : state === 'downloaded' || state === 'playing' ? (
          <Ionicons name={state === 'playing' ? 'volume-high' : 'play-circle'} size={30} color={colors.accent} />
        ) : (
          <Ionicons name="arrow-down-circle-outline" size={30} color={colors.textDim} />
        )}
      </View>
    </Pressable>
  );
}

export default function ArchiveScreen({ navigation }) {
  const { downloads, downloadList, progress, pending, downloadServerItem, cancelDownload } = useLibrary();
  const { playQueue, current } = usePlayer();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [starting, setStarting] = useState({});
  const reqId = useRef(0);
  const lastQuery = useRef('');
  const [config, setConfig] = useState(getConfig());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const isMock = config.mode !== 'api';

  useEffect(() => {
    loadConfig().then(setConfig);
  }, []);

  const archiveTracks = useMemo(
    () => downloadList.filter((d) => d.track.source === 'server').map((d) => d.track),
    [downloadList]
  );

  const search = async (force = false) => {
    const q = query.trim();
    if (!q) {
      setError('Aramak için bir şey yaz.');
      return;
    }
    Keyboard.dismiss();
    // Aynı sorgu zaten gösteriliyorsa tekrar istek atma
    if (!force && q === lastQuery.current && searched && !error && !loading) {
      toast('Bu aramanın sonuçları zaten gösteriliyor');
      return;
    }
    if (loading && q === lastQuery.current) return;
    lastQuery.current = q;
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    try {
      const list = await searchMedia(q);
      if (id === reqId.current) {
        setResults(Array.isArray(list) ? list : []);
        setSearched(true);
      }
    } catch (e) {
      if (id === reqId.current) {
        setError((e && e.message) || 'Arama başarısız oldu.');
        setResults([]);
        lastQuery.current = '';
      }
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  };

  const stateOf = (item) => {
    const tid = `srv:${item.id}`;
    if (current && current.id === tid) return 'playing';
    if (downloads[tid]) return 'downloaded';
    if (pending[tid]) return 'downloading';
    if (starting[item.id]) return 'starting';
    return 'idle';
  };

  const onPressItem = async (item) => {
    const tid = `srv:${item.id}`;
    if (downloads[tid]) {
      const idx = archiveTracks.findIndex((t) => t.id === tid);
      playQueue(archiveTracks, Math.max(0, idx));
      return;
    }
    if (pending[tid] || starting[item.id]) return;
    setStarting((s) => ({ ...s, [item.id]: true }));
    const job = downloadServerItem(item);
    const res = await job;
    setStarting((s) => ({ ...s, [item.id]: false }));
    if (res.ok && !res.exists) toast(`"${item.title}" indirildi`);
    else if (res.cancelled) toast('İndirme iptal edildi');
    else if (!res.ok) setError(res.error);
  };

  const header = (
    <View>
      <View style={styles.top}>
        <View style={styles.titleRow}>
          <Text style={type.h1}>Arşivim</Text>
          <View style={styles.mockBadge}>
            <Text style={styles.mockText}>{isMock ? 'Deneme modu' : 'Kendi API\'m'}</Text>
          </View>
          <View style={{ flex: 1 }} />
          <Pressable onPress={() => setSettingsOpen(true)} hitSlop={10} style={styles.gear}>
            <Ionicons name="settings-outline" size={22} color={colors.text} />
          </Pressable>
        </View>
        <View style={styles.searchWrap}>
          <Ionicons name="server-outline" size={18} color={colors.textDim} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={isMock ? 'Denemek için "örnek" yaz' : 'Sunucunda ara'}
            placeholderTextColor={colors.textFaint}
            style={styles.searchInput}
            returnKeyType="search"
            onSubmitEditing={() => search()}
            autoCorrect={false}
            selectionColor={colors.accent}
          />
          {query ? (
            <Pressable onPress={() => setQuery('')} hitSlop={10}>
              <Ionicons name="close-circle" size={18} color={colors.textFaint} />
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => search()}
            disabled={!query.trim() || loading}
            style={[styles.searchBtn, (!query.trim() || loading) && { opacity: 0.4 }]}
          >
            {loading ? <ActivityIndicator size="small" color={colors.onAccent} /> : <Text style={styles.searchBtnText}>Ara</Text>}
          </Pressable>
        </View>
      </View>

      {error ? (
        <Pressable onPress={() => setError(null)} style={styles.errorBox}>
          <Ionicons name="alert-circle" size={18} color={colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
          <Ionicons name="close" size={16} color={colors.textDim} />
        </Pressable>
      ) : null}

      {searched ? <Text style={[type.label, styles.sectionLabel]}>Sonuçlar · {results.length}</Text> : null}
    </View>
  );

  const footer = archiveTracks.length ? (
    <View style={styles.footer}>
      <View style={styles.footerHead}>
        <Text style={type.label}>Arşivden indirilenler · {archiveTracks.length}</Text>
        <Pressable onPress={() => navigation.navigate('Playlist', { kind: 'downloads' })} hitSlop={8}>
          <Text style={styles.link}>Tüm indirilenler</Text>
        </Pressable>
      </View>
      <Pressable onPress={() => playQueue(archiveTracks, 0)} style={styles.playAll}>
        <Ionicons name="play" size={18} color={colors.onAccent} />
        <Text style={styles.playAllText}>Arşivimi çal</Text>
      </Pressable>
    </View>
  ) : null;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <FlatList
        data={results}
        keyExtractor={(it) => String(it.id)}
        ListHeaderComponent={header}
        ListFooterComponent={footer}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: space.xxl }}
        ListEmptyComponent={
          loading ? null : (
            <View style={styles.empty}>
              <Ionicons name={searched ? 'search-outline' : 'albums-outline'} size={40} color={colors.textFaint} />
              <Text style={styles.emptyTitle}>{searched ? 'Sonuç bulunamadı' : 'Sunucundaki dosyaları ara'}</Text>
              <Text style={styles.emptyText}>
                {searched ? 'Başka bir kelime dene.' : 'Bir sonuca dokunduğunda dosya telefona indirilir. İndirilmiş olana dokunursan çalar.'}
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <ResultRow
            item={item}
            state={stateOf(item)}
            progress={progress[`srv:${item.id}`]}
            onPress={() => onPressItem(item)}
            onCancel={() => cancelDownload(`srv:${item.id}`)}
          />
        )}
      />
      <ServiceSettings
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSaved={(c) => {
          setConfig(c);
          lastQuery.current = '';
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  top: { paddingHorizontal: space.lg, paddingTop: space.lg, gap: space.md, paddingBottom: space.sm },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  mockBadge: { backgroundColor: colors.accentDim, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
  mockText: { color: colors.accent, fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingLeft: space.md,
    paddingRight: 5,
    height: 50,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 15, paddingVertical: 0 },
  searchBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.sm + 2,
    paddingHorizontal: space.lg,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 58,
  },
  searchBtnText: { color: colors.onAccent, fontWeight: '800', fontSize: 14 },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    marginHorizontal: space.lg,
    marginTop: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: 'rgba(242,85,90,0.12)',
  },
  errorText: { flex: 1, color: colors.text, fontSize: 13, lineHeight: 19 },
  sectionLabel: { paddingHorizontal: space.lg, marginTop: space.lg, marginBottom: space.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.sm },
  title: { color: colors.text, fontSize: 15, fontWeight: '600' },
  meta: { color: colors.textDim, fontSize: 13, marginTop: 3 },
  bar: { height: 3, borderRadius: 2, backgroundColor: colors.border, overflow: 'hidden', marginTop: 6 },
  barFill: { height: 3, backgroundColor: colors.accent },
  stateBox: { width: 44, alignItems: 'center', justifyContent: 'center' },
  cancel: { color: colors.textDim, fontSize: 11, fontWeight: '700', marginTop: 2 },
  gear: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  percent: { color: colors.accent, fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },
  empty: { alignItems: 'center', paddingHorizontal: space.xxl, paddingVertical: space.xxl, gap: space.sm },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: '700', marginTop: space.sm },
  emptyText: { color: colors.textDim, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  footer: {
    marginTop: space.xl,
    marginHorizontal: space.lg,
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    gap: space.md,
  },
  footerHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  link: { color: colors.accent, fontSize: 13, fontWeight: '700' },
  playAll: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  playAllText: { color: colors.onAccent, fontWeight: '800', fontSize: 15 },
});
