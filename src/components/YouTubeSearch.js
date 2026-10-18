import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { colors, formatTime, radius, space, type } from '../theme';
import {
  getYouTubeSettings,
  loadYouTubeSettings,
  parseYouTubeId,
  saveYouTubeSettings,
  searchUrl,
  searchYouTube,
} from '../services/youtubeService';

function KeySettings({ visible, onClose, onSaved }) {
  const [apiKey, setApiKey] = useState('');
  const [cc, setCc] = useState(false);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const s = getYouTubeSettings();
    setApiKey(s.apiKey);
    setCc(!!s.creativeCommonsOnly);
  }, [visible]);

  const save = async () => {
    const s = await saveYouTubeSettings({ apiKey, creativeCommonsOnly: cc });
    onSaved(s);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.sheetHead}>
            <Text style={type.h2}>YouTube araması</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={24} color={colors.textDim} />
            </Pressable>
          </View>
          <Text style={styles.help}>
            Anahtar isteğe bağlıdır. Anahtar yokken aramalar YouTube uygulamasında açılır; video linki yapıştırırsan video
            burada oynatılır.
          </Text>
          <Text style={styles.label}>YouTube Data API anahtarı</Text>
          <View style={styles.keyRow}>
            <TextInput
              value={apiKey}
              onChangeText={setApiKey}
              placeholder="AIza..."
              placeholderTextColor={colors.textFaint}
              style={[styles.field, { flex: 1 }]}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry={!show}
              selectionColor={colors.accent}
            />
            <Pressable onPress={() => setShow((v) => !v)} hitSlop={8} style={{ padding: space.sm }}>
              <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textDim} />
            </Pressable>
          </View>
          <Text style={styles.help} selectable>
            Anahtar almak için: console.cloud.google.com → yeni proje → "YouTube Data API v3"ü etkinleştir → Kimlik bilgileri →
            API anahtarı oluştur. Ücretsizdir, kart gerekmez; kart isteyen "Ücretsiz deneme" ekranını atlayabilirsin. Günlük kota
            yaklaşık 100 aramaya yeter.
          </Text>
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.switchTitle}>Yalnızca Creative Commons</Text>
              <Text style={styles.help}>Sadece CC lisanslı videoları göster</Text>
            </View>
            <Switch value={cc} onValueChange={setCc} trackColor={{ true: colors.accent, false: colors.border }} thumbColor={colors.text} />
          </View>
          <Pressable onPress={save} style={styles.primary}>
            <Text style={styles.primaryText}>Kaydet</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function YouTubeSearch() {
  const navigation = useNavigation();
  const [settings, setSettings] = useState(getYouTubeSettings());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [nextToken, setNextToken] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [searched, setSearched] = useState(false);
  const lastQuery = useRef('');
  const reqId = useRef(0);

  useEffect(() => {
    loadYouTubeSettings().then(setSettings);
  }, []);

  const run = async () => {
    const q = query.trim();
    if (!q) {
      setError('Aramak için bir şey yaz.');
      return;
    }
    Keyboard.dismiss();

    // Yapıştırılmış YouTube linki: anahtar gerekmeden resmi oynatıcıda aç
    const videoId = parseYouTubeId(q);
    if (videoId) {
      navigation.navigate('YouTubePlayer', { video: { id: videoId, title: 'YouTube videosu', channel: '', duration: 0 } });
      return;
    }

    // Anahtar yoksa aramayı YouTube'un kendisinde aç
    if (!settings.apiKey) {
      Linking.openURL(searchUrl(q)).catch(() => setError('YouTube açılamadı.'));
      return;
    }

    if (q === lastQuery.current && searched && !error) return; // aynı sorguyu tekrar gönderme (kota korunur)
    if (loading) return;
    const id = ++reqId.current;
    lastQuery.current = q;
    setLoading(true);
    setError(null);
    try {
      const r = await searchYouTube(q);
      if (id !== reqId.current) return;
      setResults(r.results);
      setNextToken(r.nextPageToken);
      setSearched(true);
    } catch (e) {
      if (id !== reqId.current) return;
      setError(e.message);
      setResults([]);
      lastQuery.current = '';
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  };

  const more = async () => {
    if (!nextToken || loadingMore || loading) return;
    setLoadingMore(true);
    try {
      const r = await searchYouTube(lastQuery.current, { pageToken: nextToken });
      setResults((prev) => {
        const seen = new Set(prev.map((x) => x.id));
        return [...prev, ...r.results.filter((x) => !seen.has(x.id))];
      });
      setNextToken(r.nextPageToken);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.searchBar}>
        <View style={styles.inputWrap}>
          <Ionicons name="logo-youtube" size={20} color="#FF3B30" />
          <TextInput
            value={query}
            onChangeText={(t) => {
              setQuery(t);
              if (error) setError(null);
            }}
            placeholder={settings.apiKey ? "YouTube'da ara veya link yapıştır" : 'Ara (YouTube\'da açılır) veya link yapıştır'}
            placeholderTextColor={colors.textFaint}
            style={styles.input}
            returnKeyType="search"
            onSubmitEditing={run}
            autoCorrect={false}
            selectionColor={colors.accent}
          />
          {query ? (
            <Pressable onPress={() => setQuery('')} hitSlop={10}>
              <Ionicons name="close-circle" size={18} color={colors.textFaint} />
            </Pressable>
          ) : null}
          <Pressable onPress={run} disabled={loading} style={[styles.goBtn, (!query.trim() || loading) && { opacity: 0.4 }]}>
            {loading ? <ActivityIndicator size="small" color={colors.onAccent} /> : <Text style={styles.goText}>Ara</Text>}
          </Pressable>
        </View>
        <Pressable onPress={() => setSettingsOpen(true)} hitSlop={10} style={styles.gear}>
          <Ionicons name="settings-outline" size={22} color={colors.text} />
        </Pressable>
      </View>

      {settings.creativeCommonsOnly ? <Text style={styles.filterNote}>Yalnızca Creative Commons videolar gösteriliyor</Text> : null}

      {error ? (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle" size={18} color={colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <FlatList
        data={results}
        keyExtractor={(v) => v.id}
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={Keyboard.dismiss}
        onEndReachedThreshold={0.4}
        onEndReached={more}
        contentContainerStyle={{ paddingBottom: space.xxl }}
        ListEmptyComponent={
          loading ? null : (
            <View style={styles.empty}>
              <Ionicons name={searched ? 'search-outline' : 'logo-youtube'} size={40} color={colors.textFaint} />
              <Text style={styles.emptyTitle}>
                {searched ? 'Sonuç bulunamadı' : 'YouTube\'da ara'}
              </Text>
              <Text style={styles.emptyText}>
                {searched
                  ? 'Başka bir kelime dene.'
                  : settings.apiKey
                  ? 'Videolar YouTube\'un resmi oynatıcısıyla açılır.'
                  : 'Yazdığın aramayı YouTube uygulamasında açarım. Bir video linki yapıştırırsan burada oynatırım. Sonuçları uygulama içinde görmek için ⚙ menüsünden ücretsiz bir API anahtarı ekleyebilirsin.'}
              </Text>
            </View>
          )
        }
        ListFooterComponent={loadingMore ? <ActivityIndicator style={{ margin: space.lg }} color={colors.accent} /> : null}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => navigation.navigate('YouTubePlayer', { video: item })}
            style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surface }]}
            android_ripple={{ color: colors.surface2 }}
          >
            <View>
              {item.thumbnail ? (
                <Image source={{ uri: item.thumbnail }} style={styles.thumb} />
              ) : (
                <View style={[styles.thumb, { alignItems: 'center', justifyContent: 'center' }]}>
                  <Ionicons name="logo-youtube" size={22} color={colors.textFaint} />
                </View>
              )}
              {item.live ? (
                <View style={[styles.duration, { backgroundColor: '#CC0000' }]}>
                  <Text style={styles.durationText}>CANLI</Text>
                </View>
              ) : item.duration ? (
                <View style={styles.duration}>
                  <Text style={styles.durationText}>{formatTime(item.duration)}</Text>
                </View>
              ) : null}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.title} numberOfLines={2}>
                {item.title}
              </Text>
              <Text style={styles.channel} numberOfLines={1}>
                {item.channel}
              </Text>
              {item.license === 'creativeCommon' ? <Text style={styles.cc}>CC</Text> : null}
            </View>
          </Pressable>
        )}
      />

      <KeySettings
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSaved={(s) => {
          setSettings(s);
          lastQuery.current = '';
          setError(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingBottom: space.sm },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingLeft: space.md,
    paddingRight: 5,
    height: 48,
  },
  input: { flex: 1, color: colors.text, fontSize: 15, paddingVertical: 0 },
  goBtn: { backgroundColor: colors.accent, borderRadius: radius.sm + 2, paddingHorizontal: space.md, height: 36, alignItems: 'center', justifyContent: 'center', minWidth: 52 },
  goText: { color: colors.onAccent, fontWeight: '800', fontSize: 14 },
  gear: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  filterNote: { color: colors.accent, fontSize: 12, fontWeight: '700', paddingHorizontal: space.lg, paddingBottom: space.sm },
  errorBox: {
    flexDirection: 'row',
    gap: space.sm,
    marginHorizontal: space.lg,
    marginBottom: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: 'rgba(242,85,90,0.12)',
  },
  errorText: { flex: 1, color: colors.text, fontSize: 13, lineHeight: 19 },
  row: { flexDirection: 'row', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.sm },
  thumb: { width: 140, height: 79, borderRadius: 8, backgroundColor: colors.surface2 },
  duration: { position: 'absolute', right: 4, bottom: 4, backgroundColor: 'rgba(0,0,0,0.8)', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 },
  durationText: { color: '#fff', fontSize: 11, fontWeight: '700', fontVariant: ['tabular-nums'] },
  title: { color: colors.text, fontSize: 14, fontWeight: '600', lineHeight: 19 },
  channel: { color: colors.textDim, fontSize: 12, marginTop: 4 },
  cc: { color: colors.accent, fontSize: 10, fontWeight: '800', marginTop: 4, letterSpacing: 0.5 },
  empty: { alignItems: 'center', padding: space.xxl, gap: space.sm },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: '700', marginTop: space.sm },
  emptyText: { color: colors.textDim, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: space.xl, gap: space.md, paddingBottom: space.xxl },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { color: colors.textDim, fontSize: 12, fontWeight: '700', letterSpacing: 0.4 },
  keyRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  field: { backgroundColor: colors.surface2, color: colors.text, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.md, fontSize: 15 },
  help: { color: colors.textDim, fontSize: 12, lineHeight: 18 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  switchTitle: { color: colors.text, fontSize: 15, fontWeight: '600' },
  primary: { height: 48, borderRadius: radius.pill, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', marginTop: space.sm },
  primaryText: { color: colors.onAccent, fontWeight: '800', fontSize: 15 },
});
