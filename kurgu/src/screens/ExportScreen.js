import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, PermissionsAndroid, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Sharing from 'expo-sharing';
import { useI18n } from '../i18n';
import { formatTimecode, ltr } from '../i18n/core';
import { useBackHandler, useNav } from '../navigation';
import { Button, Chip, Icon, IconButton, Loading, Row, Txt, useToast } from '../ui';
import { colors, font, radius, space } from '../theme';
import { EXPORTS_DIR, ensureDirs, freeDisk, loadProject, mediaUri, pruneExports, saveProject } from '../storage/library';
import { buildRenderSpec, estimateSize, exportSize, suggestBitrate } from '../engine/renderSpec';
import { cancelExport, deviceStatus, encoderCapabilities, exportVideo, saveToGallery } from '../engine/engine';
import { totalDuration } from '../model/timeline';
import { FPS, RESOLUTIONS, exportPrefs } from '../model/exportPrefs';

const QUALITIES = ['low', 'recommended', 'high'];
const AUDIO_BITRATE = 192000;

export default function ExportScreen({ params }) {
  const { t, fmt, rtl, row } = useI18n();
  const nav = useNav();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const [project, setProject] = useState(null);
  const [caps, setCaps] = useState(null);
  const [status, setStatus] = useState(null);
  const [free, setFree] = useState(null);
  const [res, setRes] = useState(1080);
  const [fps, setFps] = useState(30);
  const [codec, setCodec] = useState('h264');
  const [quality, setQuality] = useState('recommended');
  const [phase, setPhase] = useState('setup'); // setup | running | done | error
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState(null);
  const [gallery, setGallery] = useState(null);
  const startedAt = useRef(0);

  useEffect(() => {
    (async () => {
      const p = await loadProject(params.projectId);
      setProject(p);
      const pref = exportPrefs(p);
      setRes(pref.res);
      setFps(pref.fps);
      setCaps(await encoderCapabilities());
      setStatus(await deviceStatus());
      setFree(await freeDisk());
    })().catch(() => setErr({ code: 'LOAD' }));
  }, [params.projectId]);

  const supported = (r, f, c) => {
    const m = caps?.[c];
    if (!m?.available) return false;
    if (!m.modes?.length) return r <= 1080 && f <= 30; // bilgi yoksa güvenli varsayılan
    return m.modes.includes(`${r}p${f}`);
  };

  // Seçim desteklenmiyorsa en yakın desteklenene in
  useEffect(() => {
    if (!caps) return;
    if (!caps[codec]?.available) setCodec('h264');
    else if (!supported(res, fps, codec)) {
      const r = [...RESOLUTIONS].reverse().find((x) => x <= res && supported(x, fps, codec));
      if (r) setRes(r);
      else {
        const f = [...FPS].reverse().find((x) => supported(res, x, codec));
        if (f) setFps(f);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caps, codec, res, fps]);

  const durationMs = project ? totalDuration(project) : 0;
  const size = project ? exportSize(project, res) : { width: 0, height: 0 };
  const videoBitrate = useMemo(() => {
    const b = suggestBitrate(size.width, size.height, fps, quality, codec);
    const max = caps?.[codec]?.maxBitrate;
    return max ? Math.min(b, max) : b;
  }, [size.width, size.height, fps, quality, codec, caps]);
  const estimate = estimateSize(durationMs, videoBitrate, AUDIO_BITRATE);
  const lowSpace = free != null && free < estimate * 1.3 + 50e6;

  useBackHandler(() => {
    if (phase === 'running') {
      confirmCancel();
      return true;
    }
    return false;
  }, [phase]);

  // Editördeki Dışa Aktar düğmesi (CapCut'taki gibi tek dokunuş): proje ve kodlayıcı bilgisi gelince,
  // seçilen mod destekleniyorsa bir kez başlar; desteklenmiyorsa ayar ekranında kalınır.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!params.autoStart || autoStarted.current || phase !== 'setup' || !project || !caps || free == null) return;
    if (!supported(res, fps, codec)) return;
    autoStarted.current = true;
    console.log(`[KurguUI] export auto ${res}p${fps} ${codec}`);
    start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.autoStart, phase, project, caps, free, res, fps, codec]);

  const start = async () => {
    if (lowSpace) {
      Alert.alert(t('export.lowSpaceTitle'), t('export.lowSpace', { need: fmt.bytes(estimate), free: fmt.bytes(free) }));
      return;
    }
    try {
      await ensureDirs();
      await pruneExports(2);
      await requestNotificationPermission();
      const safe = (project.name || 'kurgu').replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 40) || 'kurgu';
      const out = `${EXPORTS_DIR}${safe}_${Date.now()}.mp4`;
      const spec = buildRenderSpec(project, mediaUri, { rtl });
      console.log(`[KurguExport] totalMs=${spec.totalMs} effectLayers=${JSON.stringify(spec.effectLayers.map((e) => [e.shader, e.startMs, e.endMs, e.amount]))} clipEffects=${JSON.stringify(spec.main.map((m) => m.effects.map((e) => [e.shader, e.startMs, e.endMs])))}`);
      setPhase('running');
      setProgress(0);
      startedAt.current = Date.now();
      const r = await exportVideo(
        spec,
        out,
        {
          width: size.width,
          height: size.height,
          fps,
          videoBitrate,
          audioBitrate: AUDIO_BITRATE,
          codec,
          notificationTitle: t('export.notificationTitle'),
          notificationText: project.name || t('home.untitled'),
        },
        (p) => setProgress(p),
      );
      setResult(r);
      setPhase('done');
      const updated = { ...project, exportedAt: Date.now() };
      setProject(updated);
      saveProject(updated).catch(() => {});
      saveCopyToGallery(r, safe);
    } catch (e) {
      if (e?.code === 'CANCELLED') {
        setPhase('setup');
        return;
      }
      console.log(`[KurguExport] failed: ${e?.code} ${e?.message}`);
      setErr({ code: e?.code || 'EXPORT_FAILED', message: e?.message });
      setPhase('error');
    }
  };

  // Android 13+: arka plandaki dışa aktarma ilerlemesi bildirimde görünsün diye
  // izin istenir. Reddedilirse dışa aktarma yine çalışır, yalnızca bildirim görünmez.
  const requestNotificationPermission = async () => {
    if (Platform.OS !== 'android' || Platform.Version < 33) return;
    try {
      const perm = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
      if (perm && !(await PermissionsAndroid.check(perm))) await PermissionsAndroid.request(perm);
    } catch {
      // izin penceresi açılamazsa sessizce devam
    }
  };

  const saveCopyToGallery = async (r, safe) => {
    try {
      if (Platform.OS === 'android' && Platform.Version < 29) {
        const g = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE);
        if (g !== PermissionsAndroid.RESULTS.GRANTED) throw new Error('PERMISSION');
      }
      await saveToGallery(r.uri, `${safe}_${Date.now()}.mp4`);
      setGallery('saved');
    } catch {
      setGallery('failed');
    }
  };

  const confirmCancel = () => {
    Alert.alert(t('export.cancelTitle'), t('export.cancelMessage'), [
      { text: t('common.no'), style: 'cancel' },
      {
        text: t('export.cancel'),
        style: 'destructive',
        onPress: async () => {
          await cancelExport();
          setPhase('setup');
          toast(t('export.cancelled'));
        },
      },
    ]);
  };

  if (!project || !caps) return <Loading />;

  // Teknik doğrulama: süre ve çözünürlük beklenenle uyuşuyor mu?
  const checks = result
    ? [
        { key: 'duration', ok: Math.abs(result.durationMs - durationMs) <= Math.max(150, 2000 / fps), value: `${ltr(formatTimecode(result.durationMs))} / ${ltr(formatTimecode(durationMs))}` },
        { key: 'resolution', ok: result.width === size.width && result.height === size.height, value: ltr(`${result.width}×${result.height}`) },
        { key: 'audio', ok: result.hasAudio, value: result.hasAudio ? t('common.yes') : t('common.no') },
        { key: 'size', ok: result.size > 0, value: fmt.bytes(result.size) },
      ]
    : [];

  const thermalHot = status?.thermal >= 3;
  const elapsed = (Date.now() - startedAt.current) / 1000;
  const eta = progress > 3 ? Math.round((elapsed * (100 - progress)) / progress) : null;

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <Row style={styles.top}>
        <IconButton icon="arrow-back" directional label={t('common.back')} onPress={() => (phase === 'running' ? confirmCancel() : nav.pop())} testID="export-back" />
        <Txt style={font.h2}>{t('export.title')}</Txt>
        <View style={{ width: 44 }} />
      </Row>

      {phase === 'setup' ? (
        <ScrollView contentContainerStyle={styles.body}>
          <Section title={t('export.resolution')}>
            <Row style={styles.wrap}>
              {RESOLUTIONS.map((r) => (
                <Chip key={r} label={`${r}p`} active={res === r} onPress={() => supported(r, fps, codec) ? setRes(r) : toast(t('export.unsupportedMode'))} testID={`res-${r}`} icon={supported(r, fps, codec) ? null : 'lock-closed-outline'} />
              ))}
            </Row>
            <Txt faint style={styles.note}>{ltr(`${size.width} × ${size.height}`)} · {project.canvas.ratio}</Txt>
          </Section>
          <Section title={t('export.frameRate')}>
            <Row style={styles.wrap}>
              {FPS.map((f) => (
                <Chip key={f} label={fmt.number(f)} active={fps === f} onPress={() => supported(res, f, codec) ? setFps(f) : toast(t('export.unsupportedMode'))} icon={supported(res, f, codec) ? null : 'lock-closed-outline'} />
              ))}
            </Row>
          </Section>
          <Section title={t('export.quality')}>
            <Row style={styles.wrap}>
              {QUALITIES.map((q) => (
                <Chip key={q} label={t(`export.q.${q}`)} active={quality === q} onPress={() => setQuality(q)} />
              ))}
            </Row>
            <Txt faint style={styles.note}>{t('export.bitrate', { mbps: fmt.number(videoBitrate / 1e6, { maximumFractionDigits: 1 }) })}</Txt>
          </Section>
          <Section title={t('export.codec')}>
            <Row style={styles.wrap}>
              <Chip label="H.264" active={codec === 'h264'} onPress={() => setCodec('h264')} />
              {caps.hevc?.available ? <Chip label="H.265 / HEVC" active={codec === 'hevc'} onPress={() => setCodec('hevc')} /> : null}
              {caps.av1?.available ? <Chip label="AV1" active={codec === 'av1'} onPress={() => setCodec('av1')} /> : null}
            </Row>
            <Txt faint style={styles.note}>{t(codec === 'h264' ? 'export.codecH264' : 'export.codecHevc')}</Txt>
          </Section>
          <View style={styles.summary}>
            <Info label={t('export.format')} value="MP4 · AAC" />
            <Info label={t('export.duration')} value={ltr(formatTimecode(durationMs))} />
            <Info label={t('export.estimatedSize')} value={`≈ ${fmt.bytes(estimate)}`} />
            <Info label={t('export.freeSpace')} value={free != null ? fmt.bytes(free) : '—'} warn={lowSpace} />
          </View>
          {thermalHot ? <Warning text={t('export.thermal')} /> : null}
          {status?.powerSave ? <Warning text={t('export.powerSave')} /> : null}
          {lowSpace ? <Warning text={t('export.lowSpace', { need: fmt.bytes(estimate), free: fmt.bytes(free) })} /> : null}
          <Button title={t('export.start')} icon="arrow-up-circle-outline" onPress={start} style={{ marginTop: space.lg }} testID="export-start" />
          <Txt faint center style={styles.note}>{t('export.backgroundNote')}</Txt>
        </ScrollView>
      ) : null}

      {phase === 'running' ? (
        <View style={[styles.body, styles.center]}>
          <Text style={styles.percent} testID="export-progress">{`${fmt.number(progress)}%`}</Text>
          <View style={styles.bar}>
            <View style={[styles.barFill, { width: `${progress}%` }, rtl && { alignSelf: 'flex-end' }]} />
          </View>
          <Txt dim center>{eta != null ? t('export.eta', { sec: fmt.number(eta) }) : t('export.preparing')}</Txt>
          <Txt faint center style={styles.note}>{t('export.keepOpen')}</Txt>
          <Button kind="secondary" title={t('export.cancel')} onPress={confirmCancel} style={{ marginTop: space.xl }} testID="export-cancel" />
        </View>
      ) : null}

      {phase === 'done' && result ? (
        <ScrollView contentContainerStyle={styles.body}>
          <View style={[styles.center, { gap: space.sm }]}>
            <Icon name="checkmark-circle" size={56} color={colors.success} />
            <Txt style={font.h2} center testID="export-done">{t('export.done')}</Txt>
            <Txt dim center>{gallery === 'saved' ? t('export.savedToGallery') : gallery === 'failed' ? t('export.galleryFailed') : t('export.savingToGallery')}</Txt>
          </View>
          <Section title={t('export.verification')}>
            {checks.map((c) => (
              <View key={c.key} testID={`check-${c.key}-${c.ok ? 'ok' : 'fail'}`} style={[styles.check, { flexDirection: row }]}>
                <Icon name={c.ok ? 'checkmark-circle' : 'alert-circle'} size={18} color={c.ok ? colors.success : colors.warning} />
                <Txt style={{ flex: 1 }}>{t(`export.check.${c.key}`)}</Txt>
                <Txt dim>{c.value}</Txt>
              </View>
            ))}
            <Txt faint style={styles.note}>{t('export.encoder', { name: result.videoEncoder || '—', sec: fmt.number(Math.round(result.elapsedMs / 1000)) })}</Txt>
          </Section>
          <Row style={{ justifyContent: 'center', marginTop: space.lg }}>
            <Button kind="secondary" icon="share-outline" title={t('export.share')} onPress={() => Sharing.shareAsync(result.uri, { mimeType: 'video/mp4' }).catch(() => {})} />
            <Button title={t('common.done')} onPress={nav.pop} testID="export-finish" />
          </Row>
        </ScrollView>
      ) : null}

      {phase === 'error' ? (
        <View style={[styles.body, styles.center]} testID="export-failed">
          <Icon name="close-circle" size={56} color={colors.danger} />
          <Txt style={font.h2} center>{t('export.failed')}</Txt>
          <Txt dim center>{t(`errors.export.${knownExportError(err?.code)}`)}</Txt>
          <Txt faint center selectable style={styles.note}>{`${err?.code || ''} ${err?.message || ''}`.trim()}</Txt>
          <Row style={{ justifyContent: 'center', marginTop: space.lg }}>
            <Button kind="secondary" title={t('common.back')} onPress={nav.pop} />
            <Button title={t('export.retry')} onPress={() => setPhase('setup')} testID="export-retry" />
          </Row>
        </View>
      ) : null}
    </View>
  );
}

function knownExportError(code) {
  return ['EXPORT_BUSY', 'BAD_SPEC', 'ENGINE_UNAVAILABLE'].includes(code) ? code : 'EXPORT_FAILED';
}

function Section({ title, children }) {
  return (
    <View style={styles.section}>
      <Txt dim style={styles.sectionTitle}>{title}</Txt>
      {children}
    </View>
  );
}

function Info({ label, value, warn }) {
  return (
    <View style={styles.info}>
      <Txt faint style={font.tiny}>{label}</Txt>
      <Txt style={[{ fontWeight: '700' }, warn && { color: colors.warning }]}>{value}</Txt>
    </View>
  );
}

function Warning({ text }) {
  const { row } = useI18n();
  return (
    <View style={[styles.warning, { flexDirection: row }]}>
      <Icon name="warning-outline" size={18} color={colors.warning} />
      <Txt style={{ flex: 1, fontSize: 13 }}>{text}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  top: { height: 52, justifyContent: 'space-between', paddingHorizontal: space.xs },
  body: { padding: space.lg, gap: space.md, flexGrow: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  section: { gap: space.sm, marginBottom: space.sm },
  sectionTitle: { fontSize: 13, fontWeight: '600' },
  wrap: { flexWrap: 'wrap' },
  note: { fontSize: 12 },
  summary: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.md, gap: space.md },
  info: { width: '45%', gap: 2 },
  warning: { gap: space.sm, alignItems: 'center', backgroundColor: 'rgba(255,181,71,0.12)', borderRadius: radius.md, padding: space.md },
  percent: { color: colors.text, fontSize: 48, fontWeight: '800', fontVariant: ['tabular-nums'] },
  bar: { width: '100%', height: 8, borderRadius: 4, backgroundColor: colors.surface3, overflow: 'hidden', marginVertical: space.lg },
  barFill: { height: 8, backgroundColor: colors.accent },
  check: { alignItems: 'center', gap: space.sm, paddingVertical: 6 },
});
