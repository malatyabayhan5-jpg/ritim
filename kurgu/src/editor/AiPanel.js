// Editör AI paneli: cihaz içinde çalışan araçları seçili klibe / metne uygular.
// Her işlem tek bir geri al adımıdır. Henüz bağlanmamış araçlar "Planlandı"
// rozetiyle listelenir ve düğmesi yoktur (sahte işlev gösterilmez).

import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useI18n } from '../i18n';
import { Icon, Panel, Row, Txt } from '../ui';
import { colors, radius, space } from '../theme';
import { AI_TOOLS } from '../screens/AiToolsScreen';

export default function AiPanel({ onRun, onClose, targets }) {
  const { t, row } = useI18n();
  return (
    <Panel title={t('ai.title')} onClose={onClose} testID="panel-ai">
      <ScrollView style={{ maxHeight: 300 }} contentContainerStyle={styles.body}>
        {AI_TOOLS.map((tool) => {
          const target = targets[tool.key];
          return (
            <Pressable
              key={tool.key}
              testID={`ai-run-${tool.key}`}
              disabled={!tool.ready}
              onPress={() => onRun(tool.key)}
              style={({ pressed }) => [styles.item, { flexDirection: row }, !tool.ready && { opacity: 0.55 }, pressed && { opacity: 0.7 }]}
            >
              <View style={styles.icon}>
                <Icon name={tool.icon} size={20} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Txt style={{ fontWeight: '700', flexShrink: 1 }} numberOfLines={1}>
                    {t(`ai.tools.${tool.key}.title`)}
                  </Txt>
                  <Txt style={[styles.badge, tool.ready && styles.ready]}>{t(tool.ready ? 'ai.ready' : 'ai.planned')}</Txt>
                </Row>
                <Txt dim style={{ fontSize: 12 }} numberOfLines={2}>
                  {tool.ready && target ? target : t(`ai.tools.${tool.key}.desc`)}
                </Txt>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </Panel>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.lg, paddingBottom: space.md, gap: space.sm },
  item: { gap: space.md, alignItems: 'center', backgroundColor: colors.surface2, borderRadius: radius.md, padding: space.sm },
  icon: { width: 36, height: 36, borderRadius: radius.sm, backgroundColor: colors.surface3, alignItems: 'center', justifyContent: 'center' },
  badge: { color: colors.warning, fontSize: 10, fontWeight: '700' },
  ready: { color: colors.accent2 },
});
