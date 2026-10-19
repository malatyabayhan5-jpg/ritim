package expo.modules.kurguengine.dsp;

/**
 * Parametrik ekolayzer: yüksek geçiren (24 dB/okt) → alçak raf → 3 çan bandı →
 * yüksek raf → alçak geçiren (24 dB/okt). Kazancı 0 dB olan bant ve kapalı
 * kesim süzgeçleri işlenmez (işlemci yükü yalnızca kullanılan bantlar kadardır).
 */
public final class Equalizer {
  /** Yüksek geçiren bu frekansın altındaysa kapalıdır. */
  public static final float HP_OFF_HZ = 20f;
  /** Alçak geçiren bu frekansın üstündeyse kapalıdır. */
  public static final float LP_OFF_HZ = 20000f;

  private final int sr;
  private final CutFilter hp;
  private final CutFilter lp;
  private final Biquad low;
  private final Biquad high;
  private final Biquad[] bands = new Biquad[3];

  public Equalizer(int channels, int sampleRate) {
    sr = sampleRate;
    hp = new CutFilter(channels);
    lp = new CutFilter(channels);
    low = new Biquad(channels);
    high = new Biquad(channels);
    for (int i = 0; i < 3; i++) bands[i] = new Biquad(channels);
    hp.setBypass();
    lp.setBypass();
  }

  public void setHighPass(float hz) {
    if (hz <= HP_OFF_HZ) hp.setBypass(); else hp.highPass(hz, sr);
  }

  public void setLowPass(float hz) {
    // Nyquist'e çok yakın köşe frekansı anlamsızdır; kapalı say.
    if (hz >= LP_OFF_HZ || hz >= sr * 0.45f) lp.setBypass(); else lp.lowPass(hz, sr);
  }

  public void setLowShelf(float hz, float gainDb) {
    low.lowShelf(hz, gainDb, sr);
  }

  public void setHighShelf(float hz, float gainDb) {
    // Nyquist üstüne düşen raf: daha düşük frekansa çekilir (44.1/48 kHz'te 16 kHz sorun değil).
    high.highShelf(Math.min(hz, sr * 0.4f), gainDb, sr);
  }

  public void setBand(int i, float hz, float gainDb, float q) {
    bands[i].peaking(hz, gainDb, q, sr);
  }

  public void reset() {
    hp.reset(); lp.reset(); low.reset(); high.reset();
    for (Biquad b : bands) b.reset();
  }

  public boolean isFlat() {
    if (!hp.isBypass() || !lp.isBypass() || !low.isBypass() || !high.isBypass()) return false;
    for (Biquad b : bands) if (!b.isBypass()) return false;
    return true;
  }

  /** Tasarımın kuramsal genlik yanıtı (dB). */
  public double magnitudeDb(double f) {
    double m = hp.magnitudeDb(f, sr) + low.magnitudeDb(f, sr) + high.magnitudeDb(f, sr) + lp.magnitudeDb(f, sr);
    for (Biquad b : bands) m += b.magnitudeDb(f, sr);
    return m;
  }

  public void process(float[] buf, int frames) {
    hp.process(buf, frames);
    low.process(buf, frames);
    for (Biquad b : bands) b.process(buf, frames);
    high.process(buf, frames);
    lp.process(buf, frames);
  }
}
