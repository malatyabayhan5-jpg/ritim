// Yapay zekâ araçları. Çalışan araçlar "Kullanılabilir" olarak işaretlenir ve
// editördeki AI panelinden kullanılır; henüz bağlanmamış olanlar "Planlandı"
// olarak kalır. Her aracın çalışma biçimi (cihaz içi / sistem / bulut) yazılır.

import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useI18n } from '../i18n';
import { useNav } from '../navigation';
import { Icon, IconButton, Row, Txt } from '../ui';
import { colors, font, radius, space } from '../theme';

// ready: uygulamada çalışıyor (cihaz içi, internet gerekmez). Diğerleri "Planlandı".
export const AI_TOOLS = [
  { key: 'silenceRemoval', icon: 'remove-circle-outline', mode: 'onDevice', ready: true },
  { key: 'sceneDetect', icon: 'albums-outline', mode: 'onDevice', ready: true },
  { key: 'textToSpeech', icon: 'volume-high-outline', mode: 'system', ready: true },
  { key: 'noiseReduction', icon: 'mic-outline', mode: 'onDevice', ready: true },
  { key: 'autoCaptions', icon: 'chatbox-ellipses-outline', mode: 'onDevice', ready: true },
  { key: 'removeBackground', icon: 'person-outline', mode: 'onDevice', ready: true },
  { key: 'objectErase', icon: 'bandage-outline', mode: 'onDevice', ready: true },
  { key: 'translate', icon: 'language-outline', mode: 'onDevice', ready: true },
  { key: 'imageGenerate', icon: 'image-outline', mode: 'cloud' },
  { key: 'autoCut', icon: 'flash-outline', mode: 'cloud' },
  { key: 'upscale', icon: 'resize-outline', mode: 'cloud' },
];

export default function AiToolsScreen() {
  const { t, row } = useI18n();
  const nav = useNav();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <Row style={styles.top}>
        <IconButton icon="arrow-back" directional label={t('common.back')} onPress={nav.pop} />
        <Txt style={font.h2}>{t('ai.title')}</Txt>
        <View style={{ width: 44 }} />
      </Row>
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xl }]}>
        <View style={styles.notice}>
          <Icon name="information-circle-outline" color={colors.accent2} />
          <Txt dim style={{ flex: 1, fontSize: 13 }}>{t('ai.notice')}</Txt>
        </View>
        {AI_TOOLS.map((tool) => (
          <View key={tool.key} style={[styles.card, { flexDirection: row }]} testID={`ai-${tool.key}`}>
            <View style={styles.icon}>
              <Icon name={tool.icon} />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Txt style={{ fontWeight: '700', flexShrink: 1 }}>{t(`ai.tools.${tool.key}.title`)}</Txt>
                <Txt style={[styles.badge, tool.ready && styles.ready]}>{t(tool.ready ? 'ai.ready' : 'ai.planned')}</Txt>
              </Row>
              <Txt dim style={{ fontSize: 13 }}>{t(`ai.tools.${tool.key}.desc`)}</Txt>
              <Txt faint style={{ fontSize: 12 }}>{t(`ai.mode.${tool.mode}`)}</Txt>
            </View>
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
  notice: { flexDirection: 'row', gap: space.sm, backgroundColor: 'rgba(46,230,201,0.08)', borderRadius: radius.md, padding: space.md, alignItems: 'flex-start' },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.md, gap: space.md, alignItems: 'flex-start' },
  icon: { width: 42, height: 42, borderRadius: radius.md, backgroundColor: colors.surface3, alignItems: 'center', justifyContent: 'center' },
  badge: { color: colors.warning, fontSize: 11, fontWeight: '700' },
  ready: { color: colors.accent2 },
});
