import React, { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, space, type } from '../theme';
import { getConfig, saveConfig, testConnection } from '../services/mediaService';

export default function ServiceSettings({ visible, onClose, onSaved }) {
  const [mode, setMode] = useState('mock');
  const [baseUrl, setBaseUrl] = useState('');
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!visible) return;
    const c = getConfig();
    setMode(c.mode);
    setBaseUrl(c.baseUrl);
    setToken(c.token);
    setResult(null);
    setError(null);
  }, [visible]);

  const validate = () => {
    if (mode === 'api' && !/^https?:\/\/[^\s]+$/i.test(baseUrl.trim())) {
      setError('Sunucu adresi http:// veya https:// ile başlamalı. Örnek: https://api.ornek.com');
      return false;
    }
    setError(null);
    return true;
  };

  const save = async () => {
    if (!validate()) return;
    const c = await saveConfig({ mode, baseUrl, token });
    onSaved && onSaved(c);
    onClose();
  };

  const test = async () => {
    if (!validate()) return;
    setTesting(true);
    setResult(null);
    await saveConfig({ mode, baseUrl, token });
    const r = await testConnection();
    setResult(r);
    setTesting(false);
    onSaved && onSaved(getConfig());
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: space.lg }}>
            <View style={styles.headRow}>
              <Text style={type.h2}>Arama servisi</Text>
              <Pressable onPress={onClose} hitSlop={10}>
                <Ionicons name="close" size={24} color={colors.textDim} />
              </Pressable>
            </View>

            <View style={styles.segment}>
              {[
                ['mock', 'Deneme (mock)'],
                ['api', 'Kendi API\'m'],
              ].map(([key, label]) => (
                <Pressable key={key} onPress={() => setMode(key)} style={[styles.segBtn, mode === key && styles.segBtnOn]}>
                  <Text style={[styles.segText, mode === key && styles.segTextOn]}>{label}</Text>
                </Pressable>
              ))}
            </View>

            {mode === 'mock' ? (
              <Text style={styles.help}>
                Harici sunucu gerekmez. Arama örnek kayıtlar döndürür ("örnek" yazınca hepsi gelir); indirmeler herkese açık
                test MP3'leriyle gerçekten yapılır.
              </Text>
            ) : (
              <View style={{ gap: space.md }}>
                <View>
                  <Text style={styles.label}>Sunucu adresi</Text>
                  <TextInput
                    value={baseUrl}
                    onChangeText={setBaseUrl}
                    placeholder="https://api.ornek.com"
                    placeholderTextColor={colors.textFaint}
                    style={styles.input}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    selectionColor={colors.accent}
                  />
                </View>
                <View>
                  <Text style={styles.label}>Erişim anahtarı (isteğe bağlı)</Text>
                  <View style={styles.tokenRow}>
                    <TextInput
                      value={token}
                      onChangeText={setToken}
                      placeholder="Bearer anahtarı"
                      placeholderTextColor={colors.textFaint}
                      style={[styles.input, { flex: 1 }]}
                      autoCapitalize="none"
                      autoCorrect={false}
                      secureTextEntry={!showToken}
                      selectionColor={colors.accent}
                    />
                    <Pressable onPress={() => setShowToken((s) => !s)} hitSlop={8} style={styles.eye}>
                      <Ionicons name={showToken ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textDim} />
                    </Pressable>
                  </View>
                </View>
                <Text style={styles.help}>
                  Beklenen uç noktalar:{'\n'}GET /search?q=... → sonuç listesi{'\n'}GET /media/{'{id}'}/download → {'{ url, mimeType?, ext? }'}
                </Text>
              </View>
            )}

            {error ? (
              <View style={[styles.note, styles.noteBad]}>
                <Ionicons name="alert-circle" size={18} color={colors.danger} />
                <Text style={styles.noteText}>{error}</Text>
              </View>
            ) : null}
            {result ? (
              <View style={[styles.note, result.ok ? styles.noteGood : styles.noteBad]}>
                <Ionicons name={result.ok ? 'checkmark-circle' : 'alert-circle'} size={18} color={result.ok ? colors.accent : colors.danger} />
                <Text style={styles.noteText}>{result.message}</Text>
              </View>
            ) : null}

            <View style={styles.actions}>
              <Pressable onPress={test} style={styles.secondary} disabled={testing}>
                {testing ? <ActivityIndicator color={colors.text} /> : <Text style={styles.secondaryText}>Bağlantıyı test et</Text>}
              </Pressable>
              <Pressable onPress={save} style={styles.primary}>
                <Text style={styles.primaryText}>Kaydet</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: space.xl,
    paddingBottom: space.xxl,
    maxHeight: '90%',
  },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  segment: { flexDirection: 'row', backgroundColor: colors.surface2, borderRadius: radius.pill, padding: 4 },
  segBtn: { flex: 1, paddingVertical: 9, borderRadius: radius.pill, alignItems: 'center' },
  segBtnOn: { backgroundColor: colors.text },
  segText: { color: colors.textDim, fontSize: 14, fontWeight: '700' },
  segTextOn: { color: colors.onAccent },
  label: { color: colors.textDim, fontSize: 12, fontWeight: '700', marginBottom: 6, letterSpacing: 0.4 },
  input: {
    backgroundColor: colors.surface2,
    color: colors.text,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    fontSize: 15,
  },
  tokenRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  eye: { padding: space.sm },
  help: { color: colors.textDim, fontSize: 13, lineHeight: 20 },
  note: { flexDirection: 'row', gap: space.sm, padding: space.md, borderRadius: radius.md, alignItems: 'flex-start' },
  noteBad: { backgroundColor: 'rgba(242,85,90,0.12)' },
  noteGood: { backgroundColor: colors.accentDim },
  noteText: { flex: 1, color: colors.text, fontSize: 13, lineHeight: 19 },
  actions: { flexDirection: 'row', gap: space.sm },
  secondary: {
    flex: 1,
    height: 48,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { color: colors.text, fontWeight: '700', fontSize: 14 },
  primary: { flex: 1, height: 48, borderRadius: radius.pill, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: colors.onAccent, fontWeight: '800', fontSize: 15 },
});
