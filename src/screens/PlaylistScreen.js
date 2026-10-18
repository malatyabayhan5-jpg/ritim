import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Artwork from '../components/Artwork';
import TrackRow from '../components/TrackRow';
import DownloadRow from '../components/DownloadRow';
import TrackActionsSheet from '../components/TrackActionsSheet';
import { EmptyState } from '../components/StateView';
import { colors, formatTime, space } from '../theme';
import { useLibrary } from '../context/LibraryContext';
import { usePlayer } from '../context/PlayerContext';
import { videoFromTrack } from '../services/youtubeService';

function formatSize(bytes) {
  if (!bytes) return '0 MB';
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function PlaylistScreen({ route, navigation }) {
  const { kind, id } = route.params;
  const insets = useSafeAreaInsets();
  const lib = useLibrary();
  const { playQueue } = usePlayer();
  const [sheetTrack, setSheetTrack] = useState(null);

  let title = '';
  let tracks = [];
  let icon = 'musical-notes';
  let iconBg = colors.surface2;
  let emptyTitle = 'Bu liste boş';
  let emptyText = 'Parçalardaki ⋮ menüsünden ekleyebilirsin.';
  let extra = '';

  if (kind === 'favorites') {
    title = 'Favoriler';
    tracks = lib.favorites;
    icon = 'heart';
    iconBg = '#C2410C';
    emptyTitle = 'Henüz favorin yok';
    emptyText = 'Beğendiğin parçalarda kalbe dokun.';
  } else if (kind === 'downloads' || kind === 'videos') {
    const isVideo = kind === 'videos';
    const list = lib.downloadList.filter((d) => (d.track.kind === 'video') === isVideo);
    title = isVideo ? 'İndirilen videolar' : 'İndirilen sesler';
    tracks = list.map((d) => d.track);
    icon = isVideo ? 'film' : 'musical-notes';
    iconBg = isVideo ? '#7C3AED' : '#0E7490';
    emptyTitle = isVideo ? 'İndirilen video yok' : 'İndirilen ses yok';
    emptyText = isVideo
      ? 'Arşivim\'de bir videonun indirme simgesine dokun, "Video indir"i seç.'
      : 'İndirdiğin sesler internet olmadan da çalar.';
    extra = formatSize(list.reduce((s, d) => s + (d.size || 0), 0));
  } else if (kind === 'recent') {
    title = 'Son çalınanlar';
    tracks = lib.recent;
    icon = 'time';
    iconBg = '#475569';
    emptyTitle = 'Henüz bir şey çalmadın';
    emptyText = '';
  } else {
    const pl = lib.playlists.find((p) => p.id === id);
    if (!pl) {
      return (
        <View style={[styles.screen, { paddingTop: insets.top }]}>
          <Pressable onPress={() => navigation.goBack()} style={styles.back}>
            <Ionicons name="chevron-back" size={26} color={colors.text} />
          </Pressable>
          <EmptyState title="Liste bulunamadı" text="Bu çalma listesi silinmiş olabilir." />
        </View>
      );
    }
    title = pl.name;
    tracks = pl.tracks;
  }

  const total = tracks.reduce((s, t) => s + (t.duration || 0), 0);

  const extraActions = (track) => {
    if (kind === 'playlist') {
      return [{ icon: 'remove-circle-outline', label: 'Bu listeden çıkar', color: colors.danger, onPress: () => lib.removeFromPlaylist(id, track.id) }];
    }
    return [];
  };

  const header = (
    <View style={styles.header}>
      {kind === 'playlist' ? (
        <Artwork uri={tracks[0] ? tracks[0].artwork : null} size={180} radius={8} style={{ alignSelf: 'center' }} />
      ) : (
        <View style={[styles.bigIcon, { backgroundColor: iconBg }]}>
          <Ionicons name={icon} size={72} color="#FFFFFF" />
        </View>
      )}
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.meta}>
        {tracks.length} parça{total ? ` · ${formatTime(total)}` : ''}
        {extra ? ` · ${extra}` : ''}
      </Text>
      {tracks.length && kind !== 'videos' ? (
        <View style={styles.actions}>
          <View style={{ flex: 1 }} />
          <Pressable onPress={() => playQueue(tracks, 0, { shuffle: true })} hitSlop={6}>
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
      <View style={{ paddingTop: insets.top + 4, paddingHorizontal: space.sm }}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.back}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
      </View>
      <FlatList
        data={tracks}
        keyExtractor={(t) => t.id}
        ListHeaderComponent={header}
        ListEmptyComponent={<EmptyState title={emptyTitle} text={emptyText} />}
        contentContainerStyle={{ paddingBottom: space.xxl }}
        renderItem={({ item, index }) => (
          (kind === 'downloads' || kind === 'videos') && lib.downloads[item.id] ? (
            <DownloadRow
              entry={lib.downloads[item.id]}
              onPlay={() => (kind === 'videos' ? navigation.navigate('VideoPlayer', { id: item.id }) : playQueue(tracks, index))}
              onMore={kind === 'videos' ? undefined : () => setSheetTrack(item)}
            />
          ) : (
            <TrackRow
              track={item}
              onPress={() =>
                item.source === 'youtube'
                  ? navigation.navigate('YouTubePlayer', { video: videoFromTrack(item) })
                  : playQueue(tracks, index)
              }
              onMore={() => setSheetTrack(item)}
            />
          )
        )}
      />
      <TrackActionsSheet
        track={sheetTrack}
        onClose={() => setSheetTrack(null)}
        extraActions={sheetTrack ? extraActions(sheetTrack) : []}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  header: { paddingHorizontal: space.lg, paddingBottom: space.md },
  bigIcon: { alignSelf: 'center', width: 180, height: 180, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.text, fontSize: 24, fontWeight: '800', marginTop: space.xl, letterSpacing: -0.3 },
  meta: { color: colors.textDim, fontSize: 13, marginTop: 4 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.lg },
  playBtn: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
});
