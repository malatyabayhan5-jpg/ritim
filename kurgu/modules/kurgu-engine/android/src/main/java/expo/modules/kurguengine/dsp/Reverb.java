package expo.modules.kurguengine.dsp;

/**
 * Yankılanım (reverb), Schroeder/Moorer yapısı, Freeverb düzeni: kanal başına
 * 8 paralel "alçak geçiren geri beslemeli tarak" (LBCF) + 4 seri Schroeder
 * tüm geçiren (allpass). Topoloji ve 44.1 kHz gecikme uzunlukları Jezar'ın
 * kamuya açık (public domain) Freeverb tanımından alınmıştır; kod özgündür.
 *
 *  - Oda boyutu: tarak geri beslemesi g = 0.55 + 0.43·size (≤ 0.98) ve gecikme
 *    uzunlukları ·(0.55 + 0.45·size) (küçük odada daha sık, kısa yansımalar).
 *  - Sönümleme: tarak döngüsündeki tek kutuplu alçak geçiren (0 … 0.45).
 *  - Ön gecikme: yankılanım girişinde 0–250 ms.
 *  - Stereo: sağ kanal uzunlukları +23 örnek (dekorelasyon). Giriş kanal ortalamasıdır.
 * Kararlılık: her tarak döngüsünün kazancı g·(1-d)/(1-d·z⁻¹) ≤ g < 1.
 * Karışım yasası Delay ile aynı: kuru = min(1, 2(1-mix)), ıslak = min(1, 2·mix).
 * Gecikme (latency): 0 örnek; akış sonunda kuyruk kesilir (klip uzunluğu korunur).
 */
public final class Reverb {
  private static final int[] COMB = {1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617};
  private static final int[] ALLPASS = {556, 441, 341, 225};
  private static final int SPREAD = 23;
  private static final float IN_GAIN = 0.015f;
  /** Islak yol ölçeği: beyaz gürültüde size=0.5 iken ıslak RMS ≈ kuru RMS (AudioFxTest ile ölçüldü). */
  private static final float WET_SCALE = 3.4f;
  public static final float MAX_PREDELAY_MS = 250f;

  private final int channels;   // çıkış kanalları
  private final int sr;
  private final int lines;      // 1 (mono) veya 2
  private final float[][][] comb;     // [hat][tarak][örnek]
  private final int[][] combLen;
  private final int[][] combPos;
  private final float[][] combStore;
  private final float[][][] ap;
  private final int[][] apLen;
  private final int[][] apPos;
  private final float[] pre;
  private int preLen, prePos;
  private float g = 0.77f, damp = 0.2f, dryG = 1f, wetG = 0.5f;

  public Reverb(int channels, int sampleRate) {
    this.channels = channels;
    this.sr = sampleRate;
    lines = channels >= 2 ? 2 : 1;
    double k = sampleRate / 44100.0;
    comb = new float[lines][COMB.length][];
    combLen = new int[lines][COMB.length];
    combPos = new int[lines][COMB.length];
    combStore = new float[lines][COMB.length];
    ap = new float[lines][ALLPASS.length][];
    apLen = new int[lines][ALLPASS.length];
    apPos = new int[lines][ALLPASS.length];
    for (int l = 0; l < lines; l++) {
      for (int i = 0; i < COMB.length; i++) comb[l][i] = new float[(int) Math.ceil((COMB[i] + SPREAD * l) * k) + 1];
      for (int i = 0; i < ALLPASS.length; i++) {
        apLen[l][i] = Math.max(1, (int) Math.round((ALLPASS[i] + SPREAD * l) * k));
        ap[l][i] = new float[apLen[l][i]];
      }
    }
    pre = new float[(int) Math.ceil(MAX_PREDELAY_MS * 0.001 * sr) + 1];
    set(0.5f, 0.5f, 20f, 0.25f);
  }

  public void set(float size, float damping, float preDelayMs, float mix) {
    float s = Math.max(0f, Math.min(1f, size));
    g = 0.55f + 0.43f * s;
    damp = 0.45f * Math.max(0f, Math.min(1f, damping));
    double k = sr / 44100.0 * (0.55 + 0.45 * s);
    for (int l = 0; l < lines; l++) {
      for (int i = 0; i < COMB.length; i++) {
        combLen[l][i] = Math.max(1, Math.min(comb[l][i].length, (int) Math.round((COMB[i] + SPREAD * l) * k)));
        if (combPos[l][i] >= combLen[l][i]) combPos[l][i] = 0;
      }
    }
    preLen = Math.max(0, Math.min(pre.length - 1, Math.round(Math.max(0f, preDelayMs) * 0.001f * sr)));
    float m = Math.max(0f, Math.min(1f, mix));
    dryG = Math.min(1f, 2 * (1 - m));
    wetG = Math.min(1f, 2 * m) * WET_SCALE;
  }

  public void reset() {
    for (int l = 0; l < lines; l++) {
      for (float[] b : comb[l]) java.util.Arrays.fill(b, 0f);
      for (float[] b : ap[l]) java.util.Arrays.fill(b, 0f);
      java.util.Arrays.fill(combStore[l], 0f);
      java.util.Arrays.fill(combPos[l], 0);
      java.util.Arrays.fill(apPos[l], 0);
    }
    java.util.Arrays.fill(pre, 0f);
    prePos = 0;
  }

  private float line(int l, float in) {
    float acc = 0f;
    float[] store = combStore[l];
    for (int i = 0; i < COMB.length; i++) {
      float[] b = comb[l][i];
      int p = combPos[l][i];
      float out = b[p];
      float s = out * (1 - damp) + store[i] * damp;
      if (Math.abs(s) < 1e-20f) s = 0f;
      store[i] = s;
      b[p] = in + s * g;
      if (++p >= combLen[l][i]) p = 0;
      combPos[l][i] = p;
      acc += out;
    }
    for (int i = 0; i < ALLPASS.length; i++) {
      float[] b = ap[l][i];
      int p = apPos[l][i];
      float bo = b[p];
      float v = acc + bo * 0.5f;
      b[p] = Math.abs(v) < 1e-20f ? 0f : v;
      acc = bo - acc;
      if (++p >= apLen[l][i]) p = 0;
      apPos[l][i] = p;
    }
    return acc;
  }

  public void process(float[] buf, int frames) {
    for (int f = 0; f < frames; f++) {
      int base = f * channels;
      float sum = 0f;
      for (int c = 0; c < channels; c++) sum += buf[base + c];
      float in = sum / channels * IN_GAIN;
      float x;
      if (preLen > 0) {
        int rp = prePos - preLen;
        if (rp < 0) rp += pre.length;
        x = pre[rp];
        pre[prePos] = in;
        if (++prePos == pre.length) prePos = 0;
      } else {
        x = in;
      }
      float wl = line(0, x);
      float wr = lines == 2 ? line(1, x) : wl;
      buf[base] = buf[base] * dryG + wl * wetG;
      if (channels >= 2) {
        buf[base + 1] = buf[base + 1] * dryG + wr * wetG;
        for (int c = 2; c < channels; c++) buf[base + c] = buf[base + c] * dryG + 0.5f * (wl + wr) * wetG;
      }
    }
  }
}
