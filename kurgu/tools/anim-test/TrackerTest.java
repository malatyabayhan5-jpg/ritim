import expo.modules.kurguengine.vision.Tracker;
import java.util.Random;

/**
 * Tracker: sentetik sahnede dokulu bir nesne eğri bir yol izler. Denetimler:
 * doğruluk (ortalama/en büyük hata), parlaklık değişimi, kısa örtülme sonrası
 * yeniden yakalama, düşük güvenin "kayıp" olarak bildirilmesi ve hızlı hareket.
 */
public class TrackerTest {
  static final int W = 256;
  static final int H = 144;
  static int checks = 0;

  static byte[] background(long seed) {
    Random r = new Random(seed);
    byte[] f = new byte[W * H];
    // Düşük frekanslı doku + gürültü (ZNCC'nin yanlış eşleşebileceği gerçekçi zemin)
    for (int y = 0; y < H; y++) {
      for (int x = 0; x < W; x++) {
        double v = 110 + 30 * Math.sin(x * 0.07) * Math.cos(y * 0.05) + r.nextGaussian() * 8;
        f[y * W + x] = (byte) clamp((int) v);
      }
    }
    return f;
  }

  static int[] object(int size, long seed) {
    Random r = new Random(seed);
    int[] o = new int[size * size];
    for (int y = 0; y < size; y++) {
      for (int x = 0; x < size; x++) {
        boolean check = ((x / 5) + (y / 5)) % 2 == 0;
        o[y * size + x] = clamp((check ? 200 : 40) + (int) (r.nextGaussian() * 10));
      }
    }
    return o;
  }

  /** Kare: zemin + nesne (merkez ox, oy), kazanç ve isteğe bağlı örtülme. */
  static byte[] frame(byte[] bg, int[] obj, int size, double ox, double oy, double gain, boolean occluded, Random noise) {
    byte[] f = new byte[W * H];
    int x0 = (int) Math.round(ox - size / 2.0);
    int y0 = (int) Math.round(oy - size / 2.0);
    for (int y = 0; y < H; y++) {
      for (int x = 0; x < W; x++) {
        int v = bg[y * W + x] & 0xFF;
        int lx = x - x0;
        int ly = y - y0;
        if (lx >= 0 && ly >= 0 && lx < size && ly < size) v = occluded ? 128 : obj[ly * size + lx];
        f[y * W + x] = (byte) clamp((int) (v * gain + noise.nextGaussian() * 3));
      }
    }
    return f;
  }

  static double[] path(int i) {
    return new double[] {50 + i * 2.2, 72 + 28 * Math.sin(i * 0.12)};
  }

  public static void main(String[] args) {
    byte[] bg = background(7);
    int size = 30;
    int[] obj = object(size, 11);
    Random noise = new Random(3);

    // 1) Doğruluk + parlaklık değişimi (kazanç 1.0 -> 0.75)
    int n = 64;
    double[] p0 = path(0);
    Tracker t = new Tracker(frame(bg, obj, size, p0[0], p0[1], 1.0, false, noise), W, H, (float) p0[0], (float) p0[1], size, size);
    double sum = 0;
    double max = 0;
    for (int i = 1; i < n; i++) {
      double[] p = path(i);
      double gain = 1.0 - 0.25 * i / n;
      float[] r = t.update(frame(bg, obj, size, p[0], p[1], gain, false, noise));
      double e = Math.hypot(r[0] - p[0], r[1] - p[1]);
      sum += e;
      max = Math.max(max, e);
      if (r[2] < 0.6f) fail("güven düşük kare " + i + ": " + r[2]);
    }
    double mean = sum / (n - 1);
    expect(mean < 0.9, String.format("ortalama hata %.2f px < 0.9", mean));
    expect(max < 2.0, String.format("en büyük hata %.2f px < 2.0", max));

    // 2) Kısa örtülme (4 kare): güven düşmeli, sonra nesne yeniden yakalanmalı
    p0 = path(0);
    t = new Tracker(frame(bg, obj, size, p0[0], p0[1], 1.0, false, noise), W, H, (float) p0[0], (float) p0[1], size, size);
    boolean sawLost = false;
    double after = 0;
    for (int i = 1; i < 40; i++) {
      double[] p = path(i);
      boolean occ = i >= 15 && i < 19;
      float[] r = t.update(frame(bg, obj, size, p[0], p[1], 1.0, occ, noise));
      if (occ && r[2] < Tracker.LOST) sawLost = true;
      if (i >= 24) after = Math.max(after, Math.hypot(r[0] - p[0], r[1] - p[1]));
    }
    expect(sawLost, "örtülmede güven < LOST (kayıp bildirildi)");
    expect(after < 2.0, String.format("örtülme sonrası yeniden yakalama, en büyük hata %.2f px < 2.0", after));

    // 3) Hızlı hareket: kare başına 9 px yatay
    t = new Tracker(frame(bg, obj, size, 30, 70, 1.0, false, noise), W, H, 30, 70, size, size);
    double fast = 0;
    for (int i = 1; i < 20; i++) {
      double x = 30 + i * 9;
      float[] r = t.update(frame(bg, obj, size, x, 70, 1.0, false, noise));
      fast = Math.max(fast, Math.hypot(r[0] - x, r[1] - 70));
    }
    expect(fast < 2.0, String.format("hızlı hareket (9 px/kare), en büyük hata %.2f px < 2.0", fast));

    // 4) Sabit nesne: kayma olmamalı
    t = new Tracker(frame(bg, obj, size, 128, 72, 1.0, false, noise), W, H, 128, 72, size, size);
    double drift = 0;
    for (int i = 1; i < 60; i++) {
      float[] r = t.update(frame(bg, obj, size, 128, 72, 1.0, false, noise));
      drift = Math.max(drift, Math.hypot(r[0] - 128, r[1] - 72));
    }
    expect(drift < 0.6, String.format("sabit nesnede kayma %.2f px < 0.6", drift));

    // 5) Kenar: kutu kare dışına taşmaz
    t = new Tracker(frame(bg, obj, size, 20, 20, 1.0, false, noise), W, H, 2, 2, size, size);
    expect(t.x() >= t.templateWidth() / 2f && t.y() >= t.templateHeight() / 2f, "kenardaki kutu kare içine sıkıştırıldı");

    System.out.println("TrackerTest: " + checks + " denetim geçti");
  }

  static void expect(boolean ok, String what) {
    if (!ok) fail(what);
    checks++;
    System.out.println("  ✓ " + what);
  }

  static void fail(String m) {
    System.err.println("BAŞARISIZ: " + m);
    System.exit(1);
  }

  static int clamp(int v) { return Math.max(0, Math.min(255, v)); }
}
