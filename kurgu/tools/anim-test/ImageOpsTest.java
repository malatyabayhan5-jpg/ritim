import expo.modules.kurguengine.vision.ImageOps;

/** ImageOps: sentetik görüntülerle davranış testleri. */
public class ImageOpsTest {
  static int argb(int a, int r, int g, int b) { return a << 24 | r << 16 | g << 8 | b; }
  static int r(int c) { return (c >> 16) & 0xFF; }
  static int g(int c) { return (c >> 8) & 0xFF; }
  static int b(int c) { return c & 0xFF; }
  static void check(boolean ok, String m) { if (!ok) { System.out.println("HATA: " + m); System.exit(1); } System.out.println("ok: " + m); }

  static int[] gradient(int w, int h) {
    int[] px = new int[w * h];
    for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) px[y * w + x] = argb(255, x * 255 / (w - 1), y * 255 / (h - 1), 128);
    return px;
  }

  public static void main(String[] a) {
    int w = 64, h = 48;
    int[] base = gradient(w, h);

    int[] p = base.clone();
    ImageOps.colorMatrix(p, new float[] {1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1});
    check(java.util.Arrays.equals(p, base), "birim renk matrisi görüntüyü değiştirmez");

    p = base.clone();
    ImageOps.tone(p, 0, 0, 0);
    check(java.util.Arrays.equals(p, base), "sıfır ton ayarı değiştirmez");
    int[] dark = new int[] {argb(255, 40, 40, 40), argb(255, 230, 230, 230), argb(255, 0, 0, 0), argb(255, 255, 255, 255)};
    int[] t1 = dark.clone();
    ImageOps.tone(t1, 0, 1, 0);
    check(r(t1[0]) > 55 && Math.abs(r(t1[1]) - 230) < 8 && r(t1[2]) == 0 && r(t1[3]) == 255, "gölge artışı koyuyu açar, açığı/uçları korur: " + r(t1[0]) + "," + r(t1[1]));
    int[] t2 = dark.clone();
    ImageOps.tone(t2, -1, 0, 0);
    check(r(t2[1]) < 215 && Math.abs(r(t2[0]) - 40) < 6, "parlak alan azaltma açığı karartır: " + r(t2[1]));
    int[] t3 = dark.clone();
    ImageOps.tone(t3, 0, 0, 1);
    check(r(t3[2]) > 40, "soluklaştırma siyah noktasını yükseltir: " + r(t3[2]));

    int[] hs = new int[] {argb(255, 220, 30, 30), argb(255, 30, 40, 220), argb(255, 128, 128, 128)};
    float[] bands = new float[24];
    bands[1] = -1; // kırmızı doygunluk -1
    ImageOps.hsl(hs, bands);
    check(Math.abs(r(hs[0]) - g(hs[0])) < 20, "kırmızı bant doygunluğu kırmızıyı griye çeker");
    check(hs[1] == argb(255, 30, 40, 220) && hs[2] == argb(255, 128, 128, 128), "mavi ve gri etkilenmez");

    int[] gr = new int[] {argb(255, 30, 30, 30), argb(255, 220, 220, 220)};
    ImageOps.grade(gr, 220, 1, 40, 1, 0);
    check(b(gr[0]) > r(gr[0]) && r(gr[1]) > b(gr[1]), "gölgeler mavi, parlaklar turuncu tonlanır");

    p = base.clone();
    long before = 0, after = 0;
    for (int c : p) before += r(c);
    ImageOps.blur(p, w, h, 4);
    for (int c : p) after += r(c);
    check(Math.abs(before - after) < before * 0.02, "bulanıklık ortalamayı korur");
    int[] flat = new int[w * h];
    java.util.Arrays.fill(flat, argb(255, 90, 100, 110));
    int[] fb = flat.clone();
    ImageOps.blur(fb, w, h, 3);
    ImageOps.sharpen(fb, w, h, 1);
    check(java.util.Arrays.equals(fb, flat), "düz renk bulanıklık/keskinlikte değişmez");

    int[] edge = new int[w * h];
    for (int i = 0; i < edge.length; i++) edge[i] = (i % w) < w / 2 ? argb(255, 60, 60, 60) : argb(255, 180, 180, 180);
    int[] es = edge.clone();
    ImageOps.sharpen(es, w, h, 1);
    check(r(es[w / 2 - 1]) < 60 && r(es[w / 2]) > 180, "keskinlik kenar kontrastını artırır");

    p = flat.clone();
    ImageOps.vignette(p, w, h, 1);
    check(r(p[(h / 2) * w + w / 2]) == 90 && r(p[0]) < 40, "vinyet merkezi korur, köşeyi karartır");

    int[] g1 = flat.clone();
    int[] g2 = flat.clone();
    ImageOps.grain(g1, 0.5f, 7);
    ImageOps.grain(g2, 0.5f, 7);
    check(java.util.Arrays.equals(g1, g2) && !java.util.Arrays.equals(g1, flat), "gren deterministik ve görünür");

    byte[] mask = new byte[4];
    mask[0] = 0; mask[1] = (byte) 255; mask[2] = (byte) 128; mask[3] = (byte) 255;
    int[] mp = new int[] {argb(255, 1, 2, 3), argb(255, 1, 2, 3), argb(255, 1, 2, 3), argb(128, 1, 2, 3)};
    ImageOps.applyMask(mp, mask, 0.4f, 0.6f, false);
    check((mp[0] >>> 24) == 0 && (mp[1] >>> 24) == 255 && Math.abs((mp[2] >>> 24) - 128) < 6 && (mp[3] >>> 24) == 128, "maske alfası eşikli ve mevcut alfayla çarpılır");

    int size = 17;
    float[] lut = new float[size * size * size * 3];
    for (int bb = 0; bb < size; bb++) for (int gg = 0; gg < size; gg++) for (int rr = 0; rr < size; rr++) {
      int o = ((bb * size + gg) * size + rr) * 3;
      lut[o] = rr / (float) (size - 1); lut[o + 1] = gg / (float) (size - 1); lut[o + 2] = bb / (float) (size - 1);
    }
    p = base.clone();
    ImageOps.lut3d(p, lut, size, 1);
    int maxd = 0;
    for (int i = 0; i < p.length; i++) maxd = Math.max(maxd, Math.max(Math.abs(r(p[i]) - r(base[i])), Math.abs(g(p[i]) - g(base[i]))));
    check(maxd <= 1, "birim LUT ≤ 1/255 fark");

    // Boyama: düz renk zeminde delik aynı renkle, yatay degradede doğrusal değere yakın dolar
    int[] ip = flat.clone();
    boolean[] hole = new boolean[w * h];
    for (int y = 20; y < 30; y++) for (int x = 25; x < 40; x++) { hole[y * w + x] = true; ip[y * w + x] = argb(255, 255, 0, 0); }
    ImageOps.inpaint(ip, w, h, hole);
    check(ip[25 * w + 32] == argb(255, 90, 100, 110), "düz zeminde delik zemin rengiyle dolar");
    int[] gp = gradient(w, h);
    for (int y = 20; y < 30; y++) for (int x = 25; x < 40; x++) gp[y * w + x] = argb(255, 0, 255, 0);
    ImageOps.inpaint(gp, w, h, hole);
    int want = 32 * 255 / (w - 1);
    check(Math.abs(r(gp[25 * w + 32]) - want) < 18, "degradede delik yaklaşık doğrusal dolar: " + r(gp[25 * w + 32]) + " ~ " + want);
    System.out.println("Görüntü işlem testleri geçti");
  }
}
