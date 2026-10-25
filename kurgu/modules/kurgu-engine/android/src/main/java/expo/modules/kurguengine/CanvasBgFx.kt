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
import kotlin.math.max

/**
 * Ana iz klibini kanvasa sığdırır ve boşlukları kanvas arka planıyla doldurur
 * (assets/kurgu_fx/_canvas_bg.glsl): düz renk ya da klibin kanvası dolduran bulanık kopyası.
 * Presentation(LAYOUT_SCALE_TO_FIT) ile aynı yerleşimdir; siyah arka planda dışa aktarma
 * Presentation'ı kullanmaya devam eder. `background` = [kip (0 renk, 1 bulanık), bulanıklık,
 * karartma, R, G, B]; önizlemede `liveKey` ("bg:canvas") ile canlı okunur.
 */
@OptIn(UnstableApi::class)
class CanvasBgFx(
  private val canvasW: Int,
  private val canvasH: Int,
  private val background: FloatArray,
  private val liveKey: String? = null,
) : GlEffect {
  override fun toGlShaderProgram(context: Context, useHdr: Boolean): GlShaderProgram =
    CanvasBgProgram(context, useHdr, canvasW, canvasH, background, liveKey)

  companion object {
    /** Arka plan siyah düz renk mi (bu durumda dışa aktarmada Presentation yeterli). */
    fun isBlack(bg: FloatArray): Boolean = bg.getOrElse(0) { 0f } < 0.5f && bg.getOrElse(3) { 0f } < 0.004f && bg.getOrElse(4) { 0f } < 0.004f && bg.getOrElse(5) { 0f } < 0.004f
  }
}

@OptIn(UnstableApi::class)
internal class CanvasBgProgram(
  context: Context,
  useHdr: Boolean,
  private val canvasW: Int,
  private val canvasH: Int,
  private val background: FloatArray,
  private val liveKey: String?,
) : BaseGlShaderProgram(useHdr, 1) {
  private val program: GlProgram
  private var srcAspect = 1f
  private val p0 = FloatArray(4)
  private val p1 = FloatArray(4)

  init {
    try {
      program = GlProgram(ShaderFx.VERTEX, ShaderFx.fragmentSource(context, "_canvas_bg"))
    } catch (e: Exception) {
      throw VideoFrameProcessingException("CANVAS_BG_SHADER: ${e.message}", e)
    }
    program.setBufferAttribute("aFramePosition", GlUtil.getNormalizedCoordinateBounds(), GlUtil.HOMOGENEOUS_COORDINATE_VECTOR_SIZE)
  }

  override fun configure(inputWidth: Int, inputHeight: Int): Size {
    srcAspect = inputWidth.toFloat() / max(1, inputHeight)
    return Size(canvasW, canvasH)
  }

  override fun drawFrame(inputTexId: Int, presentationTimeUs: Long) {
    val bg = LiveParams.get(liveKey)?.takeIf { it.size >= 6 } ?: background
    p0[0] = srcAspect
    p0[1] = bg[0]
    p0[2] = bg[1]
    p0[3] = bg[2]
    p1[0] = bg[3]
    p1[1] = bg[4]
    p1[2] = bg[5]
    p1[3] = 1f
    try {
      program.use()
      program.setSamplerTexIdUniform("uTex", inputTexId, 0)
      program.setFloatsUniformIfPresent("uRes", floatArrayOf(canvasW.toFloat(), canvasH.toFloat()))
      program.setFloatsUniformIfPresent("uAmount", floatArrayOf(1f))
      program.setFloatsUniformIfPresent("uP0", p0)
      program.setFloatsUniformIfPresent("uP1", p1)
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
