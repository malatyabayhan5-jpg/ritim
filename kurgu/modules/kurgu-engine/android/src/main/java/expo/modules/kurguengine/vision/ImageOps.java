package expo.modules.kurguengine.vision;

/**
 * Fotoğraf düzenleyicinin piksel işlemleri (ARGB int dizileri üzerinde, yerinde).
 * Android'e bağımlı değildir; CI'da javac ile test edilir (tools/anim-test/ImageOpsTest).
 * Renkler gama kodlu sRGB'dir; tüm işlemler tahribatsız düzenlemenin dışa aktarma
 * ve önizleme adımında, kaynak görüntünün kopyası üzerinde çalışır.
 */
public final class ImageOps {
  private ImageOps() {}

  private static int clamp255(float v) {
    return v <= 0 ? 0 : v >= 255 ? 255 : (int) (v + 0.5f);
  }

  private static float luma(float r, float g, float b) {
    return 0.2126f * r + 0.7152f * g + 0.0722f * b;
  }

  /** 4x4 renk matrisi (sütun öncelikli, 4. sütun ofset, 0..1 ölçeği) — src/model/color.js ile aynı. */
  public static void colorMatrix(int[] px, float[] m) {
    if (m == null || m.length != 16) return;
    for (int i = 0; i < px.length; i++) {
      int c = px[i];
      float r = ((c >> 16) & 0xFF) / 255f;
      float g = ((c >> 8) & 0xFF) / 255f;
      float b = (c & 0xFF) / 255f;
      float nr = m[0] * r + m[4] * g + m[8] * b + m[12];
      float ng = m[1] * r + m[5] * g + m[9] * b + m[13];
      float nb = m[2] * r + m[6] * g + m[10] * b + m[14];
      px[i] = (c & 0xFF000000) | clamp255(nr * 255) << 16 | clamp255(ng * 255) << 8 | clamp255(nb * 255);
    }
  }

  /**
   * Ton ayarı: gölgeler (-1..1) koyu bölgeleri, parlak alanlar (-1..1) açık bölgeleri
   * yumuşak ağırlıkla değiştirir; soluklaştırma (0..1) siyah noktasını yükseltir.
   */
  public static void tone(int[] px, float highlights, float shadows, float fade) {
    if (highlights == 0 && shadows == 0 && fade <= 0) return;
    float[] lut = new float[256];
    for (int v = 0; v < 256; v++) {
      float l = v / 255f;
      // Gölge ağırlığı 4l(1-l)^3 (en çok l=1/4), parlak alan ağırlığı 4l^3(1-l) (en çok l=3/4);
      // uçlar (saf siyah/beyaz) sabit kalır, karşı ton bölgesi neredeyse etkilenmez.
      float nl = l + shadows * 0.6f * l * (1 - l) * (1 - l) * (1 - l) * 4f + highlights * 0.6f * l * l * l * (1 - l) * 4f;
      nl = nl * (1 - 0.22f * fade) + 0.22f * fade;
      lut[v] = Math.max(0f, Math.min(1f, nl));
    }
    for (int i = 0; i < px.length; i++) {
      int c = px[i];
      float r = (c >> 16) & 0xFF;
      float g = (c >> 8) & 0xFF;
      float b = c & 0xFF;
      float l = luma(r, g, b);
      int li = clamp255(l);
      float target = lut[li] * 255f;
      // Renk korunarak parlaklık oranı uygulanır (koyu piksellerde ekleme)
      if (l > 8) {
        float k = target / l;
        px[i] = (c & 0xFF000000) | clamp255(r * k) << 16 | clamp255(g * k) << 8 | clamp255(b * k);
      } else {
        float d = target - l;
        px[i] = (c & 0xFF000000) | clamp255(r + d) << 16 | clamp255(g + d) << 8 | clamp255(b + d);
      }
    }
  }

  /** HSL bant merkezleri (derece): kırmızı, turuncu, sarı, yeşil, camgöbeği, mavi, mor, macenta. */
  public static final float[] HSL_CENTERS = {0, 30, 60, 120, 180, 230, 275, 320};

  /**
   * Seçici renk ayarı: bands[k*3 + 0] ton kayması (-1..1 → ±30°), +1 doygunluk (-1..1),
   * +2 parlaklık (-1..1). Bant ağırlıkları komşu merkezler arasında yumuşak geçer.
   */
  public static void hsl(int[] px, float[] bands) {
    if (bands == null || bands.length < 24) return;
    boolean any = false;
    for (float v : bands) if (v != 0) any = true;
    if (!any) return;
    float[] hsv = new float[3];
    for (int i = 0; i < px.length; i++) {
      int c = px[i];
      float r = ((c >> 16) & 0xFF) / 255f;
      float g = ((c >> 8) & 0xFF) / 255f;
      float b = (c & 0xFF) / 255f;
      rgbToHsl(r, g, b, hsv);
      if (hsv[1] < 0.02f) continue;
      float dh = 0;
      float ds = 0;
      float dl = 0;
      float wsum = 0;
      for (int k = 0; k < 8; k++) {
        float d = Math.abs(hsv[0] - HSL_CENTERS[k]);
        d = Math.min(d, 360 - d);
        float w = Math.max(0, 1 - d / 40f);
        if (w <= 0) continue;
        w = w * w * (3 - 2 * w);
        dh += w * bands[k * 3] * 30f;
        ds += w * bands[k * 3 + 1];
        dl += w * bands[k * 3 + 2];
        wsum += w;
      }
      if (wsum <= 0) continue;
      // Az doygun piksellerde etki azalır (griler bozulmaz)
      float sat = Math.min(1f, hsv[1] * 2.5f);
      float h = (hsv[0] + dh * sat + 360) % 360;
      float s = Math.max(0, Math.min(1, hsv[1] * (1 + ds * sat)));
      float l = Math.max(0, Math.min(1, hsv[2] + dl * 0.25f * sat));
      hslToRgb(h, s, l, hsv);
      px[i] = (c & 0xFF000000) | clamp255(hsv[0] * 255) << 16 | clamp255(hsv[1] * 255) << 8 | clamp255(hsv[2] * 255);
    }
  }

  static void rgbToHsl(float r, float g, float b, float[] out) {
    float max = Math.max(r, Math.max(g, b));
    float min = Math.min(r, Math.min(g, b));
    float l = (max + min) / 2;
    float h = 0;
    float s = 0;
    float d = max - min;
    if (d > 1e-6f) {
      s = l > 0.5f ? d / (2 - max - min) : d / (max + min);
      if (max == r) h = ((g - b) / d + (g < b ? 6 : 0));
      else if (max == g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    out[0] = h;
    out[1] = s;
    out[2] = l;
  }

  static void hslToRgb(float h, float s, float l, float[] out) {
    float c = (1 - Math.abs(2 * l - 1)) * s;
    float hp = h / 60f;
    float x = c * (1 - Math.abs(hp % 2 - 1));
    float r = 0;
    float g = 0;
    float b = 0;
    if (hp < 1) { r = c; g = x; }
    else if (hp < 2) { r = x; g = c; }
    else if (hp < 3) { g = c; b = x; }
    else if (hp < 4) { g = x; b = c; }
    else if (hp < 5) { r = x; b = c; }
    else { r = c; b = x; }
    float m = l - c / 2;
    out[0] = r + m;
    out[1] = g + m;
    out[2] = b + m;
  }

  /**
   * Renk dereceleme (bölünmüş tonlama): gölgelere ve parlak alanlara ayrı ton ve
   * doygunluk; denge (-1..1) geçiş noktasını kaydırır. Tonlar derece, doygunluk 0..1.
   */
  public static void grade(int[] px, float shadowHue, float shadowSat, float highHue, float highSat, float balance) {
    if (shadowSat <= 0 && highSat <= 0) return;
    float[] sc = new float[3];
    float[] hc = new float[3];
    hslToRgb(shadowHue, 1, 0.5f, sc);
    hslToRgb(highHue, 1, 0.5f, hc);
    float pivot = 0.5f + 0.25f * balance;
    for (int i = 0; i < px.length; i++) {
      int c = px[i];
      float r = ((c >> 16) & 0xFF) / 255f;
      float g = ((c >> 8) & 0xFF) / 255f;
      float b = (c & 0xFF) / 255f;
      float l = luma(r, g, b);
      float ws = Math.max(0, 1 - l / pivot);
      float wh = Math.max(0, (l - pivot) / (1 - pivot));
      ws = ws * ws * shadowSat * 0.3f;
      wh = wh * wh * highSat * 0.3f;
      // Ton katkısı parlaklığı korur: renk - kendi parlaklığı
      float sl = luma(sc[0], sc[1], sc[2]);
      float hl = luma(hc[0], hc[1], hc[2]);
      r += ws * (sc[0] - sl) + wh * (hc[0] - hl);
      g += ws * (sc[1] - sl) + wh * (hc[1] - hl);
      b += ws * (sc[2] - sl) + wh * (hc[2] - hl);
      px[i] = (c & 0xFF000000) | clamp255(r * 255) << 16 | clamp255(g * 255) << 8 | clamp255(b * 255);
    }
  }

  /** Ayrılabilir kutu bulanıklığı (3 geçiş ≈ Gauss). Alfa da bulanıklaşır. */
  public static void blur(int[] px, int w, int h, int radius) {
    if (radius < 1) return;
    int[] tmp = new int[px.length];
    for (int pass = 0; pass < 3; pass++) {
      boxH(px, tmp, w, h, radius);
      boxV(tmp, px, w, h, radius);
    }
  }

  private static void boxH(int[] src, int[] dst, int w, int h, int r) {
    float inv = 1f / (2 * r + 1);
    for (int y = 0; y < h; y++) {
      int row = y * w;
      long sa = 0, sr = 0, sg = 0, sb = 0;
      for (int k = -r; k <= r; k++) {
        int c = src[row + Math.min(w - 1, Math.max(0, k))];
        sa += c >>> 24; sr += (c >> 16) & 0xFF; sg += (c >> 8) & 0xFF; sb += c & 0xFF;
      }
      for (int x = 0; x < w; x++) {
        dst[row + x] = clamp255(sa * inv) << 24 | clamp255(sr * inv) << 16 | clamp255(sg * inv) << 8 | clamp255(sb * inv);
        int out = src[row + Math.max(0, x - r)];
        int in = src[row + Math.min(w - 1, x + r + 1)];
        sa += (in >>> 24) - (out >>> 24);
        sr += ((in >> 16) & 0xFF) - ((out >> 16) & 0xFF);
        sg += ((in >> 8) & 0xFF) - ((out >> 8) & 0xFF);
        sb += (in & 0xFF) - (out & 0xFF);
      }
    }
  }

  private static void boxV(int[] src, int[] dst, int w, int h, int r) {
    float inv = 1f / (2 * r + 1);
    for (int x = 0; x < w; x++) {
      long sa = 0, sr = 0, sg = 0, sb = 0;
      for (int k = -r; k <= r; k++) {
        int c = src[Math.min(h - 1, Math.max(0, k)) * w + x];
        sa += c >>> 24; sr += (c >> 16) & 0xFF; sg += (c >> 8) & 0xFF; sb += c & 0xFF;
      }
      for (int y = 0; y < h; y++) {
        dst[y * w + x] = clamp255(sa * inv) << 24 | clamp255(sr * inv) << 16 | clamp255(sg * inv) << 8 | clamp255(sb * inv);
        int out = src[Math.max(0, y - r) * w + x];
        int in = src[Math.min(h - 1, y + r + 1) * w + x];
        sa += (in >>> 24) - (out >>> 24);
        sr += ((in >> 16) & 0xFF) - ((out >> 16) & 0xFF);
        sg += ((in >> 8) & 0xFF) - ((out >> 8) & 0xFF);
        sb += (in & 0xFF) - (out & 0xFF);
      }
    }
  }

  /** Keskinleştirme (bulanık maske, yarıçap 1): amount 0..1. */
  public static void sharpen(int[] px, int w, int h, float amount) {
    if (amount <= 0) return;
    int[] soft = px.clone();
    boxH(px, soft, w, h, 1);
    int[] soft2 = new int[px.length];
    boxV(soft, soft2, w, h, 1);
    float k = amount * 1.5f;
    for (int i = 0; i < px.length; i++) {
      int c = px[i];
      int s = soft2[i];
      float r = ((c >> 16) & 0xFF) + k * (((c >> 16) & 0xFF) - ((s >> 16) & 0xFF));
      float g = ((c >> 8) & 0xFF) + k * (((c >> 8) & 0xFF) - ((s >> 8) & 0xFF));
      float b = (c & 0xFF) + k * ((c & 0xFF) - (s & 0xFF));
      px[i] = (c & 0xFF000000) | clamp255(r) << 16 | clamp255(g) << 8 | clamp255(b);
    }
  }

  /** Vinyet: kenarlar karartılır (amount 0..1), merkez aynı kalır. */
  public static void vignette(int[] px, int w, int h, float amount) {
    if (amount <= 0) return;
    float cx = (w - 1) / 2f;
    float cy = (h - 1) / 2f;
    float maxd = (float) Math.sqrt(cx * cx + cy * cy);
    for (int y = 0; y < h; y++) {
      for (int x = 0; x < w; x++) {
        float d = (float) Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy)) / maxd;
        float t = Math.max(0, (d - 0.45f) / 0.55f);
        float k = 1 - amount * 0.85f * t * t * (3 - 2 * t);
        int i = y * w + x;
        int c = px[i];
        px[i] = (c & 0xFF000000) | clamp255(((c >> 16) & 0xFF) * k) << 16 | clamp255(((c >> 8) & 0xFF) * k) << 8 | clamp255((c & 0xFF) * k);
      }
    }
  }

  /** Film greni: deterministik (aynı tohum aynı gren), parlaklığa bağlı genlik. */
  public static void grain(int[] px, float amount, int seed) {
    if (amount <= 0) return;
    int s = seed * 0x9E3779B1 + 0x7F4A7C15;
    for (int i = 0; i < px.length; i++) {
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
      float n = ((s & 0xFFFF) / 65535f - 0.5f) * 2f;
      int c = px[i];
      float l = luma((c >> 16) & 0xFF, (c >> 8) & 0xFF, c & 0xFF) / 255f;
      float a = amount * 38f * (0.35f + 0.65f * 4 * l * (1 - l));
      float d = n * a;
      px[i] = (c & 0xFF000000) | clamp255(((c >> 16) & 0xFF) + d) << 16 | clamp255(((c >> 8) & 0xFF) + d) << 8 | clamp255((c & 0xFF) + d);
    }
  }

  /**
   * Maske alfası: mask 0..255 (görüntü boyutunda). lo..hi aralığı yumuşak eşik
   * (kenar inceltme/genişletme), invert ters çevirir. Mevcut alfa ile çarpılır.
   */
  public static void applyMask(int[] px, byte[] mask, float lo, float hi, boolean invert) {
    float span = Math.max(1e-3f, hi - lo);
    for (int i = 0; i < px.length; i++) {
      float m = (mask[i] & 0xFF) / 255f;
      if (invert) m = 1 - m;
      float t = Math.max(0, Math.min(1, (m - lo) / span));
      t = t * t * (3 - 2 * t);
      int a = clamp255((px[i] >>> 24) * t);
      px[i] = (px[i] & 0x00FFFFFF) | a << 24;
    }
  }

  /**
   * 3B LUT (trilineer). data: size^3 * 3 değer (0..1), r en hızlı değişen eksen
   * (.cube düzeni). amount 0..1 karışım.
   */
  public static void lut3d(int[] px, float[] data, int size, float amount) {
    if (data == null || size < 2 || amount <= 0) return;
    int n = size - 1;
    for (int i = 0; i < px.length; i++) {
      int c = px[i];
      float r = ((c >> 16) & 0xFF) / 255f * n;
      float g = ((c >> 8) & 0xFF) / 255f * n;
      float b = (c & 0xFF) / 255f * n;
      int r0 = Math.min(n - 1, (int) r), g0 = Math.min(n - 1, (int) g), b0 = Math.min(n - 1, (int) b);
      float fr = r - r0, fg = g - g0, fb = b - b0;
      float[] out = new float[3];
      for (int ch = 0; ch < 3; ch++) {
        float c000 = data[((b0 * size + g0) * size + r0) * 3 + ch];
        float c100 = data[((b0 * size + g0) * size + r0 + 1) * 3 + ch];
        float c010 = data[((b0 * size + g0 + 1) * size + r0) * 3 + ch];
        float c110 = data[((b0 * size + g0 + 1) * size + r0 + 1) * 3 + ch];
        float c001 = data[(((b0 + 1) * size + g0) * size + r0) * 3 + ch];
        float c101 = data[(((b0 + 1) * size + g0) * size + r0 + 1) * 3 + ch];
        float c011 = data[(((b0 + 1) * size + g0 + 1) * size + r0) * 3 + ch];
        float c111 = data[(((b0 + 1) * size + g0 + 1) * size + r0 + 1) * 3 + ch];
        float c00 = c000 + (c100 - c000) * fr;
        float c10 = c010 + (c110 - c010) * fr;
        float c01 = c001 + (c101 - c001) * fr;
        float c11 = c011 + (c111 - c011) * fr;
        float c0 = c00 + (c10 - c00) * fg;
        float c1 = c01 + (c11 - c01) * fg;
        out[ch] = c0 + (c1 - c0) * fb;
      }
      float ir = ((c >> 16) & 0xFF) / 255f, ig = ((c >> 8) & 0xFF) / 255f, ib = (c & 0xFF) / 255f;
      px[i] = (c & 0xFF000000) | clamp255((ir + (out[0] - ir) * amount) * 255) << 16 | clamp255((ig + (out[1] - ig) * amount) * 255) << 8 | clamp255((ib + (out[2] - ib) * amount) * 255);
    }
  }

  /**
   * Klasik boyama (inpainting): maskelenen (hole[i] = true) pikseller kenardan içeri
   * doğru katman katman komşu bilinen piksellerin ağırlıklı ortalamasıyla doldurulur,
   * ardından doldurulan bölge birkaç kez yumuşatılır. Küçük nesneleri ve lekeleri
   * kaldırmak için uygundur; büyük alanlarda doku üretmez (üretken yapay zekâ değildir).
   */
  public static void inpaint(int[] px, int w, int h, boolean[] hole) {
    boolean[] unknown = hole.clone();
    int remaining = 0;
    for (boolean u : unknown) if (u) remaining++;
    int[] next = new int[px.length];
    int guard = w + h;
    while (remaining > 0 && guard-- > 0) {
      boolean[] filledNow = new boolean[px.length];
      int filled = 0;
      for (int y = 0; y < h; y++) {
        for (int x = 0; x < w; x++) {
          int i = y * w + x;
          if (!unknown[i]) continue;
          float sr = 0, sg = 0, sb = 0, sw = 0;
          for (int dy = -1; dy <= 1; dy++) {
            int yy = y + dy;
            if (yy < 0 || yy >= h) continue;
            for (int dx = -1; dx <= 1; dx++) {
              int xx = x + dx;
              if ((dx == 0 && dy == 0) || xx < 0 || xx >= w) continue;
              int j = yy * w + xx;
              if (unknown[j]) continue;
              float wt = (dx == 0 || dy == 0) ? 1f : 0.7071f;
              int c = px[j];
              sr += wt * ((c >> 16) & 0xFF); sg += wt * ((c >> 8) & 0xFF); sb += wt * (c & 0xFF); sw += wt;
            }
          }
          if (sw > 0) {
            next[i] = (px[i] & 0xFF000000) | clamp255(sr / sw) << 16 | clamp255(sg / sw) << 8 | clamp255(sb / sw);
            filledNow[i] = true;
            filled++;
          }
        }
      }
      if (filled == 0) break;
      for (int i = 0; i < px.length; i++) {
        if (filledNow[i]) {
          px[i] = next[i];
          unknown[i] = false;
        }
      }
      remaining -= filled;
    }
    // Katman izlerini yumuşat: yalnızca doldurulan bölgede komşu ortalaması
    for (int pass = 0; pass < 6; pass++) {
      int[] src = px.clone();
      for (int y = 1; y < h - 1; y++) {
        for (int x = 1; x < w - 1; x++) {
          int i = y * w + x;
          if (!hole[i]) continue;
          float sr = 0, sg = 0, sb = 0;
          for (int dy = -1; dy <= 1; dy++) {
            for (int dx = -1; dx <= 1; dx++) {
              int c = src[i + dy * w + dx];
              sr += (c >> 16) & 0xFF; sg += (c >> 8) & 0xFF; sb += c & 0xFF;
            }
          }
          px[i] = (px[i] & 0xFF000000) | clamp255(sr / 9) << 16 | clamp255(sg / 9) << 8 | clamp255(sb / 9);
        }
      }
    }
  }
}
