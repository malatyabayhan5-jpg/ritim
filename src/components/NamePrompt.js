import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radius, space } from '../theme';

export default function NamePrompt({ visible, title, initial = '', confirmLabel = 'Oluştur', onCancel, onConfirm }) {
  const [value, setValue] = useState(initial);

  useEffect(() => {
    if (visible) setValue(initial);
  }, [visible, initial]);

  const submit = () => {
    if (!value.trim()) return;
    onConfirm(value.trim());
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
        <View style={styles.box}>
          <Text style={styles.title}>{title}</Text>
          <TextInput
            value={value}
            onChangeText={setValue}
            placeholder="Liste adı"
            testID="name-input"
            placeholderTextColor={colors.textFaint}
            style={styles.input}
            autoFocus
            maxLength={60}
            returnKeyType="done"
            onSubmitEditing={submit}
            selectionColor={colors.accent}
          />
          <View style={styles.actions}>
            <Pressable onPress={onCancel} style={styles.btn}>
              <Text style={styles.cancel}>Vazgeç</Text>
            </Pressable>
            <Pressable testID="name-confirm" onPress={submit} style={[styles.btn, styles.primary, !value.trim() && { opacity: 0.4 }]}>
              <Text style={styles.primaryText}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: space.xl },
  box: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.xl, gap: space.lg },
  title: { color: colors.text, fontSize: 18, fontWeight: '700' },
  input: {
    backgroundColor: colors.surface2,
    color: colors.text,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    fontSize: 16,
  },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.sm },
  btn: { paddingHorizontal: space.lg, paddingVertical: space.sm + 2, borderRadius: radius.pill },
  cancel: { color: colors.textDim, fontSize: 15, fontWeight: '600' },
  primary: { backgroundColor: colors.accent },
  primaryText: { color: colors.onAccent, fontSize: 15, fontWeight: '700' },
});
