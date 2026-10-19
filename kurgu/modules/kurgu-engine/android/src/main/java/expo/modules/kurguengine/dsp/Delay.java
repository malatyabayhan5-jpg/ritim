package expo.modules.kurguengine.dsp;

/**
 * Yankı / gecikme (echo). Her kanal için dairesel tampon; geri beslemede tek
 * kutuplu alçak geçiren ("damp": her tekrar biraz daha koyulaşır, analog bant
 * yankısı gibi). Ping-pong (yalnızca stereo): giriş toplamı sol hatta girer,
 * sol hattın çıkışı sağ hatta, sağın çıkışı geri beslemeyle sola döner; tekrarlar
 * sırayla sol/sağ duyulur.
 *
 * Darbe yanıtı (damp = 0): k. yankı k·T örnekte, genliği ıslak · fb^(k-1).
 * Karışım yasası: kuru = min(1, 2(1-mix)), ıslak = min(1, 2·mix) — mix 0.5'te
 * ikisi de tam seviyede. Geri besleme ≤ 0.95 (döngü kazancı < 1, kararlı).
 * Gecikme (latency): 0 örnek.
 */
public final class Delay {
  public static final float MAX_MS = 2000f;

  private final int channels;
  private final int sr;
  private final int size;
  private final float[][] line;
  private final float[] lp;
  private int pos, delay;
  private float fb = 0.35f, a = 1f, dryG = 1f, wetG = 0.6f;
  private boolean pingPong;

  public Delay(int channels, int sampleRate) {
    this.channels = channels;
    this.sr = sampleRate;
    size = (int) Math.ceil(MAX_MS * 0.001 * sr) + 2;
    line = new float[channels][size];
    lp = new float[channels];
    set(350f, 0.35f, 0f, 0.3f, false);
  }

  /** Bir örnekteki yankı gecikmesi (test ve belgeleme için). */
  public int delayFrames() {
    return delay;
  }

  public void set(float timeMs, float feedback, float damp, float mix, boolean pingPong) {
    delay = Math.max(1, Math.min(size - 1, Math.round(Math.max(1f, Math.min(MAX_MS, timeMs)) * 0.001f * sr)));
    fb = Math.max(0f, Math.min(0.95f, feedback));
    float d = Math.max(0f, Math.min(1f, damp));
    // damp 0 → süzgeç yok (a = 1); 1 → ≈1 kHz köşe
    double fc = 1000 * Math.pow(20, 1 - d);
    a = d <= 0f ? 1f : (float) (1 - Math.exp(-2 * Math.PI * Math.min(fc, sr * 0.45) / sr));
    float m = Math.max(0f, Math.min(1f, mix));
    dryG = Math.min(1f, 2 * (1 - m));
    wetG = Math.min(1f, 2 * m);
    this.pingPong = pingPong && channels == 2;
  }

  public void reset() {
    for (float[] l : line) java.util.Arrays.fill(l, 0f);
    java.util.Arrays.fill(lp, 0f);
    pos = 0;
  }

  private float tap(int c) {
    int rp = pos - delay;
    if (rp < 0) rp += size;
    float v = line[c][rp];
    lp[c] += a * (v - lp[c]);
    if (Math.abs(lp[c]) < 1e-20f) lp[c] = 0f;
    return lp[c];
  }

  public void process(float[] buf, int frames) {
    for (int f = 0; f < frames; f++) {
      int base = f * channels;
      if (pingPong) {
        float l = tap(0), r = tap(1);
        float xl = buf[base], xr = buf[base + 1];
        line[0][pos] = 0.5f * (xl + xr) + fb * r;
        line[1][pos] = fb * l;
        buf[base] = xl * dryG + l * wetG;
        buf[base + 1] = xr * dryG + r * wetG;
      } else {
        for (int c = 0; c < channels; c++) {
          float w = tap(c);
          float x = buf[base + c];
          line[c][pos] = x + fb * w;
          buf[base + c] = x * dryG + w * wetG;
        }
      }
      if (++pos == size) pos = 0;
    }
  }
}
