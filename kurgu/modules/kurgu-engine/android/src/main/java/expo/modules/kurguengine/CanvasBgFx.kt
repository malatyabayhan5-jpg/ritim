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
import java.util.concurrent.TimeUnit
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
  private val imageUri: String? = null,
) : GlEffect {
  override fun toGlShaderProgram(context: Context, useHdr: Boolean): GlShaderProgram =
    CanvasBgProgram(context, useHdr, canvasW, canvasH, background, liveKey, imageUri)

  companion object {
    /** Arka plan resminin çözüleceği uzun kenar (kanvas kadar, en çok 1920). */
    fun imageLongSide(w: Int, h: Int): Int = max(w, h).coerceAtMost(1920)

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
  private val imageUri: String?,
) : BaseGlShaderProgram(useHdr, 1) {
  private val context = context.applicationContext
  private val program: GlProgram
  private var imageTex = -1
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

  /** Resim (BlendPixels: satırlar alttan üste, video kareleriyle aynı yön) ilk karede dokuya yüklenir. */
  private fun ensureImage() {
    val uri = imageUri ?: return
    if (imageTex >= 0) return
    val longSide = CanvasBgFx.imageLongSide(canvasW, canvasH)
    val px = try {
      BlendPixels.get(context, uri, longSide).get(20, TimeUnit.SECONDS)
    } catch (e: Exception) {
      null
    } ?: run {
      BlendPixels.forget(uri, longSide)
      throw VideoFrameProcessingException("CANVAS_BG_IMAGE_DECODE")
    }
    val ids = IntArray(1)
    GLES20.glGenTextures(1, ids, 0)
    imageTex = ids[0]
    GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, imageTex)
    GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR)
    GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR)
    GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE)
    GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE)
    val data = px.data.duplicate().also { it.position(0) }
    GLES20.glTexImage2D(GLES20.GL_TEXTURE_2D, 0, GLES20.GL_RGBA, px.w, px.h, 0, GLES20.GL_RGBA, GLES20.GL_UNSIGNED_BYTE, data)
    GlUtil.checkGlError()
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
      if (bg[0] > 1.5f) ensureImage()
      program.use()
      program.setSamplerTexIdUniform("uTex", inputTexId, 0)
      // Gölgelendirici uBgImg'yi her kipte tanımlar; GlProgram ayarlanmamış örnekleyiciyle
      // çizmez. Resim yoksa giriş dokusu yer tutucu olarak bağlanır (kip 2 dışında okunmaz).
      program.setSamplerTexIdUniform("uBgImg", if (imageTex >= 0) imageTex else inputTexId, 1)
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
      if (imageTex >= 0) GlUtil.deleteTexture(imageTex)
    } catch (e: GlUtil.GlException) {
      throw VideoFrameProcessingException(e)
    }
  }
}
