import React, { useState } from 'react';
import { ActivityIndicator, FlatList, Platform, Pressable, StyleSheet, Text, ToastAndroid, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Artwork from '../components/Artwork';
import SeekBar from '../components/SeekBar';
import VolumeBar from '../components/VolumeBar';
import TrackActionsSheet from '../components/TrackActionsSheet';
import { colors, space } from '../theme';
import { usePlayer } from '../context/PlayerContext';
import { useLibrary } from '../context/LibraryContext';

function toast(msg) {
  if (Platform.OS === 'android') ToastAndroid.show(msg, ToastAndroid.SHORT);
}

export default function PlayerScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const p = usePlayer();
  const lib = useLibrary();
  const [showQueue, setShowQueue] = useState(false);
  const [sheet, setSheet] = useState(null); // { track, playlists: bool }

  const track = p.current;

  if (!track) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top, alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ color: colors.textDim }}>Şu an çalan bir parça yok</Text>
        <Pressable onPress={() => navigation.goBack()} style={{ marginTop: space.lg }}>
          <Text style={{ color: colors.accent, fontWeight: '700' }}>Geri dön</Text>
        </Pressable>
      </View>
    );
  }

  const fav = lib.isFavorite(track.id);
  const downloaded = lib.isDownloaded(track.id);
  const dlProgress = lib.progress[track.id];
  const art = Math.min(width - space.xl * 2, height * 0.42);

  const onDownload = () => {
    if (!track.url) {
      toast('Bu dosya zaten telefonda');
      return;
    }
    if (downloaded) {
      toast('Bu parça zaten indirildi');
      return;
    }
    if (dlProgress !== undefined) return;
    toast('İndirme başladı');
    lib.downloadTrack(track).then((ok) => toast(ok ? 'İndirildi' : 'İndirme başarısız oldu'));
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + space.lg }]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.topBtn}>
          <Ionicons name="chevron-down" size={28} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.topLabel}>{showQueue ? 'ÇALMA SIRASI' : 'ŞİMDİ ÇALIYOR'}</Text>
          <Text style={styles.topAlbum} numberOfLines={1}>
            {track.album}
          </Text>
        </View>
        <Pressable onPress={() => setSheet({ track, playlists: false })} hitSlop={12} style={styles.topBtn}>
          <Ionicons name="ellipsis-vertical" size={22} color={colors.text} />
        </Pressable>
      </View>

      <View style={styles.middle}>
        {showQueue ? (
          <FlatList
            data={p.queue}
            keyExtractor={(t, i) => `${t.id}-${i}`}
            initialScrollIndex={p.index > 0 ? p.index : undefined}
            getItemLayout={(_, i) => ({ length: 60, offset: 60 * i, index: i })}
            renderItem={({ item, index }) => {
              const active = index === p.index;
              return (
                <Pressable onPress={() => p.playAt(index)} style={[styles.qRow, active && styles.qRowActive]}>
                  <Artwork uri={item.artwork} size={44} radius={4} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.qTitle, active && { color: colors.accent }]} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={styles.qArtist} numberOfLines={1}>
                      {item.artist}
                    </Text>
                  </View>
                  {active ? <Ionicons name="volume-high" size={18} color={colors.accent} /> : null}
                </Pressable>
              );
            }}
          />
        ) : (
          <View style={styles.artWrap}>
            <Artwork uri={track.artwork} size={art} radius={12} style={styles.artShadow} />
          </View>
        )}
      </View>

      <View style={styles.info}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title} numberOfLines={1}>
            {track.title}
          </Text>
          <Text style={styles.artist} numberOfLines={1}>
            {track.artist}
          </Text>
        </View>
        <Pressable onPress={() => lib.toggleFavorite(track)} hitSlop={12}>
          <Ionicons name={fav ? 'heart' : 'heart-outline'} size={28} color={fav ? colors.accent : colors.text} />
        </Pressable>
      </View>

      <View style={styles.seek}>
        <SeekBar position={p.position} duration={p.duration} onSeek={p.seek} />
      </View>

      <View style={styles.controls}>
        <Pressable onPress={p.toggleShuffle} hitSlop={10} style={styles.sideBtn}>
          <Ionicons name="shuffle" size={26} color={p.shuffle ? colors.accent : colors.textDim} />
          {p.shuffle ? <View style={styles.dot} /> : null}
        </Pressable>
        <Pressable onPress={p.previous} hitSlop={10}>
          <Ionicons name="play-skip-back" size={34} color={colors.text} />
        </Pressable>
        <Pressable onPress={p.togglePlay} style={styles.playBtn}>
          {p.isBuffering && !p.isPlaying ? (
            <ActivityIndicator color={colors.onAccent} size="large" />
          ) : (
            <Ionicons
              name={p.isPlaying ? 'pause' : 'play'}
              size={36}
              color={colors.onAccent}
              style={p.isPlaying ? null : { marginLeft: 4 }}
            />
          )}
        </Pressable>
        <Pressable onPress={p.next} hitSlop={10}>
          <Ionicons name="play-skip-forward" size={34} color={colors.text} />
        </Pressable>
        <Pressable onPress={p.cycleRepeat} hitSlop={10} style={styles.sideBtn}>
          <Ionicons name="repeat" size={26} color={p.repeat !== 'off' ? colors.accent : colors.textDim} />
          {p.repeat === 'one' ? <Text style={styles.repeatOne}>1</Text> : null}
          {p.repeat !== 'off' ? <View style={styles.dot} /> : null}
        </Pressable>
      </View>

      <View style={styles.volume}>
        <VolumeBar value={p.volume} onChange={p.setVolume} />
      </View>

      <View style={styles.bottomRow}>
        <Pressable onPress={onDownload} hitSlop={10} style={styles.bottomBtn}>
          {dlProgress !== undefined ? (
            <Text style={styles.dlText}>%{Math.round(dlProgress * 100)}</Text>
          ) : (
            <Ionicons
              name={downloaded ? 'checkmark-circle' : 'arrow-down-circle-outline'}
              size={24}
              color={downloaded ? colors.accent : colors.textDim}
            />
          )}
        </Pressable>
        <Pressable onPress={() => setSheet({ track, playlists: true })} hitSlop={10} style={styles.bottomBtn}>
          <Ionicons name="add-circle-outline" size={24} color={colors.textDim} />
        </Pressable>
        <Pressable onPress={() => setShowQueue((s) => !s)} hitSlop={10} style={styles.bottomBtn}>
          <Ionicons name="list" size={24} color={showQueue ? colors.accent : colors.textDim} />
        </Pressable>
      </View>

      <TrackActionsSheet
        track={sheet ? sheet.track : null}
        startOnPlaylists={sheet ? sheet.playlists : false}
        onClose={() => setSheet(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: space.xl },
  topBar: { flexDirection: 'row', alignItems: 'center' },
  topBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  topLabel: { color: colors.textDim, fontSize: 11, fontWeight: '700', letterSpacing: 1.4 },
  topAlbum: { color: colors.text, fontSize: 13, fontWeight: '600', marginTop: 2 },
  middle: { flex: 1, justifyContent: 'center', marginVertical: space.lg },
  artWrap: { alignItems: 'center' },
  artShadow: {
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  qRow: { height: 60, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.sm, borderRadius: 8 },
  qRowActive: { backgroundColor: colors.accentDim },
  qTitle: { color: colors.text, fontSize: 14, fontWeight: '600' },
  qArtist: { color: colors.textDim, fontSize: 12, marginTop: 2 },
  info: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  title: { color: colors.text, fontSize: 22, fontWeight: '800', letterSpacing: -0.2 },
  artist: { color: colors.textDim, fontSize: 15, marginTop: 4 },
  seek: { marginTop: space.lg },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.md },
  sideBtn: { width: 40, alignItems: 'center' },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.accent, marginTop: 3 },
  repeatOne: { position: 'absolute', top: -6, right: 2, color: colors.accent, fontSize: 10, fontWeight: '800' },
  playBtn: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  volume: { marginTop: space.lg },
  bottomRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.md, paddingHorizontal: space.xs },
  bottomBtn: { minWidth: 40, height: 32, alignItems: 'center', justifyContent: 'center' },
  dlText: { color: colors.accent, fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },
});
