import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, space } from '../theme';

export default function VolumeBar({ value, onChange }) {
  const [width, setWidth] = useState(1);
  const [drag, setDrag] = useState(null);
  const [lastNonZero, setLastNonZero] = useState(1);
  const v = drag !== null ? drag : value;
  const calc = (x) => Math.max(0, Math.min(1, x / width));

  const commit = (r) => {
    if (r > 0) setLastNonZero(r);
    onChange(r);
  };

  return (
    <View style={styles.row}>
      <Pressable onPress={() => commit(v > 0 ? 0 : lastNonZero || 1)} hitSlop={10}>
        <Ionicons name={v === 0 ? 'volume-mute' : v < 0.5 ? 'volume-low' : 'volume-medium'} size={20} color={colors.textDim} />
      </Pressable>
      <View
        style={styles.hit}
        onLayout={(e) => setWidth(Math.max(1, e.nativeEvent.layout.width))}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={(e) => {
          const r = calc(e.nativeEvent.locationX);
          setDrag(r);
          onChange(r);
        }}
        onResponderMove={(e) => {
          const r = calc(e.nativeEvent.locationX);
          setDrag(r);
          onChange(r);
        }}
        onResponderRelease={(e) => {
          commit(calc(e.nativeEvent.locationX));
          setDrag(null);
        }}
        onResponderTerminate={() => setDrag(null)}
      >
        <View style={styles.track} pointerEvents="none">
          <View style={[styles.fill, { width: `${v * 100}%` }]} />
        </View>
        <View pointerEvents="none" style={[styles.thumb, { left: v * width - 6 }]} />
      </View>
      <Ionicons name="volume-high" size={20} color={colors.textDim} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  hit: { flex: 1, height: 28, justifyContent: 'center' },
  track: { height: 3, borderRadius: 2, backgroundColor: colors.border, overflow: 'hidden' },
  fill: { height: 3, backgroundColor: colors.textDim },
  thumb: { position: 'absolute', width: 12, height: 12, borderRadius: 6, backgroundColor: colors.text, top: 8 },
});
