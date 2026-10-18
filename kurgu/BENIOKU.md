# Kurgu — mobil video düzenleyici

Özgün markalı, mobil öncelikli, çok katmanlı bir video düzenleyici. Kullanım
mantığı yaygın mobil editörlere (CapCut benzeri) yakındır: üstte önizleme,
ortada oynatma kafası sabit zaman çizelgesi, altta araç çubuğu ve alt paneller.
Kod, marka, simge ve varlıklar özgündür.

- **Platform:** Android (önizleme + dışa aktarma motoru). Arayüz React Native olduğu
  için iOS'ta açılır; iOS video motoru henüz yazılmadı (bkz. `docs/MIMARI.md` §8).
- **Diller:** Türkçe (varsayılan), English, العربية (sağdan sola).
- **Motor:** AndroidX Media3 — önizleme ve dışa aktarma aynı kompozisyonu kullanır.

Ayrıntılar:
- [docs/MIMARI.md](docs/MIMARI.md): mimari, teknoloji seçimleri ve gerekçeleri, performans, izinler, proje biçimi, masaüstü hazırlığı, lisanslar
- [docs/OZELLIKLER.md](docs/OZELLIKLER.md): özellik envanteri ve her özelliğin gerçek durumu

## Neler çalışıyor (v0.1)

- Proje: oluştur, aç, yeniden adlandır, kopyala, sil (onaylı), otomatik kayıt, çökme sonrası kurtarma, proje paketi paylaşma/içe aktarma, 6 şablon
- İçe aktarma: galeri (Photo Picker, izinsiz), dosya yöneticisi, kodek kontrolü, eksik medyayı yeniden bağlama
- Zaman çizelgesi: ana iz + ses şeritleri + metin şeritleri; böl, kırp, taşı, çoğalt, sil; iki parmakla yakınlaştırma; küçük resim ve dalga biçimi; işaretçiler; 100 adım geri al/yinele
- Düzenleme: hız (0,1x–10x), ses düzeyi ve yumuşatma, döndür/çevir/ölçek/konum, sığdır/doldur, 7 en-boy oranı, kare dondurma, sesi ayırma, klip değiştirme
- Görsel: 21 filtre, 12 renk ayarı, 12 efekt, 12 geçiş
- Metin: stil, yazı tipi, renk, kontur, gölge, arka plan, hizalama, animasyonlar; önizlemede sürükle/ölçekle/döndür
- Dışa aktarma: MP4 (H.264/HEVC/AV1 – cihaz destekliyorsa), 720p–4K, 24–60 fps, kalite, tahmini boyut, ilerleme, iptal, çıktı doğrulama, galeriye kayıt, paylaşma

Çalışmayanlar (dürüst liste): AI araçları, otomatik altyazı, anahtar kare, hız eğrisi, çapraz geçiş, resim içinde resim, maske/chroma key, ters oynatma, ses kaydı, iOS motoru. Uygulamada "Planlandı" olarak gösterilirler; hazır gibi sunulmazlar.

## Derleme

CI (`.github/workflows/kurgu-apk.yml`) her push'ta:
1. `npm ci`
2. `npm test` (birim testleri) ve `npm run i18n:check` (çeviri denetimi)
3. `expo export` ile JS paketini doğrular
4. `expo prebuild` + `gradlew assembleRelease` → **Kurgu-apk** yapıtı (arm64-v8a, armeabi-v7a, x86_64)
5. Android 14 emülatöründe kabul akışını çalıştırır → **Kurgu-e2e** yapıtı (ekran görüntüleri, ffprobe raporu, dışa aktarılan videodan kareler)

Yerelde:

```bash
cd kurgu
npm ci
npm test
npm run i18n:check
npx expo prebuild --platform android
npx expo run:android
```

APK sürüm imzası Expo'nun hata ayıklama anahtarıyla yapılır (yan yükleme için). Mağaza dağıtımı için kendi imza anahtarınızı `android/app` imzalama ayarlarına ekleyin.

## Klasörler

```
App.js                          kök: i18n, bildirim, gezinme, ekran yığını
src/i18n/                       çeviri çekirdeği, sağlayıcı, locales/{tr,en,ar}.json
src/model/                      proje biçimi, zaman çizelgesi işlemleri, geçmiş, renk, kataloglar, şablonlar (saf JS)
src/engine/                     render tanımı (proje -> motor) ve yerel motor sarmalayıcısı
src/storage/                    proje kütüphanesi, içe aktarma, ayarlar
src/editor/                     zaman çizelgesi, paneller, metin tutamacı
src/screens/                    ana ekran, editör, dışa aktarma, ayarlar, yardım, AI araçları, şablonlar
src/ui/                         ortak bileşenler (yön duyarlı)
modules/kurgu-engine/android/   Kotlin: Media3 kompozisyon, önizleme görünümü, dışa aktarıcı, efektler, metin katmanı
scripts/                        test çalıştırıcı, çeviri denetimi
tests/                          birim testleri
e2e/                            Maestro emülatör akışları
docs/                           mimari ve özellik envanteri
```

## Kabul testi

Emülatör testi (`e2e/1_kabul_akisi.yaml`) şu akışı otomatik yürütür: yeni proje →
galeriden 3 öğe → oynatma → bölme → metin → filtre ve efekt → geçiş → ses →
uygulamayı kapatıp açma → projeye devam → MP4 dışa aktarma → dosyayı cihazdan
alıp `ffprobe`/`ffmpeg` ile bağımsız olarak çözme. `e2e/2_dil_rtl.yaml` dil
değişimini ve Arapça RTL ekranları denetler.

**Son sonuç (Android 14 emülatörü):** her iki akış da geçti. Dışa aktarılan MP4 galeriye
(Movies/Kurgu) kaydedildi, `ffmpeg` ile baştan sona hatasız çözüldü (H.264 + AAC, 30 fps)
ve uygulamanın süre/çözünürlük/ses denetimi geçti. Uygulama çökmedi, JS hatası yok.

**Gerçek cihaz testi bu sürümde yapılmadı.** Emülatör; donanım kodlayıcıları,
GPU ve bellek açısından gerçek telefondan farklıdır. Yayın öncesi en az bir düşük
ve bir üst seviye Android telefonda aynı akış elle denenmelidir.
