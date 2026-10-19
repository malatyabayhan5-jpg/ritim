package expo.modules.kurguengine.dsp;

/**
 * İkinci dereceden IIR süzgeç (biquad), kanal başına durumlu.
 *
 * Katsayı formülleri: Robert Bristow-Johnson, "Cookbook formulae for audio EQ
 * biquad filter coefficients" (ders kitabı formülleri; kod özgündür). Yapı:
 * aktarılmış doğrudan biçim II (transposed direct form II); katsayılar ve durum
 * double tutulur, böylece 48 kHz'te 20-30 Hz gibi düşük köşe frekanslarında da
 * sayısal gürültü oluşmaz.
 *
 * Örnekler araya serpiştirilmiş (interleaved) float dizidir; Android bağımlılığı yoktur.
 */
public final class Biquad {
  /** Raf süzgeç eğimi (RBJ "S"); 1 = en dik tepesiz eğim. */
  private static final double SHELF_S = 1.0;
  private final int channels;
  private final double[] z1;
  private final double[] z2;
  // a0'a bölünmüş katsayılar
  private double b0 = 1, b1, b2, a1, a2;
  private boolean bypass = true;

  public Biquad(int channels) {
    this.channels = channels;
    z1 = new double[channels];
    z2 = new double[channels];
  }

  public void reset() {
    java.util.Arrays.fill(z1, 0);
    java.util.Arrays.fill(z2, 0);
  }

  public boolean isBypass() {
    return bypass;
  }

  /** Süzgeci devreden çıkarır (birim yanıt). */
  public void setBypass() {
    b0 = 1; b1 = 0; b2 = 0; a1 = 0; a2 = 0;
    bypass = true;
  }

  private static double clampFreq(double f, int sr) {
    return Math.max(1.0, Math.min(f, sr * 0.49));
  }

  private void set(double nb0, double nb1, double nb2, double na0, double na1, double na2) {
    b0 = nb0 / na0; b1 = nb1 / na0; b2 = nb2 / na0;
    a1 = na1 / na0; a2 = na2 / na0;
    bypass = false;
  }

  /** Çan (peaking) süzgeç: f0 merkezde gainDb kadar yükseltme/kesme. */
  public void peaking(double f0, double gainDb, double q, int sr) {
    if (Math.abs(gainDb) < 1e-3) { setBypass(); return; }
    double A = Math.pow(10, gainDb / 40);
    double w0 = 2 * Math.PI * clampFreq(f0, sr) / sr;
    double cs = Math.cos(w0), alpha = Math.sin(w0) / (2 * Math.max(0.05, q));
    set(1 + alpha * A, -2 * cs, 1 - alpha * A, 1 + alpha / A, -2 * cs, 1 - alpha / A);
  }

  /** Alçak raf (low shelf), eğim S = 1. */
  public void lowShelf(double f0, double gainDb, int sr) {
    if (Math.abs(gainDb) < 1e-3) { setBypass(); return; }
    double A = Math.pow(10, gainDb / 40);
    double w0 = 2 * Math.PI * clampFreq(f0, sr) / sr;
    double cs = Math.cos(w0), sn = Math.sin(w0);
    double alpha = sn / 2 * Math.sqrt((A + 1 / A) * (1 / SHELF_S - 1) + 2);
    double k = 2 * Math.sqrt(A) * alpha;
    set(A * ((A + 1) - (A - 1) * cs + k),
        2 * A * ((A - 1) - (A + 1) * cs),
        A * ((A + 1) - (A - 1) * cs - k),
        (A + 1) + (A - 1) * cs + k,
        -2 * ((A - 1) + (A + 1) * cs),
        (A + 1) + (A - 1) * cs - k);
  }

  /** Yüksek raf (high shelf), eğim S = 1. */
  public void highShelf(double f0, double gainDb, int sr) {
    if (Math.abs(gainDb) < 1e-3) { setBypass(); return; }
    double A = Math.pow(10, gainDb / 40);
    double w0 = 2 * Math.PI * clampFreq(f0, sr) / sr;
    double cs = Math.cos(w0), sn = Math.sin(w0);
    double alpha = sn / 2 * Math.sqrt((A + 1 / A) * (1 / SHELF_S - 1) + 2);
    double k = 2 * Math.sqrt(A) * alpha;
    set(A * ((A + 1) + (A - 1) * cs + k),
        -2 * A * ((A - 1) + (A + 1) * cs),
        A * ((A + 1) + (A - 1) * cs - k),
        (A + 1) - (A - 1) * cs + k,
        2 * ((A - 1) - (A + 1) * cs),
        (A + 1) - (A - 1) * cs - k);
  }

  public void lowPass(double f0, double q, int sr) {
    double w0 = 2 * Math.PI * clampFreq(f0, sr) / sr;
    double cs = Math.cos(w0), alpha = Math.sin(w0) / (2 * q);
    set((1 - cs) / 2, 1 - cs, (1 - cs) / 2, 1 + alpha, -2 * cs, 1 - alpha);
  }

  public void highPass(double f0, double q, int sr) {
    double w0 = 2 * Math.PI * clampFreq(f0, sr) / sr;
    double cs = Math.cos(w0), alpha = Math.sin(w0) / (2 * q);
    set((1 + cs) / 2, -(1 + cs), (1 + cs) / 2, 1 + alpha, -2 * cs, 1 - alpha);
  }

  /** Tasarlanan süzgecin f frekansındaki kuramsal genlik yanıtı (dB); testlerde ölçümle karşılaştırılır. */
  public double magnitudeDb(double f, int sr) {
    if (bypass) return 0;
    double w = 2 * Math.PI * f / sr;
    double c1 = Math.cos(w), s1 = Math.sin(w), c2 = Math.cos(2 * w), s2 = Math.sin(2 * w);
    double nr = b0 + b1 * c1 + b2 * c2, ni = -(b1 * s1 + b2 * s2);
    double dr = 1 + a1 * c1 + a2 * c2, di = -(a1 * s1 + a2 * s2);
    return 10 * Math.log10((nr * nr + ni * ni) / (dr * dr + di * di));
  }

  /** Yerinde işler: buf[0 .. frames*channels). */
  public void process(float[] buf, int frames) {
    if (bypass) return;
    for (int c = 0; c < channels; c++) {
      double s1 = z1[c], s2 = z2[c];
      for (int i = c, n = frames * channels; i < n; i += channels) {
        double x = buf[i];
        double y = b0 * x + s1;
        s1 = b1 * x - a1 * y + s2;
        s2 = b2 * x - a2 * y;
        buf[i] = (float) y;
      }
      // Alt-normal (denormal) sayıları sıfırla: sessizlikte işlemci yükü artmasın.
      z1[c] = Math.abs(s1) < 1e-25 ? 0 : s1;
      z2[c] = Math.abs(s2) < 1e-25 ? 0 : s2;
    }
  }
}
