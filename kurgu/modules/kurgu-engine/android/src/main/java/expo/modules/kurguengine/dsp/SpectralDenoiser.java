package expo.modules.kurguengine.dsp;

/**
 * Konuşma için spektral gürültü azaltma (özgün uygulama, Android bağımlılığı yok).
 *
 * Yöntem: 1024 örneklik pencere, %75 örtüşme, kök-Hann analiz/sentez penceresi.
 * Her frekans kutusunda güç zaman içinde yumuşatılır; gürültü düzeyi "en küçük
 * istatistik" ile izlenir (yavaş yükselen yürüyen minimum), böylece önceden
 * gürültü örneği gerekmez ve değişen ortama uyum sağlanır. Kazanç, gürültü/sinyal
 * oranından hesaplanan Wiener benzeri bir eğridir; müzikal gürültüyü önlemek için
 * frekans ve zaman ekseninde yumuşatılır ve bir taban değerin altına inmez.
 *
 * Gecikme telafisi: çıktı, girdiye göre örnek düzeyinde hizalıdır (ilk N-hop
 * örnek atılır, akış sonunda kuyruk sıfırlarla boşaltılır); ses-görüntü eşzamanı
 * bozulmaz.
 */
public final class SpectralDenoiser {
  public static final int N = 1024;
  public static final int HOP = N / 4;
  private static final int BINS = N / 2 + 1;
  // tools/dsp-test/DenoiseTest.java ölçümleriyle seçildi (BUG_FIXES/PROGRESS'te sonuçlar)
  private static final float BIAS = 4f;     // yürüyen minimumun ortalamaya göre yanlılık düzeltmesi
  private static final float SMOOTH = 0.7f; // güç yumuşatma (pencere başına)
  private static final float REL = 0.7f;    // kazanç kapanma yumuşatması

  private final int channels;
  private final float[] window = new float[N];
  private final float[][] fifo;        // her kanal için son N girdi örneği
  private final float[][] ola;         // örtüşme-toplama birikimi
  private final float[][] smooth;      // yumuşatılmış güç
  private final float[][] noise;       // gürültü tahmini
  private final float[][] gainPrev;    // önceki kazanç (zaman yumuşatma)
  private final float[] re = new float[N];
  private final float[] im = new float[N];
  private final float[] gain = new float[BINS];
  private final float riseFactor;
  private final float fastRise;
  private final int startupFrames;
  private int filled;                  // fifo'daki yeni örnek sayısı (hop'a kadar)
  private int toDiscard;               // gecikme telafisi için atılacak çıktı örneği
  private int frames;                  // işlenen pencere sayısı
  private float strength = 0.7f;

  public SpectralDenoiser(int channels, int sampleRate) {
    this.channels = channels;
    fifo = new float[channels][N];
    ola = new float[channels][N];
    smooth = new float[channels][BINS];
    noise = new float[channels][BINS];
    gainPrev = new float[channels][BINS];
    for (int i = 0; i < N; i++) window[i] = (float) Math.sqrt(0.5 - 0.5 * Math.cos(2 * Math.PI * i / N));
    // Gürültü tahmini saniyede yaklaşık 6 dB yükselebilir (sessizlikte hızlı uyum, konuşmada yavaş).
    float framesPerSecond = (float) sampleRate / HOP;
    riseFactor = (float) Math.pow(10, 0.6 / framesPerSecond);
    fastRise = (float) Math.pow(10, 2.0 / framesPerSecond);
    startupFrames = Math.round(framesPerSecond);
    reset();
  }

  /** 0 = kapalı, 1 = en güçlü. */
  public void setStrength(float s) {
    strength = Math.max(0f, Math.min(1f, s));
  }

  public void reset() {
    for (int c = 0; c < channels; c++) {
      java.util.Arrays.fill(fifo[c], 0f);
      java.util.Arrays.fill(ola[c], 0f);
      java.util.Arrays.fill(smooth[c], 0f);
      java.util.Arrays.fill(noise[c], -1f);
      java.util.Arrays.fill(gainPrev[c], 1f);
    }
    filled = 0;
    frames = 0;
    pending = 0;
    toDiscard = N - HOP;
  }

  private long pending;                // girdi - çıktı (kare); akış sonunda boşaltılacak

  /**
   * Akış sonu: içeride bekleyen örnekleri sessizlikle iterek çıkarır. Toplam çıktı
   * uzunluğu toplam girdiye tam olarak eşit olur.
   * @param out en az (N + HOP) * channels uzunlukta
   */
  public int flush(float[] out) {
    int written = 0;
    float[] zeros = new float[HOP * channels];
    float[] tmp = new float[(HOP + N) * channels];
    while (pending > 0) {
      long before = pending;
      int got = process(zeros, HOP, tmp);
      pending += HOP;  // sessizlik girdisi sayılmaz
      int take = (int) Math.min(got, before);
      System.arraycopy(tmp, 0, out, written * channels, take * channels);
      written += take;
      pending = before - take;
    }
    return written;
  }

  /**
   * Araya serpiştirilmiş (interleaved) float örnekleri işler.
   * @param out en az (frameCount + N) * channels uzunlukta
   * @return out'a yazılan kare (çok kanallı örnek) sayısı
   */
  public int process(float[] in, int frameCount, float[] out) {
    int written = 0;
    pending += frameCount;
    for (int f = 0; f < frameCount; f++) {
      for (int c = 0; c < channels; c++) fifo[c][N - HOP + filled] = in[f * channels + c];
      if (++filled == HOP) {
        filled = 0;
        for (int c = 0; c < channels; c++) processFrame(c);
        frames++;
        for (int i = 0; i < HOP; i++) {
          if (toDiscard > 0) {
            toDiscard--;
          } else {
            for (int c = 0; c < channels; c++) out[written * channels + c] = ola[c][i];
            written++;
          }
        }
        for (int c = 0; c < channels; c++) {
          System.arraycopy(ola[c], HOP, ola[c], 0, N - HOP);
          java.util.Arrays.fill(ola[c], N - HOP, N, 0f);
          System.arraycopy(fifo[c], HOP, fifo[c], 0, N - HOP);
        }
      }
    }
    pending -= written;
    return written;
  }

  private void processFrame(int c) {
    float[] x = fifo[c];
    for (int i = 0; i < N; i++) {
      re[i] = x[i] * window[i];
      im[i] = 0f;
    }
    fft(re, im, false);

    float[] s = smooth[c];
    float[] nz = noise[c];
    float[] gp = gainPrev[c];
    float alpha = 1.0f + 2.0f * strength;                    // aşırı çıkarma katsayısı
    float floor = (float) Math.pow(10, -(6 + 18 * strength) / 20.0); // -6 dB .. -24 dB taban
    for (int k = 0; k < BINS; k++) {
      float p = re[k] * re[k] + im[k] * im[k];
      s[k] = frames == 0 ? p : SMOOTH * s[k] + (1 - SMOOTH) * p;
      // Başlangıçta ilk pencerenin ~10 dB altı varsayılır; ilk saniyede tahmin hızlı yükselir.
      if (nz[k] < 0f) nz[k] = 0.1f * s[k] + 1e-12f;
      else nz[k] = s[k] < nz[k] ? s[k] : nz[k] * (frames < startupFrames ? fastRise : riseFactor);
      float snr = s[k] / (nz[k] * BIAS + 1e-12f);              // en küçük değer ortalamanın altında kalır: yanlılık düzeltmesi
      float g = 1f - alpha / Math.max(snr, 1e-6f);
      gain[k] = Math.max(floor, Math.min(1f, g));
    }
    // Frekans yumuşatma (3 kutu) ve zaman yumuşatma: hızlı açılma, yavaş kapanma
    float prev = gain[0];
    for (int k = 0; k < BINS; k++) {
      float cur = gain[k];
      float next = k + 1 < BINS ? gain[k + 1] : cur;
      float g = 0.25f * prev + 0.5f * cur + 0.25f * next;
      prev = cur;
      g = g > gp[k] ? g : REL * gp[k] + (1 - REL) * g;
      gp[k] = g;
    }
    for (int k = 0; k < BINS; k++) {
      re[k] *= gp[k];
      im[k] *= gp[k];
      if (k > 0 && k < N / 2) {
        re[N - k] = re[k];
        im[N - k] = -im[k];
      }
    }
    fft(re, im, true);
    float[] o = ola[c];
    // kök-Hann² toplamı %75 örtüşmede 2'dir
    for (int i = 0; i < N; i++) o[i] += re[i] * window[i] * 0.5f;
  }

  /** Yerinde, yinelemeli radix-2 karmaşık FFT. inverse=true ise 1/N ölçekli ters dönüşüm. */
  static void fft(float[] re, float[] im, boolean inverse) {
    int n = re.length;
    for (int i = 1, j = 0; i < n; i++) {
      int bit = n >> 1;
      for (; (j & bit) != 0; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        float t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    for (int len = 2; len <= n; len <<= 1) {
      double ang = 2 * Math.PI / len * (inverse ? 1 : -1);
      float wr = (float) Math.cos(ang);
      float wi = (float) Math.sin(ang);
      for (int i = 0; i < n; i += len) {
        float cr = 1f, ci = 0f;
        for (int k = 0; k < len / 2; k++) {
          int a = i + k, b = a + len / 2;
          float xr = re[b] * cr - im[b] * ci;
          float xi = re[b] * ci + im[b] * cr;
          re[b] = re[a] - xr; im[b] = im[a] - xi;
          re[a] += xr; im[a] += xi;
          float nr = cr * wr - ci * wi;
          ci = cr * wi + ci * wr;
          cr = nr;
        }
      }
    }
    if (inverse) for (int i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
  }
}
