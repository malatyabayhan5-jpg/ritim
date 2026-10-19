package expo.modules.kurguengine.anim;

import java.text.BreakIterator;
import java.util.ArrayList;
import java.util.List;

/**
 * Metin animasyonlarının saf hesabı (TextLayer.kt kullanır). Android'e bağımlı
 * değildir; CI'da javac ile test edilir (tools/anim-test/TextAnimTest.java).
 *
 * Üç düzey vardır:
 *  - Bütün metin: katman ayarlarıyla (saydamlık, ölçek, kayma, döndürme) çizilir;
 *    bit eşlem yeniden çizilmez, kare başı maliyet yoktur.
 *  - Birim (kelime / harf): önbellekteki yazı bit eşleminden parça parça kopyalanır;
 *    metin yeniden şekillendirilmez, Arapça harf birleşmesi bozulmaz.
 *  - Bulanıklık ve daktilo: yalnızca animasyon penceresinde yeniden çizilir.
 *
 * Giriş ilerlemesi p: 0 → 1. Çıkış ilerlemesi (eski kodla aynı) "kalan" p: 1 → 0.
 * Bütün metin kaymaları NDC (kare yarı boyu) cinsinden, birim kaymaları yazı
 * boyu cinsindendir (y aşağı pozitif).
 */
public final class TextAnim {
  private TextAnim() {}

  public static final int MODE_OVERLAY = 0;
  public static final int MODE_UNITS = 1;
  public static final int MODE_BLUR = 2;
  public static final int MODE_TYPE = 3;

  /** Animasyon anı durumu; birleştirilebilir (saydamlık/ölçek çarpılır, kayma/açı toplanır). */
  public static final class State {
    public float alpha = 1f;
    public float scale = 1f;
    public float dx = 0f;
    public float dy = 0f;
    public float rot = 0f;
    public float blur = 0f;

    public State reset() {
      alpha = 1f;
      scale = 1f;
      dx = 0f;
      dy = 0f;
      rot = 0f;
      blur = 0f;
      return this;
    }
  }

  // --- Sınıflandırma ---

  /** Giriş/çıkış animasyonunun çizim yolu. Bilinmeyen kimlik: katman (etkisiz). */
  public static int mode(String id) {
    if (id == null) return MODE_OVERLAY;
    switch (id) {
      case "wordRise":
      case "letterFade":
      case "wave":
        return MODE_UNITS;
      case "blur":
        return MODE_BLUR;
      case "typewriter":
      case "typeCursor":
        return MODE_TYPE;
      default:
        return MODE_OVERLAY;
    }
  }

  public static int loopMode(String id) {
    return "waveLoop".equals(id) ? MODE_UNITS : MODE_OVERLAY;
  }

  /** Birim animasyonu kelime mi istiyor (aksi halde harf; karmaşık yazıda yine kelime). */
  public static boolean wantsWords(String id) {
    return "wordRise".equals(id);
  }

  /** Animasyon penceresinin animMs'e oranı. */
  public static int windowFactor(String id) {
    if (id == null) return 1;
    switch (id) {
      case "typewriter":
      case "typeCursor":
        return 3;
      case "wordRise":
      case "letterFade":
      case "wave":
        return 2;
      default:
        return 1;
    }
  }

  /**
   * Giriş ve çıkış pencereleri (ms). Eski animasyonlar eski hesabı aynen korur
   * (pencere animMs; daktilo en çok metin süresi). İkisi de uzun pencereliyse ve
   * süreye sığmıyorsa orantılı kısaltılır.
   */
  public static long[] windows(String in, String out, long animMs, long durMs) {
    long a = Math.max(1L, animMs);
    long d = Math.max(1L, durMs);
    int fi = windowFactor(in);
    int fo = windowFactor(out);
    long wi = fi > 1 ? Math.min(a * fi, d) : a;
    long wo = fo > 1 ? Math.min(a * fo, d) : a;
    if (fi > 1 && fo > 1 && wi + wo > d) {
      double k = (double) d / (wi + wo);
      wi = Math.max(1L, (long) Math.floor(wi * k));
      wo = Math.max(1L, (long) Math.floor(wo * k));
    }
    return new long[] {wi, wo};
  }

  // --- Yumuşatma işlevleri ---

  public static float clamp01(float x) {
    return x < 0f ? 0f : (x > 1f ? 1f : x);
  }

  public static float easeOut(float x) {
    return 1f - (1f - x) * (1f - x);
  }

  public static float easeOutCubic(float x) {
    float u = 1f - x;
    return 1f - u * u * u;
  }

  public static float easeInCubic(float x) {
    return x * x * x;
  }

  public static float smoothstep(float x) {
    x = clamp01(x);
    return x * x * (3f - 2f * x);
  }

  public static float easeOutBack(float x) {
    float c1 = 1.70158f;
    float c3 = c1 + 1f;
    float t = x - 1f;
    return 1f + c3 * t * t * t + c1 * t * t;
  }

  public static float easeInBack(float x) {
    float c1 = 1.70158f;
    float c3 = c1 + 1f;
    return c3 * x * x * x - c1 * x * x;
  }

  public static float elasticOut(float x) {
    if (x <= 0f) return 0f;
    if (x >= 1f) return 1f;
    double c4 = (2 * Math.PI) / 3;
    return (float) (Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * c4) + 1);
  }

  public static float bounceOut(float x) {
    float n1 = 7.5625f;
    float d1 = 2.75f;
    if (x < 1f / d1) return n1 * x * x;
    if (x < 2f / d1) {
      x -= 1.5f / d1;
      return n1 * x * x + 0.75f;
    }
    if (x < 2.5f / d1) {
      x -= 2.25f / d1;
      return n1 * x * x + 0.9375f;
    }
    x -= 2.625f / d1;
    return n1 * x * x + 0.984375f;
  }

  // Neon tabela yanıp sönmesi: sabit desen (rastgelelik yok, önizleme = dışa aktarma).
  private static final float[] FLICKER = {0f, .8f, 0f, 0f, 1f, .15f, 0f, .9f, .3f, 1f, .5f, 1f, 1f, .7f, 1f, 1f};
  private static final float[] BUZZ = {1f, .25f, 1f, 1f, .1f, .65f, 1f, .35f};

  public static float flicker(float p) {
    if (p >= 1f) return 1f;
    if (p <= 0f) return 0f;
    return FLICKER[Math.min(FLICKER.length - 1, (int) (p * FLICKER.length))];
  }

  private static float wrap(float x, float period) {
    float r = x % period;
    return r < 0 ? r + period : r;
  }

  private static final float TAU = (float) (Math.PI * 2);

  // --- Bütün metin ---

  public static void applyIn(String id, float p, State s) {
    if (id == null) return;
    p = clamp01(p);
    switch (id) {
      case "fade":
        s.alpha *= p;
        break;
      case "pop":
        s.scale *= 0.6f + 0.4f * easeOutBack(p);
        s.alpha *= Math.min(1f, p * 2f);
        break;
      case "slideUp":
        s.dy -= 0.2f * (1f - easeOut(p));
        s.alpha *= p;
        break;
      case "slideLeft":
        s.dx += 0.3f * (1f - easeOut(p));
        s.alpha *= p;
        break;
      case "slideDown":
        s.dy += 0.2f * (1f - easeOut(p));
        s.alpha *= p;
        break;
      case "slideRight":
        s.dx -= 0.3f * (1f - easeOut(p));
        s.alpha *= p;
        break;
      case "zoomIn":
        s.scale *= 0.3f + 0.7f * easeOutCubic(p);
        s.alpha *= p;
        break;
      case "zoomOut":
        s.scale *= 1f + 0.8f * (1f - easeOutCubic(p));
        s.alpha *= p;
        break;
      case "rotate":
        s.rot -= 100f * (1f - easeOutCubic(p));
        s.scale *= 0.4f + 0.6f * easeOutBack(p);
        s.alpha *= Math.min(1f, p * 2f);
        break;
      case "bounce":
        s.dy += 0.3f * (1f - bounceOut(p));
        s.alpha *= Math.min(1f, p * 5f);
        break;
      case "elastic":
        s.scale *= Math.max(0.01f, elasticOut(p));
        s.alpha *= Math.min(1f, p * 4f);
        break;
      case "blur":
        s.blur = Math.max(s.blur, 1f - easeOut(p));
        s.alpha *= Math.min(1f, p * 1.5f);
        break;
      case "flicker":
        s.alpha *= flicker(p);
        break;
      case "shake":
        s.dx += 0.035f * (float) Math.sin(TAU * 3.5f * p) * (1f - p);
        s.alpha *= Math.min(1f, p * 4f);
        break;
      default:
        break;
    }
  }

  public static void applyOut(String id, float p, State s) {
    if (id == null) return;
    p = clamp01(p);
    float q = 1f - p; // çıkışın ilerlemesi
    switch (id) {
      case "fade":
        s.alpha *= p;
        break;
      case "pop":
        s.scale *= 0.6f + 0.4f * p;
        s.alpha *= p;
        break;
      case "slideUp":
        s.dy += 0.2f * (1f - easeOut(p));
        s.alpha *= p;
        break;
      case "slideLeft":
        s.dx -= 0.3f * (1f - easeOut(p));
        s.alpha *= p;
        break;
      case "slideDown":
        s.dy -= 0.2f * (1f - easeOut(p));
        s.alpha *= p;
        break;
      case "slideRight":
        s.dx += 0.3f * (1f - easeOut(p));
        s.alpha *= p;
        break;
      case "zoomIn":
        s.scale *= 1f + 0.8f * easeInCubic(q);
        s.alpha *= p;
        break;
      case "zoomOut":
        s.scale *= 1f - 0.7f * easeInCubic(q);
        s.alpha *= p;
        break;
      case "rotate":
        s.rot += 100f * easeInCubic(q);
        s.scale *= 1f - 0.6f * easeInCubic(q);
        s.alpha *= p;
        break;
      case "bounce":
        // Önce küçük bir sıçrama, sonra aşağı düşüş
        s.dy -= 0.35f * easeInBack(q);
        s.alpha *= Math.min(1f, p * 2.5f);
        break;
      case "elastic":
        s.scale *= Math.max(0.01f, 1f - easeInBack(q));
        s.alpha *= Math.min(1f, p * 4f);
        break;
      case "blur":
        s.blur = Math.max(s.blur, 1f - easeOut(p));
        s.alpha *= Math.min(1f, p * 1.5f);
        break;
      case "flicker":
        s.alpha *= flicker(p);
        break;
      case "shake":
        s.dx += 0.035f * (float) Math.sin(TAU * 3.5f * q) * q;
        s.alpha *= Math.min(1f, p * 3f);
        break;
      default:
        break;
    }
  }

  /** Sürekli (döngü) animasyonlar; tSec metnin başından beri geçen süre. */
  public static void applyLoop(String id, float tSec, State s) {
    if (id == null) return;
    switch (id) {
      case "pulse":
        s.scale *= 1f + 0.06f * (0.5f - 0.5f * (float) Math.cos(TAU * tSec / 1.2f));
        break;
      case "float":
        s.dy += 0.015f * (float) Math.sin(TAU * tSec / 2.4f);
        break;
      case "swing":
        s.rot += 5f * (float) Math.sin(TAU * tSec / 2.2f);
        break;
      case "buzz": {
        float ph = wrap(tSec + 1.6f, 3.2f);
        if (ph < 0.32f) s.alpha *= BUZZ[Math.min(BUZZ.length - 1, (int) (ph / 0.04f))];
        break;
      }
      default:
        break;
    }
  }

  // --- Birim (kelime / harf) ---

  /** Sıralı gecikme: i. birimin yerel ilerlemesi. spread, pencerenin gecikmeye ayrılan payı. */
  public static float stagger(float p, int i, int n, float spread) {
    if (n <= 1) return clamp01(p);
    float start = spread * i / (n - 1);
    return clamp01((p - start) / (1f - spread));
  }

  /** Birimin alt katmanı (kutu, süs) saydamlığı: giriş/çıkış birim animasyonlarında yumuşak belirir. */
  public static float baseAlpha(float p) {
    return smoothstep(Math.min(1f, clamp01(p) * 2.5f));
  }

  public static void unitIn(String id, float p, int i, int n, State s) {
    if (id == null) return;
    p = clamp01(p);
    switch (id) {
      case "wordRise": {
        float l = stagger(p, i, n, 0.55f);
        s.dy += 0.55f * (1f - easeOutCubic(l));
        s.alpha *= smoothstep(l * 1.6f);
        break;
      }
      case "letterFade": {
        float l = stagger(p, i, n, 0.75f);
        s.alpha *= smoothstep(l);
        break;
      }
      case "wave": {
        float l = stagger(p, i, n, 0.6f);
        s.dy += 0.8f * (1f - easeOutBack(l));
        s.alpha *= Math.min(1f, l * 3f);
        break;
      }
      default:
        break;
    }
  }

  public static void unitOut(String id, float p, int i, int n, State s) {
    if (id == null) return;
    float q = 1f - clamp01(p);
    switch (id) {
      case "wordRise": {
        float l = stagger(q, i, n, 0.55f);
        s.dy -= 0.45f * easeInCubic(l);
        s.alpha *= 1f - smoothstep(l);
        break;
      }
      case "letterFade": {
        float l = stagger(q, i, n, 0.75f);
        s.alpha *= 1f - smoothstep(l);
        break;
      }
      case "wave": {
        float l = stagger(q, i, n, 0.6f);
        s.dy += 0.8f * easeInBack(l);
        s.alpha *= clamp01((1f - l) * 2.5f);
        break;
      }
      default:
        break;
    }
  }

  public static void unitLoop(String id, float tSec, int i, State s) {
    if ("waveLoop".equals(id)) {
      s.dy -= 0.14f * (float) Math.sin(TAU * tSec / 1.4f - i * 0.5f);
    }
  }

  /** Birim animasyonlarının en büyük dikey/yatay taşması (yazı boyu cinsinden), kenar payı için. */
  public static float unitMarginY() {
    return 0.95f;
  }

  public static float unitMarginX() {
    return 0.25f;
  }

  /** Bulanıklık yarıçapı (yazı boyu cinsinden, blur = 1 iken). */
  public static float blurRadius() {
    return 0.35f;
  }

  // --- Daktilo ---

  /** Görünen grafem sayısı (giriş: p 0 → 1, çıkış: kalan p 1 → 0; ikisi de aynı formül). */
  public static int typedCount(float p, int n) {
    int c = (int) Math.ceil(n * clamp01(p));
    return Math.max(0, Math.min(n, c));
  }

  /** İmleç yanıp sönmesi: 530 ms açık / 530 ms kapalı; yazarken hep açık. */
  public static boolean cursorOn(long msSinceStart, boolean typing) {
    if (typing) return true;
    return (Math.max(0L, msSinceStart) / 530L) % 2L == 0L;
  }

  // --- Bölütleme ---

  /** Harf harf canlandırmanın şekillendirmeyi bozabileceği yazılar (sağdan sola, birleşen, Hint vb.). */
  public static boolean isComplexScript(CharSequence text) {
    int i = 0;
    int n = text.length();
    while (i < n) {
      int cp = Character.codePointAt(text, i);
      i += Character.charCount(cp);
      byte dir = Character.getDirectionality(cp);
      if (dir == Character.DIRECTIONALITY_RIGHT_TO_LEFT
          || dir == Character.DIRECTIONALITY_RIGHT_TO_LEFT_ARABIC
          || dir == Character.DIRECTIONALITY_RIGHT_TO_LEFT_EMBEDDING
          || dir == Character.DIRECTIONALITY_RIGHT_TO_LEFT_OVERRIDE) {
        return true;
      }
      int type = Character.getType(cp);
      if (type == Character.NON_SPACING_MARK || type == Character.COMBINING_SPACING_MARK || type == Character.ENCLOSING_MARK) {
        return true;
      }
      if ((cp >= 0x0590 && cp <= 0x08FF) // İbranice, Arapça, Süryanice, Thaana, N'Ko ...
          || (cp >= 0x0900 && cp <= 0x109F) // Hint yazıları, Tay, Lao, Tibet, Myanmar
          || (cp >= 0x1780 && cp <= 0x18AF) // Khmer, Moğol
          || (cp >= 0xA8E0 && cp <= 0xA9FF)
          || (cp >= 0xFB1D && cp <= 0xFDFF)
          || (cp >= 0xFE70 && cp <= 0xFEFF)
          || cp == 0x200C) {
        return true;
      }
    }
    return false;
  }

  /** Grafem sınırları: [0, b1, b2, ..., n]. */
  public static int[] graphemeBounds(String text) {
    List<Integer> out = new ArrayList<>();
    out.add(0);
    if (!text.isEmpty()) {
      BreakIterator it = BreakIterator.getCharacterInstance();
      it.setText(text);
      int b = it.next();
      while (b != BreakIterator.DONE) {
        if (b > out.get(out.size() - 1)) out.add(b);
        b = it.next();
      }
      if (out.get(out.size() - 1) != text.length()) out.add(text.length());
    }
    int[] r = new int[out.size()];
    for (int i = 0; i < r.length; i++) r[i] = out.get(i);
    return r;
  }

  private static boolean isBlank(String text, int s, int e) {
    for (int i = s; i < e; ) {
      int cp = text.codePointAt(i);
      if (!Character.isWhitespace(cp) && !Character.isSpaceChar(cp)) return false;
      i += Character.charCount(cp);
    }
    return true;
  }

  /**
   * Canlandırma birimleri: [s0, e0, s1, e1, ...] (boşluklar hariç). Kelime
   * istenirse veya yazı karmaşıksa kelimeler, aksi halde grafemler (harfler).
   */
  public static int[] units(String text, boolean words) {
    List<Integer> out = new ArrayList<>();
    if (words || isComplexScript(text)) {
      int i = 0;
      int n = text.length();
      while (i < n) {
        while (i < n && isBlank(text, i, i + Character.charCount(text.codePointAt(i)))) i += Character.charCount(text.codePointAt(i));
        if (i >= n) break;
        int s = i;
        while (i < n && !isBlank(text, i, i + Character.charCount(text.codePointAt(i)))) i += Character.charCount(text.codePointAt(i));
        out.add(s);
        out.add(i);
      }
    } else {
      int[] b = graphemeBounds(text);
      for (int k = 0; k + 1 < b.length; k++) {
        if (isBlank(text, b[k], b[k + 1])) continue;
        out.add(b[k]);
        out.add(b[k + 1]);
      }
    }
    int[] r = new int[out.size()];
    for (int i = 0; i < r.length; i++) r[i] = out.get(i);
    return r;
  }
}
