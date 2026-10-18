import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Linking, Platform, Pressable, StyleSheet, Text, ToastAndroid, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Artwork from '../components/Artwork';
import TrackRow from '../components/TrackRow';
import TrackActionsSheet from '../components/TrackActionsSheet';
import { EmptyState, ErrorState, Loading } from '../components/StateView';
import { getAlbumTracks } from '../api/archive';
import { colors, formatTime, radius, space } from '../theme';
import { usePlayer } from '../context/PlayerContext';
import { useLibrary } from '../context/LibraryContext';

export default function AlbumScreen({ route, navigation }) {
  const { album: initial } = route.params;
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { playQueue } = usePlayer();
  const { downloadTrack, isDownloaded } = useLibrary();
  const [album, setAlbum] = useState(initial);
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sheetTrack, setSheetTrack] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getAlbumTracks(initial.id);
      setAlbum((a) => ({ ...a, ...res.album }));
      setTracks(res.tracks);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [initial.id]);

  useEffect(() => {
    load();
  }, [load]);

  const total = tracks.reduce((s, t) => s + (t.duration || 0), 0);
  const allDownloaded = tracks.length > 0 && tracks.every((t) => isDownloaded(t.id));

  const downloadAll = async () => {
    const todo = tracks.filter((t) => !isDownloaded(t.id));
    if (!todo.length) return;
    if (Platform.OS === 'android') ToastAndroid.show(`${todo.length} parça indiriliyor`, ToastAndroid.SHORT);
    for (const t of todo) {
      // sırayla indir, telefonu yormasın
      // eslint-disable-next-line no-await-in-loop
      await downloadTrack(t);
    }
    if (Platform.OS === 'android') ToastAndroid.show('Albüm indirildi', ToastAndroid.SHORT);
  };

  const art = Math.min(width * 0.62, 280);

  const header = (
    <View style={styles.header}>
      <Artwork uri={album.artwork} size={art} radius={radius.md} style={styles.art} />
      <Text style={styles.title}>{album.title}</Text>
      <Text style={styles.artist}>{album.artist}</Text>
      <Text style={styles.meta}>
        Albüm{tracks.length ? ` · ${tracks.length} parça` : ''}
        {total ? ` · ${formatTime(total)}` : ''}
      </Text>
      {album.license ? (
        <Pressable onPress={() => Linking.openURL(album.license)} hitSlop={6}>
          <Text style={styles.license}>Creative Commons lisansı</Text>
        </Pressable>
      ) : null}

      {tracks.length ? (
        <View style={styles.actions}>
          <Pressable onPress={downloadAll} style={styles.iconBtn} hitSlop={6}>
            <Ionicons
              name={allDownloaded ? 'checkmark-circle' : 'arrow-down-circle-outline'}
              size={30}
              color={allDownloaded ? colors.accent : colors.textDim}
            />
          </Pressable>
          <View style={{ flex: 1 }} />
          <Pressable onPress={() => playQueue(tracks, 0, { shuffle: true })} style={styles.iconBtn} hitSlop={6}>
            <Ionicons name="shuffle" size={28} color={colors.textDim} />
          </Pressable>
          <Pressable onPress={() => playQueue(tracks, 0)} style={styles.playBtn}>
            <Ionicons name="play" size={28} color={colors.onAccent} style={{ marginLeft: 3 }} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={styles.screen}>
      <View style={[styles.topBar, { paddingTop: insets.top + 4 }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.back}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
      </View>

      {loading ? (
        <>
          {header}
          <Loading />
        </>
      ) : error ? (
        <>
          {header}
          <ErrorState message={error} onRetry={load} />
        </>
      ) : (
        <FlatList
          data={tracks}
          keyExtractor={(t) => t.id}
          ListHeaderComponent={header}
          ListEmptyComponent={<EmptyState title="Bu albümde çalınabilir parça yok" />}
          contentContainerStyle={{ paddingBottom: space.xxl }}
          renderItem={({ item, index }) => (
            <TrackRow
              track={item}
              showArtwork={false}
              number={index + 1}
              onPress={() => playQueue(tracks, index)}
              onMore={() => setSheetTrack(item)}
            />
          )}
        />
      )}

      <TrackActionsSheet track={sheetTrack} onClose={() => setSheetTrack(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  topBar: { paddingHorizontal: space.sm },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  header: { paddingHorizontal: space.lg, paddingBottom: space.md },
  art: { alignSelf: 'center', marginBottom: space.xl, marginTop: space.xs },
  title: { color: colors.text, fontSize: 24, fontWeight: '800', letterSpacing: -0.3 },
  artist: { color: colors.text, fontSize: 14, fontWeight: '600', marginTop: space.sm },
  meta: { color: colors.textDim, fontSize: 13, marginTop: 4 },
  license: { color: colors.accent, fontSize: 12, marginTop: 6, textDecorationLine: 'underline' },
  actions: { flexDirection: 'row', alignItems: 'center', marginTop: space.lg, gap: space.md },
  iconBtn: { padding: 2 },
  playBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
