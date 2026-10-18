import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, ToastAndroid, Platform, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Artwork from './Artwork';
import NamePrompt from './NamePrompt';
import { colors, radius, space } from '../theme';
import { useLibrary } from '../context/LibraryContext';
import { usePlayer } from '../context/PlayerContext';
import { useDownloadOptions } from './DownloadOptions';
import { canDownload } from '../services/downloadSources';

function toast(msg) {
  if (Platform.OS === 'android') ToastAndroid.show(msg, ToastAndroid.SHORT);
}

function Action({ icon, label, onPress, color = colors.text }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.action, pressed && { backgroundColor: colors.surface2 }]}>
      <Ionicons name={icon} size={22} color={color} />
      <Text style={[styles.actionText, { color }]}>{label}</Text>
    </Pressable>
  );
}

// track: gösterilecek parça (null ise kapalı)
// extraActions: [{ icon, label, onPress, color }]
export default function TrackActionsSheet({ track, onClose, extraActions = [], startOnPlaylists = false }) {
  const insets = useSafeAreaInsets();
  const lib = useLibrary();
  const { addNext, addToQueue } = usePlayer();
  const { openDownloadOptions } = useDownloadOptions();
  const [mode, setMode] = useState('main');
  const [naming, setNaming] = useState(false);

  useEffect(() => {
    if (track) setMode(startOnPlaylists ? 'playlists' : 'main');
  }, [track, startOnPlaylists]);

  if (!track) return null;

  const fav = lib.isFavorite(track.id);
  const downloaded = lib.isDownloaded(track.id);
  const downloading = lib.progress[track.id] !== undefined;

  const done = (msg) => {
    if (msg) toast(msg);
    onClose();
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + space.md }]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Artwork uri={track.artwork} size={52} radius={6} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.title} numberOfLines={1}>
                {track.title}
              </Text>
              <Text style={styles.artist} numberOfLines={1}>
                {track.artist}
              </Text>
            </View>
          </View>

          {mode === 'main' ? (
            <View>
              <Action
                icon={fav ? 'heart' : 'heart-outline'}
                color={fav ? colors.accent : colors.text}
                label={fav ? 'Favorilerden çıkar' : 'Favorilere ekle'}
                onPress={() => {
                  lib.toggleFavorite(track);
                  done(fav ? 'Favorilerden çıkarıldı' : 'Favorilere eklendi');
                }}
              />
              <Action icon="list" label="Çalma listesine ekle" onPress={() => setMode('playlists')} />
              <Action
                icon="play-forward-outline"
                label="Sıradaki olarak çal"
                onPress={() => {
                  addNext(track);
                  done('Sıradaki olarak eklendi');
                }}
              />
              <Action
                icon="add-circle-outline"
                label="Sıraya ekle"
                onPress={() => {
                  addToQueue(track);
                  done('Sıraya eklendi');
                }}
              />
              {downloaded ? (
                <Action
                  icon="trash-outline"
                  color={colors.danger}
                  label="İndirmeyi sil"
                  onPress={() => {
                    lib.removeDownload(track.id);
                    done('İndirme silindi');
                  }}
                />
              ) : null}
              {canDownload(track) ? (
                <Action
                  icon="arrow-down-circle-outline"
                  label={downloading ? 'İndiriliyor…' : 'İndir… (video / yalnızca ses)'}
                  onPress={() => {
                    onClose();
                    openDownloadOptions(track);
                  }}
                />
              ) : null}
              {extraActions.map((a) => (
                <Action
                  key={a.label}
                  icon={a.icon}
                  label={a.label}
                  color={a.color}
                  onPress={() => {
                    a.onPress();
                    onClose();
                  }}
                />
              ))}
            </View>
          ) : (
            <View>
              <Pressable onPress={() => setMode('main')} style={styles.back}>
                <Ionicons name="chevron-back" size={20} color={colors.textDim} />
                <Text style={styles.backText}>Çalma listesine ekle</Text>
              </Pressable>
              <ScrollView style={{ maxHeight: 320 }}>
                <Action icon="add" color={colors.accent} label="Yeni çalma listesi" onPress={() => setNaming(true)} />
                {lib.playlists.map((p) => {
                  const has = p.tracks.some((t) => t.id === track.id);
                  return (
                    <Action
                      key={p.id}
                      icon={has ? 'checkmark-circle' : 'musical-notes-outline'}
                      color={has ? colors.accent : colors.text}
                      label={`${p.name}  ·  ${p.tracks.length}`}
                      onPress={() => {
                        if (!has) lib.addToPlaylist(p.id, track);
                        done(has ? 'Zaten bu listede' : `"${p.name}" listesine eklendi`);
                      }}
                    />
                  );
                })}
              </ScrollView>
            </View>
          )}
        </View>
      </View>
      <NamePrompt
        visible={naming}
        title="Yeni çalma listesi"
        onCancel={() => setNaming(false)}
        onConfirm={(name) => {
          const id = lib.createPlaylist(name);
          lib.addToPlaylist(id, track);
          setNaming(false);
          done(`"${name}" oluşturuldu`);
        }}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: space.sm,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: space.md },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    marginBottom: space.xs,
  },
  title: { color: colors.text, fontSize: 16, fontWeight: '700' },
  artist: { color: colors.textDim, fontSize: 13, marginTop: 2 },
  action: { flexDirection: 'row', alignItems: 'center', gap: space.lg, paddingHorizontal: space.xl, paddingVertical: 14 },
  actionText: { fontSize: 15, fontWeight: '500' },
  back: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingHorizontal: space.lg, paddingVertical: space.sm },
  backText: { color: colors.textDim, fontSize: 13, fontWeight: '700', letterSpacing: 0.5 },
});
