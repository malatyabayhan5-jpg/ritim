// Otomatik altyazı paneli: dil ve model seçimi, model indirme onayı, ilerleme,
// iptal ve oluşturulan altyazıları kaldırma. İşin kendisi EditorScreen'de.

import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useI18n } from '../i18n';
import { Button, Chip, Icon, Panel, Row, Txt } from '../ui';
import { formatTimecode, ltr } from '../i18n/core';
import { colors, radius, space } from '../theme';

export const CAPTION_LANGS = ['auto', 'tr', 'en', 'ar'];

export default function CaptionsPanel({ info, lang, onLang, translate, onTranslate, modelId, onModel, onStart, onCancel, onRemove, canRemove, progress, onClose, onExportSrt, onImportSrt, onEdit }) {
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
            <Row style={{ flexWrap: 'wrap', gap: space.sm }}>
              <Chip icon="language-outline" label={t('captions.translateEn')} active={!!translate} onPress={() => !running && onTranslate(!translate)} testID="caption-translate" />
            </Row>
            {translate ? <Txt faint style={styles.small}>{t('captions.translateNote')}</Txt> : null}
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
        {/* SRT: altyazıları dosyaya aktar / dosyadan al (tanıma gerektirmez) */}
        <Row style={{ gap: space.sm, flexWrap: 'wrap' }}>
          <Chip icon="download-outline" label={t('captions.importSrt')} onPress={onImportSrt} testID="srt-import" />
          {canRemove ? <Chip icon="share-outline" label={t('captions.exportSrt')} onPress={onExportSrt} testID="srt-export" /> : null}
          {canRemove && onEdit ? <Chip icon="create-outline" label={t('captions.edit')} onPress={onEdit} testID="caption-edit" /> : null}
        </Row>
      </View>
    </Panel>
  );
}

/**
 * Altyazı listesi: her satırın metni yerinde düzenlenir, zamana dokununca oynatma kafası
 * oraya gider, satır silinebilir. "Seç" kipinde birden çok satır seçilip birlikte silinir,
 * içlerinde bul-değiştir yapılır ya da ilk seçilenin stili diğerlerine uygulanır.
 * `onChange(id, text, key)`, `onDelete(id)`, `onSeek(ms)`, `onDeleteMany(ids)`,
 * `onReplace(ids, find, replace)`, `onMatchStyle(sourceId, ids)`.
 */
export function CaptionListPanel({ captions, position, onChange, onDelete, onSeek, onDeleteMany, onReplace, onMatchStyle, onClose }) {
  const { t, textAlign, row } = useI18n();
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [find, setFind] = useState('');
  const [rep, setRep] = useState('');
  // Silinen satırlar seçimden düşer
  const ids = captions.map((c) => c.id);
  const sel = ids.filter((id) => selected.has(id));
  const toggle = (id) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const stopSelecting = () => {
    setSelecting(false);
    setSelected(new Set());
  };
  return (
    <Panel title={t('captions.edit')} onClose={onClose} testID="panel-caption-list">
      {captions.length && onDeleteMany ? (
        <Row style={styles.toolbar}>
          {selecting ? (
            <>
              <Txt dim style={styles.small} testID="caption-selected-count">
                {t('captions.selectedCount', { n: sel.length })}
              </Txt>
              <Chip label={t('captions.selectAll')} onPress={() => setSelected(new Set(ids))} testID="caption-select-all" />
              <Chip label={t('captions.selectDone')} onPress={stopSelecting} testID="caption-select-done" />
            </>
          ) : (
            <Chip icon="checkbox-outline" label={t('captions.select')} onPress={() => setSelecting(true)} testID="caption-select" />
          )}
        </Row>
      ) : null}
      {selecting && sel.length ? (
        <View style={styles.batch}>
          <Row style={{ gap: space.sm }}>
            <TextInput value={find} onChangeText={setFind} placeholder={t('captions.find')} placeholderTextColor={colors.textFaint} style={[styles.input, { textAlign }]} testID="caption-find" />
            <TextInput value={rep} onChangeText={setRep} placeholder={t('captions.replaceWith')} placeholderTextColor={colors.textFaint} style={[styles.input, { textAlign }]} testID="caption-replace" />
          </Row>
          <Row style={{ gap: space.sm, flexWrap: 'wrap' }}>
            <Chip icon="swap-horizontal-outline" label={t('captions.replaceApply')} onPress={() => find && onReplace(sel, find, rep)} testID="caption-replace-apply" />
            {sel.length > 1 ? <Chip icon="color-palette-outline" label={t('captions.matchStyle')} onPress={() => onMatchStyle(sel[0], sel)} testID="caption-match-style" /> : null}
            <Chip
              icon="trash-outline"
              label={t('captions.deleteSelected')}
              onPress={() => {
                onDeleteMany(sel);
                setSelected(new Set());
              }}
              testID="caption-delete-selected"
            />
          </Row>
        </View>
      ) : null}
      <ScrollView style={{ maxHeight: 300 }} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {captions.length ? null : <Txt dim style={styles.small}>{t('captions.listEmpty')}</Txt>}
        {captions.map((c, i) => {
          const active = position >= c.start && position < c.start + c.duration;
          const checked = selected.has(c.id);
          return (
            <View key={c.id} style={[styles.item, { flexDirection: row }, active && styles.itemActive]}>
              {selecting ? (
                <Pressable onPress={() => toggle(c.id)} hitSlop={8} accessibilityRole="checkbox" accessibilityState={{ checked }} testID={`caption-check-${i}`}>
                  <Icon name={checked ? 'checkbox' : 'square-outline'} size={20} color={checked ? colors.accent : colors.textDim} />
                </Pressable>
              ) : null}
              <Pressable onPress={() => onSeek(c.start + 1)} hitSlop={6} testID={`caption-time-${i}`}>
                <Txt style={styles.time}>{ltr(formatTimecode(c.start, { tenths: true }))}</Txt>
              </Pressable>
              <TextInput
                testID={`caption-text-${i}`}
                value={c.text}
                onChangeText={(text) => onChange(c.id, text, `cap.${c.id}`)}
                multiline
                style={[styles.input, { textAlign }]}
                placeholderTextColor={colors.textFaint}
              />
              {selecting ? null : (
                <Pressable onPress={() => onDelete(c.id)} hitSlop={8} accessibilityLabel={t('common.delete')} testID={`caption-delete-${i}`}>
                  <Icon name="trash-outline" size={18} color={colors.textDim} />
                </Pressable>
              )}
            </View>
          );
        })}
      </ScrollView>
    </Panel>
  );
}

const styles = StyleSheet.create({
  toolbar: { paddingHorizontal: space.lg, gap: space.sm, alignItems: 'center', flexWrap: 'wrap' },
  batch: { paddingHorizontal: space.lg, paddingBottom: space.sm, gap: space.sm },
  item: { alignItems: 'center', gap: space.sm, paddingVertical: 4, paddingHorizontal: 6, borderRadius: radius.md },
  itemActive: { backgroundColor: colors.accentSoft },
  time: { fontSize: 12, color: colors.accent2, fontVariant: ['tabular-nums'], minWidth: 56 },
  input: { flex: 1, color: colors.text, backgroundColor: colors.bg, borderRadius: radius.sm, paddingHorizontal: space.sm, paddingVertical: 4, fontSize: 14, minHeight: 34 },
  body: { paddingHorizontal: space.lg, paddingBottom: space.md, gap: space.sm },
  label: { fontSize: 12, marginTop: 2 },
  small: { fontSize: 12 },
  progress: { gap: space.sm },
  bar: { height: 6, borderRadius: radius.sm, backgroundColor: colors.surface3, overflow: 'hidden' },
  fill: { height: 6, backgroundColor: colors.accent },
});
