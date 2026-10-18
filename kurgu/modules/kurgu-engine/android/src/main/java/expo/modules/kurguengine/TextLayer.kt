package expo.modules.kurguengine

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.text.Layout
import android.text.StaticLayout
import android.text.TextDirectionHeuristics
import android.text.TextPaint
import androidx.annotation.OptIn
import androidx.media3.common.OverlaySettings
import androidx.media3.common.util.Size
import androidx.media3.common.util.UnstableApi
import androidx.media3.effect.BitmapOverlay
import androidx.media3.effect.StaticOverlaySettings
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min

/**
 * Düzenlenebilir metin katmanının kareye çizilmiş hali. Metin Android'in metin
 * motoruyla çizilir; Arapça harf birleştirme ve sağdan sola yön burada doğal
 * olarak desteklenir. Boyutlar kare yüksekliğine göredir, bu yüzden önizleme ve
 * dışa aktarma çözünürlüğü farklı olsa da yerleşim aynı kalır.
 */
@OptIn(UnstableApi::class)
class TextLayerOverlay(private val spec: TextSpec) : BitmapOverlay() {
  private var frame = Size(1080, 1920)
  private var full: Bitmap? = null
  private var partial: Bitmap? = null
  private var partialCount = -1
  private val empty: Bitmap by lazy { Bitmap.createBitmap(2, 2, Bitmap.Config.ARGB_8888) }

  override fun configure(videoSize: Size) {
    super.configure(videoSize)
    if (videoSize.width != frame.width || videoSize.height != frame.height) {
      frame = videoSize
      full = null
      partial = null
      partialCount = -1
    }
  }

  override fun getBitmap(presentationTimeUs: Long): Bitmap {
    if (spec.text.isEmpty()) return empty
    if (spec.animIn == "typewriter") {
      val tMs = presentationTimeUs / 1000L
      val dur = max(1L, min(spec.animMs * 3, spec.endMs - spec.startMs))
      val p = ((tMs - spec.startMs).toFloat() / dur).coerceIn(0f, 1f)
      val count = ceil(spec.text.length * p).toInt().coerceIn(0, spec.text.length)
      if (count < spec.text.length) {
        if (count != partialCount) {
          partial?.recycle()
          partial = render(spec.text.substring(0, max(count, 0)), measureText = spec.text)
          partialCount = count
        }
        return partial ?: empty
      }
    }
    return full ?: render(spec.text, spec.text).also { full = it }
  }

  override fun getOverlaySettings(presentationTimeUs: Long): OverlaySettings {
    val tMs = presentationTimeUs / 1000L
    var alpha = spec.opacity.coerceIn(0f, 1f)
    var scale = spec.scale
    var dy = 0f
    var dx = 0f
    if (tMs < spec.startMs || tMs >= spec.endMs) {
      alpha = 0f
    } else {
      val anim = max(1L, spec.animMs).toFloat()
      val pin = ((tMs - spec.startMs) / anim).coerceIn(0f, 1f)
      val pout = ((spec.endMs - tMs) / anim).coerceIn(0f, 1f)
      when (spec.animIn) {
        "fade" -> alpha *= pin
        "pop" -> { scale *= 0.6f + 0.4f * easeOutBack(pin); alpha *= min(1f, pin * 2f) }
        "slideUp" -> { dy -= 0.2f * (1f - easeOut(pin)); alpha *= pin }
        "slideLeft" -> { dx += 0.3f * (1f - easeOut(pin)); alpha *= pin }
      }
      when (spec.animOut) {
        "fade" -> alpha *= pout
        "pop" -> { scale *= 0.6f + 0.4f * pout; alpha *= pout }
        "slideUp" -> { dy += 0.2f * (1f - easeOut(pout)); alpha *= pout }
        "slideLeft" -> { dx -= 0.3f * (1f - easeOut(pout)); alpha *= pout }
      }
    }
    return StaticOverlaySettings.Builder()
      .setAlphaScale(max(0f, alpha))
      .setBackgroundFrameAnchor(spec.x + dx, spec.y + dy)
      .setOverlayFrameAnchor(0f, 0f)
      .setScale(max(0.01f, scale), max(0.01f, scale))
      .setRotationDegrees(-spec.rotation)
      .build()
  }

  private fun render(text: String, measureText: String): Bitmap {
    val h = frame.height.toFloat()
    val textSize = max(4f, spec.sizeRel * h)
    val paint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
      this.textSize = textSize
      typeface = typeface()
      letterSpacing = spec.letterSpacing
      color = spec.color
    }
    if (spec.shadow) paint.setShadowLayer(textSize * 0.08f, 0f, textSize * 0.05f, Color.argb(160, 0, 0, 0))

    val maxWidth = max(1, (frame.width * 0.92f / max(0.2f, spec.scale)).toInt())
    // Satır kırılımları tam metne göre hesaplanır; daktilo animasyonunda kutu zıplamaz.
    val measureLayout = buildLayout(measureText, paint, maxWidth)
    var contentW = 0f
    for (i in 0 until measureLayout.lineCount) contentW = max(contentW, measureLayout.getLineWidth(i))
    val layoutW = max(1, ceil(contentW).toInt())
    val layout = buildLayout(text, paint, layoutW)
    val drawLayout = buildLayout(measureText, paint, layoutW)

    val strokeW = spec.strokeWidthRel * h
    val pad = textSize * (if (Color.alpha(spec.background) > 0) 0.35f else 0.1f) + strokeW + textSize * 0.1f
    val w = (layoutW + pad * 2).toInt().coerceIn(2, 8192)
    val bh = (drawLayout.height + pad * 2).toInt().coerceIn(2, 8192)
    val bmp = Bitmap.createBitmap(w, bh, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bmp)

    if (Color.alpha(spec.background) > 0) {
      val bg = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = spec.background }
      val r = textSize * 0.25f
      canvas.drawRoundRect(RectF(0f, 0f, w.toFloat(), bh.toFloat()), r, r, bg)
    }
    canvas.save()
    canvas.translate(pad, pad)
    if (strokeW > 0f && Color.alpha(spec.stroke) > 0) {
      val strokePaint = TextPaint(paint).apply {
        style = Paint.Style.STROKE
        strokeWidth = strokeW * 2f
        strokeJoin = Paint.Join.ROUND
        color = spec.stroke
      }
      buildLayout(text, strokePaint, layoutW).draw(canvas)
      paint.clearShadowLayer()
    }
    layout.draw(canvas)
    canvas.restore()
    return bmp
  }

  private fun buildLayout(text: String, paint: TextPaint, width: Int): StaticLayout {
    val rtl = TextDirectionHeuristics.FIRSTSTRONG_LTR.isRtl(text, 0, text.length) || (text.isEmpty() && spec.rtl)
    val align = when (spec.align) {
      "left" -> if (rtl) Layout.Alignment.ALIGN_OPPOSITE else Layout.Alignment.ALIGN_NORMAL
      "right" -> if (rtl) Layout.Alignment.ALIGN_NORMAL else Layout.Alignment.ALIGN_OPPOSITE
      else -> Layout.Alignment.ALIGN_CENTER
    }
    return StaticLayout.Builder.obtain(text, 0, text.length, paint, width)
      .setAlignment(align)
      .setTextDirection(TextDirectionHeuristics.FIRSTSTRONG_LTR)
      .setLineSpacing(0f, spec.lineHeight.coerceIn(0.6f, 3f) / 1.2f)
      .setIncludePad(true)
      .build()
  }

  private fun typeface(): Typeface {
    val style = when {
      spec.bold && spec.italic -> Typeface.BOLD_ITALIC
      spec.bold -> Typeface.BOLD
      spec.italic -> Typeface.ITALIC
      else -> Typeface.NORMAL
    }
    val family = when (spec.font) {
      "serif" -> "serif"
      "mono" -> "monospace"
      "condensed" -> "sans-serif-condensed"
      "display" -> "sans-serif-black"
      "light" -> "sans-serif-light"
      "casual" -> "casual"
      "cursive" -> "cursive"
      else -> "sans-serif"
    }
    return Typeface.create(family, style)
  }

  override fun release() {
    super.release()
    full?.recycle()
    partial?.recycle()
    full = null
    partial = null
  }

  private fun easeOut(x: Float): Float = 1f - (1f - x) * (1f - x)

  private fun easeOutBack(x: Float): Float {
    val c1 = 1.70158f
    val c3 = c1 + 1f
    val t = x - 1f
    return 1f + c3 * t * t * t + c1 * t * t
  }
}
