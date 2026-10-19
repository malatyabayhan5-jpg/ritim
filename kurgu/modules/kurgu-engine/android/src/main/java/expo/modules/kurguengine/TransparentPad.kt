package expo.modules.kurguengine

import android.content.Context
import android.graphics.Bitmap
import android.net.Uri
import java.io.File

/**
 * Katman şeritlerindeki boşlukları dolduran tamamen saydam küçük PNG. Media3 video
 * boşlukları siyah kare ürettiği için (dışa aktarmada) boşluk yerine bu görsel kullanılır.
 */
object TransparentPad {
  @Volatile private var cached: String? = null

  fun uri(context: Context): String {
    cached?.let { if (File(Uri.parse(it).path ?: "").isFile) return it }
    val file = File(context.cacheDir, "kurgu_transparent_16.png")
    if (!file.isFile || file.length() == 0L) {
      val bmp = Bitmap.createBitmap(16, 16, Bitmap.Config.ARGB_8888) // sıfırlarla dolu = saydam
      file.outputStream().use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
      bmp.recycle()
    }
    return Uri.fromFile(file).toString().also { cached = it }
  }
}
