package expo.modules.kurguengine.dsp;

/**
 * İleriye bakan (lookahead) tepe sınırlayıcı; örnek tepeleri tavanı aşmaz.
 *
 * Yöntem (bilinen "kayan minimum + kutu ortalaması" tekniği; kod özgündür):
 *  1) Her karede gereken kazanç g[n] = min(1, tavan / max_c |x_c[n]|).
 *  2) m[n] = son L değerin minimumu (monoton deque ile O(1)).
 *  3) s[n] = son L m değerinin ortalaması (kayan toplam) → L örnekte yumuşak iniş.
 *  4) Bırakma: kazanç düşerken hemen izlenir, yükselirken tek kutuplu yumuşatılır.
 *  5) Çıkış y[n] = x[n - (L-1)] · r[n].
 * s[n] içindeki her m terimi g[n-(L-1)]'i kapsadığından s[n] ≤ g[n-(L-1)];
 * böylece |y| ≤ tavan matematiksel olarak garanti edilir (yuvarlama payı için
 * son bir güvenlik kırpması vardır ve devreye girme sayısı testte 0 olmalıdır).
 * Gecikme (latency): L-1 örnek = round(1.5 ms · fs) (48 kHz'te 72 örnek);
 * AudioFxChain bunu telafi eder (çıkış girdiyle örnek düzeyinde hizalı).
 */
public final class Limiter {
  public static final double LOOKAHEAD_MS = 1.5;

  private final int channels;
  private final int sr;
  private final int L;
  private final float[] dly;        // (L) kare gecikme hattı
  private int dPos;
  // monoton artan deque (kayan minimum): değer + kare indeksi
  private final double[] qVal;
  private final long[] qIdx;
  private int qHead, qSize;
  private final double[] mRing;     // kutu ortalaması için son L m değeri
  private int mPos;
  private double mSum;
  private long n;
  private double ceiling = 0.89, aRel, r = 1;
  private int safetyHits;

  public Limiter(int channels, int sampleRate) {
    this.channels = channels;
    this.sr = sampleRate;
    L = (int) Math.round(LOOKAHEAD_MS * 0.001 * sampleRate) + 1;
    dly = new float[L * channels];
    qVal = new double[L + 1];
    qIdx = new long[L + 1];
    mRing = new double[L];
    set(-1f, 80f);
    reset();
  }

  public int latencyFrames() {
    return L - 1;
  }

  public void set(float ceilingDb, float releaseMs) {
    ceiling = Math.pow(10, Math.min(0f, ceilingDb) / 20.0);
    aRel = Math.exp(-1.0 / (Math.max(1f, releaseMs) * 0.001 * sr));
  }

  public double ceilingLin() {
    return ceiling;
  }

  /** Güvenlik kırpmasının devreye girdiği örnek sayısı (tasarım gereği 0 olmalı). */
  public int safetyHits() {
    return safetyHits;
  }

  public void reset() {
    java.util.Arrays.fill(dly, 0f);
    dPos = 0;
    qHead = 0;
    qSize = 0;
    java.util.Arrays.fill(mRing, 1.0);
    mPos = 0;
    mSum = L;
    n = 0;
    r = 1;
    safetyHits = 0;
  }

  public void process(float[] buf, int frames) {
    int cap = qVal.length;
    for (int f = 0; f < frames; f++, n++) {
      int base = f * channels;
      float peak = 0;
      for (int c = 0; c < channels; c++) peak = Math.max(peak, Math.abs(buf[base + c]));
      double g = peak > ceiling ? ceiling / peak : 1.0;
      // kayan minimum: arkadan büyük/eşitleri at, ekle; önden pencere dışını at
      while (qSize > 0 && qVal[(qHead + qSize - 1) % cap] >= g) qSize--;
      int t = (qHead + qSize) % cap;
      qVal[t] = g;
      qIdx[t] = n;
      qSize++;
      while (qIdx[qHead] <= n - L) { qHead = (qHead + 1) % cap; qSize--; }
      double m = qVal[qHead];
      mSum += m - mRing[mPos];
      mRing[mPos] = m;
      if (++mPos == L) {
        mPos = 0;
        // kayan toplamın birikmiş yuvarlama hatasını sıfırla
        double s = 0;
        for (double v : mRing) s += v;
        mSum = s;
      }
      double s = Math.min(1.0, mSum / L);
      r = s < r ? s : s - (s - r) * aRel;
      // gecikme hattı: L-1 kare önceki örnek çıkar
      int dp = dPos * channels;
      for (int c = 0; c < channels; c++) {
        float x = buf[base + c];
        float y = (float) (dly[dp + c] * r);
        if (y > ceiling || y < -ceiling) {
          if (Math.abs(y) > ceiling * 1.00001) safetyHits++;
          y = (float) (y > 0 ? ceiling : -ceiling);
        }
        dly[dp + c] = x;
        buf[base + c] = y;
      }
      // dly L-1 kare tutar: okunan yer bir sonraki yazılacak yer
      if (++dPos == L - 1 || L == 1) dPos = 0;
    }
  }
}
