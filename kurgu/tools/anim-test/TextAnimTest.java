import expo.modules.kurguengine.anim.TextAnim;

/**
 * TextAnim.java denetimi: eski animasyonlar eski formülle birebir aynı; yeni
 * animasyonlar pencere sonunda nötr (zıplama yok), başında görünmez; değerler
 * sınırlı; bölütleme (harf/kelime, Arapça yedeği, emoji) doğru.
 */
public class TextAnimTest {
  static int checks = 0;

  static void ok(boolean c, String msg) {
    checks++;
    if (!c) {
      System.out.println("HATA: " + msg);
      System.exit(1);
    }
  }

  static boolean near(float a, float b) {
    return Math.abs(a - b) < 1e-4f;
  }

  static boolean neutral(TextAnim.State s) {
    return near(s.alpha, 1f) && near(s.scale, 1f) && near(s.dx, 0f) && near(s.dy, 0f) && near(s.rot, 0f) && s.blur < 1e-4f;
  }

  static boolean sane(TextAnim.State s) {
    return !Float.isNaN(s.alpha + s.scale + s.dx + s.dy + s.rot + s.blur)
        && s.alpha >= -1e-4f && s.alpha <= 1.0001f
        && s.scale >= 0.0099f && s.scale <= 3f
        && Math.abs(s.dx) <= 1f && Math.abs(s.dy) <= 1.2f && Math.abs(s.rot) <= 180f
        && s.blur >= 0f && s.blur <= 1.0001f;
  }

  // Eski TextLayer.kt hesabı (değişmemeli)
  static float easeOut(float x) {
    return 1f - (1f - x) * (1f - x);
  }

  static float easeOutBack(float x) {
    float c1 = 1.70158f;
    float c3 = c1 + 1f;
    float t = x - 1f;
    return 1f + c3 * t * t * t + c1 * t * t;
  }

  static final String[] OVERLAY = {"slideDown", "slideRight", "zoomIn", "zoomOut", "rotate", "bounce", "elastic", "blur", "flicker", "shake"};
  static final String[] UNITS = {"wordRise", "letterFade", "wave"};
  static final String[] LOOPS = {"pulse", "float", "swing", "buzz"};

  public static void main(String[] args) {
    // 1) Eski animasyonlar birebir
    for (int k = 0; k <= 100; k++) {
      float p = k / 100f;
      TextAnim.State s = new TextAnim.State();
      TextAnim.applyIn("fade", p, s);
      ok(near(s.alpha, p), "fade giriş");
      s.reset();
      TextAnim.applyIn("pop", p, s);
      ok(near(s.scale, 0.6f + 0.4f * easeOutBack(p)) && near(s.alpha, Math.min(1f, p * 2f)), "pop giriş");
      s.reset();
      TextAnim.applyIn("slideUp", p, s);
      ok(near(s.dy, -0.2f * (1f - easeOut(p))) && near(s.alpha, p), "slideUp giriş");
      s.reset();
      TextAnim.applyIn("slideLeft", p, s);
      ok(near(s.dx, 0.3f * (1f - easeOut(p))) && near(s.alpha, p), "slideLeft giriş");
      s.reset();
      TextAnim.applyOut("fade", p, s);
      ok(near(s.alpha, p), "fade çıkış");
      s.reset();
      TextAnim.applyOut("pop", p, s);
      ok(near(s.scale, 0.6f + 0.4f * p) && near(s.alpha, p), "pop çıkış");
      s.reset();
      TextAnim.applyOut("slideUp", p, s);
      ok(near(s.dy, 0.2f * (1f - easeOut(p))) && near(s.alpha, p), "slideUp çıkış");
      s.reset();
      TextAnim.applyOut("slideLeft", p, s);
      ok(near(s.dx, -0.3f * (1f - easeOut(p))) && near(s.alpha, p), "slideLeft çıkış");
      s.reset();
      TextAnim.applyIn("typewriter", p, s);
      TextAnim.applyIn("none", p, s);
      TextAnim.applyOut("none", p, s);
      ok(neutral(s), "daktilo/yok katmanı değiştirmez");
    }
    long[] w = TextAnim.windows("fade", "fade", 400, 3000);
    ok(w[0] == 400 && w[1] == 400, "eski pencere animMs");
    w = TextAnim.windows("typewriter", "fade", 400, 3000);
    ok(w[0] == 1200 && w[1] == 400, "daktilo penceresi 3x");
    w = TextAnim.windows("typewriter", "fade", 400, 700);
    ok(w[0] == 700 && w[1] == 400, "daktilo en çok metin süresi (eski hesap)");
    w = TextAnim.windows("typeCursor", "letterFade", 400, 1000);
    ok(w[0] + w[1] <= 1000 && w[0] > w[1], "iki uzun pencere süreye sığar");
    w = TextAnim.windows("pop", "fade", 0, 1000);
    ok(w[0] == 1 && w[1] == 1, "sıfır süre korunur");

    // 2) Bütün metin: sonda nötr, başta görünmez, arada sınırlı
    for (String id : OVERLAY) {
      TextAnim.State s = new TextAnim.State();
      TextAnim.applyIn(id, 1f, s);
      ok(neutral(s), id + ": giriş sonunda nötr");
      s.reset();
      TextAnim.applyOut(id, 1f, s);
      ok(neutral(s), id + ": çıkış başında nötr");
      s.reset();
      TextAnim.applyIn(id, 0f, s);
      ok(s.alpha < 1e-4f, id + ": giriş başında görünmez");
      s.reset();
      TextAnim.applyOut(id, 0f, s);
      ok(s.alpha < 1e-4f, id + ": çıkış sonunda görünmez");
      ok(TextAnim.mode(id) == (id.equals("blur") ? TextAnim.MODE_BLUR : TextAnim.MODE_OVERLAY), id + ": çizim yolu");
      for (int k = 0; k <= 200; k++) {
        float p = k / 200f;
        s.reset();
        TextAnim.applyIn(id, p, s);
        ok(sane(s), id + ": giriş değerleri sınırlı p=" + p);
        s.reset();
        TextAnim.applyOut(id, p, s);
        ok(sane(s), id + ": çıkış değerleri sınırlı p=" + p);
      }
    }
    // Bulanıklık azalarak biter
    TextAnim.State b = new TextAnim.State();
    TextAnim.applyIn("blur", 0.2f, b);
    float b1 = b.blur;
    b.reset();
    TextAnim.applyIn("blur", 0.7f, b);
    ok(b1 > b.blur && b.blur > 0f, "blur azalır");

    // 3) Birimler
    for (String id : UNITS) {
      ok(TextAnim.mode(id) == TextAnim.MODE_UNITS, id + ": birim yolu");
      int n = 12;
      for (int i = 0; i < n; i++) {
        TextAnim.State s = new TextAnim.State();
        TextAnim.unitIn(id, 1f, i, n, s);
        ok(neutral(s), id + ": birim girişi sonunda nötr i=" + i);
        s.reset();
        TextAnim.unitOut(id, 1f, i, n, s);
        ok(neutral(s), id + ": birim çıkışı başında nötr i=" + i);
        s.reset();
        TextAnim.unitIn(id, 0f, i, n, s);
        ok(s.alpha < 1e-4f, id + ": birim başta görünmez");
        s.reset();
        TextAnim.unitOut(id, 0f, i, n, s);
        ok(s.alpha < 1e-4f, id + ": birim sonda görünmez");
        for (int k = 0; k <= 100; k++) {
          s.reset();
          TextAnim.unitIn(id, k / 100f, i, n, s);
          ok(sane(s) && Math.abs(s.dy) <= TextAnim.unitMarginY(), id + ": birim kayması kenar payında");
          s.reset();
          TextAnim.unitOut(id, k / 100f, i, n, s);
          ok(sane(s) && Math.abs(s.dy) <= TextAnim.unitMarginY(), id + ": birim çıkış kayması kenar payında");
        }
      }
      // Sıralı: ilk birim sondakinden önce görünür
      TextAnim.State a = new TextAnim.State();
      TextAnim.State z = new TextAnim.State();
      TextAnim.unitIn(id, 0.3f, 0, n, a);
      TextAnim.unitIn(id, 0.3f, n - 1, n, z);
      ok(a.alpha > z.alpha, id + ": sıralı gecikme");
    }
    ok(TextAnim.wantsWords("wordRise") && !TextAnim.wantsWords("letterFade") && !TextAnim.wantsWords("wave"), "kelime/harf seçimi");

    // 4) Döngüler: t=0'da nötr, sınırlı
    for (String id : LOOPS) {
      TextAnim.State s = new TextAnim.State();
      TextAnim.applyLoop(id, 0f, s);
      ok(neutral(s), id + ": döngü başında nötr");
      for (int k = 0; k <= 400; k++) {
        s.reset();
        TextAnim.applyLoop(id, k * 0.025f, s);
        ok(sane(s) && s.scale <= 1.07f && Math.abs(s.rot) <= 6f && Math.abs(s.dy) <= 0.02f, id + ": döngü sınırlı");
      }
    }
    ok(TextAnim.loopMode("waveLoop") == TextAnim.MODE_UNITS && TextAnim.loopMode("pulse") == TextAnim.MODE_OVERLAY, "döngü çizim yolu");
    for (int k = 0; k <= 100; k++) {
      TextAnim.State s = new TextAnim.State();
      TextAnim.unitLoop("waveLoop", k * 0.05f, k % 7, s);
      ok(sane(s) && Math.abs(s.dy) <= TextAnim.unitMarginY(), "waveLoop sınırlı");
    }

    // 5) Daktilo
    ok(TextAnim.mode("typewriter") == TextAnim.MODE_TYPE && TextAnim.mode("typeCursor") == TextAnim.MODE_TYPE, "daktilo yolu");
    ok(TextAnim.typedCount(0f, 10) == 0 && TextAnim.typedCount(1f, 10) == 10 && TextAnim.typedCount(0.01f, 10) == 1, "daktilo sayısı");
    ok(TextAnim.cursorOn(5000, true) && TextAnim.cursorOn(0, false) && !TextAnim.cursorOn(600, false), "imleç");

    // 6) Bölütleme
    int[] u = TextAnim.units("Merhaba dünya", false);
    ok(u.length / 2 == 12, "Latin harf birimleri: " + u.length / 2);
    u = TextAnim.units("Merhaba  dünya\nnasılsın", true);
    ok(u.length / 2 == 3 && u[0] == 0 && u[1] == 7 && u[2] == 9 && u[3] == 14, "kelime birimleri");
    ok(TextAnim.isComplexScript("مرحبا بالعالم") && TextAnim.isComplexScript("שלום") && TextAnim.isComplexScript("नमस्ते"), "karmaşık yazı algısı");
    ok(!TextAnim.isComplexScript("Çağrı İŞ ğüşiöç 123 👍"), "Türkçe ve emoji karmaşık değil");
    u = TextAnim.units("مرحبا بالعالم", false);
    ok(u.length / 2 == 2, "Arapçada harf yerine kelime");
    u = TextAnim.units("éte", false);
    ok(u.length / 2 == 1, "birleşen işaretlerde kelime");
    u = TextAnim.units("a👍b", false);
    ok(u.length / 2 == 3 && u[2] == 1 && u[3] == 3, "emoji tek birim");
    int[] g = TextAnim.graphemeBounds("a👍b");
    ok(g.length == 4 && g[0] == 0 && g[3] == 4, "grafem sınırları");
    ok(TextAnim.graphemeBounds("").length == 1, "boş metin");
    ok(TextAnim.units("   ", false).length == 0 && TextAnim.units("", true).length == 0, "boş birimler");

    System.out.println("Metin animasyonu testleri geçti: " + checks + " denetim");
  }
}
