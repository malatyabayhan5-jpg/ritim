import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { useI18n } from '../i18n';
import { LANGUAGES } from '../i18n/core';
import { useNav } from '../navigation';
import { Chip, Icon, IconButton, Row, Txt, useToast } from '../ui';
import { colors, font, radius, space } from '../theme';
import { loadSettings, saveSettings } from '../storage/settings';
import { clearCache, collectUnusedMedia, storageUsage } from '../storage/library';
import { ASPECT_OPTIONS } from '../model/catalog';

export default function SettingsScreen() {
  const { t, fmt, preference, setLanguage, row } = useI18n();
  const nav = useNav();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const [s, setS] = useState(null);
  const [usage, setUsage] = useState(null);

  useEffect(() => {
    loadSettings().then(setS);
    storageUsage().then(setUsage).catch(() => {});
  }, []);

  const update = async (patch) => setS(await saveSettings(patch));

  if (!s) return null;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <Row style={styles.top}>
        <IconButton icon="arrow-back" directional label={t('common.back')} onPress={nav.pop} testID="settings-back" />
        <Txt style={font.h2}>{t('settings.title')}</Txt>
        <View style={{ width: 44 }} />
      </Row>
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xl }]}>
        <Group title={t('settings.language')}>
          {[{ code: 'system', native: t('settings.systemLanguage') }, ...LANGUAGES].map((l) => (
            <Pressable key={l.code} testID={`lang-${l.code}`} onPress={() => setLanguage(l.code)} style={({ pressed }) => [styles.item, { flexDirection: row }, pressed && { backgroundColor: colors.surface2 }]}>
              <Txt style={{ flex: 1 }}>{l.native}</Txt>
              {preference === l.code ? <Icon name="checkmark" color={colors.accent} /> : null}
            </Pressable>
          ))}
          <Txt faint style={styles.note}>{t('settings.languageNote')}</Txt>
        </Group>

        <Group title={t('settings.newProjects')}>
          <Txt dim style={styles.label}>{t('settings.defaultRatio')}</Txt>
          <Row style={styles.wrap}>
            {ASPECT_OPTIONS.map((r) => (
              <Chip key={r} label={r} active={s.defaultRatio === r} onPress={() => update({ defaultRatio: r })} />
            ))}
          </Row>
          <Txt faint style={styles.note}>{t('settings.ratioNote')}</Txt>
          <Txt dim style={styles.label}>{t('settings.imageDuration')}</Txt>
          <Row style={styles.wrap}>
            {[2000, 3000, 5000].map((ms) => (
              <Chip key={ms} label={fmt.duration(ms)} active={s.imageDurationMs === ms} onPress={() => update({ imageDurationMs: ms })} />
            ))}
          </Row>
          <Txt dim style={styles.label}>{t('settings.frameRate')}</Txt>
          <Row style={styles.wrap}>
            {[24, 25, 30, 60].map((f) => (
              <Chip key={f} label={fmt.number(f)} active={s.defaultFps === f} onPress={() => update({ defaultFps: f })} />
            ))}
          </Row>
        </Group>

        <Group title={t('settings.preview')}>
          <Row style={styles.wrap}>
            {['low', 'medium', 'high'].map((q) => (
              <Chip key={q} label={t(`settings.previewQuality.${q}`)} active={s.previewQuality === q} onPress={() => update({ previewQuality: q })} />
            ))}
          </Row>
          <Txt faint style={styles.note}>{t('settings.previewNote')}</Txt>
          <Row style={styles.switchRow}>
            <Txt style={{ flex: 1 }}>{t('settings.haptics')}</Txt>
            <Switch value={s.haptics} onValueChange={(v) => update({ haptics: v })} trackColor={{ true: colors.accent }} />
          </Row>
        </Group>

        <Group title={t('settings.storage')}>
          {usage ? (
            <View style={styles.usage}>
              <Usage label={t('settings.usage.media')} value={fmt.bytes(usage.media)} />
              <Usage label={t('settings.usage.exports')} value={fmt.bytes(usage.exports)} />
              <Usage label={t('settings.usage.cache')} value={fmt.bytes(usage.cache)} />
              <Usage label={t('settings.usage.free')} value={fmt.bytes(usage.free)} />
            </View>
          ) : null}
          <Pressable
            style={[styles.item, { flexDirection: row }]}
            onPress={() =>
              Alert.alert(t('settings.clearCacheTitle'), t('settings.clearCacheMessage'), [
                { text: t('common.cancel'), style: 'cancel' },
                {
                  text: t('settings.clearCache'),
                  style: 'destructive',
                  onPress: async () => {
                    await clearCache();
                    const freed = await collectUnusedMedia();
                    toast(t('settings.cleared', { size: fmt.bytes(freed) }));
                    storageUsage().then(setUsage);
                  },
                },
              ])
            }
          >
            <Icon name="trash-outline" />
            <Txt style={{ flex: 1 }}>{t('settings.clearCache')}</Txt>
          </Pressable>
        </Group>

        <Group title={t('settings.privacy')}>
          <Txt dim style={styles.note}>{t('settings.privacyText')}</Txt>
        </Group>

        <Group title={t('settings.about')}>
          <Pressable style={[styles.item, { flexDirection: row }]} onPress={() => nav.push('help')}>
            <Icon name="help-circle-outline" />
            <Txt style={{ flex: 1 }}>{t('help.title')}</Txt>
            <Icon name="chevron-forward" directional color={colors.textFaint} size={18} />
          </Pressable>
          <Txt faint style={styles.note}>{t('home.version', { version: Constants.expoConfig?.version || '0.1.0' })}</Txt>
          <Txt faint style={styles.note}>{t('settings.licenses')}</Txt>
        </Group>
      </ScrollView>
    </View>
  );
}

function Group({ title, children }) {
  return (
    <View style={styles.group}>
      <Txt dim style={styles.groupTitle}>{title}</Txt>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function Usage({ label, value }) {
  return (
    <View style={{ width: '48%', gap: 2 }}>
      <Txt faint style={font.tiny}>{label}</Txt>
      <Txt style={{ fontWeight: '700' }}>{value}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  top: { height: 52, justifyContent: 'space-between', paddingHorizontal: space.xs },
  body: { padding: space.lg, gap: space.lg },
  group: { gap: space.sm },
  groupTitle: { fontSize: 13, fontWeight: '700' },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.md, gap: space.sm },
  item: { minHeight: 48, alignItems: 'center', gap: space.md, paddingHorizontal: space.sm, borderRadius: radius.md },
  label: { fontSize: 13, marginTop: space.xs },
  note: { fontSize: 12 },
  wrap: { flexWrap: 'wrap' },
  switchRow: { minHeight: 48, paddingHorizontal: space.sm },
  usage: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, padding: space.sm },
});
