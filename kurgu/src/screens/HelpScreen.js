import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useI18n } from '../i18n';
import { useNav } from '../navigation';
import { Icon, IconButton, Row, Txt } from '../ui';
import { colors, font, radius, space } from '../theme';

const TOPICS = [
  { key: 'start', icon: 'add-circle-outline' },
  { key: 'timeline', icon: 'git-commit-outline' },
  { key: 'trim', icon: 'cut-outline' },
  { key: 'text', icon: 'text-outline' },
  { key: 'audio', icon: 'musical-notes-outline' },
  { key: 'effects', icon: 'sparkles-outline' },
  { key: 'export', icon: 'arrow-up-circle-outline' },
  { key: 'save', icon: 'save-outline' },
  { key: 'missing', icon: 'link-outline' },
];

export default function HelpScreen() {
  const { t } = useI18n();
  const nav = useNav();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <Row style={styles.top}>
        <IconButton icon="arrow-back" directional label={t('common.back')} onPress={nav.pop} />
        <Txt style={font.h2}>{t('help.title')}</Txt>
        <View style={{ width: 44 }} />
      </Row>
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xl }]}>
        {TOPICS.map((topic) => (
          <View key={topic.key} style={styles.card}>
            <Row>
              <Icon name={topic.icon} color={colors.accent} />
              <Txt style={{ fontWeight: '700', flex: 1 }}>{t(`help.${topic.key}.title`)}</Txt>
            </Row>
            <Txt dim style={styles.text}>{t(`help.${topic.key}.body`)}</Txt>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  top: { height: 52, justifyContent: 'space-between', paddingHorizontal: space.xs },
  body: { padding: space.lg, gap: space.md },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.lg, gap: space.sm },
  text: { fontSize: 14, lineHeight: 21 },
});
