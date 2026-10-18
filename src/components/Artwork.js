import React, { useState } from 'react';
import { Image, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';

export default function Artwork({ uri, size, radius = 8, style }) {
  const [failed, setFailed] = useState(false);
  const box = { width: size, height: size, borderRadius: radius, backgroundColor: colors.surface2 };

  if (!uri || failed) {
    return (
      <View style={[box, { alignItems: 'center', justifyContent: 'center' }, style]}>
        <Ionicons name="musical-notes" size={Math.max(16, size * 0.38)} color={colors.textFaint} />
      </View>
    );
  }
  return <Image source={{ uri }} onError={() => setFailed(true)} style={[box, style]} resizeMode="cover" />;
}
