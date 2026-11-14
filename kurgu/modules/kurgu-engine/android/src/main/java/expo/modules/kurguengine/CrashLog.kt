package expo.modules.kurguengine

import android.app.ActivityManager
import android.content.Context
import android.os.Build
import android.util.Log
import java.io.File

/**
 * Çökme kaydı: yakalanmayan istisna, süreç ölmeden önce dosyaya yazılır (iş parçacığı, yığın,
 * son ölçüm satırları) ve sonraki açılışta ana ekranda "raporu kopyala" olarak sunulur.
 * Android 11+ için sistemin tuttuğu süreç çıkış nedenleri de okunur: yerel (C++) çökme,
 * "yanıt vermiyor" (ANR) ve bellek yetersizliğinden kapatılma Java işleyicisine hiç uğramaz.
 * Kişisel veri yazılmaz.
 */
object CrashLog {
  private const val FILE = "kurgu_last_crash.txt"
  @Volatile private var dir: File? = null
  private var installed = false

  @Synchronized
  fun install(context: Context) {
    dir = context.applicationContext.filesDir
    if (installed) return
    installed = true
    val previous = Thread.getDefaultUncaughtExceptionHandler()
    Thread.setDefaultUncaughtExceptionHandler { thread, e ->
      try {
        write(thread, e)
      } catch (ignored: Throwable) {
        // Kayıt yazılamasa da (ör. bellek bitti) asıl işleyici çalışmalı
      }
      previous?.uncaughtException(thread, e)
    }
  }

  private fun write(thread: Thread, e: Throwable) {
    val d = dir ?: return
    val sb = StringBuilder()
    sb.append("time=").append(java.text.SimpleDateFormat("yyyy-MM-dd HH:mm:ss", java.util.Locale.US).format(java.util.Date())).append('\n')
    sb.append("thread=").append(thread.name).append('\n')
    sb.append(Log.getStackTraceString(e).take(6000)).append('\n')
    sb.append("--- last lines\n")
    PerfLog.snapshot().takeLast(40).forEach { sb.append(it).append('\n') }
    File(d, FILE).writeText(sb.toString())
  }

  fun read(): String? = try {
    dir?.let { File(it, FILE) }?.takeIf { it.isFile }?.readText()
  } catch (e: Exception) {
    null
  }

  fun clear() {
    try {
      dir?.let { File(it, FILE).delete() }
    } catch (e: Exception) {
      // yok sayılır
    }
  }

  /** Son süreç çıkışları (Android 11+): neden, ön planda mıydı, bellek, varsa iz özeti. */
  fun exits(context: Context): List<Map<String, Any?>> {
    if (Build.VERSION.SDK_INT < 30) return emptyList()
    return try {
      val am = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
      var traces = 0
      am.getHistoricalProcessExitReasons(null, 0, 8).map { info ->
        // ANR (6) ve yerel çökme (5) izleri büyük olabilir: yalnızca en yeni ikisi okunur
        val trace = if ((info.reason == 6 || info.reason == 5) && traces < 2) {
          traces++
          traceOf(info)
        } else {
          ""
        }
        mapOf(
          "time" to info.timestamp.toDouble(),
          "reason" to reasonName(info.reason),
          "status" to info.status,
          "importance" to info.importance,
          "description" to (info.description ?: "").take(300),
          "pssMb" to (info.pss / 1024).toInt(),
          "rssMb" to (info.rss / 1024).toInt(),
          "trace" to trace,
        )
      }
    } catch (e: Throwable) {
      emptyList()
    }
  }

  private fun reasonName(r: Int): String = when (r) {
    1 -> "EXIT_SELF"
    2 -> "SIGNALED"
    3 -> "LOW_MEMORY"
    4 -> "CRASH"
    5 -> "CRASH_NATIVE"
    6 -> "ANR"
    7 -> "INITIALIZATION_FAILURE"
    8 -> "PERMISSION_CHANGE"
    9 -> "EXCESSIVE_RESOURCE_USAGE"
    10 -> "USER_REQUESTED"
    11 -> "USER_STOPPED"
    12 -> "DEPENDENCY_DIED"
    13 -> "OTHER"
    14 -> "FREEZER"
    15 -> "PACKAGE_STATE_CHANGE"
    16 -> "PACKAGE_UPDATED"
    else -> "UNKNOWN_$r"
  }

  @androidx.annotation.RequiresApi(30)
  private fun traceOf(info: android.app.ApplicationExitInfo): String = try {
    val bytes = info.traceInputStream?.use { input ->
      val buf = java.io.ByteArrayOutputStream()
      val chunk = ByteArray(16 * 1024)
      // ANR izinde ana iş parçacığı baştadır; 256 KiB yeter
      while (buf.size() < 256 * 1024) {
        val n = input.read(chunk)
        if (n <= 0) break
        buf.write(chunk, 0, n)
      }
      buf.toByteArray()
    }
    when {
      bytes == null -> ""
      info.reason == 6 -> anrMainThread(String(bytes, Charsets.UTF_8))
      else -> printableRuns(bytes)
    }
  } catch (e: Throwable) {
    ""
  }

  /** ANR metninden ana iş parçacığının yığını (en çok 45 satır). */
  internal fun anrMainThread(text: String): String {
    val lines = text.lines()
    val start = lines.indexOfFirst { it.startsWith("\"main\"") }
    if (start < 0) return lines.take(30).joinToString("\n").take(3000)
    val out = ArrayList<String>()
    for (i in start until minOf(lines.size, start + 45)) {
      if (i > start && lines[i].isBlank()) break
      out.add(lines[i].trim())
    }
    return out.joinToString("\n").take(3500)
  }

  /** Yerel çökme izi protobuf'tur: okunabilir metin parçaları (kütüphane, işlev, ileti) çıkarılır. */
  internal fun printableRuns(bytes: ByteArray): String {
    val out = StringBuilder()
    val run = StringBuilder()
    for (b in bytes) {
      val c = b.toInt() and 0xFF
      if (c in 32..126) {
        run.append(c.toChar())
      } else {
        if (run.length >= 6) out.append(run).append(" | ")
        run.setLength(0)
      }
      if (out.length > 2500) break
    }
    if (run.length >= 6 && out.length <= 2500) out.append(run)
    return out.toString().take(2500)
  }
}
