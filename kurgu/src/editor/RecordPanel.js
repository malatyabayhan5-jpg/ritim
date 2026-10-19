// Seslendirme paneli: mikrofonla kayıt. Kayıt oynatma kafasından başlar, önizleme
// birlikte oynar; durdurulunca kayıt "seslendirme" ses katmanı olarak eklenir.

import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useI18n } from '../i18n';
import { Button, Panel, Txt } from '../ui';
import { colors, radius, space } from '../theme';
import { formatTimecode, ltr } from '../i18n/core';
import { recordingLevel } from '../engine/engine';

export default function RecordPanel({ onStart, onStop, onClose }) {
  const { t } = useI18n();
  const [state, setState] = useState('idle'); // idle | starting | recording | saving
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const started = useRef(0);

  useEffect(() => {
    if (state !== 'recording') return undefined;
    const id = setInterval(async () => {
      setElapsed(Date.now() - started.current);
      const l = await recordingLevel().catch(() => 0);
      setLevel((prev) => Math.max(l, prev * 0.7));
    }, 100);
    return () => clearInterval(id);
  }, [state]);

  const start = async () => {
    setState('starting');
    const ok = await onStart();
    if (!ok) return setState('idle');
    started.current = Date.now();
    setElapsed(0);
    setState('recording');
  };

  const stop = async () => {
    setState('saving');
    await onStop();
    setState('idle');
  };

  const recording = state === 'recording';
  return (
    <Panel title={t('record.title')} onClose={recording ? stop : onClose} testID="panel-record">
      <View style={styles.body}>
        <Txt center style={styles.time} testID="record-time">
          {ltr(formatTimecode(elapsed, { tenths: true }))}
        </Txt>
        <View style={styles.meter}>
          <View style={[styles.meterFill, { width: `${Math.round(Math.min(1, level * 1.6) * 100)}%`, backgroundColor: level > 0.85 ? colors.danger : colors.accent }]} />
        </View>
        {recording ? (
          <Button title={t('record.stop')} kind="danger" onPress={stop} testID="record-stop" />
        ) : (
          <Button title={state === 'idle' ? t('record.start') : t('record.wait')} onPress={start} disabled={state !== 'idle'} testID="record-start" />
        )}
        <Txt faint style={styles.hint}>
          {t('record.hint')}
        </Txt>
      </View>
    </Panel>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.lg, paddingBottom: space.md, gap: space.md },
  time: { fontSize: 28, fontWeight: '700', fontVariant: ['tabular-nums'] },
  meter: { height: 8, borderRadius: radius.sm, backgroundColor: colors.surface3, overflow: 'hidden' },
  meterFill: { height: 8 },
  hint: { fontSize: 12 },
});
