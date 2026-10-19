package expo.modules.kurguengine.dsp;

/**
 * Koro (chorus) / flanger: sinüs LFO ile kiplenen kısa gecikme hattı, doğrusal
 * aradeğerlemeli kesirli okuma. Gecikme = 7 ms + derinlik · 8 ms · (1 + sin)/2.
 * Stereoda sağ kanalın LFO'su 90° kaydırılır (genişlik hissi). Geri besleme
 * (|fb| ≤ 0.9) yüksekken metalik flanger/robot tınısı verir; döngü kazancı < 1
 * olduğundan kararlıdır. Karışım doğrusal: çıkış = (1-mix)·kuru + mix·ıslak.
 * Gecikme (latency): 0 örnek (ıslak yol bir efekt gecikmesidir, kuru yol hizalıdır).
 */
public final class Chorus {
  private static final double BASE_MS = 7;
  private static final double SWEEP_MS = 8;

  private final int channels;
  private final int sr;
  private final int size;
  private final float[][] line;
  private int pos;
  private double phase, inc;
  private float depth = 0.5f, fb = 0f, mix = 0.5f;

  public Chorus(int channels, int sampleRate) {
    this.channels = channels;
    this.sr = sampleRate;
    size = (int) Math.ceil((BASE_MS + SWEEP_MS + 2) * 0.001 * sr) + 4;
    line = new float[channels][size];
    set(0.8f, 0.5f, 0f, 0.5f);
  }

  public void set(float rateHz, float depth, float feedback, float mix) {
    inc = 2 * Math.PI * Math.max(0.01f, rateHz) / sr;
    this.depth = Math.max(0f, Math.min(1f, depth));
    this.fb = Math.max(-0.9f, Math.min(0.9f, feedback));
    this.mix = Math.max(0f, Math.min(1f, mix));
  }

  public void reset() {
    for (float[] l : line) java.util.Arrays.fill(l, 0f);
    pos = 0;
    phase = 0;
  }

  public void process(float[] buf, int frames) {
    float dry = 1f - mix;
    for (int f = 0; f < frames; f++) {
      int base = f * channels;
      for (int c = 0; c < channels; c++) {
        double lfo = Math.sin(phase + (c == 1 ? Math.PI / 2 : 0));
        double d = (BASE_MS + SWEEP_MS * depth * 0.5 * (1 + lfo)) * 0.001 * sr;
        double rp = pos - d;
        if (rp < 0) rp += size;
        int i0 = (int) rp;
        float fr = (float) (rp - i0);
        int i1 = i0 + 1 == size ? 0 : i0 + 1;
        float[] l = line[c];
        float wet = l[i0] + (l[i1] - l[i0]) * fr;
        float x = buf[base + c];
        float w = x + fb * wet;
        l[pos] = Math.abs(w) < 1e-20f ? 0f : w;
        buf[base + c] = x * dry + wet * mix;
      }
      if (++pos == size) pos = 0;
      phase += inc;
      if (phase > 2 * Math.PI) phase -= 2 * Math.PI;
    }
  }
}
