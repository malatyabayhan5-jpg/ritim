# Kurgu — Özellik envanteri

**Kaynak notu.** CapCut'ın resmî Play Store sayfasına bu geliştirme ortamından
erişilemedi. Karşılaştırma için yalnızca CapCut Android sürümlerinin mağaza
açıklamasını yansıtan APKMirror listeleri kullanıldı (ör. 18.0.0 sürümü:
otomatik altyazı, arka plan kaldırma, tüm ayarlarda anahtar kare, 0,1x–100x hız
ve hız eğrisi, optik akış, chroma key, sabitleme, çok izli zaman çizelgesi,
metinden konuşma, hareket takibi). Bu listede bulunmayan CapCut özellikleri
"doğrulanmadı" olarak işaretlenmiştir. Hiçbir özellik uydurulmamıştır.

**Durum değerleri:** ✅ uygulandı · 🟡 kısmen · ⏳ planlandı (çalışmıyor, uygulamada "Planlandı" olarak gösterilir).
**Test değerleri:** B = birim testi (Node, CI) · D = CI'da derleme · E = emülatör uçtan uca · — = test yok.
Gerçek cihaz testi bu sürümde **yapılmamıştır** (bkz. README, Kabul testi).

**Son emülatör sonucu (Android 14, API 34, x86_64):** kabul akışı GEÇTİ, dil/RTL akışı GEÇTİ.
Dışa aktarılan MP4 cihazdan alınıp ffmpeg ile baştan sona hatasız çözüldü (H.264 + AAC, 30 fps);
uygulamanın kendi süre/çözünürlük/ses denetimi de geçti. Çökme kaydı yok.

Tüm özellikler v1'de ücretsizdir; ücretli katman ayrımı için altyapı henüz yoktur (⏳).

## Proje ve ana ekran

| Özellik | İşlev | Mobil | Masaüstü karşılığı | Motor | Yerel/Bulut | Durum | Test | Sınırlama |
|---|---|---|---|---|---|---|---|---|
| Yeni proje | Galeriden çoklu seçimle proje | ✅ | Dosya sürükle-bırak | JS | Yerel | ✅ | E | — |
| Proje listesi | Kapak, ad, göreli tarih, süre, oran | ✅ | Proje tarayıcı | JS | Yerel | ✅ | E | — |
| Filtreler: Tümü / Taslaklar / Dışa aktarılanlar | Proje süzme | ✅ | Aynı | JS | Yerel | ✅ | — | "Taslak" = hiç dışa aktarılmamış |
| Aç / yeniden adlandır / kopyala / sil (onaylı) | Proje yönetimi | ✅ | Aynı | JS | Yerel | ✅ | — | — |
| Otomatik kayıt | Her değişiklik 0,7 sn içinde atomik yazılır | ✅ | Aynı | JS | Yerel | ✅ | B | — |
| Çökme sonrası kurtarma | Bozuk kayıtta yedekten açma | ✅ | Aynı | JS | Yerel | ✅ | — | Bir önceki kayıt tutulur |
| Proje paketi dışa/içe aktarma | `.kurgu.json` (medyasız) | ✅ | Aynı biçim | JS | Yerel | 🟡 | — | Medya pakete gömülmez; yeniden bağlanır |
| Şablonlar | Medya seçilince düzenlenebilir proje | ✅ (6 özgün şablon) | Aynı | JS | Yerel | 🟡 | B | Kullanıcının kendi şablonunu kaydetmesi ⏳; çevrimiçi kütüphane ⏳ |
| AI araçları sayfası | Araçların durumu ve çalışma biçimi | ✅ | Aynı | — | — | 🟡 | — | Araçların hiçbiri çalışmıyor (⏳) |
| Ayarlar, yardım, sürüm | Dil, önizleme kalitesi, depolama, gizlilik | ✅ | Aynı | JS | Yerel | ✅ | — | — |

## İçe aktarma

| Özellik | İşlev | Durum | Test | Sınırlama |
|---|---|---|---|---|
| Galeri (Android Photo Picker) | Video + foto, çoklu, sıralı seçim, izinsiz | ✅ | E | Albüm/filtre arayüzü sistem seçicisine aittir |
| Dosya yöneticisi | Video, görsel, ses (SAF) | ✅ | — | — |
| Medya incelemesi | Süre, çözünürlük, döndürme, kodek, fps, HDR, ses varlığı | ✅ | D | — |
| Desteklenmeyen kodek uyarısı | Cihaz çözemiyorsa açıklamalı hata | ✅ | — | Dönüştürme seçeneği ⏳ |
| Eksik medyayı yeniden bağlama | Uyarı + dosya seçimi | ✅ | — | — |
| Büyük dosyalar | Galeri önbellek kopyası taşınır, belleğe yüklenmez | ✅ | — | — |

## Zaman çizelgesi

| Özellik | Durum | Test | Sınırlama |
|---|---|---|---|
| Ana video izi (manyetik) | ✅ | B | — |
| Ses şeritleri (çoklu, çakışan sesler ayrı şeritte) | ✅ | B | — |
| Metin şeritleri | ✅ | B | — |
| Efekt şeritleri (çakışan efektler ayrı şeritte) | ✅ | B, E* | — |
| Şerit sayısı alanı aşınca dikey kaydırma | ✅ | E* | — |
| Klip ekleme / silme / çoğaltma / bölme | ✅ | B, E | — |
| Kenar tutamaçlarıyla kırpma | ✅ | B | — |
| Uzun basıp sürükleyerek yeniden sıralama / taşıma | ✅ | — | — |
| İki parmakla yakınlaştırma | ✅ | — | — |
| Küçük resim şeridi (sanallaştırılmış, disk önbellekli) | ✅ | D | — |
| Dalga biçimi | ✅ | D | — |
| İşaretçiler | ✅ | B | — |
| Manyetik hizalama (ses/metin taşırken) | ✅ | B | — |
| Geri al / yinele (100 adım) | ✅ | B | — |
| Geçişlerin zaman çizelgesinde yönetimi | ✅ | B | — |
| Kare hassasiyetinde konumlandırma | 🟡 | — | Yakınlaştırma ile; kare adım düğmesi ⏳ |
| Gruplama, ayrı video katmanları (overlay) | ⏳ | — | Çok girdili birleştirici gerekir |
| Anahtar kare gösterimi | ⏳ | — | — |

## Düzenleme

| Özellik | Durum | Motor | Sınırlama |
|---|---|---|---|
| Kesme, kırpma, birleştirme (sıralı) | ✅ | Media3 ClippingConfiguration | — |
| Döndürme (90°), yatay/dikey çevirme | ✅ | ScaleAndRotateTransformation | — |
| Ölçek ve konum | ✅ | MatrixTransformation | Sabit; anahtar kare ⏳ |
| Sığdır / doldur, en-boy oranı (9:16, 16:9, 1:1, 4:5, 4:3, 3:4, 21:9) | ✅ | Presentation | Arka plan rengi/bulanık arka plan ⏳ |
| Hız 0,1x–10x (ses perdesi korunur) | ✅ | Media3 SpeedProvider | CapCut 0,1x–100x; hız eğrisi ⏳ |
| Kare dondurma | ✅ | Kare → görsel klip | — |
| Sesi ayırma (videodan) | ✅ | Ayrı ses dizisi | — |
| Sessize alma, ses düzeyi | ✅ | GainProcessor | %100 üzeri yükseltme ⏳ |
| Klip değiştirme | ✅ | — | — |
| Ters oynatma | ⏳ | — | Ters kodlama adımı gerekir |
| J-cut / L-cut | 🟡 | — | Sesi ayırıp ses klibini kaydırarak yapılabilir |
| Resim içinde resim, bölünmüş ekran, kolaj, maske, karışım modları, opaklık | ⏳ | — | Çok girdili birleştirici |
| Anahtar kare, hız eğrisi, optik akış, ease/Bezier | ⏳ | — | — |

## Metin

| Özellik | Durum | Sınırlama |
|---|---|---|
| Çok satırlı, düzenlenebilir metin katmanı | ✅ | — |
| 8 yazı tipi ailesi, kalın, italik, boyut | ✅ | Özel yazı tipi içe aktarma ⏳ |
| Renk, opaklık, arka plan kutusu, kontur, gölge | ✅ | — |
| Hizalama, harf ve satır aralığı, döndürme | ✅ | — |
| Önizlemede sürükleme, iki parmakla ölçek/döndürme | ✅ | — |
| Giriş/çıkış animasyonları (belirme, zıplama, kayma, daktilo) | ✅ | — |
| Hazır stiller ve düzenler (başlık, alt bant, altyazı, jenerik, çağrı) | ✅ | — |
| Türkçe karakter, Arapça birleştirme/RTL, emoji | ✅ | Android metin motoru |
| Logo/çıkartma ekleme | ⏳ | — |

## Geçişler, filtreler, efektler, renk

| Özellik | Durum | Sınırlama |
|---|---|---|
| Geçişler: siyaha/beyaza geçiş, flaş, yakınlaş, uzaklaş, döndür, 4 yönde kaydırma, glitch | ✅ | Süre ayarlı; "Tümüne uygula" |
| Gerçek çapraz geçiş (cross dissolve), maskeli geçişler | ⏳ | İki klibin üst üste binmesi gerekir |
| 21 özgün filtre, 5 kategori, yoğunluk | ✅ | — |
| GPU efektleri (21 özgün shader, 10 kategori, gerçek önizleme küçük resimleri, efekt başına 4 parametre + yoğunluk): parıltı, ışık sızıntısı, dijital bozulma, VHS, renk sapması, kamera sarsıntısı, minyatür, eski film, CRT, neon kontur, çizgi roman, kaleydoskop, su dalgası, zoom/hareket bulanıklığı, kar, yağmur, ışıltı, anamorfik parlama, çift ton, mozaik | ✅ (B, E*) | Görsel QA efekt laboratuvarında; gerçek cihaz performansı ölçülmedi |
| Klip efekt yığını (en fazla 4 efekt üst üste) | ✅ (B, E*) | — |
| Efekt katmanı şeridi: süreli, taşınabilir, kırpılabilir, bölünebilir, çoğaltılabilir | ✅ (B, E*) | — |
| Renk: parlaklık, kontrast, doygunluk, pozlama, sıcaklık, renk tonu, vurgular, gölgeler, solukluk, keskinlik, vinyet, gren | ✅ | — |
| 3B LUT (.cube) içe aktarma, klip başına LUT + yoğunluk, tümüne uygula | ✅ (B, L) | 2–65 boyut; dosya cihazda kalır. Emülatörde dosya seçici otomatikleştirilemediği için E testi yok |
| Öncesi/sonrası karşılaştırma, HDR uçtan uca | ⏳ | HDR kaynak SDR'ye ton eşlenir |
| Chroma key, maske, arka plan kaldırma, hareket takibi | ⏳ | — |
| Efekt favorileri / arama | ⏳ | — |

\* E: emülatör akışına eklendi; sonucu `PROGRESS.md`'de. L: aynı shader efekt laboratuvarında (WebGL) referans hesapla karşılaştırıldı.

## Ses

| Özellik | Durum | Sınırlama |
|---|---|---|
| Müzik/ses dosyası ekleme | ✅ | Lisanslı müzik kütüphanesi yok (yalnızca kullanıcının dosyaları). Emülatör testinde dosya seçiciden seçim otomatikleştirilemedi; ses katmanı "videodan ses ayırma" ile test edildi |
| Çok katmanlı ses miksajı | ✅ | — |
| Ses düzeyi, yavaşça açılma/kapanma | ✅ | — |
| Ses kırpma, bölme, taşıma, hız | ✅ | — |
| Dalga biçimi | ✅ | — |
| Ses kaydı (mikrofon) | ⏳ | — |
| EQ, compressor, limiter, gürültü azaltma, normalizasyon, perde | ⏳ | — |

## Altyazı ve AI

| Özellik | Durum | Planlanan çalışma biçimi |
|---|---|---|
| Otomatik altyazı (Türkçe dahil), SRT/VTT | ⏳ | Cihaz içi Whisper sınıfı model (indirme gerekir) |
| Arka plan kaldırma | ⏳ | Cihaz içi segmentasyon modeli |
| Gürültü azaltma, sessizlik kaldırma, sahne algılama | ⏳ | Cihaz içi |
| Metinden konuşma, otomatik kurgu, görüntü iyileştirme, altyazı çevirisi | ⏳ | Bulut (internet + açık izin) |
| AI video/görsel üretimi, avatar, dudak senkronu | ⏳ | Bulut; maliyet ve veri aktarımı kullanıcıya gösterilecek |

## Dışa aktarma

| Özellik | Durum | Sınırlama |
|---|---|---|
| MP4 (H.264 + AAC) | ✅ | — |
| H.265/HEVC, AV1 | 🟡 | Yalnızca cihazda donanım kodlayıcı varsa gösterilir |
| 720p / 1080p / 1440p / 4K | ✅ | Cihazın kodlayıcısının desteklemediği birleşimler kilitli |
| 24/25/30/50/60 fps | 🟡 | Kaynağın kare hızından yüksek fps kare üretmez |
| Kalite (bit hızı), tahmini boyut, boş alan kontrolü | ✅ | — |
| İlerleme, kalan süre, iptal, bildirim, ön plan hizmeti | ✅ | — |
| Çıktı doğrulama (süre, çözünürlük, ses, boyut) | ✅ | — |
| Galeriye kaydetme (Filmler/Kurgu), paylaşma | ✅ | — |
| MOV, özel çözünürlük, ses kodeği seçimi | ⏳ | — |

## Yerelleştirme

| Özellik | Durum | Test |
|---|---|---|
| Türkçe (varsayılan), İngilizce, Arapça — tüm arayüz | ✅ | B (katalog kapsamı), CI denetimi |
| Cihaz dilini algılama, desteklenmiyorsa Türkçe | ✅ | B |
| Ayarlardan anında dil değişimi (yeniden başlatma yok, proje açık kalır) | ✅ | E |
| Arapçada RTL arayüz; zaman çizelgesi LTR | ✅ | E (Arapça ekranlar doğrulandı; yerleşimin görsel incelemesi henüz yapılmadı) |
| Çoğul biçimler (Arapça 6 biçim) | ✅ | B |
| Tarih/sayı/boyut biçimleri | ✅ | B |
| Gömülü metin denetimi | ✅ | CI |
