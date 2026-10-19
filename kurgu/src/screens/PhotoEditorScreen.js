// Fotoğraf düzenleyici. Proje tahribatsızdır: kaynak görseller değişmez, tüm ayarlar
// JSON'da tutulur ve yerel çizici (PhotoRenderer.kt) her değişiklikte önizlemeyi
// kaynaktan yeniden üretir. Geri al/yinele video editörüyle aynı geçmiş modelini kullanır.
//
// Etkileşim: dokunma en üstteki katmanı seçer; seçili katman tek parmakla taşınır,
// iki parmakla ölçeklenir/döndürülür. Nesne silme kipinde parmakla dikdörtgen çizilir.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, PanResponder, ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as FS from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useI18n } from '../i18n';
import { useBackHandler, useNav } from '../navigation';
import { Button, Icon, IconButton, Loading, PromptModal, Row, ToolButton, Txt, useToast } from '../ui';
import { colors, radius, space } from '../theme';
import { FilterPanel, TextPanel } from '../editor/panels';
import { BackgroundPanel, CanvasPanel, CropPanel, GradePanel, HslPanel, LayerStylePanel, PhotoAdjustPanel, PhotoAiPanel, PhotoExportPanel, ShapePanel, StickerPanel } from '../editor/PhotoPanels';
import { canRedo, canUndo, createHistory, pushHistory, redo, undo } from '../model/history';
import * as PH from '../model/photo';
import { CACHE_DIR, EXPORTS_DIR, adoptFile, ensureDirs, loadPhoto, mediaUri, savePhoto, setPhotoCover } from '../storage/library';
import { importLutFile, importPicked, pickFromGallery } from '../storage/importer';
import { eraseRect, renderPhoto, saveImageToGallery, segmentPerson } from '../engine/engine';
import { cloudServer, generateImage } from '../engine/cloud';

const PREVIEW_MAX = 1280;
const TEXT_TABS = ['style', 'font', 'color', 'stroke', 'layout'];
const CHECKER = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAIUlEQVR4nGPQ0jLBiqys3LAihlENNNGASwKXQaMaaKIBAI56oQFZXoZDAAAAAElFTkSuQmCC';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const normAngle = (a) => ((((a + 180) % 360) + 360) % 360) - 180;

export default function PhotoEditorScreen({ params, focused }) {
  const { t, fmt, row } = useI18n();
  const nav = useNav();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const [hist, setHist] = useState(null);
  const photo = hist?.present;
  const [selId, setSelId] = useState(null);
  const [panel, setPanel] = useState(null);
  const [busy, setBusy] = useState(null);
  const [exporting, setExporting] = useState(null);
  const [preview, setPreview] = useState(null);
  const [rendering, setRendering] = useState(false);
  const [area, setArea] = useState({ w: 1, h: 1 });
  const [erase, setErase] = useState(null); // { a, b } kanvas pikseli; null: kip kapalı
  const [cloud, setCloud] = useState(null);
  const [asking, setAsking] = useState(null); // 'rename' | 'generate'

  // --- Yükleme, geçmiş, otomatik kayıt ---
  useEffect(() => {
    let alive = true;
    loadPhoto(params.photoId)
      .then((p) => {
        if (!alive) return;
        setHist(createHistory(p));
        if (p._recovered) toast(t('photo.recovered'));
      })
      .catch(() => {
        toast(t('errors.generic'), 'error');
        nav.pop();
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.photoId]);

  useEffect(() => {
    if (focused) cloudServer().then(setCloud);
  }, [focused]);

  const apply = useCallback((next, key) => setHist((h) => (h ? pushHistory(h, typeof next === 'function' ? next(h.present) : next, key) : h)), []);

  const saveRef = useRef({ timer: null, latest: null, saved: null });
  const flushSave = useCallback(async () => {
    const s = saveRef.current;
    clearTimeout(s.timer);
    if (s.latest && s.latest !== s.saved) {
      s.saved = s.latest;
      await savePhoto(s.latest).catch(() => toast(t('photo.saveFailed'), 'error'));
    }
  }, [t, toast]);
  useEffect(() => {
    if (!photo) return;
    const s = saveRef.current;
    if (!s.saved) s.saved = photo;
    s.latest = photo;
    clearTimeout(s.timer);
    s.timer = setTimeout(flushSave, 700);
  }, [photo, flushSave]);

  // --- Önizleme: en son durum çizilir, ara durumlar atlanır ---
  const rs = useRef({ running: false, pending: null, n: 0, files: [] });
  useEffect(() => {
    if (!photo) return;
    const st = rs.current;
    st.pending = photo;
    if (st.running) return;
    (async () => {
      st.running = true;
      setRendering(true);
      await ensureDirs();
      while (st.pending) {
        const p = st.pending;
        st.pending = null;
        const n = ++st.n;
        const png = PH.isTransparent(p);
        const out = `${CACHE_DIR}photo_prev_${n}.${png ? 'png' : 'jpg'}`;
        const t0 = Date.now();
        try {
          const r = await renderPhoto(PH.photoSpec(p, mediaUri), out, PREVIEW_MAX, png ? 'png' : 'jpg', 85);
          setPreview({ uri: r.path, n });
          st.files.push(out);
          while (st.files.length > 3) FS.deleteAsync(st.files.shift(), { idempotent: true }).catch(() => {});
          if (n % 10 === 1) console.log(`[KurguPhoto] preview ${r.width}x${r.height} ${Date.now() - t0}ms layers=${p.layers.length}`);
        } catch (e) {
          console.log(`[KurguPhoto] preview failed ${e?.code} ${e?.message}`);
        }
      }
      st.running = false;
      setRendering(false);
    })();
  }, [photo]);

  const leave = useCallback(async () => {
    await flushSave();
    const files = rs.current.files;
    if (files.length && saveRef.current.latest) await setPhotoCover(saveRef.current.latest.id, files[files.length - 1]).catch(() => {});
    nav.pop();
  }, [flushSave, nav]);

  useBackHandler(() => {
    if (!focused) return false;
    if (busy) return true;
    if (erase) {
      setErase(null);
      return true;
    }
    if (panel) {
      setPanel(null);
      return true;
    }
    leave();
    return true;
  }, [focused, busy, erase, panel, leave]);

  const sel = photo?.layers.find((l) => l.id === selId) || null;
  const selMedia = sel?.type === 'image' ? photo.media[sel.mediaId] : null;

  // --- Kanvas yerleşimi (ekran ↔ kanvas pikseli) ---
  const view = useMemo(() => {
    if (!photo) return null;
    const cw = photo.canvas.width;
    const ch = photo.canvas.height;
    const A = area.w / Math.max(1, area.h);
    const dw = cw / ch > A ? area.w : area.h * (cw / ch);
    const dh = dw / (cw / ch);
    return { dw, dh, k: dw / cw, cw, ch };
  }, [photo, area]);

  const updSel = (patch, key) => sel && apply((p) => PH.updateLayer(p, sel.id, patch), key);

  // --- Dokunma: seçim, taşıma, iki parmak ölçek/döndürme, silme dikdörtgeni ---
  const g = useRef({});
  g.current = { photo, view, selId, erase, apply };
  const responder = useMemo(() => {
    const s = { start: null, pinch: null, target: null, origin: null };
    const pinchInfo = ([a, b]) => ({ d: Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY), angle: (Math.atan2(b.pageY - a.pageY, b.pageX - a.pageX) * 180) / Math.PI });
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        const { photo: p, view: v, selId: cur, erase: er } = g.current;
        if (!p || !v) return;
        const x = e.nativeEvent.locationX / v.k;
        const y = e.nativeEvent.locationY / v.k;
        s.origin = { x, y };
        s.pinch = null;
        s.target = null;
        if (er) {
          setErase({ a: { x, y }, b: { x, y } });
          return;
        }
        const hit = PH.hitLayer(p, x, y);
        if (hit && hit.id === cur) {
          s.target = hit.id;
          s.start = { x: hit.x, y: hit.y, scale: hit.scale, rotation: hit.rotation };
        } else {
          setSelId(hit?.id || null);
          // Seçili değilken iki parmak hareketi seçili katmana uygulanabilsin
          const l = p.layers.find((q) => q.id === cur);
          if (l) s.start = { x: l.x, y: l.y, scale: l.scale, rotation: l.rotation };
        }
      },
      onPanResponderMove: (e, gs) => {
        const { photo: p, view: v, selId: cur, erase: er } = g.current;
        if (!p || !v || !s.origin) return;
        if (er) {
          setErase({ a: s.origin, b: { x: clamp(s.origin.x + gs.dx / v.k, 0, v.cw), y: clamp(s.origin.y + gs.dy / v.k, 0, v.ch) } });
          return;
        }
        const touches = e.nativeEvent.touches;
        if (touches.length >= 2 && cur && s.start) {
          const pi = pinchInfo(touches);
          if (!s.pinch) s.pinch = pi;
          g.current.apply((q) => PH.updateLayer(q, cur, { scale: clamp(s.start.scale * (pi.d / Math.max(1, s.pinch.d)), 0.05, 6), rotation: Math.round(normAngle(s.start.rotation + (pi.angle - s.pinch.angle))) }), `pinch.${cur}`);
          return;
        }
        if (!s.target || s.pinch) return;
        let nx = clamp(s.start.x + (gs.dx / v.dw) * 2, -1.5, 1.5);
        let ny = clamp(s.start.y - (gs.dy / v.dh) * 2, -1.5, 1.5);
        if (Math.abs(nx) < 0.02) nx = 0;
        if (Math.abs(ny) < 0.02) ny = 0;
        g.current.apply((q) => PH.updateLayer(q, s.target, { x: Math.round(nx * 1000) / 1000, y: Math.round(ny * 1000) / 1000 }), `drag.${s.target}`);
      },
      onPanResponderRelease: () => {
        s.origin = null;
      },
    });
  }, []);

  // --- Katman ekleme ---
  const pickImages = async () => {
    const picked = await pickFromGallery({ videos: false, multiple: false });
    if (!picked.length) return null;
    setBusy(t('photo.importing'));
    const { media, errors } = await importPicked(picked);
    setBusy(null);
    if (errors.length || !media[0]) {
      toast(t('errors.generic'), 'error');
      return null;
    }
    return media[0];
  };

  const addImage = async () => {
    try {
      const m = await pickImages();
      if (!m) return;
      const layer = PH.createImageLayer(m, { scale: 0.6 });
      apply((p) => PH.addLayer(p, layer, m));
      setSelId(layer.id);
    } catch {
      setBusy(null);
      toast(t('errors.generic'), 'error');
    }
  };

  const addText = (text = t('photo.textDefault'), style = {}) => {
    const layer = PH.createTextLayer(text, style);
    apply((p) => PH.addLayer(p, layer));
    setSelId(layer.id);
    if (!style.size) setPanel('text');
  };

  const addSticker = (emoji) => {
    addText(emoji, { size: 0.14, shadow: false, stroke: '#00000000', strokeWidth: 0 });
    setPanel(null);
  };

  const addShape = () => {
    const layer = PH.createShapeLayer('roundRect');
    apply((p) => PH.addLayer(p, layer));
    setSelId(layer.id);
    setPanel('shape');
  };

  const importLut = async () => {
    try {
      const lut = await importLutFile();
      if (!lut || !sel) return;
      apply((p) => PH.updateLayer({ ...p, luts: { ...p.luts, [lut.id]: lut } }, sel.id, { lut: { id: lut.id, intensity: 1 } }));
      toast(t('filters.lutImported'));
    } catch (e) {
      toast(e?.code && e.code.startsWith('LUT_') ? t(`errors.lut.${e.code}`) : t('errors.generic'), 'error');
    }
  };

  // --- Cihaz içi AI ---
  const removeBackground = async (invert) => {
    if (!sel || sel.type !== 'image') return;
    if (sel.mask) {
      updSel({ mask: { ...sel.mask, invert } });
      return;
    }
    setBusy(t('photo.ai.segmenting'));
    const t0 = Date.now();
    try {
      const r = await segmentPerson(selMedia, `${CACHE_DIR}mask_${Date.now()}.png`);
      console.log(`[KurguPhoto] segment ${r.width}x${r.height} coverage=${r.coverage?.toFixed?.(3)} ${Date.now() - t0}ms`);
      if (!(r.coverage > 0.005)) {
        setBusy(null);
        return toast(t('photo.ai.noPerson'), 'error');
      }
      const a = await adoptFile(r.path, 'mask.png', 'image/png');
      const mm = { id: a.id, kind: 'image', path: a.path, name: 'mask.png', size: a.size, width: r.width, height: r.height, durationMs: 0, hasAudio: false, importedAt: Date.now() };
      const id = sel.id;
      apply((p) => PH.updateLayer({ ...p, media: { ...p.media, [mm.id]: mm } }, id, { mask: { mediaId: mm.id, lo: 0.35, hi: 0.65, invert } }));
      toast(t('photo.ai.maskDone'));
    } catch (e) {
      console.log(`[KurguPhoto] segment failed ${e?.code} ${e?.message}`);
      toast(t('photo.ai.failed'), 'error');
    }
    setBusy(null);
  };

  const startErase = () => {
    if (!sel || sel.type !== 'image') return;
    setPanel(null);
    setErase({ a: null, b: null });
  };

  const applyErase = async () => {
    const layer = sel;
    if (!layer || !erase?.a) return;
    const rect = PH.canvasRectToSource(photo, layer, erase.a.x, erase.a.y, erase.b.x, erase.b.y);
    if (!rect) return toast(t('photo.ai.eraseTooSmall'), 'error');
    setBusy(t('photo.ai.erasing'));
    const t0 = Date.now();
    try {
      const r = await eraseRect(selMedia, rect, `${CACHE_DIR}erase_${Date.now()}.jpg`);
      console.log(`[KurguPhoto] erase ${r.width}x${r.height} ${Date.now() - t0}ms`);
      const a = await adoptFile(r.path, 'erase.jpg', 'image/jpeg');
      const m = { id: a.id, kind: 'image', path: a.path, name: `${selMedia?.name || 'image'} (erase)`, size: a.size, width: r.width, height: r.height, durationMs: 0, hasAudio: false, importedAt: Date.now() };
      apply((p) => PH.replaceLayerMedia(p, layer.id, m));
      setErase({ a: null, b: null });
      toast(t('photo.ai.eraseDone'));
    } catch (e) {
      console.log(`[KurguPhoto] erase failed ${e?.code} ${e?.message}`);
      toast(t('photo.ai.failed'), 'error');
    }
    setBusy(null);
  };

  // --- Bulut: görsel üretme (yalnızca kullanıcı sunucusu yapılandırdıysa) ---
  const generate = async (prompt) => {
    setAsking(null);
    if (!prompt) return;
    setBusy(t('photo.ai.generating'));
    try {
      const r = await generateImage(prompt, photo.canvas.width, photo.canvas.height, `${CACHE_DIR}gen_${Date.now()}`);
      const a = await adoptFile(r.path, `generated.${r.mime === 'image/png' ? 'png' : 'jpg'}`, r.mime);
      const m = { id: a.id, kind: 'image', path: a.path, name: prompt.slice(0, 40), size: a.size, width: r.width, height: r.height, durationMs: 0, hasAudio: false, importedAt: Date.now() };
      const layer = PH.createImageLayer(m);
      apply((p) => PH.addLayer(p, layer, m));
      setSelId(layer.id);
    } catch (e) {
      console.log(`[KurguPhoto] generate failed ${e?.code}`);
      const known = ['CLOUD_NOT_CONFIGURED', 'CLOUD_UNAUTHORIZED', 'CLOUD_RATE_LIMIT', 'CLOUD_TIMEOUT', 'CLOUD_NETWORK', 'CLOUD_BAD_RESPONSE', 'CLOUD_PROMPT_TOO_LONG'];
      toast(t(known.includes(e?.code) ? `photo.cloudErrors.${e.code}` : 'photo.cloudErrors.CLOUD_HTTP'), 'error');
    }
    setBusy(null);
  };

  // --- Dışa aktarma ---
  const exportPhoto = async ({ format, size, quality, share }) => {
    setExporting(share ? 'share' : 'save');
    const t0 = Date.now();
    try {
      await ensureDirs();
      const name = `Kurgu_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.${format}`;
      const out = `${EXPORTS_DIR}${name}`;
      const r = await renderPhoto(PH.photoSpec(photo, mediaUri), out, size || 8192, format, quality);
      console.log(`[KurguPhoto] export ${r.width}x${r.height} ${format} ${Date.now() - t0}ms`);
      if (share) {
        if (!(await Sharing.isAvailableAsync())) throw new Error('SHARE_UNAVAILABLE');
        await Sharing.shareAsync(r.path, { mimeType: format === 'png' ? 'image/png' : 'image/jpeg', dialogTitle: t('photo.export.share') });
      } else {
        await saveImageToGallery(r.path, name);
        toast(t('photo.export.saved', { w: fmt.number(r.width), h: fmt.number(r.height) }));
      }
      apply((p) => ({ ...p, exportedAt: Date.now() }));
      setPanel(null);
    } catch (e) {
      console.log(`[KurguPhoto] export failed ${e?.code} ${e?.message}`);
      toast(t('photo.export.failed'), 'error');
    }
    setExporting(null);
  };

  const confirmDeleteLayer = () => {
    if (!sel) return;
    const id = sel.id;
    apply((p) => PH.removeLayer(p, id));
    setSelId(null);
    setPanel(null);
  };

  if (!photo || !view) return <Loading />;

  // --- Araç çubuğu ---
  const T = (key, icon, onPress, extra = {}) => <ToolButton key={key} testID={`ptool-${key}`} icon={icon} label={t(`photo.tool.${key}`)} onPress={onPress} {...extra} />;
  const layerTools = () => {
    const common = [
      T('style', 'layers-outline', () => setPanel('style')),
      T('front', 'arrow-up-outline', () => apply((p) => PH.moveLayer(p, sel.id, 1))),
      T('back', 'arrow-down-outline', () => apply((p) => PH.moveLayer(p, sel.id, -1))),
      T(sel.visible === false ? 'show' : 'hide', sel.visible === false ? 'eye-outline' : 'eye-off-outline', () => updSel({ visible: sel.visible === false })),
      T('duplicate', 'copy-outline', () => {
        const r = PH.duplicateLayer(photo, sel.id);
        apply(r.project);
        setSelId(r.newId);
      }),
      T('delete', 'trash-outline', confirmDeleteLayer),
    ];
    if (sel.type === 'image') {
      return [
        T('adjust', 'options-outline', () => setPanel('adjust')),
        T('filters', 'color-filter-outline', () => setPanel('filters')),
        T('crop', 'crop-outline', () => setPanel('crop')),
        T('ai', 'sparkles-outline', () => setPanel('ai'), { badge: !!sel.mask }),
        T('hsl', 'color-palette-outline', () => setPanel('hsl')),
        T('grade', 'contrast-outline', () => setPanel('grade')),
        ...common,
      ];
    }
    if (sel.type === 'text') return [T('editText', 'text-outline', () => setPanel('text')), ...common];
    return [T('shape', 'shapes-outline', () => setPanel('shape')), ...common];
  };
  const canvasTools = [
    T('addImage', 'image-outline', addImage),
    T('addText', 'text-outline', () => addText()),
    T('sticker', 'happy-outline', () => setPanel('sticker')),
    T('addShape', 'shapes-outline', addShape),
    T('canvas', 'resize-outline', () => setPanel('canvas')),
    T('background', 'color-fill-outline', () => setPanel('background')),
    T('generate', 'sparkles-outline', () => (cloud ? setAsking('generate') : toast(t('photo.ai.cloudOffHint')))),
  ];

  const renderPanel = () => {
    const close = () => setPanel(null);
    switch (panel) {
      case 'canvas':
        return <CanvasPanel photo={photo} onPreset={(id) => apply((p) => PH.setCanvasPreset(p, id))} onClose={close} />;
      case 'background':
        return <BackgroundPanel photo={photo} onChange={(patch, key) => apply((p) => PH.setCanvas(p, patch), key)} onClose={close} />;
      case 'sticker':
        return <StickerPanel onPick={addSticker} onClose={close} />;
      case 'export':
        return <PhotoExportPanel transparent={PH.isTransparent(photo)} busy={exporting} onExport={exportPhoto} onClose={close} />;
    }
    if (!sel) return null;
    switch (panel) {
      case 'adjust':
        return <PhotoAdjustPanel layer={sel} onChange={updSel} onClose={close} />;
      case 'filters':
        return <FilterPanel clip={sel} luts={photo.luts} onImportLut={importLut} onChange={updSel} onClose={close} />;
      case 'hsl':
        return <HslPanel layer={sel} onChange={updSel} onClose={close} />;
      case 'grade':
        return <GradePanel layer={sel} onChange={updSel} onClose={close} />;
      case 'crop':
        return <CropPanel layer={sel} media={selMedia} onChange={updSel} onRotate={(dir) => apply((p) => PH.rotateQuarter(p, sel.id, dir))} onClose={close} />;
      case 'style':
        return <LayerStylePanel layer={sel} onChange={updSel} onClose={close} />;
      case 'shape':
        return sel.type === 'shape' ? <ShapePanel layer={sel} onChange={updSel} onClose={close} /> : null;
      case 'text':
        return sel.type === 'text' ? <TextPanel item={sel} tabs={TEXT_TABS} onChange={updSel} onClose={close} /> : null;
      case 'ai':
        return (
          <PhotoAiPanel
            layer={sel}
            cloud={!!cloud}
            onRemoveBg={removeBackground}
            onMaskChange={(m, key) => updSel({ mask: m }, key)}
            onClearMask={() => updSel({ mask: null })}
            onEraseMode={startErase}
            onRestore={() => apply((p) => PH.restoreLayerMedia(p, sel.id))}
            onGenerate={() => setAsking('generate')}
            onClose={close}
          />
        );
      default:
        return null;
    }
  };

  // Seçim çerçevesi (ekran pikseli)
  const frame = sel && sel.visible !== false ? PH.layerBox(photo, sel) : null;
  const er = erase?.a && erase?.b ? { left: Math.min(erase.a.x, erase.b.x) * view.k, top: Math.min(erase.a.y, erase.b.y) * view.k, width: Math.abs(erase.b.x - erase.a.x) * view.k, height: Math.abs(erase.b.y - erase.a.y) * view.k } : null;
  const layersTopFirst = [...photo.layers].reverse();
  const transparent = PH.isTransparent(photo);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]} testID="photo-editor">
      <Row style={styles.top}>
        <IconButton icon="arrow-back" directional label={t('common.back')} onPress={leave} testID="photo-back" />
        <Pressable style={{ flex: 1 }} onPress={() => setAsking('rename')}>
          <Txt numberOfLines={1} style={{ fontWeight: '700' }}>
            {photo.name || t('photo.untitled')}
          </Txt>
          <Txt faint style={{ fontSize: 11 }}>{`${fmt.number(photo.canvas.width)}×${fmt.number(photo.canvas.height)}`}</Txt>
        </Pressable>
        <IconButton icon="arrow-undo" directional size={20} label={t('editor.undo')} disabled={!canUndo(hist)} onPress={() => setHist(undo)} testID="photo-undo" />
        <IconButton icon="arrow-redo" directional size={20} label={t('editor.redo')} disabled={!canRedo(hist)} onPress={() => setHist(redo)} testID="photo-redo" />
        <Button title={t('photo.export.action')} onPress={() => setPanel('export')} testID="photo-export" style={styles.exportBtn} />
      </Row>

      <View style={styles.stage} onLayout={(e) => setArea({ w: e.nativeEvent.layout.width - space.lg * 2, h: e.nativeEvent.layout.height - space.lg * 2 })}>
        <View style={{ width: view.dw, height: view.dh, direction: 'ltr' }} {...responder.panHandlers} testID="photo-canvas">
          {transparent ? <Image source={{ uri: CHECKER }} resizeMode="repeat" style={StyleSheet.absoluteFill} /> : null}
          {preview ? <Image source={{ uri: preview.uri }} style={StyleSheet.absoluteFill} resizeMode="stretch" fadeDuration={0} testID="photo-preview" /> : null}
          {frame && !erase ? (
            <View
              pointerEvents="none"
              style={[styles.frame, { left: (frame.cx - frame.w / 2) * view.k, top: (frame.cy - frame.h / 2) * view.k, width: frame.w * view.k, height: frame.h * view.k, transform: [{ rotate: `${frame.rot}deg` }] }]}
            />
          ) : null}
          {er ? <View pointerEvents="none" style={[styles.eraseRect, er]} /> : null}
        </View>
        {rendering ? <View pointerEvents="none" style={styles.renderDot} testID="photo-rendering" /> : null}
      </View>

      {erase ? (
        <View style={[styles.eraseBar, { paddingBottom: insets.bottom + space.sm }]} testID="erase-bar">
          <Txt dim style={{ fontSize: 13 }}>{t('photo.ai.eraseHint')}</Txt>
          <Row>
            <Button kind="secondary" title={t('common.cancel')} onPress={() => setErase(null)} style={{ flex: 1 }} testID="erase-cancel" />
            <Button title={t('photo.ai.eraseApply')} icon="bandage-outline" disabled={!er || er.width < 4 || er.height < 4} onPress={applyErase} style={{ flex: 1 }} testID="erase-apply" />
          </Row>
          <Txt faint style={{ fontSize: 11 }}>{t('photo.ai.eraseNote')}</Txt>
        </View>
      ) : panel ? (
        <View style={[styles.panelWrap, { paddingBottom: insets.bottom }]}>
          <ScrollView keyboardShouldPersistTaps="handled" bounces={false}>
            {renderPanel()}
          </ScrollView>
        </View>
      ) : (
        <View style={{ paddingBottom: insets.bottom }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.strip, { flexDirection: row }]}>
            {layersTopFirst.map((l) => (
              <Pressable key={l.id} testID={`layer-${l.type}-${photo.layers.indexOf(l)}`} onPress={() => setSelId(l.id === selId ? null : l.id)} style={[styles.layerChip, l.id === selId && styles.layerChipActive, l.visible === false && { opacity: 0.45 }]}>
                <Icon name={l.type === 'image' ? 'image-outline' : l.type === 'text' ? 'text-outline' : 'shapes-outline'} size={14} color={l.id === selId ? colors.text : colors.textDim} />
                <Text numberOfLines={1} style={styles.layerText}>
                  {l.type === 'text' ? l.text : l.type === 'shape' ? t(`photo.shape.${l.shape}`) : t('photo.layer.image', { n: fmt.number(photo.layers.filter((q) => q.type === 'image').indexOf(l) + 1) })}
                </Text>
                {l.mask ? <Icon name="person-outline" size={12} color={colors.accent2} /> : null}
              </Pressable>
            ))}
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.toolbar, { flexDirection: row }]}>
            {sel ? layerTools() : canvasTools}
          </ScrollView>
        </View>
      )}

      <PromptModal
        visible={asking === 'rename'}
        title={t('home.rename')}
        initial={photo.name}
        placeholder={t('photo.untitled')}
        onCancel={() => setAsking(null)}
        onSubmit={(name) => {
          setAsking(null);
          apply((p) => ({ ...p, name, updatedAt: Date.now() }));
        }}
      />
      <PromptModal visible={asking === 'generate'} title={t('photo.ai.generate')} placeholder={t('photo.ai.promptPlaceholder')} submitLabel={t('photo.ai.generateAction')} onCancel={() => setAsking(null)} onSubmit={generate} />
      {busy ? (
        <View style={styles.busy} testID="busy">
          <Loading label={busy} />
        </View>
      ) : null}
    </View>
  );
}

/** Ana ekrandan: galeriden tek görsel seçip yeni fotoğraf projesi oluşturur. */
export async function createPhotoFromGallery(name) {
  const picked = await pickFromGallery({ videos: false, multiple: false });
  if (!picked.length) return null;
  const { media } = await importPicked(picked);
  if (!media[0]) throw new Error('IMPORT_FAILED');
  const p = PH.photoFromMedia(media[0], name);
  await savePhoto(p);
  return p;
}

/** Boş kanvasla yeni fotoğraf projesi (ör. sosyal medya gönderisi tasarımı). */
export async function createBlankPhoto(name, presetId = 'portrait45') {
  const preset = PH.CANVAS_PRESETS.find((c) => c.id === presetId) || PH.CANVAS_PRESETS[2];
  const p = { ...PH.createPhoto({ name, width: preset.w, height: preset.h, background: '#FFFFFFFF' }) };
  p.canvas.preset = preset.id;
  await savePhoto(p);
  return p;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  top: { height: 56, paddingHorizontal: space.xs, gap: space.xs },
  exportBtn: { paddingHorizontal: space.md, minHeight: 36, marginEnd: space.sm },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg, backgroundColor: '#07070A' },
  frame: { position: 'absolute', borderWidth: 1.5, borderColor: colors.accent, borderStyle: 'dashed' },
  eraseRect: { position: 'absolute', borderWidth: 2, borderColor: colors.danger, backgroundColor: 'rgba(255,90,110,0.25)' },
  renderDot: { position: 'absolute', top: 8, right: 8, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent2 },
  strip: { gap: space.xs, paddingHorizontal: space.md, paddingVertical: space.sm },
  layerChip: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: 140, paddingHorizontal: space.sm, height: 30, borderRadius: radius.pill, backgroundColor: colors.surface2, borderWidth: 1, borderColor: 'transparent' },
  layerChipActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  layerText: { color: colors.textDim, fontSize: 12, flexShrink: 1 },
  toolbar: { paddingHorizontal: space.sm, paddingBottom: space.sm },
  panelWrap: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, maxHeight: '50%' },
  eraseBar: { backgroundColor: colors.surface, padding: space.lg, gap: space.sm },
  busy: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.overlay },
});
