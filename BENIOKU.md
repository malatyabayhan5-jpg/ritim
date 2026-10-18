# Ritim

React Native (Expo SDK 54) ile yazılmış müzik uygulaması.

- Ana sayfa: son çalınanlar, yeni eklenenler, en çok dinlenen albümler
- Arama: sanatçı / albüm / tür araması, tür kartları
- Oynatıcı: tam ekran oynatıcı, mini oynatıcı, ileri/geri sarma, karıştır, tekrarla (tümü / tek), çalma sırası
- Arka planda çalma (ekran kapalıyken ve başka uygulamadayken)
- Çalma listeleri: oluştur, yeniden adlandır, sil, parça ekle/çıkar
- Favoriler
- İndirme ve çevrimdışı dinleme (tek parça veya tüm albüm)
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
