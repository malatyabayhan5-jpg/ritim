import React, { useEffect, useRef, useState } from 'react';
import { FlatList, Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Artwork from '../components/Artwork';
import YouTubeSearch from '../components/YouTubeSearch';
import { EmptyState, ErrorState, Loading } from '../components/StateView';
import { searchAlbums, searchByGenre } from '../api/archive';
import { colors, radius, space, type } from '../theme';

const GENRES = [
  { label: 'Elektronik', q: 'electronic', color: '#3B5BDB' },
  { label: 'Ambient', q: 'ambient', color: '#2B8A7E' },
  { label: 'Rock', q: 'rock', color: '#C2410C' },
  { label: 'Hip hop', q: 'hip hop', color: '#7C3AED' },
  { label: 'Caz', q: 'jazz', color: '#A16207' },
  { label: 'Lo-fi', q: 'lofi', color: '#BE185D' },
  { label: 'Klasik', q: 'classical', color: '#475569' },
  { label: 'Piyano', q: 'piano', color: '#0E7490' },
  { label: 'Techno', q: 'techno', color: '#4D7C0F' },
  { label: 'Akustik', q: 'acoustic', color: '#9A3412' },
];

export default function SearchScreen({ navigation }) {
  const [source, setSource] = useState('music'); // 'music' | 'youtube'
  const [query, setQuery] = useState('');
  const [genre, setGenre] = useState(null);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const reqId = useRef(0);

  const run = async (fn) => {
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    try {
      const r = await fn();
      if (id === reqId.current) setResults(r);
    } catch (e) {
      if (id === reqId.current) setError(e.message);
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  };

  // Yazarken 450 ms bekleyip ara
  useEffect(() => {
    if (genre) return undefined;
    const q = query.trim();
    if (q.length < 2) {
      reqId.current++;
      setResults([]);
      setLoading(false);
      setError(null);
      return undefined;
    }
    const t = setTimeout(() => run(() => searchAlbums(q)), 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, genre]);

  const pickGenre = (g) => {
    Keyboard.dismiss();
    setGenre(g);
    setQuery('');
    run(() => searchByGenre(g.q));
  };

  const clear = () => {
    setQuery('');
    setGenre(null);
    setResults([]);
  };

  const showBrowse = !genre && query.trim().length < 2;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.top}>
        <Text style={type.h1}>Ara</Text>
        <View style={styles.segment}>
          {[
            ['music', 'Açık müzik arşivi'],
            ['youtube', 'YouTube'],
          ].map(([key, label]) => (
            <Pressable key={key} onPress={() => setSource(key)} style={[styles.segBtn, source === key && styles.segBtnOn]}>
              <Text style={[styles.segText, source === key && styles.segTextOn]}>{label}</Text>
            </Pressable>
          ))}
        </View>
        {source === 'music' ? (
        <View style={styles.inputWrap}>
          <Ionicons name="search" size={20} color={colors.onAccent} />
          <TextInput
            value={genre ? genre.label : query}
            onChangeText={(t) => {
              setGenre(null);
              setQuery(t);
            }}
            placeholder="Sanatçı, albüm veya tür"
            placeholderTextColor="#6B6252"
            style={styles.input}
            returnKeyType="search"
            selectionColor={colors.onAccent}
            autoCorrect={false}
          />
          {query || genre ? (
            <Pressable onPress={clear} hitSlop={10}>
              <Ionicons name="close-circle" size={20} color={colors.onAccent} />
            </Pressable>
          ) : null}
        </View>
        ) : null}
      </View>

      {source === 'youtube' ? (
        <YouTubeSearch />
      ) : showBrowse ? (
        <FlatList
          data={GENRES}
          keyExtractor={(g) => g.q}
          numColumns={2}
          ListHeaderComponent={<Text style={[type.h2, { marginBottom: space.md }]}>Türlere göz at</Text>}
          contentContainerStyle={{ padding: space.lg, gap: space.md }}
          columnWrapperStyle={{ gap: space.md }}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <Pressable
              onPress={() => pickGenre(item)}
              style={({ pressed }) => [styles.genre, { backgroundColor: item.color }, pressed && { opacity: 0.8 }]}
            >
              <Text style={styles.genreText}>{item.label}</Text>
              <Ionicons name="musical-note" size={44} color="rgba(255,255,255,0.25)" style={styles.genreIcon} />
            </Pressable>
          )}
        />
      ) : loading && !results.length ? (
        <Loading />
      ) : error ? (
        <ErrorState message={error} onRetry={() => (genre ? pickGenre(genre) : run(() => searchAlbums(query)))} />
      ) : !results.length ? (
        <EmptyState icon="search-outline" title="Sonuç bulunamadı" text="Başka bir kelime ya da tür dene." />
      ) : (
        <FlatList
          data={results}
          keyExtractor={(a) => a.id}
          keyboardShouldPersistTaps="handled"
          onScrollBeginDrag={Keyboard.dismiss}
          contentContainerStyle={{ paddingBottom: space.xl }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => navigation.navigate('Album', { album: item })}
              style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surface }]}
            >
              <Artwork uri={item.artwork} size={56} radius={6} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={styles.rowMeta} numberOfLines={1}>
                  Albüm · {item.artist}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  top: { paddingHorizontal: space.lg, paddingTop: space.lg, gap: space.md, paddingBottom: space.sm },
  segment: { flexDirection: 'row', backgroundColor: colors.surface2, borderRadius: radius.pill, padding: 4 },
  segBtn: { flex: 1, paddingVertical: 8, borderRadius: radius.pill, alignItems: 'center' },
  segBtnOn: { backgroundColor: colors.text },
  segText: { color: colors.textDim, fontSize: 14, fontWeight: '700' },
  segTextOn: { color: colors.onAccent },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.text,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    gap: space.sm,
    height: 46,
  },
  input: { flex: 1, color: colors.onAccent, fontSize: 16, fontWeight: '600', paddingVertical: 0 },
  genre: { flex: 1, height: 96, borderRadius: radius.md, padding: space.md, overflow: 'hidden' },
  genreText: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
  genreIcon: { position: 'absolute', right: 6, bottom: 2, transform: [{ rotate: '20deg' }] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.sm },
  rowTitle: { color: colors.text, fontSize: 15, fontWeight: '600' },
  rowMeta: { color: colors.textDim, fontSize: 13, marginTop: 3 },
});
