// Önizleme üzerinde seçili metin katmanının çerçevesi. Tek parmakla taşınır,
// iki parmakla ölçeklenir ve döndürülür; çift dokunuş metni düzenlemeyi açar.
// Asıl metin yerel motorda çizilir; bu çerçeve aynı ölçülerle hizalanır.

import { useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

const FONT_FAMILY = {
  sans: 'sans-serif',
  display: 'sans-serif-black',
  condensed: 'sans-serif-condensed',
  light: 'sans-serif-light',
  serif: 'serif',
  mono: 'monospace',
  casual: 'casual',
  cursive: 'cursive',
};

export default function TextHandle({ item, boxW, boxH, visible, onChange, onEdit }) {
  const [live, setLive] = useState(null); // sürükleme sırasında anlık değerler
  const [size, setSize] = useState({ w: 0, h: 0 });
  const ref = useRef({});
  ref.current = { item, boxW, boxH, onChange, onEdit };

  const responder = useMemo(() => {
    const s = { start: null, pinch: null, lastTap: 0, moved: false };
    const pinchInfo = (touches) => {
      const [a, b] = touches;
      return { d: Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY), angle: (Math.atan2(b.pageY - a.pageY, b.pageX - a.pageX) * 180) / Math.PI };
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        const it = ref.current.item;
        s.start = { x: it.x, y: it.y, scale: it.scale, rotation: it.rotation };
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
            x: s.start.x,
            y: s.start.y,
            scale: clamp(s.start.scale * (p.d / Math.max(1, s.pinch.d)), 0.2, 6),
            rotation: Math.round(normAngle(s.start.rotation + (p.angle - s.pinch.angle))),
          };
        } else {
          if (s.pinch) return; // iki parmaktan birine düşüldü: sıçramayı önle
          next = {
            x: clamp(s.start.x + (g.dx / W) * 2, -1.2, 1.2),
            y: clamp(s.start.y - (g.dy / H) * 2, -1.2, 1.2),
            scale: s.start.scale,
            rotation: s.start.rotation,
          };
          // Merkeze yapıştır
          if (Math.abs(next.x) < 0.03) next.x = 0;
          if (Math.abs(next.y) < 0.03) next.y = 0;
        }
        if (Math.abs(g.dx) + Math.abs(g.dy) > 4 || touches.length >= 2) s.moved = true;
        setLive(next);
      },
      onPanResponderRelease: () => {
        const now = Date.now();
        if (!s.moved) {
          if (now - s.lastTap < 300) ref.current.onEdit();
          s.lastTap = now;
          setLive(null);
          return;
        }
        setLive((cur) => {
          if (cur) ref.current.onChange(roundAll(cur), null);
          return null;
        });
      },
      onPanResponderTerminate: () => setLive(null),
    });
  }, []);

  if (!visible) return null;
  const v = live || item;
  const st = item.style;
  const fontSize = Math.max(6, st.size * boxH);
  const cx = ((v.x + 1) / 2) * boxW;
  const cy = ((1 - v.y) / 2) * boxH;
  const pad = fontSize * (st.background && !st.background.endsWith('00') ? st.boxPad ?? 0.35 : 0.1);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <View
        {...responder.panHandlers}
        testID="text-handle"
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          if (Math.abs(width - size.w) > 0.5 || Math.abs(height - size.h) > 0.5) setSize({ w: width, h: height });
        }}
        style={[
          styles.frame,
          {
            left: cx - size.w / 2,
            top: cy - size.h / 2,
            padding: pad,
            maxWidth: (boxW * 0.92) / Math.max(0.2, item.scale) + pad * 2,
            transform: [{ scale: v.scale }, { rotate: `${v.rotation}deg` }],
          },
        ]}
      >
        {/* Ölçü için görünmez metin: yerel çizimle aynı yazı tipi ve boyut */}
        <Text
          style={{
            color: live ? 'rgba(255,255,255,0.35)' : 'transparent',
            fontSize,
            fontFamily: FONT_FAMILY[st.font] || 'sans-serif',
            fontWeight: st.bold ? '700' : '400',
            fontStyle: st.italic ? 'italic' : 'normal',
            letterSpacing: (st.letterSpacing || 0) * fontSize,
            lineHeight: fontSize * (st.lineHeight || 1.2),
            textAlign: st.align,
          }}
        >
          {item.text || ' '}
        </Text>
      </View>
    </View>
  );
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const normAngle = (a) => ((((a + 180) % 360) + 360) % 360) - 180;
const roundAll = (v) => ({ x: Math.round(v.x * 1000) / 1000, y: Math.round(v.y * 1000) / 1000, scale: Math.round(v.scale * 100) / 100, rotation: v.rotation });

const styles = StyleSheet.create({
  frame: { position: 'absolute', borderWidth: 1.5, borderColor: colors.text, borderStyle: 'dashed', borderRadius: 4 },
});
