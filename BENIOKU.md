# Ritim

React Native (Expo SDK 54) ile yazılmış müzik uygulaması.

- Ana sayfa: son çalınanlar, yeni eklenenler, en çok dinlenen albümler
- Arama: açık müzik arşivi (sanatçı / albüm / tür) ve YouTube Data API ile gerçek YouTube araması. YouTube videoları YouTube'un resmi gömülü oynatıcısıyla açılır; YouTube'un kuralları gereği indirilemez. API anahtarı uygulama içinden (⚙) girilir.
- Oynatıcı: tam ekran oynatıcı, mini oynatıcı, ileri/geri sarma, karıştır, tekrarla (tümü / tek), çalma sırası
- Arka planda çalma (ekran kapalıyken ve başka uygulamadayken)
- Çalma listeleri: oluştur, yeniden adlandır, sil, parça ekle/çıkar
- Favoriler
- İndirme ve çevrimdışı dinleme (tek parça veya tüm albüm)
- Arşivim: arama servisi katmanı (src/services/mediaService.js). Mock modu harici servis gerektirmez; "Kendi API'm" modunda sunucu adresi ve erişim anahtarı uygulama içinden ayarlanır
- İndirmelerde MIME türü ve dosya imzası kontrolü, iptal, uygulama açılışında yerel dosyaları yeniden keşif
- İndirme seçenekleri menüsü: Video indir / Yalnızca ses indir / İptal. Yalnızca kaynağın gerçekten sunduğu çözünürlük ve ses biçimleri boyutlarıyla listelenir; telefonda dönüştürme yapılmaz. YouTube içerikleri indirilemez.
- İndirilen sesler ve İndirilen videolar ayrı listelerde; çevrimdışı oynatma, silme, dosya boyutu
- Linkten indir: herkese açık herhangi bir .mp3/.m4a linkini telefona kaydetme (http ve https)

Müzikler Internet Archive'ın Creative Commons lisanslı "netlabels" koleksiyonundan gelir.
Dinlemek ve indirmek yasaldır, API anahtarı gerekmez.

## Kurulum

`bash kurulum.sh` komutu her şeyi yapar: Node.js, Expo projesi, bağımlılıklar,
kodların kopyalanması ve EAS ile APK derlemesi. İlk derlemede ücretsiz bir Expo
hesabı gerekir (https://expo.dev/signup).

## Dosyalar

```
App.js                         gezinme ve sağlayıcılar
app.json                       uygulama ayarları, arka plan izinleri
eas.json                       APK derleme profili
src/theme.js                   renkler, boşluklar, yazı stilleri
src/api/archive.js             müzik arama ve albüm verisi
src/context/PlayerContext.js   oynatıcı, sıra, karıştır/tekrarla
src/context/LibraryContext.js  favoriler, listeler, indirmeler
src/components/                ortak bileşenler
src/screens/                   ekranlar
```

## Özel API sözleşmesi

```
GET {sunucu}/search?q=<sorgu>
    -> [ { id, title, artist?, duration?, thumbnail?, license? } ]  veya { results: [...] }
GET {sunucu}/media/{id}/download
    -> { url, mimeType?, ext? }    (url göreli olabilir)
GET {sunucu}/media/{id}/formats   (isteğe bağlı; indirme menüsündeki seçenekler)
    -> { video: [ { url, height, ext?, size? } ], audio: [ { url, ext?, bitrateKbps?, size?, original? } ] }
Erişim anahtarı girilmişse: Authorization: Bearer <anahtar>
```

## Testler

`tests/logic.test.js`: biçim tespiti ve servis katmanı testleri. Her APK derlemesinden önce otomatik çalışır.
