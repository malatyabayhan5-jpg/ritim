package expo.modules.kurguengine

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder

/**
 * Dışa aktarma süresince gösterilen ön plan hizmeti. İşin kendisi Transformer'da
 * yürür; bu hizmet yalnızca süreç önceliğini korur ve ilerlemeyi bildirimde gösterir.
 */
class ExportService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val title = intent?.getStringExtra(EXTRA_TITLE) ?: "Kurgu"
    val text = intent?.getStringExtra(EXTRA_TEXT) ?: ""
    val notification = build(this, title, text, intent?.getIntExtra(EXTRA_PROGRESS, 0) ?: 0)
    try {
      when {
        Build.VERSION.SDK_INT >= 35 ->
          startForeground(ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROCESSING)
        Build.VERSION.SDK_INT >= 29 ->
          startForeground(ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        else -> startForeground(ID, notification)
      }
    } catch (e: Exception) {
      // Ön plan hizmeti başlatılamazsa dışa aktarma yine sürer; yalnızca bildirim olmaz.
      stopSelf()
    }
    return START_NOT_STICKY
  }

  companion object {
    private const val CHANNEL = "kurgu_export"
    private const val ID = 4107
    private const val EXTRA_TITLE = "title"
    private const val EXTRA_TEXT = "text"
    private const val EXTRA_PROGRESS = "progress"

    fun start(context: Context, title: String, text: String) {
      ensureChannel(context, title)
      val intent = Intent(context, ExportService::class.java)
        .putExtra(EXTRA_TITLE, title)
        .putExtra(EXTRA_TEXT, text)
      try {
        if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(intent) else context.startService(intent)
      } catch (e: Exception) {
        // Arka plandan başlatma kısıtlaması vb. Dışa aktarma bundan etkilenmez.
      }
    }

    fun update(context: Context, title: String, text: String, progress: Int) {
      val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      try {
        nm.notify(ID, build(context, title, "$text $progress%", progress))
      } catch (e: SecurityException) {
        // Bildirim izni yok.
      }
    }

    fun stop(context: Context) {
      context.stopService(Intent(context, ExportService::class.java))
      val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      nm.cancel(ID)
    }

    private fun ensureChannel(context: Context, name: String) {
      if (Build.VERSION.SDK_INT >= 26) {
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (nm.getNotificationChannel(CHANNEL) == null) {
          nm.createNotificationChannel(NotificationChannel(CHANNEL, name, NotificationManager.IMPORTANCE_LOW))
        }
      }
    }

    private fun build(context: Context, title: String, text: String, progress: Int): Notification {
      val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
      val pi = launch?.let {
        PendingIntent.getActivity(context, 0, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
      }
      val builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(context, CHANNEL) else @Suppress("DEPRECATION") Notification.Builder(context)
      return builder
        .setContentTitle(title)
        .setContentText(text)
        .setSmallIcon(android.R.drawable.stat_sys_upload)
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setProgress(100, progress.coerceIn(0, 100), false)
        .apply { if (pi != null) setContentIntent(pi) }
        .build()
    }
  }
}
