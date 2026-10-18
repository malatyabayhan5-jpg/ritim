import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, space } from '../theme';

export function Loading() {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={colors.accent} />
    </View>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <View style={styles.center}>
      <Ionicons name="cloud-offline-outline" size={44} color={colors.textFaint} />
      <Text style={styles.title}>Bağlantı kurulamadı</Text>
      <Text style={styles.text}>{message || 'İnternet bağlantını kontrol edip tekrar dene.'}</Text>
      {onRetry ? (
        <Pressable onPress={onRetry} style={styles.btn}>
          <Text style={styles.btnText}>Tekrar dene</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function EmptyState({ icon = 'musical-notes-outline', title, text }) {
  return (
    <View style={styles.center}>
      <Ionicons name={icon} size={44} color={colors.textFaint} />
      <Text style={styles.title}>{title}</Text>
      {text ? <Text style={styles.text}>{text}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xxl, gap: space.sm, minHeight: 260 },
  title: { color: colors.text, fontSize: 17, fontWeight: '700', marginTop: space.sm, textAlign: 'center' },
  text: { color: colors.textDim, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  btn: {
    marginTop: space.md,
    backgroundColor: colors.accent,
    paddingHorizontal: space.xl,
    paddingVertical: space.sm + 2,
    borderRadius: radius.pill,
  },
  btnText: { color: colors.onAccent, fontWeight: '700', fontSize: 15 },
});
