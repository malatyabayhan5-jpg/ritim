package expo.modules.kurguengine

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.BlendMode
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.RectF
import android.graphics.Typeface
import android.media.ExifInterface
import android.net.Uri
import android.os.Build
import android.text.Layout
import android.text.StaticLayout
import android.text.TextDirectionHeuristics
import android.text.TextPaint
import android.util.LruCache
import expo.modules.kurguengine.vision.ImageOps
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sin

/**
 * Fotoğraf projesi çizicisi (src/model/photo.js photoSpec). Kaynaklar değişmez:
 * her çağrıda katmanlar kaynaktan yeniden çizilir (önizleme küçük boyutta,
 * dışa aktarma tam boyutta). Görüntü işlemleri vision/ImageOps.java'dadır.
 */
object PhotoRenderer {
  // Çözülmüş kaynak görseller (uri + örnekleme) — önizlemede kaydırıcı sürüklerken yeniden çözülmez
  private val cache = object : LruCache<String, Bitmap>(64 * 1024 * 1024) {
    override fun sizeOf(key: String, value: Bitmap) = value.byteCount
  }

  fun render(context: Context, specJson: String, outPath: String, maxSide: Int, format: String, quality: Int): Map<String, Any> {
    val spec = JSONObject(specJson)
    val cw = spec.optInt("width", 1080)
    val ch = spec.optInt("height", 1080)
    val k = min(1.0, maxSide.toDouble() / max(cw, ch))
    val ow = max(1, (cw * k).roundToInt())
    val oh = max(1, (ch * k).roundToInt())
    val out = Bitmap.createBitmap(ow, oh, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(out)
    canvas.drawColor(parseColor(spec.optString("background", "#000000FF")), PorterDuff.Mode.SRC)
    val layers = spec.optJSONArray("layers") ?: JSONArray()
    for (i in 0 until layers.length()) {
      val l = layers.optJSONObject(i) ?: continue
      when (l.optString("type")) {
        "image" -> drawImage(context, canvas, l, ow, oh)
        "text" -> drawText(canvas, l, ow, oh)
        "shape" -> drawShape(canvas, l, ow, oh)
      }
    }
    spec.optJSONObject("border")?.let { b ->
      val bw = b.optDouble("width", 0.0).toFloat() * min(ow, oh)
      if (bw > 0.5f) {
        val p = Paint(Paint.ANTI_ALIAS_FLAG).apply {
          style = Paint.Style.STROKE
          strokeWidth = bw
          color = parseColor(b.optString("color", "#FFFFFFFF"))
        }
        val r = b.optDouble("radius", 0.0).toFloat() * min(ow, oh) * 0.5f
        canvas.drawRoundRect(RectF(bw / 2, bw / 2, ow - bw / 2, oh - bw / 2), r, r, p)
      }
    }
    val f = File(outPath.removePrefix("file://"))
    f.parentFile?.mkdirs()
    FileOutputStream(f).use {
      out.compress(if (format == "png") Bitmap.CompressFormat.PNG else Bitmap.CompressFormat.JPEG, quality.coerceIn(40, 100), it)
    }
    out.recycle()
    return mapOf("path" to "file://" + f.absolutePath, "width" to ow, "height" to oh)
  }

  /** Katmanın merkez/dönüş/ölçek/çevirme dönüşümü (NDC konum, saat yönü döndürme). */
  private fun layerMatrix(l: JSONObject, ow: Int, oh: Int, contentW: Float, contentH: Float, drawW: Float, drawH: Float): Matrix {
    val m = Matrix()
    val sx = drawW / contentW * (if (l.optBoolean("flipH")) -1f else 1f)
    val sy = drawH / contentH * (if (l.optBoolean("flipV")) -1f else 1f)
    m.postTranslate(-contentW / 2f, -contentH / 2f)
    m.postScale(sx, sy)
    m.postRotate(l.optDouble("rotation", 0.0).toFloat())
    val cx = ((l.optDouble("x", 0.0) + 1) / 2 * ow).toFloat()
    val cy = ((1 - l.optDouble("y", 0.0)) / 2 * oh).toFloat()
    m.postTranslate(cx, cy)
    return m
  }

  private fun layerPaint(l: JSONObject): Paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG).apply {
    alpha = (l.optDouble("opacity", 1.0) * 255).roundToInt().coerceIn(0, 255)
    applyBlend(this, l.optString("blend", "normal"))
  }

  private fun applyBlend(p: Paint, mode: String) {
    if (mode == "normal") return
    if (Build.VERSION.SDK_INT >= 29) {
      p.blendMode = when (mode) {
        "multiply" -> BlendMode.MULTIPLY
        "screen" -> BlendMode.SCREEN
        "overlay" -> BlendMode.OVERLAY
        "darken" -> BlendMode.DARKEN
        "lighten" -> BlendMode.LIGHTEN
        "add" -> BlendMode.PLUS
        "difference" -> BlendMode.DIFFERENCE
        "softLight" -> BlendMode.SOFT_LIGHT
        "color" -> BlendMode.COLOR
        "luminosity" -> BlendMode.LUMINOSITY
        else -> BlendMode.SRC_OVER
      }
    } else {
      val pd = when (mode) {
        "multiply" -> PorterDuff.Mode.MULTIPLY
        "screen" -> PorterDuff.Mode.SCREEN
        "overlay" -> PorterDuff.Mode.OVERLAY
        "darken" -> PorterDuff.Mode.DARKEN
        "lighten" -> PorterDuff.Mode.LIGHTEN
        "add" -> PorterDuff.Mode.ADD
        else -> null
      }
      if (pd != null) p.xfermode = PorterDuffXfermode(pd)
    }
  }

  // --- Görsel katmanı ---

  private fun drawImage(context: Context, canvas: Canvas, l: JSONObject, ow: Int, oh: Int) {
    val uri = l.optString("uri")
    if (uri.isEmpty()) return
    val crop = l.optJSONArray("crop")
    val x0 = crop?.optDouble(0, 0.0) ?: 0.0
    val y0 = crop?.optDouble(1, 0.0) ?: 0.0
    val x1 = crop?.optDouble(2, 1.0) ?: 1.0
    val y1 = crop?.optDouble(3, 1.0) ?: 1.0
    // Kanvasa sığdırılmış boyut × ölçek: gereken çözünürlük kadar çözülür
    val srcW = l.optInt("srcW", 0)
    val srcH = l.optInt("srcH", 0)
    val aspect0 = if (srcW > 0 && srcH > 0) (srcW * (x1 - x0)) / (srcH * (y1 - y0)) else 1.0
    val aspectGuess = if (l.optInt("quarter", 0) % 2 != 0) 1.0 / aspect0 else aspect0
    val scale = l.optDouble("scale", 1.0)
    val fitW = if (aspectGuess > ow.toDouble() / oh) ow.toDouble() else oh * aspectGuess
    val needLong = (max(fitW, fitW / aspectGuess) * scale / max(0.05, min(x1 - x0, y1 - y0))).roundToInt().coerceIn(64, 4096)
    val src = decode(context, uri, needLong) ?: return
    val cx0 = (x0 * src.width).roundToInt().coerceIn(0, src.width - 1)
    val cy0 = (y0 * src.height).roundToInt().coerceIn(0, src.height - 1)
    val cx1 = (x1 * src.width).roundToInt().coerceIn(cx0 + 1, src.width)
    val cy1 = (y1 * src.height).roundToInt().coerceIn(cy0 + 1, src.height)
    // Görüntü işlemleri kırpılmış kopyada (kaynak önbellekte değişmeden kalır)
    var bmp = Bitmap.createBitmap(src, cx0, cy0, cx1 - cx0, cy1 - cy0).copy(Bitmap.Config.ARGB_8888, true)
    val w = bmp.width
    val h = bmp.height
    val px = IntArray(w * h)
    bmp.getPixels(px, 0, w, 0, 0, w, h)
    l.optJSONArray("colorMatrix")?.let { a -> if (a.length() == 16) ImageOps.colorMatrix(px, FloatArray(16) { a.optDouble(it, 0.0).toFloat() }) }
    l.optJSONObject("lut")?.let { lut ->
      val cube = try { CubeLut.load(lut.optString("uri")) } catch (e: Exception) { null }
      if (cube != null) ImageOps.lut3d(px, cube.rgbFloats(), cube.size, lut.optDouble("amount", 1.0).toFloat())
    }
    l.optJSONArray("tone")?.let { ImageOps.tone(px, it.optDouble(0, 0.0).toFloat(), it.optDouble(1, 0.0).toFloat(), it.optDouble(2, 0.0).toFloat()) }
    l.optJSONArray("hsl")?.let { a -> if (a.length() >= 24) ImageOps.hsl(px, FloatArray(24) { a.optDouble(it, 0.0).toFloat() }) }
    l.optJSONArray("grade")?.let { g ->
      ImageOps.grade(px, g.optDouble(0, 0.0).toFloat(), g.optDouble(1, 0.0).toFloat(), g.optDouble(2, 0.0).toFloat(), g.optDouble(3, 0.0).toFloat(), g.optDouble(4, 0.0).toFloat())
    }
    l.optJSONArray("detail")?.let { d ->
      // Ölçekten bağımsız etki: yarıçaplar görüntünün kısa kenarına göre
      val shortSide = min(w, h)
      ImageOps.sharpen(px, w, h, d.optDouble(0, 0.0).toFloat())
      val blurR = (d.optDouble(1, 0.0) * shortSide * 0.03).roundToInt()
      if (blurR >= 1) ImageOps.blur(px, w, h, blurR)
      ImageOps.vignette(px, w, h, d.optDouble(2, 0.0).toFloat())
      ImageOps.grain(px, d.optDouble(3, 0.0).toFloat(), 1234)
    }
    l.optJSONObject("mask")?.let { mk ->
      val mbmp = decode(context, mk.optString("uri"), max(src.width, src.height))
      if (mbmp != null) {
        // Maske kaynağın tamamını kapsar: aynı kırpma uygulanıp görüntü boyutuna ölçeklenir
        val mx0 = (x0 * mbmp.width).roundToInt().coerceIn(0, mbmp.width - 1)
        val my0 = (y0 * mbmp.height).roundToInt().coerceIn(0, mbmp.height - 1)
        val mx1 = (x1 * mbmp.width).roundToInt().coerceIn(mx0 + 1, mbmp.width)
        val my1 = (y1 * mbmp.height).roundToInt().coerceIn(my0 + 1, mbmp.height)
        val mc = Bitmap.createScaledBitmap(Bitmap.createBitmap(mbmp, mx0, my0, mx1 - mx0, my1 - my0), w, h, true)
        val mp = IntArray(w * h)
        mc.getPixels(mp, 0, w, 0, 0, w, h)
        val gray = ByteArray(w * h) { ((mp[it] shr 16) and 0xFF).toByte() }
        ImageOps.applyMask(px, gray, mk.optDouble("lo", 0.35).toFloat(), mk.optDouble("hi", 0.65).toFloat(), mk.optBoolean("invert"))
      }
    }
    bmp.setPixels(px, 0, w, 0, 0, w, h)
    // Çeyrek döndürme (90° adımlar) en sonda: kırpma ve maske kaynak yönünde kalır
    val quarter = ((l.optInt("quarter", 0) % 4) + 4) % 4
    if (quarter != 0) {
      val r = Bitmap.createBitmap(bmp, 0, 0, w, h, Matrix().apply { postRotate(90f * quarter) }, true)
      bmp.recycle()
      bmp = r
    }
    val aspect = bmp.width.toDouble() / bmp.height
    val dw: Double
    val dh: Double
    if (aspect > ow.toDouble() / oh) {
      dw = ow * scale
      dh = dw / aspect
    } else {
      dh = oh * scale
      dw = dh * aspect
    }
    val m = layerMatrix(l, ow, oh, bmp.width.toFloat(), bmp.height.toFloat(), dw.toFloat(), dh.toFloat())
    canvas.drawBitmap(bmp, m, layerPaint(l))
    bmp.recycle()
  }

  /** EXIF yönü uygulanmış, uzun kenarı ~longSide olacak şekilde örneklenmiş görsel (önbellekli). */
  internal fun decode(context: Context, uriString: String, longSide: Int): Bitmap? {
    val uri = Uri.parse(uriString)
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) } ?: return null
    if (bounds.outWidth <= 0) return null
    var sample = 1
    while (max(bounds.outWidth, bounds.outHeight) / (sample * 2) >= longSide) sample *= 2
    val key = "$uriString#$sample"
    cache.get(key)?.let { if (!it.isRecycled) return it }
    val opts = BitmapFactory.Options().apply { inSampleSize = sample }
    var bmp = context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, opts) } ?: return null
    val orientation = try {
      context.contentResolver.openInputStream(uri)?.use { ExifInterface(it).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL) }
        ?: ExifInterface.ORIENTATION_NORMAL
    } catch (e: Exception) {
      ExifInterface.ORIENTATION_NORMAL
    }
    val m = Matrix()
    when (orientation) {
      ExifInterface.ORIENTATION_ROTATE_90 -> m.postRotate(90f)
      ExifInterface.ORIENTATION_ROTATE_180 -> m.postRotate(180f)
      ExifInterface.ORIENTATION_ROTATE_270 -> m.postRotate(270f)
      ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> m.postScale(-1f, 1f)
      ExifInterface.ORIENTATION_FLIP_VERTICAL -> m.postScale(1f, -1f)
    }
    if (!m.isIdentity) bmp = Bitmap.createBitmap(bmp, 0, 0, bmp.width, bmp.height, m, true)
    cache.put(key, bmp)
    return bmp
  }

  // --- Metin ---

  private fun typeface(font: String, bold: Boolean, italic: Boolean): Typeface {
    val family = when (font) {
      "display" -> "sans-serif-black"
      "condensed" -> "sans-serif-condensed"
      "light" -> "sans-serif-light"
      "serif" -> "serif"
      "mono" -> "monospace"
      "casual" -> "casual"
      "cursive" -> "cursive"
      else -> "sans-serif"
    }
    val style = when {
      bold && italic -> Typeface.BOLD_ITALIC
      bold -> Typeface.BOLD
      italic -> Typeface.ITALIC
      else -> Typeface.NORMAL
    }
    return Typeface.create(family, style)
  }

  private fun drawText(canvas: Canvas, l: JSONObject, ow: Int, oh: Int) {
    val text = l.optString("text")
    val size = (l.optDouble("size", 0.06) * oh).toFloat().coerceAtLeast(4f)
    val paint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
      textSize = size
      typeface = typeface(l.optString("font", "sans"), l.optBoolean("bold"), l.optBoolean("italic"))
      letterSpacing = l.optDouble("letterSpacing", 0.0).toFloat()
      color = parseColor(l.optString("color", "#FFFFFFFF"))
    }
    val align = when (l.optString("align", "center")) {
      "left" -> Layout.Alignment.ALIGN_NORMAL
      "right" -> Layout.Alignment.ALIGN_OPPOSITE
      else -> Layout.Alignment.ALIGN_CENTER
    }
    val maxW = (ow * 0.92 / max(0.2, l.optDouble("scale", 1.0))).roundToInt()
    val measured = text.split("\n").maxOf { paint.measureText(it) }.roundToInt() + 2
    val width = min(maxW, max(1, measured))
    fun layout(p: TextPaint) = StaticLayout.Builder.obtain(text, 0, text.length, p, width)
      .setAlignment(align)
      .setLineSpacing(0f, l.optDouble("lineHeight", 1.2).toFloat())
      .setTextDirection(TextDirectionHeuristics.FIRSTSTRONG_LTR)
      .setIncludePad(false)
      .build()
    val fill = layout(paint)
    val pad = size * 0.3f
    val bw = width + pad * 2
    val bh = fill.height + pad * 2
    // Metin önce kendi bitmap'ine çizilir, sonra katman dönüşümüyle kanvasa yerleşir
    val bmp = Bitmap.createBitmap(max(1, bw.roundToInt()), max(1, bh.roundToInt()), Bitmap.Config.ARGB_8888)
    val c = Canvas(bmp)
    val bg = parseColor(l.optString("background", "#00000000"))
    if (Color.alpha(bg) > 0) {
      c.drawRoundRect(RectF(0f, 0f, bw, bh), size * 0.25f, size * 0.25f, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = bg })
    }
    c.translate(pad, pad)
    val strokeW = (l.optDouble("strokeWidth", 0.0) * oh).toFloat()
    val strokeColor = parseColor(l.optString("stroke", "#00000000"))
    if (strokeW > 0.3f && Color.alpha(strokeColor) > 0) {
      val sp = TextPaint(paint).apply {
        style = Paint.Style.STROKE
        strokeWidth = strokeW * 2
        strokeJoin = Paint.Join.ROUND
        color = strokeColor
      }
      layout(sp).draw(c)
    }
    if (l.optBoolean("shadow")) paint.setShadowLayer(size * 0.08f, 0f, size * 0.04f, 0x99000000.toInt())
    fill.draw(c)
    val scale = l.optDouble("scale", 1.0).toFloat()
    val m = layerMatrix(l, ow, oh, bw, bh, bw * scale, bh * scale)
    canvas.drawBitmap(bmp, m, layerPaint(l))
    bmp.recycle()
  }

  // --- Şekil ---

  private fun drawShape(canvas: Canvas, l: JSONObject, ow: Int, oh: Int) {
    val scale = l.optDouble("scale", 1.0).toFloat()
    val w = (l.optDouble("w", 0.5) * ow * scale).toFloat()
    val h = (l.optDouble("h", 0.3) * oh * scale).toFloat()
    val path = Path()
    val rect = RectF(-w / 2, -h / 2, w / 2, h / 2)
    when (l.optString("shape", "rect")) {
      "roundRect" -> {
        val r = l.optDouble("radius", 0.15).toFloat() * min(w, h)
        path.addRoundRect(rect, r, r, Path.Direction.CW)
      }
      "ellipse" -> path.addOval(rect, Path.Direction.CW)
      "triangle" -> {
        path.moveTo(0f, -h / 2); path.lineTo(w / 2, h / 2); path.lineTo(-w / 2, h / 2); path.close()
      }
      "star" -> {
        for (i in 0 until 10) {
          val a = -PI / 2 + i * PI / 5
          val r = if (i % 2 == 0) 1.0 else 0.45
          val x = (cos(a) * r * w / 2).toFloat()
          val y = (sin(a) * r * h / 2).toFloat()
          if (i == 0) path.moveTo(x, y) else path.lineTo(x, y)
        }
        path.close()
      }
      "heart" -> {
        path.moveTo(0f, h * 0.35f)
        path.cubicTo(-w * 0.55f, -h * 0.05f, -w * 0.35f, -h * 0.55f, 0f, -h * 0.2f)
        path.cubicTo(w * 0.35f, -h * 0.55f, w * 0.55f, -h * 0.05f, 0f, h * 0.35f)
        path.close()
      }
      "line" -> {
        path.moveTo(-w / 2, 0f); path.lineTo(w / 2, 0f)
      }
      "arrow" -> {
        path.moveTo(-w / 2, -h * 0.15f); path.lineTo(w * 0.15f, -h * 0.15f); path.lineTo(w * 0.15f, -h / 2)
        path.lineTo(w / 2, 0f); path.lineTo(w * 0.15f, h / 2); path.lineTo(w * 0.15f, h * 0.15f); path.lineTo(-w / 2, h * 0.15f); path.close()
      }
      else -> path.addRect(rect, Path.Direction.CW)
    }
    val m = Matrix()
    if (l.optBoolean("flipH")) m.postScale(-1f, 1f)
    if (l.optBoolean("flipV")) m.postScale(1f, -1f)
    m.postRotate(l.optDouble("rotation", 0.0).toFloat())
    m.postTranslate(((l.optDouble("x", 0.0) + 1) / 2 * ow).toFloat(), ((1 - l.optDouble("y", 0.0)) / 2 * oh).toFloat())
    path.transform(m)
    val base = layerPaint(l)
    val fill = parseColor(l.optString("fill", "#FFFFFFFF"))
    if (Color.alpha(fill) > 0 && l.optString("shape") != "line") {
      canvas.drawPath(path, Paint(base).apply { style = Paint.Style.FILL; color = fill; alpha = Color.alpha(fill) * base.alpha / 255 })
    }
    val sw = (l.optDouble("strokeWidth", 0.0) * oh).toFloat().let { if (l.optString("shape") == "line") max(it, 2f) else it }
    val stroke = parseColor(l.optString("stroke", if (l.optString("shape") == "line") l.optString("fill", "#FFFFFFFF") else "#00000000"))
    if (sw > 0.3f && Color.alpha(stroke) > 0) {
      canvas.drawPath(path, Paint(base).apply { style = Paint.Style.STROKE; strokeWidth = sw; strokeJoin = Paint.Join.ROUND; color = stroke; alpha = Color.alpha(stroke) * base.alpha / 255 })
    }
  }

  private fun parseColor(s: String): Int = RenderSpec.parseColor(s)

  /** Görseli galeriye (Pictures/Kurgu) kaydeder; Android 10+ izin gerektirmez. */
  fun saveImageToGallery(context: Context, path: String, displayName: String): String {
    val src = File(path.removePrefix("file://"))
    require(src.exists()) { "FILE_NOT_FOUND" }
    val mime = if (displayName.endsWith(".png")) "image/png" else "image/jpeg"
    if (Build.VERSION.SDK_INT >= 29) {
      val values = android.content.ContentValues().apply {
        put(android.provider.MediaStore.Images.Media.DISPLAY_NAME, displayName)
        put(android.provider.MediaStore.Images.Media.MIME_TYPE, mime)
        put(android.provider.MediaStore.Images.Media.RELATIVE_PATH, android.os.Environment.DIRECTORY_PICTURES + "/Kurgu")
        put(android.provider.MediaStore.Images.Media.IS_PENDING, 1)
      }
      val resolver = context.contentResolver
      val uri = resolver.insert(android.provider.MediaStore.Images.Media.getContentUri(android.provider.MediaStore.VOLUME_EXTERNAL_PRIMARY), values)
        ?: throw IllegalStateException("MEDIASTORE_INSERT_FAILED")
      try {
        resolver.openOutputStream(uri)?.use { out -> src.inputStream().use { it.copyTo(out) } } ?: throw IllegalStateException("MEDIASTORE_WRITE_FAILED")
        values.clear()
        values.put(android.provider.MediaStore.Images.Media.IS_PENDING, 0)
        resolver.update(uri, values, null, null)
      } catch (e: Exception) {
        resolver.delete(uri, null, null)
        throw e
      }
      return uri.toString()
    }
    @Suppress("DEPRECATION")
    val dir = File(android.os.Environment.getExternalStoragePublicDirectory(android.os.Environment.DIRECTORY_PICTURES), "Kurgu").apply { mkdirs() }
    val dest = File(dir, displayName)
    src.copyTo(dest, overwrite = true)
    android.media.MediaScannerConnection.scanFile(context, arrayOf(dest.absolutePath), arrayOf(mime), null)
    return Uri.fromFile(dest).toString()
  }
}
