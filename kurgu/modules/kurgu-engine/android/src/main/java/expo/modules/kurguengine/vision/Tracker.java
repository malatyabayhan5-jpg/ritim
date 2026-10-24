package expo.modules.kurguengine.vision;

/**
 * Hareket takibi: gri tonlu (parlaklık) karelerde şablon eşleme.
 *
 * İlk karede verilen kutu şablon olur; sonraki her karede önceki konum + hız
 * tahmini çevresindeki arama penceresinde sıfır ortalamalı normalize çapraz
 * korelasyon (ZNCC) 1 piksel adımla aranır, ardından parabolik alt piksel
 * düzeltmesi yapılır.
 * ZNCC parlaklık/karşıtlık değişimlerine dayanıklıdır. Güven yüksekken şablon
 * yavaşça güncellenir (görünüm değişimi); düşükken konum korunur ve "kayıp"
 * bildirilir. Model gerektirmez, cihaz içinde çalışır.
 *
 * Koordinatlar piksel; kutu merkezi ve boyutu. Android'e bağımlı değildir
 * (masaüstü JVM'de tools/anim-test/TrackerTest.java ile sınanır).
 */
public final class Tracker {
  /** Bu güvenin altında kare "kayıp" sayılır ve konum güncellenmez. */
  public static final float LOST = 0.45f;
  private static final float UPDATE = 0.8f;
  private static final float LEARN = 0.12f;

  private final int w;
  private final int h;
  private final int tw;
  private final int th;
  private final float[] tpl;
  private float tplNorm;
  private float cx;
  private float cy;
  private float vx;
  private float vy;
  private int lostRun;

  /**
   * @param frame ilk kare (w*h, satır sıralı, 0..255 işaretsiz bayt)
   * @param boxCx kutu merkezi x (piksel)
   * @param boxW kutu genişliği (piksel; 8..w arasına sıkıştırılır)
   */
  public Tracker(byte[] frame, int w, int h, float boxCx, float boxCy, float boxW, float boxH) {
    this.w = w;
    this.h = h;
    this.tw = clampOdd(Math.round(boxW), 9, Math.max(9, w - 2));
    this.th = clampOdd(Math.round(boxH), 9, Math.max(9, h - 2));
    this.cx = clamp(boxCx, tw / 2f, w - 1 - tw / 2f);
    this.cy = clamp(boxCy, th / 2f, h - 1 - th / 2f);
    this.tpl = new float[tw * th];
    extract(frame, Math.round(cx), Math.round(cy), tpl);
    normalizeTemplate();
  }

  public float x() { return cx; }
  public float y() { return cy; }
  public int templateWidth() { return tw; }
  public int templateHeight() { return th; }

  /** Yeni kareyi işler; dönüş: {merkez x, merkez y, güven 0..1}. */
  public float[] update(byte[] frame) {
    // Kayıp sürdükçe pencere büyür (hızlı hareket / kısa örtülme sonrası yeniden yakalama)
    int grow = Math.min(3, lostRun);
    int rx = Math.max(8, (int) (tw * (0.75f + 0.5f * grow) + Math.abs(vx)));
    int ry = Math.max(8, (int) (th * (0.75f + 0.5f * grow) + Math.abs(vy)));
    int px = Math.round(cx + vx);
    int py = Math.round(cy + vy);
    int hx = tw / 2;
    int hy = th / 2;
    int x0 = Math.max(hx, px - rx);
    int x1 = Math.min(w - 1 - hx, px + rx);
    int y0 = Math.max(hy, py - ry);
    int y1 = Math.min(h - 1 - hy, py + ry);

    // Tam arama (1 px adım): tekrarlayan desenlerde seyrek ızgara gerçek tepeyi
    // atlayıp yan tepeye kilitlenebiliyor (TrackerTest). Pencere küçük (~50×50) ve
    // kareler küçültülmüş (≤ 256 px) olduğundan maliyet düşüktür.
    float best = -2f;
    int bx = Math.round(cx);
    int by = Math.round(cy);
    for (int y = y0; y <= y1; y++) {
      for (int x = x0; x <= x1; x++) {
        float s = score(frame, x, y);
        if (s > best) { best = s; bx = x; by = y; }
      }
    }
    // Alt piksel: komşu skorlara parabol oturtulur
    float sx = bx;
    float sy = by;
    if (bx > x0 && bx < x1) sx += parabola(score(frame, bx - 1, by), best, score(frame, bx + 1, by));
    if (by > y0 && by < y1) sy += parabola(score(frame, bx, by - 1), best, score(frame, bx, by + 1));

    float conf = Math.max(0f, Math.min(1f, best));
    if (conf >= LOST) {
      float nvx = sx - cx;
      float nvy = sy - cy;
      vx = 0.6f * nvx + 0.4f * vx;
      vy = 0.6f * nvy + 0.4f * vy;
      cx = sx;
      cy = sy;
      lostRun = 0;
      if (conf >= UPDATE) learn(frame, bx, by);
    } else {
      lostRun++;
      vx *= 0.5f;
      vy *= 0.5f;
    }
    return new float[] {cx, cy, conf};
  }

  private void learn(byte[] frame, int x, int y) {
    float[] patch = new float[tpl.length];
    extract(frame, x, y, patch);
    // Şablon ortalaması çıkarılmış tutulur; yeni yamanın ortalaması da çıkarılıp karıştırılır
    float m = 0f;
    for (float v : patch) m += v;
    m /= patch.length;
    for (int i = 0; i < tpl.length; i++) tpl[i] = (1f - LEARN) * tpl[i] + LEARN * (patch[i] - m);
    normalizeTemplate();
  }

  private void normalizeTemplate() {
    float m = 0f;
    for (float v : tpl) m += v;
    m /= tpl.length;
    float n = 0f;
    for (int i = 0; i < tpl.length; i++) {
      tpl[i] -= m;
      n += tpl[i] * tpl[i];
    }
    tplNorm = (float) Math.sqrt(n);
  }

  /** (x, y) merkezli pencereyle şablon arasındaki ZNCC (-1..1). Düz bölgede 0. */
  float score(byte[] f, int x, int y) {
    int ox = x - tw / 2;
    int oy = y - th / 2;
    float sum = 0f;
    float sum2 = 0f;
    float dot = 0f;
    int k = 0;
    for (int j = 0; j < th; j++) {
      int row = (oy + j) * w + ox;
      for (int i = 0; i < tw; i++) {
        float v = f[row + i] & 0xFF;
        sum += v;
        sum2 += v * v;
        dot += v * tpl[k++];
      }
    }
    int n = tw * th;
    float var = sum2 - sum * sum / n;
    if (var < 1e-3f || tplNorm < 1e-3f) return 0f;
    // Σ(v-mv)(t) = Σ v t (şablonun ortalaması 0)
    return (float) (dot / (Math.sqrt(var) * tplNorm));
  }

  private void extract(byte[] f, int x, int y, float[] out) {
    int ox = x - tw / 2;
    int oy = y - th / 2;
    int k = 0;
    for (int j = 0; j < th; j++) {
      int row = (oy + j) * w + ox;
      for (int i = 0; i < tw; i++) out[k++] = f[row + i] & 0xFF;
    }
  }

  private static float parabola(float l, float c, float r) {
    float d = l - 2f * c + r;
    if (d >= -1e-6f) return 0f;
    return Math.max(-0.5f, Math.min(0.5f, 0.5f * (l - r) / d));
  }

  private static int clampOdd(int v, int lo, int hi) {
    int c = Math.max(lo, Math.min(hi, v));
    return (c % 2 == 0) ? c - 1 : c;
  }

  private static float clamp(float v, float lo, float hi) {
    return Math.max(lo, Math.min(hi, v));
  }
}
