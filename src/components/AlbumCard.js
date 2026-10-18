import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import Artwork from './Artwork';
import { colors } from '../theme';

export default function AlbumCard({ album, size, onPress }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ width: size }, pressed && { opacity: 0.7 }]}>
      <Artwork uri={album.artwork} size={size} radius={10} />
      <Text style={styles.title} numberOfLines={1}>
        {album.title}
      </Text>
      <Text style={styles.artist} numberOfLines={1}>
        {album.artist}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.text, fontSize: 14, fontWeight: '700', marginTop: 8 },
  artist: { color: colors.textDim, fontSize: 12, marginTop: 2 },
});
