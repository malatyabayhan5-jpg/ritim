package expo.modules.kurguengine

import androidx.annotation.OptIn
import androidx.media3.common.audio.AudioProcessor
import androidx.media3.common.audio.SonicAudioProcessor
import androidx.media3.common.util.UnstableApi
import expo.modules.kurguengine.dsp.AudioFxChain
import org.json.JSONObject
import kotlin.math.abs
import kotlin.math.pow

/**
 * Klip/ses öğesinin ses efekti tanımı (render tanımındaki `audioFx` nesnesi,
 * src/model/audio-fx.js → audioFxSpec). `params` dizini AudioFxChain.KEYS
 * sırasındadır; perde (yarım ton) ayrıca tutulur çünkü Media3 Sonic ile uygulanır.
 */
class AudioFxSpec(val params: FloatArray, val pitchSemitones: Float) {
  /** Efekt zinciri gerekli mi (en az bir efekt açık ya da kazanç ≠ 0 dB). */
  val chainNeeded: Boolean get() = !AudioFxChain.isNoOp(params)

  /** Perde kaydırma gerekli mi. */
  val pitchNeeded: Boolean get() = abs(pitchSemitones) >= 0.01f

  val isNoOp: Boolean get() = !chainNeeded && !pitchNeeded

  /** Yarım ton → Sonic perde oranı (2^(st/12)); +12 → 2.0, -12 → 0.5. */
  val pitchRatio: Float get() = 2.0.pow(pitchSemitones / 12.0).toFloat()

  override fun equals(other: Any?): Boolean =
    other is AudioFxSpec && other.pitchSemitones == pitchSemitones && other.params.contentEquals(params)

  override fun hashCode(): Int = params.contentHashCode() * 31 + pitchSemitones.hashCode()
}

/**
 * Render tanımındaki `audioFx` nesnesini okur. Eksik anahtar varsayılanı alır,
 * sınır dışı değer kırpılır. Hiçbir efekt etkin değilse null (işlemci eklenmez).
 */
fun parseAudioFx(o: JSONObject?): AudioFxSpec? {
  if (o == null) return null
  val p = AudioFxChain.defaults()
  for (i in AudioFxChain.KEYS.indices) {
    val v = o.optDouble(AudioFxChain.KEYS[i], Double.NaN)
    if (!v.isNaN() && !v.isInfinite()) p[i] = v.toFloat().coerceIn(AudioFxChain.MIN[i], AudioFxChain.MAX[i])
  }
  val st = o.optDouble("pitch", 0.0).let { if (it.isNaN() || it.isInfinite()) 0.0 else it }.toFloat().coerceIn(-12f, 12f)
  val spec = AudioFxSpec(p, st)
  return if (spec.isNoOp) null else spec
}

/**
 * Bir klibin ses işlemci listesine eklenecek işlemciler, sırasıyla:
 * perde (Media3 SonicAudioProcessor, süre değişmez) → efekt zinciri.
 * Boş liste: efekt yok.
 */
@OptIn(UnstableApi::class)
fun audioFxProcessors(spec: AudioFxSpec?): List<AudioProcessor> {
  if (spec == null || spec.isNoOp) return emptyList()
  val out = ArrayList<AudioProcessor>(2)
  if (spec.pitchNeeded) out.add(SonicAudioProcessor().apply { setPitch(spec.pitchRatio) })
  if (spec.chainNeeded) out.add(AudioFxProcessor(spec))
  return out
}
