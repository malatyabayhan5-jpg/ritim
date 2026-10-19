package expo.modules.kurguengine.dsp;

/**
 * Gürültü kapısı (kanallar bağlı). Tepe zarfı (anlık yükselen, 30 ms'de inen)
 * eşiği aşınca kapı açılır; eşiğin 4 dB altına inip tutma süresi (40 ms) dolunca
 * kapanır (histerezis: eşik çevresinde titreşmez). Kazanç açılırken atak,
 * kapanırken bırakma zaman sabitiyle tek kutuplu yumuşatılır; kapalıyken kazanç
 * "aralık" (range) kadar düşer (ör. -40 dB), tam sessizlik zorunlu değildir.
 * Gecikme: 0 örnek.
 */
public final class NoiseGate {
  private static final double HYSTERESIS_DB = 4;
  private static final double HOLD_MS = 40;
  private static final double ENV_RELEASE_MS = 30;

  private final int channels;
  private final int sr;
  private double openLin, closeLin, floorLin;
  private double aAtt, aRel, aEnv;
  private int holdFrames;
  private double env, gain;
  private int holdLeft;
  private boolean open;

  public NoiseGate(int channels, int sampleRate) {
    this.channels = channels;
    this.sr = sampleRate;
    aEnv = Math.exp(-1.0 / (ENV_RELEASE_MS * 0.001 * sr));
    holdFrames = (int) Math.round(HOLD_MS * 0.001 * sr);
    set(-50f, -40f, 1f, 120f);
    reset();
  }

  /**
   * @param thresholdDb açılma eşiği (dBFS)
   * @param rangeDb kapalıyken uygulanan kazanç (negatif dB)
   */
  public void set(float thresholdDb, float rangeDb, float attackMs, float releaseMs) {
    openLin = Math.pow(10, thresholdDb / 20.0);
    closeLin = Math.pow(10, (thresholdDb - HYSTERESIS_DB) / 20.0);
    floorLin = Math.pow(10, Math.min(0f, rangeDb) / 20.0);
    aAtt = Math.exp(-1.0 / (Math.max(0.05, attackMs) * 0.001 * sr));
    aRel = Math.exp(-1.0 / (Math.max(1, releaseMs) * 0.001 * sr));
  }

  public void reset() {
    env = 0;
    gain = floorLin;
    open = false;
    holdLeft = 0;
  }

  public double currentGain() {
    return gain;
  }

  public void process(float[] buf, int frames) {
    for (int f = 0; f < frames; f++) {
      int base = f * channels;
      double peak = 0;
      for (int c = 0; c < channels; c++) peak = Math.max(peak, Math.abs(buf[base + c]));
      env = peak > env ? peak : aEnv * env + (1 - aEnv) * peak;
      if (env >= openLin) {
        open = true;
        holdLeft = holdFrames;
      } else if (open && env < closeLin) {
        if (holdLeft > 0) holdLeft--; else open = false;
      }
      double target = open ? 1.0 : floorLin;
      double a = target > gain ? aAtt : aRel;
      gain = a * gain + (1 - a) * target;
      for (int c = 0; c < channels; c++) buf[base + c] = (float) (buf[base + c] * gain);
    }
  }
}
