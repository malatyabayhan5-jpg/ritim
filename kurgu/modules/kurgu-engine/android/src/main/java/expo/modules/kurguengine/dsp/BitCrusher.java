package expo.modules.kurguengine.dsp;

/**
 * Lo-fi / bit ezici: örnekle-tut ile örnekleme hızı düşürme (kesirli faz
 * biriktirici; hedef hız örnekleme hızını tam bölmek zorunda değildir) ve
 * bit derinliği nicemleme. Çıkış girdiyle aynı aralıkta kalır.
 * Gecikme: 0 örnek.
 */
public final class BitCrusher {
  private final int channels;
  private final int sr;
  private final float[] hold;
  private double phase, step;
  private float q = 1f / 128f, mix = 1f;
  private boolean quantize = true;

  public BitCrusher(int channels, int sampleRate) {
    this.channels = channels;
    this.sr = sampleRate;
    hold = new float[channels];
    set(8f, 11025f, 1f);
    reset();
  }

  /**
   * @param bits 2..16 (16 = nicemleme yok)
   * @param rateHz hedef örnekleme hızı
   */
  public void set(float bits, float rateHz, float mix) {
    float b = Math.max(1f, Math.min(16f, bits));
    quantize = b < 15.99f;
    q = (float) (1.0 / Math.pow(2, b - 1));   // tam ölçek ±1 → 2^bits basamak
    step = Math.max(1.0, Math.min(sr, rateHz)) / sr;
    this.mix = Math.max(0f, Math.min(1f, mix));
  }

  public void reset() {
    java.util.Arrays.fill(hold, 0f);
    phase = 1.0;  // ilk örnek hemen alınır
  }

  public void process(float[] buf, int frames) {
    float dry = 1f - mix;
    for (int f = 0; f < frames; f++) {
      int base = f * channels;
      phase += step;
      if (phase >= 1.0) {
        phase -= Math.floor(phase);
        for (int c = 0; c < channels; c++) {
          float v = buf[base + c];
          if (quantize) v = Math.round(v / q) * q;
          hold[c] = Math.max(-1f, Math.min(1f, v));
        }
      }
      for (int c = 0; c < channels; c++) buf[base + c] = buf[base + c] * dry + hold[c] * mix;
    }
  }
}
