import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import Artwork from './Artwork';
import { colors, space } from '../theme';
import { usePlayer } from '../context/PlayerContext';

export default function MiniPlayer() {
  const navigation = useNavigation();
  const { current, isPlaying, isBuffering, togglePlay, next, position, duration } = usePlayer();
  if (!current) return null;
  const ratio = duration > 0 ? Math.min(1, position / duration) : 0;

  return (
    <View style={styles.wrap}>
      <Pressable style={styles.card} onPress={() => navigation.navigate('Player')}>
        <Artwork uri={current.artwork} size={42} radius={6} />
        <View style={styles.texts}>
          <Text style={styles.title} numberOfLines={1}>
            {current.title}
          </Text>
          <Text style={styles.artist} numberOfLines={1}>
            {current.artist}
          </Text>
        </View>
        <Pressable onPress={togglePlay} hitSlop={10} style={styles.btn}>
          {isBuffering && !isPlaying ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <Ionicons name={isPlaying ? 'pause' : 'play'} size={26} color={colors.text} />
          )}
        </Pressable>
        <Pressable onPress={next} hitSlop={10} style={styles.btn}>
          <Ionicons name="play-skip-forward" size={22} color={colors.text} />
        </Pressable>
        <View style={styles.progressTrack} pointerEvents="none">
          <View style={[styles.progressFill, { width: `${ratio * 100}%` }]} />
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: space.sm, paddingBottom: space.xs, backgroundColor: colors.bg },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.surface2,
    borderRadius: 10,
    padding: space.sm,
    overflow: 'hidden',
  },
  texts: { flex: 1, minWidth: 0 },
  title: { color: colors.text, fontSize: 14, fontWeight: '700' },
  artist: { color: colors.textDim, fontSize: 12, marginTop: 2 },
  btn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  progressTrack: { position: 'absolute', left: 8, right: 8, bottom: 0, height: 2, backgroundColor: colors.border },
  progressFill: { height: 2, backgroundColor: colors.accent },
});
