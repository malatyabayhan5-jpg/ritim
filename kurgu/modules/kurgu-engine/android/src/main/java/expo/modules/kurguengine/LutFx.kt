package expo.modules.kurguengine

import android.content.Context
import android.net.Uri
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
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.ConcurrentHashMap
import kotlin.math.ceil
import kotlin.math.roundToInt
import kotlin.math.sqrt

/** Klibe uygulanan .cube LUT ve yoğunluğu. */
data class LutSpec(val uri: String, val amount: Float)

/** Ayrıştırılmış LUT: dilimleri ızgara hâlinde dizilmiş RGBA doku verisi. */
class CubeLut(
  val size: Int,
  val cols: Int,
  val width: Int,
  val height: Int,
  val rgba: ByteArray,
  val domainMin: FloatArray,
  val domainMax: FloatArray,
) {
  companion object {
    private val cache = ConcurrentHashMap<String, CubeLut>()

    fun fileOf(uri: String): File = File(if (uri.startsWith("file:")) Uri.parse(uri).path ?: uri else uri)

    /** Dosya değişmedikçe önbellekten döner (önizleme sık yeniden kurulur). */
    fun load(uri: String): CubeLut {
      val f = fileOf(uri)
      val key = "${f.absolutePath}:${f.length()}:${f.lastModified()}"
      return cache.getOrPut(key) { parse(f.readText()) }
    }

    // src/model/lut.js ile aynı kurallar.
    fun parse(text: String): CubeLut {
      var size = 0
      var data: FloatArray? = null
      var n = 0
      var dMin = floatArrayOf(0f, 0f, 0f)
      var dMax = floatArrayOf(1f, 1f, 1f)
      for (raw in text.lineSequence()) {
        val line = raw.trim()
        if (line.isEmpty() || line.startsWith("#")) continue
        val c = line[0]
        val parts = line.split(Regex("\\s+"))
        if (!(c.isDigit() || c == '-' || c == '+' || c == '.')) {
          when (parts[0].uppercase()) {
            "LUT_3D_SIZE" -> {
              size = parts.getOrNull(1)?.toIntOrNull() ?: 0
              require(size in 2..65) { "LUT_SIZE" }
              data = FloatArray(size * size * size * 3)
            }
            "LUT_1D_SIZE" -> throw IllegalArgumentException("LUT_1D")
            "DOMAIN_MIN" -> dMin = triple(parts)
            "DOMAIN_MAX" -> dMax = triple(parts)
            "LUT_3D_INPUT_RANGE" -> {
              val a = parts.getOrNull(1)?.toFloatOrNull() ?: throw IllegalArgumentException("LUT_DATA")
              val b = parts.getOrNull(2)?.toFloatOrNull() ?: throw IllegalArgumentException("LUT_DATA")
              dMin = floatArrayOf(a, a, a)
              dMax = floatArrayOf(b, b, b)
            }
          }
          continue
        }
        val d = data ?: throw IllegalArgumentException("LUT_FORMAT")
        require(n < size * size * size) { "LUT_DATA" }
        val v = triple(listOf("") + parts)
        d[n * 3] = v[0]; d[n * 3 + 1] = v[1]; d[n * 3 + 2] = v[2]
        n++
      }
      val d = data ?: throw IllegalArgumentException("LUT_FORMAT")
      require(n == size * size * size) { "LUT_DATA" }

      val cols = ceil(sqrt(size.toDouble())).toInt()
      val rows = (size + cols - 1) / cols
      val w = cols * size
      val h = rows * size
      val out = ByteArray(w * h * 4)
      for (b in 0 until size) {
        val tx = (b % cols) * size
        val ty = (b / cols) * size
        for (g in 0 until size) for (r in 0 until size) {
          val i = (r + g * size + b * size * size) * 3
          val o = ((ty + g) * w + tx + r) * 4
          for (k in 0 until 3) out[o + k] = (d[i + k].coerceIn(0f, 1f) * 255f).roundToInt().toByte()
          out[o + 3] = 0xFF.toByte()
        }
      }
      return CubeLut(size, cols, w, h, out, dMin, dMax)
    }

    private fun triple(parts: List<String>): FloatArray {
      val v = FloatArray(3) { parts.getOrNull(it + 1)?.toFloatOrNull() ?: throw IllegalArgumentException("LUT_DATA") }
      return v
    }
  }
}

/** 3B LUT efekti. Shader: assets/kurgu_fx/_lut.glsl (efekt laboratuvarıyla ortak). */
@OptIn(UnstableApi::class)
class LutFx(private val spec: LutSpec, private val liveKey: String? = null) : GlEffect {
  override fun toGlShaderProgram(context: Context, useHdr: Boolean): GlShaderProgram =
    LutFxProgram(context, useHdr, spec, CubeLut.load(spec.uri), liveKey)
}

@OptIn(UnstableApi::class)
internal class LutFxProgram(context: Context, useHdr: Boolean, private val spec: LutSpec, private val lut: CubeLut, private val liveKey: String? = null) :
  BaseGlShaderProgram(useHdr, 1) {
  private val program: GlProgram
  private val lutTex: Int

  init {
    try {
      program = GlProgram(ShaderFx.VERTEX, ShaderFx.fragmentSource(context, "_lut"))
      program.setBufferAttribute("aFramePosition", GlUtil.getNormalizedCoordinateBounds(), GlUtil.HOMOGENEOUS_COORDINATE_VECTOR_SIZE)
      val ids = IntArray(1)
      GLES20.glGenTextures(1, ids, 0)
      lutTex = ids[0]
      GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, lutTex)
      GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR)
      GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR)
      GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE)
      GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE)
      val buf = ByteBuffer.allocateDirect(lut.rgba.size).order(ByteOrder.nativeOrder())
      buf.put(lut.rgba).position(0)
      GLES20.glTexImage2D(GLES20.GL_TEXTURE_2D, 0, GLES20.GL_RGBA, lut.width, lut.height, 0, GLES20.GL_RGBA, GLES20.GL_UNSIGNED_BYTE, buf)
      GlUtil.checkGlError()
    } catch (e: Exception) {
      throw VideoFrameProcessingException("LUT: ${e.message}", e)
    }
  }

  override fun configure(inputWidth: Int, inputHeight: Int): Size = Size(inputWidth, inputHeight)

  override fun drawFrame(inputTexId: Int, presentationTimeUs: Long) {
    try {
      program.use()
      program.setSamplerTexIdUniform("uTex", inputTexId, 0)
      program.setSamplerTexIdUniform("uLut", lutTex, 1)
      program.setFloatsUniformIfPresent("uLutGrid", floatArrayOf(lut.size.toFloat(), lut.cols.toFloat()))
      program.setFloatsUniformIfPresent("uLutTexSize", floatArrayOf(lut.width.toFloat(), lut.height.toFloat()))
      program.setFloatsUniformIfPresent("uAmount", floatArrayOf(LiveParams.get(liveKey)?.getOrNull(0) ?: spec.amount))
      program.setFloatsUniformIfPresent("uP0", floatArrayOf(lut.domainMin[0], lut.domainMin[1], lut.domainMin[2], 0f))
      program.setFloatsUniformIfPresent("uP1", floatArrayOf(lut.domainMax[0], lut.domainMax[1], lut.domainMax[2], 0f))
      program.bindAttributesAndUniforms()
      GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4)
    } catch (e: GlUtil.GlException) {
      throw VideoFrameProcessingException(e, presentationTimeUs)
    }
  }

  override fun release() {
    super.release()
    try {
      GlUtil.deleteTexture(lutTex)
      program.delete()
    } catch (e: GlUtil.GlException) {
      throw VideoFrameProcessingException(e)
    }
  }
}
