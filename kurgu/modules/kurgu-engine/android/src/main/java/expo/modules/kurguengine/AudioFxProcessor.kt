package expo.modules.kurguengine

import androidx.annotation.OptIn
import androidx.media3.common.C
import androidx.media3.common.audio.AudioProcessor
import androidx.media3.common.audio.BaseAudioProcessor
import androidx.media3.common.util.UnstableApi
import expo.modules.kurguengine.dsp.AudioFxChain
import java.nio.ByteBuffer
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * Klip sesine efekt zinciri (dsp/AudioFxChain: kapı, EQ, sıkıştırıcı, bozulma,
 * lo-fi, koro, yankı, yankılanım, genişlik, kazanç, sınırlayıcı). Önizleme ve
 * dışa aktarma aynı işlemciyi kullanır. 16 bit PCM (ve varsa float PCM) girer,
 * aynı biçimde çıkar; 1-2 kanal. Çıktı girdiyle örnek düzeyinde hizalıdır ve
 * aynı uzunluktadır (sınırlayıcının 1.5 ms ileriye bakışı zincirde telafi edilir);
 * ses-görüntü eşzamanı bozulmaz. Yankı/yankılanım kuyruğu klip sonunda kesilir.
 *
 * Sıcak yolda bellek ayırma yok: dönüşüm dizileri yalnızca daha büyük bir tampon
 * geldiğinde büyür; zincir (gecikme hatları) yalnızca biçim değişince yeniden kurulur.
 */
@OptIn(UnstableApi::class)
class AudioFxProcessor(private val spec: AudioFxSpec) : BaseAudioProcessor() {
  private var chain: AudioFxChain? = null
  private var chainChannels = 0
  private var chainRate = 0
  private var isFloat = false
  private var inF = FloatArray(0)
  private var outF = FloatArray(0)

  override fun onConfigure(inputAudioFormat: AudioProcessor.AudioFormat): AudioProcessor.AudioFormat {
    val enc = inputAudioFormat.encoding
    if (enc != C.ENCODING_PCM_16BIT && enc != C.ENCODING_PCM_FLOAT) throw AudioProcessor.UnhandledAudioFormatException(inputAudioFormat)
    // Etkin değilse (veya 2'den çok kanal) işlemci devre dışı kalır; ses olduğu gibi geçer.
    if (!spec.chainNeeded || inputAudioFormat.channelCount !in 1..2) return AudioProcessor.AudioFormat.NOT_SET
    return inputAudioFormat
  }

  override fun onFlush(streamMetadata: AudioProcessor.StreamMetadata) {
    val fmt = inputAudioFormat
    if (fmt == AudioProcessor.AudioFormat.NOT_SET) {
      chain = null
      return
    }
    isFloat = fmt.encoding == C.ENCODING_PCM_FLOAT
    val c = chain
    if (c != null && chainChannels == fmt.channelCount && chainRate == fmt.sampleRate) {
      c.reset()  // arama (seek) sonrası: durum sıfırlanır, tamponlar yeniden kullanılır
    } else {
      chain = AudioFxChain(fmt.channelCount, fmt.sampleRate, spec.params)
      chainChannels = fmt.channelCount
      chainRate = fmt.sampleRate
    }
  }

  override fun onReset() {
    chain = null
    chainChannels = 0
    chainRate = 0
    inF = FloatArray(0)
    outF = FloatArray(0)
  }

  private fun ensureOut(samples: Int) {
    if (outF.size < samples) outF = FloatArray(samples)
  }

  override fun queueInput(inputBuffer: ByteBuffer) {
    val c = chain
    if (c == null) {
      inputBuffer.position(inputBuffer.limit())
      return
    }
    val ch = c.channels()
    val frames = inputBuffer.remaining() / ((if (isFloat) 4 else 2) * ch)
    if (frames == 0) {
      // Tam kare olmayan artık bayt (normalde olmaz): tüketilir, aksi halde boru hattı aynı tamponu yeniden sunar.
      inputBuffer.position(inputBuffer.limit())
      return
    }
    val n = frames * ch
    if (inF.size < n) inF = FloatArray(n)
    ensureOut(max(n, (c.latencyFrames() + 1) * ch))
    if (isFloat) {
      for (i in 0 until n) inF[i] = inputBuffer.getFloat()
    } else {
      for (i in 0 until n) inF[i] = inputBuffer.getShort() / 32768f
    }
    write(c.process(inF, frames, outF) * ch)
  }

  override fun onQueueEndOfStream() {
    val c = chain ?: return
    ensureOut((c.latencyFrames() + 1) * c.channels())
    write(c.flush(outF) * c.channels())
  }

  private fun write(samples: Int) {
    if (samples <= 0) return
    if (isFloat) {
      val out = replaceOutputBuffer(samples * 4)
      for (i in 0 until samples) out.putFloat(outF[i])
      out.flip()
    } else {
      val out = replaceOutputBuffer(samples * 2)
      for (i in 0 until samples) out.putShort((outF[i] * 32768f).roundToInt().coerceIn(-32768, 32767).toShort())
      out.flip()
    }
  }
}
