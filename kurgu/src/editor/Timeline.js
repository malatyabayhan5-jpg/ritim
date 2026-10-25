// Çok katmanlı zaman çizelgesi. Oynatma kafası ortada sabittir; izler altından
// kayar (mobil editörlerdeki alışılmış düzen). Zaman her dilde soldan sağa akar:
// bu bileşen sağdan sola arayüzde de `direction: 'ltr'` ile çizilir.
//
// Uzun projelerde yalnızca görünen küçük resimler ve dalga biçimi parçaları
// çizilir (sanallaştırma); küçük resimler diskte önbelleğe alınır.

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Image, PanResponder, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';
import { assignAudioLanes, audioDuration, clipDuration, mainLayout, overlayDuration, totalDuration } from '../model/timeline';
import { sourceAt } from '../model/speed';
import { thumbnails, waveform } from '../engine/engine';
import { formatTimecode } from '../i18n/core';

export const RULER_H = 22;
export const MAIN_H = 54;
export const AUDIO_H = 30;
export const TEXT_H = 26;
export const OVERLAY_H = 30;
const HANDLE_W = 16;
const LONG_PRESS_MS = 380;
const TAP_SLOP = 8;
export const MIN_PX_PER_MS = 0.004; // ~4 px/sn
export const MAX_PX_PER_MS = 0.6; // 600 px/sn (kare düzeyi)

function laneOf(items, getStart, getDur) {
  const ends = [];
  const lanes = new Map();
  [...items].sort((a, b) => getStart(a) - getStart(b)).forEach((it) => {
    let lane = ends.findIndex((e) => e <= getStart(it) + 1);
    if (lane < 0) {
      lane = ends.length;
      ends.push(0);
    }
    ends[lane] = getStart(it) + getDur(it);
    lanes.set(it.id, lane);
  });
  return { lanes, count: ends.length };
}

/**
 * Dokunma / uzun basıp sürükleme / kırpma için ortak hareket işleyici.
 * Uzun basma tetiklenene kadar kaydırmayı ScrollView'a bırakır.
 */
function useDragGesture({ onTap, onDragStart, onDragMove, onDragEnd, enabled = true, longPress = true }) {
  const ref = useRef({});
  ref.current.handlers = { onTap, onDragStart, onDragMove, onDragEnd, enabled, longPress };
  return useMemo(() => {
    const s = { timer: null, dragging: false, moved: false };
    const clear = () => {
      clearTimeout(s.timer);
      s.timer = null;
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => ref.current.handlers.enabled,
      onMoveShouldSetPanResponder: () => false,
      onPanResponderTerminationRequest: () => !s.dragging,
      onPanResponderGrant: (e) => {
        s.dragging = false;
        s.moved = false;
        const h = ref.current.handlers;
        if (!h.longPress) {
          s.dragging = true;
          h.onDragStart?.(e.nativeEvent);
          return;
        }
        s.timer = setTimeout(() => {
          s.dragging = true;
          ref.current.handlers.onDragStart?.(e.nativeEvent);
        }, LONG_PRESS_MS);
      },
      onPanResponderMove: (e, g) => {
        if (Math.abs(g.dx) > TAP_SLOP || Math.abs(g.dy) > TAP_SLOP) s.moved = true;
        if (!s.dragging && s.moved) clear();
        if (s.dragging) ref.current.handlers.onDragMove?.(g.dx, g.dy);
      },
      onPanResponderRelease: (e, g) => {
        clear();
        if (s.dragging) ref.current.handlers.onDragEnd?.(g.dx, g.dy, false);
        else if (!s.moved) ref.current.handlers.onTap?.(e.nativeEvent);
        s.dragging = false;
      },
      onPanResponderTerminate: (e, g) => {
        clear();
        if (s.dragging) ref.current.handlers.onDragEnd?.(g.dx, g.dy, true);
        s.dragging = false;
      },
    });
  }, []);
}

export default function Timeline({
  project,
  playhead,
  pxPerMs,
  selection,
  onSeek,
  onSelect,
  onTrim,
  onMoveMain,
  onMoveAudio,
  onMoveText,
  onMoveEffect,
  onMoveOverlay,
  effectName,
  onZoom,
  onTransitionPress,
  onAddMedia,
  labels,
}) {
  const { width: screenW } = useWindowDimensions();
  const half = screenW / 2;
  const total = totalDuration(project);
  const contentW = Math.max(1, total * pxPerMs) + screenW;
  const scrollRef = useRef(null);
  const [scrollX, setScrollX] = useState(0);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const userScroll = useRef(false);
  const lastSetX = useRef(0);

  // Görünür pencere (yalnızca bu aralıktaki küçük resimler/dalga biçimleri çizilir) yalnızca
  // kaydırma yarım ekranı aşınca güncellenir: her karede durum değiştirmek tüm izleri yeniden
  // çizdiriyordu (gerçek cihazda kaydırma/oynatma takılması).
  const shownX = useRef(0);
  const updateWindow = (x, force = false) => {
    if (!force && Math.abs(x - shownX.current) < screenW / 2) return;
    shownX.current = x;
    setScrollX(x);
  };

  // Oynatma veya dışarıdan arama: kaydırma konumu oynatma kafasına doğrudan (React çizimi
  // olmadan) eşitlenir.
  const syncRef = useRef(null);
  syncRef.current = (ms, force) => {
    if (userScroll.current) return;
    const x = ms * pxPerMs;
    if (!force && Math.abs(x - lastSetX.current) < 0.5) return;
    lastSetX.current = x;
    scrollRef.current?.scrollTo({ x, animated: false });
    updateWindow(x, force);
  };
  useEffect(() => playhead.subscribe((ms) => syncRef.current(ms, false)), [playhead]);
  useEffect(() => {
    syncRef.current(playhead.get(), true);
  }, [playhead, pxPerMs]);

  const onScroll = (e) => {
    const x = e.nativeEvent.contentOffset.x;
    if (userScroll.current) {
      lastSetX.current = x;
      onSeek(Math.max(0, Math.min(total, x / pxPerMs)), true);
    }
    updateWindow(x);
  };
  const endScroll = () => {
    userScroll.current = false;
    onSeek(Math.max(0, Math.min(total, lastSetX.current / pxPerMs)), false);
  };

  // İki parmakla yakınlaştırma
  const pinch = useRef({ dist: 0, px: pxPerMs });
  const zoomRef = useRef({ pxPerMs, onZoom });
  zoomRef.current = { pxPerMs, onZoom };
  const pinchResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponderCapture: (e) => e.nativeEvent.touches.length === 2,
        onMoveShouldSetPanResponderCapture: (e) => e.nativeEvent.touches.length === 2,
        onPanResponderGrant: (e) => {
          const [a, b] = e.nativeEvent.touches;
          pinch.current = { dist: a && b ? Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY) : 0, px: zoomRef.current.pxPerMs };
        },
        onPanResponderMove: (e) => {
          const [a, b] = e.nativeEvent.touches;
          if (!a || !b || !pinch.current.dist) return;
          const d = Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
          const next = Math.max(MIN_PX_PER_MS, Math.min(MAX_PX_PER_MS, (pinch.current.px * d) / pinch.current.dist));
          zoomRef.current.onZoom(next);
        },
        onPanResponderTerminationRequest: () => true,
      }),
    [],
  );

  const layout = mainLayout(project);
  const audioLanes = useMemo(() => assignAudioLanes(project.audio), [project.audio]);
  const textLanes = useMemo(() => laneOf(project.texts, (t) => t.start, (t) => t.duration), [project.texts]);
  const effectLayers = project.effectLayers || [];
  const fxLanes = useMemo(() => laneOf(effectLayers, (e) => e.start, (e) => e.duration), [effectLayers]);
  const visible = useMemo(() => ({ from: scrollX - screenW, to: scrollX + screenW * 2 }), [scrollX, screenW]);
  const lockScroll = (locked) => setScrollEnabled(!locked);

  // Üst katman şeritleri ana izin üstünde; en üst şerit en üstte çizilir (önizlemedeki sırayla aynı).
  const overlays = project.overlays || [];
  const ovLaneCount = overlays.length ? Math.max(...overlays.map((o) => o.lane)) + 1 : 0;
  const ovH = ovLaneCount * (OVERLAY_H + 4);
  const mainTop = RULER_H + 4 + ovH;
  const textTop = mainTop + MAIN_H + 8 + audioLanes.length * (AUDIO_H + 4);
  const fxTop = textTop + textLanes.count * (TEXT_H + 4);
  const tracksH = fxTop + fxLanes.count * (TEXT_H + 4) + 8;

  return (
    <View style={styles.wrap} {...pinchResponder.panHandlers}>
      {/* Şerit sayısı alanı aşınca dikey kaydırma; zaman ekseni yatay kaydırmada kalır. */}
      <ScrollView
        nestedScrollEnabled
        scrollEnabled={scrollEnabled}
        showsVerticalScrollIndicator={false}
        style={{ direction: 'ltr' }}
        contentContainerStyle={{ height: Math.max(tracksH, 120) }}
        testID="timeline-vscroll"
      >
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          scrollEnabled={scrollEnabled}
          scrollEventThrottle={16}
          onScroll={onScroll}
          onScrollBeginDrag={() => {
            userScroll.current = true;
          }}
          onScrollEndDrag={(e) => {
            if (Math.abs(e.nativeEvent.velocity?.x || 0) < 0.05) endScroll();
          }}
          onMomentumScrollEnd={endScroll}
          style={{ direction: 'ltr' }}
          contentContainerStyle={{ width: contentW, height: Math.max(tracksH, 120) }}
          testID="timeline-scroll"
        >
          <Ruler total={total} pxPerMs={pxPerMs} left={half} visible={visible} markers={project.markers} />

          {/* Ana iz */}
          {/* Üst katmanlar */}
          {overlays.map((o) => (
            <FreeItem
              key={o.id}
              kind="overlay"
              item={o}
              top={RULER_H + 4 + (ovLaneCount - 1 - o.lane) * (OVERLAY_H + 4)}
              height={OVERLAY_H}
              left={half}
              start={o.start}
              duration={overlayDuration(o)}
              pxPerMs={pxPerMs}
              color={colors.overlayLayer || colors.accent}
              label={project.media[o.mediaId]?.name || ''}
              icon={o.kind === 'image' ? 'image-outline' : 'videocam-outline'}
              visible={visible}
              selected={selection?.type === 'overlay' && selection.id === o.id}
              onSelect={() => onSelect({ type: 'overlay', id: o.id })}
              onTrim={onTrim}
              onMove={(newStart) => onMoveOverlay(o.id, newStart)}
              lockScroll={lockScroll}
            />
          ))}

          <View style={[styles.mainTrack, { left: half, top: mainTop }]}>
            {layout.map(({ clip, index, start }) => (
              <MainClip
                key={clip.id}
                clip={clip}
                index={index}
                media={project.media[clip.mediaId]}
                x={start * pxPerMs}
                pxPerMs={pxPerMs}
                visible={visible}
                left={half}
                selected={selection?.type === 'main' && selection.id === clip.id}
                onSelect={() => onSelect({ type: 'main', id: clip.id })}
                onTrim={onTrim}
                onReorder={(dxMs) => {
                  const center = start + clipDuration(clip) / 2 + dxMs;
                  const others = layout.filter((l) => l.clip.id !== clip.id);
                  const to = others.filter((l) => (l.start + l.end) / 2 < center).length;
                  if (to !== index) onMoveMain(index, to);
                }}
                lockScroll={lockScroll}
                labels={labels}
              />
            ))}
            {layout.slice(1).map(({ clip, start }) => (
              <Pressable
                key={`tr_${clip.id}`}
                testID={`transition-${clip.id}`}
                onPress={() => onTransitionPress(clip.id)}
                hitSlop={8}
                style={[styles.transitionBtn, { left: start * pxPerMs - 11 }, clip.transition?.type !== 'none' && styles.transitionOn]}
              >
                <Ionicons name={clip.transition?.type !== 'none' ? 'git-compare' : 'remove'} size={12} color={clip.transition?.type !== 'none' ? colors.bg : colors.text} />
              </Pressable>
            ))}
          </View>

          {/* Ses şeritleri */}
          {audioLanes.map((lane, li) =>
            lane.map((a) => (
              <FreeItem
                key={a.id}
                kind="audio"
                item={a}
                top={mainTop + MAIN_H + 8 + li * (AUDIO_H + 4)}
                height={AUDIO_H}
                left={half}
                start={a.start}
                duration={audioDuration(a)}
                pxPerMs={pxPerMs}
                color={a.role === 'extracted' ? colors.audio : a.role === 'voice' ? colors.voice : colors.audioMusic}
                label={project.media[a.mediaId]?.name || ''}
                media={project.media[a.mediaId]}
                visible={visible}
                selected={selection?.type === 'audio' && selection.id === a.id}
                onSelect={() => onSelect({ type: 'audio', id: a.id })}
                onTrim={onTrim}
                onMove={(newStart) => onMoveAudio(a.id, newStart)}
                lockScroll={lockScroll}
              />
            )),
          )}

          {/* Metin şeritleri */}
          {project.texts.map((tx) => (
            <FreeItem
              key={tx.id}
              kind="text"
              item={tx}
              top={textTop + (textLanes.lanes.get(tx.id) || 0) * (TEXT_H + 4)}
              height={TEXT_H}
              left={half}
              start={tx.start}
              duration={tx.duration}
              pxPerMs={pxPerMs}
              color={colors.text2}
              label={tx.text}
              icon="text"
              visible={visible}
              selected={selection?.type === 'text' && selection.id === tx.id}
              onSelect={() => onSelect({ type: 'text', id: tx.id })}
              onTrim={onTrim}
              onMove={(newStart) => onMoveText(tx.id, newStart)}
              lockScroll={lockScroll}
            />
          ))}

          {/* Efekt katmanları */}
          {effectLayers.map((fx) => (
            <FreeItem
              key={fx.id}
              kind="effect"
              item={fx}
              top={fxTop + (fxLanes.lanes.get(fx.id) || 0) * (TEXT_H + 4)}
              height={TEXT_H}
              left={half}
              start={fx.start}
              duration={fx.duration}
              pxPerMs={pxPerMs}
              color={colors.effect}
              label={effectName ? effectName(fx.effectId) : fx.effectId}
              icon="sparkles"
              visible={visible}
              selected={selection?.type === 'effect' && selection.id === fx.id}
              onSelect={() => onSelect({ type: 'effect', id: fx.id })}
              onTrim={onTrim}
              onMove={(newStart) => onMoveEffect(fx.id, newStart)}
              lockScroll={lockScroll}
            />
          ))}
        </ScrollView>
      </ScrollView>

      {/* Sabit oynatma kafası */}
      <View pointerEvents="none" style={[styles.playhead, { left: half - 1 }]} />

      <Pressable testID="add-media" onPress={onAddMedia} style={[styles.addBtn, { top: mainTop + (MAIN_H - 40) / 2 }]} accessibilityLabel={labels.addMedia}>
        <Ionicons name="add" size={26} color={colors.bg} />
      </Pressable>
    </View>
  );
}

const Ruler = memo(function Ruler({ total, pxPerMs, left, visible, markers }) {
  // Etiketler arası en az ~70 px olacak şekilde adım seç
  const steps = [100, 250, 500, 1000, 2000, 5000, 10000, 30000, 60000, 300000];
  const step = steps.find((s) => s * pxPerMs >= 70) || 600000;
  const from = Math.max(0, Math.floor((visible.from - left) / pxPerMs / step) * step);
  const to = Math.min(total + step, (visible.to - left) / pxPerMs);
  const ticks = [];
  for (let t = from; t <= to; t += step) ticks.push(t);
  return (
    <View style={[styles.ruler, { left: 0, right: 0 }]} pointerEvents="none">
      {ticks.map((t) => (
        <View key={t} style={[styles.tick, { left: left + t * pxPerMs }]}>
          <Text style={styles.tickText}>{formatTimecode(t, { tenths: step < 1000 })}</Text>
        </View>
      ))}
      {ticks.map((t) => (
        <View key={`h${t}`} style={[styles.halfTick, { left: left + (t + step / 2) * pxPerMs }]} />
      ))}
      {markers.map((m) => (
        <View key={m.id} style={[styles.marker, { left: left + m.time * pxPerMs - 5 }]} />
      ))}
    </View>
  );
});

function TrimHandle({ side, onTrim, kind, id, pxPerMs, lockScroll }) {
  const gesture = useDragGesture({
    longPress: false,
    onDragStart: () => {
      lockScroll(true);
      onTrim(kind, id, side, 0, 'start');
    },
    onDragMove: (dx) => onTrim(kind, id, side, dx / pxPerMs, 'move'),
    onDragEnd: (dx) => {
      lockScroll(false);
      onTrim(kind, id, side, dx / pxPerMs, 'end');
    },
  });
  return (
    <View
      {...gesture.panHandlers}
      testID={`trim-${side}-${id}`}
      hitSlop={{ left: 10, right: 10, top: 6, bottom: 6 }}
      style={[styles.handle, side === 'start' ? { left: -HANDLE_W } : { right: -HANDLE_W }]}
    >
      <View style={styles.handleBar} />
    </View>
  );
}

const MainClip = memo(function MainClip({ clip, index, media, x, pxPerMs, visible, left, selected, onSelect, onTrim, onReorder, lockScroll, labels }) {
  const dur = clipDuration(clip);
  const w = Math.max(2, dur * pxPerMs);
  const [drag, setDrag] = useState(null);
  const gesture = useDragGesture({
    onTap: onSelect,
    onDragStart: () => {
      lockScroll(true);
      setDrag(0);
    },
    onDragMove: (dx) => setDrag(dx),
    onDragEnd: (dx, dy, cancelled) => {
      lockScroll(false);
      setDrag(null);
      if (!cancelled) onReorder(dx / pxPerMs);
    },
  });

  const tileW = Math.round(MAIN_H * Math.min(1.6, Math.max(0.6, (media?.width || 16) / (media?.height || 9))));
  const absStart = left + x;
  const firstTile = Math.max(0, Math.floor((visible.from - absStart) / tileW));
  const lastTile = Math.min(Math.ceil(w / tileW) - 1, Math.floor((visible.to - absStart) / tileW));
  const tiles = [];
  for (let i = firstTile; i <= lastTile; i++) tiles.push(i);
  // Küçük resim zamanları 500 ms'ye yuvarlanır: yakınlaştırmada önbellek tekrar kullanılır.
  const times = tiles.map((i) => {
    const local = Math.min(dur - 1, (i * tileW + tileW / 2) / pxPerMs);
    const src = clip.kind === 'image' ? 0 : sourceAt(clip, local);
    return Math.round(src / 500) * 500;
  });
  const uris = useThumbs(media, times);

  return (
    <View
      testID={`clip-${index}`}
      {...gesture.panHandlers}
      style={[
        styles.clip,
        { left: x, width: w },
        selected && styles.clipSelected,
        drag !== null && { transform: [{ translateX: drag }, { scale: 1.04 }], zIndex: 10, opacity: 0.9 },
      ]}
    >
      <View style={styles.clipInner}>
        {tiles.map((i, k) =>
          uris[k] ? (
            <Image key={i} source={{ uri: uris[k] }} style={[styles.tile, { left: i * tileW, width: tileW }]} resizeMode="cover" fadeDuration={0} />
          ) : (
            <View key={i} style={[styles.tile, styles.tileEmpty, { left: i * tileW, width: tileW }]} />
          ),
        )}
        {w > 46 ? (
          <View style={styles.clipBadge}>
            <Text style={styles.clipBadgeText}>{formatTimecode(dur)}</Text>
          </View>
        ) : null}
        {(clip.speed !== 1 || clip.speedCurve) && w > 80 ? (
          <View style={[styles.clipBadge, { left: undefined, right: 4 }]}>
            <Text style={styles.clipBadgeText}>{clip.speedCurve ? '∿' : `${clip.speed}x`}</Text>
          </View>
        ) : null}
        {clip.muted ? <Ionicons name="volume-mute" size={12} color={colors.text} style={styles.mutedIcon} /> : null}
        {media?.missing ? (
          <View style={styles.missing}>
            <Ionicons name="alert-circle" size={16} color={colors.warning} />
            <Text style={styles.missingText} numberOfLines={1}>{labels.missing}</Text>
          </View>
        ) : null}
      </View>
      {selected ? (
        <>
          <TrimHandle side="start" kind="main" id={clip.id} onTrim={onTrim} pxPerMs={pxPerMs} lockScroll={lockScroll} />
          <TrimHandle side="end" kind="main" id={clip.id} onTrim={onTrim} pxPerMs={pxPerMs} lockScroll={lockScroll} />
        </>
      ) : null}
    </View>
  );
});

function useThumbs(media, times) {
  const key = times.join(',');
  const [state, setState] = useState({ key: '', uris: [] });
  useEffect(() => {
    let alive = true;
    if (!media || media.missing || !times.length) return undefined;
    thumbnails(media, times, 96).then((uris) => {
      if (alive) setState({ key, uris });
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media?.id, key]);
  return state.key === key ? state.uris : times.map(() => null);
}

const FreeItem = memo(function FreeItem({ kind, item, top, height, left, start, duration, pxPerMs, color, label, icon, media, visible, selected, onSelect, onTrim, onMove, lockScroll }) {
  const [drag, setDrag] = useState(null);
  const gesture = useDragGesture({
    onTap: onSelect,
    onDragStart: () => {
      lockScroll(true);
      setDrag(0);
    },
    onDragMove: (dx) => setDrag(dx),
    onDragEnd: (dx, dy, cancelled) => {
      lockScroll(false);
      setDrag(null);
      if (!cancelled) onMove(Math.max(0, start + dx / pxPerMs));
    },
  });
  const x = left + start * pxPerMs;
  const w = Math.max(4, duration * pxPerMs);
  return (
    <View
      testID={`${kind}-item-${item.id}`}
      {...gesture.panHandlers}
      style={[
        styles.free,
        { top, height, left: x, width: w, backgroundColor: color },
        selected && styles.clipSelected,
        drag !== null && { transform: [{ translateX: drag }], zIndex: 10, opacity: 0.85 },
      ]}
    >
      {kind === 'audio' ? <Wave media={media} item={item} width={w} height={height} pxPerMs={pxPerMs} absLeft={x} visible={visible} /> : null}
      <View style={styles.freeLabel}>
        {icon ? <Ionicons name={icon} size={11} color={colors.text} /> : <Ionicons name="musical-note" size={11} color={colors.text} />}
        <Text numberOfLines={1} style={styles.freeText}>
          {label}
        </Text>
      </View>
      {selected ? (
        <>
          <TrimHandle side="start" kind={kind} id={item.id} onTrim={onTrim} pxPerMs={pxPerMs} lockScroll={lockScroll} />
          <TrimHandle side="end" kind={kind} id={item.id} onTrim={onTrim} pxPerMs={pxPerMs} lockScroll={lockScroll} />
        </>
      ) : null}
    </View>
  );
});

/** Dalga biçimi: yalnızca görünen kısım tek bir SVG yolu olarak çizilir. */
function Wave({ media, item, width, height, pxPerMs, absLeft, visible }) {
  const [peaks, setPeaks] = useState(null);
  useEffect(() => {
    let alive = true;
    if (media && !media.missing) waveform(media).then((p) => alive && setPeaks(p));
    return () => {
      alive = false;
    };
  }, [media?.id]);
  if (!peaks || !peaks.length) return null;
  const from = Math.max(0, visible.from - absLeft);
  const to = Math.min(width, visible.to - absLeft);
  if (to <= from) return null;
  const segW = to - from;
  const step = 2; // px
  const mid = height / 2;
  let d = '';
  for (let px = 0; px <= segW; px += step) {
    const localMs = (from + px) / pxPerMs;
    const srcMs = item.srcIn + localMs * (item.speed || 1);
    const p = peaks[Math.min(peaks.length - 1, Math.floor(srcMs / 50))] || 0;
    const h = Math.max(0.5, p * (height - 6) * 0.5 * Math.min(1, item.volume ?? 1));
    d += `M${px.toFixed(1)} ${(mid - h).toFixed(1)}V${(mid + h).toFixed(1)}`;
  }
  return (
    <Svg width={segW} height={height} style={{ position: 'absolute', left: from, top: 0 }} pointerEvents="none">
      <Path d={d} stroke="rgba(255,255,255,0.55)" strokeWidth={1.2} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, direction: 'ltr' },
  ruler: { position: 'absolute', top: 0, height: RULER_H },
  tick: { position: 'absolute', top: 0, height: RULER_H, borderLeftWidth: 1, borderLeftColor: colors.textFaint, paddingLeft: 3 },
  tickText: { color: colors.textFaint, fontSize: 9, fontVariant: ['tabular-nums'] },
  halfTick: { position: 'absolute', top: RULER_H - 6, height: 6, width: 1, backgroundColor: colors.border },
  marker: { position: 'absolute', top: 0, width: 10, height: 10, backgroundColor: colors.marker, transform: [{ rotate: '45deg' }], borderRadius: 2 },
  mainTrack: { position: 'absolute', height: MAIN_H, right: 0 },
  clip: { position: 'absolute', top: 0, height: MAIN_H, borderRadius: 6, backgroundColor: colors.clip, borderWidth: 2, borderColor: 'transparent' },
  clipInner: { ...StyleSheet.absoluteFillObject, borderRadius: 4, overflow: 'hidden' },
  clipSelected: { borderColor: colors.clipSelected, zIndex: 5 },
  tile: { position: 'absolute', top: 0, bottom: 0 },
  tileEmpty: { backgroundColor: colors.surface3, borderRightWidth: 1, borderRightColor: colors.clip },
  clipBadge: { position: 'absolute', left: 4, bottom: 3, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 3, paddingHorizontal: 3 },
  clipBadgeText: { color: colors.text, fontSize: 9, fontWeight: '600', fontVariant: ['tabular-nums'] },
  mutedIcon: { position: 'absolute', top: 3, left: 4 },
  missing: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 4, paddingHorizontal: 4 },
  missingText: { color: colors.warning, fontSize: 10, fontWeight: '700' },
  handle: { position: 'absolute', top: -2, bottom: -2, width: HANDLE_W, backgroundColor: colors.clipSelected, alignItems: 'center', justifyContent: 'center', borderRadius: 4 },
  handleBar: { width: 3, height: 16, borderRadius: 2, backgroundColor: colors.bg },
  transitionBtn: { position: 'absolute', top: (MAIN_H - 22) / 2, width: 22, height: 22, borderRadius: 5, backgroundColor: colors.surface3, borderWidth: 1, borderColor: colors.bg, alignItems: 'center', justifyContent: 'center', zIndex: 8 },
  transitionOn: { backgroundColor: colors.accent2 },
  free: { position: 'absolute', borderRadius: 5, borderWidth: 2, borderColor: 'transparent', justifyContent: 'center' },
  freeLabel: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 5 },
  freeText: { color: colors.text, fontSize: 10, fontWeight: '600', flexShrink: 1 },
  playhead: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: colors.playhead, borderRadius: 1 },
  addBtn: { position: 'absolute', right: 10, width: 40, height: 40, borderRadius: 8, backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center' },
});
