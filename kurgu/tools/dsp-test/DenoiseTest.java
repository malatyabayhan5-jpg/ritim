import expo.modules.kurguengine.dsp.SpectralDenoiser;
import java.util.Random;

/**
 * Gürültü azaltma çekirdeğinin ölçümlü testi (Android gerektirmez):
 *   javac -d /tmp/dsp modules/.../dsp/SpectralDenoiser.java tools/dsp-test/DenoiseTest.java && java -cp /tmp/dsp DenoiseTest
 * Sentetik konuşma benzeri sinyal (harmonikli hece patlamaları + duraklamalar)
 * ve pembe/beyaz gürültü ile: duraklamalarda gürültü düşüşü, konuşma enerjisinin
 * korunması, SNR iyileşmesi, örnek düzeyinde hizalama ve uzunluk korunumu.
 */
public class DenoiseTest {
  static final int SR = 48000;
  static int failures = 0;

  public static void main(String[] args) {
    for (int ch : new int[] {1, 2}) {
      for (float noiseDb : new float[] {-25f, -35f}) {
        for (boolean pink : new boolean[] {false, true}) run(ch, noiseDb, pink, 0.7f);
      }
    }
    run(1, -30f, true, 0.3f);
    run(1, -30f, true, 1.0f);
    if (failures > 0) {
      System.out.println("BAŞARISIZ: " + failures);
      System.exit(1);
    }
    System.out.println("Tüm gürültü azaltma testleri geçti");
  }

  static void run(int ch, float noiseDb, boolean pink, float strength) {
    int len = SR * 9;
    float[] clean = new float[len];
    boolean[] speech = new boolean[len];
    Random rnd = new Random(7);
    for (int i = 0; i < len; i++) {
      double t = (double) i / SR;
      double inCycle = t % 3.0;                     // her 3 sn'de 1 sn duraklama
      boolean voiced = inCycle < 2.0 && (t % 0.35) < 0.25 && t > 0.5;
      double f0 = 140 + 30 * Math.sin(2 * Math.PI * 0.7 * t);
      double v = 0;
      for (int h = 1; h <= 12; h++) {
        double formant = Math.exp(-Math.pow((h * f0 - 700) / 400, 2)) + 0.5 * Math.exp(-Math.pow((h * f0 - 1300) / 500, 2)) + 0.1;
        v += formant * Math.sin(2 * Math.PI * h * f0 * t + h);
      }
      double env = voiced ? Math.sin(Math.PI * ((t % 0.35) / 0.25)) : 0;
      clean[i] = (float) (0.15 * v * env);
      speech[i] = voiced && env > 0.3;
    }
    float[] noise = new float[len];
    double b0 = 0, b1 = 0, b2 = 0;
    for (int i = 0; i < len; i++) {
      double w = rnd.nextGaussian();
      if (pink) {
        b0 = 0.99765 * b0 + w * 0.0990460; b1 = 0.96300 * b1 + w * 0.2965164; b2 = 0.57000 * b2 + w * 1.0526913;
        w = (b0 + b1 + b2 + w * 0.1848) * 0.25;
      }
      noise[i] = (float) w;
    }
    double cleanRms = rms(clean, speech, true);
    double nRms = rms(noise, null, false);
    double scale = cleanRms * Math.pow(10, noiseDb / 20) / nRms;
    float[] in = new float[len * ch];
    for (int i = 0; i < len; i++) for (int c = 0; c < ch; c++) in[i * ch + c] = clean[i] + (float) (noise[i] * scale);

    SpectralDenoiser d = new SpectralDenoiser(ch, SR);
    d.setStrength(strength);
    float[] out = new float[(len + SpectralDenoiser.N * 2) * ch];
    int w = 0;
    int block = 997; // düzensiz blok boyu: tampon sınırlarını sınar
    float[] tmp = new float[(block + SpectralDenoiser.N) * ch];
    for (int pos = 0; pos < len; pos += block) {
      int n = Math.min(block, len - pos);
      float[] chunk = new float[n * ch];
      System.arraycopy(in, pos * ch, chunk, 0, n * ch);
      int got = d.process(chunk, n, tmp);
      System.arraycopy(tmp, 0, out, w * ch, got * ch);
      w += got;
    }
    float[] tailOut = new float[(SpectralDenoiser.N * 2) * ch];
    int got = d.flush(tailOut);
    System.arraycopy(tailOut, 0, out, w * ch, got * ch);
    w += got;

    String name = String.format("%dch %s %.0fdB güç=%.1f", ch, pink ? "pembe" : "beyaz", noiseDb, strength);
    check(name + ": uzunluk korunur", w == len, w + " / " + len);
    float[] o0 = new float[len];
    float[] i0 = new float[len];
    boolean finite = true;
    for (int i = 0; i < len; i++) {
      o0[i] = out[i * ch];
      i0[i] = in[i * ch];
      if (!Float.isFinite(o0[i])) finite = false;
    }
    check(name + ": sonlu değerler", finite, "");
    boolean[] pause = new boolean[len];
    for (int i = 0; i < len; i++) {
      double t = (double) i / SR;
      pause[i] = (t % 3.0) > 2.15 && (t % 3.0) < 2.9 && t > 2.0;  // ilk saniyeler uyum süresi
    }
    double reduction = 20 * Math.log10(rms(i0, pause, true) / rms(o0, pause, true));
    double speechLoss = 20 * Math.log10(rms(clean, speech, true) / rms(o0, speech, true));
    float[] err = new float[len];
    float[] nzIn = new float[len];
    for (int i = 0; i < len; i++) { err[i] = o0[i] - clean[i]; nzIn[i] = i0[i] - clean[i]; }
    boolean[] late = new boolean[len];
    for (int i = SR * 2; i < len; i++) late[i] = true;
    double snrIn = 20 * Math.log10(rms(clean, late, true) / rms(nzIn, late, true));
    double snrOut = 20 * Math.log10(rms(clean, late, true) / rms(err, late, true));
    int lag = bestLag(clean, o0, 64);
    System.out.printf("%s: duraklamada -%.1f dB, konuşma kaybı %.2f dB, SNR %.1f -> %.1f dB, gecikme %d örnek%n", name, reduction, speechLoss, snrIn, snrOut, lag);
    double minReduction = 4 + 10 * strength;
    check(name + ": duraklamada gürültü düşüşü >= " + minReduction + " dB", reduction >= minReduction, String.format("%.1f", reduction));
    check(name + ": konuşma kaybı <= 2 dB", speechLoss <= 2.0, String.format("%.2f", speechLoss));
    check(name + ": SNR iyileşir", snrOut > snrIn + 2, String.format("%.1f -> %.1f", snrIn, snrOut));
    check(name + ": örnek düzeyinde hizalı", lag == 0, "" + lag);
  }

  static double rms(float[] x, boolean[] mask, boolean use) {
    double s = 0;
    long n = 0;
    for (int i = 0; i < x.length; i++) if (!use || mask[i]) { s += x[i] * x[i]; n++; }
    return Math.sqrt(s / Math.max(1, n)) + 1e-12;
  }

  static int bestLag(float[] a, float[] b, int max) {
    int best = 0;
    double bestV = -1e30;
    for (int lag = -max; lag <= max; lag++) {
      double s = 0;
      for (int i = SR * 2; i < a.length - max; i += 3) s += a[i] * b[i + lag];
      if (s > bestV) { bestV = s; best = lag; }
    }
    return best;
  }

  static void check(String what, boolean ok, String detail) {
    if (!ok) {
      failures++;
      System.out.println("  HATA: " + what + " (" + detail + ")");
    }
  }
}
