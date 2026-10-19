package expo.modules.kurguengine.dsp;

/**
 * Halka modülasyonu: girdi bir sinüs taşıyıcıyla çarpılır (robot / bilim kurgu
 * tınısı). Çıkış = kuru·(1-mix) + girdi·sin(2πft)·mix; genlik girdiyi aşmaz.
 * Gecikme: 0 örnek.
 */
public final class RingMod {
  private final int channels;
  private final int sr;
  private double phase, inc;
  private float mix = 0.5f;

  public RingMod(int channels, int sampleRate) {
    this.channels = channels;
    this.sr = sampleRate;
    set(30f, 0.5f);
  }

  public void set(float hz, float mix) {
    inc = 2 * Math.PI * Math.max(0.1f, hz) / sr;
    this.mix = Math.max(0f, Math.min(1f, mix));
  }

  public void reset() {
    phase = 0;
  }

  public void process(float[] buf, int frames) {
    float dry = 1f - mix;
    for (int f = 0; f < frames; f++) {
      float m = (float) Math.sin(phase) * mix + dry;
      phase += inc;
      if (phase > 2 * Math.PI) phase -= 2 * Math.PI;
      int base = f * channels;
      for (int c = 0; c < channels; c++) buf[base + c] *= m;
    }
  }
}
