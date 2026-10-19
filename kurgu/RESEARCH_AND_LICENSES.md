# Kurgu — Araştırma ve lisans kayıtları

Araştırma tarihi: **2026-10-18**, güncelleme: **2026-10-19** (bölüm 6–8). Bu belge; efekt/filtre/geçiş tasarımı için
incelenen kaynakları, her kaynaktan ne alındığını (fikir mi, kod mu), lisansını ve
verilen kararı listeler. İlke: **başka bir ürünün kodu, varlığı, adı veya simgesi
kopyalanmaz**; kamuya açık bilgi yalnızca kategori/teknik fikir düzeyinde kullanılır,
kod yalnızca lisansı açıkça ticari kullanıma izin veriyorsa ve atıf yapılarak alınır.

## 1. Erişim sınırlamaları

| Kaynak | Durum |
|---|---|
| capcut.com | Bu ortamdan doğrudan erişilemedi (DNS). Sayfa içerikleri arama motoru özetleri üzerinden okundu. |
| openeffects.org (OpenFX) | Erişilemedi (DNS). OpenFX yalnızca masaüstü eklenti API'si olduğu için mobil motora doğrudan katkısı yok; karar etkilenmedi. |
| dl.google.com / Android SDK | Engelli; yerelde APK derlenemiyor. Derleme ve emülatör testi GitHub Actions'ta yapılır. |

## 2. Ürün araştırması (yalnızca kategori ve kullanıcı beklentisi)

| Kaynak | Alınan bilgi | Kullanım |
|---|---|---|
| https://www.capcut.com/resource/video-effects-app | Efekt sekmeleri: Trend, Sinematik, Retro, Glitch, AI efektleri; popüler aileler: açılış/kapanış, gece kulübü/retro, glitch/bozulma, vlog, 3B/çizgi film, karanlık/bölünmüş ekran | Kategori listemizi (ışık, glitch, retro, hareket, bulanıklık, stil, yaratıcı, bozulma, atmosfer, sinematik) belirlemede referans. İsimler, simgeler ve görseller **alınmadı**. |
| https://www.capcut.com/help/recommended-alternative-effects | Efektlerin zaman çizelgesinde ayrı iz olarak, süreli öğe şeklinde uygulandığı; klibe de uygulanabildiği | Efekt katmanı şeridi + klip efekt yığını tasarımı |
| https://www.capcut.com/resource/ai-effect | AI efektlerinin bulut işleme gerektirdiği | Çevrimdışı ilke nedeniyle bu sürüme alınmadı |
| APKMirror'daki CapCut 18.0.0 / 17.9.0 sürüm listeleri | Yalnızca sürüm/minimum Android bilgisi | APK indirilmedi, açılmadı, incelenmedi |

## 3. Teknik araştırma

| Konu | Kaynak | Bulgu | Karar |
|---|---|---|---|
| Media3 efekt boru hattı | Media3 1.9.4 kaynak kodu, https://developer.android.com/media/media3/transformer | `GlEffect`/`BaseGlShaderProgram` ile özel shader; aynı `Composition` hem `CompositionPlayer` (önizleme) hem `Transformer` (dışa aktarma) ile çalışır | Tek render tanımı, tek shader kaynağı → önizleme = çıktı |
| HDR | Media3 `Composition.HDR_MODE_*` | Varsayılan HDR'yi korur; SDR efektleri ve H.264 için ton eşleme gerekir | `HDR_MODE_TONE_MAP_HDR_TO_SDR_USING_OPEN_GL` |
| LUT (.cube) | https://developer.android.com/reference/androidx/media3/effect/SingleColorLut, https://colour.readthedocs.io/en/develop/_modules/colour/io/luts/iridas_cube.html | `SingleColorLut.createFromCube(int[][][])` N×N×N ARGB küp; .cube biçimi: `LUT_3D_SIZE`, `DOMAIN_MIN/MAX`, kırmızı en hızlı değişen eksen | Uygulandı. `SingleColorLut` yoğunluk (karışım) desteklemediği ve laboratuvarda doğrulanamadığı için aynı doku düzenini kullanan özgün shader yazıldı (`_lut.glsl`, `LutFx.kt`); 8 bit dokuda GPU sonucu CPU üç doğrusal referansından en fazla 1/255 sapıyor |
| Bloom/parıltı | https://blog.frost.kiwi/dual-kawase/, Unity URP Bloom belgeleri (docs.unity.com), Intel Kawase bulanıklık sunumu | Mobilde çok geçişli Kawase/mip bloom tek geçişli geniş çekirdekten hızlı | Şimdilik tek geçişli altın açılı örnekleme (24 örnek); performans ölçümü gerçek cihazda yapılınca çok geçişliye geçilecek |
| FFmpeg filtreleri | https://ffmpeg.org/ffmpeg-filters.html (chromashift, lut3d, vignette, noise, xfade) | Parametre adlandırma ve beklenen davranış için referans | Kod alınmadı; FFmpeg uygulamaya gömülü değil (yalnızca CI'da test aracı) |
| Gürültü/hash | https://www.shadertoy.com/view/4djSRW — Dave Hoskins, "Hash without Sine", **MIT** | Sinüs kullanmayan, GPU'lar arasında tutarlı hash | `_common.glsl` içindeki `hash11/12/22` bu yöntemi izler; atıf dosyada ve aşağıda |
| GLSL kütüphanesi LYGIA | https://www.npmjs.com/package/lygia | Lisans: Prosperity + Patron (ticari kullanım ücretli/izinli) | **Kullanılmadı** |
| gl-transitions | https://www.npmjs.com/package/gl-transitions, jsDelivr README | Geçiş başına ayrı lisans (çoğu MIT, bazıları belirsiz) | Tek tek doğrulanamadığı için **kod alınmadı**; geçişler özgün yazılacak |

## 4. Bu sürümde kullanılan üçüncü taraf kod ve varlıklar

| Bileşen | Lisans | Nerede |
|---|---|---|
| "Hash without Sine" hash fonksiyonları (Dave Hoskins) | MIT | `modules/kurgu-engine/android/src/main/assets/kurgu_fx/_common.glsl` |
| AndroidX Media3 | Apache-2.0 | Kotlin motoru |
| Expo / React Native ve bağımlılıkları | MIT | Uygulama |
| Playwright + Chromium (yalnızca geliştirme aracı, uygulamaya girmez) | Apache-2.0 / BSD | `tools/fx-lab` |
| whisper.cpp + ggml (ggml-org, v1.9.5, commit d1be6fd) | MIT | Otomatik altyazı; derleme sırasında sabit commit'ten alınır (`src/main/cpp/CMakeLists.txt`, commit doğrulanır) |
| Whisper model ağırlıkları (OpenAI, ggml biçimi: huggingface.co/ggerganov/whisper.cpp) | MIT | Uygulamaya gömülmez; kullanıcı onayıyla indirilir, SHA-256 ile doğrulanır |
| espeak-ng (yalnızca CI test medyası üretimi, uygulamaya girmez) | GPL-3.0 | `e2e/run.sh` |

Efekt shader'larının tamamı (21 dosya), test sahneleri (`tools/fx-lab/scenes.py`,
prosedürel olarak üretilir) ve efekt küçük resimleri **özgündür**; harici görsel,
LUT, ses, yazı tipi veya efekt paketi eklenmedi.

MIT lisans metni (hash fonksiyonları için): "Permission is hereby granted, free of
charge, to any person obtaining a copy of this software and associated documentation
files … THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND." —
Copyright (c) 2014 David Hoskins.

## 4b. AI araçları kararları (2026-10-18)

| Araç | Karar | Gerekçe |
|---|---|---|
| Otomatik altyazı | whisper.cpp, cihaz içi | Açık lisans (MIT), Türkçe/Arapça desteği, internet ve hesap gerektirmez, ses cihazdan çıkmaz. Bulut ASR servisleri ücretli ve API anahtarı gerektirir |
| Metinden konuşma | Android TextToSpeech | Ücretsiz, cihaz içi, ek model yok; ses kalitesi cihaz motoruna bağlı |
| Gürültü azaltma | Özgün spektral çıkarma (Java) | RNNoise (BSD) gibi modeller NDK + model gerektirir; sabit gürültü için klasik yöntem yeterli ve ölçülebilir |
| Sessizlik / sahne | Özgün sinyal işleme | Model gerektirmez, deterministik, birim testlenebilir |
| Arka plan kaldırma | Fotoğrafta yapıldı (2026-10-19, bölüm 6); videoda yapılmadı | Kare başına segmentasyon videoda gerçek cihazda performans ölçümü gerektirir; videoda chroma key kullanılabilir |
| Otomatik kurgu, görüntü iyileştirme | Bulut gerektirir, yapılmadı | Ücretli servis ve kullanıcı anahtarı; kullanıcı onayı olmadan yapılmaz |

## 5. Maliyet ve erişim notları

- Ücretli bir servis, API anahtarı veya bulut işleme kullanılmadı; tüm efektler
  cihaz üzerinde GPU ile, AI araçları cihaz CPU'sunda çalışır.
- Altyazı modeli dosyalarının sunucusu (huggingface.co) bu geliştirme ortamından
  erişilemedi; özetler CI'da indirilen dosyalardan alındı.
- Gerçek Android cihaz bu ortamda yok: GPU performansı, ısınma ve pil ölçümleri
  yapılamadı. Efektlerdeki "yoğun" (heavy) etiketi örnek sayısına göre tahmindir.

## 6. 2026-10-19 turunda eklenen üçüncü taraf bileşenler

| Bileşen | Sürüm | Lisans | Nerede / nasıl | Karar gerekçesi |
|---|---|---|---|---|
| TensorFlow Lite (Java çalışma zamanı) | `org.tensorflow:tensorflow-lite:2.16.1` | Apache-2.0 | `build.gradle`; `Segmenter.kt` | Açık lisans, cihaz içi çıkarım, ek hizmet/hesap gerekmez. ML Kit Selfie Segmentation kapalı kaynak SDK olduğu için seçilmedi |
| MediaPipe "SelfieSegmenter (square)" model ağırlıkları | float16, 249.537 bayt, SHA-256 `191ac952…8226658b` | Apache-2.0 (Google) | `assets/kurgu_ml/selfie_segmenter.tflite`, köken ve lisans notu `assets/kurgu_ml/NOTICE.txt` | Değiştirilmeden gömüldü (internet gerekmez). Yalnızca insanları ayırır; nesne/hayvan ayırmaz — arayüzde yazılı |
| whisper.cpp "translate" görevi | (mevcut whisper.cpp v1.9.5) | MIT | `kurgu_whisper.cpp` | Cihaz içi konuşma → İngilizce altyazı. whisper yalnızca İngilizceye çevirir; başka hedef diller için açık lisanslı, mobilde çalışan, kalite/boyut dengesi kabul edilebilir bir model bu turda seçilmedi → dış servis gerektiriyor olarak işaretlendi |

Uygulamaya yeni yazı tipi, görsel, ses, LUT veya efekt paketi eklenmedi.
Çıkartmalar sistem emoji yazı tipiyle çizilir (görsel dosyası yok).

## 7. Özgün olarak yazılan algoritmalar ve dayandıkları yayınlar (kod alınmadı)

| Alan | Dosya | Dayanak (yalnızca yöntem) |
|---|---|---|
| Parametrik EQ, raf/kesme süzgeçleri | `dsp/Biquad.java`, `Equalizer.java`, `CutFilter.java` | R. Bristow-Johnson, "Audio EQ Cookbook" (formüller; kamuya açık) |
| Kompresör | `dsp/Compressor.java` | Giannoulis, Massberg, Reiss, "Digital Dynamic Range Compressor Design", JAES 2012 (yumuşak diz, ayrık tepe dedektörü) |
| Sınırlayıcı | `dsp/Limiter.java` | İleri bakışlı kazanç, kayan pencere minimumu (genel yöntem) |
| Yankı (reverb) | `dsp/Reverb.java` | Schroeder/Moorer yapısı, kamu malı "Freeverb" yerleşimi (8 tarak + 4 tüm geçiren); kod yazılımcı tarafından yeniden yazıldı |
| Diğer ses efektleri | `dsp/*.java` | Gecikme, koro/flanger, doyum (Padé tanh), bit azaltma, halka modülasyonu, kapı, M/S genişletici — ders kitabı yöntemleri |
| Görüntü işlemleri (fotoğraf) | `vision/ImageOps.java` | Renk matrisi, ton eğrileri, HSL bantları, bölünmüş tonlama, kutu bulanıklığı (3 geçiş ≈ Gauss), keskinleştirme maskesi, vinyet, gren, 3B LUT üç doğrusal enterpolasyon |
| Nesne silme | `ImageOps.inpaint` | Kenardan içe katman katman ağırlıklı komşu ortalaması + yumuşatma (klasik difüzyon tabanlı doldurma). Üretken model değildir |
| Otomatik iyileştirme | `src/model/enhance.js`, `PhotoRenderer.imageStats` | Yüzdelik tabanlı ton genişletme + gri dünya beyaz dengesi (klasik) |
| Metin animasyonları | `anim/TextAnim.java`, `TextLayer.kt` | Özgün; yay/esneklik eğrileri standart sönümlü salınım formülleri |
| Hız eğrisi | `src/model/speed.js` | Parçalı sabit hız, harmonik ortalama ile süre korunumu (özgün) |
| Ters oynatma | `Reverser.kt` | Android MediaCodec/MediaMuxer ile yeniden kodlama (platform API'si) |

## 8. Bulut AI kararı ve güvenlik

- Uygulama hiçbir API anahtarı içermez ve gizlice ücretli servis çağırmaz.
- Görsel üretme yalnızca kullanıcının **Ayarlar → Bulut AI sunucusu** alanına kendi
  sunucusunun (yalnızca `https://`) adresini girmesiyle etkinleşir; aksi hâlde arayüzde
  "Bağlı değil" yazar ve düğme devre dışıdır. Sunucu yanıtı doğrulanır; hatalı/boş
  yanıt başarı gibi gösterilmez (`src/model/cloud.js`, birim testli).
- `server/image-proxy.mjs`: bağımlılıksız örnek vekil sunucu. Anahtar sunucunun ortam
  değişkeninde tutulur; istek doğrulama, gövde sınırı, IP başına hız sınırı vardır.
  Sağlayıcı tarafı "OpenAI Images API uyumlu" uç nokta biçimini konuşur (yalnızca
  protokol; kod alınmadı). Gerçek bir sağlayıcıyla **denenmedi** — yalnızca sahte
  sağlayıcıya karşı birim testlidir (`tests/cloud.test.mjs`). Herkese açık yayında
  kullanıcı kimlik doğrulaması eklenmelidir.
- Bu ortamda gerçek bir bulut AI hesabı/anahtarı yoktur; bu nedenle bulut özelliği
  "dış servis gerektiriyor" durumundadır.
