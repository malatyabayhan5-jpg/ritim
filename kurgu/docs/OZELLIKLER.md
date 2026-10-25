# Kurgu — Özellik envanteri

**Kaynak notu.** referans uygulamanın resmî Play Store sayfasına bu geliştirme ortamından
erişilemedi. Karşılaştırma için yalnızca referans uygulamanın Android sürümlerinin mağaza
açıklamasını yansıtan APKMirror listeleri kullanıldı (ör. 18.0.0 sürümü:
otomatik altyazı, arka plan kaldırma, tüm ayarlarda anahtar kare, 0,1x–100x hız
ve hız eğrisi, optik akış, chroma key, sabitleme, çok izli zaman çizelgesi,
metinden konuşma, hareket takibi). Bu listede bulunmayan referans uygulama özellikleri
"doğrulanmadı" olarak işaretlenmiştir. Hiçbir özellik uydurulmamıştır.

**Durum değerleri** (`PROGRESS.md` ile aynıdır, o dosya esas kaynaktır):
✅ tamamlandı ve test edildi · 🟡 kısmen tamamlandı (çalışan ve eksik/doğrulanmamış kısım Sınırlama sütununda) ·
⏳ geliştirme bekliyor (uygulamada yok ya da "Planlandı" olarak gösterilir) ·
☁️ dış servis veya donanım gerektiriyor (bu ortamda doğrulanamaz).
Kodun var olması tek başına ✅ sayılmaz; yalnızca derlenen ya da testi olmayan satırlar 🟡'dir.
**Test değerleri:** B = birim testi (Node, CI) · J = masaüstü JVM testi (`npm run test:dsp`: DSP, animasyon, görüntü işleme) ·
L = WebGL efekt laboratuvarı (`tools/fx-lab`) · D = CI'da APK derlemesi (işlevsel test sayılmaz) ·
E = Android 14 emülatöründe Maestro uçtan uca akışı · — = test yok.
**Gerçek Android cihazında hiçbir ölçüm veya test yapılmamıştır** (bkz. README, Kabul testi); tüm "cihazda görsel/işitsel doğrulama" maddeleri açıktır.

**Son CI sonucu (CI #52, 2026-10-20, 522e96c; Android 14, API 34, yazılımsal GPU):**
Dil/RTL, AI araçları (sahne, sessizlik, TTS, ses efekti ön ayarı + ses düzeyi anahtar karesi, ters oynatma),
otomatik altyazı ve performans akışları GEÇTİ. Kabul akışı (dışa aktarma dahil) çok katmanlı önizleme sonu
çökmesi (H-16) nedeniyle **geçmedi**; ek düzeltme 5dd608b sonraki CI'da sınanacak. Katmanlar, seslendirme ve
fotoğraf akışları da geçmedi (çökme zincirinin etkisi ya da emülatör kararsızlığı; uygulama adımlarına ulaşılamadı).
Geçişli projede dışa aktarma `MUXING_TIMEOUT` ile takılıyor (BUG_FIXES.md H-12, açık).
Performans (yazılımsal GPU, gerçek cihaz değil): p50 61 ms, p90 250 ms, %73 takılan kare, PSS ~155 MB.

Tüm özellikler v1'de ücretsizdir; ücretli katman ayrımı için altyapı henüz yoktur (⏳).

## Proje ve ana ekran

| Özellik | İşlev | Mobil | Masaüstü karşılığı | Motor | Yerel/Bulut | Durum | Test | Sınırlama |
|---|---|---|---|---|---|---|---|---|
| Yeni proje | Galeriden çoklu seçimle proje | Evet | Dosya sürükle-bırak | JS | Yerel | ✅ | E | — |
| Proje listesi | Kapak, ad, göreli tarih, süre, oran | Evet | Proje tarayıcı | JS | Yerel | ✅ | E | — |
| Çalışma alanı: Video / Fotoğraf | Proje listesi iki alana ayrılır | Evet | Aynı | JS | Yerel | 🟡 | D, E | Fotoğraf akışı (8) son CI'da emülatör kararsızlığı nedeniyle geçmedi |
| Filtreler: Tümü / Taslaklar / Dışa aktarılanlar | Proje süzme | Evet | Aynı | JS | Yerel | 🟡 | — | "Taslak" = hiç dışa aktarılmamış; testi yok |
| Aç / yeniden adlandır / kopyala / sil (onaylı) | Proje yönetimi | Evet | Aynı | JS | Yerel | 🟡 | — | Testi yok |
| Otomatik kayıt | Her değişiklik 0,7 sn içinde atomik yazılır | Evet | Aynı | JS | Yerel | ✅ | B | — |
| Çökme sonrası kurtarma | Bozuk kayıtta yedekten açma | Evet | Aynı | JS | Yerel | 🟡 | — | Bir önceki kayıt tutulur; testi yok |
| Proje paketi dışa/içe aktarma | `.kurgu.json` (medyasız) | Evet | Aynı biçim | JS | Yerel | 🟡 | — | Medya pakete gömülmez; yeniden bağlanır |
| Şablonlar | Medya seçilince düzenlenebilir proje | Evet (6 özgün şablon) | Aynı | JS | Yerel | 🟡 | B | Kullanıcının kendi şablonunu kaydetmesi ⏳; çevrimiçi kütüphane ⏳ |
| AI araçları sayfası | Araçların durumu ve çalışma biçimi; çalışan araçlar "Hazır", diğerleri "Planlandı" / "Bağlı değil" | Evet | Aynı | — | Karışık | 🟡 | B, E | Sessizlik kaldırma, sahne algılama, metinden konuşma, otomatik altyazı ✅; arka plan kaldırma, nesne silme, otomatik iyileştirme, altyazı çevirisi 🟡; metinden görsel üretme ☁️ (kullanıcının sunucusu gerekir); hareket takibi, video arka plan kaldırma, AI otomatik kurgu, süper çözünürlük ⏳ — ayrıntı "Altyazı ve AI" bölümünde |
| Ayarlar, yardım, sürüm | Dil, önizleme kalitesi, depolama, gizlilik | Evet | Aynı | JS | Yerel | 🟡 | E (dil) | Dil değişimi E ile doğrulandı; diğer ayarların testi yok |

## İçe aktarma

| Özellik | İşlev | Durum | Test | Sınırlama |
|---|---|---|---|---|
| Galeri (Android Photo Picker) | Video + foto, çoklu, sıralı seçim, izinsiz | ✅ | E | Albüm/filtre arayüzü sistem seçicisine aittir |
| Dosya yöneticisi | Video, görsel, ses (SAF) | 🟡 | — | Emülatörde dosya seçici otomatikleştirilemedi |
| Medya incelemesi | Süre, çözünürlük, döndürme, kodek, fps, HDR, ses varlığı | 🟡 | D | Derleniyor; ayrı işlevsel testi yok |
| Desteklenmeyen kodek uyarısı | Cihaz çözemiyorsa açıklamalı hata | 🟡 | — | Dönüştürme seçeneği ⏳ |
| Eksik medyayı yeniden bağlama | Uyarı + dosya seçimi | 🟡 | — | Testi yok |
| Büyük dosyalar | Galeri önbellek kopyası taşınır, belleğe yüklenmez | 🟡 | — | Büyük dosyayla ölçüm yok |

## Zaman çizelgesi

| Özellik | Durum | Test | Sınırlama |
|---|---|---|---|
| Ana video izi (manyetik) | ✅ | B | — |
| Ses şeritleri (çoklu, çakışan sesler ayrı şeritte) | ✅ | B | — |
| Metin şeritleri | ✅ | B | — |
| Efekt şeritleri (çakışan efektler ayrı şeritte) | ✅ | B, E | — |
| Üst video/fotoğraf katmanları (resim içinde resim), 6 şerit, şerit değiştirme | ✅ | B, E (6_katmanlar; CI #37–39) | Dışa aktarılan videoda katman konumu ve süresi `layer_check.py` ile doğrulandı. Son CI'da (#52) 6. akış çökme zincirinden etkilendi |
| Şerit sayısı alanı aşınca dikey kaydırma | ✅ | E | — |
| Klip ekleme / silme / çoğaltma / bölme | ✅ | B, E | — |
| Kenar tutamaçlarıyla kırpma | ✅ | B | — |
| Uzun basıp sürükleyerek yeniden sıralama / taşıma | 🟡 | — | Testi yok |
| İki parmakla yakınlaştırma | 🟡 | — | Testi yok |
| Küçük resim şeridi (sanallaştırılmış, disk önbellekli) | 🟡 | D | Derleme; cihazda ölçüm yok |
| Dalga biçimi | 🟡 | D | Derleme; cihazda ölçüm yok |
| İşaretçiler | ✅ | B | — |
| Manyetik hizalama (ses/metin taşırken) | ✅ | B | — |
| Geri al / yinele (100 adım) | ✅ | B | — |
| Geçişlerin zaman çizelgesinde yönetimi | ✅ | B | — |
| Kare hassasiyetinde konumlandırma | 🟡 | — | Yakınlaştırma ile; kare adım düğmesi ⏳ |
| Gruplama | ⏳ | — | — |
| Zaman çizelgesinde anahtar kare gösterimi | ⏳ | — | Anahtar kareler ayrı panelden düzenlenir (bkz. Düzenleme) |
| Video zaman çizelgesinde şekil katmanı | ⏳ | — | Şekiller yalnızca fotoğraf düzenleyicide var |

## Düzenleme

| Özellik | Durum | Motor | Sınırlama |
|---|---|---|---|
| Kesme, kırpma, birleştirme (sıralı) | ✅ | Media3 ClippingConfiguration | B, E |
| Döndürme (90°), yatay/dikey çevirme | 🟡 | ScaleAndRotateTransformation | Derleme; ayrı test yok |
| Ölçek ve konum | ✅ | MatrixTransformation | Anahtar karelenebilir (aşağıda) |
| Sığdır / doldur, en-boy oranı (9:16, 16:9, 1:1, 4:5, 4:3, 3:4, 21:9) | 🟡 | Presentation | Arka plan rengi/bulanık arka plan ⏳ |
| Sabit hız 0,1x–10x (ses perdesi korunur) | ✅ | Media3 SpeedProvider | B (süre integrali, ters eşleme, bölme sürekliliği); 0,1x–10x ile sınırlı (100x ⏳) |
| Hız eğrileri: 8 hazır + 5 noktalı düzenleme | ✅ | SpeedProvider | B; optik akış ⏳ |
| Kare dondurma | ✅ | Kare → görsel klip | B, E |
| Ters oynatma (cihaz içi yeniden kodlama) | ✅ | Media3 yeniden kodlama | E (CI #52, 3. akış: 2,2 sn klip → 66 kare + ses). Android 9+ |
| Sesi ayırma (videodan) | ✅ | Ayrı ses dizisi | E (ses katmanı bu yolla test edildi) |
| Sessize alma, ses düzeyi | ✅ | GainProcessor | B; düzey kaydırıcısı 0–100%, üzeri için ses efektlerinde kazanç (bkz. Ses) |
| Klip değiştirme | 🟡 | — | Testi yok |
| Anahtar kareler: katman (konum, ölçek, döndürme, opaklık); ana iz (konum, ölçek, açı, opaklık); efekt yoğunluğu; ses düzeyi. Doğrusal / Bézier / basamak | ✅ | JS + Java ortak değerlendirme | B + J (`tests/fixtures/keyframes.txt`) |
| Katman maskeleri: dikdörtgen, yuvarlak dikdörtgen, elips, doğrusal, ayna, kalp, yıldız; ters, yumuşatma | ✅ | Shader | B; E (daire maskesi dışında katman görünmüyor: 0,00) |
| Chroma key (CbCr uzaklığı + taşma bastırma, otomatik anahtar renk) | 🟡 | Shader | B + J (`KeyColorTest`) + laboratuvar; emülatörde görsel doğrulama yok |
| Katman opaklığı | ✅ | Alfa karışımı | B, E |
| Video karışım modları | ⏳ | — | Media3 1.9 `DefaultVideoCompositor` yalnızca alfa karışımı yapar ve `MultipleInputVideoGraph` içinde değiştirilemez; özel birleştirici gerekir. Fotoğraf düzenleyicide 11 karışım modu vardır |
| Bölünmüş ekran, kolaj şablonları | ⏳ | — | Üst katmanlarla elle yapılabilir; hazır düzen yok |
| J-cut / L-cut | 🟡 | — | Sesi ayırıp ses klibini kaydırarak yapılabilir |
| Hareket takibi, optik akış | ⏳ | — | Uygun açık lisanslı mobil model ve gerçek cihaz ölçümü gerekir |

## Metin, çıkartma, şekil

| Özellik | Durum | Sınırlama |
|---|---|---|
| Çok satırlı, düzenlenebilir metin katmanı | ✅ (B) | — |
| 8 yazı tipi ailesi, kalın, italik, boyut | 🟡 | Özel yazı tipi içe aktarma ⏳ |
| Renk, opaklık, arka plan kutusu, kontur, gölge | 🟡 | Cihazda görsel doğrulama yok |
| Hizalama, harf ve satır aralığı, döndürme | 🟡 | Cihazda görsel doğrulama yok |
| Önizlemede sürükleme, iki parmakla ölçek/döndürme | 🟡 | Testi yok |
| 97 metin şablonu (42 stil + 55 düzen, 13 kategori; başlık, alt bant, altyazı, jenerik, çağrı vb.) | 🟡 | B (`text.test.mjs`: sayı, renk geçerliliği, metin/kutu karşıtlığı ≥ 3:1, üç dil). Görünüm PIL taslaklarıyla incelendi; **cihazda çizim görülmedi** |
| Metin animasyonları: 20 giriş, 20 çıkış, 5 döngü (kelime/harf, daktilo imleci, bulanıklık, dalga…) | 🟡 | J (`TextAnimTest`, 14.131 denetim; eski animasyonlar birebir korunur; Arapça kelime bazlı). Cihazda görsel doğrulama yok |
| Türkçe karakter, Arapça birleştirme/RTL, emoji | ✅ | E (2_dil_rtl); B (çeviri kapsamı 1277 anahtar × 3 dil). Android metin motoru |
| Çıkartmalar (emoji, video ve fotoğraf) | 🟡 | Kod + B (fotoğraf modeli); emülatörde fotoğraf akışında metin adımı var |
| Şekiller | 🟡 | Fotoğraf düzenleyicide 8 şekil (dikdörtgen, yuvarlak dikdörtgen, elips, üçgen, yıldız, kalp, çizgi, ok) B; video zaman çizelgesinde şekil ⏳ |

## Geçişler, filtreler, efektler, renk

| Özellik | Durum | Sınırlama |
|---|---|---|
| 93 geçiş, 12 kategori; gerçek A/B geçişleri (iki klip üst üste biner), süre ayarlı, "Tümüne uygula", zaman çizelgesinde yönetim | 🟡 | B + L (her geçiş laboratuvarda karelerle denetlendi; p=0/1 uçları ≤ 0,6/255); D (CI #51–52). Önizlemede çalışır; **geçişli projelerde dışa aktarma takılıyor** (MUXING_TIMEOUT, H-12 açık). Cihazda görsel doğrulama yok |
| Maskeli geçişler | ⏳ | — |
| 116 filtre (kategorili, yoğunluk ayarlı) | ✅ | B (`filters.test.mjs`: benzersizlik, taşma/düzleşme, ten tonu, ≥ 0,04 ortalama fark). Cihazda görsel doğrulama ayrıca yapılmadı |
| 122 GPU efekti, 12 kategori (parıltı, ışık sızıntısı, dijital bozulma, VHS, renk sapması, kamera sarsıntısı, minyatür, eski film, CRT, neon kontur, çizgi roman, kaleydoskop, su dalgası, bulanıklıklar, kar, yağmur, ışıltı, anamorfik parlama, çift ton, mozaik vb.), gerçek önizleme küçük resimleri, efekt başına parametreler + yoğunluk | ✅ (sayı, L + B) / 🟡 (cihazda görsel) | L (4 sahne + 9:16, 56 animasyonlu efektte zamansal kararlılık); performans: 70 hafif, 30 orta, 1+5 yoğun (SwiftShader medyanı); D (CI #52). Gerçek cihaz performansı ölçülmedi |
| Ağır efektler için iki geçişli (yarım çözünürlüklü ön geçiş) işleme | ✅ | L: `tools/fx-lab/perf-baseline.json` (göreli süre) |
| Klip efekt yığını (en fazla 4 efekt üst üste) | ✅ | B |
| Efekt katmanı şeridi: süreli, taşınabilir, kırpılabilir, bölünebilir, çoğaltılabilir | ✅ | B, E |
| Canlı parametreler: kaydırıcı sürüklerken önizleme yeniden kurulmaz | ✅ | B (`live.test.mjs`); E (5_performans) |
| Renk: parlaklık, kontrast, doygunluk, pozlama, sıcaklık, renk tonu, vurgular, gölgeler, solukluk, keskinlik, vinyet, gren | 🟡 | Cihazda görsel doğrulama yok |
| 3B LUT (.cube) içe aktarma, klip başına LUT + yoğunluk, tümüne uygula | ✅ (B, L) | 2–65 boyut; dosya cihazda kalır. Emülatörde dosya seçici otomatikleştirilemediği için E testi yok |
| Otomatik iyileştirme (video + fotoğraf) | 🟡 | B (`enhance.test.mjs`) + D; cihazda görsel doğrulama yok |
| Öncesi/sonrası karşılaştırma, HDR uçtan uca | ⏳ | HDR kaynak SDR'ye ton eşlenir |
| Efekt favorileri / arama | ⏳ | — |

L: aynı shader'lar efekt laboratuvarında (WebGL, SwiftShader) referans hesapla karşılaştırıldı; gerçek GPU değildir.

## Ses

| Özellik | Durum | Sınırlama |
|---|---|---|
| Müzik/ses dosyası ekleme | 🟡 | Lisanslı müzik kütüphanesi yok (yalnızca kullanıcının dosyaları). Emülatör testinde dosya seçiciden seçim otomatikleştirilemedi; ses katmanı "videodan ses ayırma" ile test edildi |
| Çok katmanlı ses miksajı | ✅ (B) | — |
| Ses düzeyi, yavaşça açılma/kapanma | ✅ (B) | — |
| Ses düzeyi anahtar kareleri | ✅ | B (değerlendirme, render tanımı, bölmede kaydırma) + J (paylaşılan `Keyframes.java`); E (3. akış) |
| Ses kırpma, bölme, taşıma, hız | ✅ (B) | — |
| Dalga biçimi | 🟡 | D |
| Ses efektleri: 14 efekt (EQ, kompresör, sınırlayıcı, kapı, doyum, bit azaltma, halka modülasyonu, bant geçiren, koro/flanger, gecikme/ping-pong, yankı, genişletici, kazanç, perde) | 🟡 | J (`AudioFxTest`, 7596 denetim: EQ tepkisi tasarıma 0,000 dB, kompresör eğrisi ±0,3 dB, sınırlayıcı tavanı aşılmaz, yankı RT60 artan, NaN/taşma yok). Kotlin işlemcisi D; **cihazda dinlenmedi**; perde (Sonic) uzunluğu cihazda doğrulanmadı |
| 54 ses ön ayarı (ses, müzik, efekt, temizlik) | 🟡 | B (ön ayarlar birbirinden ayrık) + J; E (3. akışta ön ayar uygulandı); cihazda dinleme yok |
| %100 üzeri ses | 🟡 | Ses efektlerindeki kazanç (+12 dB, sınırlayıcıyla); düzey kaydırıcısı 0–100% |
| Mikrofonla seslendirme (izin, seviye ölçer, oynatma kafasından kayıt) | 🟡 | D; e2e 7_seslendirme akışı son CI'da emülatör kararsızlığı nedeniyle geçmedi; gerçek mikrofon ☁️ donanım gerektirir |
| Gürültü azaltma (cihaz içi spektral, klip ve ses klibi başına güç ayarı) | ✅ | J (duraklamada 9–18 dB düşüş, konuşma kaybı < 0,1 dB). Sabit gürültüye (uğultu, fan, hışırtı) yöneliktir; ani gürültüleri (köpek, korna) ayırmaz |
| Normalizasyon | ⏳ | Ayrı normalizasyon aracı yok (kompresör/sınırlayıcı efekti var) |

## Altyazı ve AI

| Özellik | Durum | Çalışma biçimi / test |
|---|---|---|
| Otomatik altyazı (Türkçe, İngilizce, Arapça; otomatik dil) | ✅ | Cihaz içi whisper.cpp; model ilk kullanımda onayla indirilir (Hızlı ~57 MB / Daha doğru ~181 MB), SHA-256 doğrulanır. 64 bit cihaz gerekir. E (CI #29: konuşma kelimesi kelimesine doğru; CI #52: 4. akış GEÇTİ) |
| Altyazı düzenleme listesi (metin düzenle, zamana git, sil) | 🟡 | Kod + D; e2e adımı yok |
| SRT içe/dışa aktarma | ✅ | B (`srt.test.mjs`: gidiş-dönüş, BOM, bozuk blok). VTT dışa aktarma ⏳ |
| Altyazı çevirisi | 🟡 | Cihaz içinde yalnızca **İngilizceye** (whisper "translate"); D. Diğer hedef diller ☁️ (yapılmadı) |
| Sessizlik kaldırma | ✅ | B + E (CI #29, #52); cihaz içi ses analizi, uyarlamalı eşik |
| Sahne algılama (sahnelere böl) | ✅ | B + E (CI #29, #52); cihaz içi, donanım kod çözücü + histogram farkı |
| Metinden konuşma (seslendirme) | ✅ | B + E (CI #29, #52); cihazın kendi TTS motoru, dilin sesi cihazda yüklü olmalı |
| Gürültü azaltma | ✅ | J; bkz. Ses |
| Otomatik iyileştirme (video + fotoğraf) | 🟡 | B (`enhance.test.mjs`) + D; cihazda görsel doğrulama yok |
| Arka plan kaldırma (fotoğraf, TFLite kişi modeli) | 🟡 | D; e2e 8_fotograf modeli çalıştırır (test görselinde kişi yok → "kişi bulunamadı" beklenir). Gerçek portrede kalite cihazda görülmedi. Videoda ⏳ |
| Nesne silme (fotoğraf, klasik doldurma) | 🟡 | J (`ImageOpsTest`: düz zemin/degrade doldurma) + D; üretken değildir, büyük alanlarda doku üretmez |
| Metinden görsel üretme (bulut) | ☁️ | Altyapı + örnek vekil sunucu hazır (B: sahte sağlayıcıyla). **Kullanıcının kendi sunucusu** ve sağlayıcı anahtarı olmadan çalışmaz; uygulamada anahtar yoktur ve arayüzde "Bağlı değil" yazar; maliyet ve veri aktarımı kullanıcıya gösterilir |
| Hareket takibi, video arka plan kaldırma, AI otomatik kurgu, süper çözünürlük | ⏳ / ☁️ | Yapılmadı; uygun açık lisanslı mobil model ve gerçek cihaz ölçümü gerekir |
| AI video üretimi, avatar, dudak senkronu | ⏳ / ☁️ | Yapılmadı; bulut servisi gerekir |

## Fotoğraf düzenleyici

| Özellik | Durum | Sınırlama |
|---|---|---|
| Çalışma alanı (Video / Fotoğraf), proje listesi, yeniden adlandır/çoğalt/onaylı sil | 🟡 | D; e2e 8_fotograf (son CI'da geçmedi) |
| Tahribatsız katmanlar (görsel, metin, çıkartma, şekil), sıra, gizle, çoğalt, sil, geri al/yinele, otomatik kayıt, yeniden açma | ✅ (model, B) / 🟡 (arayüz) | B (`photo.test.mjs`: katman işlemleri, taşıma, isabet testi, döndürme/çevirme/kırpma eşlemesi); arayüz e2e 8 |
| Kırp (9 oran, yakınlaştır, kaydır), düzelt, 90° döndür, çevir; kanvas kırpmaya uyar | ✅ (hesap, B) / 🟡 (çizim) | Çizim emülatörde 8. akışla (çıktı 1080×1080 denetimi) sınanır; son CI'da çalışmadı |
| 10 kanvas boyutu, arka plan rengi/saydamlık, çerçeve | 🟡 | B + D |
| Ayarlar (12 + bulanıklık), HSL (8 bant), renk dereceleme, vinyet, gren, keskinlik | 🟡 | J (`ImageOpsTest`: her işlem ölçümlü); Android Canvas çizimi D |
| Filtreler (116) ve 3B LUT | 🟡 | B + J; cihazda görsel doğrulama yok |
| Karışım modları (11: normal, çarpma, ekran, kaplama, koyulaştır, açıklaştır, ekle, fark, yumuşak ışık, renk, parlaklık) ve opaklık | 🟡 | D; Android 9 ve öncesinde yalnızca temel modlar |
| JPG/PNG dışa aktarma, galeri (Pictures/Kurgu), paylaş | 🟡 | e2e 8 (çıktı boyutu run.sh'ta denetlenir); son CI'da geçmedi |
| AI: arka plan kaldırma, nesne silme, otomatik iyileştirme, görsel üretme | Bkz. "Altyazı ve AI" | — |

## Dışa aktarma

| Özellik | Durum | Sınırlama |
|---|---|---|
| MP4 (H.264 + AAC) | 🟡 | Daha önceki emülatör turunda dışa aktarılan MP4 ffmpeg ile hatasız çözüldü; ancak son CI'da (#52) kabul akışı çökme (H-16) yüzünden geçmedi ve geçişli projelerde dışa aktarma takılıyor (H-12, açık) |
| H.265/HEVC, AV1 | 🟡 | Yalnızca cihazda donanım kodlayıcı varsa gösterilir; ☁️ donanım gerektirir |
| 720p / 1080p / 1440p / 4K | 🟡 | Cihazın kodlayıcısının desteklemediği birleşimler kilitli; gerçek cihazda denenmedi |
| 24/25/30/50/60 fps | 🟡 | Kaynağın kare hızından yüksek fps kare üretmez |
| Kalite (bit hızı), tahmini boyut, boş alan kontrolü | 🟡 | Testi yok |
| İlerleme, kalan süre, iptal, bildirim, ön plan hizmeti | 🟡 | Testi yok |
| Çıktı doğrulama (süre, çözünürlük, ses, boyut) | 🟡 | Uygulamanın kendi denetimi önceki emülatör turunda geçti; son CI'da kabul akışı geçmedi |
| Galeriye kaydetme (Filmler/Kurgu), paylaşma | 🟡 | Testi yok |
| MOV, özel çözünürlük, ses kodeği seçimi | ⏳ | — |

## Yerelleştirme

| Özellik | Durum | Test |
|---|---|---|
| Türkçe (varsayılan), İngilizce, Arapça — tüm arayüz | ✅ | B (katalog kapsamı: 1277 anahtar × 3 dil), CI denetimi |
| Cihaz dilini algılama, desteklenmiyorsa Türkçe | ✅ | B |
| Ayarlardan anında dil değişimi (yeniden başlatma yok, proje açık kalır) | ✅ | E (2_dil_rtl, CI #52 GEÇTİ) |
| Arapçada RTL arayüz; zaman çizelgesi LTR | ✅ | E (Arapça ekranlar doğrulandı); yerleşimin görsel incelemesi henüz yapılmadı |
| Çoğul biçimler (Arapça 6 biçim) | ✅ | B |
| Tarih/sayı/boyut biçimleri | ✅ | B |
| Gömülü metin denetimi | ✅ | CI (`npm run i18n:check`) |
