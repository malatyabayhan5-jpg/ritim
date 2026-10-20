# Kurgu — İlerleme

Son güncelleme: **2026-10-20**. Bu dosya özelliklerin gerçek durumunu dört değerle
gösterir; kodun var olması tek başına "tamamlandı" sayılmaz:

| İşaret | Anlamı |
|---|---|
| ✅ | **Tamamlandı ve test edildi** — hangi testle doğrulandığı satırda yazılıdır |
| 🟡 | **Kısmen tamamlandı** — çalışan kısım ve eksik/doğrulanmamış kısım yazılıdır |
| ⏳ | **Geliştirme bekliyor** — uygulamada yok ya da "Planlandı" olarak gösterilir |
| ☁️ | **Dış servis veya donanım gerektiriyor** — bu ortamda doğrulanamaz |

Test kısaltmaları: **B** birim testi (Node, CI'da her derlemede) · **J** masaüstü JVM
testi (`npm run test:dsp`: DSP, animasyon, görüntü işleme) · **L** WebGL efekt
laboratuvarı (`tools/fx-lab`, Chromium/SwiftShader) · **D** CI'da APK derlemesi ·
**E** Android 14 emülatöründe (API 34, yazılımsal GPU) Maestro uçtan uca akışı.
**Gerçek Android cihazında hiçbir ölçüm veya test yapılmadı** (bu ortamda cihaz yok).

## 1. Kritik hatalar

| Konu | Durum | Kanıt |
|---|---|---|
| Önizleme çökmesi `ERROR_CODE_FAILED_RUNTIME_CHECK` (oynatma kafası ilerlemiyordu; 1, 3, 4, 6, 7. akışlarda) | 🟡 | Kök neden CI #40 günlüğünden bulundu: canlı ses zarfı `isUnityUntil` için `TIME_UNSET` dönüyordu (Media3 `GainProcessor`). Düzeltme 2c48995; CI #42+ sonucu aşağıda |
| Geçişli projede dışa aktarma `MUXING_TIMEOUT` (kabul akışı, %90'da takılma) | 🟡 | Hız değişimli geçiş kopyaları için ilk düzeltme ac36ee5 (%60'taki takılma giderildi); %90'daki takılma inceleniyor — bkz. BUG_FIXES.md H-12 |
| Tüm eski bulgular (K1–K3, Y1–Y7, O1) | ✅ | BUG_FIXES.md; emülatör akışları |

## 2. Performans (ölçümlü)

| Konu | Durum | Ölçüm / kanıt |
|---|---|---|
| Canlı parametreler: kaydırıcı sürüklerken önizleme yeniden kurulmaz (efekt, renk, LUT, ses düzeyi, katman) | ✅ | B (`live.test.mjs`: yapı/canlı ayrımı); E (5_performans akışı) |
| İki geçişli ağır efektler (yarım çözünürlüklü ön geçiş): parıltı, anamorfik, eğik kaydırma, neon kenar, hareket bulanıklığı | ✅ | L: `tools/fx-lab/perf-baseline.json` (SwiftShader, göreli süre; ör. anamorfik 2 geçişte öncekinin ~0,3'ü) |
| Render tanımı hızı (300 klip + 50 efekt) | ✅ | B: 2–8 ms/çağrı (geliştirme makinesi) |
| Emülatör kare süreleri | 🟡 | E (CI #40, yazılımsal GPU): 139 kare, p50 34 ms, p90 109 ms, %69 takılan kare; PSS ~134 MB. **Gerçek cihaz değildir** |
| Gerçek cihazda kare süresi, ısınma, pil | ☁️ | Cihaz yok |

## 3. Çok katmanlı kurgu

| Özellik | Durum | Kanıt / sınırlama |
|---|---|---|
| Üst katmanlar (resim içinde resim), 6 şerit, şerit değiştirme | ✅ | B; E (6_katmanlar: dışa aktarılan videoda katman konumu ve süresi `layer_check.py` ile doğrulandı, CI #37–39) |
| Maskeler (dikdörtgen, yuvarlak dikdörtgen, elips, doğrusal, ayna, kalp, yıldız; ters, yumuşatma) | ✅ | B; E (daire maskesi dışında katman görünmüyor: 0,00) |
| Chroma key (CbCr uzaklığı + taşma bastırma, otomatik anahtar renk) | 🟡 | B + J (`KeyColorTest`); laboratuvar; emülatörde görsel doğrulama yok |
| Anahtar kareler: konum, ölçek, döndürme, opaklık (katman); ana iz konum/ölçek/açı/opaklık; efekt yoğunluğu; ses düzeyi | ✅ | B + J (JS ↔ Java aynı değerlendirme, `tests/fixtures/keyframes.txt`); doğrusal / Bézier / basamak |
| Karışım modları (video) | ⏳ | Media3 1.9'un `DefaultVideoCompositor`'ı yalnızca alfa karışımı yapar ve `MultipleInputVideoGraph` içinde değiştirilemez; özel birleştirici gerekir. Fotoğraf düzenleyicide 11 karışım modu var (aşağıda) |
| Gerçek A/B geçişleri (93 geçiş, 12 kategori) | 🟡 | B + L (her geçiş laboratuvarda karelerle denetlendi). Önizlemede çalışır; geçişli projelerde dışa aktarma takılması açık (Bölüm 1) |
| Hız eğrileri (8 hazır + 5 noktalı düzenleme), sabit hız 0,1–10x | ✅ | B (`speed.test.mjs`: süre integrali, ters eşleme, bölme sürekliliği); D |
| Ters oynatma (cihaz içi yeniden kodlama) | ✅ | E (CI #52: 3. akış GEÇTİ, 2,2 sn klip → 66 kare + ses). Android 9+ |
| Kare dondurma | ✅ | B; E (önceki turlar) |

## 4. Ses

| Özellik | Durum | Kanıt / sınırlama |
|---|---|---|
| Mikrofonla seslendirme (izin, seviye ölçer, oynatma kafasından kayıt) | 🟡 | D; e2e 7_seslendirme akışı (CI #40'ta önizleme çökmesi nedeniyle düştü; düzeltme sonrası sonuç Bölüm 9) |
| Ses efektleri: 14 efekt (EQ, kompresör, sınırlayıcı, kapı, doyum, bit azaltma, halka mod., bant geçiren, koro/flanger, gecikme/ping-pong, yankı, genişletici, kazanç, perde) | 🟡 | J (`AudioFxTest`, 7596 denetim: EQ tepkisi tasarıma 0,000 dB, kompresör eğrisi ±0,3 dB, sınırlayıcı tavanı aşılmaz, yankı RT60 artan, 54 ön ayarda NaN/taşma yok). Kotlin işlemcisi D; **cihazda dinlenmedi**; perde (Sonic) uzunluğu cihazda doğrulanmadı |
| 54 ses ön ayarı (ses, müzik, efekt, temizlik) | 🟡 | B (ön ayarlar birbirinden ayrık) + J; aynı sınırlama |
| Ses düzeyi anahtar kareleri | ✅ | B (değerlendirme, render tanımı, bölmede kaydırma); yerel taraf J ile paylaşılan `Keyframes.java` |
| Gürültü azaltma | ✅ | J (duraklamada 9–18 dB düşüş, konuşma kaybı < 0,1 dB) |
| SRT içe/dışa aktarma | ✅ | B (`srt.test.mjs` gidiş-dönüş, BOM, bozuk blok) |
| %100 üzeri ses | 🟡 | Ses efektlerindeki kazanç (+12 dB, sınırlayıcıyla); düzey kaydırıcısı 0–100% |

## 5. Metin, çıkartma, altyazı

| Özellik | Durum | Kanıt / sınırlama |
|---|---|---|
| 97 metin şablonu (42 stil + 55 düzen, 13 kategori) | 🟡 | B (`text.test.mjs`: sayı, renk geçerliliği, metin/kutu karşıtlığı ≥ 3:1, üç dil). Görünüm PIL taslaklarıyla incelendi; **cihazda çizim görülmedi** |
| Metin animasyonları: 20 giriş, 20 çıkış, 5 döngü (kelime/harf, daktilo imleci, bulanıklık, dalga…) | 🟡 | J (`TextAnimTest`, 14.131 denetim; eski animasyonlar birebir korunur; Arapça kelime bazlı). Cihazda görsel doğrulama yok |
| Arapça / RTL | ✅ | E (2_dil_rtl akışı); B (çeviri kapsamı 1277 anahtar × 3 dil) |
| Çıkartmalar (emoji, video ve fotoğraf) | 🟡 | Kod + B (fotoğraf modeli); emülatörde fotoğraf akışında metin adımı var |
| Şekiller | 🟡 | Fotoğraf düzenleyicide 8 şekil ✅ (B); video zaman çizelgesinde şekil ⏳ |
| Otomatik altyazı (whisper.cpp, cihaz içi) | ✅ | E (CI #29: konuşma kelimesi kelimesine doğru); 64 bit cihaz |
| Altyazı düzenleme listesi (metin, zamana git, sil) | 🟡 | Kod + D; e2e adımı yok |
| Altyazı çevirisi | 🟡 | Cihaz içinde yalnızca **İngilizceye** (whisper "translate"); D. Diğer hedef diller ☁️ |

## 6. AI araçları

| Araç | Durum | Kanıt / sınırlama |
|---|---|---|
| Sessizlik kaldırma, sahne algılama, metinden konuşma | ✅ | B + E (CI #29) |
| Arka plan kaldırma (fotoğraf, TFLite kişi modeli) | 🟡 | D; e2e 8_fotograf modeli çalıştırır (test görselinde kişi yok → "kişi bulunamadı" beklenir). Gerçek portrede kalite cihazda görülmedi. Videoda ⏳ |
| Nesne silme (fotoğraf, klasik doldurma) | 🟡 | J (`ImageOpsTest`: düz zemin/degrade doldurma) + D; üretken değildir, büyük alanlarda doku üretmez |
| Otomatik iyileştirme (video + fotoğraf) | 🟡 | B (`enhance.test.mjs`) + D; cihazda görsel doğrulama yok |
| Altyazı çevirisi | 🟡 | Yukarıda |
| Metinden görsel üretme | ☁️ | Altyapı + örnek vekil sunucu hazır (B: sahte sağlayıcıyla); kullanıcı sunucusu ve sağlayıcı anahtarı olmadan **çalışmaz** ve arayüzde "Bağlı değil" yazar |
| Hareket takibi, video arka plan kaldırma, AI otomatik kurgu, süper çözünürlük | ⏳ / ☁️ | Yapılmadı; uygun açık lisanslı mobil model ve gerçek cihaz ölçümü gerekir |

## 7. Kütüphane boyutları (önce kalite)

| Kütüphane | Hedef | Mevcut | Durum | Kanıt |
|---|---|---|---|---|
| Filtreler | ≥100 | 116 | ✅ | B (`filters.test.mjs`: benzersizlik, taşma/düzleşme, ten tonu, ≥ 0,04 ortalama fark) |
| Efektler | ≥100 | 122 (12 kategori) | ✅ (sayı) / 🟡 (cihazda görsel) | L (4 sahne + 9:16, 56 animasyonlu efektte zamansal kararlılık) + B; performans: 70 hafif, 30 orta, 1+5 yoğun (SwiftShader medyanı); D (CI #52) |
| Geçişler | ≥80 | 93 (12 kategori) | ✅ (sayı) / 🟡 (cihazda görsel) | L (dikey/yatay/siyah bantlı kanvasta kontak sayfaları; p=0/1 uçları ≤ 0,6/255) + B; D (CI #51–52) |
| Metin şablonları | ≥60 | 97 | ✅ (sayı) / 🟡 (cihazda görsel) | B |
| Ses ön ayarları | ≥40 | 54 | ✅ (sayı) / 🟡 (cihazda dinleme) | B + J |

## 8. Fotoğraf düzenleyici

| Özellik | Durum | Kanıt / sınırlama |
|---|---|---|
| Çalışma alanı (Video / Fotoğraf), proje listesi, yeniden adlandır/çoğalt/onaylı sil | 🟡 | D; e2e 8_fotograf |
| Tahribatsız katmanlar (görsel, metin, çıkartma, şekil), sıra, gizle, çoğalt, sil, geri al/yinele, otomatik kayıt, yeniden açma | ✅ (model) / 🟡 (arayüz) | B (`photo.test.mjs`: katman işlemleri, taşıma, isabet testi, döndürme/çevirme/kırpma eşlemesi); arayüz e2e 8 |
| Kırp (9 oran, yakınlaştır, kaydır), düzelt, 90° döndür, çevir; kanvas kırpmaya uyar | ✅ (hesap) / 🟡 (çizim) | B; çizim cihazda/emülatörde 8. akışla (çıktı 1080×1080 denetimi) |
| 10 kanvas boyutu, arka plan rengi/saydamlık, çerçeve | 🟡 | B + D |
| Ayarlar (12 + bulanıklık), filtre/LUT, HSL (8 bant), renk dereceleme, vinyet, gren, keskinlik | 🟡 | J (`ImageOpsTest`: her işlem ölçümlü); Android Canvas çizimi D |
| Karışım modları (11) ve opaklık | 🟡 | D; Android 9 ve öncesinde temel modlar |
| JPG/PNG dışa aktarma, galeri (Pictures/Kurgu), paylaş | 🟡 | e2e 8 (çıktı boyutu run.sh'ta denetlenir) |
| AI: arka plan kaldırma, nesne silme, otomatik iyileştirme, görsel üretme | Bölüm 6 | — |

## 9. Son CI sonuçları

**CI #52** (2026-10-20, 522e96c — tüm paketler dahil, Android 14 emülatörü):

| Akış | Sonuç |
|---|---|
| 2 — Dil / RTL | ✅ GEÇTİ |
| 3 — AI araçları (sahne, sessizlik, TTS, ses efekti ön ayarı + ses düzeyi anahtar karesi, ters oynatma) | ✅ GEÇTİ |
| 4 — Otomatik altyazı | ✅ GEÇTİ |
| 5 — Performans | ✅ GEÇTİ (p50 61 ms, p90 250 ms, %73 takılan kare, PSS ~155 MB — yazılımsal GPU, gerçek cihaz değil) |
| 1 — Kabul (dışa aktarma dahil) | ❌ Çok katmanlı önizleme sonu çökmesi (H-16) devam etti; ek düzeltme 5dd608b, sonraki CI'da |
| 6 — Katmanlar | ❌ (aynı çökme zincirinden etkilenmiş olabilir) |
| 7 — Seslendirme, 8 — Fotoğraf | ❌ Emülatörde "Process system isn't responding" sistem penceresi (önceki çökme sonrası emülatör kararsızlığı); uygulama adımlarına ulaşılamadı |

Önizlemedeki `FAILED_RUNTIME_CHECK` hatası (H-8) CI #42'den beri görülmüyor.

## 10. Teslim

APK her CI çalıştırmasında **Actions → ilgili çalıştırma → Artifacts → `Kurgu-apk`**
olarak üretilir. Herkese açık sürüm (release) yayımlanmadı.
