package expo.modules.kurguengine.vision;

/**
 * Chroma key için anahtar rengi tahmini: karenin dış halkasındaki (kenarlardan
 * %12) doygun piksellerin renk tonu histogramında en kalabalık dilim seçilir ve o
 * dilimdeki piksellerin ortalaması döner. Yeşil/mavi perde çekimlerinde perde
 * kenarları kaplar; konu genelde ortadadır. Saf Java (CI'da javac ile test edilir).
 */
public final class KeyColor {
  private KeyColor() {}

  private static final int HUE_BINS = 36;

  /**
   * @param argb width*height piksel (0xAARRGGBB)
   * @return 0xRRGGBB veya -1 (yeterince doygun kenar pikseli yoksa)
   */
  public static int estimate(int[] argb, int width, int height) {
    int ring = Math.max(1, Math.round(Math.min(width, height) * 0.12f));
    long[] sumR = new long[HUE_BINS];
    long[] sumG = new long[HUE_BINS];
    long[] sumB = new long[HUE_BINS];
    int[] count = new int[HUE_BINS];
    int total = 0;
    int step = Math.max(1, Math.min(width, height) / 160);
    for (int y = 0; y < height; y += step) {
      boolean edgeRow = y < ring || y >= height - ring;
      for (int x = 0; x < width; x += step) {
        if (!edgeRow && x >= ring && x < width - ring) continue;
        int c = argb[y * width + x];
        int r = (c >> 16) & 0xFF;
        int g = (c >> 8) & 0xFF;
        int b = c & 0xFF;
        int max = Math.max(r, Math.max(g, b));
        int min = Math.min(r, Math.min(g, b));
        total++;
        // Doygunluk ve parlaklık eşiği: gri/siyah/beyaz kenarlar anahtar olamaz
        if (max < 40 || max - min < 0.25 * max) continue;
        int bin = hueBin(r, g, b, max, min);
        sumR[bin] += r;
        sumG[bin] += g;
        sumB[bin] += b;
        count[bin]++;
      }
    }
    int best = -1;
    int bestCount = 0;
    for (int i = 0; i < HUE_BINS; i++) {
      // Komşu dilimlerle birlikte say (ton sınırında bölünmeyi önler)
      int c = count[i] + count[(i + 1) % HUE_BINS] + count[(i + HUE_BINS - 1) % HUE_BINS];
      if (c > bestCount) {
        bestCount = c;
        best = i;
      }
    }
    // Kenarın en az %20'si aynı tonda olmalı
    if (best < 0 || total == 0 || bestCount < total * 0.2) return -1;
    long r = 0;
    long g = 0;
    long b = 0;
    int n = 0;
    for (int d = -1; d <= 1; d++) {
      int i = (best + d + HUE_BINS) % HUE_BINS;
      r += sumR[i];
      g += sumG[i];
      b += sumB[i];
      n += count[i];
    }
    return (int) ((r / n) << 16 | (g / n) << 8 | (b / n));
  }

  private static int hueBin(int r, int g, int b, int max, int min) {
    float d = max - min;
    float h;
    if (max == r) h = ((g - b) / d) % 6f;
    else if (max == g) h = (b - r) / d + 2f;
    else h = (r - g) / d + 4f;
    h *= 60f;
    if (h < 0) h += 360f;
    return Math.min(HUE_BINS - 1, (int) (h / (360f / HUE_BINS)));
  }
}
