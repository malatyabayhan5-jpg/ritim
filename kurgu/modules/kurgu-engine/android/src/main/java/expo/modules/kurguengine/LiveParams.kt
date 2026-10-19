package expo.modules.kurguengine

import java.util.concurrent.ConcurrentHashMap

/**
 * Önizlemede canlı güncellenen sayısal parametreler (src/engine/live.js ile aynı
 * anahtarlar). Kaydırıcı sürüklenirken kompozisyon yeniden kurulmaz; efektler,
 * renk matrisi, LUT ve ses düzeyi değerlerini her karede buradan okur.
 * Dışa aktarma bu kayıt defterini kullanmaz (canlı anahtar verilmez).
 */
object LiveParams {
  private val values = ConcurrentHashMap<String, FloatArray>()

  fun get(key: String?): FloatArray? = if (key == null) null else values[key]

  fun put(key: String, v: FloatArray) {
    values[key] = v
  }

  /** Tam render tanımındaki değerlerle kayıt defterini eşitler. */
  fun seed(spec: RenderSpec) {
    values.clear()
    for (m in spec.main) {
      m.colorMatrix?.let { values["cm:${m.key}"] = it }
      values["vol:${m.key}"] = floatArrayOf(m.volume, m.fadeInMs.toFloat(), m.fadeOutMs.toFloat())
      m.lut?.let { values["lut:${m.key}"] = floatArrayOf(it.amount) }
      m.effects.forEach { values["fx:${it.key}"] = floatArrayOf(it.amount, *it.params) }
    }
    for (lane in spec.audioLanes) for (a in lane) {
      values["vol:${a.key}"] = floatArrayOf(a.volume, a.fadeInMs.toFloat(), a.fadeOutMs.toFloat())
    }
    spec.effectLayers.forEach { values["fx:${it.key}"] = floatArrayOf(it.amount, *it.params) }
    for (lane in spec.layers) for (l in lane) {
      l.colorMatrix?.let { values["cm:${l.key}"] = it }
      val m = l.mask
      val c = l.chroma
      values["ly:${l.key}"] = floatArrayOf(
        l.xf[0], l.xf[1], l.xf[2], l.xf[3], l.opacity,
        m[1], m[2], m[3], m[4], m[5], m[6], m[7],
        c[4], c[5], c[6],
      )
    }
  }
}
