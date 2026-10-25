// Canlı önizleme parametreleri. Kaydırıcı sürüklenirken (efekt yoğunluğu/
// parametreleri, filtre ve renk ayarları, LUT yoğunluğu, ses düzeyi ve
// açılma/kapanma) önizleme oynatıcısını yeniden kurmak yüzlerce milisaniye
// sürer ve görüntü titrer. Bu değerler "canlı" anahtarlarla ayrı gönderilir;
// yerel motor yalnızca bunları günceller ve mevcut kareyi yeniden çizer.
// Yapı (klipler, efekt türleri, sıra, süreler) değişince tam yeniden kurulum yapılır.
//
// Anahtarlar:
//   fx:<anahtar>   [yoğunluk, p0..p7]
//   cm:<klip>      4x4 renk matrisi (16) — filtre + renk ayarları
//   lut:<klip>     [yoğunluk]
//   vol:<öğe>      [ses düzeyi, açılma ms, kapanma ms]
//   ly:<katman>    [x, y, ölçek, döndürme, opaklık, maske cx, cy, açı, yarı gen., yarı yük.,
//                   yumuşaklık, köşe, chroma tolerans, kenar, taşma] (LayerFx.kt)
//   tx:<metin>     [x, y, döndürme, opaklık] (TextLayer.kt)
//   tf:<klip>      [ölçek, konum x, konum y, açı] (ana iz; Fx.kt KeyedPlacement)

const LIVE = 'L';

export function splitLive(spec) {
  const live = {};
  const main = spec.main.map((m) => {
    const out = { ...m };
    if (m.colorMatrix) {
      live[`cm:${m.key}`] = m.colorMatrix;
      out.colorMatrix = LIVE;
    }
    live[`vol:${m.key}`] = [m.volume, m.fadeInMs, m.fadeOutMs];
    // Ana klip yerleşimi (ölçek, konum, açı): dönüştürme kaydırıcıları yeniden kurulum yapmaz
    live[`tf:${m.key}`] = [m.scale, m.offsetX, m.offsetY, m.angle];
    out.scale = LIVE;
    out.offsetX = LIVE;
    out.offsetY = LIVE;
    out.angle = LIVE;
    out.volume = LIVE;
    out.fadeInMs = LIVE;
    out.fadeOutMs = LIVE;
    if (m.lut) {
      live[`lut:${m.key}`] = [m.lut.amount];
      out.lut = { ...m.lut, amount: LIVE };
    }
    out.effects = m.effects.map((e) => liveEffect(e, live));
    return out;
  });
  const audioLanes = spec.audioLanes.map((lane) =>
    lane.map((a) => {
      live[`vol:${a.key}`] = [a.volume, a.fadeInMs, a.fadeOutMs];
      return { ...a, volume: LIVE, fadeInMs: LIVE, fadeOutMs: LIVE };
    }),
  );
  const effectLayers = spec.effectLayers.map((e) => liveEffect(e, live));
  const layers = (spec.layers || []).map((lane) =>
    lane.map((l) => {
      const out = { ...l };
      if (l.colorMatrix) {
        live[`cm:${l.key}`] = l.colorMatrix;
        out.colorMatrix = LIVE;
      }
      const m = l.mask;
      const c = l.chroma;
      live[`ly:${l.key}`] = [...l.xf, l.opacity, m[1], m[2], m[3], m[4], m[5], m[6], m[7], c[4], c[5], c[6]];
      // Maske/chroma türü ve renk yapıdır (shader dalı); sayısal değerler canlıdır.
      out.xf = LIVE;
      out.opacity = LIVE;
      out.mask = [m[0], LIVE, LIVE, LIVE, LIVE, LIVE, LIVE, LIVE, m[8]];
      out.chroma = [c[0], c[1], c[2], c[3], LIVE, LIVE, LIVE];
      // Geçiş kopyaları ana klibin efekt anahtarlarını ve LUT yoğunluğunu paylaşır
      if (l.effects) out.effects = l.effects.map((e) => liveEffect(e, live));
      if (l.lut) {
        live[`lut:${l.key}`] = [l.lut.amount];
        out.lut = { ...l.lut, amount: LIVE };
      }
      return out;
    }),
  );
  // Karışım modlu görsel katmanları (BlendLayerFx): aynı yerleşim değerleri canlıdır
  const blendLayers = (spec.blendLayers || []).map((l) => {
    const m = l.mask;
    const c = l.chroma;
    live[`ly:${l.key}`] = [...l.xf, l.opacity, m[1], m[2], m[3], m[4], m[5], m[6], m[7], c[4], c[5], c[6]];
    const cm = l.colorMatrix ? ((live[`cm:${l.key}`] = l.colorMatrix), LIVE) : null;
    return { ...l, colorMatrix: cm, xf: LIVE, opacity: LIVE, mask: [m[0], LIVE, LIVE, LIVE, LIVE, LIVE, LIVE, LIVE, m[8]], chroma: [c[0], c[1], c[2], c[3], LIVE, LIVE, LIVE] };
  });
  // Metin konumu, döndürme ve opaklık canlıdır (önizlemede sürükleme kompozisyonu yeniden
  // kurmaz). Ölçek satır kırma genişliğini değiştirdiğinden yapıdır; anahtar kare izi olan
  // özellikler izde (yapı) taşınır.
  const texts = (spec.texts || []).map((t) => {
    if (!t.key) return t;
    live[`tx:${t.key}`] = [t.x, t.y, t.rotation, t.opacity];
    return { ...t, x: LIVE, y: LIVE, rotation: LIVE, opacity: LIVE };
  });
  const structure = JSON.stringify({ ...spec, main, audioLanes, effectLayers, layers, blendLayers, texts });
  return { structure, live };
}

function liveEffect(e, live) {
  live[`fx:${e.key}`] = [e.amount, ...e.params];
  return { ...e, amount: LIVE, params: LIVE };
}
