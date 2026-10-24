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
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Karışım modlu görsel katmanı (çıkartma, şekil, fotoğraf): Media3 birleştiricisi yalnızca
 * alfa karışımı yaptığından bu katmanlar ayrı dizi olarak değil, kompozisyon düzeyinde bir
 * efektle çizilir (assets/kurgu_fx/_blend_main.glsl). Girdi dokusu o ana kadarki kompozisyon
 * karesidir; katman görseli bir kez dokuya yüklenir ve _layer.glsl ile aynı yerleşim
 * (konum, anahtar kare, maske, chroma, opaklık) uygulanır. Önizleme ve dışa aktarma aynı yolu
 * kullanır. Video katmanları bu yoldan çizilmez (normal karışım).
 */
@OptIn(UnstableApi::class)
class BlendLayerFx(
  private val layer: LayerClip,
  private val mode: Int,
  private val canvasW: Int,
  private val canvasH: Int,
  private val liveKey: String? = null,
) : GlEffect {
  override fun toGlShaderProgram(context: Context, useHdr: Boolean): GlShaderProgram =
    BlendLayerProgram(context, useHdr, layer, mode, canvasW, canvasH, liveKey)
}

@OptIn(UnstableApi::class)
internal class BlendLayerProgram(
  private val context: Context,
  useHdr: Boolean,
  private val layer: LayerClip,
  private val mode: Int,
  private val canvasW: Int,
  private val canvasH: Int,
  liveKey: String?,
) : BaseGlShaderProgram(useHdr, 1) {
  private val program: GlProgram
  private val uniforms = LayerUniforms(layer, liveKey)
  private val cmKey = liveKey?.let { "cm:${layer.key}" }
  private val endMs = layer.startMs + ((layer.srcOutMs - layer.srcInMs) / layer.speed.coerceAtLeast(0.01f)).toLong()
  private var layerTex = -1
  private var srcW = 1
  private var srcH = 1

  init {
    try {
      program = GlProgram(ShaderFx.VERTEX, ShaderFx.blendSource(context))
    } catch (e: Exception) {
      throw VideoFrameProcessingException("BLEND_SHADER: ${e.message}", e)
    }
    program.setBufferAttribute("aFramePosition", GlUtil.getNormalizedCoordinateBounds(), GlUtil.HOMOGENEOUS_COORDINATE_VECTOR_SIZE)
  }

  override fun configure(inputWidth: Int, inputHeight: Int): Size = Size(inputWidth, inputHeight)

  /**
   * Görsel düz (ön çarpılmamış) alfayla ve alt satırı başta olacak şekilde yüklenir:
   * _layer.glsl düz alfa bekler, GL doku koordinatında t=0 alt kenardır.
   */
  private fun ensureTexture() {
    if (layerTex >= 0) return
    val bmp = PhotoRenderer.decode(context, layer.uri, 2048) ?: throw VideoFrameProcessingException("BLEND_IMAGE_DECODE")
    srcW = bmp.width
    srcH = bmp.height
    val px = IntArray(srcW * srcH)
    bmp.getPixels(px, 0, srcW, 0, 0, srcW, srcH)
    bmp.recycle()
    val buf = ByteBuffer.allocateDirect(px.size * 4).order(ByteOrder.nativeOrder())
    for (y in srcH - 1 downTo 0) {
      val row = y * srcW
      for (x in 0 until srcW) {
        val c = px[row + x]
        buf.put((c shr 16 and 0xFF).toByte())
        buf.put((c shr 8 and 0xFF).toByte())
        buf.put((c and 0xFF).toByte())
        buf.put((c ushr 24).toByte())
      }
    }
    buf.position(0)
    val ids = IntArray(1)
    GLES20.glGenTextures(1, ids, 0)
    layerTex = ids[0]
    GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, layerTex)
    GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR)
    GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR)
    GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE)
    GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE)
    GLES20.glTexImage2D(GLES20.GL_TEXTURE_2D, 0, GLES20.GL_RGBA, srcW, srcH, 0, GLES20.GL_RGBA, GLES20.GL_UNSIGNED_BYTE, buf)
    GlUtil.checkGlError()
  }

  override fun drawFrame(inputTexId: Int, presentationTimeUs: Long) {
    val tMs = presentationTimeUs / 1000L
    val visible = tMs >= layer.startMs && tMs < endMs
    try {
      ensureTexture()
      program.use()
      program.setSamplerTexIdUniform("uBase", inputTexId, 0)
      program.setSamplerTexIdUniform("uTex", layerTex, 1)
      program.setFloatsUniformIfPresent("uBlend", floatArrayOf(mode.toFloat()))
      // Filtre/ayar: canlı değer (önizlemede kaydırıcı) ya da sabit matris
      val cm = LiveParams.get(cmKey)?.takeIf { it.size == 16 } ?: layer.colorMatrix
      program.setFloatsUniformIfPresent("uCmOn", floatArrayOf(if (cm != null) 1f else 0f))
      if (cm != null) program.setFloatsUniformIfPresent("uCm", cm)
      uniforms.apply(program, presentationTimeUs, canvasW, canvasH, srcW, srcH, if (visible) 1f else 0f)
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
      if (layerTex >= 0) GlUtil.deleteTexture(layerTex)
    } catch (e: GlUtil.GlException) {
      throw VideoFrameProcessingException(e)
    }
  }
}
