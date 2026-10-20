package expo.modules.kurguengine

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Color
import expo.modules.kurguengine.vision.ImageOps
import org.tensorflow.lite.Interpreter
import java.io.File
import java.io.FileOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.exp
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Cihaz içi görsel yapay zekâ araçları.
 * - Kişi/arka plan ayırma: TensorFlow DeepLab v3 (MobileNetV2, PASCAL VOC 21 sınıf; Apache 2.0,
 *   assets/kurgu_ml/deeplabv3_257_mv_gpu.tflite, 257×257 RGB girdi [-1, 1], 21 sınıf logit çıktısı).
 *   Yalnızca standart TFLite işlemleri kullanır (MediaPipe selfie modeli özel
 *   Convolution2DTransposeBias işlemi istediği için düz TFLite'ta açılamadı — CI e2e).
 *   "Kişi" sınıfının (15) softmax olasılığı maske olarak kullanılır; yalnızca insanları ayırır.
 * - Nesne silme: klasik boyama (ImageOps.inpaint) — üretken model değildir.
 * Görseller cihazdan çıkmaz.
 */
object Segmenter {
  private const val MODEL = "kurgu_ml/deeplabv3_257_mv_gpu.tflite"
  private const val SIZE = 257
  private const val CLASSES = 21
  private const val PERSON = 15
  @Volatile private var interpreter: Interpreter? = null

  private fun interpreter(context: Context): Interpreter {
    interpreter?.let { return it }
    synchronized(this) {
      interpreter?.let { return it }
      val bytes = context.assets.open(MODEL).use { it.readBytes() }
      val buf = ByteBuffer.allocateDirect(bytes.size).order(ByteOrder.nativeOrder())
      buf.put(bytes)
      buf.rewind()
      val opts = Interpreter.Options().setNumThreads(2)
      return Interpreter(buf, opts).also { interpreter = it }
    }
  }

  // EXIF yönü uygulanmış görsel (PhotoRenderer ile aynı çözücü: maske ve silme sonucu katmanla hizalı kalır)
  private fun decode(context: Context, uriString: String, maxSide: Int): Bitmap =
    PhotoRenderer.decode(context, uriString, maxSide) ?: throw IllegalStateException("IMAGE_DECODE")

  /**
   * Kişi maskesi üretir (gri PNG, kaynağın en/boy oranında, uzun kenar ≤ 1024).
   * Dönüş: { path, coverage } — coverage: kişi olarak işaretlenen alan oranı (0..1).
   */
  fun segmentPerson(context: Context, uriString: String, outPath: String): Map<String, Any> {
    val src = decode(context, uriString, 1024)
    val input = Bitmap.createScaledBitmap(src, SIZE, SIZE, true)
    val px = IntArray(SIZE * SIZE)
    input.getPixels(px, 0, SIZE, 0, 0, SIZE, SIZE)
    val inBuf = ByteBuffer.allocateDirect(SIZE * SIZE * 3 * 4).order(ByteOrder.nativeOrder())
    for (c in px) {
      inBuf.putFloat((((c shr 16) and 0xFF) - 127.5f) / 127.5f)
      inBuf.putFloat((((c shr 8) and 0xFF) - 127.5f) / 127.5f)
      inBuf.putFloat(((c and 0xFF) - 127.5f) / 127.5f)
    }
    inBuf.rewind()
    val outBuf = ByteBuffer.allocateDirect(SIZE * SIZE * CLASSES * 4).order(ByteOrder.nativeOrder())
    interpreter(context).run(inBuf, outBuf)
    outBuf.rewind()
    val logits = FloatArray(CLASSES)
    val small = IntArray(SIZE * SIZE)
    var sum = 0.0
    for (i in 0 until SIZE * SIZE) {
      // Piksel başına softmax: kişi sınıfının olasılığı
      var mx = -Float.MAX_VALUE
      for (k in 0 until CLASSES) {
        logits[k] = outBuf.float
        if (logits[k] > mx) mx = logits[k]
      }
      var den = 0.0
      for (k in 0 until CLASSES) den += exp((logits[k] - mx).toDouble())
      val v = (exp((logits[PERSON] - mx).toDouble()) / den).toFloat().coerceIn(0f, 1f)
      sum += v
      val g = (v * 255).roundToInt()
      small[i] = Color.argb(255, g, g, g)
    }
    val smallBmp = Bitmap.createBitmap(small, SIZE, SIZE, Bitmap.Config.ARGB_8888)
    // Kaynak oranına bilinear büyütme; kenarlar renderer'daki yumuşak eşikle inceltilir
    val mask = Bitmap.createScaledBitmap(smallBmp, src.width, src.height, true)
    val f = File(outPath.removePrefix("file://"))
    f.parentFile?.mkdirs()
    FileOutputStream(f).use { mask.compress(Bitmap.CompressFormat.PNG, 100, it) }
    return mapOf("path" to "file://" + f.absolutePath, "coverage" to sum / (SIZE * SIZE), "width" to mask.width, "height" to mask.height)
  }

  /**
   * Dikdörtgen bölgedeki nesneyi siler (klasik boyama). rect: x0, y0, x1, y1 (0..1,
   * görsel koordinatı, y aşağı). Sonuç yeni bir görsel dosyasıdır (kaynak değişmez).
   */
  fun eraseRect(context: Context, uriString: String, x0: Double, y0: Double, x1: Double, y1: Double, outPath: String): Map<String, Any> {
    val src = decode(context, uriString, 3072).copy(Bitmap.Config.ARGB_8888, true)
    val w = src.width
    val h = src.height
    val rx0 = (min(x0, x1) * w).roundToInt().coerceIn(0, w - 1)
    val ry0 = (min(y0, y1) * h).roundToInt().coerceIn(0, h - 1)
    val rx1 = (max(x0, x1) * w).roundToInt().coerceIn(rx0 + 1, w)
    val ry1 = (max(y0, y1) * h).roundToInt().coerceIn(ry0 + 1, h)
    // İşlem bölgesi: dikdörtgen + kenar payı (tüm görüntüde yinelemekten çok daha hızlı)
    val margin = max(8, max(rx1 - rx0, ry1 - ry0) / 4)
    val bx0 = max(0, rx0 - margin)
    val by0 = max(0, ry0 - margin)
    val bx1 = min(w, rx1 + margin)
    val by1 = min(h, ry1 + margin)
    val bw = bx1 - bx0
    val bh = by1 - by0
    val px = IntArray(bw * bh)
    src.getPixels(px, 0, bw, bx0, by0, bw, bh)
    val hole = BooleanArray(bw * bh)
    for (y in ry0 until ry1) for (x in rx0 until rx1) hole[(y - by0) * bw + (x - bx0)] = true
    ImageOps.inpaint(px, bw, bh, hole)
    src.setPixels(px, 0, bw, bx0, by0, bw, bh)
    val f = File(outPath.removePrefix("file://"))
    f.parentFile?.mkdirs()
    FileOutputStream(f).use { src.compress(Bitmap.CompressFormat.JPEG, 95, it) }
    return mapOf("path" to "file://" + f.absolutePath, "width" to w, "height" to h)
  }
}
