package expo.modules.kurguengine

import android.content.Context
import androidx.annotation.OptIn
import androidx.media3.common.VideoFrameProcessingException
import androidx.media3.common.util.GlProgram
import androidx.media3.common.util.GlUtil
import androidx.media3.common.util.Size
import androidx.media3.common.util.UnstableApi
import androidx.media3.effect.BaseGlShaderProgram
import androidx.media3.effect.GlEffect
import androidx.media3.effect.GlShaderProgram
import android.opengl.GLES20
import expo.modules.kurguengine.anim.Keyframes
import kotlin.math.PI

/**
 * Katman yerleşimi (assets/kurgu_fx/_layer.glsl): katman karesini kanvas boyutunda,
 * dışı saydam bir kareye çizer; konum/ölçek/döndürme, kırpma, maske, chroma key ve
 * opaklık uygular. Birleştirici (DefaultVideoCompositor) bu kareyi alt katmanların
 * üzerine alfa karışımıyla koyar.
 *
 * Zaman: efektler kompozisyon zamanını görür (Media3 öğe kaydırmasını ekler);
 * anahtar kareler katman başlangıcına göredir.
 */
@OptIn(UnstableApi::class)
class LayerFx(
  private val layer: LayerClip,
  private val canvasW: Int,
  private val canvasH: Int,
  private val liveKey: String? = null,
) : GlEffect {
  override fun toGlShaderProgram(context: Context, useHdr: Boolean): GlShaderProgram =
    LayerFxProgram(context, useHdr, layer, canvasW, canvasH, liveKey)
}

@OptIn(UnstableApi::class)
internal class LayerFxProgram(
  context: Context,
  useHdr: Boolean,
  private val layer: LayerClip,
  private val canvasW: Int,
  private val canvasH: Int,
  private val liveKey: String?,
) : BaseGlShaderProgram(useHdr, 1) {
  private val program: GlProgram
  private var srcW = 1
  private var srcH = 1
  private val xf = FloatArray(4)
  private val lay = FloatArray(4)
  private val maskA = FloatArray(4)
  private val maskB = FloatArray(4)
  private val key = FloatArray(4)
  private val keyP = FloatArray(4)

  init {
    try {
      program = GlProgram(ShaderFx.VERTEX, ShaderFx.layerSource(context))
    } catch (e: Exception) {
      throw VideoFrameProcessingException("LAYER_SHADER: ${e.message}", e)
    }
    program.setBufferAttribute("aFramePosition", GlUtil.getNormalizedCoordinateBounds(), GlUtil.HOMOGENEOUS_COORDINATE_VECTOR_SIZE)
  }

  override fun configure(inputWidth: Int, inputHeight: Int): Size {
    srcW = inputWidth
    srcH = inputHeight
    return Size(canvasW, canvasH)
  }

  private fun kf(name: String, tMs: Double, base: Float): Float = Keyframes.valueAt(layer.keyframes[name], tMs, base)

  override fun drawFrame(inputTexId: Int, presentationTimeUs: Long) {
    val t = presentationTimeUs / 1000.0 - layer.startMs
    // Önizlemede kaydırıcı değerleri canlı okunur: [x, y, ölçek, döndürme, opaklık,
    // maske cx, cy, açı, yarı gen., yarı yük., yumuşaklık, köşe, tolerans, kenar, taşma]
    val live = LiveParams.get(liveKey)?.takeIf { it.size >= 15 }
    val m = layer.mask
    val c = layer.chroma
    xf[0] = kf("x", t, live?.get(0) ?: layer.xf[0])
    xf[1] = kf("y", t, live?.get(1) ?: layer.xf[1])
    xf[2] = kf("scale", t, live?.get(2) ?: layer.xf[2])
    xf[3] = (kf("rotation", t, live?.get(3) ?: layer.xf[3]) * PI / 180.0).toFloat()
    lay[0] = kf("opacity", t, live?.get(4) ?: layer.opacity)
    lay[1] = if (layer.flipH) 1f else 0f
    lay[2] = if (layer.flipV) 1f else 0f
    maskA[0] = m[0]
    maskA[1] = live?.get(5) ?: m[1]
    maskA[2] = live?.get(6) ?: m[2]
    maskA[3] = ((live?.get(7) ?: m[3]) * PI / 180.0).toFloat()
    maskB[0] = live?.get(8) ?: m[4]
    maskB[1] = live?.get(9) ?: m[5]
    maskB[2] = live?.get(10) ?: m[6]
    maskB[3] = live?.get(11) ?: m[7]
    key[0] = c[0]
    key[1] = c[1]
    key[2] = c[2]
    key[3] = c[3]
    keyP[0] = live?.get(12) ?: c[4]
    keyP[1] = live?.get(13) ?: c[5]
    keyP[2] = live?.get(14) ?: c[6]
    try {
      program.use()
      program.setSamplerTexIdUniform("uTex", inputTexId, 0)
      program.setFloatsUniformIfPresent("uRes", floatArrayOf(canvasW.toFloat(), canvasH.toFloat()))
      program.setFloatsUniformIfPresent("uSrcRes", floatArrayOf(srcW.toFloat(), srcH.toFloat()))
      program.setFloatsUniformIfPresent("uXf", xf)
      program.setFloatsUniformIfPresent("uLay", lay)
      program.setFloatsUniformIfPresent("uCrop", layer.crop)
      program.setFloatsUniformIfPresent("uMaskA", maskA)
      program.setFloatsUniformIfPresent("uMaskB", maskB)
      program.setFloatsUniformIfPresent("uMaskInv", floatArrayOf(m[8]))
      program.setFloatsUniformIfPresent("uKey", key)
      program.setFloatsUniformIfPresent("uKeyP", keyP)
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
}
