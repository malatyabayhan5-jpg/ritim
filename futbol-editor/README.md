# Otomatik Futbol Editörü

Bir **referans video** ve bir **futbolcu adı** verirsin. Sistem şunları yapar:
1. Referansın kurgu stilini çıkarır.
2. Oyuncunun **gerçek maç ve antrenman görüntülerini** YouTube, resmî kanallar, TikTok, Instagram, X ve Google Video üzerinde arar ve indirir.
3. Görüntüleri sahne sahne değerlendirip seçer.
4. Aynı ritim, renk ve geçişlerle FFmpeg üzerinden render eder.
5. Kalite kontrolden geçirir.

**Stok video siteleri (Pexels, Pixabay, Mixkit, Shutterstock vb.) kullanılmaz.** Bu siteler aramaya hiç dahil edilmez ve başka bir kaynaktan adresleri gelse bile elenir.

```bash
./kurulum.sh
.venv/bin/python -m fe run --ref referans.mp4 --player "Leandro Trossard" --clubs "Arsenal,Brighton,Belgium"
# çıktı: projeler/leandro-trossard/08_EXPORTS/leandro-trossard.mp4
```

## Durum: ne çalışıyor, ne çalışmıyor

`python -m fe doctor` her bileşeni ve her platformu gerçekten bağlanarak test eder. Claude Code bulut oturumunda alınan sonuç:

| Bileşen | Bulut oturumu | Kendi bilgisayarında (beklenen) |
|---|---|---|
| Referans analizi, çekim çıkarma, yüzden oyuncu doğrulama | ✅ çalışıyor (test edildi) | ✅ |
| Eşleme, renk (3D LUT), efektler, müzik, render, kalite kontrol | ✅ çalışıyor (uçtan uca test edildi) | ✅ |
| YouTube sitesi / yt-dlp araması | ❌ ENGELLİ (proxy 403) | ✅ |
| YouTube video dosyaları (googlevideo.com), yani indirme | ❌ ENGELLİ | ✅ |
| TikTok, Instagram, X, google.com | ❌ ENGELLİ | ✅ (Instagram ve X çoğu zaman giriş çerezi ister) |
| Google API'leri (googleapis.com): YouTube Data API, Programmable Search | ✅ sunucuya erişiliyor, **API anahtarı gerekli** | ✅ anahtarla |

Yani bulut oturumunda API anahtarıyla **arama ve aday listesi** çıkarılabilir, ama **video indirilemez**. Tam otomatik akış için sistemi kendi bilgisayarında çalıştır ya da ağ izni ver ("İndirme engeli" bölümüne bak).

## Kaynaklar ve arama stratejisi

| Sağlayıcı | Ne yapar | Gereken | Sınır |
|---|---|---|---|
| `youtube_api` | YouTube Data API v3 ile arama. Süre, HD bilgisi, **lisans** (Creative Commons mu?) ve kanal bilgisi gelir | `YT_API_KEY` | Arama başına 100 kota birimi. Varsayılan günlük kota 10.000 birim, tam tarama yaklaşık 2.000 birim |
| `youtube` | yt-dlp ile YouTube araması | youtube.com erişimi | Veri merkezi IP'lerinde bot doğrulaması isteyebilir (`--cookies`) |
| `channels` | Resmî kulüp, lig ve yayıncı kanallarının **içinde** oyuncu araması | `--channels '@kanal'` ya da aramada bulunan resmî kanallar | |
| `tiktok` | `#leandrotrossard`, `#trossard`, `#trossardarsenal` gibi hashtag sayfaları | tiktok.com erişimi | TikTok'un herkese açık arama API'si yok. Videolar dikey ve çoğu filigranlı |
| `instagram` | Hashtag sayfaları | **giriş çerezi** (`--cookies`) | Instagram girişsiz erişimi büyük ölçüde kapatıyor |
| `google` | Google Programmable Search: X, Instagram, TikTok ve YouTube'daki **tekil gönderi** adreslerini bulur | `GOOGLE_API_KEY` + `GOOGLE_CSE_ID` | Günlük ücretsiz kota sınırlı. Google'ın güncel koşullarını kontrol et |
| `--urls liste.txt` | Elindeki X/Instagram/TikTok/YouTube gönderi adreslerini indirir | | X ve Instagram çoğu zaman `--cookies` ister |

**X (Twitter):** Doğrudan arama yoktur, çünkü X'in arama API'si ücretli erişim istiyor. X gönderileri `google` sağlayıcısı ya da `--urls` ile bulunur, yt-dlp ile indirilir.

**Aranan görüntü türleri.** Her tür için farklı arama ifadeleri kullanılır. `{club}` kalıpları `--clubs` ile verdiğin her kulüp için ayrı ayrı çalışır.

| Kategori | Örnek aramalar |
|---|---|
| `yakin_plan`: maç içi yakın planlar | "{p} close up", "{p} 4K scenepack", "{p} tunnel cam" |
| `gol_asist`: gol ve asistler | "{p} all goals", "{p} goals and assists", "{p} goal {club}" |
| `calim`: çalım ve driplingler | "{p} skills dribbles", "{p} dribbling", "{p} skills {club}" |
| `kosu_mucadele`: koşular ve ikili mücadeleler | "{p} every touch", "{p} duels", "{p} sprint speed" |
| `sevinc`: gol sevinçleri | "{p} celebration", "{p} goal celebration" |
| `antrenman`: antrenman | "{p} training", "{club} training {p}" |
| `farkli_aci`: farklı açılar | "{p} player cam", "{p} tactical cam", "{p} behind the scenes", "{p} pitchside" |

**Eleme ve sıralama:**
- **Elenenler:** Başlığında oyuncunun soyadı geçmeyen videolar, video oyunları (FIFA/EA FC/eFootball), tepki videoları, başkalarının edit'leri, basın toplantıları ve röportajlar.
- **Öne çıkanlar:** Resmî kanallar (lig/yayıncı adları + `--clubs`), HD, uygun süre (30 sn–15 dk) ve Creative Commons lisans.
- **İndirme sırası:** Her kategoriden sırayla seçilir, böylece her görüntü türünden kaynak gelir.

**İzin durumu.** Her indirilen klip için `kaynak_raporu.md` dosyasına yazılır:
- Creative Commons ise atıf ile yeniden kullanım izinli.
- Diğer her şey (resmî kurum, standart YouTube lisansı, sosyal medya gönderisi) için "yeniden yayın izni yok".

Bu bilgilendirme amaçlıdır, hukuki tavsiye değildir.

## Sahne sahne değerlendirme

`shots` adımı her kaynak videoyu çekimlerine ayırır ve `06_PROJECT_FILES/kaynak_degerlendirme.md` dosyasına yazar.

**Kaynak başına ölçülenler:**
- Kullanılabilir çekim sayısı, yakın/orta/geniş dağılımı
- Hedef oyuncu olarak doğrulanan çekimler ve başka kişilerin yüzleri
- Çözünürlük ve dikey video uyarısı
- **Sabit grafik/filigran tahmini** (skor tabelası, kanal logosu) ve siyah bant

**Karar:** Her kaynak "iyi", "sınırlı" ya da "kullanma" alır. "Kullanma" alan kaynaklar (ör. başka bir oyuncu ağırlıklı derleme) kurguya hiç girmez.

**Kontakt sayfaları:** `kaynak_kontakt/` klasörüne yazılır. Etiket renkleri: yeşil = hedef oyuncu, kırmızı = başka kişi, gri = belirsiz.

**Oyuncu doğrulama:**
- **Hedef yüzün belirlenmesi:** SFace yüz imzaları kümelenir; en sık görünen yüz hedef kabul edilir. İstersen `05_IMAGES/` klasörüne oyuncunun fotoğraflarını koy, o zaman hedef fotoğrafa göre seçilir.
- **Benzerlik eşikleri:** Hedef yüze benzerlik ≥0,30 ise "hedef", <0,18 ise "başka kişi", aradaki değerler "belirsiz".
- **Küçük yüzler:** Görüntünün %0,8'inden küçük yüzlerle kimlik kararı verilmez.

## Kurulum

**macOS / Linux**
```bash
cd futbol-editor
./kurulum.sh          # venv + numpy/opencv/yt-dlp + yüz modelleri (sha256 doğrulamalı) + doctor
```
Gerekenler: Python 3.10+, ffmpeg (`brew install ffmpeg` / `sudo apt install ffmpeg`).

**Windows (PowerShell)**
```powershell
winget install Gyan.FFmpeg
cd futbol-editor
py -m venv .venv; .venv\Scripts\pip install -r requirements.txt
# models\ klasörüne kurulum.sh içindeki iki .onnx dosyasını indir
.venv\Scripts\python -m fe doctor
```

### API anahtarları (isteğe bağlı ama önerilir)
- **YouTube Data API v3:** Google Cloud Console'da bir proje aç, "YouTube Data API v3"ü etkinleştir ve bir API anahtarı oluştur. Sonra: `export YT_API_KEY=...`
- **Google Programmable Search:** programmablesearchengine.google.com'da tüm web'i arayan bir arama motoru oluştur (`GOOGLE_CSE_ID`). Google Cloud'da "Custom Search API"yi etkinleştir (`GOOGLE_API_KEY`). Sonra: `export GOOGLE_API_KEY=... GOOGLE_CSE_ID=...`

Anahtarları koda ya da repoya yazma; yalnızca ortam değişkeni olarak ver.

### Giriş çerezi (Instagram, X, YouTube bot doğrulaması)
Tarayıcıda ilgili siteye giriş yap. "Get cookies.txt LOCALLY" gibi bir eklentiyle Netscape biçiminde `cookies.txt` dışa aktar ve `--cookies cookies.txt` ile ver. Bu dosya oturum anahtarın sayılır: paylaşma ve repoya koyma.

## Kullanım

```bash
# hepsi bir arada
python -m fe run --ref referans.mp4 --player "Leandro Trossard" --clubs "Arsenal,Brighton,Belgium"

# adım adım
python -m fe analyze --ref referans.mp4 --player "Leandro Trossard"            # 1) style.json + müzik
python -m fe fetch   --player "Leandro Trossard" --clubs "Arsenal,Brighton,Belgium" --max-videos 15
python -m fe shots   --player "Leandro Trossard"                               # sahne sahne değerlendirme
python -m fe plan    --player "Leandro Trossard"                               # eşleme + LUT + ses
python -m fe render  --player "Leandro Trossard"                               # MP4
python -m fe qc      --player "Leandro Trossard"                               # kalite kontrol
```

`fetch` / `run` seçenekleri:
- `--clubs`: Kulüp ve milli takım adları. Kulüp aramalarında, hashtag'lerde ve resmî kanal tespitinde kullanılır.
- `--channels '@kanal,...'`: İçinde arama yapılacak resmî YouTube kanalları.
- `--providers youtube_api,youtube,channels,tiktok,instagram,google`: Hangi kaynaklar kullanılacak. `none` verirsen arama yapılmaz, yalnızca `--urls`/`--local` kullanılır.
- `--cc-only`: Yalnızca Creative Commons lisanslı YouTube videoları (YouTube API gerekir).
- `--urls liste.txt`, `--local klasör`, `--cookies cookies.txt`, `--max-videos`, `--per-query`

Bu ayarlar `06_PROJECT_FILES/config.json` dosyasına da yazılabilir (`clubs`, `official_channels`, `providers`, `cc_only`).

## Proje klasörü

```
projeler/<oyuncu>/
├── 01_FOOTAGE/        indirilen kaynak klipler
├── 02_AUDIO/sfx/      (isteğe bağlı) whoosh*.wav, impact*.wav
├── 03_MUSIC/          music.wav (referanstan)
├── 05_IMAGES/         (isteğe bağlı) oyuncu yüz fotoğrafları
├── 06_PROJECT_FILES/  style.json, manifest.json, kaynak_raporu.md, kaynak_degerlendirme.md,
│                      kaynak_kontakt/, shots.json, edl.json, grade.cube, config.json
├── 07_PROXIES/        render parçaları
└── 08_EXPORTS/        <oyuncu>.mp4, <oyuncu>_qc.md/json, <oyuncu>_kontakt.png
```

## Nasıl çalışır (özet)

1. **analyze:** Referans 60 fps'e kadar taranır.
   - **Kesimler:** Renk histogramı farkıyla bulunur; kararma ve açılmalar kesim sayılmaz.
   - **Efektler:** Siyaha kararma, donmuş kare, yakınlaşma (faz korelasyonu) ve hareket bulanıklığı tespit edilir.
   - **Plan ölçeği:** Yakın/orta/geniş plan yüz boyutu ve çim oranından çıkarılır.
   - **Renk ve ses:** Lab renk istatistiği, vinyet, tempo, vuruşlar ve LUFS ölçülür.
2. **fetch:** Arama ve indirme yapılır. Yukarıdaki bölümlere bak.
3. **shots:** Sahne sahne değerlendirme ve oyuncu doğrulama. Yukarıdaki bölüme bak.
4. **plan:** Referanstaki her çekim bir slot olur ve süreler kare kare korunur.
   - **Çekim seçimi:** Slota aynı plan ölçeğinde bir kaynak çekim seçilir. Puanlamada kategori uyumu (yakın plan slotuna `yakin_plan`/`sevinc`, aksiyona `calim`/`gol_asist`), hareket, doğrulanmış yüz, çözünürlük ve resmî kaynak öne çıkar.
   - **Renk:** Kaynakların renk istatistiği referansa eşlenip `grade.cube` LUT dosyası olarak yazılır.
5. **render:** Parça parça işlenir: kare kırpma (kadraj yüze ya da hareketin olduğu yere göre ayarlanır), donmuş kare, yakınlaşma, hareket bulanıklığı, LUT, vinyet ve kararmalar. Ardından birleştirilir; müzik iki geçişli loudnorm ile işlenir.
6. **qc:** Çözünürlük, fps, süre, planlanmamış siyah kare veya donma, LUFS/true peak, kesim zamanlaması, büyütme oranı, oyuncu doğrulama oranı ve tekrar kullanılan planlar kontrol edilir. Sonuç kontakt sayfası ve raporla birlikte yazılır.

## İndirme engeli

Bulut oturumunda test edilen adreslerin hepsi ağ vekil sunucusu tarafından reddediliyor (403): `youtube.com`, `googlevideo.com`, `ytimg.com`, `tiktok.com`, `instagram.com`, `x.com`, `google.com`. Yalnızca `googleapis.com` açık. Çözüm yolları:

1. **Önerilen:** Sistemi kendi bilgisayarında çalıştır.
2. **Bulut oturumunda:** Ortam ayarlarından (oturum başlığındaki ortam menüsü → Edit → Network access) şu alanlara izin ver: `youtube.com`, `googlevideo.com`, `ytimg.com`, `tiktok.com`, `tiktokcdn.com`, `instagram.com`, `cdninstagram.com`, `x.com`, `twitter.com`, `twimg.com`. İzin verilse bile platformlar veri merkezi IP'lerinden giriş ya da bot doğrulaması isteyebilir; o zaman `--cookies` gerekir.

## Eksik bileşenler

| Eksik | Etkisi | Plan |
|---|---|---|
| Ağ erişimi (bulut) | İndirme yapılamıyor | Yukarıdaki iki yol |
| Geniş planlarda oyuncu doğrulama | Yüz görünmeyen planlar "belirsiz" kalıyor | Forma numarası OCR'ı (PaddleOCR/EasyOCR) + oyuncu takibi |
| Olay türü sınıflama | Kategori aramadan geliyor; tek bir çekimin gol mü sevinç mi olduğu ayrıca tanınmıyor | Video sınıflandırma modeli ya da skor grafiği değişimi |
| Referanstaki yazıların tespiti | Yazı stili kopyalanmıyor | Tesseract/PaddleOCR. Şimdilik `config.json → texts` |
| Speed ramp ve interpolasyonlu ağır çekim tespiti | Yalnızca kare tekrarıyla yapılmış ağır çekim yakalanıyor | Optik akış hız profili |
| SFX kütüphanesi | Sistem ses efekti üretmez | Lisanslı dosyaları `02_AUDIO/sfx/` klasörüne koy |
| Müzik tanıma | Referans şarkının orijinali bulunamıyor | `config.json → music` |

## Telif

Maç görüntüleri kulüplere, liglere ve yayıncılara, sosyal medya gönderileri yükleyenlere aittir. Sistem her klibin kaynağını ve izin durumunu kaydeder. Yayınlamadan önce kullanım hakkını kontrol etmek sana düşer.

## Test

```bash
.venv/bin/python -m unittest discover -s tests     # 18 test, ağ gerektirmez
```
