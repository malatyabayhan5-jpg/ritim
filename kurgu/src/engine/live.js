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
  const structure = JSON.stringify({ ...spec, main, audioLanes, effectLayers });
  return { structure, live };
}

function liveEffect(e, live) {
  live[`fx:${e.key}`] = [e.amount, ...e.params];
  return { ...e, amount: LIVE, params: LIVE };
}
