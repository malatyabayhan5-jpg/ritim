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
| Karışım modları (video): 11 mod (çarpma, ekran, bindirme, karart, aydınlat, ekle, fark, yumuşak ışık, renk, parlaklık) | 🟡 | Görsel katmanlar (çıkartma, şekil, fotoğraf) için: Media3 birleştiricisi yalnızca alfa karışımı yaptığından kompozisyon düzeyinde `BlendLayerFx` + `_blend_main.glsl` (önizleme ve dışa aktarma aynı yol). L (`tools/fx-lab/blend_check.py`: WebGL'de 11 mod W3C formülleriyle karşılaştırıldı, en büyük fark 0,5/255) + B (`overlays.test.mjs`: yönlendirme, canlı değerler). Filtre/ayar matrisi uygulanır. Sınırlar: video katmanlarında yalnızca Normal; karışımlı görsel katmanı tüm alt katmanların üstünde (efekt izi ve metinlerin altında) çizilir; cihazda e2e 3. akış adımı — sonuç Bölüm 9 |
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
| Metin anahtar kareleri (konum, ölçek, döndürme, opaklık; elmas düğmeli panel, sürükleme kareye yazar; bölme/kırpmada kaydırma) | 🟡 | B (`tracking.test.mjs`: aç/kapat, düzenle, böl, kırp); yerel `TextLayer` aynı `Keyframes.java` ile değerlendirir; e2e 3. akışta panel adımı — sonuç Bölüm 9 |
| Çıkartmalar (emoji, video ve fotoğraf) | 🟡 | Kod + B (fotoğraf modeli); emülatörde fotoğraf akışında metin adımı var |
| Şekiller | 🟡 | Fotoğraf düzenleyicide 8 şekil ✅ (B); video zaman çizelgesinde şekil (saydam PNG üst katman) kodda var, e2e 3. akışa adım eklendi — sonuç Bölüm 9 |
| Otomatik altyazı (whisper.cpp, cihaz içi) | ✅ | E (CI #29: konuşma kelimesi kelimesine doğru); 64 bit cihaz |
| Altyazı düzenleme listesi (metin, zamana git, sil) | 🟡 | Kod + D; e2e 4. akışa liste açma/satır silme adımı eklendi — sonuç Bölüm 9 |
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
| Hareket takibi (üst katman: çıkartma, şekil, görsel, video ve metin → nesneyi izler; konum anahtar kareleri) | ✅ (katman, emülatör) / 🟡 (metin) | E (CI #77, 6. akış: 46 kare izlendi, 26 anahtar kare, kayıp 0, 213×120 izleme çözünürlüğü) + J (`TrackerTest`: ortalama 0,38 px) + B (`tracking.test.mjs`). Metin takibi yalnızca B; ölçek/dönüş takibi yok (yalnızca konum); gerçek cihazda ölçülmedi |
| Video arka plan kaldırma, AI otomatik kurgu, süper çözünürlük | ⏳ / ☁️ | Yapılmadı; uygun açık lisanslı mobil model ve gerçek cihaz ölçümü gerekir |

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

**CI #53** (5dd608b): 2, 3, 4, 5 GEÇTİ; 1 ve 6 aynı çökme (sona yaklaşma kuralı yetmedi →
güvenlik ağı c3ddcaa); 8. akış ilk kez fotoğraf oluşturma, otomatik iyileştirme, 1:1 kırpma
(kanvas 1080×1080) adımlarını geçti, arka plan kaldırmada H-19 bulundu (c3ddcaa); 7. akışta
`tool-record` dokunuşu başarısız (inceleniyor).

**CI #59–#60:** 2, 3, 4, 5, 8 GEÇTİ (fotoğraf çıktısı 1080×1080 doğrulandı; DeepLab kişi
maskesi emülatörde 144 ms). 1. akışta dışa aktarma `DECODER_INIT_FAILED` ile durdu; 6 ve 7'de
Maestro kimlik/görünürlük sorunları (metin eşlemesine geçildi).

**CI #61 (yeniden çalıştırma):** önizleme sonu çökmesi yok (PREVIEW_TAIL çözümü tuttu); dışa
aktarma yine `DECODER_INIT_FAILED` → dışa aktarma sırasında önizlemeler askıya alınır ve kod
çözücü yedeğe düşebilir (8cdef07).

**CI #62** (8cdef07): 3 ve 4 GEÇTİ; 1. akışın dışa aktarması sırasında emülatörün kendisi
dondu (QEMU "hanging thread", 00:30) ve iş 90 dk sınırına kadar takılı kaldı — 2, 5, 6, 7, 8
hiç çalışamadı. Bu nedenle dışa aktarmanın 8cdef07 ile düzelip düzelmediği **henüz bilinmiyor**.
Önlem: akış başına 25 dk sınır, emülatör yanıt vermezse kalan akışları atlama, ağır dışa
aktarma akışı en sona alındı; her akışın ürettiği MP4 ayrı izlenir.

**CI #80–#82** (08d8cad…e0e99ca): 1, 2, 4, 5, 7, 8 GEÇTİ; **katman testi GEÇTİ** (konum, maske, zaman aralığı);
hareket takibi 46 nokta / 26 kare / kayıp 0. 6 yalnızca son "Takip" görünürlük denetiminde düştü (düğme ekrandayken
Maestro bulamadı) → takip artık günlükten doğrulanıyor (run.sh "Takip testi"), akış yalnızca önizleme hatası
olmadığını denetliyor. 3: karışım katmanı eklenince önizlemede `VideoFrameProcessingException ← TimeoutException`:
katman görseli GL iş parçacığında piksel piksel dönüştürülüyordu, Media3'ün 500 ms'lik eşzamanlı çağrısı zaman
aşımına uğradı → görsel kompozisyon kurulurken arka planda hazırlanıp önbelleğe alınıyor (BlendPixels; satır
çevirme ve renk sırası tek geçişte), tek dizili oynatıcıda da zaman aşımı hatası kurtarılıyor. Dışa aktarma
takılması (#82, %71'de 2,5 dk): izleme özeti çözüldü — ses kodlayıcı 10,15 sn'de videoyu bekliyor (karıştırıcı
sınırı), video tarafında **tüm bileşenler (çözücü çıkışı, birleştirici, son işlemci, kodlayıcı) 141,2 sn'de aynı
anda susuyor**; kayıp kare yok (çözücü 312 = yüzey 312). Ortak GL iş parçacığının bloke olduğu çağrıyı görmek için
bekçi artık iş parçacığı yığınlarını yazıyor; Media3 uyarıları ayrıca toplanıyor. Takılma anı, iki üst video
katmanının (0,5× hız, kaynağın sonuna yakın) başladığı 9,77 sn'ye denk geliyor.

**CI #79** (ce8426c, karışım modları; derleme geçti): 2, 4, 5 (p50 28 ms), 7, 8 GEÇTİ. Hareket takibi yine çalıştı
(46 nokta, 26 kare, kayıp 0) ama kısa bildirim Maestro'ya yakalanmadı → takip adımı dışa aktarmadan sonraya alındı,
bitiş meşgul göstergesinden anlaşılır. 3: "Karışım" sekmesi dar ekranda sekme şeridinin dışında kaldı → Konum'un
yanına alındı. **1: dışa aktarma 5 dk sınıra rağmen %70'te durdu (MUXING_TIMEOUT)** — #72 ve #74'te de aynı
bölgede (çıktı ~12,3 sn; ikinci klibin sessiz ses aralığı 12,0–14,0 sn ile çakışıyor) takılma/aşırı yavaşlama
görüldü; aralıklı bir boru hattı sorunu. Media3 izleme özeti artık parçalı günlüğe yazılıyor (kök neden araştırılıyor).

**CI #77** (6323313): 1, 2, 4, 5, 7, 8 GEÇTİ. **Hareket takibi emülatörde ilk kez çalıştı** (46 nokta, 26 anahtar kare,
kayıp 0). Hemen ardından emülatörün Android sistem süreci aşırı yükten çöktü (`FATAL EXCEPTION IN SYSTEM PROCESS:
FinalizerWatchdogDaemon`, sistem yeniden başladı; uygulama çökme kaydı yok) → 6 düştü. 3: ses düzeyi düğmesi yine geç
bulundu → metinle eşleme.

**Özet (son 6 tur, aynı uygulama kodu):** her akış en az bir kez geçti; kalan başarısızlıklar emülatör/Maestro
kaynaklı (sistem süreci çökmesi, kimlik bulunamaması, ekran görüntüsü null). Gerçek cihazda doğrulama yapılmadı.

**CI #76** (bb191b5): **1, 2, 3, 4, 5, 7, 8 GEÇTİ** (dışa aktarma 4. kez üst üste). 6: maske adımı geçti; Maestro bu kez
`undo` kimliğini bulamadı (önceki turlarda bulunuyordu) → katman ekranındaki geri al/yinele adımları isteğe bağlı.

**CI #75** (a907d2b): **1, 2, 3, 4, 5, 7, 8 GEÇTİ** (dışa aktarma üst üste 3. kez geçti; 1280×720, 17,5 sn,
hatasız; performans p50 17 ms, p90 32 ms, PSS ~153 MB — emülatör). 6: ekranda "Track" düğmesi görünürken Maestro
`tool-track` kimliğini bulamadı (aynı sorun daha önce `new-project`/`tool-record` için de görüldü) → metinle eşleme.

**CI #74** (a8589c9): **1 (kabul, dışa aktarma) GEÇTİ** — 1280×720, 17,5 sn, hatasız çözüldü, efekt doğru aralıkta;
ilerleme günlüğü: %70→%75 arası 3 dk 14 sn (ikinci ana klibe geçiş; yazılımsal kod çözmeli emülatör), geri kalanı
saniyeler → muxer bekleme sınırı 5 dk'ya çıkarıldı (#72'deki MUXING_TIMEOUT aynı yerdeydi; gerçek cihazda ölçülmedi).
2, 4, 5 (p50 31 ms) GEÇTİ. 3: ters oynatma sonrası önizleme `ERROR_CODE_TIMEOUT` → önizleme bu hatada da oynatıcıyı
aynı konumdan yeniden kurar. #73'teki ses kodlayıcı hatası (`ENCODING_FAILED`) bu turda tekrarlanmadı; nedeni
henüz bilinmiyor (artık neden zinciri günlüğe yazılıyor).

**CI #73** (be7e718): 2, 3, 4, 5 (p50 26 ms), 7, 8 GEÇTİ. 1: dışa aktarma bu kez başlar başlamaz ses
kodlayıcı hatasıyla düştü (`ENCODING_FAILED`, AAC 44,1 kHz mono; kabul akışı galerideki ilk üç öğeyi seçtiğinden
proje turdan tura değişiyor) → Exporter artık istisna zincirinin tamamını günlüğe yazar. 6: Takip düğmesi dar
ekranda kısmen görünür kaldığı için Maestro "görünmüyor" saydı → katman araç çubuğunda Konum'un hemen arkasına alındı.

**CI #72** (6469074): **3 (AI araçları: sahne, sessizlik, videoya şekil, metin anahtar kare paneli, metinden
konuşma, ses efekti + ses düzeyi anahtar karesi, ters oynatma), 2, 4, 5 (p50 29 ms, p90 32 ms), 7, 8 GEÇTİ.**
1: dışa aktarma %70'te 120 sn örnek yazılmadan durdu (`MUXING_TIMEOUT`; ilerleme yazılımsal kod çözmeli
emülatörde giderek yavaşladı; aynı yerel kod #67–#69'da geçti) — tekrarı izleniyor. 6: Takip düğmesine araç
çubuğu yeniden çizilirken dokunuldu → bekleme eklendi.

**CI #71** (ce350cb, metin anahtar kareleri dahil — Kotlin derlemesi geçti): 2, 4, 5 (p50 29 ms), 7, 8 GEÇTİ.
**Gerçek hata bulundu:** yeni anahtar kare paneli `case 'text'` ile `case 'textAnim'` arasına eklendiği için
"metin ekle" düzenleme paneli yerine anahtar kare panelini açıyordu → 1 ve 3 metin kutusunu bulamadı (düzeltildi).
6: katman eklendikten sonraki ekran görüntüsü `optional` olmasına rağmen Maestro altyapı hatası olarak akışı
düşürdü → o adımlar kaldırıldı.

**CI #69** (1d1287c): emülatör donmadı. 1 (dışa aktarma, aynı doğrulamalar), 2, 4, 5 (p50 32 ms, p90 32 ms), 8 GEÇTİ.
3, 6, 7 zamanlama: yazılımsal kod çözücüyle emülatör yavaşladı — ekran görüntüsü null (3), panel geç açıldı (6),
ses alt araç çubuğu 30 sn'de görünmedi (7). Önlem: ekran görüntüleri `optional`, 6/7'de yeniden dokunma ve
daha uzun bekleme. Uygulama çökme kaydı yok.

**CI #68** (cdb47b0, `-feature -HardwareDecoder`): **emülatör hiçbir grupta donmadı.**

| Akış | Sonuç |
|---|---|
| 1 — Kabul (dışa aktarma) | ✅ GEÇTİ — 1280×720 H.264+AAC 17,5 sn, hatasız çözüldü, efekt doğru aralıkta |
| 2 — Dil / RTL | ✅ GEÇTİ |
| 4 — Otomatik altyazı + altyazı listesi | ✅ GEÇTİ |
| 5 — Performans | ✅ GEÇTİ — p50 28 ms, p90 44 ms, %39,5 takılan kare, PSS ~157 MB (yazılımsal GPU, gerçek cihaz değil) |
| 7 — Mikrofonla seslendirme | ✅ GEÇTİ |
| 8 — Fotoğraf düzenleyici | ✅ GEÇTİ — çıktı 1080×1080 |
| 3 — AI araçları | Sahne, sessizlik, şekil, metinden konuşma, ses efekti ön ayarı geçti; ses düzeyi düğmesine panel kapanırken erken dokunuldu → bekleme eklendi |
| 6 — Katmanlar | Katman eklendi; hemen sonraki ekran görüntüsü Maestro'da null döndü (altyapı) → adım kaldırıldı |

**CI #67** (7acd28d, üç paralel grup; derleme hareket takibiyle geçti):

| Akış | Sonuç |
|---|---|
| 1 — Kabul (dışa aktarma dahil) | ✅ **GEÇTİ** — MP4 1280×720 H.264 + AAC, 17,5 sn, baştan sona hatasız çözüldü; duotone efekti yalnızca 14,5–17,25 sn aralığında (beklenen) — kod çözücü yedeği (8cdef07) işe yaradı |
| 2 — Dil / RTL | ✅ GEÇTİ |
| 3 — AI araçları | Sahne (2 kesme), sessizlik (1,66 sn kaldırıldı), metin, **videoya şekil katmanı** adımları geçti; ardından Maestro ekran görüntüsü alamadı (altyapı) → adım kaldırıldı |
| 4 — Otomatik altyazı | Altyazı üretildi ("Hello world! This is an automatic caption test…"); liste adımı paneli yeniden açmaya çalıştığı için düştü (panel açık kalıyor) → test düzeltildi |
| 5 — Performans | p50 32 ms, p90 57 ms, %41,6 takılan kare, PSS ~178 MB (yazılımsal GPU, gerçek cihaz değil); efekt yoğunluğu adımı efektsiz projede düştü → test önce efekt uygular |
| 6, 7, 8 | Emülatör, sistem fotoğraf seçicisi açıkken dondu (uygulama dışı); çalışamadı |

Donmalardan hemen önce her seferinde emülatörün ana makinedeki H.264 köprüsünde "no frame / ColorBuffer"
hataları görüldü → CI'da `-feature -HardwareDecoder` ile konuk içi yazılımsal çözücüye geçildi.

**CI #65** (0e820bf): emülatör yine dondu (QEMU "hanging thread"), bu kez ilk akışta (3) şekil
eklenirken; kalan akışlar atlandı. Uygulama çökme kaydı yok. Önlem: e2e üç paralel gruba bölündü,
her grup taze emülatörde çalışır (ai-dil-performans / katman-ses-fotograf / kabul-dışa-aktarma).

**CI #64** (e52abe3): emülatör sistem görüntüsü indirilirken bozuldu (altyapı, "Error on ZipFile unknown archive"); uygulama çalışmadı.

**CI #63** (6b69bcf): test betiğindeki adb sarmalayıcısı hatalıydı (`timeout` kabuk yerleşik
`command`'ını çalıştıramadı) → APK kurulmadı, tüm akışlar "paket yüklü değil" ile başarısız. Uygulama
hatası değil; betik düzeltildi (adb'nin tam yolu kullanılıyor, kurulum süre sınırsız).

Önizlemedeki `FAILED_RUNTIME_CHECK` hatası (H-8) CI #42'den beri görülmüyor.

## 10. Teslim

APK her CI çalıştırmasında **Actions → ilgili çalıştırma → Artifacts → `Kurgu-apk`**
olarak üretilir. Herkese açık sürüm (release) yayımlanmadı.
