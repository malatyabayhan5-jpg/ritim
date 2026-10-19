package expo.modules.kurguengine.dsp;

/**
 * Ses efekt zinciri (Android bağımlılığı yok). Sabit sıra:
 *   kapı → EQ → sıkıştırıcı → bozulma → bit ezici → halka mod. → bant geçiren
 *   (telefon/radyo) → koro → yankı → yankılanım → stereo genişlik → kazanç → sınırlayıcı
 *
 * Parametreler düz bir float dizisidir; dizin sırası {@link #KEYS} ile tanımlıdır
 * ve JS tarafındaki src/model/audio-fx.js ile aynıdır (tests/audio-fx.test.mjs
 * bu dosyayı okuyup anahtarları, sınırları ve varsayılanları karşılaştırır).
 * "...On" anahtarları 0/1 bayraktır. Perde (pitch) bu zincirde değil, Media3
 * SonicAudioProcessor ile uygulanır (AudioFxProcessor.kt).
 *
 * Sınırlayıcı her zaman çalışır: kapalıyken (limOn = 0) tavan 0 dBFS'tir ve
 * yalnızca dijital kırpmayı önler (ör. +12 dB kazanç). Toplam gecikme =
 * sınırlayıcının ileriye bakışı (1.5 ms); zincir ilk {@link #latencyFrames()}
 * kareyi atar ve flush() ile kuyruğu boşaltır: çıkış girdiyle örnek düzeyinde
 * hizalı ve tam aynı uzunluktadır. Yankı/yankılanım kuyrukları akış sonunda kesilir.
 *
 * Sıcak yolda bellek ayırma yoktur: işlem sabit boyutlu ({@link #BLOCK}) alt
 * bloklarla, kurucuda ayrılan tamponlarda yapılır.
 */
public final class AudioFxChain {
  public static final String[] KEYS = {
    "gateOn", "gateThreshold", "gateRange", "gateAttack", "gateRelease",
    "eqOn", "eqHpFreq", "eqLpFreq", "eqLowFreq", "eqLowGain",
    "eqB1Freq", "eqB1Gain", "eqB1Q", "eqB2Freq", "eqB2Gain", "eqB2Q", "eqB3Freq", "eqB3Gain", "eqB3Q",
    "eqHighFreq", "eqHighGain",
    "compOn", "compThreshold", "compRatio", "compAttack", "compRelease", "compKnee", "compMakeup",
    "distOn", "distDrive", "distTone", "distMix",
    "crushOn", "crushBits", "crushRate", "crushMix",
    "ringOn", "ringFreq", "ringMix",
    "bandOn", "bandLow", "bandHigh",
    "choOn", "choRate", "choDepth", "choFeedback", "choMix",
    "dlyOn", "dlyTime", "dlyFeedback", "dlyDamp", "dlyMix", "dlyPingPong",
    "revOn", "revSize", "revDamping", "revPreDelay", "revMix",
    "widOn", "widWidth",
    "gainDb",
    "limOn", "limCeiling", "limRelease",
  };
  // KEYS ile aynı sırada: en küçük, en büyük, varsayılan
  public static final float[] MIN = {
    0, -80, -80, 0.1f, 10,
    0, 20, 1000, 30, -18,
    40, -18, 0.3f, 40, -18, 0.3f, 40, -18, 0.3f,
    1500, -18,
    0, -60, 1, 0.1f, 10, 0, 0,
    0, 0, 0, 0,
    0, 2, 1000, 0,
    0, 5, 0,
    0, 50, 1000,
    0, 0.05f, 0, 0, 0,
    0, 10, 0, 0, 0, 0,
    0, 0, 0, 0, 0,
    0, 0,
    -24,
    0, -12, 10,
  };
  public static final float[] MAX = {
    1, 0, 0, 50, 2000,
    1, 1000, 20000, 500, 18,
    16000, 18, 10, 16000, 18, 10, 16000, 18, 10,
    16000, 18,
    1, 0, 20, 200, 2000, 24, 24,
    1, 40, 1, 1,
    1, 16, 48000, 1,
    1, 2000, 1,
    1, 3000, 12000,
    1, 8, 1, 0.9f, 1,
    1, 2000, 0.95f, 1, 1, 1,
    1, 1, 1, 250, 1,
    1, 2,
    12,
    1, 0, 1000,
  };
  public static final float[] DEFAULTS = {
    0, -50, -40, 1, 150,
    0, 20, 20000, 120, 0,
    250, 0, 1, 1000, 0, 1, 4000, 0, 1,
    8000, 0,
    0, -18, 3, 10, 150, 6, 0,
    0, 12, 0.6f, 1,
    0, 8, 11025, 1,
    0, 40, 0.5f,
    0, 300, 3400,
    0, 0.8f, 0.5f, 0, 0.5f,
    0, 350, 0.35f, 0.3f, 0.3f, 0,
    0, 0.5f, 0.5f, 20, 0.25f,
    0, 1.4f,
    0,
    0, -1, 80,
  };

  public static final int COUNT = KEYS.length;
  public static final int BLOCK = 512;

  public static int index(String key) {
    for (int i = 0; i < KEYS.length; i++) if (KEYS[i].equals(key)) return i;
    return -1;
  }

  /** Varsayılan parametre dizisinin kopyası. */
  public static float[] defaults() {
    return DEFAULTS.clone();
  }

  /** Tüm efektler kapalı ve kazanç 0 dB ise zincir gereksizdir (işlemci eklenmez). */
  public static boolean isNoOp(float[] p) {
    for (int i = 0; i < COUNT; i++) if (KEYS[i].endsWith("On") && p[i] >= 0.5f) return false;
    return Math.abs(p[index("gainDb")]) < 0.01f;
  }

  private final int channels;
  private final int sampleRate;
  private final float[] p = new float[COUNT];
  private final NoiseGate gate;
  private final Equalizer eq;
  private final Compressor comp;
  private final Distortion dist;
  private final BitCrusher crush;
  private final RingMod ring;
  private final CutFilter bandHp;
  private final CutFilter bandLp;
  private final Chorus chorus;
  private final Delay delay;
  private final Reverb reverb;
  private final StereoWidener widener;
  private final Limiter limiter;
  private boolean gateOn, eqOn, compOn, distOn, crushOn, ringOn, bandOn, choOn, dlyOn, revOn, widOn;
  private float gain = 1f;
  private final float[] work;
  private final float[] scratch;
  private int toDiscard;
  private long pending;   // girdi - çıktı (kare)

  public AudioFxChain(int channels, int sampleRate, float[] params) {
    if (channels < 1) throw new IllegalArgumentException("channels");
    this.channels = channels;
    this.sampleRate = sampleRate;
    gate = new NoiseGate(channels, sampleRate);
    eq = new Equalizer(channels, sampleRate);
    comp = new Compressor(channels, sampleRate);
    dist = new Distortion(channels, sampleRate);
    crush = new BitCrusher(channels, sampleRate);
    ring = new RingMod(channels, sampleRate);
    bandHp = new CutFilter(channels);
    bandLp = new CutFilter(channels);
    chorus = new Chorus(channels, sampleRate);
    delay = new Delay(channels, sampleRate);
    reverb = new Reverb(channels, sampleRate);
    widener = new StereoWidener(channels);
    limiter = new Limiter(channels, sampleRate);
    work = new float[BLOCK * channels];
    scratch = new float[BLOCK * channels];
    setParams(params);
    reset();
  }

  public int channels() {
    return channels;
  }

  public int latencyFrames() {
    return limiter.latencyFrames();
  }

  public Limiter limiter() {
    return limiter;
  }

  private float v(String key) {
    return p[index(key)];
  }

  private boolean on(String key) {
    return v(key) >= 0.5f;
  }

  /** Parametreleri uygular (sınır dışı değerler kırpılır, NaN varsayılana döner). Durum korunur. */
  public void setParams(float[] params) {
    for (int i = 0; i < COUNT; i++) {
      float x = params != null && i < params.length ? params[i] : DEFAULTS[i];
      if (!Float.isFinite(x)) x = DEFAULTS[i];
      p[i] = Math.max(MIN[i], Math.min(MAX[i], x));
    }
    gateOn = on("gateOn");
    gate.set(v("gateThreshold"), v("gateRange"), v("gateAttack"), v("gateRelease"));
    eq.setHighPass(v("eqHpFreq"));
    eq.setLowPass(v("eqLpFreq"));
    eq.setLowShelf(v("eqLowFreq"), v("eqLowGain"));
    eq.setBand(0, v("eqB1Freq"), v("eqB1Gain"), v("eqB1Q"));
    eq.setBand(1, v("eqB2Freq"), v("eqB2Gain"), v("eqB2Q"));
    eq.setBand(2, v("eqB3Freq"), v("eqB3Gain"), v("eqB3Q"));
    eq.setHighShelf(v("eqHighFreq"), v("eqHighGain"));
    eqOn = on("eqOn") && !eq.isFlat();
    compOn = on("compOn");
    comp.set(v("compThreshold"), v("compRatio"), v("compAttack"), v("compRelease"), v("compKnee"), v("compMakeup"));
    distOn = on("distOn");
    dist.set(v("distDrive"), v("distTone"), v("distMix"));
    crushOn = on("crushOn");
    crush.set(v("crushBits"), v("crushRate"), v("crushMix"));
    ringOn = on("ringOn");
    ring.set(v("ringFreq"), v("ringMix"));
    bandOn = on("bandOn");
    float lo = v("bandLow"), hi = Math.max(lo * 1.25f, v("bandHigh"));
    bandHp.highPass(lo, sampleRate);
    if (hi >= sampleRate * 0.45f) bandLp.setBypass(); else bandLp.lowPass(hi, sampleRate);
    choOn = on("choOn");
    chorus.set(v("choRate"), v("choDepth"), v("choFeedback"), v("choMix"));
    dlyOn = on("dlyOn");
    delay.set(v("dlyTime"), v("dlyFeedback"), v("dlyDamp"), v("dlyMix"), on("dlyPingPong"));
    revOn = on("revOn");
    reverb.set(v("revSize"), v("revDamping"), v("revPreDelay"), v("revMix"));
    widOn = on("widOn") && channels >= 2;
    widener.set(v("widWidth"));
    gain = (float) Math.pow(10, v("gainDb") / 20.0);
    if (on("limOn")) limiter.set(v("limCeiling"), v("limRelease"));
    else limiter.set(0f, 50f);
  }

  public void reset() {
    gate.reset(); eq.reset(); comp.reset(); dist.reset(); crush.reset(); ring.reset();
    bandHp.reset(); bandLp.reset(); chorus.reset(); delay.reset(); reverb.reset(); limiter.reset();
    toDiscard = limiter.latencyFrames();
    pending = 0;
  }

  /** Gecikme telafisi olmadan bir alt bloğu yerinde işler. */
  private void processBlock(float[] b, int frames) {
    if (gateOn) gate.process(b, frames);
    if (eqOn) eq.process(b, frames);
    if (compOn) comp.process(b, frames);
    if (distOn) dist.process(b, frames, scratch);
    if (crushOn) crush.process(b, frames);
    if (ringOn) ring.process(b, frames);
    if (bandOn) { bandHp.process(b, frames); bandLp.process(b, frames); }
    if (choOn) chorus.process(b, frames);
    if (dlyOn) delay.process(b, frames);
    if (revOn) reverb.process(b, frames);
    if (widOn) widener.process(b, frames);
    if (gain != 1f) for (int i = 0, n = frames * channels; i < n; i++) b[i] *= gain;
    limiter.process(b, frames);
  }

  /**
   * Araya serpiştirilmiş örnekleri işler.
   * @param out en az frameCount * channels uzunlukta (in ile aynı dizi olabilir)
   * @return out'a yazılan kare sayısı (≤ frameCount; ilk gecikme kadar kare atılır)
   */
  public int process(float[] in, int frameCount, float[] out) {
    int written = 0;
    pending += frameCount;
    for (int pos = 0; pos < frameCount; ) {
      int n = Math.min(BLOCK, frameCount - pos);
      System.arraycopy(in, pos * channels, work, 0, n * channels);
      processBlock(work, n);
      int skip = Math.min(toDiscard, n);
      toDiscard -= skip;
      int keep = n - skip;
      if (keep > 0) {
        System.arraycopy(work, skip * channels, out, written * channels, keep * channels);
        written += keep;
      }
      pos += n;
    }
    pending -= written;
    return written;
  }

  /**
   * Akış sonu: içeride bekleyen kareleri sessizlik iterek çıkarır; toplam çıktı
   * toplam girdiye tam olarak eşit olur.
   * @param out en az latencyFrames() * channels uzunlukta
   */
  public int flush(float[] out) {
    int written = 0;
    while (pending > 0) {
      int n = (int) Math.min(BLOCK, pending + toDiscard);
      java.util.Arrays.fill(work, 0, n * channels, 0f);
      processBlock(work, n);
      int skip = Math.min(toDiscard, n);
      toDiscard -= skip;
      int keep = (int) Math.min(n - skip, pending);
      System.arraycopy(work, skip * channels, out, written * channels, keep * channels);
      written += keep;
      pending -= keep;
    }
    return written;
  }
}
