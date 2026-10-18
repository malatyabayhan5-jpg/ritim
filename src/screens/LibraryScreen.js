import React, { useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Artwork from '../components/Artwork';
import NamePrompt from '../components/NamePrompt';
import { colors, radius, space, type } from '../theme';
import { useLibrary } from '../context/LibraryContext';

function Row({ icon, iconBg, artwork, title, subtitle, onPress, onLongPress }) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surface }]}
    >
      {artwork !== undefined ? (
        <Artwork uri={artwork} size={58} radius={6} />
      ) : (
        <View style={[styles.iconBox, { backgroundColor: iconBg }]}>
          <Ionicons name={icon} size={26} color="#FFFFFF" />
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.rowSub} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
    </Pressable>
  );
}

export default function LibraryScreen({ navigation }) {
  const { favorites, playlists, downloadList, createPlaylist, deletePlaylist, renamePlaylist } = useLibrary();
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState(null);

  const askDelete = (p) => {
    Alert.alert(p.name, 'Bu çalma listesiyle ne yapmak istiyorsun?', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Yeniden adlandır', onPress: () => setRenaming(p) },
      { text: 'Sil', style: 'destructive', onPress: () => deletePlaylist(p.id) },
    ]);
  };

  const header = (
    <View>
      <View style={styles.top}>
        <Text style={type.h1}>Kütüphane</Text>
        <Pressable onPress={() => setCreating(true)} hitSlop={10} style={styles.addBtn}>
          <Ionicons name="add" size={28} color={colors.text} />
        </Pressable>
      </View>
      <Row
        icon="heart"
        iconBg="#C2410C"
        title="Favoriler"
        subtitle={`Çalma listesi · ${favorites.length} parça`}
        onPress={() => navigation.navigate('Playlist', { kind: 'favorites' })}
      />
      <Row
        icon="arrow-down-circle"
        iconBg="#0E7490"
        title="İndirilenler"
        subtitle={`Çevrimdışı · ${downloadList.length} parça`}
        onPress={() => navigation.navigate('Playlist', { kind: 'downloads' })}
      />
      <Row
        icon="time"
        iconBg="#475569"
        title="Son çalınanlar"
        subtitle="Geçmiş"
        onPress={() => navigation.navigate('Playlist', { kind: 'recent' })}
      />
      <Text style={[type.label, styles.sectionLabel]}>Çalma listelerin</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <FlatList
        data={playlists}
        keyExtractor={(p) => p.id}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingBottom: space.xxl }}
        ListEmptyComponent={
          <Pressable onPress={() => setCreating(true)} style={styles.emptyCard}>
            <Ionicons name="add-circle-outline" size={28} color={colors.accent} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>İlk çalma listeni oluştur</Text>
              <Text style={styles.rowSub}>Parçalardaki ⋮ menüsünden listeye ekleyebilirsin.</Text>
            </View>
          </Pressable>
        }
        renderItem={({ item }) => (
          <Row
            artwork={item.tracks[0] ? item.tracks[0].artwork : null}
            title={item.name}
            subtitle={`Çalma listesi · ${item.tracks.length} parça`}
            onPress={() => navigation.navigate('Playlist', { kind: 'playlist', id: item.id })}
            onLongPress={() => askDelete(item)}
          />
        )}
      />
      <NamePrompt
        visible={creating}
        title="Yeni çalma listesi"
        onCancel={() => setCreating(false)}
        onConfirm={(name) => {
          const id = createPlaylist(name);
          setCreating(false);
          navigation.navigate('Playlist', { kind: 'playlist', id });
        }}
      />
      <NamePrompt
        visible={!!renaming}
        title="Listeyi yeniden adlandır"
        initial={renaming ? renaming.name : ''}
        confirmLabel="Kaydet"
        onCancel={() => setRenaming(null)}
        onConfirm={(name) => {
          renamePlaylist(renaming.id, name);
          setRenaming(null);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.md,
  },
  addBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.sm },
  iconBox: { width: 58, height: 58, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  rowSub: { color: colors.textDim, fontSize: 13, marginTop: 3 },
  sectionLabel: { paddingHorizontal: space.lg, marginTop: space.xl, marginBottom: space.sm },
  emptyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginHorizontal: space.lg,
    padding: space.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
});
