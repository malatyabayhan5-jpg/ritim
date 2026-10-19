import expo.modules.kurguengine.vision.KeyColor;
import java.util.Random;

/** KeyColor.estimate: sentetik yeşil/mavi perde, konu ortada, gürültü ve gölgeli perde. */
public class KeyColorTest {
  static int[] scene(int w, int h, int screen, int subject, double noise, boolean gradient, long seed) {
    Random rnd = new Random(seed);
    int[] px = new int[w * h];
    for (int y = 0; y < h; y++) {
      for (int x = 0; x < w; x++) {
        boolean inSubject = Math.hypot(x - w / 2.0, (y - h * 0.6) * 1.3) < h * 0.35;
        int c = inSubject ? subject : screen;
        double k = gradient && !inSubject ? 0.7 + 0.3 * x / (double) w : 1.0;
        int r = clamp((int) (((c >> 16) & 0xFF) * k + rnd.nextGaussian() * noise));
        int g = clamp((int) (((c >> 8) & 0xFF) * k + rnd.nextGaussian() * noise));
        int b = clamp((int) ((c & 0xFF) * k + rnd.nextGaussian() * noise));
        px[y * w + x] = 0xFF000000 | r << 16 | g << 8 | b;
      }
    }
    return px;
  }

  static int clamp(int v) { return Math.max(0, Math.min(255, v)); }

  static void expectNear(String name, int got, int want, int tol) {
    if (got < 0) fail(name + ": renk bulunamadı");
    int dr = Math.abs(((got >> 16) & 0xFF) - ((want >> 16) & 0xFF));
    int dg = Math.abs(((got >> 8) & 0xFF) - ((want >> 8) & 0xFF));
    int db = Math.abs((got & 0xFF) - (want & 0xFF));
    if (Math.max(dr, Math.max(dg, db)) > tol) fail(name + String.format(": #%06X beklenen ~#%06X", got, want));
    System.out.println(name + String.format(": #%06X (beklenen ~#%06X)", got, want));
  }

  static void fail(String m) {
    System.out.println("HATA: " + m);
    System.exit(1);
  }

  public static void main(String[] args) {
    expectNear("yeşil perde", KeyColor.estimate(scene(640, 360, 0x1EBE3C, 0xE6B496, 6, false, 1), 640, 360), 0x1EBE3C, 8);
    expectNear("mavi perde", KeyColor.estimate(scene(360, 640, 0x1E46C8, 0xC8A082, 6, false, 2), 360, 640), 0x1E46C8, 8);
    // Gölgeli perde: ortalama, parlak ve koyu uçların arasında olmalı
    int g = KeyColor.estimate(scene(640, 360, 0x22C040, 0x303030, 4, true, 3), 640, 360);
    expectNear("gölgeli yeşil perde", g, 0x1D9F35, 24);
    int gray = KeyColor.estimate(scene(320, 240, 0x808080, 0xFF0000, 3, false, 4), 320, 240);
    if (gray != -1) fail(String.format("gri kenarda anahtar bulunmamalı, bulunan #%06X", gray));
    System.out.println("Anahtar renk testleri geçti");
  }
}
