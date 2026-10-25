# Kurgu — Mimari ve teknoloji kararları

Kurgu, mobil öncelikli, çok katmanlı bir video düzenleyicidir. Bu belge, hangi
teknolojinin neden seçildiğini, nelerin bilinçli olarak ertelendiğini ve
masaüstü sürümüne nasıl hazırlanıldığını açıklar.

## 1. Katmanlar

```
┌──────────────────────────── React Native (Expo SDK 54) ────────────────────────────┐
│  Ekranlar (src/screens)   Editör (src/editor)   Ortak UI (src/ui)   i18n (src/i18n)│
│        │                         │                                                 │
│        ▼                         ▼                                                 │
│  Proje modeli (src/model)  ── saf JS, platformdan bağımsız, birim testli ──        │
│        │  buildRenderSpec()  (src/engine/renderSpec.js)                            │
│        ▼                                                                           │
│  Düz render tanımı (JSON) ─────────────────────────────────────────────┐           │
└────────────────────────────────────────────────────────────────────────┼───────────┘
                                                                         ▼
┌──────────────── Yerel motor: modules/kurgu-engine (Kotlin, AndroidX Media3) ───────┐
│  RenderSpec.kt → CompositionFactory.kt → Media3 Composition                        │
│        ├── KurguPreviewView: CompositionPlayer (önizleme, düşük çözünürlük)        │
│        └── Exporter: Transformer (dışa aktarma, donanım kodlayıcı)                 │
│  Fx.kt (renk matrisi, geçişler), ShaderFx.kt (katalog efektleri, assets/kurgu_fx)  │
│  TextLayer.kt (metin bitmap katmanı)                                               │
│  MediaTools.kt (probe, küçük resim, dalga biçimi, kodlayıcı yetenekleri)           │
│  ExportService.kt (ön plan hizmeti)                                                │
└────────────────────────────────────────────────────────────────────────────────────┘
```

**Temel ilke:** Önizleme ve dışa aktarma *aynı* `Composition` nesnesinden
üretilir (`CompositionFactory.build`). Tek fark çıktı boyutudur. Bu sayede
"önizlemede başka, çıktıda başka" sorunu mimari düzeyde engellenir.

## 2. Neden bu teknolojiler?

| Karar | Seçim | Gerekçe | Değerlendirilen alternatif |
|---|---|---|---|
| Arayüz | React Native 0.81 + Expo SDK 54 (Yeni Mimari) | Depodaki mevcut Ritim uygulamasıyla aynı araç zinciri ve CI; tek kod tabanıyla Android + iOS arayüzü; yoğun iş yerel modülde | Flutter (ek bir dil/araç zinciri getirir; video motoru yine yerel olurdu) |
| Video motoru | AndroidX **Media3** 1.9.4 (`media3-transformer`, `media3-effect`) | Apache 2.0 lisans; cihazın donanım kod çözücü/kodlayıcısını (MediaCodec) ve GPU'yu (OpenGL ES) kullanır; `CompositionPlayer` ile önizleme, `Transformer` ile dışa aktarma aynı efekt zincirini paylaşır | FFmpeg: `ffmpeg-kit` projesi 2025'te sonlandırıldı ve ikili paketleri kaldırıldı; kendi derlememiz GPL/LGPL yükümlülükleri ve H.264/HEVC patent lisansı sorunları getirir; yazılım kodlama mobilde yavaş ve ısıtıcıdır |
| Efektler | GPU: renk matrisi (`RgbMatrix`), matris dönüşümleri, özel GLSL shader | Kare başına GPU'da çalışır, bellek kopyası yok; zaman bağımlı efektler kompozisyon zamanını kullanır | CPU'da kare işleme (çok yavaş) |
| Metin | Android `StaticLayout` ile bitmap, `BitmapOverlay` | Arapça harf birleştirme, çift yönlü metin ve tüm Unicode/emoji sistem metin motoru tarafından doğru çizilir | Metni JS'de çizip görüntü olarak göndermek (önizleme/çıktı uyumsuzluğu) |
| Proje depolama | JSON dosyası + atomik yazma + yedek | İnsan tarafından okunabilir, sürümlenebilir, masaüstüyle paylaşılabilir | SQLite (şimdilik gereksiz karmaşıklık; proje listesi küçük) |
| Gezinme | Küçük, bağımlılıksız yığın gezinmesi | Dil değişince ekran yığını ve açık proje korunur | react-navigation (RTL'de yeniden başlatma gerektiren davranışlar) |

## 3. Zaman çizelgesi modeli

`src/model/timeline.js` tüm düzenleme işlemlerini **saf fonksiyonlar** olarak
uygular (böl, kırp, taşı, çoğalt, hız, ses ayırma, kare dondurma, işaretçi,
manyetik hizalama). Proje nesnesi değişmezdir; geri al/yinele geçmişi
(`history.js`) anlık görüntüleri saklar ve değişmeyen alt nesneler paylaşıldığı
için bellek maliyeti düşüktür. Kaydırıcılar sürüklenirken adımlar tek geçmiş
adımında birleştirilir.

- **Ana iz** manyetiktir (klipler arasında boşluk yoktur, Media3 sırasına doğrudan karşılık gelir).
- **Ses katmanları** serbest konumludur; çakışanlar render sırasında ayrı şeritlere
  (Media3'te ayrı ses dizileri) dağıtılır, aralar `addGap` ile doldurulur.
- **Metin katmanları** kompozisyon düzeyinde `OverlayEffect` olarak uygulanır.
- **Geçişler** kesme anı etrafında zaman bağımlı efektlerdir (siyaha/beyaza geçiş, flaş,
  yakınlaşma, kaydırma, döndürme, glitch). Gerçek *çapraz geçiş* (iki klibin üst üste
  karışması) çok girdili video birleştirici gerektirir; sonraki aşamadadır.

## 4. Performans ve kaynak yönetimi

| Konu | Uygulama |
|---|---|
| Uzun videolarda bellek | Kareler belleğe yüklenmez; Media3 akış halinde çözer. Zaman çizelgesi yalnızca görünen küçük resim karolarını ve dalga biçimi parçasını çizer (sanallaştırma). |
| Küçük resim önbelleği | `MediaMetadataRetriever.getScaledFrameAtTime` ile küçük boyutta üretilir, diskte saklanır, 500 ms'ye yuvarlanmış zamanlarla yeniden kullanılır; aynı anda en fazla 2 istek. |
| Dalga biçimi | Ses `MediaCodec` ile akış halinde çözülür (sabit bellek), saniyede 20 tepe değeri diske yazılır. |
| Önizleme kalitesi | Önizleme kompozisyonu uzun kenarı 640/960/1280 piksele ölçeklenir (Ayarlar). Dışa aktarma kalitesinden bağımsızdır. |
| Donanım hızlandırma | Kod çözme/kodlama MediaCodec, efektler OpenGL ES. |
| Kodlayıcı sınırları | `MediaCodecList` ile cihazın desteklediği çözünürlük × fps birleşimleri okunur; desteklenmeyen seçenekler (ör. 4K60) kilitli gösterilir. |
| Isınma / pil | `PowerManager.currentThermalStatus` ve güç tasarrufu modu dışa aktarmadan önce okunur ve uyarı gösterilir. |
| Arka plan | Dışa aktarma süresince ön plan hizmeti (`mediaProcessing` / `dataSync` türü) ve ilerleme bildirimi; ekran açık tutulur. Önizleme arka planda durdurulur, proje hemen kaydedilir. |
| Depolama | Dışa aktarmadan önce tahmini boyut ile boş alan karşılaştırılır. Galeri seçicinin önbellek kopyası taşınır (iki kat yer kaplamaz). Kullanılmayan medya proje silinince temizlenir. |
| Çökme sonrası kurtarma | Her kayıt önce geçici dosyaya yazılır, eski kayıt `project.bak.json` olarak tutulur; bozuk kayıt açılışta yedekten yüklenir ve kullanıcıya bildirilir. |

## 5. Medya erişimi ve izinler

- **Android:** Galeri seçimi Android Photo Picker (`expo-image-picker`) ile yapılır;
  `READ_MEDIA_*` izinleri **istenmez** (app.json'da engellenmiştir). Dosya
  yöneticisi için Storage Access Framework (`expo-document-picker`). Galeriye
  kaydetme Android 10+ için MediaStore ile izinsiz; Android 7–9 için
  `WRITE_EXTERNAL_STORAGE` (maxSdk 28) çalışma anında istenir.
- **iOS:** Önizleme/dışa aktarma motoru henüz yazılmadı (bkz. §8). Arayüz,
  proje modeli ve içe aktarma iOS'ta çalışır; motor yoksa kullanıcıya açıklama gösterilir.

## 6. Yerelleştirme (TR / EN / AR)

- Tüm metinler `src/i18n/locales/*.json` içindedir; kod içinde kullanıcıya görünen metin yoktur
  (`npm run i18n:check` gömülü metin bulursa derleme başarısız olur).
- Cihaz dili `expo-localization` ile algılanır; desteklenmeyen dilde Türkçe açılır.
- **RTL:** Yerel `I18nManager` çevirmesi kapalıdır; kök görünümün `direction` stili
  değiştirilir. Bu sayede Arapçaya geçişte uygulama yeniden başlamaz, açık proje
  kapanmaz. Yönlü simgeler (geri, ileri, geri al) aynalanır; oynatma simgeleri ve
  **zaman çizelgesi** her dilde soldan sağa kalır.
- Zaman kodları teknik değer olarak Latin rakamlarla, LTR yalıtımıyla gösterilir;
  tarih, sayı ve dosya boyutları seçili dilin `Intl` biçimini kullanır.
- Kullanıcının proje adları, dosya adları ve metin katmanları hiçbir zaman çevrilmez.
- Yeni dil eklemek: `locales/<kod>.json` + `LANGUAGES` listesine bir satır; denetim betiği eksikleri listeler.

## 7. Proje dosya biçimi (platformlar arası)

`src/model/schema.js` — `format: "kurgu.project"`, `version: 1`.

- Medya göreli yolla saklanır (`media/<id>.<uzantı>`) ve ad/boyut/süre bilgisi taşır;
  başka cihazda açıldığında eksik medya yeniden bağlanabilir.
- Efekt parametreleri platformdan bağımsızdır: filtreler ve renk ayarları 4×4 renk
  matrisine JS'de çevrilir; shader efektleri adlandırılmış sayısal parametrelerdir.
- `migrateProject()` eski sürümleri günceller; daha yeni sürümden gelen proje
  açılmaz ve kullanıcıya bildirilir (sessiz veri kaybı yok). Bilinmeyen öğeler için `unsupported` alanı ayrılmıştır.
- "Proje dosyasını paylaş", medyasız `.kurgu.json` paketi üretir; "Proje içe aktar" ile açılır.

## 8. Masaüstü (Windows) ve iOS hazırlığı

Ortak tutulanlar: proje modeli, zaman çizelgesi işlemleri, renk matematiği,
render tanımı (`buildRenderSpec`), çeviri dosyaları. Platforma özgü olan tek
parça render motorudur. Önerilen yol:

- **iOS:** Aynı `RenderSpec`'i okuyan Swift modülü — AVFoundation `AVMutableComposition`
  + `AVVideoComposition` (Core Image / Metal filtreleri) + `AVAssetExportSession`/`AVAssetWriter`.
- **Windows:** Masaüstüne uygun yeni arayüz (çok panel, fare/klavye, hassas zaman çizelgesi);
  render için Media Foundation veya lisansı uygun bir FFmpeg (LGPL, yalnızca çözme +
  donanım kodlayıcı) yapılandırması. Masaüstü arayüzü mobil ekranın büyütülmüşü olmayacak.

## 9. Lisans ve güvenlik

- Media3, Expo, React Native ve kullanılan tüm kütüphaneler MIT veya Apache 2.0 lisanslıdır.
- H.264/HEVC kodlama cihazın kendi (lisanslı) donanım kodlayıcısıyla yapılır; uygulama kodek dağıtmaz.
- Kullanıcı dosyaları hiçbir sunucuya gönderilmez; telemetri yoktur. API anahtarı kaynak kodda yoktur.
- Silme işlemleri onay ister; proje silinirken yalnızca o projeye ait medya kopyaları silinir.
- Marka, simge ve renk paleti özgündür; referans uygulamaya ait kod, marka, simge veya varlık kullanılmaz.

## 9b. Efekt motoru

- **Tek kaynak:** Her efekt `modules/kurgu-engine/android/src/main/assets/kurgu_fx/<shader>.glsl`
  dosyasında `vec4 fx(vec2 uv)` olarak yazılır (GLSL ES 1.00). `_common.glsl` ortak
  uniform'ları (`uTex, uRes, uTime, uDur, uAmount, uP0, uP1, uSeed`) ve yardımcıları
  (hash, değer gürültüsü, fbm, karışım modları) içerir; `_main.glsl` yoğunluk 0 iken
  görüntüyü dokunmadan geçirir.
- **Katalog:** `src/model/fx-catalog.json` efektin kimliği, shader dosyası, kategorisi,
  parametreleri (anahtar, uP0/uP1 yuvası, varsayılan, min, maks), performans sınıfı,
  animasyonlu olup olmadığı, lisansı, platformları ve ücret katmanını tutar. Adlar ve
  açıklamalar çeviri dosyalarındaki `fx` bölümündedir. Yeni efekt = GLSL dosyası +
  katalog satırı + üç dilde ad + `tools/fx-lab/make-thumbs.sh`.
- **Model:** `clip.effects[]` (klibe bağlı yığın, en fazla 4) ve `project.effectLayers[]`
  (zaman çizelgesinde süreli öğe). Her örnek `{ id, effectId, amount, values }`;
  rastgelelik örnek kimliğinden türetilen kararlı tohumla (`seedOf`) yapılır, bu yüzden
  önizleme, dışa aktarma ve yeniden açılış aynı sonucu verir.
- **Sıra:** klip renk matrisi → bulanıklık → eski efekt → klip efektleri (yığın sırası)
  → [kompozisyon] geçiş/global efekt → efekt katmanları → metin katmanları. Metin
  efektlerden etkilenmez.
- **Zaman:** Shader `uTime` olarak efekt başlangıcından beri geçen süreyi alır; pencere
  dışında yoğunluk 0, kenarlarda 80 ms yumuşak geçiş.
- **Görsel QA:** `tools/fx-lab/lab.cjs` aynı GLSL dosyalarını başsız Chromium'da (WebGL)
  prosedürel test sahnelerine uygular: öncesi/sonrası, yoğunluk taraması, 30 karelik
  zamansal akıcılık ölçümü ve uygulamaya gömülen küçük resimler.
- **LUT:** `.cube` dosyası içe aktarmada `src/model/lut.js` ile doğrulanır, kütüphaneye
  kopyalanır (`project.luts`), klipte `{ id, intensity }` olarak tutulur. Yerel motor dosyayı
  `LutFx.kt` ile okuyup dilimleri ızgara hâlinde 2B dokuya yerleştirir; `_lut.glsl` üç doğrusal
  ara değerle uygular. Sıra: renk matrisi → LUT → bulanıklık → efektler.
- **E2E doğrulama:** `e2e/fx_check.py` dışa aktarılan MP4'te efekt katmanının izini
  (çift ton paleti) kare kare arar; efekt yalnızca katman aralığında görünmelidir.

## 9c. Cihaz içi AI araçları

Hepsi cihazda çalışır; video, ses veya metin hiçbir sunucuya gönderilmez. Ağır ölçüm
yerel motorda (Kotlin/Java/C++), karar mantığı saf JS'de (`src/model/ai.js`,
`src/model/captions.js`) ve birim testlidir. Her işlem tek bir geri al adımıdır.

| Araç | Yerel ölçüm | Karar (JS) |
|---|---|---|
| Sessizlik kaldırma | `MediaTools.waveform` (50/sn tepe) | `detectSilences` → `removeSourceRanges` |
| Sahne algılama | `SceneDetector.kt` (donanım kod çözücü, Y/U/V histogram farkı, 6/sn) | `pickSceneCuts` → `splitMainAtSourceTimes` |
| Gürültü azaltma | `dsp/SpectralDenoiser.java` + `DenoiseProcessor.kt` (Media3 ses işlemcisi) | klip/ses klibi `denoise` alanı |
| Metinden konuşma | `Speech.kt` (Android TextToSpeech → WAV) | metnin yazı sisteminden dil seçimi |
| Otomatik altyazı | `Captions.kt` (ses çözme, 16 kHz sinc yeniden örnekleme, model indirme + SHA-256) → `WhisperNative` (JNI) → whisper.cpp | `captionChunks` → `addClipCaptions` |

whisper.cpp, `src/main/cpp/CMakeLists.txt` ile derleme sırasında sabit commit'ten
alınır ve yalnızca 64 bit ABI'ler için derlenir (32 bit cihazlarda araç "kullanılamaz"
gösterilir). JNI köprüsü masaüstünde de derlenip test edilebilir (bkz. PROGRESS.md).

## 10. Bilinen sınırlamalar (bu sürüm)

- Önizleme/dışa aktarma motoru yalnızca Android'de.
- Çapraz geçiş, resim içinde resim, bölünmüş ekran, maske, chroma key ve anahtar kare animasyonu
  çok girdili video birleştirici gerektirir; sonraki aşamadadır (bkz. OZELLIKLER.md).
- Hız 0,1x–10x sabit hızdır; hız eğrisi ve optik akış yoktur.
- Ters oynatma yok (ters kodlama için ayrı bir işleme adımı gerekir).
- Bulut gerektiren AI araçları (otomatik kurgu, görüntü iyileştirme) ve arka plan kaldırma, altyazı çevirisi henüz yok; uygulamada "Planlandı" olarak gösterilir.
