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
  }
}
