import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, formatTime } from '../theme';

export default function SeekBar({ position, duration, onSeek }) {
  const [width, setWidth] = useState(1);
  const [drag, setDrag] = useState(null);

  const ratio = drag !== null ? drag : duration > 0 ? Math.min(1, position / duration) : 0;
  const calc = (x) => Math.max(0, Math.min(1, x / width));

  return (
    <View>
      <View
        style={styles.hit}
        onLayout={(e) => setWidth(Math.max(1, e.nativeEvent.layout.width))}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={(e) => setDrag(calc(e.nativeEvent.locationX))}
        onResponderMove={(e) => setDrag(calc(e.nativeEvent.locationX))}
        onResponderRelease={(e) => {
          const r = calc(e.nativeEvent.locationX);
          setDrag(null);
          if (duration > 0) onSeek(r * duration);
        }}
        onResponderTerminate={() => setDrag(null)}
      >
        <View style={styles.track} pointerEvents="none">
          <View style={[styles.fill, { width: `${ratio * 100}%` }]} />
        </View>
        <View
          pointerEvents="none"
          style={[styles.thumb, drag !== null && styles.thumbActive, { left: ratio * width - (drag !== null ? 9 : 7) }]}
        />
      </View>
      <View style={styles.times}>
        <Text style={styles.time}>{formatTime(drag !== null ? drag * duration : position)}</Text>
        <Text style={styles.time}>{formatTime(duration)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hit: { height: 28, justifyContent: 'center' },
  track: { height: 4, borderRadius: 2, backgroundColor: colors.border, overflow: 'hidden' },
  fill: { height: 4, backgroundColor: colors.accent },
  thumb: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.text,
    top: 7,
  },
  thumbActive: { width: 18, height: 18, borderRadius: 9, top: 5, backgroundColor: colors.accent },
  times: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  time: { color: colors.textDim, fontSize: 12, fontVariant: ['tabular-nums'] },
});
