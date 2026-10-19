package expo.modules.kurguengine

import android.content.Context
import android.opengl.GLES20
import androidx.annotation.OptIn
import androidx.media3.common.C
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
  val key: String,
  val shader: String,
  val heavy: Boolean = false,
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
class ShaderFx(private val spec: ShaderFxSpec, private val liveKey: String? = null) : GlEffect {
  override fun toGlShaderProgram(context: Context, useHdr: Boolean): GlShaderProgram =
    ShaderFxProgram(context, useHdr, spec, liveKey)

  companion object {
    private val sources = ConcurrentHashMap<String, String>()

    private val PREPASS = Regex("^vec4\\s+prepass\\s*\\(", RegexOption.MULTILINE)

    private fun read(context: Context, name: String): String = sources.getOrPut(name) {
      context.assets.open("kurgu_fx/$name").bufferedReader().use { it.readText() }
    }

    /** Ortak çekirdek + efekt + main (veya ön geçiş için _prepass); assets'ten bir kez okunur. */
    fun fragmentSource(context: Context, shader: String, main: String = "_main.glsl"): String {
      require(shader.matches(Regex("[a-z0-9_]+"))) { "BAD_SHADER_ID" }
      val define = if (hasPrepass(context, shader)) "#define KURGU_TWO_PASS\n" else ""
      return define + read(context, "_common.glsl") + "\n" + read(context, "$shader.glsl") + "\n" + read(context, main)
    }

    /** Katman shader'ı: ortak çekirdek + _layer.glsl (kendi main fonksiyonu var). */
    fun layerSource(context: Context): String = read(context, "_common.glsl") + "\n" + read(context, "_layer.glsl")

    /** Efekt dosyası `vec4 prepass(vec2)` tanımlıyorsa iki geçişli çizilir (lab.cjs ile aynı kural). */
    fun hasPrepass(context: Context, shader: String): Boolean = PREPASS.containsMatchIn(read(context, "$shader.glsl"))

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
internal class ShaderFxProgram(context: Context, useHdr: Boolean, private val spec: ShaderFxSpec, private val liveKey: String? = null) :
  BaseGlShaderProgram(useHdr, 1) {
  private val program: GlProgram
  // İki geçişli efektler: yarım çözünürlüklü ön geçiş dokusu (configure'da ayrılır)
  private val preProgram: GlProgram?
  private val usesPre: Boolean
  private var preTex = C.INDEX_UNSET
  private var preFbo = C.INDEX_UNSET
  private var preW = 1
  private var preH = 1
  private val savedFbo = IntArray(1)
  private val savedViewport = IntArray(4)
  private var width = 1
  private var height = 1
  private val p0 = FloatArray(4)
  private val p1 = FloatArray(4)

  init {
    try {
      program = GlProgram(ShaderFx.VERTEX, ShaderFx.fragmentSource(context, spec.shader))
      preProgram = if (ShaderFx.hasPrepass(context, spec.shader)) {
        GlProgram(ShaderFx.VERTEX, ShaderFx.fragmentSource(context, spec.shader, "_prepass.glsl"))
      } else null
    } catch (e: Exception) {
      throw VideoFrameProcessingException("FX_SHADER_${spec.shader}: ${e.message}", e)
    }
    program.setBufferAttribute("aFramePosition", GlUtil.getNormalizedCoordinateBounds(), GlUtil.HOMOGENEOUS_COORDINATE_VECTOR_SIZE)
    usesPre = preProgram != null && program.getUniformLocation("uPre") >= 0
    preProgram?.setBufferAttribute("aFramePosition", GlUtil.getNormalizedCoordinateBounds(), GlUtil.HOMOGENEOUS_COORDINATE_VECTOR_SIZE)
    for (i in 0 until 4) {
      p0[i] = spec.params.getOrElse(i) { 0f }
      p1[i] = spec.params.getOrElse(i + 4) { 0f }
    }
  }

  override fun configure(inputWidth: Int, inputHeight: Int): Size {
    width = inputWidth
    height = inputHeight
    if (preProgram != null) {
      val w = max(1, inputWidth / 2)
      val h = max(1, inputHeight / 2)
      if (preTex == C.INDEX_UNSET || w != preW || h != preH) {
        try {
          releasePrepassTarget()
          preW = w
          preH = h
          // createTexture: GL_LINEAR süzgeç + kenara kenetleme; ön geçiş çıktısı bilinear okunur
          preTex = GlUtil.createTexture(w, h, false)
          preFbo = GlUtil.createFboForTexture(preTex)
        } catch (e: GlUtil.GlException) {
          throw VideoFrameProcessingException(e)
        }
      }
    }
    return Size(inputWidth, inputHeight)
  }

  private fun releasePrepassTarget() {
    if (preFbo != C.INDEX_UNSET) GlUtil.deleteFbo(preFbo)
    if (preTex != C.INDEX_UNSET) GlUtil.deleteTexture(preTex)
    preFbo = C.INDEX_UNSET
    preTex = C.INDEX_UNSET
  }

  private fun setCommonUniforms(p: GlProgram, inputTexId: Int, local: Float, dur: Float, amount: Float) {
    p.setSamplerTexIdUniform("uTex", inputTexId, 0)
    // Ön geçiş programında uPre kullanılmaz; sürücü yine de etkin sayarsa geçerli bir dokuya bağlanır
    // (kendi hedef dokusuna bağlamak geri besleme döngüsü olurdu).
    if (p !== program && p.getUniformLocation("uPre") >= 0) p.setSamplerTexIdUniform("uPre", inputTexId, 1)
    p.setFloatsUniformIfPresent("uRes", floatArrayOf(width.toFloat(), height.toFloat()))
    p.setFloatsUniformIfPresent("uTime", floatArrayOf(local))
    p.setFloatsUniformIfPresent("uDur", floatArrayOf(dur))
    p.setFloatsUniformIfPresent("uAmount", floatArrayOf(amount))
    p.setFloatsUniformIfPresent("uSeed", floatArrayOf(spec.seed))
    p.setFloatsUniformIfPresent("uP0", p0)
    p.setFloatsUniformIfPresent("uP1", p1)
  }

  override fun drawFrame(inputTexId: Int, presentationTimeUs: Long) {
    val tMs = presentationTimeUs / 1000.0
    val start = spec.startMs.toDouble()
    val end = if (spec.endMs > spec.startMs) spec.endMs.toDouble() else Double.MAX_VALUE
    // Önizlemede kaydırıcı değerleri canlı okunur (LiveParams); dışa aktarmada sabittir.
    val live = LiveParams.get(liveKey)
    if (live != null && live.size >= 9) {
      for (i in 0 until 4) {
        p0[i] = live[1 + i]
        p1[i] = live[5 + i]
      }
    }
    val baseAmount = live?.get(0) ?: spec.amount
    var amount = 0f
    if (tMs >= start && tMs < end) {
      val ramp = 80.0
      val k = min(1.0, min((tMs - start) / ramp + 0.5, (end - tMs) / ramp + 0.5))
      amount = (baseAmount * max(0.0, k)).toFloat()
    }
    val local = max(0.0, (tMs - start) / 1000.0).toFloat()
    val dur = if (spec.endMs > spec.startMs) (spec.endMs - spec.startMs) / 1000f else 0f
    try {
      // Ön geçiş (yoğunluk 0 iken ana shader görüntüyü aynen geçirir, ön geçişe gerek yok)
      val pre = preProgram
      val twoPass = pre != null && amount > 0f && preFbo != C.INDEX_UNSET
      if (twoPass) {
        // BaseGlShaderProgram çıktı FBO'sunu bağlamış durumda; ön geçişten sonra geri yüklenir.
        GLES20.glGetIntegerv(GLES20.GL_FRAMEBUFFER_BINDING, savedFbo, 0)
        GLES20.glGetIntegerv(GLES20.GL_VIEWPORT, savedViewport, 0)
        GlUtil.focusFramebufferUsingCurrentContext(preFbo, preW, preH)
        pre!!.use()
        setCommonUniforms(pre, inputTexId, local, dur, amount)
        pre.bindAttributesAndUniforms()
        GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4)
        GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, savedFbo[0])
        GLES20.glViewport(savedViewport[0], savedViewport[1], savedViewport[2], savedViewport[3])
      }
      program.use()
      // Derleyici kullanılmayan uniform'ları kaldırabilir; olmayan uniform hata vermez.
      setCommonUniforms(program, inputTexId, local, dur, amount)
      // Örnekleyici her karede bağlanmalı (GlProgram atanmamış örnekleyicide hata verir);
      // yoğunluk 0 iken içerik eski olabilir ama ana shader onu okumaz.
      if (usesPre && preTex != C.INDEX_UNSET) program.setSamplerTexIdUniform("uPre", preTex, 1)
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
      preProgram?.delete()
      releasePrepassTarget()
    } catch (e: GlUtil.GlException) {
      throw VideoFrameProcessingException(e)
    }
  }
}
