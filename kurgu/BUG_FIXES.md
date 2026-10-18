# Kurgu — Hata düzeltme kaydı

Her kayıt: **yeniden üretme → kök neden → düzeltme → test → regresyon kontrolü**.
Bulgu numaraları `AUDIT_REPORT.md` ile aynıdır. Tarih: 2026-10-18.

Ortak regresyon kontrolü (her düzeltmeden sonra): `npm test` (birim testleri),
`npm run i18n:check` (çeviri kapsamı ve sabit metin taraması), Metro paketleme
(`npx expo export --platform android`) ve CI'da APK derleme + emülatör kabul
akışı (`e2e/1_kabul_akisi.yaml`, `e2e/2_dil_rtl.yaml`).

---

## K1 — Efektler basit renk varyasyonlarıydı

- **Yeniden üretme:** Efekt panelindeki 12 efektin 8'i aynı "süper shader"ın
  (`FxShaderProgram`) farklı uniform değerleri; ışık/parlama, bulanıklık türleri,
  bozulma, parçacık gibi temel efekt aileleri yoktu.
- **Kök neden:** Efektler tek bir sabit shader içine gömülü birkaç parametreyle
  tasarlanmıştı; yeni efekt eklemek Kotlin kodunu değiştirmeyi gerektiriyordu.
- **Düzeltme:** Veri güdümlü GPU efekt motoru:
  - `assets/kurgu_fx/*.glsl`: her efekt ayrı GLSL ES 1.00 dosyası, ortak çekirdek
    (`_common.glsl`: gürültü, hash, karışım modları) ve ortak giriş (`_main.glsl`).
  - `ShaderFx.kt`: dosyayı assets'ten okuyup Media3 `GlEffect` olarak çalıştırır;
    zaman penceresi, 80 ms yumuşak giriş/çıkış, kararlı rastgele tohum.
  - `src/model/fx-catalog.json` + `effects.js`: merkezi katalog (kimlik, shader,
    kategori, parametreler/varsayılanlar/sınırlar, performans sınıfı, lisans,
    platform, ücret katmanı).
  - 21 özgün efekt; her biri çok aşamalı (ör. parıltı: parlak alan çıkarma +
    altın açılı çok halkalı hâle; anamorfik: nokta ışık tespiti + yatay çizgi;
    VHS: YIQ renk taşması + takip bandı + kafa paraziti).
- **Test:** `tests/effects.test.mjs` (katalog bütünlüğü, her shader dosyasının
  varlığı ve `fx(vec2)` girişi, parametre sınırları, küçük resim varlığı, üç dilde
  ad/açıklama/parametre etiketi). Görsel QA: `tools/fx-lab` ile 4 farklı sahnede
  (gün batımı, gece şehir, portre, grafik) düşük/yüksek yoğunluk; 30 karelik
  zamansal akıcılık ölçümü (kareler arası fark oranı 1,0–2,3: sıçrama yok).
  Emülatörde dışa aktarılan MP4'te efekt katmanının izi otomatik aranır
  (`e2e/fx_check.py`).
- **Regresyon:** Eski `FxEffect` yolu korunuyor; eski projelerdeki karşılığı olan
  efektler yeni yığına taşınıyor (aşağıda K2).

## K2 — Klip başına tek efekt, efekt izi yok

- **Yeniden üretme:** Bir klibe ikinci efekt seçmek birincisini siliyordu; efektin
  başlangıç/bitişi ayarlanamıyordu.
- **Kök neden:** Veri modelinde `clip.fx` tek nesne.
- **Düzeltme:** `clip.effects[]` yığını (en fazla 4, sınırda kullanıcıya bildirim)
  ve projede `effectLayers[]` — zaman çizelgesinde ayrı mor şerit; taşıma, kırpma,
  bölme, çoğaltma, silme, değiştirme, yoğunluk/parametre ayarı. Render tanımı
  klip efektine klibin zaman penceresini, katmana kendi aralığını (toplam süreye
  kırpılmış) verir. Eski `clip.fx` değerleri (glitch, rgbSplit, vhs, oldFilm,
  pixelate, mosaic, dream) `migrateProject` içinde yığına taşınır; taşıma
  idempotenttir.
- **Test:** Yığın sınırı, değer birleştirme, kaldırma; katman kırp/böl/çoğalt/sil;
  render penceresi; kaydet → JSON → aç sonrası aynı render tanımı ve tohum;
  eski efekt taşıma; geri al/yinele (`tests/effects.test.mjs`, 12 test). E2E:
  ana araç çubuğundan efekt katmanı (çift ton) + ilk klibe parıltı, uygulama
  kapatılıp açıldıktan sonra efekt şeridinin hâlâ görünmesi.
- **Regresyon:** Mevcut 34 test değişmeden geçiyor.

## K3 — HDR kaynaklarda renk tutarsızlığı

- **Yeniden üretme (kod incelemesi):** `Composition.Builder` HDR modu belirtmiyordu
  (varsayılan: HDR'yi koru). Efekt shader'ları 0–1 SDR aralığı varsayıyor, H.264
  çıktısı HDR taşımıyor.
- **Kök neden:** `setHdrMode` çağrısı eksik.
- **Düzeltme:** `HDR_MODE_TONE_MAP_HDR_TO_SDR_USING_OPEN_GL`; önizleme ve dışa
  aktarma aynı SDR renk uzayında çalışır.
- **Test:** Emülatörde HDR kaynak yok; gerçek HDR (HLG/PQ) cihaz videosuyla test
  **yapılamadı** — bekleyen doğrulama olarak `PROGRESS.md`'de işaretli.

## Y1 — Geri al, iki ayrı ayarı tek adımda birleştiriyordu

- **Yeniden üretme:** A klibinin hız kaydırıcısı bırakılıp saniyeler sonra aynı
  anahtarla bir ayar daha yapıldığında tek geri al ikisini birden geri alıyordu.
- **Kök neden:** `pushHistory` yalnızca birleştirme anahtarının eşitliğine bakıyordu.
- **Düzeltme:** Birleştirme yalnızca aynı anahtar **ve** son değişiklikten bu yana
  en fazla 800 ms (`COALESCE_MS`) geçtiyse yapılır.
- **Test:** `aynı anahtarlı değişiklikler yalnızca kısa süre içinde birleşir`,
  `geri al / yinele efekt ekleme ve parametre değişikliğini geri alır`.

## Y2 — Uygulama içi dışa aktarma kopyaları birikiyordu

- **Kök neden:** Galeriye kaydedilen videonun uygulama içi kopyası yalnızca
  "önbelleği temizle" ile siliniyordu.
- **Düzeltme:** `pruneExports(2)`: her yeni dışa aktarmadan önce uygulama içi
  `.mp4` kopyalarının en yeni 2'si dışındakiler silinir (yeni çıktıyla birlikte en
  fazla 3). Proje paketleri (`.kurgu.json`) etkilenmez. Galerideki kopyaya
  dokunulmaz.
- **Test:** Emülatör akışında dışa aktarma sonrası galeri kopyası ve sonuç
  ekranındaki paylaşım/denetim adımları; cihazda çoklu dışa aktarma sayımı için
  ayrı otomatik test **yok** (dosya sistemi yerel modül gerektiriyor).

## Y3 — Efekt küçük resimleri yoktu

- **Düzeltme:** `tools/fx-lab/make-thumbs.sh` her katalog efektini aynı özgün test
  sahnesine gerçek shader ile uygular, 144 px JPEG üretir (`assets/fx/`, toplam
  ~100 KB) ve `src/model/fxThumbs.js` eşlemesini yazar. Küçük resimler uygulamanın
  çalıştırdığı GLSL kodunun gerçek çıktısıdır, el çizimi değildir.
- **Test:** Katalog testi her efekt için küçük resim dosyasının varlığını denetler.

## Y4 — Yeniden bağlama/değiştirme hatası sessizdi

- **Düzeltme:** `relink` ve `replace` hata yolunda `errors.generic` bildirimi.
  Kullanıcının seçiciyi iptal etmesi hata sayılmaz (seçici boş liste döndürür).

## Y5 — Taşan zaman çizelgesi şeritleri erişilemezdi

- **Yeniden üretme:** Ses ayır + müzik + metin + efekt katmanı eklenince (4+ şerit)
  alttaki şeritler 210 px'lik alanın dışında kalıyor, seçilemiyordu.
- **Düzeltme:** Yatay zaman ekseni dikey bir `ScrollView` içine alındı
  (`nestedScrollEnabled`); kırpma/sürükleme sırasında her iki kaydırma kilitlenir.
- **Test:** E2E akışı yeniden açılıştan sonra efekt şeridini arar (4 şerit + ana iz).

## O1 — Android 13+ bildirim izni istenmiyordu

- **Düzeltme:** Dışa aktarma başlamadan önce `POST_NOTIFICATIONS` izni (yoksa)
  istenir. Reddedilirse dışa aktarma yine çalışır; yalnızca bildirim görünmez.
