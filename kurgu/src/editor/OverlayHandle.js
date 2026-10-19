// Önizleme üzerinde seçili üst katmanın çerçevesi. Tek parmakla taşınır, iki
// parmakla ölçeklenir ve döndürülür. Değerler sürüklerken gönderilir: yerel
// motor bunları canlı parametre olarak alır (önizleme yeniden kurulmaz).
// Çerçeve ölçüleri _layer.glsl ile aynı hesaptır (kanvasa sığdır × ölçek).

import { useMemo, useRef } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';
import { colors } from '../theme';

/** Katmanın kanvas içindeki kutusu (piksel): genişlik, yükseklik, merkez. */
export function overlayBox(o, media, boxW, boxH, v) {
  const crop = o.crop || { x0: 0, y0: 0, x1: 1, y1: 1 };
  const mw = (media?.width || 16) * Math.max(0.0001, crop.x1 - crop.x0);
  const mh = (media?.height || 9) * Math.max(0.0001, crop.y1 - crop.y0);
  const src = mw / mh;
  const A = boxW / Math.max(1, boxH);
  let w;
  let h;
  if (src > A) {
    w = boxW;
    h = boxW / src;
  } else {
    h = boxH;
    w = boxH * src;
  }
  return { w: w * v.scale, h: h * v.scale, cx: ((v.x + 1) / 2) * boxW, cy: ((1 - v.y) / 2) * boxH };
}

export default function OverlayHandle({ item, media, values, boxW, boxH, visible, onChange, onEnd }) {
  const ref = useRef({});
  ref.current = { values, boxW, boxH, onChange, onEnd };

  const responder = useMemo(() => {
    const s = { start: null, pinch: null, moved: false };
    const pinchInfo = ([a, b]) => ({ d: Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY), angle: (Math.atan2(b.pageY - a.pageY, b.pageX - a.pageX) * 180) / Math.PI });
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        s.start = { ...ref.current.values };
        s.pinch = null;
        s.moved = false;
      },
      onPanResponderMove: (e, g) => {
        const { boxW: W, boxH: H } = ref.current;
        const touches = e.nativeEvent.touches;
        let next;
        if (touches.length >= 2) {
          const p = pinchInfo(touches);
          if (!s.pinch) s.pinch = p;
          next = {
            ...s.start,
            scale: clamp(s.start.scale * (p.d / Math.max(1, s.pinch.d)), 0.05, 4),
            rotation: Math.round(normAngle(s.start.rotation + (p.angle - s.pinch.angle))),
          };
        } else {
          if (s.pinch) return;
          next = { ...s.start, x: clamp(s.start.x + (g.dx / W) * 2, -1.5, 1.5), y: clamp(s.start.y - (g.dy / H) * 2, -1.5, 1.5) };
          if (Math.abs(next.x) < 0.03) next.x = 0;
          if (Math.abs(next.y) < 0.03) next.y = 0;
        }
        if (Math.abs(g.dx) + Math.abs(g.dy) > 3 || touches.length >= 2) s.moved = true;
        if (s.moved) ref.current.onChange(round(next));
      },
      onPanResponderRelease: () => ref.current.onEnd?.(),
      onPanResponderTerminate: () => ref.current.onEnd?.(),
    });
  }, []);

  if (!visible) return null;
  const b = overlayBox(item, media, boxW, boxH, values);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <View
        {...responder.panHandlers}
        testID="overlay-handle"
        style={[
          styles.frame,
          { left: b.cx - b.w / 2, top: b.cy - b.h / 2, width: Math.max(24, b.w), height: Math.max(24, b.h), transform: [{ rotate: `${values.rotation}deg` }] },
        ]}
      />
    </View>
  );
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const normAngle = (a) => ((((a + 180) % 360) + 360) % 360) - 180;
const round = (v) => ({ x: Math.round(v.x * 1000) / 1000, y: Math.round(v.y * 1000) / 1000, scale: Math.round(v.scale * 1000) / 1000, rotation: v.rotation });

const styles = StyleSheet.create({
  frame: { position: 'absolute', borderWidth: 1.5, borderColor: colors.accent, borderStyle: 'dashed', borderRadius: 2 },
});
