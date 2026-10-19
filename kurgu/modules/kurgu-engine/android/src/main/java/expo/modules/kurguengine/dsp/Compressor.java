package expo.modules.kurguengine.dsp;

/**
 * İleri beslemeli (feed-forward) dinamik aralık sıkıştırıcı, kanallar bağlı
 * (stereo görüntü kaymaz).
 *
 * Yöntem (ders kitabı tasarımı; kod özgündür): D. Giannoulis, M. Massberg,
 * J. D. Reiss, "Digital Dynamic Range Compressor Design — A Tutorial and
 * Analysis", JAES 2012:
 *  - Seviye: kanalların en büyük mutlak örneği, dB.
 *  - Kazanç hesaplayıcı: eşik T, oran R, yumuşak diz genişliği W (dB) ile ikinci
 *    dereceden geçişli statik eğri.
 *  - Kazanç azaltma sinyali "ayrık tepe dedektörü" (smooth decoupled peak
 *    detector) ile yumuşatılır: önce bırakma (release) ile tepe tutma, ardından
 *    atak (attack) ile tek kutuplu yumuşatma. Zaman sabiti τ için katsayı
 *    α = exp(-1 / (τ · fs)); adım yanıtı τ sürede son değerin %63'üne ulaşır.
 *  - Çıkış kazancı = 10^((-azaltma + makeup) / 20).
 * Gecikme: 0 örnek.
 */
public final class Compressor {
  private final int channels;
  private final int sr;
  private float threshold = -18f, ratio = 3f, knee = 6f, makeupDb = 0f;
  private double aAtt, aRel;
  private double y1, yL;        // dedektör durumları (dB cinsinden azaltma)
  private double quietLin;      // bu seviyenin altında azaltma kesin 0 (log hesabı atlanır)
  private double lastGr = 0;    // son örnekteki azaltma (dB) — test ve ölçüm için

  public Compressor(int channels, int sampleRate) {
    this.channels = channels;
    this.sr = sampleRate;
    set(-18f, 3f, 10f, 120f, 6f, 0f);
  }

  /**
   * @param thresholdDb eşik (dBFS)
   * @param ratio oran (1 = etkisiz, 20 ≈ sınırlayıcı)
   * @param attackMs atak süresi
   * @param releaseMs bırakma süresi
   * @param kneeDb yumuşak diz genişliği (0 = sert diz)
   * @param makeupDb telafi kazancı
   */
  public void set(float thresholdDb, float ratio, float attackMs, float releaseMs, float kneeDb, float makeupDb) {
    this.threshold = thresholdDb;
    this.ratio = Math.max(1f, ratio);
    this.knee = Math.max(0f, kneeDb);
    this.makeupDb = makeupDb;
    aAtt = coef(attackMs);
    aRel = coef(releaseMs);
    quietLin = Math.pow(10, (threshold - knee / 2 - 0.01) / 20);
  }

  private double coef(float ms) {
    return Math.exp(-1.0 / (Math.max(0.01, ms) * 0.001 * sr));
  }

  public void reset() {
    y1 = 0;
    yL = 0;
    lastGr = 0;
  }

  /** Statik eğri: girdi seviyesi (dB) → çıkış seviyesi (dB), makeup hariç. */
  public double staticCurve(double xDb) {
    double over = xDb - threshold;
    if (2 * over < -knee) return xDb;
    if (knee > 0 && 2 * Math.abs(over) <= knee) {
      double t = over + knee / 2;
      return xDb + (1 / ratio - 1) * t * t / (2 * knee);
    }
    return threshold + over / ratio;
  }

  public double lastGainReductionDb() {
    return lastGr;
  }

  public void process(float[] buf, int frames) {
    double makeup = Math.pow(10, makeupDb / 20);
    double prevGr = Double.NaN, gain = makeup;
    for (int f = 0; f < frames; f++) {
      int base = f * channels;
      float peak = 0;
      for (int c = 0; c < channels; c++) peak = Math.max(peak, Math.abs(buf[base + c]));
      double c;
      if (peak <= quietLin) {
        c = 0;
      } else {
        double xDb = 20 * Math.log10(peak);
        c = xDb - staticCurve(xDb);
      }
      y1 = Math.max(c, aRel * y1 + (1 - aRel) * c);
      yL = aAtt * yL + (1 - aAtt) * y1;
      if (yL < 1e-9) yL = 0;
      if (yL != prevGr) {        // pow yalnızca azaltma değiştiğinde
        prevGr = yL;
        gain = Math.pow(10, (makeupDb - yL) / 20);
      }
      for (int ch = 0; ch < channels; ch++) buf[base + ch] = (float) (buf[base + ch] * gain);
    }
    lastGr = yL;
  }
}
