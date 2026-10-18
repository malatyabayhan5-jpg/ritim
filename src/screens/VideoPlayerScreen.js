// İndirilmiş videoları internet olmadan, telefondaki dosyadan oynatır (expo-video).
import React, { useEffect } from 'react';
import { Alert, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import { colors, formatTime, radius, space } from '../theme';
import { formatBytes } from '../services/formats';
import { useLibrary } from '../context/LibraryContext';
import { usePlayer } from '../context/PlayerContext';

function Player({ uri }) {
  const player = useVideoPlayer({ uri }, (p) => {
    p.loop = false;
    p.play();
  });
  const { width } = useWindowDimensions();
  return (
    <VideoView
      testID="video-view"
      player={player}
      style={{ width, height: Math.round((width * 9) / 16), backgroundColor: '#000' }}
      nativeControls
      contentFit="contain"
    />
  );
}

export default function VideoPlayerScreen({ route, navigation }) {
  const { id } = route.params;
  const insets = useSafeAreaInsets();
  const { downloads, getLocalUri, removeDownload } = useLibrary();
  const { isPlaying, togglePlay } = usePlayer();
  const entry = downloads[id];
  const uri = getLocalUri(id);

  // Müzik çalıyorsa duraklat; iki ses üst üste binmesin
  useEffect(() => {
    if (isPlaying) togglePlay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!entry || !uri) {
    return (
      <View style={[styles.screen, styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.dim}>Bu video artık telefonda değil.</Text>
        <Pressable onPress={() => navigation.goBack()} style={{ marginTop: space.lg }}>
          <Text style={{ color: colors.accent, fontWeight: '700' }}>Geri dön</Text>
        </Pressable>
      </View>
    );
  }

  const t = entry.track;
  const askDelete = () => {
    Alert.alert('Videoyu sil', `"${t.title}" telefondan silinsin mi?`, [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          await removeDownload(id);
          navigation.goBack();
        },
      },
    ]);
  };

  return (
    <View testID="video-player" style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.btn}>
          <Ionicons name="chevron-down" size={28} color={colors.text} />
        </Pressable>
        <Text style={styles.topLabel}>İNDİRİLEN VİDEO</Text>
        <Pressable onPress={askDelete} hitSlop={10} style={styles.btn}>
          <Ionicons name="trash-outline" size={22} color={colors.textDim} />
        </Pressable>
      </View>
      <Player uri={uri} />
      <View style={styles.info}>
        <Text style={styles.title}>{t.title}</Text>
        <Text style={styles.dim}>{t.artist}</Text>
        <View style={styles.badges}>
          {[t.quality, (t.ext || '').toUpperCase(), formatBytes(entry.size), t.duration ? formatTime(t.duration) : null]
            .filter(Boolean)
            .map((b) => (
              <View key={b} style={styles.badge}>
                <Text style={styles.badgeText}>{b}</Text>
              </View>
            ))}
        </View>
        <View style={styles.note}>
          <Ionicons name="cloud-offline-outline" size={18} color={colors.textDim} />
          <Text style={styles.noteText}>Bu video telefonunda kayıtlı; internet olmadan oynatılır.</Text>
        </View>
        {t.license ? <Text style={styles.license}>Lisans: {t.license}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.sm, height: 48 },
  btn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  topLabel: { color: colors.textDim, fontSize: 11, fontWeight: '800', letterSpacing: 1.4 },
  info: { padding: space.lg, gap: space.sm },
  title: { color: colors.text, fontSize: 19, fontWeight: '800' },
  dim: { color: colors.textDim, fontSize: 14 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.xs },
  badge: { backgroundColor: colors.surface2, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { color: colors.text, fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
  note: { flexDirection: 'row', gap: space.sm, backgroundColor: colors.surface, borderRadius: radius.md, padding: space.md, marginTop: space.md },
  noteText: { flex: 1, color: colors.textDim, fontSize: 13, lineHeight: 19 },
  license: { color: colors.textFaint, fontSize: 12, marginTop: space.sm },
});
