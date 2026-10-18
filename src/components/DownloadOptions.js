// İndirme seçenekleri menüsü.
// İndirme simgesine basıldığında doğrudan indirmez; önce "Video indir / Yalnızca ses indir / İptal"
// menüsünü, ardından kaynağın GERÇEKTEN sunduğu biçimleri (boyutlarıyla) gösterir.
// Aynı içerik zaten indirilmişse "Aç" ve "Sil" seçenekleri sunulur.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, ToastAndroid, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Artwork from './Artwork';
import { colors, radius, space } from '../theme';
import { formatBytes } from '../services/formats';
import { canDownload, loadOptionsFor } from '../services/downloadSources';
import { useLibrary } from '../context/LibraryContext';
import { usePlayer } from '../context/PlayerContext';
import { navigate } from '../navigation';

function toast(msg) {
  if (Platform.OS === 'android') ToastAndroid.show(msg, ToastAndroid.SHORT);
}

const Ctx = createContext(null);

function Row({ icon, title, subtitle, right, onPress, disabled, danger, testID }) {
  return (
    <Pressable
      testID={testID}
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [styles.row, pressed && !disabled && { backgroundColor: colors.surface2 }, disabled && { opacity: 0.45 }]}
    >
      <View style={[styles.rowIcon, danger && { backgroundColor: 'rgba(242,85,90,0.14)' }]}>
        <Ionicons name={icon} size={20} color={danger ? colors.danger : colors.accent} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.rowTitle, danger && { color: colors.danger }]}>{title}</Text>
        {subtitle ? (
          <Text style={styles.rowSub} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </Pressable>
  );
}

function OptionsSheet({ request, onClose }) {
  const insets = useSafeAreaInsets();
  const lib = useLibrary();
  const { playQueue } = usePlayer();
  const [step, setStep] = useState('menu'); // menu | video | audio
  const [opts, setOpts] = useState(null);
  const [error, setError] = useState(null);

  const track = request ? request.track : null;
  const baseId = track ? track.baseId || track.id : null;
  const existing = track ? lib.downloadsFor(baseId) : [];

  useEffect(() => {
    if (!request) return undefined;
    let alive = true;
    setStep('menu');
    setOpts(null);
    setError(null);
    loadOptionsFor(request.track)
      .then((o) => alive && setOpts(o))
      .catch((e) => alive && setError((e && e.message) || 'Biçimler alınamadı.'));
    return () => {
      alive = false;
    };
  }, [request]);

  if (!request) return null;

  const openEntry = (entry) => {
    onClose();
    if (entry.track.kind === 'video') navigate('VideoPlayer', { id: entry.track.id });
    else playQueue([entry.track], 0);
  };

  const deleteEntry = (entry) => {
    Alert.alert('Dosyayı sil', `"${entry.track.title}" (${entry.track.quality || entry.track.ext}) telefondan silinsin mi?`, [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: () => lib.removeDownload(entry.track.id) },
    ]);
  };

  const existingFor = (o) => {
    const key = o.key === 'video-best' ? `video-${o.height || 'best'}` : o.key;
    return lib.downloads[`${baseId}#${key}`];
  };

  const start = async (o) => {
    onClose();
    toast('İndirme başladı');
    const res = await lib.downloadOption(track, o);
    if (res.ok) toast(`İndirildi: ${res.track.title} (${res.track.quality})`);
    else if (res.cancelled) toast('İndirme iptal edildi');
    else toast(res.error || 'İndirme başarısız oldu');
  };

  const videoCount = opts ? opts.video.filter((o) => !o.best).length : 0;
  const audioCount = opts ? opts.audio.length : 0;

  const optionRow = (o) => {
    const done = existingFor(o);
    const busy = lib.progress[`${baseId}#${o.key === 'video-best' ? `video-${o.height || 'best'}` : o.key}`] !== undefined;
    const size = formatBytes(o.size);
    return (
      <Row
        key={o.key}
        testID={`opt-${o.key}`}
        icon={o.kind === 'video' ? (o.best ? 'sparkles-outline' : 'film-outline') : o.original ? 'disc-outline' : 'musical-note-outline'}
        title={o.label}
        subtitle={[o.detail, o.ext ? o.ext.toUpperCase() : null, size || 'boyut bilinmiyor'].filter(Boolean).join(' · ')}
        onPress={() => (done ? openEntry(done) : busy ? null : start(o))}
        right={
          done ? (
            <Text style={styles.doneTag}>İndirildi · Aç</Text>
          ) : busy ? (
            <Text style={styles.doneTag}>İndiriliyor</Text>
          ) : (
            <Ionicons name="arrow-down-circle-outline" size={24} color={colors.textDim} />
          )
        }
      />
    );
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View testID="dl-sheet" style={[styles.sheet, { paddingBottom: insets.bottom + space.md }]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Artwork uri={track.artwork} size={48} radius={6} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.title} numberOfLines={1}>
                {track.title}
              </Text>
              <Text style={styles.sub} numberOfLines={1}>
                {step === 'video' ? 'Video kalitesi seç' : step === 'audio' ? 'Ses biçimi seç' : 'İndirme seçenekleri'}
              </Text>
            </View>
            {step !== 'menu' ? (
              <Pressable onPress={() => setStep('menu')} hitSlop={10}>
                <Ionicons name="chevron-back" size={22} color={colors.textDim} />
              </Pressable>
            ) : null}
          </View>

          <ScrollView style={{ maxHeight: 440 }}>
            {step === 'menu' ? (
              <View>
                {existing.length ? (
                  <View style={styles.existing}>
                    <Text style={styles.sectionLabel}>Zaten indirildi</Text>
                    {existing.map((e) => (
                      <View key={e.track.id} style={styles.existingRow}>
                        <Ionicons name={e.track.kind === 'video' ? 'film' : 'musical-note'} size={18} color={colors.accent} />
                        <Text style={styles.existingText} numberOfLines={1}>
                          {e.track.quality || (e.track.ext || '').toUpperCase()} · {formatBytes(e.size) || ''}
                        </Text>
                        <Pressable onPress={() => openEntry(e)} hitSlop={6} style={styles.pillBtn}>
                          <Text style={styles.pillText}>Aç</Text>
                        </Pressable>
                        <Pressable onPress={() => deleteEntry(e)} hitSlop={6} style={[styles.pillBtn, styles.pillDanger]}>
                          <Text style={[styles.pillText, { color: colors.danger }]}>Sil</Text>
                        </Pressable>
                      </View>
                    ))}
                  </View>
                ) : null}

                {error ? (
                  <View style={styles.errorBox}>
                    <Ionicons name="alert-circle" size={18} color={colors.danger} />
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                ) : null}

                {!opts && !error ? (
                  <View style={styles.loading}>
                    <ActivityIndicator color={colors.accent} />
                    <Text style={styles.rowSub}>Kaynaktaki biçimler kontrol ediliyor…</Text>
                  </View>
                ) : null}

                {opts ? (
                  <>
                    <Row
                      testID="dl-video"
                      icon="film-outline"
                      title="Video indir"
                      subtitle={videoCount ? `Görüntü ve ses birlikte · ${videoCount} kalite` : 'Bu kaynak video dosyası sunmuyor'}
                      disabled={!videoCount}
                      onPress={() => setStep('video')}
                      right={videoCount ? <Ionicons name="chevron-forward" size={18} color={colors.textDim} /> : null}
                    />
                    <Row
                      testID="dl-audio"
                      icon="musical-notes-outline"
                      title="Yalnızca ses indir"
                      subtitle={audioCount ? `Görüntü olmadan · ${audioCount} biçim` : 'Bu kaynak ayrı bir ses dosyası sunmuyor'}
                      disabled={!audioCount}
                      onPress={() => setStep('audio')}
                      right={audioCount ? <Ionicons name="chevron-forward" size={18} color={colors.textDim} /> : null}
                    />
                  </>
                ) : null}
                <Row testID="dl-cancel" icon="close" title="İptal" onPress={onClose} danger />
              </View>
            ) : (
              <View>
                {(step === 'video' ? opts.video : opts.audio).map(optionRow)}
                <Text style={styles.footNote}>
                  Yalnızca kaynağın sunduğu biçimler listelenir; telefonda dönüştürme yapılmaz.
                </Text>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export function DownloadOptionsProvider({ children }) {
  const [request, setRequest] = useState(null);

  const openDownloadOptions = useCallback((track) => {
    if (!canDownload(track)) {
      toast(track && track.source === 'youtube' ? 'YouTube içerikleri indirilemez' : 'Bu dosya zaten telefonda');
      return;
    }
    setRequest({ track, at: Date.now() });
  }, []);

  const value = useMemo(() => ({ openDownloadOptions }), [openDownloadOptions]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <OptionsSheet request={request} onClose={() => setRequest(null)} />
    </Ctx.Provider>
  );
}

export function useDownloadOptions() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useDownloadOptions, DownloadOptionsProvider içinde kullanılmalı');
  return ctx;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingTop: space.sm },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: space.md },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  title: { color: colors.text, fontSize: 16, fontWeight: '700' },
  sub: { color: colors.textDim, fontSize: 13, marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: 12 },
  rowIcon: { width: 38, height: 38, borderRadius: 10, backgroundColor: colors.accentDim, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { color: colors.text, fontSize: 15, fontWeight: '600' },
  rowSub: { color: colors.textDim, fontSize: 12, marginTop: 2, lineHeight: 17 },
  doneTag: { color: colors.accent, fontSize: 12, fontWeight: '800' },
  loading: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg },
  existing: { paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.sm, gap: space.sm },
  sectionLabel: { color: colors.textDim, fontSize: 11, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' },
  existingRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  existingText: { flex: 1, color: colors.text, fontSize: 13, fontVariant: ['tabular-nums'] },
  pillBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: colors.surface2 },
  pillDanger: { backgroundColor: 'rgba(242,85,90,0.12)' },
  pillText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  errorBox: { flexDirection: 'row', gap: space.sm, margin: space.lg, padding: space.md, borderRadius: radius.md, backgroundColor: 'rgba(242,85,90,0.12)' },
  errorText: { flex: 1, color: colors.text, fontSize: 13, lineHeight: 19 },
  footNote: { color: colors.textFaint, fontSize: 12, paddingHorizontal: space.lg, paddingVertical: space.md, lineHeight: 17 },
});
