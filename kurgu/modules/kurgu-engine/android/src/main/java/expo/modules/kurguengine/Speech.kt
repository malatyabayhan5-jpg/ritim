package expo.modules.kurguengine

import android.content.Context
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import expo.modules.kotlin.Promise
import java.io.File
import java.util.Locale
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Metinden konuşma: cihazın kendi TTS motoruyla (Android TextToSpeech) WAV dosyası
 * üretir. İnternet, hesap veya API anahtarı gerekmez; metin cihaz dışına çıkmaz
 * (cihazda yüklü motorun kendi politikası geçerlidir). Dilin sesi yüklü değilse
 * TTS_LANG hatası döner ve kullanıcı sistem ayarlarına yönlendirilir.
 */
object Speech {
  fun synthesize(context: Context, text: String, lang: String, outPath: String, rate: Float, pitch: Float, promise: Promise) {
    val settled = AtomicBoolean(false)
    var tts: TextToSpeech? = null
    val main = Handler(Looper.getMainLooper())
    fun finish(error: String?, message: String = "") {
      if (!settled.compareAndSet(false, true)) return
      if (error == null) promise.resolve(outPath) else promise.reject(error, message, null)
      main.post { tts?.shutdown() }
    }
    main.postDelayed({ finish("TTS_TIMEOUT", "no response from TTS engine") }, 60_000)
    main.post {
      tts = TextToSpeech(context.applicationContext, TextToSpeech.OnInitListener { status ->
        val engine = tts
        val locale = Locale.forLanguageTag(lang)
        if (status != TextToSpeech.SUCCESS || engine == null) {
          finish("TTS_UNAVAILABLE", "status $status")
        } else if (engine.isLanguageAvailable(locale) < TextToSpeech.LANG_AVAILABLE) {
          finish("TTS_LANG", lang)
        } else {
          engine.language = locale
          engine.setSpeechRate(rate.coerceIn(0.5f, 2f))
          engine.setPitch(pitch.coerceIn(0.5f, 2f))
          engine.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String?) {}
            override fun onDone(utteranceId: String?) {
              val f = File(outPath)
              if (f.isFile && f.length() > 44) finish(null) else finish("TTS_FAILED", "empty output")
            }
            @Deprecated("Deprecated in Java")
            override fun onError(utteranceId: String?) = finish("TTS_FAILED", "engine error")
            override fun onError(utteranceId: String?, errorCode: Int) = finish("TTS_FAILED", "engine error $errorCode")
          })
          File(outPath).parentFile?.mkdirs()
          val r = engine.synthesizeToFile(text, Bundle(), File(outPath), "kurgu_${System.nanoTime()}")
          if (r != TextToSpeech.SUCCESS) finish("TTS_FAILED", "synthesizeToFile $r")
        }
      })
    }
  }
}
