package expo.modules.kurguengine

import android.graphics.Bitmap
import android.graphics.BlurMaskFilter
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Shader
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
import expo.modules.kurguengine.anim.Keyframes
import expo.modules.kurguengine.anim.TextAnim
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Düzenlenebilir metin katmanının kareye çizilmiş hali. Metin Android'in metin
 * motoruyla çizilir; Arapça harf birleştirme ve sağdan sola yön burada doğal
 * olarak desteklenir. Boyutlar kare yüksekliğine göredir, bu yüzden önizleme ve
 * dışa aktarma çözünürlüğü farklı olsa da yerleşim aynı kalır.
 *
 * Animasyonlar (hesap: anim/TextAnim.java):
 *  - Bütün metin animasyonları yalnızca katman ayarlarını değiştirir (bit eşlem önbellekte).
 *  - Kelime/harf animasyonları önbellekteki yazı bit eşleminden parça parça kopyalar;
 *    metin yeniden şekillendirilmez. Sağdan sola / birleşen yazılarda harf yerine kelime.
 *  - Bulanıklık ve daktilo yalnızca kendi pencerelerinde yeniden çizer.
 * Animasyon kareleri iki tampon arasında dönüşümlü çizilir; kenar payları simetrik
 * olduğundan katman merkezi (ve metnin yeri) değişmez.
 */
@OptIn(UnstableApi::class)
class TextLayerOverlay(private val spec: TextSpec) : BitmapOverlay() {
  private var frame = Size(1080, 1920)
  private var geo: Geo? = null
  private var full: Bitmap? = null
  private var fullCursor: Bitmap? = null
  private var partial: Bitmap? = null
  private var partialKey = -1
  private var glyphs: Bitmap? = null
  private var base: Bitmap? = null
  private var pieces: List<Piece>? = null
  private var piecesWords = false
  private val animBuf = arrayOfNulls<Bitmap>(2)
  private val animCanvas = arrayOfNulls<Canvas>(2)
  private var animIdx = 0
  private var lastAnimKey = Long.MIN_VALUE
  private var lastAnim: Bitmap? = null
  private val empty: Bitmap by lazy { Bitmap.createBitmap(2, 2, Bitmap.Config.ARGB_8888) }

  private val durMs = max(1L, spec.endMs - spec.startMs)
  private val windows = TextAnim.windows(spec.animIn, spec.animOut, spec.animMs, durMs)
  private val modeIn = TextAnim.mode(spec.animIn)
  private val modeOut = TextAnim.mode(spec.animOut)
  private val modeLoop = TextAnim.loopMode(spec.animLoop)
  private val cursorAnim = spec.animIn == "typeCursor" || spec.animOut == "typeCursor"
  private val graphemes: IntArray by lazy { TextAnim.graphemeBounds(spec.text) }
  private val state = TextAnim.State()
  private val blurState = TextAnim.State()
  private val unitState = TextAnim.State()
  private val blitPaint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
  private val srcRect = Rect()
  private val dstRect = RectF()

  /** Bir canlandırma biriminin (kelime/harf) bir satırdaki parçası; dikdörtgen yazı bit eşlemi koordinatında. */
  private class Piece(val index: Int, val count: Int, val rect: Rect)

  override fun configure(videoSize: Size) {
    super.configure(videoSize)
    if (videoSize.width != frame.width || videoSize.height != frame.height) {
      frame = videoSize
      geo = null
      full = null
      fullCursor = null
      partial = null
      partialKey = -1
      glyphs = null
      base = null
      pieces = null
      animBuf[0] = null
      animBuf[1] = null
      animCanvas[0] = null
      animCanvas[1] = null
      lastAnim = null
      lastAnimKey = Long.MIN_VALUE
    }
  }

  override fun getBitmap(presentationTimeUs: Long): Bitmap {
    if (spec.text.isEmpty()) return empty
    val tMs = presentationTimeUs / 1000L
    val since = tMs - spec.startMs
    val until = spec.endMs - tMs
    val inside = since >= 0 && until > 0
    val pin = (since.toFloat() / windows[0]).coerceIn(0f, 1f)
    val pout = (until.toFloat() / windows[1]).coerceIn(0f, 1f)
    val inActive = inside && since < windows[0]
    val outActive = inside && until < windows[1]

    // 1) Daktilo (imleçli/imleçsiz) ve silme
    val typeIn = modeIn == TextAnim.MODE_TYPE && since < windows[0]
    val typeOut = modeOut == TextAnim.MODE_TYPE && until < windows[1]
    // İmleç metin boyunca yanıp söner; diğer uçta bulanıklık/birim animasyonu oynarken çekilir.
    val otherActive = (inActive && (modeIn == TextAnim.MODE_BLUR || modeIn == TextAnim.MODE_UNITS)) ||
      (outActive && (modeOut == TextAnim.MODE_BLUR || modeOut == TextAnim.MODE_UNITS))
    if (typeIn || typeOut || (cursorAnim && !otherActive)) {
      val n = graphemes.size - 1
      var count = n
      if (typeIn) count = min(count, TextAnim.typedCount(pin, n))
      if (typeOut) count = min(count, TextAnim.typedCount(pout, n))
      val cursor = cursorAnim && TextAnim.cursorOn(since, count < n)
      if (count < n) return partialBitmap(count, cursor)
      if (cursor) return fullCursor ?: renderFull(withCursor = true).also { fullCursor = it }
      return fullBitmap()
    }

    // 2) Bulanıklık
    if (inActive && modeIn == TextAnim.MODE_BLUR || outActive && modeOut == TextAnim.MODE_BLUR) {
      val bs = blurState.reset()
      if (inActive) TextAnim.applyIn(spec.animIn, pin, bs)
      if (outActive) TextAnim.applyOut(spec.animOut, pout, bs)
      if (bs.blur > 0.004f) {
        val q = (bs.blur * 256f).roundToInt()
        return animFrame(1L + 4L * q) { c, g, mx, my -> drawBlurred(c, g, mx, my, q / 256f) }
      }
      return fullBitmap()
    }

    // 3) Kelime / harf animasyonları
    val unitsIn = inActive && modeIn == TextAnim.MODE_UNITS
    val unitsOut = outActive && modeOut == TextAnim.MODE_UNITS
    val unitsLoop = inside && modeLoop == TextAnim.MODE_UNITS
    if (unitsIn || unitsOut || unitsLoop) {
      val words = (unitsIn && TextAnim.wantsWords(spec.animIn)) || (unitsOut && TextAnim.wantsWords(spec.animOut))
      return animFrame(2L + 4L * tMs) { c, g, mx, my ->
        drawUnits(c, g, mx, my, words, if (unitsIn) pin else -1f, if (unitsOut) pout else -1f, if (unitsLoop) since / 1000f else -1f)
      }
    }
    return fullBitmap()
  }

  override fun getOverlaySettings(presentationTimeUs: Long): OverlaySettings {
    val tMs = presentationTimeUs / 1000L
    val s = state.reset()
    // Anahtar kareler metnin başına göre; iz yoksa sabit değer
    val local = (tMs - spec.startMs).toDouble()
    val kf = spec.keyframes
    val x = if (kf.isEmpty()) spec.x else Keyframes.valueAt(kf["x"], local, spec.x)
    val y = if (kf.isEmpty()) spec.y else Keyframes.valueAt(kf["y"], local, spec.y)
    val rotation = if (kf.isEmpty()) spec.rotation else Keyframes.valueAt(kf["rotation"], local, spec.rotation)
    s.alpha = (if (kf.isEmpty()) spec.opacity else Keyframes.valueAt(kf["opacity"], local, spec.opacity)).coerceIn(0f, 1f)
    s.scale = if (kf.isEmpty()) spec.scale else Keyframes.valueAt(kf["scale"], local, spec.scale)
    if (tMs < spec.startMs || tMs >= spec.endMs) {
      s.alpha = 0f
    } else {
      val since = tMs - spec.startMs
      val pin = (since.toFloat() / windows[0]).coerceIn(0f, 1f)
      val pout = ((spec.endMs - tMs).toFloat() / windows[1]).coerceIn(0f, 1f)
      TextAnim.applyIn(spec.animIn, pin, s)
      TextAnim.applyOut(spec.animOut, pout, s)
      TextAnim.applyLoop(spec.animLoop, since / 1000f, s)
    }
    return StaticOverlaySettings.Builder()
      .setAlphaScale(max(0f, min(1f, s.alpha)))
      .setBackgroundFrameAnchor(x + s.dx, y + s.dy)
      .setOverlayFrameAnchor(0f, 0f)
      .setScale(max(0.01f, s.scale), max(0.01f, s.scale))
      .setRotationDegrees(-(rotation + s.rot))
      .build()
  }

  // ---------------------------------------------------------------------------
  // Yerleşim

  /** Tam metnin ölçüleri, boyaları ve yerleşimi (kare boyutu değişene kadar önbellekte). */
  private inner class Geo {
    val h = frame.height.toFloat()
    val ts = max(4f, spec.sizeRel * h)
    val paint = TextPaint(Paint.ANTI_ALIAS_FLAG)
    val bgPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    val decoPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    var boxPath: Path? = null
    val strokePaint: TextPaint?
    val strokeW = spec.strokeWidthRel * h
    val hasBox = Color.alpha(spec.background) > 0
    val rtl: Boolean
    val layoutW: Int
    val layout: StaticLayout
    val strokeLayout: StaticLayout?
    val textTop: Float
    val textBottom: Float
    val padL: Float
    val padR: Float
    val padT: Float
    val padB: Float
    val w: Int
    val bh: Int

    init {
      paint.textSize = ts
      paint.typeface = typeface()
      paint.letterSpacing = spec.letterSpacing
      paint.color = spec.color
      if (spec.shadow) {
        paint.setShadowLayer(max(0.1f, ts * spec.shadowBlur), ts * spec.shadowX, ts * spec.shadowY, spec.shadowColor)
      }
      val text = spec.text
      rtl = isRtl(text)
      val maxWidth = max(1, (frame.width * 0.92f / max(0.2f, spec.scale)).toInt())
      val measureLayout = buildLayout(text, paint, maxWidth)
      var contentW = 0f
      for (i in 0 until measureLayout.lineCount) contentW = max(contentW, measureLayout.getLineWidth(i))
      layoutW = max(1, ceil(contentW).toInt())

      val hasStroke = strokeW > 0f && Color.alpha(spec.stroke) > 0
      strokePaint = if (hasStroke) {
        TextPaint(paint).apply {
          style = Paint.Style.STROKE
          strokeWidth = strokeW * 2f
          strokeJoin = Paint.Join.ROUND
          color = spec.stroke
        }
      } else null
      // Konturlu metinde gölgeyi kontur taşır (eski çizimle aynı).
      if (hasStroke) paint.clearShadowLayer()
      layout = buildLayout(text, paint, layoutW)
      strokeLayout = strokePaint?.let { buildLayout(text, it, layoutW) }
      val fm = paint.fontMetrics
      textTop = if (layout.lineCount > 0) layout.getLineBaseline(0) + fm.ascent else 0f
      textBottom = if (layout.lineCount > 0) layout.getLineBaseline(layout.lineCount - 1) + fm.descent else layout.height.toFloat()
      if (Color.alpha(spec.color2) > 0) {
        paint.shader = LinearGradient(0f, textTop, 0f, textBottom, spec.color, spec.color2, Shader.TileMode.CLAMP)
      }

      // Kenar payı: eski hesap + (varsa) büyük gölge/parıltı + süs alanı
      var pad = ts * (if (hasBox) spec.boxPad else 0.1f) + strokeW + ts * 0.1f
      if (spec.shadow) {
        val reach = spec.shadowBlur + max(abs(spec.shadowX), abs(spec.shadowY))
        if (reach > 0.13f) pad += ts * (reach - 0.13f)
      }
      var l = pad
      var r = pad
      var t = pad
      var b = pad
      when (spec.deco) {
        "bar" -> {
          val extra = ts * (BAR_W + if (hasBox) 0.12f else 0.3f)
          if (rtl) r += extra else l += extra
        }
        "underline" -> b += ts * 0.45f
        "rules" -> {
          t += ts * 0.4f
          b += ts * 0.4f
        }
        "brackets" -> {
          l += ts * 0.3f
          r += ts * 0.3f
          t += ts * 0.3f
          b += ts * 0.3f
        }
      }
      padL = l
      padR = r
      padT = t
      padB = b
      // (padL + padR) önce toplanır: kenarlar eşitken eski "pad * 2" ile birebir aynı sonuç
      w = (layoutW + (padL + padR)).toInt().coerceIn(2, 8192)
      bh = (layout.height + (padT + padB)).toInt().coerceIn(2, 8192)
      bgPaint.color = spec.background
      decoPaint.color = spec.decoColor
    }

    fun setBlur(radius: Float) {
      val f = if (radius >= 0.5f) BlurMaskFilter(radius, BlurMaskFilter.Blur.NORMAL) else null
      paint.maskFilter = f
      strokePaint?.maskFilter = f
      bgPaint.maskFilter = f
      decoPaint.maskFilter = f
    }
  }

  private fun geometry(): Geo = geo ?: Geo().also { geo = it }

  private fun isRtl(text: String): Boolean =
    TextDirectionHeuristics.FIRSTSTRONG_LTR.isRtl(text, 0, text.length) || (text.isEmpty() && spec.rtl)

  private fun buildLayout(text: String, paint: TextPaint, width: Int): StaticLayout {
    val rtl = isRtl(text)
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

  // ---------------------------------------------------------------------------
  // Çizim

  /** Kutu ve süsler (metnin altı). Koordinatlar metin bit eşleminin sol üstüne göre. */
  private fun drawBase(c: Canvas, g: Geo) {
    val w = g.w.toFloat()
    val bh = g.bh.toFloat()
    val ts = g.ts
    val radius = ts * spec.boxRadius
    if (g.hasBox) {
      when (spec.boxStyle) {
        "lines" -> {
          val path = linesPath(g)
          c.drawPath(path, g.bgPaint)
          g.boxPath = path
        }
        "frame" -> {
          val th = max(2f, ts * 0.06f)
          val stroke = Paint(g.bgPaint).apply {
            style = Paint.Style.STROKE
            strokeWidth = th
          }
          c.drawRoundRect(RectF(th / 2f, th / 2f, w - th / 2f, bh - th / 2f), radius, radius, stroke)
        }
        else -> c.drawRoundRect(RectF(0f, 0f, w, bh), radius, radius, g.bgPaint)
      }
    }
    if (Color.alpha(spec.decoColor) == 0) return
    val top = g.padT + g.textTop
    val bottom = g.padT + g.textBottom
    when (spec.deco) {
      "bar" -> {
        val bw = ts * BAR_W
        if (g.hasBox && spec.boxStyle == "block") {
          // Kutunun başlangıç kenarında, kutu köşelerine kırpılmış şerit
          c.save()
          val clip = Path().apply { addRoundRect(RectF(0f, 0f, w, bh), radius, radius, Path.Direction.CW) }
          c.clipPath(clip)
          if (g.rtl) c.drawRect(w - bw, 0f, w, bh, g.decoPaint) else c.drawRect(0f, 0f, bw, bh, g.decoPaint)
          c.restore()
        } else {
          val gap = ts * (if (g.hasBox) 0.12f else 0.3f)
          val x0 = if (g.rtl) g.padL + g.layoutW + gap else g.padL - gap - bw
          c.drawRoundRect(RectF(x0, top - ts * 0.05f, x0 + bw, bottom + ts * 0.05f), bw / 2f, bw / 2f, g.decoPaint)
        }
      }
      "underline" -> {
        val uw = min(g.layoutW.toFloat(), ts * 2.4f)
        val uh = ts * 0.09f
        val (minL, maxR) = lineExtent(g)
        val x0 = when (spec.align) {
          "left" -> g.padL + minL
          "right" -> g.padL + maxR - uw
          else -> (g.padL + (minL + maxR) / 2f) - uw / 2f
        }
        val y0 = bottom + ts * 0.2f
        c.drawRoundRect(RectF(x0, y0, x0 + uw, y0 + uh), uh / 2f, uh / 2f, g.decoPaint)
      }
      "rules" -> {
        val th = max(1.5f, ts * 0.035f)
        val x0 = g.padL
        val x1 = g.padL + g.layoutW
        c.drawRect(x0, top - ts * 0.25f - th, x1, top - ts * 0.25f, g.decoPaint)
        c.drawRect(x0, bottom + ts * 0.25f, x1, bottom + ts * 0.25f + th, g.decoPaint)
      }
      "brackets" -> {
        val l = g.padL - ts * 0.25f
        val t = top - ts * 0.2f
        val r = g.padL + g.layoutW + ts * 0.25f
        val b = bottom + ts * 0.2f
        val th = ts * 0.07f
        val arm = min(ts * 0.7f, (r - l) / 3f)
        c.drawRect(l, t, l + arm, t + th, g.decoPaint)
        c.drawRect(l, t, l + th, t + arm, g.decoPaint)
        c.drawRect(r - arm, b - th, r, b, g.decoPaint)
        c.drawRect(r - th, b - arm, r, b, g.decoPaint)
      }
    }
  }

  private fun lineExtent(g: Geo): Pair<Float, Float> {
    var minL = Float.MAX_VALUE
    var maxR = -Float.MAX_VALUE
    for (i in 0 until g.layout.lineCount) {
      minL = min(minL, g.layout.getLineLeft(i))
      maxR = max(maxR, g.layout.getLineRight(i))
    }
    if (minL > maxR) return Pair(0f, g.layoutW.toFloat())
    return Pair(minL, maxR)
  }

  /** Satır satır vurgu kutusu: satır kutularının birleşimi (üst üste binen yerlerde çift saydamlık olmaz). */
  private fun linesPath(g: Geo): Path {
    g.boxPath?.let { return it }
    val out = Path()
    val fm = g.paint.fontMetrics
    val padX = g.ts * spec.boxPad
    val padY = g.ts * 0.12f
    val radius = g.ts * spec.boxRadius
    for (i in 0 until g.layout.lineCount) {
      val left = g.layout.getLineLeft(i)
      val right = g.layout.getLineRight(i)
      if (right - left < 0.5f) continue
      val base = g.layout.getLineBaseline(i).toFloat()
      val rect = RectF(
        g.padL + left - padX,
        g.padT + base + fm.ascent - padY,
        g.padL + right + padX,
        g.padT + base + fm.descent + padY,
      )
      val p = Path().apply { addRoundRect(rect, radius, radius, Path.Direction.CW) }
      out.op(p, Path.Op.UNION)
    }
    return out
  }

  private fun drawText(c: Canvas, g: Geo, fill: Layout, stroke: Layout?) {
    c.save()
    c.translate(g.padL, g.padT)
    stroke?.draw(c)
    fill.draw(c)
    c.restore()
  }

  private fun drawCursor(c: Canvas, g: Geo, l: Layout, offset: Int) {
    val fm = g.paint.fontMetrics
    val line = l.getLineForOffset(offset)
    val x = l.getPrimaryHorizontal(offset)
    val baseline = l.getLineBaseline(line).toFloat()
    val cw = max(2f, g.ts * 0.07f)
    val gap = g.ts * 0.05f
    val rtl = l.getParagraphDirection(line) == Layout.DIR_RIGHT_TO_LEFT
    val x0 = if (rtl) x - gap - cw else x + gap
    val cursorPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = spec.color }
    c.drawRect(g.padL + x0, g.padT + baseline + fm.ascent * 0.8f, g.padL + x0 + cw, g.padT + baseline + fm.descent * 0.5f, cursorPaint)
  }

  private fun newBitmap(g: Geo): Bitmap = Bitmap.createBitmap(g.w, g.bh, Bitmap.Config.ARGB_8888)

  private fun fullBitmap(): Bitmap = full ?: renderFull(withCursor = false).also { full = it }

  private fun renderFull(withCursor: Boolean): Bitmap {
    val g = geometry()
    val bmp = newBitmap(g)
    val c = Canvas(bmp)
    drawBase(c, g)
    drawText(c, g, g.layout, g.strokeLayout)
    if (withCursor) drawCursor(c, g, g.layout, spec.text.length)
    return bmp
  }

  /** Daktilo karesi: satır kırılımı ve kutu tam metne göre, görünen kısım ilk `count` grafem. */
  private fun partialBitmap(count: Int, cursor: Boolean): Bitmap {
    val key = count * 2 + if (cursor) 1 else 0
    if (key == partialKey) partial?.let { return it }
    val g = geometry()
    val end = graphemes[count.coerceIn(0, graphemes.size - 1)]
    val text = spec.text.substring(0, end)
    val fill = buildLayout(text, g.paint, g.layoutW)
    val stroke = g.strokePaint?.let { buildLayout(text, it, g.layoutW) }
    val bmp = newBitmap(g)
    val c = Canvas(bmp)
    drawBase(c, g)
    drawText(c, g, fill, stroke)
    if (cursor) drawCursor(c, g, fill, text.length)
    partial?.recycle()
    partial = bmp
    partialKey = key
    return bmp
  }

  /** Animasyon karesi: iki tampondan sıradakine çizer; aynı anahtar için yeniden çizmez. */
  private inline fun animFrame(key: Long, draw: (Canvas, Geo, Float, Float) -> Unit): Bitmap {
    if (key == lastAnimKey) lastAnim?.let { return it }
    val g = geometry()
    var mx = 0f
    var my = 0f
    if (modeIn == TextAnim.MODE_UNITS || modeOut == TextAnim.MODE_UNITS || modeLoop == TextAnim.MODE_UNITS) {
      mx = max(mx, g.ts * TextAnim.unitMarginX())
      my = max(my, g.ts * TextAnim.unitMarginY())
    }
    if (modeIn == TextAnim.MODE_BLUR || modeOut == TextAnim.MODE_BLUR) {
      val m = g.ts * TextAnim.blurRadius() * 1.4f
      mx = max(mx, m)
      my = max(my, m)
    }
    val mxi = ceil(mx).toInt()
    val myi = ceil(my).toInt()
    val bw = (g.w + 2 * mxi).coerceAtMost(8192)
    val bh = (g.bh + 2 * myi).coerceAtMost(8192)
    animIdx = 1 - animIdx
    var bmp = animBuf[animIdx]
    if (bmp == null || bmp.width != bw || bmp.height != bh) {
      bmp = Bitmap.createBitmap(bw, bh, Bitmap.Config.ARGB_8888)
      animBuf[animIdx] = bmp
      animCanvas[animIdx] = Canvas(bmp)
    } else {
      bmp.eraseColor(Color.TRANSPARENT)
    }
    draw(animCanvas[animIdx]!!, g, mxi.toFloat(), myi.toFloat())
    lastAnimKey = key
    lastAnim = bmp
    return bmp
  }

  private fun drawBlurred(c: Canvas, g: Geo, mx: Float, my: Float, amount: Float) {
    g.setBlur(amount * g.ts * TextAnim.blurRadius())
    try {
      c.save()
      c.translate(mx, my)
      drawBase(c, g)
      drawText(c, g, g.layout, g.strokeLayout)
      c.restore()
    } finally {
      g.setBlur(0f)
    }
  }

  private fun drawUnits(c: Canvas, g: Geo, mx: Float, my: Float, words: Boolean, pin: Float, pout: Float, loopSec: Float) {
    val baseBmp = base ?: newBitmap(g).also { drawBase(Canvas(it), g); base = it }
    val glyphBmp = glyphs ?: newBitmap(g).also { drawText(Canvas(it), g, g.layout, g.strokeLayout); glyphs = it }
    var baseAlpha = 1f
    if (pin >= 0f && modeIn == TextAnim.MODE_UNITS) baseAlpha *= TextAnim.baseAlpha(pin)
    if (pout >= 0f && modeOut == TextAnim.MODE_UNITS) baseAlpha *= TextAnim.baseAlpha(pout)
    if (baseAlpha > 0.004f) {
      blitPaint.alpha = (baseAlpha * 255f).roundToInt().coerceIn(0, 255)
      c.drawBitmap(baseBmp, mx, my, blitPaint)
    }
    for (pc in unitPieces(g, words)) {
      val s = unitState.reset()
      if (pin >= 0f) TextAnim.unitIn(spec.animIn, pin, pc.index, pc.count, s)
      if (pout >= 0f) TextAnim.unitOut(spec.animOut, pout, pc.index, pc.count, s)
      if (loopSec >= 0f) TextAnim.unitLoop(spec.animLoop, loopSec, pc.index, s)
      if (s.alpha <= 0.004f) continue
      val r = pc.rect
      val hw = r.width() / 2f
      val hh = r.height() / 2f
      c.save()
      c.translate(mx + r.exactCenterX() + s.dx * g.ts, my + r.exactCenterY() + s.dy * g.ts)
      if (s.rot != 0f) c.rotate(s.rot)
      if (s.scale != 1f) c.scale(s.scale, s.scale)
      srcRect.set(r)
      dstRect.set(-hw, -hh, hw, hh)
      blitPaint.alpha = (min(1f, s.alpha) * 255f).roundToInt().coerceIn(0, 255)
      c.drawBitmap(glyphBmp, srcRect, dstRect, blitPaint)
      c.restore()
    }
  }

  /**
   * Birimlerin yazı bit eşlemindeki dikdörtgenleri. Glifler tam satırdan (şekillendirilmiş
   * hâliyle) kesilir; satır başı/sonu birimleri gölge ve kontur için kenara kadar uzar.
   */
  private fun unitPieces(g: Geo, words: Boolean): List<Piece> {
    pieces?.let { if (piecesWords == words) return it }
    val text = spec.text
    val l = g.layout
    val u = TextAnim.units(text, words)
    val n = u.size / 2
    val out = ArrayList<Piece>(n)
    val wordUnits = words || TextAnim.isComplexScript(text)
    val ext = if (wordUnits) min(g.strokeW + g.ts * 0.1f, g.paint.measureText(" ") * 0.5f) else 0f
    val lastLine = l.lineCount - 1
    for (k in 0 until n) {
      var a = u[2 * k]
      val e = u[2 * k + 1]
      while (a < e) {
        val line = l.getLineForOffset(a)
        val le = l.getLineEnd(line)
        val b = min(e, le)
        if (b <= a) break
        val x1 = l.getPrimaryHorizontal(a)
        val x2 = if (b < le || line == lastLine) {
          l.getPrimaryHorizontal(b)
        } else if (l.getParagraphDirection(line) == Layout.DIR_RIGHT_TO_LEFT) {
          l.getLineLeft(line)
        } else {
          l.getLineRight(line)
        }
        val lo = min(x1, x2)
        val hi = max(x1, x2)
        var left = lo - ext
        var right = hi + ext
        if (lo <= l.getLineLeft(line) + 0.5f) left = -g.padL
        if (hi >= l.getLineRight(line) - 0.5f) right = g.layoutW + g.padR
        val top = if (line == 0) -g.padT else l.getLineTop(line).toFloat()
        val bottom = if (line == lastLine) l.height + g.padB else l.getLineBottom(line).toFloat()
        val rect = Rect(
          (left + g.padL).roundToInt().coerceIn(0, g.w),
          (top + g.padT).roundToInt().coerceIn(0, g.bh),
          (right + g.padL).roundToInt().coerceIn(0, g.w),
          (bottom + g.padT).roundToInt().coerceIn(0, g.bh),
        )
        if (rect.width() > 0 && rect.height() > 0) out.add(Piece(k, n, rect))
        a = b
      }
    }
    pieces = out
    piecesWords = words
    return out
  }

  override fun release() {
    super.release()
    full?.recycle()
    fullCursor?.recycle()
    partial?.recycle()
    glyphs?.recycle()
    base?.recycle()
    animBuf[0]?.recycle()
    animBuf[1]?.recycle()
    full = null
    fullCursor = null
    partial = null
    glyphs = null
    base = null
    animBuf[0] = null
    animBuf[1] = null
    animCanvas[0] = null
    animCanvas[1] = null
    lastAnim = null
  }

  private companion object {
    // Yan şerit genişliği (yazı boyu cinsinden)
    const val BAR_W = 0.14f
  }
}
