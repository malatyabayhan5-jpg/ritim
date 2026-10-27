package expo.modules.kurguengine

import android.util.Log

/**
 * Tanılama günlüğü: satırlar logcat'e yazılır ve son [MAX] satır bellekte tutulur. Ayarlar >
 * Tanılama raporu bu satırları paylaşır (kullanıcının telefonundaki gerçek ölçümler; logcat
 * okumak için bilgisayar gerekmez). Kişisel veri yazılmaz: yalnızca süreler ve sayılar.
 */
object PerfLog {
  private const val MAX = 300
  private val lines = ArrayDeque<String>()
  private val clock = java.text.SimpleDateFormat("HH:mm:ss.SSS", java.util.Locale.US)

  fun i(tag: String, msg: String) = add('I', tag, msg, null)

  fun w(tag: String, msg: String, t: Throwable? = null) = add('W', tag, msg, t)

  fun e(tag: String, msg: String, t: Throwable? = null) = add('E', tag, msg, t)

  private fun add(level: Char, tag: String, msg: String, t: Throwable?) {
    when (level) {
      'E' -> Log.e(tag, msg, t)
      'W' -> Log.w(tag, msg, t)
      else -> Log.i(tag, msg)
    }
    val cause = t?.let { " | ${it.javaClass.simpleName}: ${it.message?.take(200)}" } ?: ""
    synchronized(lines) {
      // SimpleDateFormat iş parçacığı güvenli değil: kilit içinde biçimlenir
      lines.addLast("${clock.format(java.util.Date())} $level $tag $msg$cause".take(600))
      while (lines.size > MAX) lines.removeFirst()
    }
  }

  fun snapshot(): List<String> = synchronized(lines) { lines.toList() }
}
