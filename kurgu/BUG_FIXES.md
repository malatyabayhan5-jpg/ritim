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

## Y6 — Oynatma kafası sondayken eklenen efekt katmanı / metin görünmezdi (emülatör testinde bulundu)

- **Yeniden üretme:** CI #26 teşhis günlüğü: dışa aktarma anında efekt katmanı
  `["duotone", 17545, 17546]` — katman zaman çizelgesinin sonunda başlamış, videodan
  sonra kaldığı için çıktıda hiç görünmüyordu. Metin eklemede de aynı durum vardı.
- **Kök neden:** Yeni süreli öğe her zaman oynatma kafasından başlatılıyordu; kafa
  sondaysa öğe tamamen video dışına düşüyordu.
- **Düzeltme:** `fitToTimeline`: öğe oynatma kafasından başlar ama videonun içine
  sığdırılır (sondaysa sona hizalanır, video kısaysa süre videoya eşitlenir).
  `addText` ve `addEffectLayer` bunu kullanır.
- **Test:** `oynatma kafası sondayken eklenen efekt katmanı ve metin videonun içine
  yerleşir`; render tanımının sonradan taşınan öğeleri kırpması ayrı testlerde.

## Y7 — Yavaş cihazda yoğun efektli dışa aktarma "muxer zaman aşımı" ile iptal oluyordu

- **Yeniden üretme:** CI #26: 720p, parıltı + çift ton efektli projede emülatörde
  `EXPORT_FAILED ERROR_CODE_MUXING_TIMEOUT`.
- **Kök neden:** Media3 Transformer, iki çıktı örneği arasında 10 sn'den uzun süre
  geçerse dışa aktarmayı iptal eder; görüntü işleme sesin çok gerisinde kalınca bu
  sınır aşılıyordu.
- **Düzeltme:** `setMaxDelayBetweenMuxerSamplesMs(120_000)`: gerçekten takılan iş yine
  biter, yavaş ama ilerleyen iş tamamlanır.
- **Test:** Emülatör kabul akışı (dışa aktarma + çıktı denetimi).

---

# 2026-10-19 turu

Bu turdaki kayıtlar aynı biçimdedir. "CI" numaraları GitHub Actions çalıştırma
numaralarıdır; emülatör Android 14 (API 34, yazılımsal GPU).

## H-8 — Önizleme `ERROR_CODE_FAILED_RUNTIME_CHECK` ile duruyordu (oynatma kafası ilerlemiyordu)

- **Yeniden üretme:** CI #36–#40 e2e: 1, 3, 4, 6 ve 7. akışlarda ekranda "Önizleme
  hatası (ERROR_CODE_FAILED_RUNTIME_CHECK)"; günlükte `play position=0` (oynatma hiç
  ilerlemiyor). CI #37'de eklenen tam neden zinciri günlüğü:
  `IllegalStateException: Expected a valid end boundary for unity region.` →
  `androidx.media3.common.audio.GainProcessor.queueInput(GainProcessor.java:115)`.
- **Kök neden:** Ses düzeyi zarfı (`VolumeEnvelope`, `Fx.kt`) canlı modda (önizleme)
  `isUnityUntil()` için her zaman `C.TIME_UNSET` dönüyordu. `GainProcessor`, kazanç
  tam 1 iken bu değeri sorar ve `TIME_UNSET`'i geçersiz sayar (Media3 1.9.4 kaynağı,
  `GainProcessor.java:113–115`). Ses düzeyi %100 olan her klipte önizleme ilk ses
  tamponunda duruyordu.
- **Düzeltme (2c48995):** Birlik bölgesi 10 ms'lik parçalar hâlinde bildirilir (canlı
  değer değişirse en geç bir parça sonra uygulanır); sabit zarfta solma başlangıcı
  aşılmaz; anahtar kareli düzeyde 1 ms.
- **Test:** CI #42+ e2e (önizlemeli tüm akışlar). Sonuç PROGRESS.md Bölüm 9'da.

## H-9 — Hız değişimli katman öğesi dışa aktarmayı kilitliyordu (%60)

- **Yeniden üretme:** CI #33–#35: geçişli projede `ERROR_CODE_MUXING_TIMEOUT` %60'ta
  (geçiş penceresi).
- **Kök neden:** Geçiş kopyaları kaynak payı yoksa yarım hızla oynatılır. Transformer
  hız değişiminde video zaman damgalarını ses işlemcisinden (`SpeedChangingAudioProcessor`)
  türetir; sesi kaldırılmış (yalnız video) dizide bu zaman damgaları hiç çözülmez.
- **Düzeltme (ac36ee5):** Hızı değişen öğe içeren katman şeritleri sesli dizi olur,
  ses sıfır kazançla susturulur.
- **Test:** CI #37+: takılma %60'tan %90'a kaydı → H-12.

## H-10 — Araç çubuğunda AI düğmesi ekran dışına itiliyordu

- **Yeniden üretme:** CI #32: AI akışları `tool-ai` bulunamadığı için düştü.
- **Kök neden:** Yeni "Katman" düğmesi kök araç çubuğunu genişletti.
- **Düzeltme (ac36ee5):** Sıra: düzenle, AI, ses, metin, katman, efekt, filtre, ayar, format.
- **Test:** CI #37+: 3 ve 4. akışlar GEÇTİ.

## H-11 — Kişi maskesi EXIF yönlü fotoğraflarda kayıyordu (yayımlanmadan bulundu)

- **Yeniden üretme:** Kod incelemesi: `Segmenter.decode` EXIF yönünü uygulamıyordu,
  `PhotoRenderer.decode` uyguluyordu; dikey çekilmiş JPEG'de maske 90° dönük kalırdı.
- **Düzeltme:** Segmenter ve nesne silme `PhotoRenderer.decode`'u (EXIF + önbellek) kullanır.
- **Test:** Kod yolu tek; cihazda dikey fotoğrafla doğrulama ☁️.

## H-12 — Geçişli projede dışa aktarma %90'da takılıyordu

- **Yeniden üretme:** CI #40, kabul akışı: ilerleme %90'da 120 sn durdu →
  `MUXING_TIMEOUT: no output sample written in the last 120000 milliseconds`.
- **Kök neden (Media3 1.9.4 kaynağı):** `EditedMediaItem.setSpeed` Transformer'da görüntüye
  `TimestampAdjustment(SpeedChangingAudioProcessor::getSpeedAdjustedTimeAsync)` ekler
  (`Transformer.java:1368–1371`). Bu efektin gördüğü kare zamanı öğenin dizideki ofsetini
  içerir (`VideoSampleExporter.java:688/690` → `ExternalTextureManager.java:418`), ses
  tarafındaki hız eğrisi ise öğe başından sayar. Dizinin ilk öğesi olmayan her hızlı öğede
  kare `(ofset + t) / hız` zamanına düşer: geçiş şeridindeki 0.5x kopya ~9,8 sn yerine
  ~19,6 sn'ye (video 17,5 sn). Birleştirici bu kareleri bırakmaz
  (`DefaultVideoCompositor.java:277`), şerit ilerleyemez, karıştırıcı en yavaş kaynağa kadar
  ses verir (`DefaultAudioMixer.java:330`), muxer görüntüyü sesin 500 ms ötesine geçirmez
  (`MuxerWrapper.java:728`) → zaman aşımı.
- **Düzeltme (5fc164e):** Dışa aktarmada hız `setSpeed` yerine aynı zincirin ofseti bilen
  eşdeğeriyle uygulanır: ses için ilk işlemci `SpeedChangingAudioProcessor`, görüntü için
  `TimestampAdjustment(ItemSpeedMap)` = `ofset + hızEğrisi(T − ofset)` (eşzamanlı, sese
  bağlı değil). Dizi ofsetleri ve toplam süre Media3'ün kuralıyla (`SpeedProviderUtil`)
  hesaplanır; tüm diziler aynı anda biter. Dışa aktarma başında dizi yapısı günlüğe yazılır
  (`KurguExport`). Ana izde ilk öğe olmayan hızlı kliplerde de aynı gizli hata vardı.
- **Test:** CI #49+ kabul akışı (dışa aktarma + ffmpeg doğrulaması). Önizleme (CompositionPlayer)
  yolu değişmedi.

## H-16 — Çok katmanlı önizleme bir kez sona gelip başa sarılınca uygulama çöküyordu

- **Yeniden üretme:** CI #42, kabul akışı: `FATAL EXCEPTION: CompositionPlaybackThread`,
  `IllegalStateException at DefaultVideoFrameProcessor.signalEndOfInput(…:817)` ←
  `MultipleInputVideoGraph.onVideoCompositorEnded`.
- **Kök neden:** Media3 1.9.4 `MultipleInputVideoGraph.flush()` yalnızca ön işlemcileri
  sıfırlar (`MultipleInputVideoGraph.java:392–396`); birleştiricinin `compositorEnded` ve
  girişlerin "bitti" bayrakları kalır. İkinci bitişte son işlemciye ikinci kez
  `signalEndOfInput` gönderilir ve denetim (`checkState(!inputStreamEnded)`) çöker.
- **Düzeltme (ba16bcf):** Çok girişli grafik bir kez `STATE_ENDED` olduysa sonraki
  oynatma/arama/yeniden çizimde oynatıcı aynı konumdan yeniden kurulur.
- **Test:** CI #49+ (kabul ve katman akışları sona kadar oynatır).

## H-17 — Kotlin derleme hatası: yinelenen alan (CI #43–#46)

- **Kök neden:** Ses düzeyi anahtar kareleri eklenirken betikli düzenleme `volumeKf`
  alanını `MainClip`'e iki kez ekledi; CI derlemesi "Conflicting declarations" ile düştü.
- **Düzeltme (3829aba):** Yinelenen satır silindi. Ders: Kotlin değişikliklerinden sonra
  CI derleme sonucu beklenmeden üst üste itme yapılmamalı.

## H-18 — Seslendirme kaydı başlamıyordu (CI #42, 7. akış)

- **Yeniden üretme:** "Kaydı başlat"a dokununca durdurma düğmesi hiç görünmedi; günlükte
  kayıt başlangıcı yok.
- **Kök neden:** İzin isteği Expo izin yöneticisi yolundan gidiyordu; sonuç uygulamaya
  ulaşmadı (hata yakalanıp yalnızca bildirim gösteriliyordu, ayrıntı günlüğe yazılmıyordu).
- **Düzeltme (ba16bcf):** Android'de React Native `PermissionsAndroid` (önce `check`,
  gerekirse `request`); izin sonucu ve hata günlüğe yazılır.
- **Test:** CI #49+ 7. akış.

## H-13 — Ses efekti ön ayarı değiştirilince eski parametreler kalıyordu (yayımlanmadan bulundu)

- **Kök neden:** `mergeClip` nesne alanlarını derin birleştiriyordu; `audioFx`
  bütün olarak değişmeliydi.
- **Düzeltme:** `audioFx` (anahtar kareler, hız eğrisi gibi) bütün olarak değiştirilir.
- **Test:** B (ses efekti testleri) + kod incelemesi.

## H-14 — Birim test ölçümü paralel yük altında rastgele düşüyordu

- **Yeniden üretme:** Yük ortalaması 14 iken "300 klip render tanımı < 25 ms" testi
  32 ms ölçtü (normalde 5 ms).
- **Düzeltme:** 5 turun en iyisi alınır; ölçülen değer çıktıya yazılır (2–8 ms).

## H-15 — `test:dsp` paralel çalışmada paylaşılan /tmp klasörünü siliyordu

- **Kök neden:** Sabit `/tmp/kurgu-*` klasörleri; aynı anda iki çalışma birbirinin
  sınıf dosyalarını sildi ("KeyframesTest not found").
- **Düzeltme:** `scripts/test-dsp.sh` her çalışmada `mktemp -d` kullanır.
