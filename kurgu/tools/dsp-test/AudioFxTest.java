import expo.modules.kurguengine.dsp.AudioFxChain;
import expo.modules.kurguengine.dsp.BitCrusher;
import expo.modules.kurguengine.dsp.Biquad;
import expo.modules.kurguengine.dsp.Chorus;
import expo.modules.kurguengine.dsp.Compressor;
import expo.modules.kurguengine.dsp.CutFilter;
import expo.modules.kurguengine.dsp.Delay;
import expo.modules.kurguengine.dsp.Distortion;
import expo.modules.kurguengine.dsp.Equalizer;
import expo.modules.kurguengine.dsp.Limiter;
import expo.modules.kurguengine.dsp.NoiseGate;
import expo.modules.kurguengine.dsp.Reverb;
import expo.modules.kurguengine.dsp.StereoWidener;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.List;
import java.util.Random;

/**
 * Ses efekt zincirinin ölçümlü testi (Android gerektirmez):
 *   javac -d /tmp/fx modules/.../dsp/*.java tools/dsp-test/AudioFxTest.java
 *   java -cp /tmp/fx AudioFxTest tests/fixtures/audio-presets.txt
 * Sentetik sinyallerle: EQ genlik yanıtı (tasarım ve kuramsal yanıtla), kesim
 * süzgeçlerinin zayıflatması, sıkıştırıcı statik eğrisi ve atak/bırakma süreleri,
 * sınırlayıcının tavanı asla aşmaması (+12 dB), yankının örnek düzeyinde konumu
 * ve geri besleme sönümü, yankılanım RT60'ının oda boyutuyla artması ve uç
 * ayarlarda kararlılık, koro/bozulma çıkışının sınırlılığı, kapı, bit ezici,
 * genişlik, zincirin gecikme telafisi ve tüm ön ayarların 10 sn'lik zorlu sinyali
 * NaN/kırpma olmadan işlemesi (JS tarafının ürettiği tests/fixtures/audio-presets.txt).
 */
public class AudioFxTest {
  static final int SR = 48000;
  static int failures = 0;
  static int checks = 0;

  public static void main(String[] args) throws Exception {
    eqResponse(SR);
    eqResponse(44100);
    cutFilters();
    compressorStatic();
    compressorTiming();
    limiterCeiling();
    chainGainHot();
    delayEcho();
    reverbDecay(SR);
    reverbDecay(44100);
    reverbStability();
    chorusDistortionBounded();
    gate();
    crusherAndWidth();
    chainAlignment();
    if (args.length > 0) presets(args[0]);
    System.out.printf("Gecikme: sınırlayıcı ileriye bakışı %d örnek @48 kHz (%.2f ms), zincir bunu telafi eder; çıkış hizalı.%n",
        new Limiter(2, SR).latencyFrames(), new Limiter(2, SR).latencyFrames() * 1000.0 / SR);
    if (failures > 0) {
      System.out.println("BAŞARISIZ: " + failures + " / " + checks);
      System.exit(1);
    }
    System.out.println("Tüm ses efekti testleri geçti (" + checks + " denetim)");
  }

  // ---------- yardımcılar ----------

  static float[] sine(double f, double amp, int len, int sr) {
    float[] x = new float[len];
    for (int i = 0; i < len; i++) x[i] = (float) (amp * Math.sin(2 * Math.PI * f * i / sr));
    return x;
  }

  /** Tamsayı Hz için 1 sn'lik pencerede tam periyot: sızıntısız genlik (tek frekanslı DFT). */
  static double amplitude(float[] x, double f, int from, int n, int sr, int ch, int c) {
    double s = 0, co = 0;
    for (int i = 0; i < n; i++) {
      double v = x[(from + i) * ch + c];
      double w = 2 * Math.PI * f * (from + i) / sr;
      s += v * Math.sin(w);
      co += v * Math.cos(w);
    }
    return 2 * Math.sqrt(s * s + co * co) / n;
  }

  static double db(double v) {
    return 20 * Math.log10(Math.max(v, 1e-12));
  }

  static double peak(float[] x, int from, int to) {
    double m = 0;
    for (int i = from; i < to; i++) m = Math.max(m, Math.abs(x[i]));
    return m;
  }

  static double rms(float[] x, int from, int to) {
    double s = 0;
    for (int i = from; i < to; i++) s += (double) x[i] * x[i];
    return Math.sqrt(s / Math.max(1, to - from));
  }

  static boolean finite(float[] x) {
    for (float v : x) if (!Float.isFinite(v)) return false;
    return true;
  }

  static void check(String what, boolean ok, String detail) {
    checks++;
    if (!ok) {
      failures++;
      System.out.println("  HATA: " + what + " (" + detail + ")");
    }
  }

  static void near(String what, double got, double want, double tol) {
    check(what, Math.abs(got - want) <= tol, String.format("ölçülen %.3f, beklenen %.3f ± %.3f", got, want, tol));
  }

  /** Zinciri düzensiz bloklarla çalıştırır; çıktı girdiyle aynı uzunlukta olmalı. */
  static float[] runChain(AudioFxChain chain, float[] in, int ch) {
    int len = in.length / ch;
    float[] out = new float[in.length];
    int w = 0;
    int[] blocks = {997, 64, 4096, 1, 333};
    float[] chunk = new float[4096 * ch];
    float[] tmp = new float[4096 * ch];
    int bi = 0;
    for (int pos = 0; pos < len; ) {
      int n = Math.min(blocks[bi++ % blocks.length], len - pos);
      System.arraycopy(in, pos * ch, chunk, 0, n * ch);
      int got = chain.process(chunk, n, tmp);
      System.arraycopy(tmp, 0, out, w * ch, got * ch);
      w += got;
      pos += n;
    }
    float[] tail = new float[(chain.latencyFrames() + 1) * ch];
    int got = chain.flush(tail);
    System.arraycopy(tail, 0, out, w * ch, got * ch);
    w += got;
    check("zincir: çıktı uzunluğu = girdi uzunluğu", w == len, w + " / " + len);
    return out;
  }

  static float[] params(Object... kv) {
    float[] p = AudioFxChain.defaults();
    for (int i = 0; i < kv.length; i += 2) {
      int idx = AudioFxChain.index((String) kv[i]);
      if (idx < 0) throw new IllegalArgumentException("anahtar yok: " + kv[i]);
      p[idx] = ((Number) kv[i + 1]).floatValue();
    }
    return p;
  }

  // ---------- EQ ----------

  static double measureGainDb(java.util.function.Consumer<float[]> proc, double f, int sr) {
    int len = (int) (sr * 1.5);
    float[] x = sine(f, 0.25, len, sr);
    proc.accept(x);
    return db(amplitude(x, f, sr / 2, sr, sr, 1, 0) / 0.25);
  }

  static void eqResponse(int sr) {
    double[] freqs = {30, 60, 100, 200, 400, 800, 1000, 2000, 3000, 6000, 10000, 15000};
    // Tek tek bantlar: tasarım hedefleri
    Biquad pk = new Biquad(1);
    pk.peaking(1000, 9, 1.4, sr);
    near(sr + " çan +9 dB @1 kHz merkezde", measureGainDb((x) -> { pk.reset(); pk.process(x, x.length); }, 1000, sr), 9, 0.05);
    pk.peaking(3000, -12, 4, sr);
    near(sr + " çan -12 dB @3 kHz merkezde", measureGainDb((x) -> { pk.reset(); pk.process(x, x.length); }, 3000, sr), -12, 0.05);
    near(sr + " çan -12 dB @3 kHz: 2 oktav uzakta ≈ 0", measureGainDb((x) -> { pk.reset(); pk.process(x, x.length); }, 750, sr), 0, 0.3);
    Biquad ls = new Biquad(1);
    ls.lowShelf(200, 6, sr);
    near(sr + " alçak raf +6: 20 Hz'te tam kazanç", measureGainDb((x) -> { ls.reset(); ls.process(x, x.length); }, 20, sr), 6, 0.3);
    near(sr + " alçak raf +6: köşede yarı kazanç", measureGainDb((x) -> { ls.reset(); ls.process(x, x.length); }, 200, sr), 3, 0.1);
    near(sr + " alçak raf +6: 4 kHz'te ≈ 0", measureGainDb((x) -> { ls.reset(); ls.process(x, x.length); }, 4000, sr), 0, 0.2);
    Biquad hs = new Biquad(1);
    hs.highShelf(4000, -8, sr);
    near(sr + " yüksek raf -8: 16 kHz'te tam kazanç", measureGainDb((x) -> { hs.reset(); hs.process(x, x.length); }, 16000, sr), -8, 0.6);
    near(sr + " yüksek raf -8: köşede yarı kazanç", measureGainDb((x) -> { hs.reset(); hs.process(x, x.length); }, 4000, sr), -4, 0.1);
    near(sr + " yüksek raf -8: 200 Hz'te ≈ 0", measureGainDb((x) -> { hs.reset(); hs.process(x, x.length); }, 200, sr), 0, 0.2);

    // Tam EQ: ölçülen yanıt = kuramsal tasarım yanıtı (0.1 dB içinde)
    Equalizer eq = new Equalizer(1, sr);
    eq.setHighPass(40);
    eq.setLowShelf(100, 6);
    eq.setBand(0, 400, -8, 1.4f);
    eq.setBand(1, 2000, 5, 2f);
    eq.setBand(2, 6000, -4, 0.7f);
    eq.setHighShelf(10000, 4);
    eq.setLowPass(18000);
    double worst = 0;
    StringBuilder sb = new StringBuilder();
    for (double f : freqs) {
      double got = measureGainDb((x) -> { eq.reset(); eq.process(x, x.length); }, f, sr);
      double want = eq.magnitudeDb(f);
      worst = Math.max(worst, Math.abs(got - want));
      sb.append(String.format(" %.0fHz:%+.2f", f, got));
    }
    System.out.printf("EQ %d Hz ölçülen yanıt:%s (tasarımdan en büyük sapma %.3f dB)%n", sr, sb, worst);
    check(sr + " EQ ölçülen yanıt tasarımla uyumlu (≤ 0.1 dB)", worst <= 0.1, String.format("%.3f", worst));
  }

  static void cutFilters() {
    CutFilter hp = new CutFilter(1);
    hp.highPass(200, SR);
    double at200 = measureGainDb((x) -> { hp.reset(); hp.process(x, x.length); }, 200, SR);
    double at100 = measureGainDb((x) -> { hp.reset(); hp.process(x, x.length); }, 100, SR);
    double at50 = measureGainDb((x) -> { hp.reset(); hp.process(x, x.length); }, 50, SR);
    double at2k = measureGainDb((x) -> { hp.reset(); hp.process(x, x.length); }, 2000, SR);
    System.out.printf("Yüksek geçiren 200 Hz (24 dB/okt): 200Hz %.2f, 100Hz %.2f, 50Hz %.2f, 2kHz %.3f dB%n", at200, at100, at50, at2k);
    near("HP köşede -3 dB", at200, -3.01, 0.15);
    check("HP bir oktav altında ≤ -23 dB", at100 <= -23, String.format("%.2f", at100));
    check("HP iki oktav altında ≤ -47 dB", at50 <= -47, String.format("%.2f", at50));
    near("HP geçirme bandında ≈ 0", at2k, 0, 0.05);
    CutFilter lp = new CutFilter(1);
    lp.lowPass(3000, SR);
    double l3k = measureGainDb((x) -> { lp.reset(); lp.process(x, x.length); }, 3000, SR);
    double l6k = measureGainDb((x) -> { lp.reset(); lp.process(x, x.length); }, 6000, SR);
    double l12k = measureGainDb((x) -> { lp.reset(); lp.process(x, x.length); }, 12000, SR);
    double l300 = measureGainDb((x) -> { lp.reset(); lp.process(x, x.length); }, 300, SR);
    System.out.printf("Alçak geçiren 3 kHz (24 dB/okt): 3k %.2f, 6k %.2f, 12k %.2f, 300Hz %.3f dB%n", l3k, l6k, l12k, l300);
    near("LP köşede -3 dB", l3k, -3.01, 0.15);
    check("LP bir oktav üstünde ≤ -23 dB", l6k <= -23, String.format("%.2f", l6k));
    check("LP iki oktav üstünde ≤ -47 dB", l12k <= -47, String.format("%.2f", l12k));
    near("LP geçirme bandında ≈ 0", l300, 0, 0.05);
  }

  // ---------- sıkıştırıcı ----------

  static void compressorStatic() {
    for (float knee : new float[] {0f, 8f}) {
      Compressor c = new Compressor(2, SR);
      c.set(-20f, 4f, 5f, 80f, knee, 3f);
      StringBuilder sb = new StringBuilder();
      for (double inDb : new double[] {-40, -30, -24, -20, -16, -10, -3}) {
        c.reset();
        int len = SR * 2;
        float[] x = new float[len * 2];
        double a = Math.pow(10, inDb / 20);
        for (int i = 0; i < len; i++) {
          float v = (float) (a * Math.sin(2 * Math.PI * 1000 * i / SR));
          x[2 * i] = v;
          x[2 * i + 1] = v * 0.5f;
        }
        c.process(x, len);
        double outDb = db(peak(x, len, 2 * len));  // son 1 sn tepe (L kanalı en büyük)
        double want = c.staticCurve(inDb) + 3;
        sb.append(String.format(" %.0f→%.2f", inDb, outDb));
        near(String.format("sıkıştırıcı statik eğri diz=%.0f giriş %.0f dB", knee, inDb), outDb, want, 0.3);
      }
      System.out.printf("Sıkıştırıcı (eşik -20, oran 4, diz %.0f, makeup +3) giriş→çıkış dBFS:%s%n", knee, sb);
    }
    Compressor c = new Compressor(1, SR);
    c.set(-20f, 4f, 5f, 80f, 0f, 0f);
    near("statik eğri: -10 dB → -17.5 dB", c.staticCurve(-10), -17.5, 1e-9);
    near("statik eğri: eşik altında değişmez", c.staticCurve(-30), -30, 1e-9);
  }

  static void compressorTiming() {
    float attack = 20f, release = 200f;
    Compressor c = new Compressor(1, SR);
    c.set(-30f, 10f, attack, release, 0f, 0f);
    int seg = SR;
    float[] x = new float[seg * 3];
    for (int i = 0; i < x.length; i++) x[i] = (i >= seg && i < 2 * seg) ? 1f : 0.01f;
    float[] in = x.clone();
    c.process(x, x.length);
    double finalGr = -db(x[2 * seg - 1] / in[2 * seg - 1]);
    near("sıkıştırıcı kararlı azaltma 27 dB", finalGr, 27, 0.05);
    int tA = -1, tR = -1;
    for (int i = seg; i < 2 * seg; i++) {
      double gr = -db(x[i] / in[i]);
      if (gr >= finalGr * (1 - Math.exp(-1))) { tA = i - seg; break; }
    }
    for (int i = 2 * seg; i < 3 * seg; i++) {
      double gr = -db(x[i] / in[i]);
      if (gr <= finalGr * Math.exp(-1)) { tR = i - 2 * seg; break; }
    }
    double aMs = tA * 1000.0 / SR, rMs = tR * 1000.0 / SR;
    System.out.printf("Sıkıştırıcı zamanlama: atak %.1f ms (ayar %.0f), bırakma %.1f ms (ayar %.0f, atak ile seri)%n", aMs, attack, rMs, release);
    near("atak süresi (%63)", aMs, attack, attack * 0.15);
    check("bırakma süresi ayar ile ayar+atak arasında", rMs >= release * 0.9 && rMs <= (release + attack) * 1.15, String.format("%.1f ms", rMs));
  }

  // ---------- sınırlayıcı ----------

  static float[] hotMusic(int len, int ch, long seed, double amp) {
    Random r = new Random(seed);
    float[] x = new float[len * ch];
    double b0 = 0, b1 = 0, b2 = 0;
    for (int i = 0; i < len; i++) {
      double t = (double) i / SR;
      double w = r.nextGaussian();
      b0 = 0.99765 * b0 + w * 0.0990460; b1 = 0.96300 * b1 + w * 0.2965164; b2 = 0.57000 * b2 + w * 1.0526913;
      double pink = (b0 + b1 + b2 + w * 0.1848) * 0.08;
      double tones = 0.3 * Math.sin(2 * Math.PI * 110 * t) + 0.2 * Math.sin(2 * Math.PI * 1760 * t + 1) + 0.1 * Math.sin(2 * Math.PI * 7040 * t);
      double kick = (t % 0.5) < 0.08 ? Math.sin(2 * Math.PI * 55 * t) * Math.exp(-(t % 0.5) * 30) : 0;
      double click = (i % 12000) == 0 ? 1.0 : 0;   // tek örneklik darbe (en kötü durum)
      for (int c = 0; c < ch; c++) x[i * ch + c] = (float) (amp * (pink + tones + kick + click * (c == 0 ? 1 : -1)) * (c == 1 ? 0.9 : 1));
    }
    return x;
  }

  static void limiterCeiling() {
    for (float ceilDb : new float[] {-1f, -6f, 0f}) {
      Limiter lim = new Limiter(2, SR);
      lim.set(ceilDb, 60f);
      int len = SR * 5;
      float[] x = hotMusic(len, 2, 3, 1.0);
      for (int i = 0; i < x.length; i++) x[i] *= 3.98f;   // +12 dB
      lim.process(x, len);
      double ceil = Math.pow(10, ceilDb / 20);
      double pk = peak(x, 0, x.length);
      System.out.printf("Sınırlayıcı tavan %.0f dB, +12 dB sıcak girdi: çıkış tepe %.4f (tavan %.4f), güvenlik kırpması %d%n", ceilDb, pk, ceil, lim.safetyHits());
      check("sınırlayıcı tavanı aşmaz (" + ceilDb + " dB)", pk <= ceil + 1e-6, String.format("%.6f > %.6f", pk, ceil));
      check("sınırlayıcı güvenlik kırpmasına ihtiyaç duymaz", lim.safetyHits() == 0, "" + lim.safetyHits());
      check("sınırlayıcı sonlu", finite(x), "");
    }
    // Tavanın altındaki sinyale dokunmaz (gecikme hariç birebir)
    Limiter lim = new Limiter(1, SR);
    lim.set(-1f, 60f);
    float[] x = sine(440, 0.5, SR, SR);
    float[] y = x.clone();
    lim.process(y, y.length);
    int d = lim.latencyFrames();
    double err = 0;
    for (int i = d; i < y.length; i++) err = Math.max(err, Math.abs(y[i] - x[i - d]));
    check("sınırlayıcı tavan altında şeffaf ve gecikme = " + d, err < 1e-7, "" + err);
  }

  static void chainGainHot() {
    for (int ch : new int[] {1, 2}) {
      AudioFxChain chain = new AudioFxChain(ch, SR, params("gainDb", 12, "limOn", 1, "limCeiling", -1));
      float[] x = hotMusic(SR * 4, ch, 9, 0.9);
      float[] y = runChain(chain, x, ch);
      double ceil = Math.pow(10, -1 / 20.0);
      double pk = peak(y, 0, y.length);
      System.out.printf("Zincir %dch kazanç +12 dB + sınırlayıcı -1 dB: çıkış tepe %.2f dBFS%n", ch, db(pk));
      check("zincir +12 dB kazançta tavanı aşmaz", pk <= ceil + 1e-6, String.format("%.6f", pk));
      check("zincir güvenlik kırpması yok", chain.limiter().safetyHits() == 0, "" + chain.limiter().safetyHits());
      // Sınırlayıcı kapalıyken bile 0 dBFS aşılmaz
      AudioFxChain c2 = new AudioFxChain(ch, SR, params("gainDb", 12));
      float[] y2 = runChain(c2, x, ch);
      check("sınırlayıcı kapalıyken 0 dBFS güvenlik tavanı", peak(y2, 0, y2.length) <= 1.0 + 1e-6, String.format("%.6f", peak(y2, 0, y2.length)));
    }
  }

  // ---------- yankı ----------

  static void delayEcho() {
    float fb = 0.5f;
    AudioFxChain chain = new AudioFxChain(1, SR, params("dlyOn", 1, "dlyTime", 100, "dlyFeedback", fb, "dlyDamp", 0, "dlyMix", 0.5f));
    int len = SR;
    float[] x = new float[len];
    x[1000] = 0.5f;
    float[] y = runChain(chain, x, 1);
    int T = Math.round(0.1f * SR);
    near("yankı: kuru darbe yerinde (gecikme telafili)", y[1000], 0.5, 1e-6);
    for (int k = 1; k <= 4; k++) {
      int at = 1000 + k * T;
      double want = 0.5 * Math.pow(fb, k - 1);
      near("yankı " + k + ": " + at + ". örnekte genlik", y[at], want, 1e-6);
      check("yankı " + k + ": komşu örnekler sessiz", Math.abs(y[at - 1]) < 1e-7 && Math.abs(y[at + 1]) < 1e-7, y[at - 1] + " " + y[at + 1]);
    }
    double between = 0;
    for (int i = 1001; i < 1000 + T; i++) between = Math.max(between, Math.abs(y[i]));
    check("yankılar arasında sinyal yok", between < 1e-7, "" + between);
    System.out.printf("Yankı 100 ms (%d örnek), fb 0.5: genlikler %.4f %.4f %.4f %.4f%n", T, y[1000 + T], y[1000 + 2 * T], y[1000 + 3 * T], y[1000 + 4 * T]);

    // Ping-pong: tekrarlar sırayla sol / sağ
    AudioFxChain pp = new AudioFxChain(2, SR, params("dlyOn", 1, "dlyTime", 50, "dlyFeedback", fb, "dlyDamp", 0, "dlyMix", 0.5f, "dlyPingPong", 1));
    float[] s = new float[len * 2];
    s[2 * 1000] = 1f;
    float[] o = runChain(pp, s, 2);
    int T2 = Math.round(0.05f * SR);
    near("ping-pong 1. yankı solda", o[2 * (1000 + T2)], 0.5, 1e-6);
    near("ping-pong 1. yankı sağda yok", o[2 * (1000 + T2) + 1], 0, 1e-7);
    near("ping-pong 2. yankı sağda", o[2 * (1000 + 2 * T2) + 1], 0.5 * fb, 1e-6);
    near("ping-pong 2. yankı solda yok", o[2 * (1000 + 2 * T2)], 0, 1e-7);
    near("ping-pong 3. yankı solda", o[2 * (1000 + 3 * T2)], 0.5 * fb * fb, 1e-6);

    // Sönüm: her tekrar koyulaşır (yüksek frekans enerjisi azalır)
    Delay d = new Delay(1, SR);
    d.set(100, 0.7f, 0.8f, 1f, false);
    float[] imp = new float[SR];
    imp[0] = 1f;
    d.process(imp, imp.length);
    double e1 = peak(imp, T - 5, T + 200), e3 = peak(imp, 3 * T - 5, 3 * T + 400);
    check("damp: sonraki yankının tepe genliği daha düşük", e3 < e1 * 0.7 * 0.7, String.format("%.4f vs %.4f", e3, e1));
  }

  // ---------- yankılanım ----------

  /** Schroeder geri entegrasyonu ile T20 (−5…−25 dB) × 3 = RT60 (sn). */
  static double rt60(float[] y, int sr) {
    double[] edc = new double[y.length];
    double acc = 0;
    for (int i = y.length - 1; i >= 0; i--) { acc += (double) y[i] * y[i]; edc[i] = acc; }
    double total = edc[0];
    int i5 = -1, i25 = -1;
    for (int i = 0; i < y.length; i++) {
      double l = 10 * Math.log10(edc[i] / total + 1e-30);
      if (i5 < 0 && l <= -5) i5 = i;
      if (i25 < 0 && l <= -25) { i25 = i; break; }
    }
    if (i5 < 0 || i25 < 0) return Double.POSITIVE_INFINITY;
    return 3.0 * (i25 - i5) / sr;
  }

  static void reverbDecay(int sr) {
    double prev = 0;
    StringBuilder sb = new StringBuilder();
    for (float size : new float[] {0.1f, 0.3f, 0.5f, 0.7f, 0.9f}) {
      Reverb r = new Reverb(2, sr);
      r.set(size, 0.3f, 0f, 1f);
      int len = sr * 12;
      float[] x = new float[len * 2];
      x[0] = 1f;
      x[1] = 1f;
      r.process(x, len);
      float[] l = new float[len];
      for (int i = 0; i < len; i++) l[i] = x[2 * i];
      double t = rt60(l, sr);
      sb.append(String.format(" size %.1f→%.2fs", size, t));
      check(sr + " RT60 oda boyutuyla artar (size " + size + ")", t > prev * 1.15, String.format("%.3f ≤ %.3f", t, prev));
      check(sr + " yankılanım sonlu", finite(x), "");
      prev = t;
    }
    System.out.printf("Yankılanım RT60 @%d Hz (damping 0.3):%s%n", sr, sb);

    // Islak seviye ayarı: beyaz gürültüde size 0.5 → ıslak RMS ≈ kuru RMS
    Reverb r = new Reverb(1, sr);
    r.set(0.5f, 0.5f, 0f, 1f);
    Random rnd = new Random(1);
    float[] n = new float[sr * 4];
    for (int i = 0; i < n.length; i++) n[i] = (float) (rnd.nextGaussian() * 0.1);
    double dry = rms(n, sr, n.length);
    r.process(n, n.length);
    double ratio = db(rms(n, sr, n.length) / dry);
    System.out.printf("Yankılanım ıslak/kuru seviye (size 0.5): %+.2f dB%n", ratio);
    check("yankılanım ıslak seviyesi kuruya yakın (±3 dB)", Math.abs(ratio) <= 3, String.format("%.2f", ratio));

    // Ön gecikme: ilk ıslak örnek ön gecikmeden önce gelmez
    Reverb pr = new Reverb(1, sr);
    pr.set(0.5f, 0.5f, 100f, 1f);
    float[] imp = new float[sr];
    imp[0] = 1f;
    pr.process(imp, imp.length);
    int first = -1;
    for (int i = 0; i < imp.length; i++) if (Math.abs(imp[i]) > 1e-9) { first = i; break; }
    check(sr + " ön gecikme 100 ms", first >= Math.round(0.1 * sr), "ilk ıslak örnek " + first);
  }

  static void reverbStability() {
    for (int ch : new int[] {1, 2}) {
      AudioFxChain chain = new AudioFxChain(ch, SR, params("revOn", 1, "revSize", 1, "revDamping", 0, "revMix", 1, "revPreDelay", 250));
      int len = SR * 30;
      float[] x = new float[len * ch];
      Random rnd = new Random(5);
      for (int i = 0; i < SR * 10 * ch; i++) x[i] = (float) (rnd.nextDouble() * 2 - 1);  // 10 sn tam ölçek gürültü, sonra 20 sn sessizlik
      AudioFxChain raw = chain;
      float[] y = runChain(raw, x, ch);
      check("yankılanım uç ayar sonlu (" + ch + "ch)", finite(y), "");
      double loud = rms(y, SR * 5 * ch, SR * 10 * ch);
      double tail = rms(y, SR * 28 * ch, SR * 30 * ch);
      System.out.printf("Yankılanım uç ayar (size 1, damping 0, %dch): gürültü sırasında RMS %.3f, 18 sn sonra kuyruk %.1f dB%n", ch, loud, db(tail / loud));
      check("yankılanım uç ayarda patlamaz", loud < 1.0 && peak(y, 0, y.length) <= 1.0 + 1e-6, String.format("%.3f", loud));
      check("yankılanım kuyruğu söner (18 sn'de ≥ 25 dB)", db(tail / loud) < -25, String.format("%.1f dB", db(tail / loud)));
    }
  }

  // ---------- koro / bozulma ----------

  static void chorusDistortionBounded() {
    Random rnd = new Random(2);
    int len = SR * 5;
    float[] x = new float[len * 2];
    for (int i = 0; i < x.length; i++) x[i] = (float) (rnd.nextDouble() * 2 - 1);
    Chorus ch = new Chorus(2, SR);
    ch.set(5f, 1f, 0.9f, 1f);
    float[] y = x.clone();
    ch.process(y, len);
    double pk = peak(y, 0, y.length);
    System.out.printf("Koro (fb 0.9, derinlik 1) tam ölçek gürültü: çıkış tepe %.2f (kuram sınırı 10)%n", pk);
    check("koro sonlu ve sınırlı (≤ 1/(1-fb))", finite(y) && pk <= 10.0, String.format("%.3f", pk));
    // koro ıslak yolu gerçekten kiplenmiş gecikme: kuru ile ilinti < 1
    float[] s = sine(440, 0.5, len, SR);
    Chorus c2 = new Chorus(1, SR);
    c2.set(1f, 1f, 0f, 1f);
    float[] w = s.clone();
    c2.process(w, len);
    double corr = 0, ee = 0;
    for (int i = SR; i < len; i++) { corr += s[i] * w[i]; ee += s[i] * s[i]; }
    check("koro ıslak yolu kuru sinyalden farklı (kiplenmiş gecikme)", corr / ee < 0.95, String.format("%.3f", corr / ee));

    for (float drive : new float[] {0f, 12f, 24f, 40f}) {
      Distortion d = new Distortion(2, SR);
      d.set(drive, 0.5f, 1f);
      float[] z = x.clone();
      for (int i = 0; i < z.length; i++) z[i] *= 4f;   // aşırı sıcak girdi
      d.process(z, len, new float[len * 2]);
      double p = peak(z, 0, z.length);
      check("bozulma sınırlı (sürüş " + drive + " dB)", finite(z) && p <= 1.1, String.format("%.3f", p));
    }
    // Sürüş arttıkça harmonik içerik artar (1 kHz sinüste 3. harmonik)
    double prevH = -1e9;
    StringBuilder sb = new StringBuilder();
    for (float drive : new float[] {0f, 12f, 24f}) {
      Distortion d = new Distortion(1, SR);
      d.set(drive, 1f, 1f);
      float[] z = sine(1000, 0.25, SR * 2, SR);
      d.process(z, z.length, new float[z.length]);
      double h3 = db(amplitude(z, 3000, SR / 2, SR, SR, 1, 0) / amplitude(z, 1000, SR / 2, SR, SR, 1, 0));
      sb.append(String.format(" %.0fdB→H3 %.1f dBc", drive, h3));
      check("bozulma: sürüşle 3. harmonik artar", h3 > prevH + 3, String.format("%.1f", h3));
      prevH = h3;
    }
    System.out.println("Bozulma harmonikleri:" + sb);
  }

  // ---------- kapı / bit ezici / genişlik ----------

  static void gate() {
    NoiseGate g = new NoiseGate(1, SR);
    g.set(-45f, -40f, 1f, 50f);
    Random rnd = new Random(4);
    int len = SR * 3;
    float[] x = new float[len];
    for (int i = 0; i < len; i++) {
      double t = (double) i / SR;
      double noise = rnd.nextGaussian() * 0.001;  // ≈ -60 dBFS
      x[i] = (float) (noise + (t >= 1 && t < 2 ? 0.1 * Math.sin(2 * Math.PI * 300 * t) : 0));
    }
    float[] y = x.clone();
    g.process(y, len);
    double closed = db(rms(y, SR / 2, SR) / rms(x, SR / 2, SR));
    double open = db(rms(y, (int) (SR * 1.2), (int) (SR * 1.9)) / rms(x, (int) (SR * 1.2), (int) (SR * 1.9)));
    double after = db(rms(y, (int) (SR * 2.5), len) / rms(x, (int) (SR * 2.5), len));
    System.out.printf("Kapı: kapalı %.1f dB, açık %.2f dB, ton bittikten sonra %.1f dB%n", closed, open, after);
    near("kapı kapalıyken aralık kadar zayıflatır", closed, -40, 1.0);
    near("kapı açıkken şeffaf", open, 0, 0.1);
    near("kapı yeniden kapanır", after, -40, 1.5);
  }

  static void crusherAndWidth() {
    BitCrusher b = new BitCrusher(1, SR);
    b.set(4f, 8000f, 1f);
    float[] x = sine(220, 0.9, SR, SR);
    b.process(x, x.length);
    boolean grid = true;
    for (float v : x) {
      double k = v / (1.0 / 8);
      if (Math.abs(k - Math.round(k)) > 1e-4) grid = false;
    }
    check("bit ezici 4 bit: değerler 1/8 ızgarasında", grid, "");
    int changes = 0;
    for (int i = 1; i < x.length; i++) if (x[i] != x[i - 1]) changes++;
    check("bit ezici 8 kHz: saniyede ≤ 8000 değişim", changes <= 8000, "" + changes);

    StereoWidener w = new StereoWidener(2);
    w.set(0f);
    float[] s = new float[2 * 1000];
    Random rnd = new Random(8);
    for (int i = 0; i < s.length; i++) s[i] = (float) rnd.nextGaussian() * 0.1f;
    float[] m = s.clone();
    w.process(m, 1000);
    boolean mono = true;
    for (int i = 0; i < 1000; i++) if (Math.abs(m[2 * i] - m[2 * i + 1]) > 1e-7) mono = false;
    check("genişlik 0 → mono", mono, "");
    w.set(2f);
    float[] wide = s.clone();
    w.process(wide, 1000);
    double sIn = 0, sOut = 0;
    for (int i = 0; i < 1000; i++) {
      sIn += Math.pow(s[2 * i] - s[2 * i + 1], 2);
      sOut += Math.pow(wide[2 * i] - wide[2 * i + 1], 2);
    }
    near("genişlik 2 → yan sinyal +6 dB", 10 * Math.log10(sOut / sIn), 6.02, 0.01);
  }

  // ---------- zincir hizalama ----------

  static void chainAlignment() {
    for (int ch : new int[] {1, 2}) {
      AudioFxChain chain = new AudioFxChain(ch, SR, params("limOn", 1, "limCeiling", 0));
      float[] x = hotMusic(SR * 2, ch, 11, 0.3);
      float[] y = runChain(chain, x, ch);
      double err = 0;
      for (int i = 0; i < x.length; i++) err = Math.max(err, Math.abs(x[i] - y[i]));
      check("zincir " + ch + "ch: etkisiz ayarda çıktı = girdi (örnek düzeyinde hizalı)", err < 1e-7, "" + err);
      // girdi gecikmeden kısa olsa da uzunluk korunur
      AudioFxChain c2 = new AudioFxChain(ch, SR, params("gainDb", 3));
      runChain(c2, new float[10 * ch], ch);
    }
    check("tümü kapalı → zincir gereksiz", AudioFxChain.isNoOp(AudioFxChain.defaults()), "");
    check("kazanç ≠ 0 → zincir gerekli", !AudioFxChain.isNoOp(params("gainDb", 2)), "");
    // NaN / sınır dışı parametreler kırpılır
    float[] bad = AudioFxChain.defaults();
    java.util.Arrays.fill(bad, Float.NaN);
    bad[AudioFxChain.index("revOn")] = 1;
    bad[AudioFxChain.index("revSize")] = 99;
    AudioFxChain c3 = new AudioFxChain(2, SR, bad);
    float[] y3 = runChain(c3, hotMusic(SR, 2, 1, 0.5), 2);
    check("bozuk parametrelerle sonlu çıktı", finite(y3), "");
  }

  // ---------- ön ayarlar ----------

  static void presets(String file) throws Exception {
    List<String> lines = Files.readAllLines(Paths.get(file), StandardCharsets.UTF_8);
    int count = 0;
    int len = SR * 10;
    float[] src = new float[len * 2];
    // 10 sn: gürültü + tonlar + konuşma benzeri patlamalar + 2 sn sıcak bölüm (0 dBFS tepe)
    Random rnd = new Random(12);
    for (int i = 0; i < len; i++) {
      double t = (double) i / SR;
      double env = (t % 0.4) < 0.25 ? Math.sin(Math.PI * (t % 0.4) / 0.25) : 0;
      double v = 0.05 * rnd.nextGaussian() + 0.25 * env * (Math.sin(2 * Math.PI * 150 * t) + 0.5 * Math.sin(2 * Math.PI * 450 * t) + 0.3 * Math.sin(2 * Math.PI * 2500 * t))
          + 0.1 * Math.sin(2 * Math.PI * 60 * t) + 0.05 * Math.sin(2 * Math.PI * 9000 * t);
      if (t >= 6 && t < 8) v *= 2.2;
      v = Math.max(-1, Math.min(1, v));
      src[2 * i] = (float) v;
      src[2 * i + 1] = (float) (v * 0.8 + 0.02 * rnd.nextGaussian());
    }
    float[] mono = new float[len];
    for (int i = 0; i < len; i++) mono[i] = src[2 * i];
    double worstRt = 0;
    String worstId = "";
    for (String line : lines) {
      line = line.trim();
      if (line.isEmpty() || line.startsWith("#")) continue;
      String[] parts = line.split("\\|");
      String id = parts[0].trim();
      float[] p = AudioFxChain.defaults();
      for (String kv : parts[1].trim().split("\\s+")) {
        if (kv.isEmpty()) continue;
        String[] a = kv.split("=");
        if (a[0].equals("pitch")) continue;   // perde Sonic ile (Kotlin), burada yok
        int idx = AudioFxChain.index(a[0]);
        check(id + ": bilinen anahtar " + a[0], idx >= 0, kv);
        if (idx < 0) continue;
        float val = Float.parseFloat(a[1]);
        check(id + ": " + a[0] + " sınırlar içinde", val >= AudioFxChain.MIN[idx] && val <= AudioFxChain.MAX[idx], kv);
        p[idx] = val;
      }
      boolean limOn = p[AudioFxChain.index("limOn")] >= 0.5f;
      double ceil = limOn ? Math.pow(10, p[AudioFxChain.index("limCeiling")] / 20) : 1.0;
      for (int ch : new int[] {2, 1}) {
        float[] in = ch == 2 ? src : mono;
        AudioFxChain chain = new AudioFxChain(ch, SR, p);
        long t0 = System.nanoTime();
        float[] y = runChain(chain, in, ch);
        double rt = (System.nanoTime() - t0) / 1e9 / 10.0;
        if (ch == 2 && rt > worstRt) { worstRt = rt; worstId = id; }
        double pk = peak(y, 0, y.length);
        check(id + " " + ch + "ch: sonlu", finite(y), "");
        check(id + " " + ch + "ch: tavanı aşmaz", pk <= ceil + 1e-6, String.format("%.6f > %.6f", pk, ceil));
        check(id + " " + ch + "ch: güvenlik kırpması yok", chain.limiter().safetyHits() == 0, "" + chain.limiter().safetyHits());
        check(id + " " + ch + "ch: sessiz değil", rms(y, 0, y.length) > 1e-3, String.format("%.5f", rms(y, 0, y.length)));
      }
      count++;
    }
    System.out.printf("Ön ayarlar: %d ön ayar × (stereo + mono) 10 sn işlendi; en yavaşı %s, gerçek zamanın %.1f%%'i (bu makinede)%n", count, worstId, worstRt * 100);
    check("ön ayar dosyasında ≥ 40 ön ayar", count >= 40, "" + count);
  }
}
