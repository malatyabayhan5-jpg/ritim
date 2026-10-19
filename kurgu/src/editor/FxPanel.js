// Efekt paneli: kategori sekmeleri, gerçek önizleme görselli efekt kutuları,
// uygulanmış efektler ve seçili efektin yoğunluk/parametre ayarları.
// İki kipte çalışır: 'clip' (seçili klibe efekt yığını) ve 'layer' (zaman
// çizelgesindeki efekt katmanı). Efektler merkezi katalogdan gelir.

import { useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useI18n } from '../i18n';
import { Chip, Icon, Panel, Row, Slider, Txt } from '../ui';
import { colors, radius, space } from '../theme';
import { FX_CATALOG, FX_CATEGORIES, effectById } from '../model/effects';
import { FX_THUMBS } from '../model/fxThumbs';
import { keyAt, removeKey, setKey, valueAt } from '../model/keyframes';

/** localMs: oynatma kafasının efekt başlangıcına göre konumu (yoğunluk anahtar kareleri için). */
export default function FxPanel({ mode, instances, selectedId, onPick, onSelect, onUpdate, onRemove, onClose, maxReached, localMs = 0 }) {
  const { t, fmt } = useI18n();
  const selected = instances.find((i) => i.id === selectedId) || null;
  const [cat, setCat] = useState(() => effectById(selected?.effectId)?.category || 'all');
  const list = useMemo(() => FX_CATALOG.filter((e) => cat === 'all' || e.category === cat), [cat]);
  const effect = selected ? effectById(selected.effectId) : null;

  return (
    <Panel title={t(mode === 'layer' ? 'fx.titleLayer' : 'fx.titleClip')} onClose={onClose} testID="panel-fx">
      <View style={styles.body}>
        {mode === 'clip' && instances.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hscroll}>
            {instances.map((inst) => (
              <Chip
                key={inst.id}
                testID={`fx-applied-${inst.effectId}`}
                icon={inst.id === selectedId ? 'options' : 'sparkles-outline'}
                label={t(`fx.${inst.effectId}.name`)}
                active={inst.id === selectedId}
                onPress={() => onSelect(inst.id)}
              />
            ))}
          </ScrollView>
        ) : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hscroll}>
          {['all', ...FX_CATEGORIES].map((c) => (
            <Chip key={c} label={t(`fx.category.${c}`)} active={cat === c} onPress={() => setCat(c)} testID={`fx-cat-${c}`} />
          ))}
        </ScrollView>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hscroll} testID="fx-tiles">
          {list.map((e) => {
            const active = selected?.effectId === e.id;
            return (
              <Pressable key={e.id} testID={`fx-tile-${e.id}`} onPress={() => onPick(e.id)} style={({ pressed }) => [styles.tile, active && styles.tileActive, pressed && { opacity: 0.7 }]}>
                <View style={styles.thumbWrap}>
                  {FX_THUMBS[e.id] ? <Image source={FX_THUMBS[e.id]} style={styles.thumb} /> : <Icon name="sparkles-outline" />}
                  {e.perf === 'heavy' ? (
                    <View style={styles.badge}>
                      <Icon name="flash" size={10} color={colors.bg} />
                    </View>
                  ) : null}
                </View>
                <Text numberOfLines={1} style={[styles.tileText, active && { color: colors.text }]}>
                  {t(`fx.${e.id}.name`)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        {maxReached ? <Txt faint style={styles.hint}>{t('fx.maxReached')}</Txt> : null}

        {selected && effect ? (
          <View style={styles.params} testID="fx-params">
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt style={{ fontWeight: '700', flex: 1 }} numberOfLines={1}>
                {t(`fx.${effect.id}.name`)}
              </Txt>
              <Chip icon="trash-outline" label={t('fx.remove')} onPress={() => onRemove(selected.id)} testID="fx-remove" />
            </Row>
            <Txt faint style={styles.hint} numberOfLines={2}>
              {t(`fx.${effect.id}.desc`)}
              {effect.perf === 'heavy' ? ` · ${t('fx.perf.heavy')}` : ''}
            </Txt>
            <ParamSlider
              label={t('fx.amount')}
              value={valueAt(selected.keyframes?.amount, localMs, selected.amount ?? 1)}
              onChange={(v) => {
                const track = selected.keyframes?.amount;
                // Anahtar kare varsa oynatma kafasındaki kare düzenlenir
                if (track?.length) onUpdate(selected.id, { keyframes: { ...selected.keyframes, amount: setKey(track, localMs, v) } }, `fxamt:${selected.id}`);
                else onUpdate(selected.id, { amount: v }, `fxamt:${selected.id}`);
              }}
              format={(v) => fmt.number(Math.round(v * 100))}
              testID="fx-amount"
              keyState={selected.keyframes?.amount?.length ? (keyAt(selected.keyframes.amount, localMs) ? 'on' : 'has') : 'none'}
              onToggleKey={() => {
                const track = selected.keyframes?.amount || [];
                const v = valueAt(track, localMs, selected.amount ?? 1);
                const next = keyAt(track, localMs) ? removeKey(track, localMs) : setKey(track, localMs, v);
                const keyframes = { ...selected.keyframes };
                if (next.length) keyframes.amount = next;
                else delete keyframes.amount;
                onUpdate(selected.id, next.length ? { keyframes } : { keyframes, amount: v }, null);
              }}
            />
            {effect.params.map((p) => (
              <ParamSlider
                key={p.key}
                label={t(`fx.param.${p.key}`)}
                value={selected.values?.[p.key] ?? p.default}
                min={p.min ?? 0}
                max={p.max ?? 1}
                onChange={(v) => onUpdate(selected.id, { values: { [p.key]: v } }, `fx:${selected.id}:${p.key}`)}
                format={(v) => fmt.number(Math.round(v * 100))}
              />
            ))}
          </View>
        ) : null}
      </View>
    </Panel>
  );
}

function ParamSlider({ label, value, min = 0, max = 1, onChange, format, testID, keyState, onToggleKey }) {
  return (
    <View style={styles.param}>
      <Txt dim style={styles.paramLabel} numberOfLines={1}>
        {label}
      </Txt>
      <View style={{ flex: 1 }}>
        <Slider value={value} min={min} max={max} onChange={(v) => onChange(Math.round(v * 100) / 100)} formatValue={format} testID={testID} />
      </View>
      {onToggleKey ? (
        <Pressable testID={testID ? `${testID}-key` : undefined} hitSlop={10} onPress={onToggleKey} accessibilityLabel={label}>
          <Icon name={keyState === 'on' ? 'diamond' : 'diamond-outline'} size={16} color={keyState === 'none' ? colors.textDim : colors.accent} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.lg, gap: space.sm, paddingBottom: space.sm },
  hscroll: { gap: space.sm, paddingVertical: 2 },
  tile: { width: 76, alignItems: 'center', gap: 4, padding: 3, borderRadius: radius.md, borderWidth: 2, borderColor: 'transparent' },
  tileActive: { borderColor: colors.accent },
  thumbWrap: { width: 66, height: 66, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: colors.surface3, alignItems: 'center', justifyContent: 'center' },
  thumb: { width: 66, height: 66 },
  badge: { position: 'absolute', top: 3, right: 3, width: 16, height: 16, borderRadius: 8, backgroundColor: colors.warning, alignItems: 'center', justifyContent: 'center' },
  tileText: { color: colors.textDim, fontSize: 11 },
  hint: { fontSize: 12 },
  params: { gap: 2 },
  param: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  paramLabel: { width: 96, fontSize: 12 },
});
