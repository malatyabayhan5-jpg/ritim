import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Artwork from './Artwork';
import { colors, formatTime, space } from '../theme';
import { useLibrary } from '../context/LibraryContext';
import { usePlayer } from '../context/PlayerContext';

export default function TrackRow({ track, onPress, onMore, showArtwork = true, number }) {
  const { isDownloaded, progress } = useLibrary();
  const { current, isPlaying } = usePlayer();
  const active = current && current.id === track.id;
  const downloaded = isDownloaded(track.id);
  const p = progress[track.id];

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onMore}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      android_ripple={{ color: colors.surface2 }}
    >
      {showArtwork ? (
        <View>
          <Artwork uri={track.artwork} size={50} radius={6} />
          {active ? (
            <View style={styles.playingBadge}>
              <Ionicons name={isPlaying ? 'volume-high' : 'pause'} size={16} color={colors.accent} />
            </View>
          ) : null}
        </View>
      ) : (
        <View style={styles.numberBox}>
          {active ? (
            <Ionicons name={isPlaying ? 'volume-high' : 'pause'} size={16} color={colors.accent} />
          ) : (
            <Text style={styles.number}>{number}</Text>
          )}
        </View>
      )}

      <View style={styles.texts}>
        <Text style={[styles.title, active && { color: colors.accent }]} numberOfLines={1}>
          {track.title}
        </Text>
        <View style={styles.metaRow}>
          {downloaded ? <Ionicons name="arrow-down-circle" size={14} color={colors.accent} style={{ marginRight: 4 }} /> : null}
          {p !== undefined ? <Text style={styles.progress}>%{Math.round(p * 100)} · </Text> : null}
          <Text style={styles.meta} numberOfLines={1}>
            {track.artist}
            {track.duration ? ` · ${formatTime(track.duration)}` : ''}
          </Text>
        </View>
      </View>

      {onMore ? (
        <Pressable onPress={onMore} hitSlop={12} style={styles.more}>
          <Ionicons name="ellipsis-vertical" size={18} color={colors.textDim} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    gap: space.md,
  },
  pressed: { backgroundColor: colors.surface },
  playingBadge: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberBox: { width: 28, alignItems: 'center' },
  number: { color: colors.textDim, fontSize: 14, fontVariant: ['tabular-nums'] },
  texts: { flex: 1, minWidth: 0 },
  title: { color: colors.text, fontSize: 15, fontWeight: '600' },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  meta: { color: colors.textDim, fontSize: 13, flexShrink: 1 },
  progress: { color: colors.accent, fontSize: 13, fontWeight: '700' },
  more: { padding: 4 },
});
