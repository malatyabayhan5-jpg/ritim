// Ortak arayüz bileşenleri. Hepsi yön duyarlıdır (RTL'de satırlar ve
// yönlü simgeler aynalanır) ve metinleri yalnızca çağıran taraftan alır.

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, font, HIT, layout, radius, space } from '../theme';
import { useI18n } from '../i18n';

export function Icon({ name, size = 22, color = colors.text, directional = false, style }) {
  const { flipIcon } = useI18n();
  return <Ionicons name={directional ? flipIcon(name) : name} size={size} color={color} style={style} />;
}

export function Txt({ style, dim, faint, center, numberOfLines, children, selectable, testID }) {
  const { textAlign } = useI18n();
  return (
    <Text
      testID={testID}
      selectable={selectable}
      numberOfLines={numberOfLines}
      style={[
        styles.txt,
        { textAlign: center ? 'center' : textAlign },
        dim && { color: colors.textDim },
        faint && { color: colors.textFaint },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export function IconButton({ icon, onPress, label, size = 22, color, disabled, active, directional, testID, style }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.iconBtn, active && styles.iconBtnActive, pressed && { opacity: 0.6 }, disabled && { opacity: 0.35 }, style]}
    >
      <Icon name={icon} size={size} color={color || (active ? colors.accent : colors.text)} directional={directional} />
    </Pressable>
  );
}

/** Altında etiket olan araç düğmesi (alt araç çubuğu). */
export function ToolButton({ icon, label, onPress, active, disabled, badge, testID }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.tool, pressed && { opacity: 0.6 }, disabled && { opacity: 0.35 }]}
    >
      <View>
        <Icon name={icon} size={23} color={active ? colors.accent : colors.text} />
        {badge ? <View style={styles.badge} /> : null}
      </View>
      <Text numberOfLines={2} style={[styles.toolLabel, active && { color: colors.accent }]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Button({ title, onPress, kind = 'primary', icon, disabled, loading, style, testID }) {
  const { row } = useI18n();
  const bg = { primary: colors.accent, secondary: colors.surface3, danger: colors.danger, ghost: 'transparent' }[kind];
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [styles.btn, { backgroundColor: bg, flexDirection: row }, pressed && { opacity: 0.75 }, (disabled || loading) && { opacity: 0.45 }, style]}
    >
      {loading ? <ActivityIndicator color={colors.text} size="small" /> : icon ? <Icon name={icon} size={18} /> : null}
      <Text style={styles.btnText}>{title}</Text>
    </Pressable>
  );
}

export function Chip({ label, active, onPress, icon, testID }) {
  const { row } = useI18n();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, { flexDirection: row }, active && styles.chipActive, pressed && { opacity: 0.7 }]}
    >
      {icon ? <Icon name={icon} size={14} color={active ? colors.text : colors.textDim} /> : null}
      <Text style={[styles.chipText, active && { color: colors.text }]}>{label}</Text>
    </Pressable>
  );
}

export function Row({ style, children, gap = space.sm, align = 'center' }) {
  const { row } = useI18n();
  return <View style={[{ flexDirection: row, alignItems: align, gap }, style]}>{children}</View>;
}

/**
 * Kaydırıcı. Değer aralığı [min, max]; `center` verilirse (ör. 0) dolgu ortadan çizilir.
 * Sağdan sola düzende kaydırıcı aynalanır (değer sola doğru artar).
 */
export function Slider({ value, min = 0, max = 1, step = 0, onChange, onComplete, center, testID, formatValue }) {
  const { rtl } = useI18n();
  const [width, setWidth] = useState(1);
  const state = useRef({ width: 1, value, startX: 0, rtl, min, max, step });
  state.current = { ...state.current, width, value, rtl, min, max, step, onChange, onComplete };

  const toValue = (x) => {
    const s = state.current;
    let r = Math.max(0, Math.min(1, x / s.width));
    if (s.rtl) r = 1 - r;
    let v = s.min + r * (s.max - s.min);
    if (s.step) v = Math.round(v / s.step) * s.step;
    return Math.max(s.min, Math.min(s.max, v));
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        state.current.startX = e.nativeEvent.locationX;
        state.current.onChange?.(toValue(e.nativeEvent.locationX));
      },
      onPanResponderMove: (e, g) => {
        state.current.onChange?.(toValue(state.current.startX + g.dx));
      },
      onPanResponderRelease: (e, g) => {
        const v = toValue(state.current.startX + g.dx);
        state.current.onChange?.(v);
        state.current.onComplete?.(v);
      },
    }),
  ).current;

  const ratio = (value - min) / (max - min || 1);
  const pos = rtl ? 1 - ratio : ratio;
  const c = center !== undefined ? (center - min) / (max - min) : 0;
  const cPos = rtl ? 1 - c : c;
  const fillStart = Math.min(pos, cPos);
  const fillEnd = Math.max(pos, cPos);
  return (
    <View style={styles.sliderWrap}>
      <View
        testID={testID}
        style={styles.slider}
        onLayout={(e) => setWidth(Math.max(1, e.nativeEvent.layout.width))}
        {...responder.panHandlers}
      >
        <View style={styles.sliderTrack} />
        <View style={[styles.sliderFill, { left: `${fillStart * 100}%`, width: `${(fillEnd - fillStart) * 100}%` }]} />
        <View style={[styles.sliderThumb, { left: pos * width - 11 }]} />
      </View>
      {formatValue ? <Text style={styles.sliderValue}>{formatValue(value)}</Text> : null}
    </View>
  );
}

/** Alt panel: başlık + kapat/onayla. Önizleme ve zaman çizelgesi görünür kalır. */
/**
 * Alt panel. `tabs` verilirse başlık yerine sekmeler çizilir (referans uygulamadaki Filtreler / Ayarla
 * paneli gibi): [{ key, label, active, onPress, testID }].
 */
export function Panel({ title, onClose, onDone, children, testID, right, tabs }) {
  const { t, row } = useI18n();
  return (
    <View style={styles.panel} testID={testID}>
      <View style={[styles.panelHeader, { flexDirection: row }]}>
        <IconButton icon="close" onPress={onClose} label={t('common.close')} size={20} />
        {tabs ? (
          <View style={[styles.panelTabs, { flexDirection: row }]} accessibilityRole="tablist">
            {tabs.map((tab) => (
              <Pressable key={tab.key} onPress={tab.onPress} accessibilityRole="tab" accessibilityState={{ selected: !!tab.active }} testID={tab.testID} style={styles.panelTab}>
                <Text numberOfLines={1} style={[styles.panelTabText, tab.active && styles.panelTabActive]}>
                  {tab.label}
                </Text>
                <View style={[styles.panelTabBar, tab.active && { backgroundColor: colors.accent }]} />
              </Pressable>
            ))}
          </View>
        ) : (
          <Text style={styles.panelTitle} numberOfLines={1}>
            {title}
          </Text>
        )}
        {right || <IconButton icon="checkmark" onPress={onDone || onClose} label={t('common.done')} size={22} color={colors.accent} testID="panel-done" />}
      </View>
      {children}
    </View>
  );
}

/** Ad girme penceresi (yeniden adlandırma, yeni proje). */
export function PromptModal({ visible, title, initial = '', placeholder, onCancel, onSubmit, submitLabel }) {
  const { t, textAlign } = useI18n();
  const [value, setValue] = useState(initial);
  useEffect(() => {
    if (visible) setValue(initial);
  }, [visible, initial]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalBack}>
        <View style={styles.modalCard}>
          <Txt style={font.h2}>{title}</Txt>
          <TextInput
            testID="prompt-input"
            autoFocus
            value={value}
            onChangeText={setValue}
            placeholder={placeholder}
            placeholderTextColor={colors.textFaint}
            style={[styles.input, { textAlign }]}
            maxLength={80}
            onSubmitEditing={() => onSubmit(value.trim())}
          />
          <Row style={{ justifyContent: 'flex-end' }}>
            <Button kind="ghost" title={t('common.cancel')} onPress={onCancel} />
            <Button title={submitLabel || t('common.save')} onPress={() => onSubmit(value.trim())} testID="prompt-submit" />
          </Row>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Seçenek listesi (eylem menüsü). */
export function ActionSheet({ visible, title, actions, onClose }) {
  const { t, row } = useI18n();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBack} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          {title ? (
            <Txt dim center style={{ marginBottom: space.sm }} numberOfLines={1}>
              {title}
            </Txt>
          ) : null}
          {actions.map((a) => (
            <Pressable
              key={a.key}
              testID={`action-${a.key}`}
              onPress={() => {
                onClose();
                a.onPress();
              }}
              style={({ pressed }) => [styles.sheetItem, { flexDirection: row }, pressed && { backgroundColor: colors.surface3 }]}
            >
              <Icon name={a.icon} size={20} color={a.danger ? colors.danger : colors.text} />
              <Text style={[styles.sheetText, a.danger && { color: colors.danger }]}>{a.label}</Text>
            </Pressable>
          ))}
          <Button kind="secondary" title={t('common.cancel')} onPress={onClose} style={{ marginTop: space.sm }} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// --- Bildirim (toast) ---

const ToastContext = createContext(() => {});

export function ToastProvider({ children }) {
  const [msg, setMsg] = useState(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef(null);
  const show = useCallback(
    (text, kind = 'info') => {
      setMsg({ text, kind });
      clearTimeout(timer.current);
      Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
      timer.current = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => setMsg(null));
      }, 2600);
    },
    [opacity],
  );
  return (
    <ToastContext.Provider value={show}>
      {children}
      {msg ? (
        <Animated.View pointerEvents="none" style={[styles.toast, { opacity }, msg.kind === 'error' && { backgroundColor: colors.danger }]}>
          <Text style={styles.toastText} testID="toast">
            {msg.text}
          </Text>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

export function Loading({ label }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.accent} size="large" />
      {label ? <Text style={[styles.txt, { marginTop: space.md, color: colors.textDim }]}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  txt: { color: colors.text, ...font.body },
  iconBtn: { minWidth: HIT, minHeight: HIT, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md },
  iconBtnActive: { backgroundColor: colors.accentSoft },
  tool: { width: layout.toolW, minHeight: 56, alignItems: 'center', justifyContent: 'center', paddingVertical: 6, gap: 4 },
  toolLabel: { color: colors.textDim, fontSize: 11, lineHeight: 13, textAlign: 'center' },
  badge: { position: 'absolute', top: -2, right: -4, width: 7, height: 7, borderRadius: 4, backgroundColor: colors.accent2 },
  btn: { minHeight: HIT, paddingHorizontal: space.lg, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', gap: space.sm },
  btnText: { color: colors.text, fontWeight: '700', fontSize: 15 },
  chip: { paddingHorizontal: 14, height: 34, borderRadius: radius.pill, backgroundColor: colors.surface2, alignItems: 'center', gap: 6 },
  chipActive: { backgroundColor: colors.accent },
  chipText: { color: colors.textDim, fontSize: 13, fontWeight: '600' },
  sliderWrap: { flexDirection: 'row', alignItems: 'center', gap: space.md, direction: 'ltr' },
  slider: { flex: 1, height: 36, justifyContent: 'center' },
  sliderTrack: { height: 4, borderRadius: 2, backgroundColor: colors.surface3 },
  sliderFill: { position: 'absolute', height: 4, borderRadius: 2, backgroundColor: colors.accent },
  sliderThumb: { position: 'absolute', width: 22, height: 22, borderRadius: 11, backgroundColor: colors.text, borderWidth: 3, borderColor: colors.accent },
  sliderValue: { color: colors.textDim, fontSize: 13, minWidth: 48, textAlign: 'center', fontVariant: ['tabular-nums'] },
  panel: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingBottom: space.sm },
  panelHeader: { alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.xs, height: 48 },
  panelTitle: { color: colors.text, ...font.h2, flex: 1, textAlign: 'center' },
  panelTabs: { flex: 1, justifyContent: 'center', gap: space.lg },
  panelTab: { alignItems: 'center', justifyContent: 'center', minHeight: HIT, paddingHorizontal: space.xs },
  panelTabText: { color: colors.textDim, fontSize: 15, fontWeight: '600' },
  panelTabActive: { color: colors.text },
  panelTabBar: { height: 2, width: 20, borderRadius: 1, marginTop: 4, backgroundColor: 'transparent' },
  modalBack: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', padding: space.xl },
  modalCard: { backgroundColor: colors.surface2, borderRadius: radius.lg, padding: space.lg, gap: space.md },
  input: { backgroundColor: colors.bg, color: colors.text, borderRadius: radius.md, paddingHorizontal: space.md, height: 48, fontSize: 16 },
  sheetBack: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface2, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: space.lg, paddingBottom: space.xxl },
  sheetItem: { alignItems: 'center', gap: space.md, minHeight: 52, paddingHorizontal: space.sm, borderRadius: radius.md },
  sheetText: { color: colors.text, fontSize: 16 },
  toast: { position: 'absolute', bottom: 120, alignSelf: 'center', maxWidth: '88%', backgroundColor: colors.surface3, paddingHorizontal: space.lg, paddingVertical: space.md, borderRadius: radius.pill },
  toastText: { color: colors.text, fontSize: 14, textAlign: 'center' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
});
