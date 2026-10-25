import expo.modules.kurguengine.vision.GlobalMotion;
import java.util.Arrays;
import java.util.Random;

/**
 * GlobalMotion: sentetik sahnede kamera yavaşça kayarken her karede rastgele sarsıntı
 * eklenir. Denetimler: arama aralığındaki kaymalarda piksel altı doğruluk, gürültü,
 * parlaklık değişimi ve dokusuz görüntünün düşük güvenle bildirilmesi.
 */
public class GlobalMotionTest {
  static final int W = 144;
  static final int H = 256;
  static int checks = 0;

  static double scene(double x, double y) {
    return 128 + 50 * Math.sin(x * 0.11) * Math.cos(y * 0.07) + 40 * Math.sin((x + y) * 0.031) + 30 * Math.cos(x * 0.023 - y * 0.05);
  }

  static byte[] frame(double camX, double camY, double gain, Random r) {
    byte[] f = new byte[W * H];
    for (int y = 0; y < H; y++) {
      for (int x = 0; x < W; x++) f[y * W + x] = (byte) clamp((int) Math.round(scene(x - camX, y - camY) * gain + r.nextGaussian() * 4));
    }
    return f;
  }

  public static void main(String[] args) {
    System.out.println("GlobalMotion:");
    Random r = new Random(7);
    double px = 0;
    double py = 0;
    double sum = 0;
    double worst = 0;
    int n = 0;
    byte[] prev = null;
    for (int f = 0; f < 80; f++) {
      // Yavaş kaydırma + ±10 piksel sarsıntı; ardışık fark en çok ±20 (aralık ±24)
      double camX = f * 0.5 + (r.nextDouble() - 0.5) * 20;
      double camY = -f * 0.3 + (r.nextDouble() - 0.5) * 20;
      byte[] cur = frame(camX, camY, 1, r);
      if (prev != null) {
        float[] e = GlobalMotion.estimate(prev, cur, W, H);
        double err = Math.hypot(e[0] - (camX - px), e[1] - (camY - py));
        sum += err;
        worst = Math.max(worst, err);
        n++;
        if (e[2] < 0.3) fail(String.format("güven düşük %.2f (kare %d)", e[2], f));
      }
      prev = cur;
      px = camX;
      py = camY;
    }
    expect(sum / n < 0.25, String.format("ortalama hata %.3f px < 0.25", sum / n));
    expect(worst < 1.0, String.format("en büyük hata %.3f px < 1", worst));

    // Parlaklık %15 düşerken 3.4, -2.2 piksel kayma
    byte[] a = frame(0, 0, 1, r);
    byte[] b = frame(3.4, -2.2, 0.85, r);
    float[] e = GlobalMotion.estimate(a, b, W, H);
    expect(Math.hypot(e[0] - 3.4, e[1] + 2.2) < 0.6, String.format("parlaklık değişiminde kayma %.2f, %.2f", e[0], e[1]));

    byte[] flat = new byte[W * H];
    Arrays.fill(flat, (byte) 90);
    expect(GlobalMotion.estimate(flat, flat, W, H)[2] < 0.05, "dokusuz görüntüde güven ≈ 0");
    System.out.println(checks + " denetim geçti");
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
