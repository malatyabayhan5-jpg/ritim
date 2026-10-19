// Ses efektleri paneli: kategoriye göre ön ayar kutuları ve "Gelişmiş" kipinde
// efekt başına açma/kapama + parametre kaydırıcıları. Panel yalnızca değişikliği
// bildirir: onChange({ audioFx }, key) — `key` kaydırıcı sürüklenirken geri al
// geçmişinin tek adımda birleşmesi içindir (panels.js ile aynı sözleşme).
// Durum biçimi ve yerel tanım: src/model/audio-fx.js.

import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useI18n } from '../i18n';
import { Chip, Icon, Panel, Row, Slider, Txt } from '../ui';
import { colors, radius, space } from '../theme';
import {
  AUDIO_FX_EFFECTS,
  AUDIO_PRESETS,
  AUDIO_PRESET_CATEGORIES,
  audioFxValues,
  audioPresetById,
  applyAudioPreset,
  clampParam,
  createAudioFx,
  isEffectOn,
  isPresetModified,
  setAudioEffectOn,
  setAudioFxParam,
} from '../model/audio-fx';

function Hscroll({ children, testID }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hscroll} testID={testID}>
      {children}
    </ScrollView>
  );
}

function Tile({ label, icon, active, onPress, testID }) {
  return (
    <Pressable testID={testID} onPress={onPress} style={({ pressed }) => [styles.tile, active && styles.tileActive, pressed && { opacity: 0.7 }]}>
      <View style={[styles.tileIcon, active && { backgroundColor: colors.accent }]}>
        <Icon name={icon} size={22} color={active ? colors.text : colors.textDim} />
      </View>
      <Text numberOfLines={2} style={[styles.tileText, active && { color: colors.text }]}>
        {label}
      </Text>
    </Pressable>
  );
}

// Frekans ve geniş aralıklı süreler logaritmik kaydırıcıyla ayarlanır.
const isLog = (d) => d.unit === 'hz' || d.unit === 'hzLfo' || (d.unit === 'ms' && d.max / Math.max(d.min, 0.001) >= 50);
const toSlider = (d, v) => (isLog(d) ? Math.log(Math.max(v, d.min)) : v);
const fromSlider = (d, s) => clampParam(d.key, isLog(d) ? Math.exp(s) : s);

function useFormat() {
  const { t, fmt } = useI18n();
  const n = (v, digits = 0) => fmt.number(v, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
  return (d, v) => {
    if (d.key === 'eqHpFreq' && v <= d.min) return t('audioFx.off');
    if (d.key === 'eqLpFreq' && v >= d.max) return t('audioFx.off');
    switch (d.unit) {
      case 'db':
        return t('audioFx.unit.db', { v: `${v > 0 ? '+' : ''}${n(v, 1)}` });
      case 'hz':
        return v >= 1000 ? t('audioFx.unit.khz', { v: n(v / 1000, v >= 10000 ? 1 : 2) }) : t('audioFx.unit.hz', { v: n(v) });
      case 'hzLfo':
        return t('audioFx.unit.hz', { v: n(v, 2) });
      case 'ms':
        return t('audioFx.unit.ms', { v: n(v, v < 10 ? 1 : 0) });
      case 'pct':
        return t('audioFx.unit.pct', { v: n(Math.round(v * 100)) });
      case 'ratio':
        return t('audioFx.unit.ratio', { v: n(v, 1) });
      case 'q':
        return t('audioFx.unit.q', { v: n(v, 1) });
      case 'st':
        return t('audioFx.unit.st', { v: `${v > 0 ? '+' : ''}${n(v)}` });
      case 'bits':
        return t('audioFx.unit.bits', { v: n(v) });
      default:
        return n(v, 2);
    }
  };
}

function EffectEditor({ fx, effect, onFx }) {
  const { t } = useI18n();
  const format = useFormat();
  const values = audioFxValues(fx);
  const on = isEffectOn(fx, effect.id);
  // Kapalı bir efektin kaydırıcısı oynatılırsa efekt kendiliğinden açılır.
  const setParam = (key, v) => {
    let next = setAudioFxParam(fx, key, v);
    if (effect.toggle && !isEffectOn(next, effect.id)) next = setAudioEffectOn(next, effect.id, true);
    onFx(next, `afx:${key}`);
  };
  return (
    <View style={styles.editor} testID={`audiofx-editor-${effect.id}`}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt style={{ fontWeight: '700', flex: 1 }} numberOfLines={1}>
          {t(`audioFx.effect.${effect.id}`)}
        </Txt>
        <Chip
          testID={`audiofx-toggle-${effect.id}`}
          icon={on ? 'checkmark-circle' : 'ellipse-outline'}
          label={on ? t('audioFx.on') : t('audioFx.off')}
          active={on}
          onPress={() => onFx(setAudioEffectOn(fx, effect.id, !on))}
        />
      </Row>
      <ScrollView style={styles.paramScroll} nestedScrollEnabled>
        {effect.params.map((d) =>
          d.unit === 'bool' ? (
            <Row key={d.key} style={styles.param}>
              <Chip
                testID={`audiofx-param-${d.key}`}
                icon={values[d.key] >= 0.5 ? 'checkbox-outline' : 'square-outline'}
                label={t(`audioFx.param.${d.key}`)}
                active={values[d.key] >= 0.5}
                onPress={() => setParam(d.key, values[d.key] >= 0.5 ? 0 : 1)}
              />
            </Row>
          ) : (
            <Row key={d.key} style={styles.param}>
              <Txt dim style={styles.paramLabel} numberOfLines={1}>
                {t(`audioFx.param.${d.key}`)}
              </Txt>
              <View style={{ flex: 1 }}>
                <Slider
                  testID={`audiofx-param-${d.key}`}
                  value={toSlider(d, values[d.key])}
                  min={toSlider(d, d.min)}
                  max={toSlider(d, d.max)}
                  center={d.min < 0 && d.max > 0 ? 0 : undefined}
                  onChange={(s) => setParam(d.key, fromSlider(d, s))}
                  formatValue={(s) => format(d, fromSlider(d, s))}
                />
              </View>
            </Row>
          ),
        )}
      </ScrollView>
      {effect.id === 'gain' ? (
        <Txt faint style={styles.hint}>
          {t('audioFx.boostHint')}
        </Txt>
      ) : null}
    </View>
  );
}

/**
 * @param value  geçerli durum ({ preset, params }) veya null
 * @param onChange (patch, key) — patch = { audioFx: yeniDurum }
 */
export default function AudioFxPanel({ value, onChange, onClose, testID = 'panel-audiofx' }) {
  const { t } = useI18n();
  const fx = value || createAudioFx();
  const current = audioPresetById(fx.preset);
  const [cat, setCat] = useState(current?.category || AUDIO_PRESET_CATEGORIES[0]);
  const [advanced, setAdvanced] = useState(false);
  const [effectId, setEffectId] = useState(AUDIO_FX_EFFECTS[0].id);
  const effect = AUDIO_FX_EFFECTS.find((e) => e.id === effectId) || AUDIO_FX_EFFECTS[0];
  const emit = (next, key) => onChange({ audioFx: next }, key);
  const modified = isPresetModified(fx);
  const anyOn = AUDIO_FX_EFFECTS.some((e) => isEffectOn(fx, e.id));

  return (
    <Panel title={t('audioFx.title')} onClose={onClose} testID={testID}>
      <View style={styles.body}>
        <Hscroll>
          {AUDIO_PRESET_CATEGORIES.map((c) => (
            <Chip key={c} label={t(`audioFx.category.${c}`)} active={!advanced && cat === c} onPress={() => { setAdvanced(false); setCat(c); }} testID={`audiofx-cat-${c}`} />
          ))}
          <Chip icon="options-outline" label={t('audioFx.advanced')} active={advanced} onPress={() => setAdvanced(!advanced)} testID="audiofx-advanced" />
        </Hscroll>

        {advanced ? (
          <>
            <Hscroll testID="audiofx-effects">
              {AUDIO_FX_EFFECTS.map((e) => (
                <Chip
                  key={e.id}
                  icon={isEffectOn(fx, e.id) ? 'ellipse' : e.icon}
                  label={t(`audioFx.effect.${e.id}`)}
                  active={effectId === e.id}
                  onPress={() => setEffectId(e.id)}
                  testID={`audiofx-effect-${e.id}`}
                />
              ))}
            </Hscroll>
            <EffectEditor fx={fx} effect={effect} onFx={emit} />
          </>
        ) : (
          <Hscroll testID="audiofx-presets">
            <Tile testID="audiofx-none" label={t('audioFx.none')} icon="ban-outline" active={!fx.preset && !anyOn} onPress={() => emit(createAudioFx())} />
            {AUDIO_PRESETS.filter((pr) => pr.category === cat).map((pr) => (
              <Tile key={pr.id} testID={`audiofx-preset-${pr.id}`} label={t(`audioFx.preset.${pr.id}`)} icon={pr.icon} active={fx.preset === pr.id} onPress={() => emit(applyAudioPreset(fx, pr.id))} />
            ))}
          </Hscroll>
        )}

        <Row style={{ justifyContent: 'space-between' }}>
          <Txt faint style={[styles.hint, { flex: 1 }]} numberOfLines={2}>
            {current ? `${t(`audioFx.preset.${current.id}`)}${modified ? ` · ${t('audioFx.modified')}` : ''}` : anyOn ? t('audioFx.custom') : t('audioFx.hint')}
          </Txt>
          {anyOn ? (
            <Chip
              icon="refresh"
              label={t('audioFx.reset')}
              onPress={() => emit(current && modified ? applyAudioPreset(fx, current.id) : createAudioFx())}
              testID="audiofx-reset"
            />
          ) : null}
        </Row>
      </View>
    </Panel>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.lg, gap: space.sm, paddingBottom: space.sm },
  hscroll: { gap: space.sm, paddingVertical: 2 },
  tile: { width: 78, alignItems: 'center', gap: 4, padding: 3, borderRadius: radius.md, borderWidth: 2, borderColor: 'transparent' },
  tileActive: { borderColor: colors.accent },
  tileIcon: { width: 54, height: 54, borderRadius: radius.pill, backgroundColor: colors.surface3, alignItems: 'center', justifyContent: 'center' },
  tileText: { color: colors.textDim, fontSize: 11, textAlign: 'center' },
  editor: { gap: 4 },
  paramScroll: { maxHeight: 220 },
  param: { minHeight: 36 },
  paramLabel: { width: 104, fontSize: 12 },
  hint: { fontSize: 12 },
});
