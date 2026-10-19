package expo.modules.kurguengine.dsp;

/**
 * Stereo genişlik (orta/yan işleme): M = (L+R)/2, S = (L-R)/2, S ← S·genişlik.
 * 0 = mono, 1 = değişmez, 2 = iki kat geniş. Mono girdide etkisizdir.
 * Gecikme: 0 örnek.
 */
public final class StereoWidener {
  private final int channels;
  private float width = 1f;

  public StereoWidener(int channels) {
    this.channels = channels;
  }

  public void set(float width) {
    this.width = Math.max(0f, Math.min(2f, width));
  }

  public void process(float[] buf, int frames) {
    if (channels < 2 || width == 1f) return;
    for (int f = 0; f < frames; f++) {
      int i = f * channels;
      float m = 0.5f * (buf[i] + buf[i + 1]);
      float s = 0.5f * (buf[i] - buf[i + 1]) * width;
      buf[i] = m + s;
      buf[i + 1] = m - s;
    }
  }
}
