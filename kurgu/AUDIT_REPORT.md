# Kurgu — Denetim raporu

Tarih: 2026-10-18 · Kapsam: `kurgu/` (React Native + Kotlin/Media3 motoru) · Sürüm: 0.1.0

## Yöntem

- Tüm kaynak dosyalar satır satır okundu (JS: model, motor tanımı, ekranlar, editör; Kotlin: kompozisyon, efektler, önizleme, dışa aktarma, medya araçları).
- Media3 1.9.4 kaynak kodu üzerinden kullanılan API'lerin davranışı doğrulandı (zaman damgaları, HDR modları, EXIF, katman yerleşimi).
- Android 14 emülatöründe (API 34, x86_64) Maestro ile uçtan uca akış çalıştırıldı: yeni proje → içe aktarma → bölme → metin → filtre → efekt → geçiş → ses → kaydet/kapat/aç → MP4 dışa aktarma → ffmpeg ile bağımsız doğrulama → dil/RTL. **Sonuç: geçti**, çökme ve JS hatası yok.
- Gerçek Android cihazı bu ortamda yok; cihaz bağımlı bulgular (ısınma, pil, gerçek GPU performansı) ölçülemedi ve aşağıda öyle işaretlendi.

## Özellik durumu sınıflandırması

| Durum | Özellikler |
|---|---|
| Çalışıyor (emülatörde uçtan uca doğrulandı) | Proje oluşturma/listeleme/yeniden açma, galeriden içe aktarma, bölme, metin, filtre, efekt, geçiş, videodan ses ayırma, otomatik kayıt, MP4 dışa aktarma + galeriye kayıt, dil değişimi ve Arapça arayüz |
| Çalışıyor (birim testli, emülatörde dolaylı) | Kırpma, taşıma, çoğaltma, hız, kare dondurma, geri al/yinele, şablonlar, render tanımı, çeviri kapsamı |
| Kısmen | Proje paketi (medyasız), HEVC/AV1 (cihaza bağlı), kare hızı (kaynaktan yüksek fps üretmez), müzik ekleme (dosya seçiciden seçim emülatörde otomatikleştirilemedi) |
| Yalnızca bilgi ekranı (bilinçli, "Planlandı" etiketli) | AI araçları sayfası |
| Yok | Anahtar kare, hız eğrisi, gerçek çapraz geçiş, PiP/üst katman, maske, chroma key, LUT, ses efektleri (EQ, reverb…), çıkartma, altyazı |

Kodda TODO/FIXME, sahte veri veya boş işlevli düğme bulunmadı.

## Bulgular

### Kritik

| # | Bulgu | Etki | Kök neden |
|---|---|---|---|
| K1 | **Efekt sistemi referans uygulama düzeyinin çok altında**: 12 efekt tek bir "süper shader"ın parametre varyasyonlarıdır; glow/bloom, ışık sızıntısı, bulanıklık türleri, distorsiyon, parçacık, CRT gibi temel efektler yok | Ürünün ana değer önerisi karşılanmıyor | Efektler tek `FxShaderProgram` içinde birkaç uniform ile sınırlı tasarlandı |
| K2 | **Klip başına yalnızca bir efekt** ve efektler zaman çizelgesinde ayrı katman olarak yok (referans uygulamada efektler ayrı bir izde süreli öğelerdir) | Birden fazla efekt birleştirilemiyor, efekt süresi ayarlanamıyor | Veri modelinde `clip.fx` tek nesne |
| K3 | **HDR kaynaklarda renkler tutarsız olabilir**: kompozisyonda HDR modu belirtilmemiş (varsayılan HDR'yi koru); efekt shader'ları SDR değer aralığı varsayıyor, H.264 HDR taşıyamaz | Modern telefonların HDR/HLG videolarında önizleme ile çıktı renkleri ve efektler bozulabilir | `Composition.Builder.setHdrMode` çağrılmıyor |

### Yüksek

| # | Bulgu | Etki | Kök neden |
|---|---|---|---|
| Y1 | Geri al geçmişinde kaydırıcı birleştirmesi zamandan bağımsız: aynı türden iki ayrı ayar (ör. A klibinin hızı, sonra B klibinin hızı) tek adımda birleşir | Geri al, beklenenden fazlasını geri alır | `pushHistory` yalnızca anahtar eşitliğine bakıyor |
| Y2 | Dışa aktarılan her video hem uygulama içinde hem galeride tutuluyor; uygulama içi kopyalar hiç silinmiyor | Depolama hızla dolar | Kopya temizliği yalnızca "önbelleği temizle" ile |
| Y3 | Efekt önizleme küçük resimleri yok (renk kutucuğu / simge) | Kullanıcı efekti seçmeden göremiyor; referans uygulamadan belirgin fark | Katalogda görsel yok |
| Y4 | Eksik medyayı yeniden bağlama hatası sessizce yutuluyor | Kullanıcı neden olmadığını anlamıyor | `relink` içinde boş `catch` |
| Y6 | Oynatma kafası sondayken eklenen efekt katmanı/metin video dışına düşüyordu (emülatör testinde bulundu) | Efekt veya metin çıktıda görünmüyor | Yerleşimde video süresi hesaba katılmıyordu |
| Y7 | Yavaş cihazda yoğun efektli dışa aktarma muxer zaman aşımıyla iptal (emülatörde bulundu) | Dışa aktarma başarısız | Media3 varsayılan 10 sn örnek bekleme sınırı |
| Y5 | Zaman çizelgesi 210 px sabit yükseklikte ve dikey kaydırma yok: 2 ses + 1 metin şeridinden sonra eklenen şeritler görünmez ve seçilemez (efekt çalışması sırasında bulundu) | Çok katmanlı projelerde öğelere erişilemiyor | Yatay `ScrollView` içerik yüksekliği taşınca kırpılıyor |

### Orta

| # | Bulgu | Etki |
|---|---|---|
| O1 | Android 13+ bildirim izni istenmiyor; dışa aktarma bildirimi görünmeyebilir | İlerleme yalnızca uygulamada görülür |
| O2 | Geçişler tek klip üzerinde çalışır (siyaha/beyaza geçiş, giriş hareketi); iki klibin üst üste karıştığı çapraz geçiş yok | referans uygulamadaki dissolve/push gibi geçişler eksik |
| O3 | Ses %100 üzerine yükseltilemiyor; ses efektleri yok | Sessiz kayıtlar için sınırlayıcı |
| O4 | Zaman çizelgesinde kare adımı yok | Hassas konumlandırma yalnızca yakınlaştırmayla |
| O5 | Isınma/güç tasarrufu yalnızca dışa aktarma öncesi kontrol ediliyor | Uzun önizlemede ısınma uyarısı yok |

### Düşük

| # | Bulgu |
|---|---|
| D1 | Müzik ekleme testinde sistem dosya seçicisinde dosya listelenmedi (emülatörün "Son" görünümü); uygulama hatası değil, test otomasyonu sınırlaması |
| D2 | Proje paketi medyayı içermiyor (belgelendi) |
| D3 | Gerçek cihazda performans, pil ve ısı ölçümü yapılmadı (cihaz yok) |

## Bu turda ele alınacaklar

K1, K2, K3, Y1–Y7, O1 bu turda düzeltildi; O2–O5 sonraki tura planlandı. Düzeltmelerin ayrıntısı ve test sonuçları `BUG_FIXES.md` ve `PROGRESS.md` dosyalarındadır.

---

# Yeniden denetim — 2026-10-19

Kapsam: 2026-10-18 sonrası eklenen tüm özellikler (katmanlar, geçişler, anahtar
kareler, hız eğrisi, ters oynatma, seslendirme, ses efektleri, metin paketi,
fotoğraf düzenleyici, bulut altyapısı). Yöntem: kod okuma, Media3 1.9.4 kaynağıyla
karşılaştırma, CI e2e günlüklerinin (yerel istisna zincirleri dahil) incelenmesi.
Özellik bazlı durum PROGRESS.md'de dört değerle verilmiştir.

## Yeni bulgular

| # | Önem | Bulgu | Durum |
|---|---|---|---|
| H-8 | Kritik | Ses düzeyi %100 olan klipte önizleme duruyordu (`GainProcessor` birlik sınırı) | Düzeltildi (2c48995), CI doğrulaması bekleniyor |
| H-12 | Kritik | Geçişli projede dışa aktarma %90'da zaman aşımı | **Açık**, inceleniyor |
| H-9 | Yüksek | Hız değişimli katman öğesi dışa aktarmayı %60'ta kilitliyordu | Düzeltildi (ac36ee5) |
| H-10 | Yüksek | AI düğmesi araç çubuğunda görünmüyordu | Düzeltildi, E ile doğrulandı |
| H-11 | Orta | Kişi maskesi EXIF yönlü fotoğrafta kayardı | Düzeltildi (yayımlanmadan) |
| H-13 | Orta | Ses efekti ön ayarı değişince eski parametreler kalırdı | Düzeltildi (yayımlanmadan) |
| A-1 | Orta | Video karışım modları yok: `MultipleInputVideoGraph` sabit `DefaultVideoCompositor` kullanır (yalnızca alfa) | Bilinçli sınırlama, belgelendi |
| A-2 | Orta | Efekt (21) ve geçiş (44) sayıları hedefin (100 / 80) altında | Paket çalışması sürüyor |
| A-3 | Düşük | Altyazı çevirisi cihaz içinde yalnızca İngilizceye | Belgelendi; diğer diller dış servis |
| A-4 | Bilgi | Gerçek cihazda performans/ısı/pil ölçümü yok | Donanım gerektiriyor |

## Doğrulama yöntemi notu

Emülatör akışı "success" bitse bile tek tek akış satırları okunur (`sonuclar.txt`
özeti iş günlüğüne yazılır). Bu turda bulunan iki kritik hata (H-8, H-12) iş
"başarılı" görünürken akış satırlarında ortaya çıktı.
