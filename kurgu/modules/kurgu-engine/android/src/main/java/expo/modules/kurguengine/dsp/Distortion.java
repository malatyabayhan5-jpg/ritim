package expo.modules.kurguengine.dsp;

/**
 * Doygunluk / bozulma: ön kazanç → yumuşak kırpma → ton (alçak geçiren) → kuru/ıslak karışım.
 *
 * Kırpma eğrisi tanh'ın [-3, 3] aralığındaki Padé (3,2) yaklaşımıdır:
 * x(27 + x²) / (27 + 9x²), |x| ≥ 3'te ±1. Tekdüze artandır ve |çıkış| ≤ 1
 * olduğu için çıkış her zaman sınırlıdır. Seviye telafisi: -12 dBFS (0.25)
 * genlikli bir girdi kabaca aynı tepe seviyesinde kalır (sürüş arttıkça ses
 * yüksekliği patlamaz). Not: aşırı örnekleme yoktur; yüksek sürüşte yüksek
 * frekanslı içerikte bir miktar örtüşme (aliasing) olur, ton süzgeci bunu yumuşatır.
 * Gecikme: 0 örnek.
 */
public final class Distortion {
  private final int channels;
  private final int sr;
  private final Biquad tone;
  private float pre = 1f, post = 1f, mix = 1f;

  public Distortion(int channels, int sampleRate) {
    this.channels = channels;
    this.sr = sampleRate;
    tone = new Biquad(channels);
  }

  public static float softClip(float x) {
    if (x >= 3f) return 1f;
    if (x <= -3f) return -1f;
    float x2 = x * x;
    return x * (27f + x2) / (27f + 9f * x2);
  }

  /**
   * @param driveDb ön kazanç (dB)
   * @param tone 0 = koyu (≈800 Hz) … 1 = açık (≈16 kHz)
   * @param mix 0 = kuru … 1 = tamamen bozulmuş
   */
  public void set(float driveDb, float tone, float mix) {
    pre = (float) Math.pow(10, driveDb / 20.0);
    post = 0.25f / softClip(0.25f * pre);
    this.mix = Math.max(0f, Math.min(1f, mix));
    double hz = 800 * Math.pow(20, Math.max(0f, Math.min(1f, tone)));
    if (hz >= sr * 0.45) this.tone.setBypass(); else this.tone.lowPass(hz, Math.sqrt(0.5), sr);
  }

  public void reset() {
    tone.reset();
  }

  /** @param scratch en az frames*channels uzunlukta geçici dizi (ıslak yol) */
  public void process(float[] buf, int frames, float[] scratch) {
    int n = frames * channels;
    for (int i = 0; i < n; i++) scratch[i] = softClip(buf[i] * pre) * post;
    tone.process(scratch, frames);
    float dry = 1f - mix;
    for (int i = 0; i < n; i++) buf[i] = buf[i] * dry + scratch[i] * mix;
  }
}
