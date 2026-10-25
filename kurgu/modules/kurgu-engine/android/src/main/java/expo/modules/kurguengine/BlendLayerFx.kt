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
import java.util.concurrent.Executors
import java.util.concurrent.Future
import java.util.concurrent.TimeUnit
import kotlin.math.max
import kotlin.math.min

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

  /** Görseli kompozisyon kurulurken arka planda hazırlatır (ilk kare GL iş parçacığını bekletmesin). */
  fun prefetch(context: Context) {
    BlendPixels.get(context, layer.uri, longSide(canvasW, canvasH, liveKey != null))
  }

  companion object {
    /** Önizlemede kanvas boyutu yeter; dışa aktarmada yakınlaştırılmış katman için 2048. */
    fun longSide(canvasW: Int, canvasH: Int, live: Boolean): Int = if (live) min(2048, max(canvasW, canvasH)) else 2048
  }
}

/**
 * Karışım katmanı görsellerinin GL'ye hazır pikselleri: düz (ön çarpılmamış) alfa, RGBA bayt
 * sırası, alt satır başta (_layer.glsl düz alfa bekler, GL doku koordinatında t=0 alt kenardır).
 * Önizleme her düzenlemede yeniden kurulduğundan son birkaç görsel saklanır. Hazırlık GL
 * iş parçacığında yapılırsa (büyük görsel, emülatör) Media3'ün 500 ms'lik eşzamanlı çağrıları
 * zaman aşımına uğrar (CI #82: önizleme TimeoutException).
 */
internal object BlendPixels {
  class Pixels(val w: Int, val h: Int, val data: ByteBuffer)

  private val pool = Executors.newSingleThreadExecutor { r -> Thread(r, "KurguBlendPixels") }
  private val cache = object : LinkedHashMap<String, Future<Pixels?>>(4, 0.75f, true) {
    override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, Future<Pixels?>>?) = size > 3
  }

  fun get(context: Context, uri: String, longSide: Int): Future<Pixels?> {
    val app = context.applicationContext
    return synchronized(cache) { cache.getOrPut("$uri#$longSide") { pool.submit<Pixels?> { load(app, uri, longSide) } } }
  }

  fun forget(uri: String, longSide: Int) {
    synchronized(cache) { cache.remove("$uri#$longSide") }
  }

  private fun load(context: Context, uri: String, longSide: Int): Pixels? {
    val bmp = PhotoRenderer.decode(context, uri, longSide) ?: return null
    val w = bmp.width
    val h = bmp.height
    val px = IntArray(w * h)
    // Negatif adım: satırlar alttan üste yazılır. getPixels düz alfa ARGB verir.
    bmp.getPixels(px, (h - 1) * w, -w, 0, 0, w, h)
    // 0xAARRGGBB -> 0xAABBGGRR: küçük uçlu bellekte R, G, B, A baytları
    for (i in px.indices) {
      val c = px[i]
      px[i] = (c and 0xFF00FF00.toInt()) or ((c ushr 16) and 0xFF) or ((c and 0xFF) shl 16)
    }
    val buf = ByteBuffer.allocateDirect(px.size * 4).order(ByteOrder.LITTLE_ENDIAN)
    buf.asIntBuffer().put(px)
    return Pixels(w, h, buf)
  }
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

  /** Görsel BlendPixels'te (arka planda, kompozisyon kurulurken) hazırlanır; burada yalnızca yüklenir. */
  private fun ensureTexture() {
    if (layerTex >= 0) return
    val longSide = BlendLayerFx.longSide(canvasW, canvasH, cmKey != null)
    val px = try {
      BlendPixels.get(context, layer.uri, longSide).get(20, TimeUnit.SECONDS)
    } catch (e: Exception) {
      null
    } ?: run {
      BlendPixels.forget(layer.uri, longSide)
      throw VideoFrameProcessingException("BLEND_IMAGE_DECODE")
    }
    srcW = px.w
    srcH = px.h
    val ids = IntArray(1)
    GLES20.glGenTextures(1, ids, 0)
    layerTex = ids[0]
    GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, layerTex)
    GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR)
    GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR)
    GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE)
    GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE)
    // Paylaşılan arabelleğin konumu değişmesin (önizleme ve dışa aktarma aynı anda okuyabilir)
    val data = px.data.duplicate().also { it.position(0) }
    GLES20.glTexImage2D(GLES20.GL_TEXTURE_2D, 0, GLES20.GL_RGBA, srcW, srcH, 0, GLES20.GL_RGBA, GLES20.GL_UNSIGNED_BYTE, data)
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
