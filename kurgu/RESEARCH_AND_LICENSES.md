# Kurgu — Araştırma ve lisans kayıtları

Araştırma tarihi: **2026-10-18**. Bu belge; efekt/filtre/geçiş tasarımı için
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

Efekt shader'larının tamamı (21 dosya), test sahneleri (`tools/fx-lab/scenes.py`,
prosedürel olarak üretilir) ve efekt küçük resimleri **özgündür**; harici görsel,
LUT, ses, yazı tipi veya efekt paketi eklenmedi.

MIT lisans metni (hash fonksiyonları için): "Permission is hereby granted, free of
charge, to any person obtaining a copy of this software and associated documentation
files … THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND." —
Copyright (c) 2014 David Hoskins.

## 5. Maliyet ve erişim notları

- Ücretli bir servis, API anahtarı veya bulut işleme kullanılmadı; tüm efektler
  cihaz üzerinde GPU ile çalışır.
- Gerçek Android cihaz bu ortamda yok: GPU performansı, ısınma ve pil ölçümleri
  yapılamadı. Efektlerdeki "yoğun" (heavy) etiketi örnek sayısına göre tahmindir.
