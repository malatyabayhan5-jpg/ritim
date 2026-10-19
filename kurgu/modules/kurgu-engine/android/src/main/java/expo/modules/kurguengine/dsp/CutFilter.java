package expo.modules.kurguengine.dsp;

/**
 * 4. dereceden Butterworth alçak/yüksek geçiren süzgeç (24 dB/oktav): iki biquad
 * art arda, Q değerleri Butterworth kutup çiftlerinden (Q = 1 / (2 cos θk),
 * θ = π/8 ve 3π/8 → 0.5412 ve 1.3066). Köşe frekansında -3 dB, bir oktav
 * ötede yaklaşık -24 dB. (Ders kitabı Butterworth ayrıştırması; kod özgündür.)
 */
public final class CutFilter {
  private static final double Q1 = 1.0 / (2 * Math.cos(Math.PI / 8));
  private static final double Q2 = 1.0 / (2 * Math.cos(3 * Math.PI / 8));
  private final Biquad s1;
  private final Biquad s2;

  public CutFilter(int channels) {
    s1 = new Biquad(channels);
    s2 = new Biquad(channels);
  }

  public void highPass(double f, int sr) {
    s1.highPass(f, Q1, sr);
    s2.highPass(f, Q2, sr);
  }

  public void lowPass(double f, int sr) {
    s1.lowPass(f, Q1, sr);
    s2.lowPass(f, Q2, sr);
  }

  public void setBypass() {
    s1.setBypass();
    s2.setBypass();
  }

  public boolean isBypass() {
    return s1.isBypass();
  }

  public void reset() {
    s1.reset();
    s2.reset();
  }

  public double magnitudeDb(double f, int sr) {
    return s1.magnitudeDb(f, sr) + s2.magnitudeDb(f, sr);
  }

  public void process(float[] buf, int frames) {
    s1.process(buf, frames);
    s2.process(buf, frames);
  }
}
