// Editörün alt panelleri. Her panel yalnızca değer değişikliğini bildirir;
// projeye uygulama ve geri al geçmişi EditorScreen'dedir. `onChange(patch, key)`
// içindeki `key`, kaydırıcı sürüklenirken geçmişin tek adımda birleşmesini sağlar.

import { useState } from 'react';
import { ScrollView, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useI18n } from '../i18n';
import { Button, Chip, Icon, Panel, Row, Slider, Txt } from '../ui';
import { colors, radius, space } from '../theme';
import { ADJUSTMENTS, FILTERS, FILTER_CATEGORIES } from '../model/color';
import {
  ASPECT_OPTIONS,
  FONTS,
  TEXT_ANIMATIONS_IN,
  TEXT_ANIMATIONS_OUT,
  TEXT_COLORS,
  TEXT_PRESETS,
  TRANSITIONS,
  TRANSITION_CATEGORIES,
  TRANSITION_MAX_MS,
  TRANSITION_MIN_MS,
} from '../model/catalog';
import { DEFAULT_ADJUST } from '../model/schema';
import { SPEED_MAX, SPEED_MIN, mainPropAt, mainPropPatch, toggleMainKey, toggleVolumeKey, volumeAt, volumePatch } from '../model/timeline';
import { EASING_IDS, ease, keyAt } from '../model/keyframes';
import { CURVE_HANDLES, SPEED_PRESETS as CURVE_PRESETS, curveAt, presetCurve } from '../model/speed';

const SPEED_PRESETS = [0.25, 0.5, 1, 1.5, 2, 3, 5, 10, 20, 50, 100];

export function Hscroll({ children }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hscroll}>
      {children}
    </ScrollView>
  );
}

export function Labeled({ label, children }) {
  return (
    <View style={styles.labeled}>
      <Txt dim style={styles.label}>
        {label}
      </Txt>
      {children}
    </View>
  );
}

/**
 * Hız paneli. `onCurve` verilirse (ana iz videoları) "Eğri" sekmesi açılır: hazır
 * eğriler ve 5 noktanın hızı düzenlenir; sabit hız seçilince eğri kaldırılır.
 */
export function SpeedPanel({ clip, onChange, onCurve, onClose }) {
  const { t, fmt } = useI18n();
  const [mode, setMode] = useState(clip.speedCurve ? 'curve' : 'normal');
  // Logaritmik kaydırıcı: 0.1x..100x (10x üstü tam sayıya yuvarlanır)
  const toSlider = (s) => Math.log10(s);
  const fromSlider = (v) => {
    const s = Math.pow(10, v);
    return s >= 10 ? Math.round(s) : Math.round(s * 100) / 100;
  };
  const curve = clip.speedCurve;
  const handles = CURVE_HANDLES.map((x) => (curve ? curveAt(curve.points, x) : clip.speed || 1));
  const setHandle = (i, v) =>
    onCurve({ preset: null, points: CURVE_HANDLES.map((x, k) => ({ x, v: k === i ? v : handles[k] })) }, `curve-${i}`);
  return (
    <Panel title={t('tools.speed')} onClose={onClose} testID="panel-speed">
      <View style={styles.body}>
        {onCurve ? (
          <Hscroll>
            <Chip label={t('speed.normal')} active={mode === 'normal'} onPress={() => setMode('normal')} testID="speed-mode-normal" />
            <Chip label={t('speed.curve')} active={mode === 'curve'} onPress={() => setMode('curve')} testID="speed-mode-curve" />
          </Hscroll>
        ) : null}
        {mode === 'normal' ? (
          <>
            <Slider
              testID="speed-slider"
              value={toSlider(clip.speed)}
              min={Math.log10(SPEED_MIN)}
              max={Math.log10(SPEED_MAX)}
              center={0}
              onChange={(v) => onChange({ speed: fromSlider(v) }, 'speed')}
              formatValue={(v) => `${fmt.number(fromSlider(v), { maximumFractionDigits: 2 })}x`}
            />
            <Hscroll>
              {SPEED_PRESETS.map((s) => (
                <Chip key={s} label={`${fmt.number(s)}x`} active={!curve && Math.abs(clip.speed - s) < 0.01} onPress={() => onChange({ speed: s })} />
              ))}
            </Hscroll>
            <Txt faint style={styles.hint}>
              {t('panels.speedHint')}
            </Txt>
            {!curve && clip.speed > 10 ? (
              <Txt faint style={styles.hint} testID="speed-fast-note">
                {t('panels.speedFastNote')}
              </Txt>
            ) : null}
          </>
        ) : (
          <>
            <Hscroll>
              <Chip label={t('speed.preset.none')} active={!curve} onPress={() => onCurve(null)} testID="curve-none" />
              {CURVE_PRESETS.map((p) => (
                <Chip key={p.id} label={t(`speed.preset.${p.id}`)} active={curve?.preset === p.id} onPress={() => onCurve(presetCurve(p.id))} testID={`curve-${p.id}`} />
              ))}
            </Hscroll>
            {/* Eğri önizlemesi: kaynak boyunca hız (logaritmik yükseklik) */}
            <View style={styles.curveBox} testID="curve-preview">
              {Array.from({ length: 40 }, (_, i) => {
                const v = curve ? curveAt(curve.points, (i + 0.5) / 40) : clip.speed || 1;
                const h = 6 + ((Math.log10(v) + 1) / 2) * 50;
                return <View key={i} style={[styles.curveBar, { height: h, backgroundColor: v >= 1 ? colors.accent : colors.textDim }]} />;
              })}
            </View>
            {curve ? (
              <Row gap={4} style={{ justifyContent: 'space-between' }}>
                {handles.map((v, i) => (
                  <View key={i} style={{ flex: 1 }}>
                    <Slider
                      testID={`curve-handle-${i}`}
                      value={Math.log10(v)}
                      min={-1}
                      max={1}
                      center={0}
                      onChange={(nv) => setHandle(i, Math.round(Math.pow(10, nv) * 100) / 100)}
                      formatValue={(nv) => `${fmt.number(Math.round(Math.pow(10, nv) * 10) / 10)}x`}
                    />
                  </View>
                ))}
              </Row>
            ) : null}
            <Txt faint style={styles.hint}>
              {t('speed.curveHint')}
            </Txt>
          </>
        )}
      </View>
    </Panel>
  );
}

/** `localMs` verilirse ses düzeyi anahtar kareyle (◆) zamana göre değiştirilebilir. */
export function VolumePanel({ item, maxFadeMs, onChange, onClose, canMute = true, localMs = null }) {
  const { t, fmt } = useI18n();
  const pct = (v) => `${fmt.number(Math.round(v * 100))}%`;
  const sec = (ms) => fmt.duration(ms);
  const keyed = localMs !== null;
  const track = item.keyframes?.volume;
  return (
    <Panel title={t('tools.volume')} onClose={onClose} testID="panel-volume">
      <View style={styles.body}>
        {keyed ? (
          <KeyRow label={t('panels.volume')} has={!!track?.length} onKey={!!keyAt(track, localMs)} onToggle={() => onChange(toggleVolumeKey(item, localMs), null)} testID="kf-volume">
            <Slider testID="volume-slider" value={item.muted ? 0 : volumeAt(item, localMs)} min={0} max={1} onChange={(v) => onChange(volumePatch(item, v, localMs), 'volume')} formatValue={pct} />
          </KeyRow>
        ) : (
          <Labeled label={t('panels.volume')}>
            <Slider testID="volume-slider" value={item.muted ? 0 : item.volume} min={0} max={1} onChange={(v) => onChange({ volume: v, muted: false }, 'volume')} formatValue={pct} />
          </Labeled>
        )}
        {keyed && track?.length ? (
          <Txt faint style={styles.hint}>
            {t('panels.volumeKeyHint')}
          </Txt>
        ) : null}
        <Labeled label={t('panels.fadeIn')}>
          <Slider value={item.fadeIn || 0} min={0} max={maxFadeMs} step={100} onChange={(v) => onChange({ fadeIn: v }, 'fadeIn')} formatValue={sec} />
        </Labeled>
        <Labeled label={t('panels.fadeOut')}>
          <Slider value={item.fadeOut || 0} min={0} max={maxFadeMs} step={100} onChange={(v) => onChange({ fadeOut: v }, 'fadeOut')} formatValue={sec} />
        </Labeled>
        <Labeled label={t('panels.denoise')}>
          <Slider testID="denoise-slider" value={item.denoise || 0} min={0} max={1} onChange={(v) => onChange({ denoise: Math.round(v * 100) / 100 }, 'denoise')} formatValue={pct} />
        </Labeled>
        {canMute ? (
          <Row>
            <Chip icon={item.muted ? 'volume-mute' : 'volume-high'} label={item.muted ? t('panels.unmute') : t('panels.mute')} active={item.muted} onPress={() => onChange({ muted: !item.muted })} testID="mute-toggle" />
          </Row>
        ) : null}
      </View>
    </Panel>
  );
}

export function Tile({ label, active, onPress, color, icon, testID }) {
  return (
    <Pressable testID={testID} onPress={onPress} style={({ pressed }) => [styles.tile, active && styles.tileActive, pressed && { opacity: 0.7 }]}>
      <View style={[styles.tileSwatch, { backgroundColor: color || colors.surface3 }]}>{icon ? <Icon name={icon} size={22} /> : null}</View>
      <Text numberOfLines={1} style={[styles.tileText, active && { color: colors.text }]}>
        {label}
      </Text>
    </Pressable>
  );
}

// Filtre önizleme renkleri: filtrenin orta griye etkisi (gerçek matristen hesaplanır).
function swatch(matrix) {
  const base = [0.55, 0.42, 0.33];
  const out = [0, 1, 2].map((r) => Math.max(0, Math.min(1, matrix[r] * base[0] + matrix[4 + r] * base[1] + matrix[8 + r] * base[2] + matrix[12 + r])));
  return `rgb(${out.map((v) => Math.round(v * 255)).join(',')})`;
}

export function FilterPanel({ clip, luts = {}, onImportLut, onChange, onApplyAll, onClose, tabs }) {
  const { t, fmt } = useI18n();
  const [cat, setCat] = useState(clip.lut ? 'lut' : FILTERS.find((f) => f.id === clip.filter.id)?.category || 'basic');
  const lutList = Object.values(luts);
  const isLut = cat === 'lut';
  return (
    <Panel title={t('tools.filters')} onClose={onClose} testID="panel-filters" tabs={tabs}>
      <View style={styles.body}>
        <Hscroll>
          {[...FILTER_CATEGORIES, ...(onImportLut ? ['lut'] : [])].map((c) => (
            <Chip key={c} label={t(`filters.category.${c}`)} active={cat === c} onPress={() => setCat(c)} testID={`filter-cat-${c}`} />
          ))}
        </Hscroll>
        {isLut ? (
          <Hscroll>
            <Tile testID="lut-none" label={t('filters.none')} icon="ban-outline" active={!clip.lut} onPress={() => onChange({ lut: null })} />
            {lutList.map((l) => (
              <Tile key={l.id} testID={`lut-${l.id}`} label={l.name} icon="cube-outline" active={clip.lut?.id === l.id} onPress={() => onChange({ lut: { id: l.id, intensity: clip.lut?.id === l.id ? clip.lut.intensity : 1 } })} />
            ))}
            <Tile testID="lut-import" label={t('filters.lutImport')} icon="add-circle-outline" onPress={onImportLut} />
          </Hscroll>
        ) : (
          <Hscroll>
            {FILTERS.filter((f) => f.category === cat || f.id === 'none').map((f) => (
              <Tile key={f.id} testID={`filter-${f.id}`} label={t(`filters.${f.id}`)} color={swatch(f.matrix)} icon={f.id === 'none' ? 'ban-outline' : null} active={clip.filter.id === f.id} onPress={() => onChange({ filter: { id: f.id, intensity: clip.filter.id === f.id ? clip.filter.intensity : 1 } })} />
            ))}
          </Hscroll>
        )}
        {isLut && clip.lut ? (
          <Labeled label={t('panels.intensity')}>
            <Slider value={clip.lut.intensity} min={0} max={1} onChange={(v) => onChange({ lut: { id: clip.lut.id, intensity: v } }, 'lutIntensity')} formatValue={(v) => fmt.number(Math.round(v * 100))} />
          </Labeled>
        ) : null}
        {!isLut && clip.filter.id !== 'none' ? (
          <Labeled label={t('panels.intensity')}>
            <Slider value={clip.filter.intensity} min={0} max={1} onChange={(v) => onChange({ filter: { id: clip.filter.id, intensity: v } }, 'filterIntensity')} formatValue={(v) => fmt.number(Math.round(v * 100))} />
          </Labeled>
        ) : null}
        {isLut && !lutList.length ? <Txt faint style={{ fontSize: 12 }}>{t('filters.lutHint')}</Txt> : null}
        {onApplyAll ? (
          <Row>
            <Chip icon="copy-outline" label={t('panels.applyToAll')} onPress={() => onApplyAll(isLut ? { lut: clip.lut } : { filter: clip.filter })} />
          </Row>
        ) : null}
      </View>
    </Panel>
  );
}

/** `only`: gösterilecek ayar anahtarları (ör. katmanlarda yalnızca renk matrisi ayarları). */
export function AdjustPanel({ clip, onChange, onApplyAll, onClose, only, onAuto, tabs }) {
  const { t, fmt } = useI18n();
  const list = only ? ADJUSTMENTS.filter((a) => only.includes(a.key)) : ADJUSTMENTS;
  const [key, setKey] = useState(list[0].key);
  const def = ADJUSTMENTS.find((a) => a.key === key);
  const value = clip.adjust[key] || 0;
  return (
    <Panel title={t('tools.adjust')} onClose={onClose} testID="panel-adjust" tabs={tabs}>
      <View style={styles.body}>
        <Hscroll>
          {list.map((a) => (
            <Chip key={a.key} label={t(`adjust.${a.key}`)} active={key === a.key} onPress={() => setKey(a.key)} icon={clip.adjust[a.key] ? 'ellipse' : null} testID={`adjust-${a.key}`} />
          ))}
        </Hscroll>
        <Slider
          testID="adjust-slider"
          value={value}
          min={def.min}
          max={def.max}
          center={0}
          onChange={(v) => onChange({ adjust: { [key]: Math.round(v * 100) / 100 } }, `adjust.${key}`)}
          formatValue={(v) => fmt.number(Math.round(v * 100))}
        />
        <Row>
          {onAuto ? <Chip icon="color-wand-outline" label={t('panels.autoEnhance')} onPress={onAuto} testID="adjust-auto" /> : null}
          <Chip icon="refresh" label={t('panels.reset')} onPress={() => onChange({ adjust: { ...DEFAULT_ADJUST } })} />
          {onApplyAll ? <Chip icon="copy-outline" label={t('panels.applyToAll')} onPress={() => onApplyAll({ adjust: clip.adjust })} /> : null}
        </Row>
      </View>
    </Panel>
  );
}

/** Anahtar kare düğmeli kaydırıcı (◆: oynatma kafasında kare ekle/sil). */
function KeyRow({ label, has, onKey, onToggle, children, testID }) {
  return (
    <View style={styles.labeled}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt dim style={styles.label}>
          {label}
        </Txt>
        <Pressable testID={testID} hitSlop={10} onPress={onToggle} accessibilityLabel={label}>
          <Icon name={onKey ? 'diamond' : 'diamond-outline'} size={16} color={has ? colors.accent : colors.textDim} />
        </Pressable>
      </Row>
      {children}
    </View>
  );
}

export function TransformPanel({ clip, canvasFit, localMs = 0, onChange, onClose }) {
  const { t, fmt } = useI18n();
  const tr = clip.transform;
  const fit = tr.fit || canvasFit;
  const keyed = (prop, label, min, max, center, format, testID) => {
    const track = clip.keyframes?.[prop];
    return (
      <KeyRow
        key={prop}
        label={label}
        has={!!track?.length}
        onKey={!!keyAt(track, localMs)}
        onToggle={() => onChange(toggleMainKey(clip, prop, localMs), null)}
        testID={`kf-main-${prop}`}
      >
        <Slider
          testID={testID}
          value={mainPropAt(clip, prop, localMs)}
          min={min}
          max={max}
          center={center}
          onChange={(v) => onChange(mainPropPatch(clip, prop, Math.round(v * 1000) / 1000, localMs), `main-${prop}`)}
          formatValue={format}
        />
      </KeyRow>
    );
  };
  return (
    <Panel title={t('tools.transform')} onClose={onClose} testID="panel-transform">
      <View style={styles.body}>
        <Hscroll>
          <Chip icon="refresh" label={t('panels.rotate')} onPress={() => onChange({ transform: { rotation: ((tr.rotation || 0) + 90) % 360 } })} testID="rotate" />
          <Chip icon="swap-horizontal" label={t('panels.flipH')} active={tr.flipH} onPress={() => onChange({ transform: { flipH: !tr.flipH } })} />
          <Chip icon="swap-vertical" label={t('panels.flipV')} active={tr.flipV} onPress={() => onChange({ transform: { flipV: !tr.flipV } })} />
          <Chip icon="contract-outline" label={t('panels.fit')} active={fit === 'fit'} onPress={() => onChange({ transform: { fit: 'fit' } })} />
          <Chip icon="expand-outline" label={t('panels.fill')} active={fit === 'fill'} onPress={() => onChange({ transform: { fit: 'fill' } })} />
        </Hscroll>
        {keyed('scale', t('panels.scale'), 0.2, 4, 1, (v) => `${fmt.number(Math.round(v * 100))}%`)}
        {keyed('x', t('panels.positionX'), -1, 1, 0, (v) => fmt.number(Math.round(v * 100)))}
        {keyed('y', t('panels.positionY'), -1, 1, 0, (v) => fmt.number(Math.round(v * 100)))}
        {keyed('angle', t('layer.rotation'), -180, 180, 0, (v) => `${fmt.number(Math.round(v))}°`)}
        {keyed('opacity', t('layer.opacity'), 0, 1, undefined, (v) => `${fmt.number(Math.round(v * 100))}%`)}
        <Row>
          <Chip icon="refresh" label={t('panels.reset')} onPress={() => onChange({ transform: { rotation: 0, flipH: false, flipV: false, scale: 1, x: 0, y: 0, angle: 0, fit: null }, opacity: 1, keyframes: {} })} />
        </Row>
        <Txt faint style={styles.hint}>
          {t('layer.keyHint')}
        </Txt>
      </View>
    </Panel>
  );
}

export function TransitionPanel({ clip, maxMs, onChange, onApplyAll, onClose }) {
  const { t, fmt } = useI18n();
  const [cat, setCat] = useState(TRANSITIONS.find((x) => x.id === clip.transition.type)?.category || 'basic');
  const limit = Math.max(TRANSITION_MIN_MS, Math.min(TRANSITION_MAX_MS, maxMs));
  return (
    <Panel title={t('tools.transition')} onClose={onClose} testID="panel-transition">
      <View style={styles.body}>
        <Hscroll>
          {TRANSITION_CATEGORIES.map((c) => (
            <Chip key={c} label={t(`transitions.category.${c}`)} active={cat === c} onPress={() => setCat(c)} />
          ))}
        </Hscroll>
        <Hscroll>
          {TRANSITIONS.filter((x) => x.category === cat || x.id === 'none').map((x) => (
            <Tile key={x.id} testID={`transition-type-${x.id}`} label={t(`transitions.${x.id}`)} icon={x.icon} active={clip.transition.type === x.id} onPress={() => onChange({ transition: { type: x.id } })} />
          ))}
        </Hscroll>
        {clip.transition.type !== 'none' ? (
          <Labeled label={t('panels.duration')}>
            <Slider value={Math.min(limit, clip.transition.durationMs)} min={TRANSITION_MIN_MS} max={limit} step={50} onChange={(v) => onChange({ transition: { durationMs: v } }, 'trDur')} formatValue={(v) => fmt.duration(v)} />
          </Labeled>
        ) : null}
        <Row>
          <Chip icon="copy-outline" label={t('panels.applyToAll')} onPress={() => onApplyAll({ transition: clip.transition })} />
        </Row>
      </View>
    </Panel>
  );
}

// Kanvas arka planı için hazır renkler (ilki varsayılan siyah)
import { FPS as EXPORT_FPS, RESOLUTIONS as EXPORT_RESOLUTIONS } from '../model/exportPrefs';

const CANVAS_BG_COLORS = ['#000000FF', '#FFFFFFFF', '#1F2937FF', '#F5E6CCFF', '#E11D48FF', '#2563EBFF', '#16A34AFF', '#F59E0BFF'];

/** Anahtar kare eğrisi: oynatma kafasındaki karelerden sonraki geçişin yumuşatması. */
export function KeyEasePanel({ value, onChange, onClose }) {
  const { t } = useI18n();
  return (
    <Panel title={t('tools.keyEase')} onClose={onClose} testID="panel-keyEase">
      <View style={styles.body}>
        <Hscroll>
          {EASING_IDS.map((id) => (
            <Pressable
              key={id}
              onPress={() => onChange(id)}
              accessibilityRole="button"
              accessibilityLabel={t(`panels.ease.${id}`)}
              accessibilityState={{ selected: value === id }}
              testID={`ease-${id}`}
              style={[styles.easeTile, value === id && styles.easeTileActive]}
            >
              <Svg width={EASE_W} height={EASE_H}>
                <Path d={easePath(id)} stroke={value === id ? colors.accent : colors.text} strokeWidth={2} fill="none" />
              </Svg>
              <Txt numberOfLines={1} style={styles.easeLabel}>
                {t(`panels.ease.${id}`)}
              </Txt>
            </Pressable>
          ))}
        </Hscroll>
        <Txt faint style={styles.hint}>
          {t('panels.easeHint')}
        </Txt>
      </View>
    </Panel>
  );
}

const EASE_W = 56;
const EASE_H = 36;
function easePath(id) {
  // Eğri önizlemesi: x zaman, y değer (yukarı doğru), 24 parça
  const pts = [];
  for (let i = 0; i <= 24; i++) {
    const p = i / 24;
    const v = id === 'hold' ? (i === 24 ? 1 : 0) : ease(id, p);
    pts.push(`${i ? 'L' : 'M'}${(p * (EASE_W - 4) + 2).toFixed(1)} ${(EASE_H - 4 - v * (EASE_H - 8)).toFixed(1)}`);
  }
  return pts.join(' ');
}

/** Editörde Dışa Aktar'ın yanındaki çözünürlük seçicisi: çözünürlük ve kare hızı projeye yazılır. */
export function ExportPrefsPanel({ value, onChange, onClose }) {
  const { t, fmt } = useI18n();
  return (
    <Panel title={t('editor.exportSettings')} onClose={onClose} testID="panel-exportPrefs">
      <View style={styles.body}>
        <Labeled label={t('export.resolution')}>
          <Row>
            {EXPORT_RESOLUTIONS.map((r) => (
              <Chip key={r} label={`${r}p`} active={value.res === r} onPress={() => onChange({ res: r })} testID={`pref-res-${r}`} />
            ))}
          </Row>
        </Labeled>
        <Labeled label={t('export.frameRate')}>
          <Hscroll>
            {EXPORT_FPS.map((f) => (
              <Chip key={f} label={fmt.number(f)} active={value.fps === f} onPress={() => onChange({ fps: f })} testID={`pref-fps-${f}`} />
            ))}
          </Hscroll>
        </Labeled>
        <Txt faint style={styles.hint}>
          {t('editor.exportPrefsHint')}
        </Txt>
      </View>
    </Panel>
  );
}

/** Kanvas: en/boy oranı ve sığdırma; `mode="background"` yalnızca arka planı gösterir (ana araç çubuğu Arka plan). */
export function RatioPanel({ project, onChange, onClose, mode = 'ratio' }) {
  const { t } = useI18n();
  const bg = project.canvas.background || {};
  const fit = project.canvas.fit || 'fit';
  // Doldur kipinde boşluk olmaz: arka plan seçmek sığdır kipine geçirir
  const setBg = (background, key) => onChange(fit === 'fit' ? { background } : { background, fit: 'fit' }, key);
  const background = (
    <Labeled label={t('panels.background')}>
      <Hscroll>
        <Chip label={t('panels.bgBlur')} icon="water-outline" active={bg.type === 'blur'} onPress={() => setBg({ ...bg, type: 'blur' })} testID="canvas-bg-blur" />
        {CANVAS_BG_COLORS.map((c) => (
          <Pressable
            key={c}
            onPress={() => setBg({ ...bg, type: 'color', color: c })}
            accessibilityRole="button"
            accessibilityLabel={c === CANVAS_BG_COLORS[0] ? t('panels.bgBlack') : t('panels.bgColor')}
            accessibilityState={{ selected: bg.type !== 'blur' && (bg.color || CANVAS_BG_COLORS[0]) === c }}
            testID={`canvas-bg-${c.slice(1, 7)}`}
            style={[styles.swatch, { backgroundColor: c }, bg.type !== 'blur' && (bg.color || CANVAS_BG_COLORS[0]) === c && styles.swatchActive]}
          />
        ))}
      </Hscroll>
      {bg.type === 'blur' ? (
        <Slider value={bg.blur ?? 0.5} min={0} max={1} onChange={(v) => setBg({ ...bg, blur: v }, 'bgBlur')} formatValue={(v) => `${Math.round(v * 100)}%`} testID="canvas-bg-blur-amount" />
      ) : null}
    </Labeled>
  );
  if (mode === 'background') {
    return (
      <Panel title={t('tools.background')} onClose={onClose} testID="panel-background">
        <View style={styles.body}>{background}</View>
      </Panel>
    );
  }
  return (
    <Panel title={t('tools.ratio')} onClose={onClose} testID="panel-ratio">
      <View style={styles.body}>
        <Hscroll>
          {ASPECT_OPTIONS.map((r) => (
            <Chip key={r} label={r} active={project.canvas.ratio === r} onPress={() => onChange({ ratio: r })} testID={`ratio-${r}`} />
          ))}
        </Hscroll>
        <Labeled label={t('panels.canvasFit')}>
          <Row>
            <Chip icon="contract-outline" label={t('panels.fit')} active={fit === 'fit'} onPress={() => onChange({ fit: 'fit' })} />
            <Chip icon="expand-outline" label={t('panels.fill')} active={fit === 'fill'} onPress={() => onChange({ fit: 'fill' })} />
          </Row>
        </Labeled>
        {fit === 'fit' ? background : null}
        <Txt faint style={styles.hint}>
          {t('panels.ratioHint')}
        </Txt>
      </View>
    </Panel>
  );
}

export function ImageDurationPanel({ clip, onChange, onClose }) {
  const { t, fmt } = useI18n();
  const ms = clip.srcOut - clip.srcIn;
  return (
    <Panel title={t('tools.duration')} onClose={onClose} testID="panel-duration">
      <View style={styles.body}>
        <Slider value={ms} min={500} max={15000} step={100} onChange={(v) => onChange({ srcIn: 0, srcOut: v }, 'imgDur')} formatValue={(v) => fmt.duration(v)} />
      </View>
    </Panel>
  );
}

// Metin paneli ekleri: şablonlar (kategorili), adlı stiller ve döngü animasyonları
import { TEXT_ANIMATIONS_LOOP, TEXT_LAYOUTS } from '../model/catalog';
import { TEXT_LAYOUT_BASE_CATEGORY, TEXT_LAYOUT_CATEGORIES } from '../model/text-pack2';
import { DEFAULT_TEXT_STYLE } from '../model/schema';

const TEXT_TABS = ['style', 'font', 'color', 'stroke', 'layout', 'animation', 'templates'];
const TILE_FONT = { sans: 'sans-serif', display: 'sans-serif-black', condensed: 'sans-serif-condensed', light: 'sans-serif-light', serif: 'serif', mono: 'monospace', casual: 'casual', cursive: 'cursive' };
// Stil seçilince yalnızca görünüm sıfırlanır; boyut, hizalama, satır aralığı ve opaklık korunur.
const { size: _s, align: _a, lineHeight: _lh, opacity: _o, ...STYLE_LOOK_RESET } = DEFAULT_TEXT_STYLE;
const layoutCategory = (l) => l.category || TEXT_LAYOUT_BASE_CATEGORY[l.id] || 'title';

/** Stil/şablon önizleme karosu: yerel çizimin yaklaşığı (renk, kutu, kontur, yazı tipi). */
function TextStyleTile({ style, label, onPress, testID }) {
  const s = { ...DEFAULT_TEXT_STYLE, ...style };
  const hasBg = s.background && !s.background.endsWith('00');
  const frame = hasBg && s.boxStyle === 'frame';
  const transparentFill = s.color.endsWith('00');
  const glowColor = s.stroke && !s.stroke.endsWith('00') ? s.stroke : s.shadow ? s.shadowColor : 'transparent';
  return (
    <Pressable onPress={onPress} style={[styles.presetTile, styles.templateTile]} testID={testID}>
      <Text
        numberOfLines={1}
        style={{
          color: argbToCss(transparentFill ? s.stroke : s.color),
          backgroundColor: hasBg && !frame ? argbToCss(s.background) : 'transparent',
          borderColor: frame ? argbToCss(s.background) : 'transparent',
          borderWidth: frame ? 1.5 : 0,
          borderRadius: hasBg ? Math.min(12, 16 * (s.boxRadius ?? 0.25)) : 0,
          overflow: 'hidden',
          fontFamily: TILE_FONT[s.font] || 'sans-serif',
          fontWeight: s.bold ? '800' : '400',
          fontStyle: s.italic ? 'italic' : 'normal',
          textShadowColor: argbToCss(glowColor),
          textShadowRadius: 3,
          paddingHorizontal: 6,
          fontSize: 16,
        }}
      >
        Aa
      </Text>
      {label ? (
        <Txt dim numberOfLines={1} style={styles.tileText}>
          {label}
        </Txt>
      ) : null}
    </Pressable>
  );
}

export function TextPanel({ item, onChange, onClose, initialTab = 'style', tabs = TEXT_TABS }) {
  const { t, fmt, textAlign } = useI18n();
  const [tab, setTab] = useState(initialTab);
  const [cat, setCat] = useState(TEXT_LAYOUT_CATEGORIES[0]);
  const st = item.style;
  // Metin hâlâ varsayılan veya bir şablonun örnek metniyse şablon seçilince örnek metinle değişir.
  const isSampleText = !item.text || item.text === t('text.default') || TEXT_LAYOUTS.some((l) => t(l.textKey) === item.text);
  const applyLayout = (l) => onChange({
    style: { ...DEFAULT_TEXT_STYLE, ...l.style },
    y: l.y,
    animIn: l.animIn,
    animOut: l.animOut,
    animLoop: l.animLoop || 'none',
    ...(isSampleText ? { text: t(l.textKey) } : {}),
  });
  return (
    <Panel title={t('tools.text')} onClose={onClose} testID="panel-text">
      <View style={styles.body}>
        <TextInput
          testID="text-input"
          value={item.text}
          onChangeText={(text) => onChange({ text }, 'text')}
          multiline
          placeholder={t('text.placeholder')}
          placeholderTextColor={colors.textFaint}
          style={[styles.textInput, { textAlign }]}
        />
        <Hscroll>
          {tabs.map((k) => (
            <Chip key={k} label={t(`text.tab.${k}`)} active={tab === k} onPress={() => setTab(k)} testID={`text-tab-${k}`} />
          ))}
        </Hscroll>
        {tab === 'style' ? (
          <Hscroll>
            {TEXT_PRESETS.map((p) => (
              <TextStyleTile key={p.id} style={p.style} label={t(`text.preset.${p.id}`)} onPress={() => onChange({ style: { ...STYLE_LOOK_RESET, ...p.style } })} testID={`text-preset-${p.id}`} />
            ))}
          </Hscroll>
        ) : null}
        {tab === 'font' ? (
          <>
            <Hscroll>
              {FONTS.map((f) => (
                <Chip key={f} label={t(`fonts.${f}`)} active={st.font === f} onPress={() => onChange({ style: { font: f } })} />
              ))}
            </Hscroll>
            <Row>
              <Chip icon="text" label={t('text.bold')} active={st.bold} onPress={() => onChange({ style: { bold: !st.bold } })} />
              <Chip icon="text-outline" label={t('text.italic')} active={st.italic} onPress={() => onChange({ style: { italic: !st.italic } })} />
            </Row>
            <Labeled label={t('text.size')}>
              <Slider value={st.size} min={0.02} max={0.16} onChange={(v) => onChange({ style: { size: v } }, 'tsize')} formatValue={(v) => fmt.number(Math.round(v * 1000))} />
            </Labeled>
          </>
        ) : null}
        {tab === 'color' ? (
          <>
            <ColorRow value={st.color} onPick={(c) => onChange({ style: { color: c } })} />
            <Labeled label={t('text.opacity')}>
              <Slider value={st.opacity} min={0.1} max={1} onChange={(v) => onChange({ style: { opacity: v } }, 'topacity')} formatValue={(v) => `${fmt.number(Math.round(v * 100))}%`} />
            </Labeled>
            <Labeled label={t('text.background')}>
              <ColorRow value={st.background} allowNone onPick={(c) => onChange({ style: { background: c === null ? '#00000000' : withAlpha(c, 'B3') } })} />
            </Labeled>
          </>
        ) : null}
        {tab === 'stroke' ? (
          <>
            <ColorRow value={st.stroke} allowNone onPick={(c) => onChange({ style: { stroke: c === null ? '#00000000' : c, strokeWidth: c === null ? 0 : st.strokeWidth || 0.003 } })} />
            <Labeled label={t('text.strokeWidth')}>
              <Slider value={st.strokeWidth} min={0} max={0.012} onChange={(v) => onChange({ style: { strokeWidth: v } }, 'tstroke')} formatValue={(v) => fmt.number(Math.round(v * 1000))} />
            </Labeled>
            <Row>
              <Chip icon="contrast-outline" label={t('text.shadow')} active={st.shadow} onPress={() => onChange({ style: { shadow: !st.shadow } })} />
            </Row>
          </>
        ) : null}
        {tab === 'layout' ? (
          <>
            <Row>
              {['left', 'center', 'right'].map((a) => (
                <Chip key={a} icon={`reorder-${a === 'center' ? 'three' : a === 'left' ? 'two' : 'four'}-outline`} label={t(`text.align.${a}`)} active={st.align === a} onPress={() => onChange({ style: { align: a } })} />
              ))}
            </Row>
            <Labeled label={t('text.letterSpacing')}>
              <Slider value={st.letterSpacing} min={-0.05} max={0.4} center={0} onChange={(v) => onChange({ style: { letterSpacing: Math.round(v * 100) / 100 } }, 'tls')} formatValue={(v) => fmt.number(Math.round(v * 100))} />
            </Labeled>
            <Labeled label={t('text.lineHeight')}>
              <Slider value={st.lineHeight} min={0.8} max={2.5} onChange={(v) => onChange({ style: { lineHeight: Math.round(v * 10) / 10 } }, 'tlh')} formatValue={(v) => fmt.number(v, { maximumFractionDigits: 1 })} />
            </Labeled>
            <Labeled label={t('text.rotation')}>
              <Slider value={item.rotation} min={-180} max={180} center={0} step={1} onChange={(v) => onChange({ rotation: v }, 'trot')} formatValue={(v) => `${fmt.number(v)}°`} />
            </Labeled>
          </>
        ) : null}
        {tab === 'animation' ? (
          <>
            <Labeled label={t('text.animIn')}>
              <Hscroll>
                {TEXT_ANIMATIONS_IN.map((a) => (
                  <Chip key={a} label={t(`text.anim.${a}`)} active={item.animIn === a} onPress={() => onChange({ animIn: a })} testID={`text-anim-in-${a}`} />
                ))}
              </Hscroll>
            </Labeled>
            <Labeled label={t('text.animOut')}>
              <Hscroll>
                {TEXT_ANIMATIONS_OUT.map((a) => (
                  <Chip key={a} label={t(`text.anim.${a}`)} active={item.animOut === a} onPress={() => onChange({ animOut: a })} testID={`text-anim-out-${a}`} />
                ))}
              </Hscroll>
            </Labeled>
            <Labeled label={t('text.animLoop')}>
              <Hscroll>
                {TEXT_ANIMATIONS_LOOP.map((a) => (
                  <Chip key={a} label={t(`text.anim.${a}`)} active={(item.animLoop || 'none') === a} onPress={() => onChange({ animLoop: a })} />
                ))}
              </Hscroll>
            </Labeled>
            <Labeled label={t('text.animDuration')}>
              <Slider value={item.animMs} min={100} max={2000} step={50} onChange={(v) => onChange({ animMs: v }, 'tanim')} formatValue={(v) => fmt.duration(v)} />
            </Labeled>
          </>
        ) : null}
        {tab === 'templates' ? (
          <>
            <Hscroll>
              {TEXT_LAYOUT_CATEGORIES.map((c) => (
                <Chip key={c} label={t(`text.category.${c}`)} active={cat === c} onPress={() => setCat(c)} testID={`text-category-${c}`} />
              ))}
            </Hscroll>
            <Hscroll>
              {TEXT_LAYOUTS.filter((l) => layoutCategory(l) === cat).map((l) => (
                <TextStyleTile key={l.id} style={l.style} label={t(`text.layout.${l.id}`)} onPress={() => applyLayout(l)} testID={`text-layout-${l.id}`} />
              ))}
            </Hscroll>
          </>
        ) : null}
      </View>
    </Panel>
  );
}

export function ColorRow({ value, onPick, allowNone }) {
  const { t } = useI18n();
  const norm = (c) => (c || '').slice(0, 7).toUpperCase();
  const none = !value || value.endsWith('00') && value.length === 9;
  return (
    <Hscroll>
      {allowNone ? (
        <Pressable accessibilityLabel={t('common.none')} onPress={() => onPick(null)} style={[styles.swatch, styles.swatchNone, none && styles.swatchActive]}>
          <Icon name="ban-outline" size={18} color={colors.textDim} />
        </Pressable>
      ) : null}
      {TEXT_COLORS.map((c) => (
        <Pressable key={c} onPress={() => onPick(c)} style={[styles.swatch, { backgroundColor: argbToCss(c) }, !none && norm(value) === norm(c) && styles.swatchActive]} />
      ))}
    </Hscroll>
  );
}

const withAlpha = (c, a) => `${c.slice(0, 7)}${a}`;

/** "#RRGGBBAA" -> "rgba(...)" */
export function argbToCss(c) {
  if (!c || c.length < 7) return 'transparent';
  const r = parseInt(c.slice(1, 3), 16);
  const g = parseInt(c.slice(3, 5), 16);
  const b = parseInt(c.slice(5, 7), 16);
  const a = c.length >= 9 ? parseInt(c.slice(7, 9), 16) / 255 : 1;
  return `rgba(${r},${g},${b},${a})`;
}

export function ConfirmRow({ children }) {
  return <View style={styles.confirm}>{children}</View>;
}

export { Button };

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.lg, gap: space.md, paddingBottom: space.sm },
  hscroll: { gap: space.sm, paddingVertical: 2 },
  labeled: { gap: 2 },
  label: { fontSize: 12 },
  hint: { fontSize: 12 },
  easeTile: { alignItems: 'center', gap: 4, padding: space.xs, borderRadius: radius.md, borderWidth: 2, borderColor: 'transparent', backgroundColor: colors.surface2, minWidth: 72 },
  easeTileActive: { borderColor: colors.accent },
  easeLabel: { fontSize: 11 },
  tile: { width: 72, alignItems: 'center', gap: 4, padding: 3, borderRadius: radius.md, borderWidth: 2, borderColor: 'transparent' },
  tileActive: { borderColor: colors.accent },
  tileSwatch: { width: 60, height: 60, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  tileText: { color: colors.textDim, fontSize: 11 },
  textInput: { backgroundColor: colors.bg, color: colors.text, borderRadius: radius.md, padding: space.md, minHeight: 52, maxHeight: 110, fontSize: 16 },
  presetTile: { width: 64, height: 48, borderRadius: radius.md, backgroundColor: colors.surface3, alignItems: 'center', justifyContent: 'center' },
  templateTile: { width: 84, height: 60, gap: 2, paddingHorizontal: 2 },
  swatch: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: colors.border },
  swatchNone: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface2 },
  swatchActive: { borderColor: colors.text, borderWidth: 3 },
  confirm: { flexDirection: 'row', gap: space.sm, justifyContent: 'flex-end' },
  curveBox: { height: 60, flexDirection: 'row', alignItems: 'flex-end', gap: 2, backgroundColor: colors.bg, borderRadius: radius.md, padding: 4, direction: 'ltr' },
  curveBar: { flex: 1, borderRadius: 2 },
});
