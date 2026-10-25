// Üst katman (resim içinde resim) paneli: konum/ölçek/döndürme, opaklık, maske,
// chroma key ve katman sırası. Konum/ölçek/döndürme/opaklık anahtar kare destekler:
// elmas düğmesi oynatma kafasında kare ekler/siler; iz varsa kaydırıcı o anki kareyi düzenler.

import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useI18n } from '../i18n';
import { Chip, Icon, Panel, Row, Slider, Txt } from '../ui';
import { colors, radius, space } from '../theme';
import { MASK_TYPES } from '../model/schema';
import { BLEND_MODES } from '../model/photo';
import { keyAt } from '../model/keyframes';
import { overlayPropAt, overlayPropPatch, toggleOverlayKey } from '../model/timeline';

const TABS = ['position', 'mask', 'chroma', 'order'];
const KEY_COLORS = ['#00B140', '#0047BB', '#1EBE3C', '#2A5BD7'];

function Hscroll({ children }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hscroll}>
      {children}
    </ScrollView>
  );
}

const OVERLAY_KEYS = { at: overlayPropAt, patch: overlayPropPatch, toggle: toggleOverlayKey, live: 'ovl' };

/** Elmas düğmeli kaydırıcı; `api` özellik okuma/yazma işlevlerini verir (katman ya da metin). */
export function KeySlider({ item, prop, label, localMs, min, max, center, format, onChange, testID, api = OVERLAY_KEYS }) {
  const has = !!item.keyframes?.[prop]?.length;
  const onKey = !!keyAt(item.keyframes?.[prop], localMs);
  const v = api.at(item, prop, localMs);
  return (
    <View style={styles.labeled}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt dim style={styles.label}>
          {label}
        </Txt>
        <Pressable
          testID={`kf-${prop}`}
          hitSlop={10}
          onPress={() => onChange(api.toggle(item, prop, localMs), null)}
          accessibilityLabel={label}
        >
          <Icon name={onKey ? 'diamond' : 'diamond-outline'} size={16} color={has ? colors.accent : colors.textDim} />
        </Pressable>
      </Row>
      <Slider
        testID={testID}
        value={v}
        min={min}
        max={max}
        center={center}
        onChange={(nv) => onChange(api.patch(item, prop, Math.round(nv * 1000) / 1000, localMs), `${api.live}-${prop}`)}
        formatValue={format}
      />
    </View>
  );
}

export default function LayerPanel({ item, localMs, onChange, onLane, onDetectKey, onClose, initialTab = 'position' }) {
  const { t, fmt } = useI18n();
  const [tab, setTab] = useState(initialTab);
  const m = item.mask;
  const c = item.chroma;
  const pct = (v) => `${fmt.number(Math.round(v * 100))}%`;
  return (
    <Panel title={t('layer.title')} onClose={onClose} testID="panel-layer">
      <View style={styles.body}>
        <Hscroll>
          {(item.kind === 'image' ? ['position', 'blend', 'mask', 'chroma', 'order'] : TABS).map((k) => (
            <Chip key={k} label={t(`layer.tab.${k}`)} active={tab === k} onPress={() => setTab(k)} testID={`layer-tab-${k}`} />
          ))}
        </Hscroll>

        {tab === 'position' ? (
          <>
            <KeySlider item={item} prop="scale" label={t('panels.scale')} localMs={localMs} min={0.05} max={3} center={1} format={pct} onChange={onChange} testID="layer-scale" />
            <KeySlider item={item} prop="x" label={t('panels.positionX')} localMs={localMs} min={-1.2} max={1.2} center={0} format={(v) => fmt.number(Math.round(v * 100))} onChange={onChange} />
            <KeySlider item={item} prop="y" label={t('panels.positionY')} localMs={localMs} min={-1.2} max={1.2} center={0} format={(v) => fmt.number(Math.round(v * 100))} onChange={onChange} />
            <KeySlider item={item} prop="rotation" label={t('layer.rotation')} localMs={localMs} min={-180} max={180} center={0} format={(v) => `${fmt.number(Math.round(v))}°`} onChange={onChange} />
            <KeySlider item={item} prop="opacity" label={t('layer.opacity')} localMs={localMs} min={0} max={1} format={pct} onChange={onChange} testID="layer-opacity" />
            <Hscroll>
              <Chip icon="swap-horizontal" label={t('panels.flipH')} active={item.transform.flipH} onPress={() => onChange({ transform: { flipH: !item.transform.flipH } })} />
              <Chip icon="swap-vertical" label={t('panels.flipV')} active={item.transform.flipV} onPress={() => onChange({ transform: { flipV: !item.transform.flipV } })} />
              <Chip icon="refresh" label={t('panels.reset')} onPress={() => onChange({ transform: { x: 0, y: 0, scale: 0.5, rotation: 0, flipH: false, flipV: false }, opacity: 1, keyframes: {} })} />
            </Hscroll>
            <Txt faint style={styles.hint}>
              {t('layer.keyHint')}
            </Txt>
          </>
        ) : null}

        {tab === 'mask' ? (
          <>
            <Hscroll>
              {MASK_TYPES.map((type) => (
                <Chip key={type} label={t(`layer.mask.${type}`)} active={m.type === type} onPress={() => onChange({ mask: { type } })} testID={`mask-${type}`} />
              ))}
            </Hscroll>
            {m.type !== 'none' ? (
              <>
                {m.type !== 'linear' ? (
                  <View style={styles.labeled}>
                    <Txt dim style={styles.label}>{t('layer.maskSize')}</Txt>
                    <Slider testID="mask-size" value={m.w} min={0.05} max={2} onChange={(v) => onChange({ mask: m.type === 'rect' || m.type === 'ellipse' ? { w: round3(v), h: round3((v * m.h) / Math.max(0.001, m.w)) } : { w: round3(v), h: round3(v) } }, 'mask-size')} formatValue={pct} />
                  </View>
                ) : null}
                {m.type === 'rect' || m.type === 'ellipse' || m.type === 'mirror' ? (
                  <View style={styles.labeled}>
                    <Txt dim style={styles.label}>{t(m.type === 'mirror' ? 'layer.bandWidth' : 'layer.maskHeight')}</Txt>
                    <Slider value={m.h} min={0.02} max={2} onChange={(v) => onChange({ mask: { h: round3(v) } }, 'mask-h')} formatValue={pct} />
                  </View>
                ) : null}
                <View style={styles.labeled}>
                  <Txt dim style={styles.label}>{t('layer.feather')}</Txt>
                  <Slider testID="mask-feather" value={m.feather} min={0} max={0.5} onChange={(v) => onChange({ mask: { feather: round3(v) } }, 'mask-feather')} formatValue={(v) => pct(v * 2)} />
                </View>
                {m.type === 'rect' ? (
                  <View style={styles.labeled}>
                    <Txt dim style={styles.label}>{t('layer.round')}</Txt>
                    <Slider value={m.round} min={0} max={1} onChange={(v) => onChange({ mask: { round: round3(v) } }, 'mask-round')} formatValue={pct} />
                  </View>
                ) : null}
                <View style={styles.labeled}>
                  <Txt dim style={styles.label}>{t('layer.angle')}</Txt>
                  <Slider value={m.angle} min={-180} max={180} center={0} onChange={(v) => onChange({ mask: { angle: Math.round(v) } }, 'mask-angle')} formatValue={(v) => `${fmt.number(Math.round(v))}°`} />
                </View>
                <View style={styles.labeled}>
                  <Txt dim style={styles.label}>{t('layer.maskX')}</Txt>
                  <Slider value={m.x} min={-1} max={1} center={0} onChange={(v) => onChange({ mask: { x: round3(v) } }, 'mask-x')} formatValue={(v) => fmt.number(Math.round(v * 100))} />
                </View>
                <View style={styles.labeled}>
                  <Txt dim style={styles.label}>{t('layer.maskY')}</Txt>
                  <Slider value={m.y} min={-1} max={1} center={0} onChange={(v) => onChange({ mask: { y: round3(v) } }, 'mask-y')} formatValue={(v) => fmt.number(Math.round(v * 100))} />
                </View>
                <Row>
                  <Chip icon="contrast-outline" label={t('layer.invert')} active={m.invert} onPress={() => onChange({ mask: { invert: !m.invert } })} testID="mask-invert" />
                </Row>
              </>
            ) : null}
          </>
        ) : null}

        {tab === 'chroma' ? (
          <>
            <Hscroll>
              <Chip icon={c.on ? 'checkmark-circle' : 'ellipse-outline'} label={t('layer.chromaOn')} active={c.on} onPress={() => onChange({ chroma: { on: !c.on } })} testID="chroma-on" />
              <Chip icon="color-wand-outline" label={t('layer.detectKey')} onPress={onDetectKey} testID="chroma-detect" />
              {KEY_COLORS.map((hex) => (
                <Pressable key={hex} onPress={() => onChange({ chroma: { color: hex, on: true } })} style={[styles.swatch, { backgroundColor: hex }, c.color === hex && styles.swatchActive]} accessibilityLabel={hex} />
              ))}
              <View style={[styles.swatch, { backgroundColor: c.color }]} />
            </Hscroll>
            <View style={styles.labeled}>
              <Txt dim style={styles.label}>{t('layer.tolerance')}</Txt>
              <Slider testID="chroma-tolerance" value={c.tolerance} min={0} max={1} onChange={(v) => onChange({ chroma: { tolerance: round3(v) } }, 'key-tol')} formatValue={pct} />
            </View>
            <View style={styles.labeled}>
              <Txt dim style={styles.label}>{t('layer.edgeSoftness')}</Txt>
              <Slider value={c.softness} min={0} max={1} onChange={(v) => onChange({ chroma: { softness: round3(v) } }, 'key-soft')} formatValue={pct} />
            </View>
            <View style={styles.labeled}>
              <Txt dim style={styles.label}>{t('layer.spill')}</Txt>
              <Slider value={c.spill} min={0} max={1} onChange={(v) => onChange({ chroma: { spill: round3(v) } }, 'key-spill')} formatValue={pct} />
            </View>
          </>
        ) : null}

        {tab === 'blend' ? (
          <>
            <Hscroll>
              {BLEND_MODES.map((m) => (
                <Chip key={m} testID={`layer-blend-${m}`} label={t(`photo.blend.${m}`)} active={(item.blend || 'normal') === m} onPress={() => {
                    // e2e: karışım modu seçimi günlükten doğrulanır (run.sh "Karışım testi")
                    console.log(`[KurguUI] blend ${m}`);
                    onChange({ blend: m });
                  }}
                />
              ))}
            </Hscroll>
            <Txt faint style={styles.hint}>
              {t('layer.blendNote')}
            </Txt>
          </>
        ) : null}

        {tab === 'order' ? (
          <>
            <Hscroll>
              <Chip icon="arrow-up" label={t('layer.bringForward')} onPress={() => onLane(1)} testID="layer-forward" />
              <Chip icon="arrow-down" label={t('layer.sendBackward')} onPress={() => onLane(-1)} testID="layer-backward" />
            </Hscroll>
            <Txt faint style={styles.hint}>
              {t('layer.blendNote')}
            </Txt>
          </>
        ) : null}
      </View>
    </Panel>
  );
}

const round3 = (v) => Math.round(v * 1000) / 1000;

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.lg, gap: space.md, paddingBottom: space.sm },
  hscroll: { gap: space.sm, paddingVertical: 2, alignItems: 'center' },
  labeled: { gap: 2 },
  label: { fontSize: 12 },
  hint: { fontSize: 12 },
  swatch: { width: 30, height: 30, borderRadius: radius.pill, borderWidth: 2, borderColor: colors.border },
  swatchActive: { borderColor: colors.text, borderWidth: 3 },
});
