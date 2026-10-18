import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import * as FS from 'expo-file-system/legacy';
import { useI18n } from '../i18n';
import { formatTimecode, ltr } from '../i18n/core';
import { useBackHandler, useNav } from '../navigation';
import { Icon, IconButton, Loading, PromptModal, Row, ToolButton, Txt, useToast } from '../ui';
import { colors, radius, space } from '../theme';
import Timeline, { MAX_PX_PER_MS, MIN_PX_PER_MS } from '../editor/Timeline';
import {
  AdjustPanel,
  FilterPanel,
  ImageDurationPanel,
  RatioPanel,
  SpeedPanel,
  TextPanel,
  TransformPanel,
  TransitionPanel,
  VolumePanel,
} from '../editor/panels';
import TextHandle from '../editor/TextHandle';
import FxPanel from '../editor/FxPanel';
import AiPanel from '../editor/AiPanel';
import { detectSilences, pickSceneCuts, speechLanguage } from '../model/ai';
import { MAX_CLIP_EFFECTS } from '../model/timeline';
import { KurguPreview } from '../../modules/kurgu-engine';
import { buildRenderSpec } from '../engine/renderSpec';
import { sceneScores, speechPeaks, synthesizeSpeech, thumbnails } from '../engine/engine';
import { CACHE_DIR, adoptFile, loadProject, mediaExists, mediaUri, saveProject, setProjectCover } from '../storage/library';
import { importLutFile, importPicked, pickFiles, pickFromGallery } from '../storage/importer';
import { loadSettings } from '../storage/settings';
import { canRedo, canUndo, createHistory, pushHistory, redo, undo } from '../model/history';
import { canvasSize } from '../model/schema';
import { TEXT_LAYOUTS } from '../model/catalog';
import * as TL from '../model/timeline';
import { importErrorText } from './HomeScreen';

const SPEC_DEBOUNCE_MS = 180;
const SAVE_DEBOUNCE_MS = 700;

export default function EditorScreen({ params, focused }) {
  const { t, fmt, rtl, row, lang } = useI18n();
  const nav = useNav();
  const toast = useToast();
  const insets = useSafeAreaInsets();

  const [hist, setHist] = useState(null);
  const [error, setError] = useState(null);
  const [missing, setMissing] = useState(new Set());
  const [selection, setSelection] = useState(null);
  const [panel, setPanel] = useState(null);
  const [sub, setSub] = useState(null); // alt araç çubuğu: 'audio' | 'text'
  const [position, setPosition] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [pxPerMs, setPxPerMs] = useState(0.06);
  const [previewBox, setPreviewBox] = useState({ w: 0, h: 0 });
  const [specJson, setSpecJson] = useState(null);
  const [busy, setBusy] = useState(null);
  const [renaming, setRenaming] = useState(false);
  const [saveState, setSaveState] = useState('saved');
  const [previewError, setPreviewError] = useState(null);
  const [fxSel, setFxSel] = useState(null);
  const settings = useRef({ haptics: true, previewQuality: 'medium', imageDurationMs: 3000 });
  const previewRef = useRef(null);
  const trimBase = useRef(null);
  const lastSeek = useRef(0);
  const coverKey = useRef(null);

  const project = hist?.present;

  // --- Yükleme ---
  useEffect(() => {
    let alive = true;
    (async () => {
      settings.current = await loadSettings();
      try {
        const p = await loadProject(params.projectId);
        const miss = new Set();
        for (const m of Object.values(p.media)) if (!(await mediaExists(m))) miss.add(m.id);
        if (!alive) return;
        setMissing(miss);
        setHist(createHistory(p));
        coverKey.current = coverKeyOf(p);
        if (p._recovered) toast(t('editor.recovered'));
        // Proje uzunluğuna göre başlangıç yakınlaştırması
        const total = TL.totalDuration(p);
        if (total > 0) setPxPerMs(Math.max(MIN_PX_PER_MS, Math.min(0.12, 300 / total)));
      } catch (e) {
        if (alive) setError(e.message);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.projectId]);

  // --- Değişiklik uygulama ve geçmiş ---
  const apply = useCallback((fn, key = null) => {
    setHist((h) => (h ? pushHistory(h, typeof fn === 'function' ? fn(h.present) : fn, key) : h));
  }, []);

  const haptic = () => {
    if (settings.current.haptics) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  // --- Otomatik kayıt ---
  const saveNow = useCallback(async (p) => {
    if (!p) return;
    try {
      setSaveState('saving');
      await saveProject(p);
      setSaveState('saved');
      const key = coverKeyOf(p);
      if (key !== coverKey.current && p.main[0]) {
        coverKey.current = key;
        const c = p.main[0];
        const media = p.media[c.mediaId];
        if (media) {
          const [uri] = await thumbnails(media, [Math.round(c.srcIn / 500) * 500], 240);
          if (uri) await setProjectCover(p.id, uri);
        }
      }
    } catch {
      setSaveState('error');
    }
  }, []);

  useEffect(() => {
    if (!project) return undefined;
    setSaveState('pending');
    const timer = setTimeout(() => saveNow(project), SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [project, saveNow]);

  const projectRef = useRef(null);
  projectRef.current = project;
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') {
        previewRef.current?.pause?.();
        saveNow(projectRef.current);
      }
    });
    return () => {
      sub.remove();
      saveNow(projectRef.current);
    };
  }, [saveNow]);

  useEffect(() => {
    if (!focused) previewRef.current?.pause?.();
  }, [focused]);

  // --- Render tanımı (önizleme) ---
  const spec = useMemo(() => {
    if (!project) return null;
    const visible = missing.size ? { ...project, main: project.main.filter((c) => !missing.has(c.mediaId)), audio: project.audio.filter((a) => !missing.has(a.mediaId)) } : project;
    return buildRenderSpec(visible, mediaUri, { rtl });
  }, [project, missing, rtl]);

  useEffect(() => {
    if (!spec) return undefined;
    const timer = setTimeout(() => setSpecJson(JSON.stringify(spec)), SPEC_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [spec]);

  const total = project ? TL.totalDuration(project) : 0;

  // --- Oynatma ---
  const seek = useCallback((ms, scrubbing) => {
    setPosition(ms);
    const now = Date.now();
    if (!scrubbing || now - lastSeek.current > 60) {
      lastSeek.current = now;
      previewRef.current?.seekTo?.(ms);
    }
    previewRef.current?.setScrubbing?.(!!scrubbing);
  }, []);

  const togglePlay = () => {
    if (playing) previewRef.current?.pause?.();
    else {
      if (position >= total - 50) seek(0, false);
      previewRef.current?.play?.();
    }
  };

  // --- Seçim yardımcıları ---
  const selectedMain = selection?.type === 'main' ? project?.main.find((c) => c.id === selection.id) : null;
  const selectedAudio = selection?.type === 'audio' ? project?.audio.find((a) => a.id === selection.id) : null;
  const selectedText = selection?.type === 'text' ? project?.texts.find((x) => x.id === selection.id) : null;
  const selectedEffect = selection?.type === 'effect' ? (project?.effectLayers || []).find((x) => x.id === selection.id) : null;

  useEffect(() => {
    // Silinen öğe seçili kalmasın
    if (selection && !selectedMain && !selectedAudio && !selectedText && !selectedEffect) {
      setSelection(null);
      setPanel(null);
    }
  }, [selection, selectedMain, selectedAudio, selectedText, selectedEffect]);

  const clipAtPlayhead = () => (project ? TL.clipAt(project, position)?.clip : null);

  const ensureClipSelected = () => {
    if (selectedMain) return selectedMain;
    const c = clipAtPlayhead();
    if (c) setSelection({ type: 'main', id: c.id });
    return c;
  };

  const openPanel = (name) => {
    previewRef.current?.pause?.();
    setPanel(name);
  };

  useBackHandler(() => {
    if (!focused) return false;
    if (panel) {
      setPanel(null);
      return true;
    }
    if (sub) {
      setSub(null);
      return true;
    }
    if (selection) {
      setSelection(null);
      return true;
    }
    return false;
  }, [focused, panel, sub, selection]);

  // --- İşlemler ---
  const split = () => {
    if (selectedAudio) {
      const r = TL.splitAudioAt(project, selectedAudio.id, position);
      if (r.changed) apply(r.project);
      else toast(t('editor.cannotSplit'));
    } else if (selectedText) {
      const r = TL.splitTextAt(project, selectedText.id, position);
      if (r.changed) apply(r.project);
      else toast(t('editor.cannotSplit'));
    } else if (selectedEffect) {
      const r = TL.splitEffectLayerAt(project, selectedEffect.id, position);
      if (r.changed) apply(r.project);
      else toast(t('editor.cannotSplit'));
    } else {
      const r = TL.splitMainAt(project, position);
      if (r.changed) {
        apply(r.project);
        setSelection({ type: 'main', id: r.newId });
      } else toast(t('editor.cannotSplit'));
    }
    haptic();
  };

  const remove = () => {
    if (selectedMain) apply((p) => TL.deleteMain(p, selectedMain.id));
    else if (selectedAudio) apply((p) => TL.deleteAudio(p, selectedAudio.id));
    else if (selectedText) apply((p) => TL.deleteText(p, selectedText.id));
    else if (selectedEffect) apply((p) => TL.deleteEffectLayer(p, selectedEffect.id));
    setSelection(null);
    setPanel(null);
    haptic();
  };

  const duplicate = () => {
    let r;
    if (selectedMain) r = TL.duplicateMain(project, selectedMain.id);
    else if (selectedAudio) r = TL.duplicateAudio(project, selectedAudio.id);
    else if (selectedText) r = TL.duplicateText(project, selectedText.id);
    else if (selectedEffect) r = TL.duplicateEffectLayer(project, selectedEffect.id);
    if (r?.newId) {
      apply(r.project);
      setSelection({ type: selection.type, id: r.newId });
    }
  };

  const doImport = async (picked) => {
    if (!picked.length) return [];
    setBusy(t('import.progress', { done: 0, total: picked.length }));
    const { media, errors } = await importPicked(picked, (done, n) => setBusy(t('import.progress', { done, total: n })));
    setBusy(null);
    if (errors.length) Alert.alert(t('import.someFailed'), importErrorText(t, errors));
    return media;
  };

  const addMedia = async (source = 'gallery') => {
    try {
      const media = await doImport(source === 'files' ? await pickFiles('visual') : await pickFromGallery());
      const visual = media.filter((m) => m.kind !== 'audio');
      if (!visual.length) return;
      apply((p) => TL.addMediaToProject(p, visual, p.main.length ? position : null, { imageDurationMs: settings.current.imageDurationMs }).project);
    } catch {
      setBusy(null);
      toast(t('errors.generic'), 'error');
    }
  };

  const addAudio = async () => {
    try {
      const media = await doImport(await pickFiles('audio', false));
      const a = media.find((m) => m.kind === 'audio' || m.hasAudio);
      if (!a) return;
      const r = TL.addAudio(project, a, position, 'music');
      apply(r.project);
      setSelection({ type: 'audio', id: r.newId });
      setSub(null);
    } catch {
      setBusy(null);
      toast(t('errors.generic'), 'error');
    }
  };

  const addText = (layoutId) => {
    const lay = TEXT_LAYOUTS.find((l) => l.id === layoutId);
    const text = lay ? t(lay.textKey) : t('text.default');
    const r = TL.addText(project, position, text, lay?.style || {}, lay ? { y: lay.y, animIn: lay.animIn, animOut: lay.animOut } : {});
    apply(r.project);
    setSelection({ type: 'text', id: r.newId });
    setSub(null);
    openPanel('text');
  };

  const freeze = async () => {
    const hit = TL.clipAt(project, position);
    if (!hit || hit.clip.kind !== 'video') return;
    const media = project.media[hit.clip.mediaId];
    setBusy(t('editor.working'));
    try {
      const src = Math.round(hit.clip.srcIn + hit.offset * hit.clip.speed);
      const [uri] = await thumbnails(media, [src], Math.min(1080, media.height || 1080));
      if (!uri) throw new Error('FRAME');
      const tmp = `${CACHE_DIR}freeze_${Date.now()}.jpg`;
      await FS.copyAsync({ from: uri, to: tmp });
      const adopted = await adoptFile(tmp, 'freeze.jpg', 'image/jpeg');
      const img = { id: adopted.id, kind: 'image', path: adopted.path, name: `${media.name} (freeze)`, size: adopted.size, durationMs: 0, width: media.width, height: media.height, hasAudio: false, importedAt: Date.now() };
      const r = TL.insertFreezeFrame(project, position, img);
      apply(r.project);
      setSelection({ type: 'main', id: r.newId });
    } catch {
      toast(t('errors.generic'), 'error');
    }
    setBusy(null);
  };

  const replace = async () => {
    try {
      const media = await doImport(await pickFromGallery({ multiple: false }));
      if (media[0] && selectedMain) apply((p) => TL.replaceMedia(p, selectedMain.id, media[0]));
    } catch {
      setBusy(null);
      toast(t('errors.generic'), 'error');
    }
  };

  // --- Cihaz içi AI araçları ---
  const textAtPlayhead = () => project?.texts.find((x) => position >= x.start && position < x.start + x.duration) || null;
  const aiTargets = () => {
    const clip = selectedMain || clipAtPlayhead();
    const text = selectedText || textAtPlayhead();
    const clipLabel = clip ? t('ai.target.clip', { n: project.main.findIndex((c) => c.id === clip.id) + 1 }) : t('ai.target.noClip');
    return {
      silenceRemoval: clipLabel,
      sceneDetect: clipLabel,
      textToSpeech: text ? t('ai.target.text', { text: text.text.slice(0, 40) }) : t('ai.target.noText'),
    };
  };

  const runAi = async (key) => {
    const clip = selectedMain || clipAtPlayhead();
    const media = clip ? project.media[clip.mediaId] : null;
    try {
      if (key === 'silenceRemoval') {
        if (!clip || clip.kind !== 'video' || media?.hasAudio === false) return toast(t('ai.needAudioClip'));
        setBusy(t('ai.analyzing'));
        const peaks = await speechPeaks(media);
        const ranges = detectSilences(peaks, 50);
        const r = TL.removeSourceRanges(project, clip.id, ranges);
        setBusy(null);
        if (!r.removedMs) return toast(t('ai.noSilence'));
        apply((p) => TL.removeSourceRanges(p, clip.id, ranges).project);
        setSelection(null);
        toast(t('ai.silenceRemoved', { seconds: fmt.number(Math.round(r.removedMs / 100) / 10), parts: r.pieces }));
      } else if (key === 'sceneDetect') {
        if (!clip || clip.kind !== 'video') return toast(t('ai.needVideoClip'));
        setBusy(t('ai.analyzing'));
        const scores = await sceneScores(media, clip.srcIn, clip.srcOut, 6);
        const cuts = pickSceneCuts(scores);
        setBusy(null);
        const r = TL.splitMainAtSourceTimes(project, clip.id, cuts);
        if (!r.added) return toast(t('ai.noScenes'));
        apply((p) => TL.splitMainAtSourceTimes(p, clip.id, cuts).project);
        setSelection(null);
        toast(t('ai.scenesFound', { count: r.added + 1 }));
      } else if (key === 'textToSpeech') {
        const text = selectedText || textAtPlayhead();
        if (!text?.text.trim()) return toast(t('ai.needText'));
        setBusy(t('ai.speaking'));
        const out = `${CACHE_DIR}tts_${Date.now()}.wav`;
        await synthesizeSpeech(text.text, speechLanguage(text.text, lang), out);
        const { media: imported, errors } = await importPicked([{ uri: out, name: `${text.text.slice(0, 24).trim() || 'voice'}.wav`, mimeType: 'audio/wav', kind: 'audio' }]);
        setBusy(null);
        if (!imported[0] || errors.length) return toast(t('errors.generic'), 'error');
        apply((p) => TL.addAudio(p, imported[0], text.start, 'voice').project);
        toast(t('ai.voiceAdded'));
      }
    } catch (e) {
      setBusy(null);
      const code = e?.code || '';
      toast(code.startsWith('TTS_') ? t(`ai.errors.${code}`) : t('errors.generic'), 'error');
    }
  };

  const importLut = async (clipId) => {
    try {
      const lut = await importLutFile();
      if (!lut) return;
      apply((p) => TL.setClipLut(TL.addLut(p, lut), clipId, lut.id));
      toast(t('filters.lutImported'));
    } catch (e) {
      toast(e?.code && e.code.startsWith('LUT_') ? t(`errors.lut.${e.code}`) : t('errors.generic'), 'error');
    }
  };

  const relink = async (mediaId) => {
    try {
      const old = project.media[mediaId];
      const picked = old.kind === 'audio' ? await pickFiles('audio', false) : await pickFromGallery({ multiple: false, images: old.kind === 'image', videos: old.kind === 'video' });
      const [m] = await doImport(picked);
      if (!m) return;
      apply((p) => ({ ...p, media: { ...p.media, [mediaId]: { ...m, id: mediaId } }, updatedAt: Date.now() }));
      setMissing((s) => {
        const n = new Set(s);
        n.delete(mediaId);
        return n;
      });
      toast(t('editor.relinked'));
    } catch {
      setBusy(null);
      toast(t('errors.generic'), 'error');
    }
  };

  // Kırpma: hareket boyunca temel anlık görüntü üzerinden hesaplanır, bırakınca tek adım olarak geçmişe yazılır.
  const onTrim = (kind, id, edge, deltaMs, phase) => {
    if (phase === 'start') {
      trimBase.current = project;
      previewRef.current?.pause?.();
      return;
    }
    const base = trimBase.current;
    if (!base) return;
    const fn = { main: TL.trimMain, audio: TL.trimAudio, text: TL.trimText, effect: TL.trimEffectLayer }[kind];
    const next = fn(base, id, edge, deltaMs);
    if (phase === 'move') {
      setHist((h) => ({ ...h, present: next }));
      if (kind === 'main') {
        const l = TL.mainLayout(next).find((x) => x.clip.id === id);
        if (l) seek(edge === 'start' ? l.start : Math.max(l.start, l.end - 40), true);
      }
    } else {
      setHist((h) => pushHistory({ ...h, present: base }, next));
      trimBase.current = null;
      previewRef.current?.setScrubbing?.(false);
    }
  };

  const zoom = (next) => setPxPerMs(Math.max(MIN_PX_PER_MS, Math.min(MAX_PX_PER_MS, next)));

  const exportProject = async () => {
    if (!project.main.length) return toast(t('editor.emptyExport'));
    if (missing.size) return toast(t('editor.missingExport'), 'error');
    previewRef.current?.pause?.();
    await saveNow(project);
    nav.push('export', { projectId: project.id });
  };

  // --- Görünüm ---
  if (error) {
    return (
      <View style={[styles.screen, styles.center, { paddingTop: insets.top }]}>
        <Icon name="alert-circle-outline" size={40} color={colors.danger} />
        <Txt center style={{ margin: space.lg }}>
          {t('errors.projectOpen')}
        </Txt>
        <IconButton icon="arrow-back" directional label={t('common.back')} onPress={nav.pop} />
      </View>
    );
  }
  if (!project) return <Loading />;

  const canvas = project.canvas;
  const fitted = fitBox(previewBox, canvas.width / canvas.height);
  const timeLabel = `${ltr(formatTimecode(position))} / ${ltr(formatTimecode(total))}`;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Üst çubuk */}
      <Row style={styles.topBar}>
        <IconButton icon="close" label={t('common.close')} onPress={() => { saveNow(project); nav.pop(); }} testID="editor-close" />
        <Pressable style={styles.titleWrap} onPress={() => setRenaming(true)}>
          <Txt numberOfLines={1} center style={styles.title}>
            {project.name || t('home.untitled')}
          </Txt>
          <Txt faint center style={styles.saveState}>
            {t(`editor.save.${saveState}`)}
          </Txt>
        </Pressable>
        <Pressable testID="export-open" onPress={exportProject} style={({ pressed }) => [styles.exportBtn, pressed && { opacity: 0.8 }]}>
          <Icon name="arrow-up" size={16} />
          <Text style={styles.exportText}>{t('editor.export')}</Text>
        </Pressable>
      </Row>

      {/* Önizleme */}
      <View style={styles.previewArea} onLayout={(e) => setPreviewBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
        {missing.size ? (
          <Pressable style={styles.banner} onPress={() => relink([...missing][0])} testID="missing-banner">
            <Icon name="link-outline" size={16} color={colors.bg} />
            <Text style={styles.bannerText} numberOfLines={2}>
              {t('editor.missingMedia', { count: missing.size, name: project.media[[...missing][0]]?.name || '' })}
            </Text>
          </Pressable>
        ) : null}
        <View style={[styles.previewBox, { width: fitted.w, height: fitted.h }]} testID="preview">
          {KurguPreview && focused && project.main.length ? (
            <KurguPreview
              ref={previewRef}
              style={StyleSheet.absoluteFill}
              spec={specJson}
              previewQuality={settings.current.previewQuality}
              onPosition={(e) => setPosition(e.nativeEvent.positionMs)}
              onPlaybackState={(e) => setPlaying(!!e.nativeEvent.isPlaying)}
              onPreviewError={(e) => setPreviewError(e.nativeEvent.code)}
            />
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.center]}>
              <Txt faint center style={{ padding: space.lg }}>
                {!KurguPreview ? t('editor.engineUnavailable') : project.main.length ? '' : t('editor.emptyHint')}
              </Txt>
            </View>
          )}
          {selectedText && fitted.w > 0 ? (
            <TextHandle
              item={selectedText}
              boxW={fitted.w}
              boxH={fitted.h}
              visible={position >= selectedText.start && position <= selectedText.start + selectedText.duration}
              onChange={(patch, key) => apply((p) => TL.updateText(p, selectedText.id, patch), key)}
              onEdit={() => openPanel('text')}
            />
          ) : null}
        </View>
        {previewError ? (
          <Pressable style={styles.previewError} onPress={() => setPreviewError(null)}>
            <Text style={styles.previewErrorText}>{t('editor.previewError', { code: previewError })}</Text>
          </Pressable>
        ) : null}
      </View>

      {/* Oynatma denetimleri */}
      <Row style={styles.controls}>
        <Text style={styles.time}>{timeLabel}</Text>
        <IconButton icon={playing ? 'pause' : 'play'} size={28} label={t(playing ? 'editor.pause' : 'editor.play')} onPress={togglePlay} testID="play-toggle" />
        <Row gap={0}>
          <IconButton icon="bookmark-outline" size={20} label={t('editor.marker')} onPress={() => apply((p) => TL.toggleMarker(p, position))} />
          <IconButton icon="arrow-undo" directional size={20} label={t('editor.undo')} disabled={!canUndo(hist)} onPress={() => setHist(undo)} testID="undo" />
          <IconButton icon="arrow-redo" directional size={20} label={t('editor.redo')} disabled={!canRedo(hist)} onPress={() => setHist(redo)} testID="redo" />
        </Row>
      </Row>

      {/* Zaman çizelgesi */}
      <View style={styles.timeline}>
        <Timeline
          project={missing.size ? markMissing(project, missing) : project}
          positionMs={position}
          isPlaying={playing}
          pxPerMs={pxPerMs}
          selection={selection}
          onSeek={seek}
          onSelect={(sel) => {
            setSelection(sel);
            setSub(null);
            setPanel(null);
            if (sel.type === 'text') {
              const tx = project.texts.find((x) => x.id === sel.id);
              if (tx && (position < tx.start || position > tx.start + tx.duration)) seek(tx.start + 1, false);
            }
          }}
          onTrim={onTrim}
          onMoveMain={(from, to) => {
            apply((p) => TL.moveMain(p, from, to));
            haptic();
          }}
          onMoveAudio={(id, start) => apply((p) => TL.updateAudio(p, id, { start: Math.round(TL.snapTime(p, start, 12 / pxPerMs, [position])) }))}
          onMoveText={(id, start) => apply((p) => TL.updateText(p, id, { start: Math.round(TL.snapTime(p, start, 12 / pxPerMs, [position])) }))}
          onMoveEffect={(id, start) => apply((p) => TL.updateEffectLayer(p, id, { start: Math.round(TL.snapTime(p, start, 12 / pxPerMs, [position])) }))}
          effectName={(effectId) => t(`fx.${effectId}.name`)}
          onZoom={zoom}
          onTransitionPress={(clipId) => {
            setSelection({ type: 'main', id: clipId });
            openPanel('transition');
          }}
          onAddMedia={() => addMedia('gallery')}
          labels={{ addMedia: t('editor.addMedia'), missing: t('editor.missingShort') }}
        />
      </View>

      {/* Alt bölüm: panel veya araç çubuğu */}
      <View style={{ paddingBottom: insets.bottom }}>
        {panel ? (
          renderPanel()
        ) : (
          <View style={[styles.toolbar, { flexDirection: row }]}>
            {selection || sub ? (
              <IconButton icon="chevron-back" directional label={t('common.back')} onPress={() => (sub ? setSub(null) : setSelection(null))} style={styles.toolBack} testID="tool-back" />
            ) : null}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.toolScroll}>
              {renderTools()}
            </ScrollView>
          </View>
        )}
      </View>

      <PromptModal
        visible={renaming}
        title={t('home.rename')}
        initial={project.name}
        placeholder={t('home.untitled')}
        onCancel={() => setRenaming(false)}
        onSubmit={(name) => {
          setRenaming(false);
          apply((p) => ({ ...p, name, updatedAt: Date.now() }));
        }}
      />
      {busy ? (
        <View style={styles.busy}>
          <Loading label={busy} />
        </View>
      ) : null}
    </View>
  );

  function renderTools() {
    const T = (key, icon, onPress, extra = {}) => <ToolButton key={key} testID={`tool-${key}`} icon={icon} label={t(`tools.${key}`)} onPress={onPress} {...extra} />;
    if (sub === 'audio') {
      return [T('music', 'musical-notes-outline', addAudio), T('soundFromVideo', 'film-outline', () => {
        const c = ensureClipSelected();
        if (c) {
          const r = TL.extractAudio(project, c.id);
          if (r.newId) {
            apply(r.project);
            setSelection({ type: 'audio', id: r.newId });
            setSub(null);
          } else toast(t('editor.noAudio'));
        }
      })];
    }
    if (sub === 'text') {
      return [T('addText', 'add-circle-outline', () => addText(null)), ...TEXT_LAYOUTS.map((l) => (
        <ToolButton key={l.id} testID={`tool-layout-${l.id}`} icon="albums-outline" label={t(`text.layout.${l.id}`)} onPress={() => addText(l.id)} />
      ))];
    }
    if (selectedMain) {
      const isImage = selectedMain.kind === 'image';
      const index = project.main.findIndex((c) => c.id === selectedMain.id);
      return [
        T('split', 'cut-outline', split),
        isImage ? T('duration', 'time-outline', () => openPanel('duration')) : T('speed', 'speedometer-outline', () => openPanel('speed')),
        !isImage ? T('volume', 'volume-high-outline', () => openPanel('volume')) : null,
        T('filters', 'color-filter-outline', () => openPanel('filters')),
        T('adjust', 'options-outline', () => openPanel('adjust')),
        T('effects', 'sparkles-outline', () => {
          setFxSel(selectedMain.effects?.[selectedMain.effects.length - 1]?.id || null);
          openPanel('fxClip');
        }, { badge: !!selectedMain.effects?.length }),
        T('transform', 'crop-outline', () => openPanel('transform')),
        index > 0 ? T('transition', 'git-compare-outline', () => openPanel('transition')) : null,
        !isImage ? T('freeze', 'snow-outline', freeze) : null,
        !isImage ? T('extractAudio', 'musical-note-outline', () => {
          const r = TL.extractAudio(project, selectedMain.id);
          if (r.newId) apply(r.project);
          else toast(t('editor.noAudio'));
        }) : null,
        T('replace', 'swap-horizontal-outline', replace),
        T('duplicate', 'copy-outline', duplicate),
        T('delete', 'trash-outline', remove),
      ].filter(Boolean);
    }
    if (selectedAudio) {
      return [
        T('split', 'cut-outline', split),
        T('volume', 'volume-high-outline', () => openPanel('audioVolume')),
        T('speed', 'speedometer-outline', () => openPanel('audioSpeed')),
        T('duplicate', 'copy-outline', duplicate),
        T('delete', 'trash-outline', remove),
      ];
    }
    if (selectedEffect) {
      return [
        T('adjust', 'options-outline', () => openPanel('fxLayer')),
        T('replace', 'swap-horizontal-outline', () => openPanel('fxLayer')),
        T('split', 'cut-outline', split),
        T('duplicate', 'copy-outline', duplicate),
        T('delete', 'trash-outline', remove),
      ];
    }
    if (selectedText) {
      return [
        T('editText', 'create-outline', () => openPanel('text')),
        T('textAnimation', 'film-outline', () => openPanel('textAnim')),
        T('split', 'cut-outline', split),
        T('duplicate', 'copy-outline', duplicate),
        T('delete', 'trash-outline', remove),
      ];
    }
    return [
      T('edit', 'cut-outline', () => ensureClipSelected()),
      T('audio', 'musical-notes-outline', () => setSub('audio')),
      T('text', 'text-outline', () => setSub('text')),
      T('effects', 'sparkles-outline', () => {
        setSelection(null);
        openPanel('fxLayer');
      }),
      T('filters', 'color-filter-outline', () => ensureClipSelected() && openPanel('filters')),
      T('adjust', 'options-outline', () => ensureClipSelected() && openPanel('adjust')),
      T('ratio', 'tablet-portrait-outline', () => openPanel('ratio')),
      T('ai', 'sparkles', () => openPanel('ai')),
    ];
  }

  function renderPanel() {
    const close = () => setPanel(null);
    const updMain = (patch, key) => apply((p) => TL.updateMain(p, selectedMain.id, patch), key);
    const all = (patch) => {
      apply((p) => TL.updateAllMain(p, patch));
      toast(t('panels.appliedToAll'));
    };
    const target = selectedMain || clipAtPlayhead();
    switch (panel) {
      case 'speed':
        return selectedMain && <SpeedPanel clip={selectedMain} onChange={(patch, key) => apply((p) => TL.setSpeed(p, selectedMain.id, patch.speed), key)} onClose={close} />;
      case 'volume':
        return selectedMain && <VolumePanel item={selectedMain} maxFadeMs={Math.min(5000, TL.clipDuration(selectedMain) / 2)} onChange={updMain} onClose={close} />;
      case 'duration':
        return selectedMain && <ImageDurationPanel clip={selectedMain} onChange={updMain} onClose={close} />;
      case 'filters':
        return target && <FilterPanel clip={target} luts={project.luts} onImportLut={() => importLut(target.id)} onChange={(patch, key) => apply((p) => TL.updateMain(p, target.id, patch), key)} onApplyAll={all} onClose={close} />;
      case 'adjust':
        return target && <AdjustPanel clip={target} onChange={(patch, key) => apply((p) => TL.updateMain(p, target.id, patch), key)} onApplyAll={all} onClose={close} />;
      case 'fxClip': {
        if (!selectedMain) return null;
        const list = selectedMain.effects || [];
        return (
          <FxPanel
            mode="clip"
            instances={list}
            selectedId={fxSel}
            maxReached={list.length >= MAX_CLIP_EFFECTS}
            onPick={(effectId) => {
              const r = TL.addClipEffect(project, selectedMain.id, effectId);
              if (!r.newId) return toast(t('fx.maxReached'));
              apply(r.project);
              setFxSel(r.newId);
            }}
            onSelect={setFxSel}
            onUpdate={(instId, patch, key) => apply((p) => TL.updateClipEffect(p, selectedMain.id, instId, patch), key)}
            onRemove={(instId) => {
              apply((p) => TL.removeClipEffect(p, selectedMain.id, instId));
              setFxSel(null);
            }}
            onClose={close}
          />
        );
      }
      case 'ai':
        return <AiPanel targets={aiTargets()} onRun={runAi} onClose={close} />;
      case 'fxLayer':
        return (
          <FxPanel
            mode="layer"
            instances={selectedEffect ? [selectedEffect] : []}
            selectedId={selectedEffect?.id}
            onPick={(effectId) => {
              if (selectedEffect) {
                apply((p) => TL.updateEffectLayer(p, selectedEffect.id, { effectId, values: {}, amount: 1 }));
              } else {
                const r = TL.addEffectLayer(project, effectId, position, Math.max(500, Math.min(3000, total - position || 3000)));
                apply(r.project);
                setSelection({ type: 'effect', id: r.newId });
              }
            }}
            onSelect={() => {}}
            onUpdate={(id, patch, key) => apply((p) => TL.updateEffectLayer(p, id, patch), key)}
            onRemove={(id) => {
              apply((p) => TL.deleteEffectLayer(p, id));
              setSelection(null);
              setPanel(null);
            }}
            onClose={close}
          />
        );
      case 'transform':
        return selectedMain && <TransformPanel clip={selectedMain} canvasFit={project.canvas.fit} onChange={updMain} onClose={close} />;
      case 'transition': {
        if (!selectedMain) return null;
        const i = project.main.findIndex((c) => c.id === selectedMain.id);
        const maxMs = i > 0 ? Math.min(TL.clipDuration(project.main[i - 1]), TL.clipDuration(selectedMain)) : 0;
        return <TransitionPanel clip={selectedMain} maxMs={maxMs} onChange={updMain} onApplyAll={(patch) => { apply((p) => ({ ...TL.updateAllMain(p, patch) })); toast(t('panels.appliedToAll')); }} onClose={close} />;
      }
      case 'ratio':
        return (
          <RatioPanel
            project={project}
            onChange={({ ratio, fit }) =>
              apply((p) => ({
                ...p,
                updatedAt: Date.now(),
                canvas: { ...p.canvas, ...(ratio ? { ratio, ...canvasSize(ratio, Math.min(p.canvas.width, p.canvas.height)) } : {}), ...(fit ? { fit } : {}) },
              }))
            }
            onClose={close}
          />
        );
      case 'audioVolume':
        return selectedAudio && <VolumePanel item={selectedAudio} canMute={false} maxFadeMs={Math.min(10000, TL.audioDuration(selectedAudio) / 2)} onChange={(patch, key) => apply((p) => TL.updateAudio(p, selectedAudio.id, patch), key)} onClose={close} />;
      case 'audioSpeed':
        return selectedAudio && <SpeedPanel clip={selectedAudio} onChange={(patch, key) => apply((p) => TL.updateAudio(p, selectedAudio.id, { speed: Math.max(0.25, Math.min(4, patch.speed)) }), key)} onClose={close} />;
      case 'text':
      case 'textAnim':
        return selectedText && <TextPanel item={selectedText} initialTab={panel === 'textAnim' ? 'animation' : 'style'} onChange={(patch, key) => apply((p) => TL.updateText(p, selectedText.id, patch), key)} onClose={close} />;
      default:
        return null;
    }
  }
}

function coverKeyOf(p) {
  const c = p.main[0];
  return c ? `${c.mediaId}:${Math.round(c.srcIn / 500)}` : null;
}

function markMissing(project, missing) {
  const media = { ...project.media };
  for (const id of missing) if (media[id]) media[id] = { ...media[id], missing: true };
  return { ...project, media };
}

function fitBox(box, aspect) {
  if (!box.w || !box.h) return { w: 0, h: 0 };
  const pad = 8;
  const W = box.w - pad * 2;
  const H = box.h - pad * 2;
  if (W / H > aspect) return { w: Math.round(H * aspect), h: Math.round(H) };
  return { w: Math.round(W), h: Math.round(W / aspect) };
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  topBar: { height: 52, paddingHorizontal: space.xs, justifyContent: 'space-between' },
  titleWrap: { flex: 1, alignItems: 'center', paddingHorizontal: space.sm },
  title: { fontWeight: '700', fontSize: 15 },
  saveState: { fontSize: 10 },
  exportBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.accent, paddingHorizontal: 14, height: 34, borderRadius: radius.pill, marginHorizontal: space.sm },
  exportText: { color: colors.text, fontWeight: '800', fontSize: 14 },
  previewArea: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' },
  previewBox: { backgroundColor: '#000', overflow: 'hidden' },
  banner: { position: 'absolute', top: 6, left: 10, right: 10, zIndex: 20, backgroundColor: colors.warning, borderRadius: radius.md, padding: space.sm, flexDirection: 'row', alignItems: 'center', gap: 6 },
  bannerText: { color: colors.bg, fontWeight: '700', fontSize: 12, flex: 1 },
  previewError: { position: 'absolute', bottom: 8, left: 10, right: 10, backgroundColor: colors.danger, borderRadius: radius.md, padding: space.sm },
  previewErrorText: { color: colors.text, fontSize: 12, textAlign: 'center' },
  controls: { height: 46, paddingHorizontal: space.md, justifyContent: 'space-between' },
  time: { color: colors.textDim, fontSize: 12, fontVariant: ['tabular-nums'], minWidth: 110 },
  timeline: { height: 210, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  toolbar: { minHeight: 72, alignItems: 'center', backgroundColor: colors.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  toolBack: { marginHorizontal: space.xs },
  toolScroll: { paddingHorizontal: space.xs, alignItems: 'center' },
  busy: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.overlay },
});
