import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  ToastAndroid,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import DownloadRow from '../components/DownloadRow';
import TrackActionsSheet from '../components/TrackActionsSheet';
import { colors, radius, space, type } from '../theme';
import { isValidAudioUrl, useLibrary } from '../context/LibraryContext';
import { usePlayer } from '../context/PlayerContext';

function toast(msg) {
  if (Platform.OS === 'android') ToastAndroid.show(msg, ToastAndroid.SHORT);
}

function EditInfoModal({ track, onClose, onSave }) {
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');

  useEffect(() => {
    if (track) {
      setTitle(track.title || '');
      setArtist(track.artist || '');
    }
  }, [track]);

  return (
    <Modal visible={!!track} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.modalBox}>
          <Text style={type.h2}>Parça bilgilerini düzenle</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Parça adı"
            placeholderTextColor={colors.textFaint}
            style={styles.input}
            selectionColor={colors.accent}
          />
          <TextInput
            value={artist}
            onChangeText={setArtist}
            placeholder="Sanatçı"
            placeholderTextColor={colors.textFaint}
            style={styles.input}
            selectionColor={colors.accent}
          />
          <View style={styles.modalActions}>
            <Pressable onPress={onClose} style={styles.textBtn}>
              <Text style={styles.textBtnLabel}>Vazgeç</Text>
            </Pressable>
            <Pressable onPress={() => onSave({ title, artist })} style={styles.smallPrimary}>
              <Text style={styles.smallPrimaryText}>Kaydet</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function DownloadScreen({ navigation }) {
  const { downloads, downloadList, pending, progress, downloadFromUrl, updateDownloadInfo, cancelDownload } = useLibrary();
  const { playQueue } = usePlayer();
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [showMore, setShowMore] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sheetTrack, setSheetTrack] = useState(null);
  const [editTrack, setEditTrack] = useState(null);

  const urlDownloads = useMemo(
    () => downloadList.filter((d) => d.track.source === 'url').map((d) => d.track),
    [downloadList]
  );
  const active = useMemo(
    () => Object.values(pending).filter((t) => t.source === 'url'),
    [pending]
  );

  const valid = isValidAudioUrl(url);

  const start = async () => {
    Keyboard.dismiss();
    setError(null);
    if (!valid) {
      setError('Geçerli bir link gir (http:// veya https:// ile başlamalı).');
      return;
    }
    setBusy(true);
    const job = downloadFromUrl(url, { title, artist });
    // Form hemen temizlensin, indirme arka planda sürsün
    setUrl('');
    setTitle('');
    setArtist('');
    setBusy(false);
    const res = await job;
    if (res.ok) {
      toast(`"${res.track.title}" indirildi`);
    } else if (res.cancelled) {
      toast('İndirme iptal edildi');
    } else {
      setError(res.error);
    }
  };

  const header = (
    <View>
      <View style={styles.top}>
        <Text style={[type.bodyDim, { lineHeight: 20 }]}>
          Herkese açık bir .mp3 veya .m4a dosyasının linkini yapıştır. Dosya telefonuna kaydedilir, internet olmadan da çalar.
        </Text>
      </View>

      <View style={styles.form}>
        <View style={[styles.urlWrap, error && { borderColor: colors.danger }]}>
          <Ionicons name="link" size={20} color={colors.textDim} />
          <TextInput
            value={url}
            onChangeText={(t) => {
              setUrl(t);
              if (error) setError(null);
            }}
            placeholder="https://ornek.com/sarki.mp3"
            testID="link-input"
            placeholderTextColor={colors.textFaint}
            style={styles.urlInput}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="go"
            onSubmitEditing={start}
            selectionColor={colors.accent}
          />
          {url ? (
            <Pressable onPress={() => setUrl('')} hitSlop={10}>
              <Ionicons name="close-circle" size={20} color={colors.textFaint} />
            </Pressable>
          ) : null}
        </View>

        <Pressable onPress={() => setShowMore((s) => !s)} style={styles.moreToggle} hitSlop={6}>
          <Ionicons name={showMore ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textDim} />
          <Text style={styles.moreText}>Parça adı ve sanatçı (isteğe bağlı)</Text>
        </Pressable>

        {showMore ? (
          <View style={{ gap: space.sm }}>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Parça adı (boş bırakılırsa dosya adı kullanılır)"
              placeholderTextColor={colors.textFaint}
              style={styles.input}
              selectionColor={colors.accent}
            />
            <TextInput
              value={artist}
              onChangeText={setArtist}
              placeholder="Sanatçı"
              placeholderTextColor={colors.textFaint}
              style={styles.input}
              selectionColor={colors.accent}
            />
          </View>
        ) : null}

        {error ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={18} color={colors.danger} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <Pressable
          testID="link-go"
          onPress={start}
          disabled={busy || !url.trim()}
          style={({ pressed }) => [styles.primary, (!url.trim() || busy) && { opacity: 0.4 }, pressed && { opacity: 0.8 }]}
        >
          {busy ? (
            <ActivityIndicator color={colors.onAccent} />
          ) : (
            <>
              <Ionicons name="arrow-down-circle" size={20} color={colors.onAccent} />
              <Text style={styles.primaryText}>İndir</Text>
            </>
          )}
        </Pressable>
      </View>

      {active.length ? (
        <View style={styles.section}>
          <Text style={[type.label, styles.sectionLabel]}>İndiriliyor</Text>
          {active.map((t) => {
            const p = progress[t.id] || 0;
            return (
              <View key={t.id} style={styles.activeRow}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.activeTitle} numberOfLines={1}>
                    {t.title}
                  </Text>
                  <View style={styles.bar}>
                    <View style={[styles.barFill, { width: `${Math.max(4, p * 100)}%` }]} />
                  </View>
                </View>
                <Text style={styles.percent}>%{Math.round(p * 100)}</Text>
                <Pressable onPress={() => cancelDownload(t.id)} hitSlop={10}>
                  <Ionicons name="close-circle" size={22} color={colors.textDim} />
                </Pressable>
              </View>
            );
          })}
        </View>
      ) : null}

      <View style={[styles.section, styles.listHead]}>
        <Text style={[type.label, styles.sectionLabel]}>Linkten indirilenler · {urlDownloads.length}</Text>
        <Pressable onPress={() => navigation.navigate('Playlist', { kind: 'downloads' })} hitSlop={8}>
          <Text style={styles.link}>Tüm indirilenler</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.titleBar}>
        <Text style={type.h1}>İndir</Text>
      </View>
      <FlatList
        data={urlDownloads}
        keyExtractor={(t) => t.id}
        ListHeaderComponent={header}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: space.xxl }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="cloud-download-outline" size={40} color={colors.textFaint} />
            <Text style={styles.emptyText}>Linkten indirdiğin parçalar burada görünecek.</Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <DownloadRow entry={downloads[item.id]} onPlay={() => playQueue(urlDownloads, index)} onMore={() => setSheetTrack(item)} />
        )}
      />
      <TrackActionsSheet
        track={sheetTrack}
        onClose={() => setSheetTrack(null)}
        extraActions={
          sheetTrack
            ? [{ icon: 'create-outline', label: 'Bilgileri düzenle', onPress: () => setEditTrack(sheetTrack) }]
            : []
        }
      />
      <EditInfoModal
        track={editTrack}
        onClose={() => setEditTrack(null)}
        onSave={(patch) => {
          updateDownloadInfo(editTrack.id, patch);
          setEditTrack(null);
          toast('Kaydedildi');
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  top: { paddingHorizontal: space.lg, paddingTop: space.md },
  titleBar: { paddingHorizontal: space.lg, paddingTop: space.lg, gap: space.md },
  segment: { flexDirection: 'row', backgroundColor: colors.surface2, borderRadius: radius.pill, padding: 4 },
  segBtn: { flex: 1, paddingVertical: 9, borderRadius: radius.pill, alignItems: 'center' },
  segBtnOn: { backgroundColor: colors.text },
  segText: { color: colors.textDim, fontSize: 14, fontWeight: '700' },
  segTextOn: { color: colors.onAccent },
  form: { paddingHorizontal: space.lg, marginTop: space.lg, gap: space.md },
  urlWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space.md,
    height: 50,
  },
  urlInput: { flex: 1, color: colors.text, fontSize: 15, paddingVertical: 0 },
  moreToggle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  moreText: { color: colors.textDim, fontSize: 13, fontWeight: '600' },
  input: {
    backgroundColor: colors.surface2,
    color: colors.text,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    fontSize: 15,
  },
  errorBox: {
    flexDirection: 'row',
    gap: space.sm,
    alignItems: 'flex-start',
    backgroundColor: 'rgba(242,85,90,0.12)',
    borderRadius: radius.md,
    padding: space.md,
  },
  errorText: { flex: 1, color: colors.text, fontSize: 13, lineHeight: 19 },
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    height: 50,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  primaryText: { color: colors.onAccent, fontSize: 16, fontWeight: '800' },
  section: { marginTop: space.xl },
  sectionLabel: { paddingHorizontal: space.lg, marginBottom: space.sm },
  listHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingRight: space.lg },
  link: { color: colors.accent, fontSize: 13, fontWeight: '700', marginBottom: space.sm },
  activeRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.sm },
  activeTitle: { color: colors.text, fontSize: 14, fontWeight: '600', marginBottom: 6 },
  bar: { height: 4, borderRadius: 2, backgroundColor: colors.border, overflow: 'hidden' },
  barFill: { height: 4, backgroundColor: colors.accent },
  percent: { color: colors.accent, fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'], minWidth: 40, textAlign: 'right' },
  empty: { alignItems: 'center', padding: space.xxl, gap: space.md },
  emptyText: { color: colors.textDim, fontSize: 14, textAlign: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: space.xl },
  modalBox: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.xl, gap: space.md },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.sm, marginTop: space.xs },
  textBtn: { paddingHorizontal: space.lg, paddingVertical: space.sm + 2 },
  textBtnLabel: { color: colors.textDim, fontSize: 15, fontWeight: '600' },
  smallPrimary: { backgroundColor: colors.accent, paddingHorizontal: space.lg, paddingVertical: space.sm + 2, borderRadius: radius.pill },
  smallPrimaryText: { color: colors.onAccent, fontSize: 15, fontWeight: '700' },
});
