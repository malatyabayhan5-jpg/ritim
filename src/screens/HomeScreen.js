import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AlbumCard from '../components/AlbumCard';
import Artwork from '../components/Artwork';
import { ErrorState, Loading } from '../components/StateView';
import { getNewAlbums, getPopularAlbums } from '../api/archive';
import { colors, space, type } from '../theme';
import { useLibrary } from '../context/LibraryContext';
import { usePlayer } from '../context/PlayerContext';

function greeting() {
  const h = new Date().getHours();
  if (h < 6) return 'İyi geceler';
  if (h < 12) return 'Günaydın';
  if (h < 18) return 'İyi günler';
  return 'İyi akşamlar';
}

export default function HomeScreen({ navigation }) {
  const { width } = useWindowDimensions();
  const { recent } = useLibrary();
  const { playQueue } = usePlayer();
  const [popular, setPopular] = useState([]);
  const [fresh, setFresh] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [p, n] = await Promise.all([getPopularAlbums(24), getNewAlbums(15)]);
      setPopular(p);
      setFresh(n);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const openAlbum = (album) => navigation.navigate('Album', { album });
  const gridSize = (width - space.lg * 2 - space.md) / 2;

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <Loading />
      </SafeAreaView>
    );
  }

  if (error && !popular.length) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ErrorState message={error} onRetry={() => { setLoading(true); load().finally(() => setLoading(false)); }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: space.xxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} />}
      >
        <View style={styles.header}>
          <Text style={type.label}>Ritim</Text>
          <Text style={[type.hero, { marginTop: 4 }]}>{greeting()}</Text>
        </View>

        {recent.length ? (
          <View style={styles.section}>
            <Text style={[type.h2, styles.sectionTitle]}>Son çalınanlar</Text>
            <View style={styles.recentGrid}>
              {recent.slice(0, 6).map((t, i) => (
                <Pressable
                  key={t.id}
                  onPress={() => playQueue(recent.slice(0, 6), i)}
                  style={({ pressed }) => [styles.recentItem, pressed && { opacity: 0.7 }]}
                >
                  <Artwork uri={t.artwork} size={48} radius={0} />
                  <Text style={styles.recentText} numberOfLines={2}>
                    {t.title}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        {fresh.length ? (
          <View style={styles.section}>
            <Text style={[type.h2, styles.sectionTitle]}>Yeni eklenenler</Text>
            <FlatList
              horizontal
              data={fresh}
              keyExtractor={(a) => a.id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.md }}
              renderItem={({ item }) => <AlbumCard album={item} size={140} onPress={() => openAlbum(item)} />}
            />
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={[type.h2, styles.sectionTitle]}>En çok dinlenenler</Text>
          <View style={styles.grid}>
            {popular.map((a) => (
              <AlbumCard key={a.id} album={a} size={gridSize} onPress={() => openAlbum(a)} />
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.sm },
  section: { marginTop: space.xl },
  sectionTitle: { paddingHorizontal: space.lg, marginBottom: space.md },
  recentGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: space.lg, gap: space.sm },
  recentItem: {
    width: '48.5%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface2,
    borderRadius: 6,
    overflow: 'hidden',
    gap: space.sm,
  },
  recentText: { flex: 1, color: colors.text, fontSize: 12, fontWeight: '700', paddingRight: space.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: space.lg, gap: space.md, rowGap: space.lg },
});
