package expo.modules.kurguengine

import android.content.Context
import android.opengl.GLES20
import androidx.annotation.OptIn
import androidx.media3.common.VideoFrameProcessingException
import androidx.media3.common.util.GlProgram
import androidx.media3.common.util.GlUtil
import androidx.media3.common.util.Size
import androidx.media3.common.util.UnstableApi
import androidx.media3.effect.BaseGlShaderProgram
import androidx.media3.effect.GlEffect
import androidx.media3.effect.GlShaderProgram
import java.util.concurrent.ConcurrentHashMap
import kotlin.math.max
import kotlin.math.min

/** Render tanımındaki tek bir katalog efekti (klip efekti veya efekt katmanı). */
data class ShaderFxSpec(
  val shader: String,
  val amount: Float,
  val params: FloatArray,
  val seed: Float,
  val startMs: Long,
  val endMs: Long,
)

/**
 * Katalog efektlerini (assets/kurgu_fx/<shader>.glsl) çalıştıran genel GL efekti.
 * Aynı GLSL dosyası efekt laboratuvarında (WebGL) da kullanılır; önizleme,
 * dışa aktarma ve laboratuvar çıktısı aynı kaynaktan üretilir.
 *
 * Zaman penceresi dışında yoğunluk 0'a çekilir ve görüntü aynen geçer; pencere
 * kenarlarında kısa bir yumuşatma ani atlamayı önler.
 */
@OptIn(UnstableApi::class)
class ShaderFx(private val spec: ShaderFxSpec) : GlEffect {
  override fun toGlShaderProgram(context: Context, useHdr: Boolean): GlShaderProgram =
    ShaderFxProgram(context, useHdr, spec)

  companion object {
    private val sources = ConcurrentHashMap<String, String>()

    /** Ortak çekirdek + efekt + main; assets'ten bir kez okunur. */
    fun fragmentSource(context: Context, shader: String): String = sources.getOrPut(shader) {
      require(shader.matches(Regex("[a-z0-9_]+"))) { "BAD_SHADER_ID" }
      val read = { name: String -> context.assets.open("kurgu_fx/$name").bufferedReader().use { it.readText() } }
      read("_common.glsl") + "\n" + read("$shader.glsl") + "\n" + read("_main.glsl")
    }

    const val VERTEX = """
attribute vec4 aFramePosition;
varying vec2 vUv;
void main() {
  gl_Position = aFramePosition;
  vUv = aFramePosition.xy * 0.5 + 0.5;
}
"""
  }
}

@OptIn(UnstableApi::class)
internal class ShaderFxProgram(context: Context, useHdr: Boolean, private val spec: ShaderFxSpec) :
  BaseGlShaderProgram(useHdr, 1) {
  private val program: GlProgram
  private var width = 1
  private var height = 1
  private val p0 = FloatArray(4)
  private val p1 = FloatArray(4)

  init {
    try {
      program = GlProgram(ShaderFx.VERTEX, ShaderFx.fragmentSource(context, spec.shader))
    } catch (e: Exception) {
      throw VideoFrameProcessingException("FX_SHADER_${spec.shader}: ${e.message}", e)
    }
    program.setBufferAttribute("aFramePosition", GlUtil.getNormalizedCoordinateBounds(), GlUtil.HOMOGENEOUS_COORDINATE_VECTOR_SIZE)
    for (i in 0 until 4) {
      p0[i] = spec.params.getOrElse(i) { 0f }
      p1[i] = spec.params.getOrElse(i + 4) { 0f }
    }
  }

  override fun configure(inputWidth: Int, inputHeight: Int): Size {
    width = inputWidth
    height = inputHeight
    return Size(inputWidth, inputHeight)
  }

  override fun drawFrame(inputTexId: Int, presentationTimeUs: Long) {
    val tMs = presentationTimeUs / 1000.0
    val start = spec.startMs.toDouble()
    val end = if (spec.endMs > spec.startMs) spec.endMs.toDouble() else Double.MAX_VALUE
    var amount = 0f
    if (tMs >= start && tMs < end) {
      val ramp = 80.0
      val k = min(1.0, min((tMs - start) / ramp + 0.5, (end - tMs) / ramp + 0.5))
      amount = (spec.amount * max(0.0, k)).toFloat()
    }
    val local = max(0.0, (tMs - start) / 1000.0).toFloat()
    val dur = if (spec.endMs > spec.startMs) (spec.endMs - spec.startMs) / 1000f else 0f
    try {
      program.use()
      program.setSamplerTexIdUniform("uTex", inputTexId, 0)
      program.setFloatsUniformIfPresent("uRes", floatArrayOf(width.toFloat(), height.toFloat()))
      setFloat("uTime", local)
      setFloat("uDur", dur)
      setFloat("uAmount", amount)
      setFloat("uSeed", spec.seed)
      program.setFloatsUniformIfPresent("uP0", p0)
      program.setFloatsUniformIfPresent("uP1", p1)
      program.bindAttributesAndUniforms()
      GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4)
    } catch (e: GlUtil.GlException) {
      throw VideoFrameProcessingException(e, presentationTimeUs)
    }
  }

  // Derleyici kullanılmayan uniform'ları kaldırabilir; olmayan uniform hata vermez.
  private fun setFloat(name: String, v: Float) {
    program.setFloatsUniformIfPresent(name, floatArrayOf(v))
  }

  override fun release() {
    super.release()
    try {
      program.delete()
    } catch (e: GlUtil.GlException) {
      throw VideoFrameProcessingException(e)
    }
  }
}
