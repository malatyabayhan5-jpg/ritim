// Otomatik altyazı paneli: dil ve model seçimi, model indirme onayı, ilerleme,
// iptal ve oluşturulan altyazıları kaldırma. İşin kendisi EditorScreen'de.

import { StyleSheet, View } from 'react-native';
import { useI18n } from '../i18n';
import { Button, Chip, Panel, Row, Txt } from '../ui';
import { colors, radius, space } from '../theme';

export const CAPTION_LANGS = ['auto', 'tr', 'en', 'ar'];

export default function CaptionsPanel({ info, lang, onLang, modelId, onModel, onStart, onCancel, onRemove, canRemove, progress, onClose }) {
  const { t, fmt } = useI18n();
  const running = !!progress;
  const supported = info?.supported;
  return (
    <Panel title={t('ai.tools.autoCaptions.title')} onClose={running ? onCancel : onClose} testID="panel-captions">
      <View style={styles.body}>
        {!info ? null : !supported ? (
          <Txt dim style={styles.small}>{t('captions.unsupported')}</Txt>
        ) : (
          <>
            <Txt dim style={styles.label}>{t('captions.language')}</Txt>
            <Row style={{ flexWrap: 'wrap', gap: space.sm }}>
              {CAPTION_LANGS.map((l) => (
                <Chip key={l} label={t(`captions.lang.${l}`)} active={lang === l} onPress={() => !running && onLang(l)} testID={`caption-lang-${l}`} />
              ))}
            </Row>
            <Txt dim style={styles.label}>{t('captions.model')}</Txt>
            <Row style={{ flexWrap: 'wrap', gap: space.sm }}>
              {info.models.map((m) => (
                <Chip
                  key={m.id}
                  testID={`caption-model-${m.id}`}
                  icon={m.downloaded ? 'checkmark-circle' : 'cloud-download-outline'}
                  label={`${t(`captions.models.${m.id}`)} · ${fmt.bytes(m.sizeBytes)}`}
                  active={modelId === m.id}
                  onPress={() => !running && onModel(m.id)}
                />
              ))}
            </Row>
            <Txt faint style={styles.small}>{t('captions.privacy')}</Txt>
            {running ? (
              <View style={styles.progress} testID="caption-progress">
                <Txt style={{ fontWeight: '600' }}>{progress.label}</Txt>
                <View style={styles.bar}>
                  <View style={[styles.fill, { width: `${Math.round(Math.max(0.02, Math.min(1, progress.value || 0)) * 100)}%` }]} />
                </View>
                <Button title={t('common.cancel')} kind="secondary" onPress={onCancel} testID="caption-cancel" />
              </View>
            ) : (
              <Row style={{ gap: space.sm }}>
                <View style={{ flex: 1 }}>
                  <Button title={t('captions.start')} onPress={onStart} testID="caption-start" />
                </View>
                {canRemove ? <Chip icon="trash-outline" label={t('captions.remove')} onPress={onRemove} testID="caption-remove" /> : null}
              </Row>
            )}
          </>
        )}
      </View>
    </Panel>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.lg, paddingBottom: space.md, gap: space.sm },
  label: { fontSize: 12, marginTop: 2 },
  small: { fontSize: 12 },
  progress: { gap: space.sm },
  bar: { height: 6, borderRadius: radius.sm, backgroundColor: colors.surface3, overflow: 'hidden' },
  fill: { height: 6, backgroundColor: colors.accent },
});
