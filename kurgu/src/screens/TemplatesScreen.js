import { useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useI18n } from '../i18n';
import { useNav } from '../navigation';
import { Icon, IconButton, Loading, Row, Txt, useToast } from '../ui';
import { colors, font, radius, space } from '../theme';
import { TEMPLATES } from '../model/catalog';
import { RATIOS } from '../model/schema';
import { projectFromTemplate } from '../model/templates';
import { importPicked, pickFromGallery } from '../storage/importer';
import { saveProject } from '../storage/library';
import { loadSettings } from '../storage/settings';
import { importErrorText } from './HomeScreen';

export default function TemplatesScreen() {
  const { t, row } = useI18n();
  const nav = useNav();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(null);

  const use = async (tpl) => {
    try {
      const picked = await pickFromGallery();
      if (!picked.length) return;
      setBusy(t('import.progress', { done: 0, total: picked.length }));
      const { media, errors } = await importPicked(picked, (done, total) => setBusy(t('import.progress', { done, total })));
      setBusy(null);
      if (errors.length) Alert.alert(t('import.someFailed'), importErrorText(t, errors));
      if (!media.some((m) => m.kind !== 'audio')) return;
      const s = await loadSettings();
      const project = projectFromTemplate(tpl, media, { name: t(`templates.${tpl.id}.name`), resolution: s.defaultResolution, fps: s.defaultFps, textFor: (k) => t(k) });
      await saveProject(project);
      nav.replace('editor', { projectId: project.id });
    } catch {
      setBusy(null);
      toast(t('errors.generic'), 'error');
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <Row style={styles.top}>
        <IconButton icon="arrow-back" directional label={t('common.back')} onPress={nav.pop} />
        <Txt style={font.h2}>{t('templates.title')}</Txt>
        <View style={{ width: 44 }} />
      </Row>
      <FlatList
        data={TEMPLATES}
        keyExtractor={(x) => x.id}
        numColumns={2}
        columnWrapperStyle={{ gap: space.md, flexDirection: row }}
        contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: insets.bottom + space.xl }}
        ListHeaderComponent={<Txt dim style={{ marginBottom: space.sm, fontSize: 13 }}>{t('templates.hint')}</Txt>}
        renderItem={({ item }) => {
          const [w, h] = RATIOS[item.ratio];
          const total = item.slots.reduce((a, b) => a + b, 0);
          return (
            <Pressable testID={`template-${item.id}`} onPress={() => use(item)} style={({ pressed }) => [styles.card, pressed && { opacity: 0.75 }]}>
              <View style={styles.thumbWrap}>
                <View style={[styles.thumb, { aspectRatio: w / h }]}>
                  <Icon name="film-outline" size={26} color={colors.textDim} />
                </View>
              </View>
              <Txt style={{ fontWeight: '700' }} numberOfLines={1}>{t(`templates.${item.id}.name`)}</Txt>
              <Txt faint style={{ fontSize: 12 }} numberOfLines={2}>{t(`templates.${item.id}.desc`)}</Txt>
              <Txt faint style={{ fontSize: 11 }}>{t('templates.meta', { ratio: item.ratio, clips: item.slots.length, sec: Math.round(total / 1000) })}</Txt>
            </Pressable>
          );
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  top: { height: 52, justifyContent: 'space-between', paddingHorizontal: space.xs },
  card: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.md, gap: 4 },
  thumbWrap: { height: 120, alignItems: 'center', justifyContent: 'center', marginBottom: space.sm },
  thumb: { maxHeight: 120, maxWidth: '100%', height: '100%', backgroundColor: colors.surface3, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  busy: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.overlay },
});
