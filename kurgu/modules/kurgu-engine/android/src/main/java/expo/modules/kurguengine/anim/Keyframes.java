package expo.modules.kurguengine.anim;

/**
 * Anahtar kare değerlendirmesi (src/model/keyframes.js ile birebir aynı hesap).
 * İz, düz dizi olarak gelir: her kare 7 sayı [t, v, tür, x1, y1, x2, y2];
 * tür 0 = doğrusal, 1 = kübik Bézier, 2 = bekle (sonraki kareye kadar sabit).
 * Saf Java: Android'e bağımlı değil, CI'da javac ile test edilir
 * (tools/anim-test, ortak örnekler tests/fixtures/keyframes.txt).
 */
public final class Keyframes {
  private Keyframes() {}

  private static double bezierCoord(double t, double a, double b) {
    double u = 1 - t;
    return 3 * u * u * t * a + 3 * u * t * t * b + t * t * t;
  }

  public static double cubicBezier(double x1, double y1, double x2, double y2, double x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    double lo = 0;
    double hi = 1;
    for (int i = 0; i < 24; i++) {
      double t = (lo + hi) / 2;
      if (bezierCoord(t, x1, x2) < x) lo = t;
      else hi = t;
    }
    return bezierCoord((lo + hi) / 2, y1, y2);
  }

  /** @param packed null veya boşsa fallback döner. */
  public static float valueAt(float[] packed, double tMs, float fallback) {
    if (packed == null || packed.length < 7) return fallback;
    int n = packed.length / 7;
    if (tMs <= packed[0]) return packed[1];
    int last = (n - 1) * 7;
    if (tMs >= packed[last]) return packed[last + 1];
    int i = 0;
    while (i < n - 2 && packed[(i + 1) * 7] <= tMs) i++;
    int a = i * 7;
    int b = (i + 1) * 7;
    double span = packed[b] - packed[a];
    if (span <= 0) return packed[b + 1];
    double p = (tMs - packed[a]) / span;
    double k;
    int kind = Math.round(packed[a + 2]);
    if (kind == 2) k = 0;
    else if (kind == 1) k = cubicBezier(packed[a + 3], packed[a + 4], packed[a + 5], packed[a + 6], p);
    else k = Math.min(1, Math.max(0, p));
    return (float) (packed[a + 1] + (packed[b + 1] - packed[a + 1]) * k);
  }
}
