import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Sharing from 'expo-sharing';
import Constants from 'expo-constants';
import { useI18n } from '../i18n';
import { useNav } from '../navigation';
import { ActionSheet, Chip, Icon, IconButton, Loading, PromptModal, Row, Txt, useToast } from '../ui';
import { colors, font, radius, space } from '../theme';
import {
  deleteProject,
  duplicateProject,
  importProjectPackage,
  listProjects,
  loadProject,
  renameProject,
  saveProject,
  writeProjectPackage,
} from '../storage/library';
import { importPicked, pickFiles, pickFromGallery } from '../storage/importer';
import { createProject, RATIOS } from '../model/schema';
import { addMediaToProject } from '../model/timeline';
import { loadSettings } from '../storage/settings';
import * as DocumentPicker from 'expo-document-picker';
import { formatTimecode, ltr } from '../i18n/core';

const FILTERS = ['all', 'drafts', 'exported'];

/** Medyanın en-boy oranına en yakın kanvas oranı. */
export function nearestRatio(w, h) {
  if (!w || !h) return null;
  const r = w / h;
  let best = '9:16';
  let bestD = Infinity;
  for (const [key, [a, b]] of Object.entries(RATIOS)) {
    const d = Math.abs(Math.log(r / (a / b)));
    if (d < bestD) {
      bestD = d;
      best = key;
    }
  }
  return best;
}

export async function createProjectFromMedia(media, overrides = {}) {
  const settings = await loadSettings();
  const first = media.find((m) => m.kind !== 'audio');
  const ratio = overrides.ratio || nearestRatio(first?.width, first?.height) || settings.defaultRatio;
  let project = createProject({ name: overrides.name || '', ratio, resolution: settings.defaultResolution, fps: settings.defaultFps });
  project = addMediaToProject(project, media, null, { imageDurationMs: settings.imageDurationMs }).project;
  const audio = media.filter((m) => m.kind === 'audio');
  for (const a of audio) project.media[a.id] = a;
  await saveProject(project);
  return project;
}

export function importErrorText(t, errors) {
  return errors.map((e) => `${e.name}: ${t(`errors.import.${e.code}`)}`).join('\n');
}

export default function HomeScreen({ focused }) {
  const { t, fmt, row } = useI18n();
  const nav = useNav();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const [projects, setProjects] = useState(null);
  const [filter, setFilter] = useState('all');
  const [busy, setBusy] = useState(null);
  const [menuFor, setMenuFor] = useState(null);
  const [renaming, setRenaming] = useState(null);

  const refresh = useCallback(() => {
    listProjects()
      .then(setProjects)
      .catch(() => setProjects([]));
  }, []);

  useEffect(() => {
    if (focused) refresh();
  }, [focused, refresh]);

  const newProject = async (source) => {
    try {
      const picked = source === 'files' ? await pickFiles('visual') : await pickFromGallery();
      if (!picked.length) return;
      setBusy(t('import.progress', { done: 0, total: picked.length }));
      const { media, errors } = await importPicked(picked, (done, total) => setBusy(t('import.progress', { done, total })));
      setBusy(null);
      if (errors.length) Alert.alert(t('import.someFailed'), importErrorText(t, errors));
      if (!media.length) return;
      const project = await createProjectFromMedia(media, { name: t('home.defaultName', { date: fmt.date(Date.now()) }) });
      nav.push('editor', { projectId: project.id });
    } catch (e) {
      setBusy(null);
      toast(t('errors.generic'), 'error');
    }
  };

  const importPackage = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: ['application/json', '*/*'], copyToCacheDirectory: true });
      if (res.canceled) return;
      const id = await importProjectPackage(res.assets[0].uri);
      toast(t('home.packageImported'));
      nav.push('editor', { projectId: id });
    } catch (e) {
      toast(t('errors.packageInvalid'), 'error');
    }
  };

  const confirmDelete = (p) => {
    Alert.alert(t('home.deleteTitle'), t('home.deleteMessage', { name: p.name || t('home.untitled') }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          await deleteProject(p.id);
          toast(t('home.deleted'));
          refresh();
        },
      },
    ]);
  };

  const share = async (p) => {
    try {
      const project = await loadProject(p.id);
      const uri = await writeProjectPackage(project);
      await Sharing.shareAsync(uri, { mimeType: 'application/json', dialogTitle: t('home.sharePackage') });
    } catch {
      toast(t('errors.generic'), 'error');
    }
  };

  const visible = (projects || []).filter((p) => (filter === 'drafts' ? !p.exportedAt : filter === 'exported' ? !!p.exportedAt : true));
  const version = Constants.expoConfig?.version || '0.1.0';

  const header = (
    <View>
      <Row style={styles.top}>
        <Text style={styles.brand}>{t('app.name')}</Text>
        <Row gap={0}>
          <IconButton icon="help-circle-outline" label={t('help.title')} onPress={() => nav.push('help')} />
          <IconButton icon="settings-outline" label={t('settings.title')} onPress={() => nav.push('settings')} testID="open-settings" />
        </Row>
      </Row>

      <Pressable testID="new-project" onPress={() => newProject('gallery')} style={({ pressed }) => [styles.newCard, pressed && { opacity: 0.85 }]}>
        <View style={styles.newIcon}>
          <Icon name="add" size={30} />
        </View>
        <Text style={styles.newTitle}>{t('home.newProject')}</Text>
        <Text style={styles.newSub}>{t('home.newProjectHint')}</Text>
      </Pressable>

      <View style={[styles.quick, { flexDirection: row }]}>
        <QuickTool icon="albums-outline" label={t('home.templates')} onPress={() => nav.push('templates')} testID="open-templates" />
        <QuickTool icon="folder-open-outline" label={t('home.fromFiles')} onPress={() => newProject('files')} />
        <QuickTool icon="sparkles-outline" label={t('home.aiTools')} onPress={() => nav.push('ai')} />
        <QuickTool icon="download-outline" label={t('home.importPackage')} onPress={importPackage} />
      </View>

      <Row style={styles.sectionRow}>
        <Txt style={font.h2}>{t('home.projects')}</Txt>
        {projects ? <Txt faint>{fmt.number(visible.length)}</Txt> : null}
      </Row>
      <Row style={{ paddingHorizontal: space.lg, marginBottom: space.md }}>
        {FILTERS.map((f) => (
          <Chip key={f} label={t(`home.filter.${f}`)} active={filter === f} onPress={() => setFilter(f)} testID={`filter-${f}`} />
        ))}
      </Row>
    </View>
  );

  if (!projects) return <Loading />;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <FlatList
        data={visible}
        keyExtractor={(p) => p.id}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingBottom: insets.bottom + space.xl }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Icon name="film-outline" size={40} color={colors.textFaint} />
            <Txt dim center>
              {t(filter === 'all' ? 'home.empty' : 'home.emptyFiltered')}
            </Txt>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            testID={`project-${item.id}`}
            onPress={() => nav.push('editor', { projectId: item.id })}
            onLongPress={() => setMenuFor(item)}
            style={({ pressed }) => [styles.card, { flexDirection: row }, pressed && { backgroundColor: colors.surface2 }]}
          >
            <View style={styles.cover}>
              {item.cover ? <Image source={{ uri: item.cover }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : <Icon name="videocam-outline" color={colors.textFaint} />}
              <Text style={styles.coverDur}>{ltr(formatTimecode(item.durationMs, { tenths: false }))}</Text>
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Txt numberOfLines={1} style={{ fontWeight: '600' }}>
                {item.name || t('home.untitled')}
              </Txt>
              <Txt faint style={font.small}>
                {fmt.relative(item.updatedAt)}
              </Txt>
              <Row gap={6}>
                <Text style={styles.tag}>{item.ratio}</Text>
                <Text style={styles.tag}>{t('home.clipCount', { count: item.clips })}</Text>
                {item.exportedAt ? <Text style={[styles.tag, { color: colors.success }]}>{t('home.exportedTag')}</Text> : <Text style={styles.tag}>{t('home.autosavedTag')}</Text>}
                {item.recovered ? <Text style={[styles.tag, { color: colors.warning }]}>{t('home.recoveredTag')}</Text> : null}
              </Row>
            </View>
            <IconButton icon="ellipsis-horizontal" label={t('common.more')} onPress={() => setMenuFor(item)} testID={`project-menu-${item.id}`} />
          </Pressable>
        )}
        ListFooterComponent={<Txt faint center style={{ marginTop: space.xl, ...font.tiny }}>{t('home.version', { version })}</Txt>}
      />

      <ActionSheet
        visible={!!menuFor}
        title={menuFor?.name}
        onClose={() => setMenuFor(null)}
        actions={
          menuFor
            ? [
                { key: 'open', icon: 'create-outline', label: t('home.open'), onPress: () => nav.push('editor', { projectId: menuFor.id }) },
                { key: 'rename', icon: 'pencil-outline', label: t('home.rename'), onPress: () => setRenaming(menuFor) },
                {
                  key: 'duplicate',
                  icon: 'copy-outline',
                  label: t('home.duplicate'),
                  onPress: async () => {
                    await duplicateProject(menuFor.id, t('home.copySuffix'));
                    refresh();
                  },
                },
                { key: 'share', icon: 'share-outline', label: t('home.sharePackage'), onPress: () => share(menuFor) },
                { key: 'delete', icon: 'trash-outline', label: t('common.delete'), danger: true, onPress: () => confirmDelete(menuFor) },
              ]
            : []
        }
      />
      <PromptModal
        visible={!!renaming}
        title={t('home.rename')}
        initial={renaming?.name || ''}
        placeholder={t('home.untitled')}
        onCancel={() => setRenaming(null)}
        onSubmit={async (name) => {
          const id = renaming.id;
          setRenaming(null);
          await renameProject(id, name);
          refresh();
        }}
      />
      {busy ? (
        <View style={styles.busy}>
          <Loading label={busy} />
        </View>
      ) : null}
    </View>
  );
}

function QuickTool({ icon, label, onPress, testID }) {
  return (
    <Pressable testID={testID} onPress={onPress} style={({ pressed }) => [styles.quickItem, pressed && { opacity: 0.6 }]}>
      <View style={styles.quickIcon}>
        <Icon name={icon} size={22} />
      </View>
      <Text style={styles.quickLabel} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  top: { justifyContent: 'space-between', paddingHorizontal: space.lg, height: 56 },
  brand: { color: colors.text, fontSize: 26, fontWeight: '800', letterSpacing: 0.5 },
  newCard: {
    marginHorizontal: space.lg,
    marginTop: space.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.accent,
    paddingVertical: space.xl,
    alignItems: 'center',
    gap: 6,
  },
  newIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' },
  newTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
  newSub: { color: 'rgba(255,255,255,0.8)', fontSize: 13 },
  quick: { paddingHorizontal: space.md, marginTop: space.lg, justifyContent: 'space-between' },
  quickItem: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: space.sm },
  quickIcon: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  quickLabel: { color: colors.textDim, fontSize: 12, textAlign: 'center' },
  sectionRow: { justifyContent: 'space-between', paddingHorizontal: space.lg, marginTop: space.xl, marginBottom: space.md },
  card: { alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.sm },
  cover: { width: 76, height: 76, borderRadius: radius.md, backgroundColor: colors.surface2, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  coverDur: { position: 'absolute', bottom: 3, right: 4, color: colors.text, fontSize: 10, fontWeight: '700', textShadowColor: '#000', textShadowRadius: 3 },
  tag: { color: colors.textDim, fontSize: 11, backgroundColor: colors.surface2, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, overflow: 'hidden' },
  empty: { alignItems: 'center', gap: space.md, padding: space.xxl },
  busy: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.overlay },
});
