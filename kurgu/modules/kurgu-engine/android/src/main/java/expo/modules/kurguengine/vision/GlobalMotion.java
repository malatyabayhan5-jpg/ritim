package expo.modules.kurguengine.vision;

/**
 * Ardışık iki gri karenin genel (kamera) kayması: blok eşleme, kaba-ince arama.
 * Kareler önce ortalama ve kontrastça eşitlenir (otomatik pozlama). Yarım çözünürlükte
 * ±RANGE, sonra tam çözünürlükte ±2 piksel aranır; en iyi noktanın çevresine parabol
 * oturtularak piksel altı kayma bulunur. Maliyet, kenar payı dışındaki ortak bölgenin
 * ortalama mutlak farkıdır (her 2. piksel). Baskın hareket ölçülür: kareyi kaplayan
 * hareketli bir nesne kamerayla karışabilir. Android bağımlılığı yoktur; bilgisayarda
 * test edilir (tools/anim-test/GlobalMotionTest.java).
 *
 * Sonuç: cur(x, y) ≈ prev(x - dx, y - dy), yani içerik dx, dy piksel kaydı.
 */
public final class GlobalMotion {
  public static final int RANGE = 12; // yarım çözünürlükte, tam çözünürlükte ±24 piksel

  private GlobalMotion() {}

  /** @return {dx, dy, güven 0..1} (piksel, tam çözünürlük) */
  public static float[] estimate(byte[] prevIn, byte[] curIn, int w, int h) {
    // Otomatik pozlama karelerin parlaklığını değiştirir: önce ortalama ve kontrast eşitlenir
    byte[] prev = normalize(prevIn);
    byte[] cur = normalize(curIn);
    int hw = w / 2;
    int hh = h / 2;
    byte[] p2 = half(prev, w, h);
    byte[] c2 = half(cur, w, h);
    int bx = 0;
    int by = 0;
    double best = Double.MAX_VALUE;
    double total = 0;
    int count = 0;
    for (int dy = -RANGE; dy <= RANGE; dy++) {
      for (int dx = -RANGE; dx <= RANGE; dx++) {
        double c = cost(p2, c2, hw, hh, dx, dy, RANGE + 1, 2);
        total += c;
        count++;
        if (c < best) {
          best = c;
          bx = dx;
          by = dy;
        }
      }
    }
    // Tam çözünürlükte ince arama
    int cx = bx * 2;
    int cy = by * 2;
    int margin = 2 * RANGE + 4;
    double[][] grid = new double[5][5];
    double fb = Double.MAX_VALUE;
    int fx = cx;
    int fy = cy;
    for (int j = -2; j <= 2; j++) {
      for (int i = -2; i <= 2; i++) {
        double c = cost(prev, cur, w, h, cx + i, cy + j, margin, 2);
        grid[j + 2][i + 2] = c;
        if (c < fb) {
          fb = c;
          fx = cx + i;
          fy = cy + j;
        }
      }
    }
    // Piksel altı: en iyi noktanın yatay ve dikey komşularına parabol
    int gi = fx - cx + 2;
    int gj = fy - cy + 2;
    float sx = 0f;
    float sy = 0f;
    if (gi > 0 && gi < 4) sx = parabola(grid[gj][gi - 1], grid[gj][gi], grid[gj][gi + 1]);
    if (gj > 0 && gj < 4) sy = parabola(grid[gj - 1][gi], grid[gj][gi], grid[gj + 1][gi]);
    // Güven: en iyi eşleşme aranan bölgenin ortalamasından ne kadar iyi. Düz (dokusuz) görüntüde
    // bütün kaymalar aynı maliyettedir, güven 0 olur.
    double mean = total / count;
    float conf = mean < 1.0 ? 0f : (float) Math.max(0.0, Math.min(1.0, (mean - best) / mean));
    return new float[] {fx + sx, fy + sy, conf};
  }

  private static float parabola(double l, double c, double r) {
    double den = l - 2 * c + r;
    if (den <= 1e-9) return 0f;
    return (float) Math.max(-0.5, Math.min(0.5, 0.5 * (l - r) / den));
  }

  /** Ortalama mutlak fark: cur(x, y) ile prev(x - dx, y - dy), kenar payı içinde, `step` adımla. */
  static double cost(byte[] prev, byte[] cur, int w, int h, int dx, int dy, int margin, int step) {
    long sum = 0;
    int n = 0;
    int x0 = margin;
    int x1 = w - margin;
    int y0 = margin;
    int y1 = h - margin;
    for (int y = y0; y < y1; y += step) {
      int py = y - dy;
      if (py < 0 || py >= h) continue;
      int row = y * w;
      int prow = py * w;
      for (int x = x0; x < x1; x += step) {
        int px = x - dx;
        if (px < 0 || px >= w) continue;
        sum += Math.abs((cur[row + x] & 0xFF) - (prev[prow + px] & 0xFF));
        n++;
      }
    }
    return n == 0 ? Double.MAX_VALUE : (double) sum / n;
  }

  /** Ortalama 128, standart sapma 40 olacak şekilde ölçekler (düz görüntü düz kalır). */
  static byte[] normalize(byte[] src) {
    long sum = 0;
    long sq = 0;
    for (byte b : src) {
      int v = b & 0xFF;
      sum += v;
      sq += (long) v * v;
    }
    double mean = (double) sum / src.length;
    double sd = Math.sqrt(Math.max(0.0, (double) sq / src.length - mean * mean));
    double k = sd < 1.0 ? 0.0 : 40.0 / sd;
    byte[] out = new byte[src.length];
    for (int i = 0; i < src.length; i++) {
      int v = (int) Math.round(128 + ((src[i] & 0xFF) - mean) * k);
      out[i] = (byte) Math.max(0, Math.min(255, v));
    }
    return out;
  }

  /** 2×2 ortalamayla yarım çözünürlük. */
  static byte[] half(byte[] src, int w, int h) {
    int hw = w / 2;
    int hh = h / 2;
    byte[] out = new byte[hw * hh];
    for (int y = 0; y < hh; y++) {
      for (int x = 0; x < hw; x++) {
        int a = src[(2 * y) * w + 2 * x] & 0xFF;
        int b = src[(2 * y) * w + 2 * x + 1] & 0xFF;
        int c = src[(2 * y + 1) * w + 2 * x] & 0xFF;
        int d = src[(2 * y + 1) * w + 2 * x + 1] & 0xFF;
        out[y * hw + x] = (byte) ((a + b + c + d + 2) / 4);
      }
    }
    return out;
  }
}
