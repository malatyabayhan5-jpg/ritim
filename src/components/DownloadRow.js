import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Artwork from './Artwork';
import { colors, formatTime, space } from '../theme';
import { useLibrary } from '../context/LibraryContext';
import { usePlayer } from '../context/PlayerContext';

export function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// İndirilmiş bir dosyanın satırı: ad, biçim, boyut, süre + oynat/duraklat + sil
export default function DownloadRow({ entry, onPlay, onMore }) {
  const { removeDownload } = useLibrary();
  const { current, isPlaying, togglePlay } = usePlayer();
  const { track, size } = entry;
  const isVideo = track.kind === 'video';
  const active = !isVideo && current && current.id === track.id;

  const onToggle = () => {
    if (active) togglePlay();
    else onPlay();
  };

  const askDelete = () => {
    Alert.alert('Dosyayı sil', `"${track.title}" telefondan silinsin mi?`, [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: () => removeDownload(track.id) },
    ]);
  };

  const meta = [
    [(track.ext || 'mp3').toUpperCase(), track.quality && !/^(MP3|M4A|OGG|FLAC|WAV)$/i.test(track.quality) ? track.quality.replace(/^Orijinal format · /, '') : null]
      .filter(Boolean)
      .join(' · '),
    formatSize(size),
    track.duration ? formatTime(track.duration) : null,
  ].filter(Boolean);

  return (
    <Pressable
      onPress={onToggle}
      onLongPress={onMore}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surface }]}
      android_ripple={{ color: colors.surface2 }}
    >
      <Artwork uri={track.artwork} size={48} radius={6} />
      <View style={styles.texts}>
        <Text style={[styles.title, active && { color: colors.accent }]} numberOfLines={1}>
          {track.title}
        </Text>
        <Text style={styles.artist} numberOfLines={1}>
          {track.artist}
        </Text>
        <View style={styles.metaRow}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{meta[0]}</Text>
          </View>
          <Text style={styles.meta}>{meta.slice(1).join(' · ')}</Text>
        </View>
      </View>
      <Pressable testID="dl-row-play" onPress={onToggle} hitSlop={8} style={styles.iconBtn}>
        <Ionicons
          name={isVideo ? 'film' : active && isPlaying ? 'pause-circle' : 'play-circle'}
          size={isVideo ? 26 : 34}
          color={active ? colors.accent : colors.text}
        />
      </Pressable>
      <Pressable testID="dl-row-delete" onPress={askDelete} hitSlop={8} style={styles.iconBtn}>
        <Ionicons name="trash-outline" size={20} color={colors.textDim} />
      </Pressable>
      {onMore ? (
        <Pressable onPress={onMore} hitSlop={8} style={styles.moreBtn}>
          <Ionicons name="ellipsis-vertical" size={18} color={colors.textDim} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.sm },
  texts: { flex: 1, minWidth: 0 },
  title: { color: colors.text, fontSize: 15, fontWeight: '600' },
  artist: { color: colors.textDim, fontSize: 13, marginTop: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  badge: { backgroundColor: colors.surface2, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  badgeText: { color: colors.textDim, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  meta: { color: colors.textFaint, fontSize: 12, fontVariant: ['tabular-nums'] },
  iconBtn: { padding: 2 },
  moreBtn: { paddingVertical: 4, paddingLeft: 2 },
});
