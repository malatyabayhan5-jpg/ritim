package expo.modules.kurguengine

import androidx.annotation.OptIn
import androidx.media3.common.C
import androidx.media3.common.audio.AudioProcessor
import androidx.media3.common.audio.BaseAudioProcessor
import androidx.media3.common.util.UnstableApi
import expo.modules.kurguengine.dsp.SpectralDenoiser
import java.nio.ByteBuffer
import kotlin.math.roundToInt

/**
 * Klip sesine cihaz içi gürültü azaltma (dsp/SpectralDenoiser). Önizleme ve dışa
 * aktarma aynı işlemciyi kullanır. Çıktı girdiyle örnek düzeyinde hizalıdır ve
 * aynı uzunluktadır; ses-görüntü eşzamanı bozulmaz.
 */
@OptIn(UnstableApi::class)
class DenoiseProcessor(private val strength: Float) : BaseAudioProcessor() {
  private var denoiser: SpectralDenoiser? = null
  private var inF = FloatArray(0)
  private var outF = FloatArray(0)

  override fun onConfigure(inputAudioFormat: AudioProcessor.AudioFormat): AudioProcessor.AudioFormat {
    if (inputAudioFormat.encoding != C.ENCODING_PCM_16BIT) throw AudioProcessor.UnhandledAudioFormatException(inputAudioFormat)
    return if (strength > 0.01f) inputAudioFormat else AudioProcessor.AudioFormat.NOT_SET
  }

  @Deprecated("Deprecated in Java")
  override fun onFlush() {
    val fmt = inputAudioFormat
    denoiser = if (fmt == AudioProcessor.AudioFormat.NOT_SET) null else SpectralDenoiser(fmt.channelCount, fmt.sampleRate).also { it.setStrength(strength) }
  }

  override fun onReset() {
    denoiser = null
  }

  override fun queueInput(inputBuffer: ByteBuffer) {
    val d = denoiser ?: return
    val ch = inputAudioFormat.channelCount
    val frames = inputBuffer.remaining() / (2 * ch)
    if (frames == 0) return
    if (inF.size < frames * ch) inF = FloatArray(frames * ch)
    if (outF.size < (frames + SpectralDenoiser.N) * ch) outF = FloatArray((frames + SpectralDenoiser.N) * ch)
    for (i in 0 until frames * ch) inF[i] = inputBuffer.getShort() / 32768f
    write(d.process(inF, frames, outF) * ch)
  }

  override fun onQueueEndOfStream() {
    val d = denoiser ?: return
    val ch = inputAudioFormat.channelCount
    if (outF.size < (SpectralDenoiser.N * 2) * ch) outF = FloatArray((SpectralDenoiser.N * 2) * ch)
    write(d.flush(outF) * ch)
  }

  private fun write(samples: Int) {
    if (samples <= 0) return
    val out = replaceOutputBuffer(samples * 2)
    for (i in 0 until samples) out.putShort((outF[i] * 32768f).roundToInt().coerceIn(-32768, 32767).toShort())
    out.flip()
  }
}
