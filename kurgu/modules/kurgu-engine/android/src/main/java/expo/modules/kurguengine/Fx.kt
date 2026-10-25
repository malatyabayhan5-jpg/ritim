package expo.modules.kurguengine

import android.content.Context
import android.graphics.Matrix
import android.opengl.GLES20
import android.opengl.Matrix as GlMatrix
import android.util.Log
import androidx.annotation.OptIn
import androidx.media3.common.C
import androidx.media3.common.VideoFrameProcessingException
import androidx.media3.common.audio.GainProcessor
import androidx.media3.common.util.GlProgram
import androidx.media3.common.util.GlUtil
import androidx.media3.common.util.Size
import androidx.media3.common.util.UnstableApi
import androidx.media3.effect.BaseGlShaderProgram
import androidx.media3.effect.GlEffect
import androidx.media3.effect.GlShaderProgram
import androidx.media3.effect.MatrixTransformation
import androidx.media3.effect.RgbMatrix
import expo.modules.kurguengine.anim.Keyframes
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

// Zaman bağımlı tüm efektler kompozisyon zamanını (µs) kullanır. Media3 hem
// CompositionPlayer'da hem Transformer'da kareleri kompozisyon zamanına
// taşıdığı için önizleme ile dışa aktarma aynı sonucu verir.

private fun smooth(x: Float): Float {
  val t = x.coerceIn(0f, 1f)
  return t * t * (3f - 2f * t)
}

private val IDENTITY: FloatArray = GlUtil.create4x4IdentityMatrix()

/** Sabit 4x4 renk matrisi (sütun öncelikli). Filtreler ve renk ayarları JS'de hesaplanır. */
@OptIn(UnstableApi::class)
class StaticColorMatrix(private val matrix: FloatArray, private val liveKey: String? = null) : RgbMatrix {
  override fun getMatrix(presentationTimeUs: Long, useHdr: Boolean): FloatArray =
    LiveParams.get(liveKey)?.takeIf { it.size == 16 } ?: matrix
}

/** Klibin kullanıcı ölçeği ve konumu (kanvasa yerleştirildikten sonra). */
@OptIn(UnstableApi::class)
class ClipPlacement(private val scale: Float, private val offsetX: Float, private val offsetY: Float) : MatrixTransformation {
  private val m = Matrix().apply {
    postScale(scale, scale)
    postTranslate(offsetX, offsetY)
  }

  override fun getMatrix(presentationTimeUs: Long): Matrix = m
}

/**
 * Anahtar kareli yerleşim (ana iz): ölçek, konum (NDC) ve serbest açı (derece, saat
 * yönü). Döndürme en/boy düzeltmesiyle yapılır (kare bozulmaz). Kare zamanları klibin
 * zaman çizelgesi başlangıcına göredir.
 */
@OptIn(UnstableApi::class)
class KeyedPlacement(
  private val scale: Float,
  private val offsetX: Float,
  private val offsetY: Float,
  private val angle: Float,
  private val kf: Map<String, FloatArray>,
  private val clipStartMs: Long,
  // Önizlemede sabit değerler canlı okunur (LiveParams `tf:<klip>`: ölçek, x, y, açı)
  private val liveKey: String? = null,
) : MatrixTransformation {
  private var aspect = 1f
  private val m = Matrix()

  override fun configure(inputWidth: Int, inputHeight: Int): Size {
    aspect = inputWidth.toFloat() / max(1, inputHeight)
    return Size(inputWidth, inputHeight)
  }

  override fun getMatrix(presentationTimeUs: Long): Matrix {
    val t = presentationTimeUs / 1000.0 - clipStartMs
    val lv = LiveParams.get(liveKey)?.takeIf { it.size >= 4 }
    val s = Keyframes.valueAt(kf["scale"], t, lv?.get(0) ?: scale)
    val x = Keyframes.valueAt(kf["x"], t, lv?.get(1) ?: offsetX)
    val y = Keyframes.valueAt(kf["y"], t, lv?.get(2) ?: offsetY)
    val a = Keyframes.valueAt(kf["angle"], t, lv?.get(3) ?: angle)
    m.reset()
    m.postScale(s, s)
    m.postScale(aspect, 1f)
    m.postRotate(-a)
    m.postScale(1f / aspect, 1f)
    m.postTranslate(x, y)
    return m
  }
}

/** Anahtar kareli opaklık (ana iz): rengi siyaha doğru karartır. */
@OptIn(UnstableApi::class)
class KeyedOpacity(private val base: Float, private val track: FloatArray?, private val clipStartMs: Long) : RgbMatrix {
  private val out = FloatArray(16)
  private var logged = 0

  override fun getMatrix(presentationTimeUs: Long, useHdr: Boolean): FloatArray {
    val k = Keyframes.valueAt(track, presentationTimeUs / 1000.0 - clipStartMs, base).coerceIn(0f, 1f)
    // Tanı: ilk birkaç karede uygulanan opaklık (e2e klip animasyonu denetimi için)
    if (logged < 3) {
      logged++
      Log.i("KurguExport", "opacity t=${presentationTimeUs / 1000} start=$clipStartMs k=$k")
    }
    GlMatrix.setIdentityM(out, 0)
    out[0] = k
    out[5] = k
    out[10] = k
    return out
  }
}

/** Geçiş penceresi: [atMs - durationMs/2, atMs + durationMs/2]. */
private fun progressAround(t: Double, tr: TransitionSpec): Float? {
  val half = tr.durationMs / 2.0
  if (half <= 0) return null
  val d = t - tr.atMs
  if (d < -half || d > half) return null
  return (d / half).toFloat() // -1..1 (0 = kesme anı)
}

/** Kesme anından sonraki giriş penceresi: [atMs, atMs + durationMs]. */
private fun progressAfter(t: Double, tr: TransitionSpec): Float? {
  if (tr.durationMs <= 0) return null
  val d = t - tr.atMs
  if (d < 0 || d > tr.durationMs) return null
  return (d / tr.durationMs).toFloat() // 0..1
}

/** Kesme anından önceki çıkış penceresi: [atMs - durationMs, atMs]. */
private fun progressBefore(t: Double, tr: TransitionSpec): Float? {
  if (tr.durationMs <= 0) return null
  val d = tr.atMs - t
  if (d < 0 || d > tr.durationMs) return null
  return (1.0 - d / tr.durationMs).toFloat() // 0..1
}

/** Renk tabanlı geçişler: siyaha/beyaza geçiş, flaş. */
@OptIn(UnstableApi::class)
class TransitionColor(private val transitions: List<TransitionSpec>) : RgbMatrix {
  private val out = FloatArray(16)

  override fun getMatrix(presentationTimeUs: Long, useHdr: Boolean): FloatArray {
    val t = presentationTimeUs / 1000.0
    for (tr in transitions) {
      val p = progressAround(t, tr) ?: continue
      val k = smooth(abs(p)) // 0 kesmede, 1 kenarlarda
      when (tr.type) {
        "fade", "dissolve" -> return scaleOffset(k, 0f)
        "white" -> return scaleOffset(k, 1f - k)
        "flash" -> {
          val f = smooth(abs(p) * 2f)
          return scaleOffset(f, 1f - f)
        }
      }
    }
    return IDENTITY
  }

  private fun scaleOffset(scale: Float, offset: Float): FloatArray {
    java.util.Arrays.fill(out, 0f)
    out[0] = scale
    out[5] = scale
    out[10] = scale
    out[12] = offset
    out[13] = offset
    out[14] = offset
    out[15] = 1f
    return out
  }
}

/** Hareket tabanlı geçişler: yakınlaşma, kaydırma, döndürme. */
@OptIn(UnstableApi::class)
class TransitionMotion(private val transitions: List<TransitionSpec>) : MatrixTransformation {
  private val identity = Matrix()
  private val m = Matrix()

  override fun getMatrix(presentationTimeUs: Long): Matrix {
    val t = presentationTimeUs / 1000.0
    for (tr in transitions) {
      when (tr.type) {
        "zoomIn" -> {
          val p = progressAfter(t, tr) ?: continue
          val s = 1.35f - 0.35f * smooth(p)
          m.reset(); m.postScale(s, s); return m
        }
        "zoomOut" -> {
          val p = progressBefore(t, tr) ?: continue
          val s = 1f + 0.35f * smooth(p)
          m.reset(); m.postScale(s, s); return m
        }
        "slideLeft", "slideRight", "slideUp", "slideDown" -> {
          val p = progressAfter(t, tr) ?: continue
          val r = 2f * (1f - smooth(p))
          m.reset()
          when (tr.type) {
            "slideLeft" -> m.postTranslate(r, 0f)
            "slideRight" -> m.postTranslate(-r, 0f)
            "slideUp" -> m.postTranslate(0f, -r)
            else -> m.postTranslate(0f, r)
          }
          return m
        }
        "spin" -> {
          val p = progressAfter(t, tr) ?: continue
          val e = smooth(p)
          val s = 0.4f + 0.6f * e
          m.reset(); m.postRotate(-360f * (1f - e)); m.postScale(s, s); return m
        }
      }
    }
    return identity
  }
}

/** Vinyet, gren, piksel, RGB kayması, glitch ve keskinlik için tek geçişli shader. */
@OptIn(UnstableApi::class)
class FxEffect(
  private val base: FxParams,
  private val glitchTransitions: List<TransitionSpec> = emptyList(),
) : GlEffect {
  override fun toGlShaderProgram(context: Context, useHdr: Boolean): GlShaderProgram =
    FxShaderProgram(useHdr, base, glitchTransitions)
}

@OptIn(UnstableApi::class)
internal class FxShaderProgram(
  useHdr: Boolean,
  private val base: FxParams,
  private val glitchTransitions: List<TransitionSpec>,
) : BaseGlShaderProgram(useHdr, 1) {
  private val program: GlProgram
  private var width = 1
  private var height = 1

  init {
    try {
      program = GlProgram(VERTEX, FRAGMENT)
    } catch (e: GlUtil.GlException) {
      throw VideoFrameProcessingException(e)
    }
    program.setBufferAttribute(
      "aFramePosition",
      GlUtil.getNormalizedCoordinateBounds(),
      GlUtil.HOMOGENEOUS_COORDINATE_VECTOR_SIZE,
    )
  }

  override fun configure(inputWidth: Int, inputHeight: Int): Size {
    width = inputWidth
    height = inputHeight
    return Size(inputWidth, inputHeight)
  }

  override fun drawFrame(inputTexId: Int, presentationTimeUs: Long) {
    val tMs = presentationTimeUs / 1000.0
    var glitch = base.glitch
    var shift = base.rgbShift
    for (tr in glitchTransitions) {
      val p = progressAround(tMs, tr) ?: continue
      val k = 1f - smooth(abs(p))
      glitch = max(glitch, k)
      shift = max(shift, k * 0.8f)
    }
    try {
      program.use()
      program.setSamplerTexIdUniform("uTexSampler", inputTexId, 0)
      program.setFloatsUniform("uSize", floatArrayOf(width.toFloat(), height.toFloat()))
      program.setFloatUniform("uTime", ((presentationTimeUs / 1000L) % 100000L) / 1000f)
      program.setFloatUniform("uVignette", base.vignette)
      program.setFloatUniform("uGrain", base.grain)
      program.setFloatUniform("uPixelate", base.pixelate)
      program.setFloatUniform("uRgbShift", shift)
      program.setFloatUniform("uGlitch", glitch)
      program.setFloatUniform("uSharpen", base.sharpen)
      program.setFloatUniform("uHighlights", base.highlights)
      program.setFloatUniform("uShadows", base.shadows)
      program.setFloatUniform("uFade", base.fade)
      program.bindAttributesAndUniforms()
      GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4)
    } catch (e: GlUtil.GlException) {
      throw VideoFrameProcessingException(e, presentationTimeUs)
    }
  }

  override fun release() {
    super.release()
    try {
      program.delete()
    } catch (e: GlUtil.GlException) {
      throw VideoFrameProcessingException(e)
    }
  }

  companion object {
    private const val VERTEX = """
attribute vec4 aFramePosition;
varying vec2 vTexSamplingCoord;
void main() {
  gl_Position = aFramePosition;
  vTexSamplingCoord = vec2(aFramePosition.x * 0.5 + 0.5, aFramePosition.y * 0.5 + 0.5);
}
"""

    private const val FRAGMENT = """
precision highp float;
uniform sampler2D uTexSampler;
uniform vec2 uSize;
uniform float uTime;
uniform float uVignette;
uniform float uGrain;
uniform float uPixelate;
uniform float uRgbShift;
uniform float uGlitch;
uniform float uSharpen;
uniform float uHighlights;
uniform float uShadows;
uniform float uFade;
varying vec2 vTexSamplingCoord;

float rand(vec2 co) {
  return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec2 uv = vTexSamplingCoord;
  if (uGlitch > 0.0) {
    float band = floor(uv.y * 28.0);
    float frame = floor(uTime * 15.0);
    if (rand(vec2(band, frame)) < 0.3 * uGlitch) {
      uv.x += (rand(vec2(frame, band)) - 0.5) * 0.15 * uGlitch;
    }
  }
  if (uPixelate > 0.0) {
    vec2 cell = vec2(max(2.0, uPixelate * 60.0)) / uSize;
    uv = (floor(uv / cell) + 0.5) * cell;
  }
  uv = clamp(uv, 0.0, 1.0);
  vec4 c = texture2D(uTexSampler, uv);
  float shift = uRgbShift * 0.012 + uGlitch * 0.01;
  if (shift > 0.0) {
    c.r = texture2D(uTexSampler, clamp(uv + vec2(shift, 0.0), 0.0, 1.0)).r;
    c.b = texture2D(uTexSampler, clamp(uv - vec2(shift, 0.0), 0.0, 1.0)).b;
  }
  if (uSharpen > 0.0) {
    vec2 o = 1.0 / uSize;
    vec3 n = texture2D(uTexSampler, uv + vec2(o.x, 0.0)).rgb
      + texture2D(uTexSampler, uv - vec2(o.x, 0.0)).rgb
      + texture2D(uTexSampler, uv + vec2(0.0, o.y)).rgb
      + texture2D(uTexSampler, uv - vec2(0.0, o.y)).rgb;
    c.rgb = clamp(c.rgb + (c.rgb - n * 0.25) * uSharpen * 2.0, 0.0, 1.0);
  }
  if (uHighlights != 0.0 || uShadows != 0.0) {
    float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
    float hw = smoothstep(0.35, 1.0, l);
    float sw = 1.0 - smoothstep(0.0, 0.45, l);
    c.rgb = clamp(c.rgb + c.rgb * (uHighlights * 0.45 * hw) + (uShadows * 0.25 * sw) * (1.0 - c.rgb), 0.0, 1.0);
  }
  if (uFade > 0.0) {
    c.rgb = mix(c.rgb, vec3(0.12) + c.rgb * 0.82, uFade);
  }
  if (uGrain > 0.0) {
    float g = rand(uv * uSize + vec2(uTime * 61.0, uTime * 17.0)) - 0.5;
    c.rgb = clamp(c.rgb + g * 0.3 * uGrain, 0.0, 1.0);
  }
  if (uVignette > 0.0) {
    float d = length(vTexSamplingCoord - 0.5) * 1.414;
    float v = 1.0 - smoothstep(0.35, 1.0, d);
    c.rgb *= mix(1.0, v, uVignette);
  }
  gl_FragColor = c;
}
"""
  }
}

/** Ses düzeyi ve giriş/çıkış yumuşatması. Kazanç 0..1 aralığındadır. */
@OptIn(UnstableApi::class)
class VolumeEnvelope(
  private val baseVolume: Float,
  private val baseFadeInUs: Long,
  private val baseFadeOutUs: Long,
  private val durationUs: Long,
  private val liveKey: String? = null,
  /** Ses düzeyi anahtar kareleri (Keyframes.java paketli biçimi, öğe içi çıktı ms); varsa sabit düzeyin yerine geçer. */
  private val keys: FloatArray? = null,
) : GainProcessor.GainProvider {
  override fun getGainFactorAtSamplePosition(samplePosition: Long, sampleRate: Int): Float {
    val posUs = samplePosition * 1_000_000L / sampleRate
    val live = LiveParams.get(liveKey)
    val volume = if (keys != null) Keyframes.valueAt(keys, posUs / 1000.0, baseVolume) else live?.getOrNull(0) ?: baseVolume
    val fadeInUs = live?.getOrNull(1)?.let { (it * 1000).toLong() } ?: baseFadeInUs
    val fadeOutUs = live?.getOrNull(2)?.let { (it * 1000).toLong() } ?: baseFadeOutUs
    var g = volume
    if (fadeInUs > 0 && posUs < fadeInUs) g *= posUs.toFloat() / fadeInUs
    if (fadeOutUs > 0 && durationUs > 0) {
      val left = durationUs - posUs
      if (left < fadeOutUs) g *= max(0f, left.toFloat() / fadeOutUs)
    }
    return min(1f, max(0f, g))
  }

  // GainProcessor bunu kazanç tam 1 iken sorar ve TIME_UNSET dönerse çöker
  // ("Expected a valid end boundary for unity region" — CI e2e önizleme hatası).
  // Birlik bölgesi en çok 10 ms'lik parçalar hâlinde bildirilir: canlı ses düzeyi
  // değişirse en geç bir parça sonra uygulanır; sabit zarfta solma başı aşılmaz.
  override fun isUnityUntil(samplePosition: Long, sampleRate: Int): Long {
    // Anahtar kareli düzeyde 1 ms'lik parça (eğri 1.0'dan geçerken sapma ≤ 1 ms)
    val chunkEnd = samplePosition + max(1, sampleRate / if (keys != null) 1000 else 100)
    if (liveKey != null || keys != null) return chunkEnd
    if (baseFadeOutUs > 0 && durationUs > 0) {
      val fadeStart = (durationUs - baseFadeOutUs) * sampleRate / 1_000_000L
      if (fadeStart > samplePosition) return min(chunkEnd, fadeStart)
    }
    return chunkEnd
  }

  companion object {
    fun isNeeded(volume: Float, fadeInMs: Long, fadeOutMs: Long, keys: FloatArray? = null) = volume < 0.999f || fadeInMs > 0 || fadeOutMs > 0 || keys != null
  }
}
