// Fotoğraf düzenleyicinin panelleri. Video panelleriyle aynı sözleşme: her panel
// yalnızca değişikliği `onChange(patch, key)` ile bildirir; geri al geçmişi ve
// kayıt PhotoEditorScreen'dedir. `key`, kaydırıcı sürüklemelerini tek adımda birleştirir.

import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useI18n } from '../i18n';
import { Button, Chip, Icon, Panel, Row, Slider, Txt } from '../ui';
import { colors, radius, space } from '../theme';
import { ADJUSTMENTS } from '../model/color';
import { BLEND_MODES, CANVAS_PRESETS, CROP_RATIOS, HSL_BANDS, PHOTO_ADJUST, SHAPES, STICKERS, cropRect } from '../model/photo';
import { ColorRow, Hscroll, Labeled } from './panels';

const pct = (fmt) => (v) => fmt.number(Math.round(v * 100));
const PHOTO_ADJUSTMENTS = [...ADJUSTMENTS, { key: 'blur', min: 0, max: 1 }];
const BG_COLORS = ['#000000FF', '#FFFFFFFF', '#1E1E28FF', '#F2E8DCFF', '#FFD60AFF', '#FF3D7FFF', '#0A84FFFF', '#30D158FF', '#BF5AF2FF', '#FF9F0AFF'];
const HSL_SWATCH = ['#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#32D7E0', '#0A84FF', '#8E5CF7', '#FF2D9A'];

/** Kanvas boyutu (hazır boyutlar). */
export function CanvasPanel({ photo, onPreset, onClose }) {
  const { t, fmt } = useI18n();
  return (
    <Panel title={t('photo.tool.canvas')} onClose={onClose} testID="panel-photo-canvas">
      <View style={styles.body}>
        <Hscroll>
          {CANVAS_PRESETS.map((c) => (
            <Pressable key={c.id} testID={`canvas-${c.id}`} onPress={() => onPreset(c.id)} style={[styles.sizeTile, photo.canvas.preset === c.id && styles.active]}>
              <View style={[styles.sizeBox, c.w ? (c.w >= c.h ? { width: 34, height: Math.max(10, (34 * c.h) / c.w) } : { height: 34, width: Math.max(10, (34 * c.w) / c.h) }) : { width: 30, height: 30, borderStyle: 'dashed' }]} />
              <Text style={styles.tileText} numberOfLines={1}>
                {t(`photo.canvas.${c.id}`)}
              </Text>
              {c.w ? <Text style={styles.tileSub}>{`${fmt.number(c.w)}×${fmt.number(c.h)}`}</Text> : null}
            </Pressable>
          ))}
        </Hscroll>
        <Txt faint style={styles.hint}>
          {t('photo.canvas.current', { w: fmt.number(photo.canvas.width), h: fmt.number(photo.canvas.height) })}
        </Txt>
      </View>
    </Panel>
  );
}

/** Arka plan rengi / saydamlık ve çerçeve. */
export function BackgroundPanel({ photo, onChange, onClose }) {
  const { t, fmt } = useI18n();
  const [tab, setTab] = useState('color');
  const bg = photo.canvas.background;
  const border = photo.canvas.border;
  return (
    <Panel title={t('photo.tool.background')} onClose={onClose} testID="panel-photo-background">
      <View style={styles.body}>
        <Row>
          {['color', 'border'].map((k) => (
            <Chip key={k} label={t(`photo.bg.${k}`)} active={tab === k} onPress={() => setTab(k)} testID={`bg-tab-${k}`} />
          ))}
        </Row>
        {tab === 'color' ? (
          <Hscroll>
            <Pressable testID="bg-transparent" accessibilityLabel={t('photo.bg.transparent')} onPress={() => onChange({ background: '#00000000' })} style={[styles.swatch, styles.checker, bg === '#00000000' && styles.swatchActive]}>
              <Icon name="grid-outline" size={16} color={colors.textDim} />
            </Pressable>
            {BG_COLORS.map((c) => (
              <Pressable key={c} testID={`bg-${c.slice(1, 7)}`} onPress={() => onChange({ background: c })} style={[styles.swatch, { backgroundColor: c.slice(0, 7) }, bg === c && styles.swatchActive]} />
            ))}
          </Hscroll>
        ) : (
          <>
            <ColorRow value={border.color} onPick={(c) => onChange({ border: { color: c } })} />
            <Labeled label={t('photo.bg.borderWidth')}>
              <Slider testID="border-width" value={border.width} min={0} max={0.1} onChange={(v) => onChange({ border: { width: Math.round(v * 1000) / 1000 } }, 'borderW')} formatValue={(v) => fmt.number(Math.round(v * 1000))} />
            </Labeled>
            <Labeled label={t('photo.bg.borderRadius')}>
              <Slider value={border.radius} min={0} max={1} onChange={(v) => onChange({ border: { radius: Math.round(v * 100) / 100 } }, 'borderR')} formatValue={pct(fmt)} />
            </Labeled>
          </>
        )}
        {tab === 'color' && bg === '#00000000' ? (
          <Txt faint style={styles.hint}>
            {t('photo.bg.transparentHint')}
          </Txt>
        ) : null}
      </View>
    </Panel>
  );
}

/** Ton ayarları (bulanıklık dahil). */
export function PhotoAdjustPanel({ layer, onChange, onClose, onAuto }) {
  const { t, fmt } = useI18n();
  const [key, setKey] = useState('brightness');
  const def = PHOTO_ADJUSTMENTS.find((a) => a.key === key);
  return (
    <Panel title={t('tools.adjust')} onClose={onClose} testID="panel-adjust">
      <View style={styles.body}>
        <Hscroll>
          {PHOTO_ADJUSTMENTS.map((a) => (
            <Chip key={a.key} label={t(`adjust.${a.key}`)} active={key === a.key} onPress={() => setKey(a.key)} icon={layer.adjust[a.key] ? 'ellipse' : null} testID={`adjust-${a.key}`} />
          ))}
        </Hscroll>
        <Slider testID="adjust-slider" value={layer.adjust[key] || 0} min={def.min} max={def.max} center={0} onChange={(v) => onChange({ adjust: { [key]: Math.round(v * 100) / 100 } }, `adjust.${key}`)} formatValue={pct(fmt)} />
        <Row>
          {onAuto ? <Chip icon="color-wand-outline" label={t('panels.autoEnhance')} onPress={onAuto} testID="adjust-auto" /> : null}
          <Chip icon="refresh" label={t('panels.reset')} onPress={() => onChange({ adjust: { ...PHOTO_ADJUST } })} />
        </Row>
      </View>
    </Panel>
  );
}

/** Seçici renk (8 bant × ton/doygunluk/parlaklık). */
export function HslPanel({ layer, onChange, onClose }) {
  const { t, fmt } = useI18n();
  const [band, setBand] = useState(0);
  const hsl = layer.hsl || new Array(24).fill(0);
  const set = (k, v) => {
    const next = [...hsl];
    next[band * 3 + k] = Math.round(v * 100) / 100;
    onChange({ hsl: next }, `hsl.${band}.${k}`);
  };
  return (
    <Panel title={t('photo.tool.hsl')} onClose={onClose} testID="panel-photo-hsl">
      <View style={styles.body}>
        <Row gap={10}>
          {HSL_BANDS.map((b, i) => (
            <Pressable key={b} testID={`hsl-band-${b}`} accessibilityLabel={t(`photo.hsl.${b}`)} onPress={() => setBand(i)} style={[styles.dot, { backgroundColor: HSL_SWATCH[i] }, band === i && styles.dotActive]} />
          ))}
        </Row>
        {['hue', 'saturation', 'luminance'].map((k, i) => (
          <Labeled key={k} label={`${t(`photo.hsl.${HSL_BANDS[band]}`)} · ${t(`photo.hsl.${k}`)}`}>
            <Slider testID={`hsl-${k}`} value={hsl[band * 3 + i]} min={-1} max={1} center={0} onChange={(v) => set(i, v)} formatValue={pct(fmt)} />
          </Labeled>
        ))}
        <Row>
          <Chip icon="refresh" label={t('panels.reset')} onPress={() => onChange({ hsl: new Array(24).fill(0) })} />
        </Row>
      </View>
    </Panel>
  );
}

/** Renk dereceleme (gölge / parlak alan tonu ve doygunluğu, denge). */
export function GradePanel({ layer, onChange, onClose }) {
  const { t, fmt } = useI18n();
  const g = layer.grade;
  const hueColor = (h) => `hsl(${Math.round(h)}, 90%, 55%)`;
  const row = (prefix) => (
    <>
      <Labeled label={t(`photo.grade.${prefix}Hue`)}>
        <Row>
          <View style={[styles.hueDot, { backgroundColor: hueColor(g[`${prefix}Hue`]) }]} />
          <View style={{ flex: 1 }}>
            <Slider testID={`grade-${prefix}Hue`} value={g[`${prefix}Hue`]} min={0} max={360} step={1} onChange={(v) => onChange({ grade: { [`${prefix}Hue`]: v } }, `grade.${prefix}Hue`)} formatValue={(v) => `${fmt.number(v)}°`} />
          </View>
        </Row>
      </Labeled>
      <Labeled label={t(`photo.grade.${prefix}Sat`)}>
        <Slider testID={`grade-${prefix}Sat`} value={g[`${prefix}Sat`]} min={0} max={1} onChange={(v) => onChange({ grade: { [`${prefix}Sat`]: Math.round(v * 100) / 100 } }, `grade.${prefix}Sat`)} formatValue={pct(fmt)} />
      </Labeled>
    </>
  );
  return (
    <Panel title={t('photo.tool.grade')} onClose={onClose} testID="panel-photo-grade">
      <View style={styles.body}>
        {row('shadow')}
        {row('high')}
        <Labeled label={t('photo.grade.balance')}>
          <Slider value={g.balance} min={-1} max={1} center={0} onChange={(v) => onChange({ grade: { balance: Math.round(v * 100) / 100 } }, 'grade.balance')} formatValue={pct(fmt)} />
        </Labeled>
      </View>
    </Panel>
  );
}

/** Kırp / döndür / çevir. */
export function CropPanel({ layer, media, onChange, onRotate, onClose }) {
  const { t, fmt } = useI18n();
  const [ratio, setRatio] = useState('free');
  const c = layer.crop;
  const w = c.x1 - c.x0;
  const h = c.y1 - c.y0;
  const zoom = 1 / Math.max(w, h);
  const cx = (c.x0 + c.x1) / 2;
  const cy = (c.y0 + c.y1) / 2;
  const ratioValue = () => {
    const r = CROP_RATIOS.find((x) => x.id === ratio);
    if (!r || r.r === 0) {
      const mw = media?.width || 1;
      const mh = media?.height || 1;
      const cur = (w * mw) / (h * mh);
      return layer.quarter % 2 ? 1 / cur : cur;
    }
    return r.r;
  };
  const apply = (patch, key) => {
    const next = { zoom, cx, cy, ...patch };
    onChange({ crop: cropRect(media, layer.quarter, ratioValue(), next.zoom, next.cx, next.cy) }, key);
  };
  return (
    <Panel title={t('photo.tool.crop')} onClose={onClose} testID="panel-photo-crop">
      <View style={styles.body}>
        <Hscroll>
          {CROP_RATIOS.map((r) => (
            <Chip
              key={r.id}
              testID={`crop-${r.id}`}
              label={r.id === 'free' || r.id === 'original' ? t(`photo.crop.${r.id}`) : r.id}
              active={ratio === r.id}
              onPress={() => {
                setRatio(r.id);
                if (r.r !== 0) onChange({ crop: cropRect(media, layer.quarter, r.r, 1, 0.5, 0.5) });
              }}
            />
          ))}
        </Hscroll>
        <Labeled label={t('photo.crop.zoom')}>
          <Slider testID="crop-zoom" value={zoom} min={1} max={5} onChange={(v) => apply({ zoom: v }, 'cropZoom')} formatValue={(v) => `${fmt.number(v, { maximumFractionDigits: 1 })}×`} />
        </Labeled>
        <Labeled label={t('photo.crop.panX')}>
          <Slider value={cx} min={0} max={1} onChange={(v) => apply({ cx: v }, 'cropX')} formatValue={pct(fmt)} />
        </Labeled>
        <Labeled label={t('photo.crop.panY')}>
          <Slider value={cy} min={0} max={1} onChange={(v) => apply({ cy: v }, 'cropY')} formatValue={pct(fmt)} />
        </Labeled>
        <Labeled label={t('photo.crop.straighten')}>
          <Slider testID="crop-straighten" value={layer.rotation} min={-45} max={45} step={0.5} center={0} onChange={(v) => onChange({ rotation: v }, 'straighten')} formatValue={(v) => `${fmt.number(v, { maximumFractionDigits: 1 })}°`} />
        </Labeled>
        <Row style={{ flexWrap: 'wrap' }}>
          <Chip icon="refresh-outline" label={t('photo.crop.rotateLeft')} onPress={() => onRotate(-1)} testID="rotate-left" />
          <Chip icon="refresh-outline" label={t('photo.crop.rotateRight')} onPress={() => onRotate(1)} testID="rotate-right" />
          <Chip icon="swap-horizontal-outline" label={t('photo.crop.flipH')} active={layer.flipH} onPress={() => onChange({ flipH: !layer.flipH })} testID="flip-h" />
          <Chip icon="swap-vertical-outline" label={t('photo.crop.flipV')} active={layer.flipV} onPress={() => onChange({ flipV: !layer.flipV })} testID="flip-v" />
          <Chip icon="scan-outline" label={t('photo.crop.reset')} onPress={() => onChange({ crop: { x0: 0, y0: 0, x1: 1, y1: 1 }, rotation: 0 })} />
        </Row>
      </View>
    </Panel>
  );
}

/** Konum, ölçek, döndürme, saydamlık ve karışım modu. */
export function LayerStylePanel({ layer, onChange, onClose }) {
  const { t, fmt } = useI18n();
  return (
    <Panel title={t('photo.tool.style')} onClose={onClose} testID="panel-photo-style">
      <View style={styles.body}>
        <Labeled label={t('photo.style.opacity')}>
          <Slider testID="layer-opacity" value={layer.opacity ?? 1} min={0} max={1} onChange={(v) => onChange({ opacity: Math.round(v * 100) / 100 }, 'opacity')} formatValue={(v) => `${fmt.number(Math.round(v * 100))}%`} />
        </Labeled>
        <Labeled label={t('photo.style.blend')}>
          <Hscroll>
            {BLEND_MODES.map((m) => (
              <Chip key={m} testID={`blend-${m}`} label={t(`photo.blend.${m}`)} active={(layer.blend || 'normal') === m} onPress={() => onChange({ blend: m })} />
            ))}
          </Hscroll>
        </Labeled>
        <Labeled label={t('photo.style.scale')}>
          <Slider testID="layer-scale" value={layer.scale} min={0.05} max={4} onChange={(v) => onChange({ scale: Math.round(v * 100) / 100 }, 'scale')} formatValue={(v) => `${fmt.number(Math.round(v * 100))}%`} />
        </Labeled>
        <Labeled label={t('photo.style.rotation')}>
          <Slider value={layer.rotation} min={-180} max={180} step={1} center={0} onChange={(v) => onChange({ rotation: v }, 'rotation')} formatValue={(v) => `${fmt.number(v)}°`} />
        </Labeled>
        <Row style={{ flexWrap: 'wrap' }}>
          <Chip icon="locate-outline" label={t('photo.style.center')} onPress={() => onChange({ x: 0, y: 0 })} />
          {layer.type !== 'image' ? <Chip icon="swap-horizontal-outline" label={t('photo.crop.flipH')} active={layer.flipH} onPress={() => onChange({ flipH: !layer.flipH })} /> : null}
          {layer.type === 'image' ? <Chip icon="expand-outline" label={t('photo.style.fill')} onPress={() => onChange({ x: 0, y: 0, scale: 1, rotation: 0 })} /> : null}
        </Row>
        {(layer.blend || 'normal') !== 'normal' ? (
          <Txt faint style={styles.hint}>
            {t('photo.style.blendHint')}
          </Txt>
        ) : null}
      </View>
    </Panel>
  );
}

/** Şekil: tür, dolgu, kontur, boyut. */
export function ShapePanel({ layer, onChange, onClose }) {
  const { t, fmt } = useI18n();
  const [tab, setTab] = useState('shape');
  return (
    <Panel title={t('photo.tool.shape')} onClose={onClose} testID="panel-photo-shape">
      <View style={styles.body}>
        <Row>
          {['shape', 'fill', 'stroke', 'size'].map((k) => (
            <Chip key={k} label={t(`photo.shape.tab.${k}`)} active={tab === k} onPress={() => setTab(k)} testID={`shape-tab-${k}`} />
          ))}
        </Row>
        {tab === 'shape' ? (
          <Hscroll>
            {SHAPES.map((s) => (
              <Chip key={s} testID={`shape-${s}`} label={t(`photo.shape.${s}`)} active={layer.shape === s} onPress={() => onChange({ shape: s })} />
            ))}
          </Hscroll>
        ) : null}
        {tab === 'fill' ? <ColorRow value={layer.fill} allowNone onPick={(c) => onChange({ fill: c === null ? '#00000000' : c })} /> : null}
        {tab === 'stroke' ? (
          <>
            <ColorRow value={layer.stroke} allowNone onPick={(c) => onChange({ stroke: c === null ? '#00000000' : c, strokeWidth: c === null ? 0 : layer.strokeWidth || 0.008 })} />
            <Labeled label={t('photo.shape.strokeWidth')}>
              <Slider value={layer.strokeWidth || 0} min={0} max={0.04} onChange={(v) => onChange({ strokeWidth: Math.round(v * 1000) / 1000 }, 'shapeStroke')} formatValue={(v) => fmt.number(Math.round(v * 1000))} />
            </Labeled>
          </>
        ) : null}
        {tab === 'size' ? (
          <>
            <Labeled label={t('photo.shape.width')}>
              <Slider testID="shape-w" value={layer.w} min={0.02} max={1.5} onChange={(v) => onChange({ w: Math.round(v * 1000) / 1000 }, 'shapeW')} formatValue={pct(fmt)} />
            </Labeled>
            <Labeled label={t('photo.shape.height')}>
              <Slider value={layer.h} min={0.02} max={1.5} onChange={(v) => onChange({ h: Math.round(v * 1000) / 1000 }, 'shapeH')} formatValue={pct(fmt)} />
            </Labeled>
            {layer.shape === 'roundRect' ? (
              <Labeled label={t('photo.shape.radius')}>
                <Slider value={layer.radius} min={0} max={0.5} onChange={(v) => onChange({ radius: Math.round(v * 100) / 100 }, 'shapeR')} formatValue={pct(fmt)} />
              </Labeled>
            ) : null}
          </>
        ) : null}
      </View>
    </Panel>
  );
}

/** Çıkartma (emoji) seçici: seçilen çıkartma metin katmanı olarak eklenir. */
export function StickerPanel({ onPick, onClose }) {
  const { t } = useI18n();
  return (
    <Panel title={t('photo.tool.sticker')} onClose={onClose} testID="panel-photo-sticker">
      <View style={[styles.body, styles.grid]}>
        {STICKERS.map((s, i) => (
          <Pressable key={s} testID={`sticker-${i}`} onPress={() => onPick(s)} style={({ pressed }) => [styles.sticker, pressed && { opacity: 0.6 }]}>
            <Text style={{ fontSize: 28 }}>{s}</Text>
          </Pressable>
        ))}
      </View>
    </Panel>
  );
}

/**
 * Görsel AI araçları. Arka plan kaldırma ve nesne silme cihaz içinde çalışır;
 * görsel üretme bir sunucu ister ve yapılandırılmadıysa devre dışıdır (sahte sonuç yok).
 */
export function PhotoAiPanel({ layer, onRemoveBg, onMaskChange, onClearMask, onEraseMode, onRestore, cloud, onGenerate, onClose }) {
  const { t, fmt } = useI18n();
  const m = layer.mask;
  return (
    <Panel title={t('photo.tool.ai')} onClose={onClose} testID="panel-photo-ai">
      <View style={styles.body}>
        <Row style={{ flexWrap: 'wrap' }}>
          <Chip icon="person-outline" label={t('photo.ai.removeBg')} active={!!m && !m.invert} onPress={() => onRemoveBg(false)} testID="ai-remove-bg" />
          <Chip icon="person-remove-outline" label={t('photo.ai.removePerson')} active={!!m && m.invert} onPress={() => onRemoveBg(true)} testID="ai-remove-person" />
          <Chip icon="bandage-outline" label={t('photo.ai.erase')} onPress={onEraseMode} testID="ai-erase" />
          {m ? <Chip icon="close-circle-outline" label={t('photo.ai.clearMask')} onPress={onClearMask} testID="ai-clear-mask" /> : null}
          {layer.original ? <Chip icon="arrow-undo-outline" label={t('photo.ai.restore')} onPress={onRestore} testID="ai-restore" /> : null}
        </Row>
        {m ? (
          <>
            <Labeled label={t('photo.ai.edge')}>
              <Slider
                testID="mask-edge"
                value={m.hi - m.lo}
                min={0.02}
                max={0.6}
                onChange={(v) => {
                  const mid = (m.lo + m.hi) / 2;
                  onMaskChange({ lo: Math.max(0, mid - v / 2), hi: Math.min(1, mid + v / 2) }, 'maskEdge');
                }}
                formatValue={pct(fmt)}
              />
            </Labeled>
            <Labeled label={t('photo.ai.threshold')}>
              <Slider
                value={(m.lo + m.hi) / 2}
                min={0.1}
                max={0.9}
                onChange={(v) => {
                  const half = (m.hi - m.lo) / 2;
                  onMaskChange({ lo: Math.max(0, v - half), hi: Math.min(1, v + half) }, 'maskMid');
                }}
                formatValue={pct(fmt)}
              />
            </Labeled>
          </>
        ) : null}
        <Txt faint style={styles.hint}>
          {t('photo.ai.onDeviceNote')}
        </Txt>
        <View style={styles.cloudBox}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt style={{ fontWeight: '700', flexShrink: 1 }}>{t('photo.ai.generate')}</Txt>
            <Txt style={[styles.badge, cloud ? { color: colors.accent2 } : null]}>{t(cloud ? 'photo.ai.cloudConfigured' : 'photo.ai.cloudOff')}</Txt>
          </Row>
          <Txt dim style={styles.hint}>
            {t(cloud ? 'photo.ai.generateHint' : 'photo.ai.cloudOffHint')}
          </Txt>
          <Button kind="secondary" title={t('photo.ai.generateAction')} icon="sparkles-outline" disabled={!cloud} onPress={onGenerate} testID="ai-generate" />
        </View>
      </View>
    </Panel>
  );
}

/** Dışa aktarma seçenekleri. */
export function PhotoExportPanel({ transparent, busy, onExport, onClose }) {
  const { t, fmt } = useI18n();
  const [format, setFormat] = useState(transparent ? 'png' : 'jpg');
  const [size, setSize] = useState(0);
  const [quality, setQuality] = useState(92);
  return (
    <Panel title={t('photo.export.title')} onClose={onClose} testID="panel-photo-export" right={<View style={{ width: 44 }} />}>
      <View style={styles.body}>
        <Labeled label={t('photo.export.format')}>
          <Row>
            {['jpg', 'png'].map((f) => (
              <Chip key={f} testID={`export-${f}`} label={f.toUpperCase()} active={format === f} onPress={() => setFormat(f)} />
            ))}
          </Row>
        </Labeled>
        {transparent && format === 'jpg' ? (
          <Txt faint style={styles.hint}>
            {t('photo.export.jpgTransparent')}
          </Txt>
        ) : null}
        <Labeled label={t('photo.export.size')}>
          <Row>
            {[0, 2048, 1080].map((s) => (
              <Chip key={s} label={s ? fmt.number(s) : t('photo.export.full')} active={size === s} onPress={() => setSize(s)} />
            ))}
          </Row>
        </Labeled>
        {format === 'jpg' ? (
          <Labeled label={t('photo.export.quality')}>
            <Slider value={quality} min={60} max={100} step={1} onChange={setQuality} formatValue={(v) => fmt.number(v)} />
          </Labeled>
        ) : null}
        <Row>
          <Button style={{ flex: 1 }} title={t('photo.export.save')} icon="download-outline" loading={busy === 'save'} disabled={!!busy} onPress={() => onExport({ format, size, quality, share: false })} testID="photo-save" />
          <Button style={{ flex: 1 }} kind="secondary" title={t('photo.export.share')} icon="share-outline" loading={busy === 'share'} disabled={!!busy} onPress={() => onExport({ format, size, quality, share: true })} testID="photo-share" />
        </Row>
      </View>
    </Panel>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.lg, gap: space.md, paddingBottom: space.sm },
  hint: { fontSize: 12 },
  sizeTile: { width: 76, alignItems: 'center', gap: 4, padding: 4, borderRadius: radius.md, borderWidth: 2, borderColor: 'transparent' },
  active: { borderColor: colors.accent },
  sizeBox: { borderWidth: 2, borderColor: colors.textDim, borderRadius: 3, marginVertical: 4 },
  tileText: { color: colors.textDim, fontSize: 11 },
  tileSub: { color: colors.textFaint, fontSize: 9 },
  swatch: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: colors.border },
  swatchActive: { borderColor: colors.text, borderWidth: 3 },
  checker: { backgroundColor: colors.surface3, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: 'transparent' },
  dotActive: { borderColor: colors.text, transform: [{ scale: 1.15 }] },
  hueDot: { width: 18, height: 18, borderRadius: 9 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, justifyContent: 'center' },
  sticker: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  cloudBox: { backgroundColor: colors.surface2, borderRadius: radius.md, padding: space.md, gap: space.sm },
  badge: { color: colors.warning, fontSize: 11, fontWeight: '700' },
});

/** Video için şekil seçici: şekil + dolgu/kontur rengi; seçim saydam PNG katmanı olarak eklenir. */
export function ShapePickPanel({ onAdd, onClose, busy }) {
  const { t } = useI18n();
  const [shape, setShape] = useState('roundRect');
  const [fill, setFill] = useState('#FFD60AFF');
  const [outline, setOutline] = useState(false);
  return (
    <Panel title={t('photo.tool.shape')} onClose={onClose} testID="panel-shape-pick">
      <View style={styles.body}>
        <Hscroll>
          {SHAPES.map((s) => (
            <Chip key={s} testID={`shape-${s}`} label={t(`photo.shape.${s}`)} active={shape === s} onPress={() => setShape(s)} />
          ))}
        </Hscroll>
        <ColorRow value={fill} onPick={(c) => setFill(c)} />
        <Row>
          <Chip icon="ellipse-outline" label={t('photo.shape.outlineOnly')} active={outline} onPress={() => setOutline(!outline)} testID="shape-outline" />
        </Row>
        <Button title={t('photo.shape.add')} icon="add" loading={busy} onPress={() => onAdd({ shape, fill: outline || shape === 'line' ? '#00000000' : fill, stroke: outline || shape === 'line' ? fill : '#00000000' })} testID="shape-add" />
      </View>
    </Panel>
  );
}
