# Otomatik Futbol Editörü

Bir **referans video** ve bir **futbolcu adı** verirsin. Sistem referansın kurgu stilini çıkarır, oyuncunun kliplerini
internette arayıp indirir, çekimleri seçip sıralar, aynı ritim/renk/geçişlerle FFmpeg üzerinden render eder ve
kalite kontrolden geçirir.

```bash
./kurulum.sh
.venv/bin/python -m fe run --ref referans.mp4 --player "Leandro Trossard"
# çıktı: projeler/leandro-trossard/08_EXPORTS/leandro-trossard.mp4
```

## Durum: ne çalışıyor, ne çalışmıyor

`python -m fe doctor` her bileşeni gerçekten çalıştırarak test eder. Claude Code bulut oturumunda alınan sonuç:

| Bileşen | Durum | Not |
|---|---|---|
| Referans analizi (kesim, kararma, donmuş kare, yakınlaşma, renk, müzik) | ✅ çalışıyor | gerçek referans videoyla doğrulandı |
| Çekim çıkarma + yakın/orta/geniş plan sınıflama | ✅ çalışıyor | |
| Yüzden oyuncu doğrulama (YuNet + SFace) | ✅ çalışıyor | yalnızca yüzün göründüğü planlarda |
| Eşleme, renk eşleme (3D LUT), vinyet, yakınlaşma, hareket bulanıklığı, kararmalar | ✅ çalışıyor | |
| Müzik, iki geçişli loudnorm, yazı (drawtext), SFX yerleştirme | ✅ çalışıyor | SFX dosyalarını sen koyarsın |
| Render (FFmpeg/libx264) + kalite kontrol | ✅ çalışıyor | uçtan uca test edildi |
| **İnternette klip arama/indirme (yt-dlp)** | ❌ **bulut oturumunda ENGELLİ** | ağ politikası YouTube'u reddediyor (proxy 403) |

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
# models\ klasörüne şu iki dosyayı indir (kurulum.sh içindeki adresler):
#   face_detection_yunet_2023mar.onnx, face_recognition_sface_2021dec.onnx
.venv\Scripts\python -m fe doctor
```

## Kullanım

```bash
# hepsi bir arada
python -m fe run --ref referans.mp4 --player "Leandro Trossard"

# adım adım
python -m fe analyze --ref referans.mp4 --player "Leandro Trossard"   # 1) style.json + müzik
python -m fe fetch   --player "Leandro Trossard" --max-videos 12      # 2-3) ara + indir
python -m fe shots   --player "Leandro Trossard"                      # 4) çekimler + oyuncu doğrulama
python -m fe plan    --player "Leandro Trossard"                      # 5-6) eşleme + LUT + ses planı
python -m fe render  --player "Leandro Trossard"                      # 7-8) MP4
python -m fe qc      --player "Leandro Trossard"                      # 9) kalite kontrol
```

İndirme seçenekleri:
- `--cookies cookies.txt`: YouTube "bot değilim" doğrulaması isterse tarayıcıdan dışa aktarılmış çerez dosyası.
- `--urls liste.txt`: Arama yerine bu URL'leri indir.
- `--local klasör`: İndirme yapma, bu klasördeki videoları kullan.
- `run --skip-fetch`: `01_FOOTAGE`'da zaten olan klipleri kullan.

Oyuncu doğrulamasını güçlendirmek için `05_IMAGES/` klasörüne oyuncunun 2-3 net yüz fotoğrafını koyabilirsin (isteğe bağlı).

## Proje klasörü

```
projeler/<oyuncu>/
├── 01_FOOTAGE/        indirilen kaynak klipler
├── 02_AUDIO/sfx/      (isteğe bağlı) whoosh*.wav, impact*.wav
├── 03_MUSIC/          music.wav (referanstan çıkarılır)
├── 05_IMAGES/         (isteğe bağlı) oyuncu yüz fotoğrafları
├── 06_PROJECT_FILES/  style.json, manifest.json, shots.json, edl.json, grade.cube, config.json
├── 07_PROXIES/        render parçaları
└── 08_EXPORTS/        <oyuncu>.mp4, <oyuncu>_qc.md/json, <oyuncu>_kontakt.png
```

## Nasıl çalışır

1. **Referans analizi** (`analyze`): Video 60 fps'e kadar kare kare taranır.
   - **Kesimler:** Renk histogramı farkı yerel ortancanın 3 katını aşınca kesim sayılır. Kararma ve açılmalar kesim sayılmaz.
   - **Geçişler:** Siyahtan açılma ve siyaha kararma süreleri ölçülür. Hareketsiz çekimler donmuş kare (freeze), görüntünün kendiliğinden yaklaşması yakınlaşma (push-in, faz korelasyonu ile) olarak işaretlenir.
   - **Diğer efektler:** Netlik düşüşüyle hareket bulanıklığı tahmin edilir.
   - **Plan ölçeği:** Yüz boyutu ve çim oranından yakın, orta ya da geniş plan çıkarılır.
   - **Renk:** Lab ortalaması/sapması ve köşe/merkez parlaklık oranı (vinyet) ölçülür.
   - **Müzik:** Tempo, vuruşlar, LUFS ve sondaki sessizlik ölçülür.
2. **Arama ve indirme** (`fetch`): yt-dlp ile 7 farklı aramadan aday videolar toplanır ("scenepack", "all goals", "skills"…). Başlığında oyuncunun soyadı geçmeyenler, video oyunları (FIFA/EA FC/eFootball), tepki videoları ve başkalarının edit'leri elenir. İndirme en fazla 1080p, yalnızca görüntü. Kaynak adresleri `manifest.json`'a yazılır.
3. **Çekim analizi** (`shots`): Her klip çekimlere bölünür. Aynı plan farklı derlemelerde tekrar ediyorsa elenir. Yüzler SFace ile kümelenir; en sık görünen yüz kümesi (ya da `05_IMAGES` fotoğraflarına en yakın küme) hedef oyuncu kabul edilir. Başka birinin yüzü görünen çekimler hiç kullanılmaz.
4. **Eşleme** (`plan`): Referanstaki her çekim bir "slot" olur. Süreler kare kare aynen korunur, yani kesimler müzikle aynı yerde kalır.
   - **Çekim seçimi:** Her slota aynı plan ölçeğinde bir kaynak çekim seçilir. Aksiyon slotlarında en hareketli an, yakın plan slotlarında doğrulanmış yüz tercih edilir.
   - **Renk:** Seçilen kaynakların renk istatistiği referansa eşlenip `grade.cube` olarak yazılır (Reinhard yöntemi).
5. **Render** (`render`):
   - **Parçalar:** Her slot ayrı parça olarak işlenir: kare kırpma (kadraj merkezi yüze ya da hareketin olduğu yere göre ayarlanır), donmuş kare, yakınlaşma, hareket bulanıklığı, LUT, vinyet ve kararmalar.
   - **Birleştirme ve ses:** Parçalar birleştirilir. Müzik iki geçişli loudnorm ile referansın LUFS değerine getirilir (true peak −1 dBTP).
6. **Kalite kontrol** (`qc`):
   - **Teknik:** Çözünürlük, fps ve süre plana uyuyor mu? Planda olmayan siyah kare ya da donma var mı? LUFS ve true peak sınırda mı?
   - **Kurgu:** Kesimler planlanan karenin ±2 karesinde mi?
   - **İçerik:** Büyütülmüş düşük çözünürlüklü planlar, oyuncu doğrulama oranı, tekrar kullanılan planlar.
   - **Çıktı:** Sonuç kontakt sayfası ve rapor olarak yazılır. Hata varsa çıkış kodu 2.

`config.json` ile ayarlanabilenler: `texts` (yazı ekleme), `grade_strength`, `vignette`, `music` (başka bir müzik; kesimler vuruşlara kaydırılır), `target_lufs`, `sfx`, `slowmo_speed`, `push_in_max`, `allow_unverified_closeups`, `preset`, `crf`.

## İndirme engeli

Claude Code bulut oturumunda test edildi: `youtube.com`, `google.com`, `vimeo.com`, `dailymotion.com`, `pexels.com`, `wikimedia.org` adreslerinin hepsi ağ vekil sunucusu tarafından reddediliyor (403). Çözüm yolları:

1. **Önerilen:** Sistemi kendi bilgisayarında çalıştır (`./kurulum.sh` → `python -m fe run …`). Ev bağlantısında YouTube araması ve indirmesi normal çalışır.
2. **Bulut oturumunda:** Ortam ayarlarından (oturum başlığındaki ortam menüsü → Edit → Network access) `youtube.com`, `www.youtube.com`, `googlevideo.com`, `ytimg.com` alanlarına izin ver. Uyarı: İzin verilse bile YouTube veri merkezi IP'lerinden "bot değilim" doğrulaması isteyebilir. Bu durumda `--cookies` gerekir.

## Eksik bileşenler ve kurulum planı

| Eksik | Etkisi | Plan |
|---|---|---|
| Ağ erişimi (bulut) | Arama/indirme yapılamıyor | Yukarıdaki iki yol |
| Geniş planlarda oyuncu doğrulama | Yüz görünmeyen planlar doğrulanamıyor; derlemelerde başka oyuncu riski | Forma numarası OCR'ı (PaddleOCR/EasyOCR) + oyuncu takibi. Şimdilik kaynak başlık filtresi + kontakt sayfası kontrolü |
| Olay türü (gol, sevinç, çalım) sınıflama | Slotlar plan ölçeği ve harekete göre doluyor, "bu an gol mü" bilinmiyor | Video sınıflandırma modeli ya da yayın grafiklerinden (skor değişimi) gol anı tespiti |
| Referanstaki yazıların tespiti | Yazı stili otomatik kopyalanmıyor | Tesseract/PaddleOCR. Şimdilik `config.json → texts` |
| Hızlanma/yavaşlama (speed ramp) ve interpolasyonlu ağır çekim tespiti | Yalnızca kare tekrarıyla yapılmış ağır çekim yakalanıyor | Optik akış hız profili |
| SFX kütüphanesi | Sistem ses efekti üretmez | Lisanslı whoosh/impact dosyalarını `02_AUDIO/sfx/` klasörüne koy, `config.json → "sfx": true` |
| Müzik tanıma | Referanstaki şarkının orijinali bulunamıyor (referans ses genelde düşük bitrate) | Orijinal dosyayı `config.json → music` ile ver |

## Telif

İndirilen maç görüntüleri ve müzikler hak sahiplerine aittir. `manifest.json` her klibin kaynağını kaydeder. Videoyu yayınlamadan önce kullanım hakkını kontrol etmek sana düşer. TikTok/Instagram'da müziği gömmek yerine platformun ses kütüphanesinden eklemek daha güvenlidir.

## Test

```bash
.venv/bin/python -m unittest discover -s tests
```
