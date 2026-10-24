// Metin anahtar kareleri: konum, ölçek, döndürme ve opaklık. Elmas düğmesi oynatma
// kafasında kare ekler/siler; iz varsa kaydırıcı ve sürükleme o anki kareyi düzenler.

import { View } from 'react-native';
import { useI18n } from '../i18n';
import { Panel } from '../ui';
import { space } from '../theme';
import { KeySlider } from './LayerPanel';
import { textPropAt, textPropPatch, toggleTextKey } from '../model/timeline';

const TEXT_KEYS = { at: textPropAt, patch: textPropPatch, toggle: toggleTextKey, live: 'txt' };

export default function TextKeysPanel({ item, localMs, onChange, onClose }) {
  const { t, fmt } = useI18n();
  const pct = (v) => `${fmt.number(Math.round(v * 100))}%`;
  const num = (v) => fmt.number(Math.round(v * 100));
  const common = { item, localMs, onChange, api: TEXT_KEYS };
  return (
    <Panel title={t('tools.textKeys')} onClose={onClose} testID="panel-text-keys">
      <View style={{ gap: space.sm }}>
        <KeySlider {...common} prop="x" label={t('panels.positionX')} min={-1.2} max={1.2} center={0} format={num} testID="text-key-x" />
        <KeySlider {...common} prop="y" label={t('panels.positionY')} min={-1.2} max={1.2} center={0} format={num} testID="text-key-y" />
        <KeySlider {...common} prop="scale" label={t('panels.scale')} min={0.2} max={6} center={1} format={pct} testID="text-key-scale" />
        <KeySlider {...common} prop="rotation" label={t('layer.rotation')} min={-180} max={180} center={0} format={(v) => `${fmt.number(Math.round(v))}°`} />
        <KeySlider {...common} prop="opacity" label={t('layer.opacity')} min={0} max={1} format={pct} />
      </View>
    </Panel>
  );
}
