# Bağlam dosyası: Otomatik Futbol Editörü projesi

> Bu dosya, önceki sohbetin eksiksiz özetidir. Yeni bir sohbet (Claude Code, bulut ya da kendi bilgisayarında) bu dosyayı okuyarak projeyi sıfırdan devralabilir.
>
> Son güncelleme: 1 Kasım 2026 · Repo: `malatyabayhan5-jpg/ritim` · Dal: `ccr-81737664-qzt34u`

---

## 1. Projenin amacı

Kullanıcı yalnızca iki şey verir: **bir referans video** (TikTok'tan indirilmiş bir futbol edit'i) ve **hedef futbolcunun adı**. Sistem şunları **tam otomatik** yapmalı:

1. Referans videoyu analiz etmek: kurgu ritmi, geçişler, efektler, müzik, renk, sahne süreleri, kamera hareketleri.
2. Hedef futbolcunun **gerçek** görüntülerini internette kendisi araştırmak.
3. Erişilebilir ve indirilebilir kaynaklardan uygun klipleri bulup proje klasörüne indirmek.
4. Görüntüleri otomatik seçip sıralamak.
5. Referansın kurgu stilini hedef futbolcuya uygulamak.
6. Müzik, ses efekti, renk, yazı ve geçişleri hazırlamak.
7. FFmpeg ve Python ile render etmek.
8. Sonucu proje klasörüne MP4 olarak kaydetmek.
9. Videoyu kalite kontrolden geçirmek.

**İlk somut hedef:** Kullanıcının referans videosundaki edit stilini **Leandro Trossard** için "birebir aynı tarzda" uygulamak.

**Son amaç:** Kullanıcının sözüyle: "Stok videolarla değil, gerçek futbolcu görüntüleriyle profesyonel futbol editleri üretmek."

---

## 2. Kullanıcı hakkında ve iletişim

- **Dil:** Kullanıcı Türkçe konuşuyor; yanıtlar **Türkçe** olmalı. İlk mesajı İngilizce bir skill metniydi, sonrası hep Türkçe.
- **Üslup:** Kısa ve doğrudan yazıyor ("Kurdunmu skilli", "Lan … çıkar kullan işte", "Klipleri sen bulucan olum"). Uzun açıklama yerine iş görmek istiyor.
- **Beklentisi:** Klipleri kendisinin bulmaması. Ondan **yalnızca gerçekten zorunlu olduğunda** yardım istenmeli.
- **Kullandığı araç:** Videoları ssstik.io ile indiriyor (TikTok indiricisi).
- **İşletim sistemi:** Bilinmiyor. Mac/Linux mu Windows mu, sorulmadı ve öğrenilmedi.

---

## 3. Kullanıcının koyduğu kurallar ve talimatlar (bağlayıcı)

1. **Stok video siteleri kullanılmayacak.** Pexels, Pixabay, Mixkit ve benzerleri araştırılmayacak. Sistem bunları ve Shutterstock, Getty, Pond5, Envato, Storyblocks, Videvo, Coverr, iStock, Adobe Stock, Videezy, Dissolve, Artgrid, Motion Array'i her aşamada eler.
2. **Öncelikli kaynaklar:** YouTube, X (Twitter), Instagram, TikTok, Google Video arama, kulüplerin ve yayıncı kuruluşların resmî medya kanalları.
3. **Aranacak görüntü türleri:** maç içi yakın planlar, gol ve asistler, çalım ve driplingler, koşular ve ikili mücadeleler, gol sevinçleri, antrenman görüntüleri, farklı açılardan çekimler.
4. Her kaynakta **farklı arama ifadeleri** kullanılmalı.
5. Bulunan videolar **sahne sahne** değerlendirilmeli; erişilebilir ve indirilebilir kaynaklar belirlenmeli.
6. **İndirme izni ya da erişim engeli varsa açıkça bildirilmeli.**
7. **Çalışmayan araçlar çalışıyor gibi gösterilmemeli.**
8. **Önce kendi başına araştırma ve indirme imkânlarını test et.** Eksik otomasyon bileşenlerini kendin tespit et ve kurulum planını hazırla.
9. "Benden klipleri tek tek bulmamı isteme."
10. Referans stil "**birebir aynı**" uygulanmalı.

Ayrıca kullanıcının yüklediği **professional-video-editor** skill'inin kuralları geçerli (bkz. 5. bölüm).

---

## 4. Ortam gerçekleri (test edilerek doğrulandı)

### Bulut oturumu (Claude Code on the web)
| Hedef | Durum |
|---|---|
| youtube.com, www.youtube.com | ❌ Engelli (proxy 403 / connect_rejected) |
| googlevideo.com (YouTube video dosyaları), i.ytimg.com | ❌ Engelli |
| tiktok.com, instagram.com, x.com, twitter.com, api.x.com | ❌ Engelli |
| google.com (arama sitesi) | ❌ Engelli |
| vimeo.com, dailymotion.com, pexels.com, commons.wikimedia.org, huggingface.co | ❌ Engelli |
| **googleapis.com** (YouTube Data API v3, Custom Search API) | ✅ **Erişilebilir.** Google'dan gelen yanıt: "API anahtarı gerekli". Anahtarla bulutta **arama** yapılabilir ama **indirme yapılamaz** (googlevideo.com kapalı) |
| pypi.org, files.pythonhosted.org | ✅ Erişilebilir (pip çalışıyor) |
| media.githubusercontent.com | ✅ Erişilebilir (yüz modelleri buradan iniyor) |
| github.com/…/raw | ❌ 403 |
| api.github.com | ✅ |

- **Bilgisayar bağlantısı:** `list_computer_folders` boş döndü; kullanıcının bilgisayarı bu oturuma bağlı değil.
- **Bulut ortamı:** Python 3.13, ffmpeg 6.1.1 (gerekli tüm filtreler var), 4 çekirdek, 15 GB RAM. Sistemde numpy var; opencv ve yt-dlp yok, venv'e kuruluyor.
- **OpenCV 5.0:** Haar cascade dosyalarını içermiyor. Bu yüzden YuNet + SFace ONNX modelleri kullanılıyor.

### Kullanıcının kendi bilgisayarı (beklenen, henüz test edilmedi)
YouTube ve TikTok'un çalışması beklenir. Instagram ve X çoğu zaman giriş çerezi (`cookies.txt`) ister.

---

## 5. Repo, dal ve dosyalar

- **Repo:** `malatyabayhan5-jpg/ritim`. Asıl içeriği bir React Native müzik uygulaması (Türkçe; `src/`, `App.js`, `e2e/`, `BENIOKU.md` vb.). Video editörü bu repoya **ayrı bir klasör** olarak eklendi; uygulama koduna dokunulmadı.
- **Çalışma dalı:** `ccr-81737664-qzt34u`. Her şey bu dala commit edilip push edildi. **PR açılmadı.** Kullanıcı istemedi, istenmeden açılmamalı.
- **Commit'ler:**
  - `6e438d2`: professional-video-editor skill eklendi
  - `cdf2cb6`: futbol-editor hattı eklendi
  - `6b04484`: çok platformlu gerçek görüntü arama + sahne sahne kaynak değerlendirme
  - (bu dosya ile bir commit daha)

### 5.1 Skill: `.claude/skills/professional-video-editor/SKILL.md`
- Kullanıcının yapıştırdığı İngilizce skill metni birebir korundu. Yalnızca YAML frontmatter'ın kapanış `---` satırı eklendi ve başlıklar Markdown'a çevrildi.
- **İçerik (1–17. bölümler):** Kıdemli video editörü kimliği; Premiere Pro, After Effects, renk, ses; "hikâye efektten önce gelir"; fırça/boya sıçraması/grunge efekti yasak (kullanıcı açıkça istemedikçe); proje klasör yapısı 01_FOOTAGE…09_ARCHIVE; 8 aşamalı iş akışı; sosyal medya formatları; futbol medyası kuralları ("oyuncu yüzlerini, armaları, sponsorları bozma; maç görüntüsü veya istatistik uydurma"); müzik lisansı; teslim standartları; sorun giderme formatı; yanıt formatı (Project Overview → … → Final Quality Checklist, zaman kodlu plan); yapay zekâ araçları; "zayıf fikre körü körüne katılma".
- **18. bölüm (sonradan eklendi):** Otomatik Futbol Editörü iş akışı:
  - önce `doctor` çalıştırılır;
  - `run --clubs …` ile hat başlatılır;
  - stok yasaktır;
  - kaynak önceliği yukarıdaki gibidir;
  - `kaynak_raporu.md` ile `kaynak_degerlendirme.md` okunur;
  - kalite raporu ve kontakt sayfasına bakılmadan iş bitmiş sayılmaz;
  - indirilmemiş bir şey indirildi denmez;
  - başka görüntü oyuncununmuş gibi sunulmaz;
  - telif sorumluluğu kullanıcıdadır.
- **Kapsam:** Skill bu repoya özel. Her projede geçerli olması için `~/.claude/skills/` altına kopyalanması gerekir (kullanıcıya söylendi).

### 5.2 Editör: `futbol-editor/`
```
futbol-editor/
├── BAGLAM.md            ← bu dosya
├── README.md            Türkçe: kurulum, kullanım, kaynaklar, engeller, eksikler, telif
├── kurulum.sh           venv + pip + yüz modelleri (sha256 doğrulamalı) + doctor
├── requirements.txt     numpy>=1.24, opencv-python-headless>=4.8, yt-dlp>=2025.1.1
├── .gitignore           .venv/, __pycache__/, projeler/, models/*.onnx
├── models/              (git'te yok) YuNet + SFace .onnx
├── fe/
│   ├── __main__.py      CLI: doctor | analyze | fetch | shots | plan | render | qc | run
│   ├── util.py          komut çalıştırma, ffprobe, ffmpeg ile kare okuma, proje klasörü yolları
│   ├── features.py      kare özellikleri, kesim tespiti, kararma, kamera hareketi, yüz (YuNet/SFace), Lab renk
│   ├── audio.py         müzik çıkarma, tempo/vuruş, EBU R128 LUFS, sondaki sessizlik
│   ├── analyze.py       1) referans → style.json + 03_MUSIC/music.wav
│   ├── sources.py       platform sağlayıcıları, arama kalıpları, stok engeli, izin durumu, sıralama
│   ├── fetch.py         2-3) arama + indirme + kaynak_raporu.md + manifest.json
│   ├── shots.py         4) çekim çıkarma, yüzden oyuncu doğrulama, sahne sahne kaynak değerlendirme
│   ├── plan.py          5-6) slot eşleme, LUT (grade.cube), vinyet, config varsayılanları
│   ├── render.py        7-8) parça parça FFmpeg render, birleştirme, loudnorm, yazı, SFX
│   ├── qc.py            9) kalite kontrol raporu + kontakt sayfası
│   └── doctor.py        ortam ve platform erişim testi (API kotasını harcamadan, tek sorgu)
└── tests/
    ├── test_pipeline.py renk dönüşümü, LUT, vinyet, kare hesabı, kesim/kararma tespiti (sentetik video)
    └── test_sources.py  stok engeli, başlık filtresi, sorgular, hashtag, izin, API ayrıştırma (taklit), rapor
```
Toplam yaklaşık 2.600 satır Python. **18 testin hepsi geçiyor** (`.venv/bin/python -m unittest discover -s tests`, ağ gerektirmez).

### 5.3 Repoya girmeyen ve kaybolabilecek dosyalar (bulut konteyneri)
- **Referans video:** `/root/.claude/uploads/7002d1cb-dd44-59ea-802b-61b2ccb00b41/24195365-ssstik.io_1793554114471.mp4`. Yalnızca bu bulut oturumunda var. **Yeni oturumda kullanıcının tekrar yüklemesi ya da bilgisayarında proje klasörüne koyması gerekir.**
- **Çıkarılmış müzik:** `/home/user/ritim/cikti/referans_muzik_48k.wav` ve `referans_muzik.m4a`. `cikti/` klasörü `.git/info/exclude` ile git dışında tutuldu. Kullanıcıya dosya olarak gönderildi. Hat zaten müziği referanstan otomatik çıkarıyor.

---

## 6. Referans videonun analizi (ölçülen gerçek değerler)

**Dosya:** 576×576 (1:1), 60 fps, H.264, 61,18 sn. Ses AAC 44,1 kHz stereo, **yalnızca 32 kbps** (çok düşük kalite; ssstik sıkıştırması).

**İçerik:** Kylian Mbappé edit'i (PSG ve Fransa görüntüleri). **Ekranda hiç yazı yok.** Beyaz flaş, sarsıntı, glitch, RGB kayması ve zoom geçişi yok.

**Otomatik analiz sonucu (`style.json`):**
- **Çekimler:** 154 çekim, ortanca süre 0,217 sn (en kısa 0,05, en uzun 2,15).
- **Plan ölçeği:** 18 yakın, 58 orta, 77 geniş, 1 siyah.
- **Bölümler (7):**

  | Aralık | Tempo | Not |
  |---|---|---|
  | 0–6,8 sn | çok hızlı | |
  | 6,8–13,6 | çok hızlı | |
  | 13,6–16,2 | hızlı | |
  | 16,2–26,6 | hızlı | |
  | 26,6–44,6 | hızlı | |
  | 44,6–52,2 | orta | |
  | 52,2–57,75 | — | siyah |
- **Açılış:** 0,6 sn siyahtan açılış. İlk plan karanlık bir takım grubu.
- **Donmuş kare girişi:** **1,0–6,4 sn arasında ~50 donmuş kare** (freeze frame), her biri yaklaşık 0,1 sn (60 fps'te 6–7 kare). Önce şut anları, sonra sevinçler. Hareket ölçümü 0 çıktığı için donmuş kare oldukları anlaşıldı.
- **Bölüm sonu kararmaları (6):** 6,5 / 12,35 / 15,6 / 25,9 / 44,1 / 50,75 sn. **İmza teknik:** Klip yaklaşık 0,2–0,6 sn'de siyaha kararır, sonraki klip **kararmadan, düz kesmeyle** vuruşta gelir. Tek taraflı kararma, "Dip to Black" değil.
- **Yakınlaşma:** ~9,0–11,1 sn arasındaki karanlık portrede yavaş yakınlaşma (×1,45, ~2,15 sn).
- **Diğer efektler:** 21 çekimde hareket bulanıklığı (ör. 24,0–24,4 sn hızlı çalımda). Kare tekrarı tabanı 0,526 (30 fps kaynaklar 60 fps'e çevrilmiş), buna göre gerçek ağır çekim tespiti 1 çekim.
- **Kapanış:** 50,75–52,2 sn son yakın plan ~0,8 sn'de kararır. 52,2–57,75 sn siyah ekranda müzik devam eder. 57,75–61,2 sn tam sessizlik (büyük ihtimalle dışa aktarma artığı; hat bunu kırpar).
- **Renk:**
  - Lab ortalama [25,4, −2,4, 4,2], sapma [20,8, 7,4, 9,4].
  - Parlaklık p2/p50/p98 = 0,084/0,248/0,380.
  - Ortalama doygunluk 0,293. Köşe/merkez parlaklık oranı 0,84 (vinyet).
  - Görünüm: soluk, karanlık, sinematik; gölgeler hafif yeşil-camgöbeği.
- **Müzik:** Otomatik tempo tahmini 123 BPM. İlk elle analizde ~92 BPM da bulunmuştu (bas vuruşları ~1,3 sn arayla; tahmin belirsiz). Ortalama ses yüksekliği −14,4 LUFS, LRA 4,9, true peak −0,4 dBFS. **Şarkı tanımlanamadı.**

**Trossard için elle yazılmış zaman kodlu plan (sohbette verildi):**

| Aralık | İçerik |
|---|---|
| 0–1 sn | Karanlık atmosfer |
| 1–6,4 sn | Şut ve sevinç flaşları (donmuş kare) |
| 6,4–9 sn | Karakter planları |
| 9–11,1 sn | Portre, yakınlaşmalı |
| 11,1–24 sn | Çalımlar ve hız rampaları |
| 24–26,4 sn | Hareket bulanıklığı ve kararma |
| 26,6–27,3 sn | Kişilik anı |
| 27,3–44,5 sn | Karışık aksiyon |
| 44,6–47 sn | Ağır çekim sevinç |
| 47–50,8 sn | Duygusal kapanış |
| 50,8–52,3 sn | Siyaha kararma |
| 52,3–57,5 sn | Siyah ekranda müzik |

**Premiere için verilen başlangıç değerleri:**
- **Lumetri:** Exposure −0.3, Contrast +20, Highlights −30, Whites −15, Shadows −10, Blacks −10, Saturation 65, Vibrance −10, Faded Film 5; vinyet −1.0 / 40 / 70.
- **Hareket bulanıklığı:** Transform efekti, shutter 360.
- **Export:** H.264 1080×1080, 16–20 Mbps, AAC 320k / 48 kHz, −14 LUFS / −1 dBTP.

**Trossard hakkında dikkat:** Oyuncu hakkında olgu uydurulmamalı. Sohbette yalnızca kulüpleri kullanıldı: Arsenal, Brighton, Belçika (ayrıca Genk geçmişi var). Belirli maç veya istatistik iddia edilmedi.

---

## 7. Hattın teknik iş akışı

Komut: `python -m fe run --ref <referans.mp4> --player "<Ad Soyad>" --clubs "Kulüp1,Kulüp2,MilliTakım"`. Varsayılan proje klasörü: `projeler/<oyuncu-slug>/`. Alt klasörler: 01_FOOTAGE, 02_AUDIO, 03_MUSIC, 04_GRAPHICS, 05_IMAGES, 06_PROJECT_FILES, 07_PROXIES, 08_EXPORTS, 09_ARCHIVE.

**1. analyze**
- **Tarama:** ffmpeg ile 320 px genişliğe küçültülmüş kareler, referans için 60 fps'e kadar.
- **Kesim tespiti:** 8×8×8 renk histogramı farkı > 0,28 ve yerel ortancanın 3 katı. İki durumda kesim **sayılmaz**:
  - aynı görüntünün parlaklığı değişiyorsa (gri korelasyon > 0,85 ve ton farkı < 0,06);
  - kesimin iki yanında ±0,1 sn boyunca parlaklık tek yönlü ve kademeli değişiyorsa (tek adım toplamın %40'ını geçmez, adımların ≥%50'si sıfır değildir).
- **Siyah bölümler:** ≥0,25 sn süren siyahlar ayrı çekim olur.
- **Kararma ve açılma:** Yumuşatılmış parlaklık eğrisinde 0,1 sn'lik adımlarla ölçülür.
- **Donmuş kare:** hareket < 0,002 ve ≥3 kare.
- **Ağır çekim:** kare tekrar oranı > taban + 0,25.
- **Yakınlaşma:** Faz korelasyonu; sol/sağ ve üst/alt yarıların kayma farkı.
- **Hareket bulanıklığı:** Netlik ortancanın %60'ının altında ve hareket ortancanın üstünde.
- **Plan ölçeği:** Yüz alanı ≥ %1,5 ve çim < %45 ise yakın plan; çim ≥ %30 ise geniş; aksi halde orta. Yüz tespiti YuNet ile, kısa çekimlerde ortadaki kare ayrıca okunarak.
- **Ses:** Müzik 48 kHz WAV olarak çıkarılır, sondaki sessizlik kırpılır. Tempo, vuruş, LUFS ve bitrate ölçülür; 96 kbps altında uyarı verilir.
- **Çıktı çözünürlüğü:** Kısa kenar 1080 (referans kareyse 1080×1080). fps referansla aynı (60).

**2. fetch** (`sources.py`)
- **Sağlayıcılar:**

  | Sağlayıcı | Ne yapar | Gereken |
  |---|---|---|
  | `youtube_api` | YouTube Data API v3; süre, HD ve lisans bilgisi | `YT_API_KEY` |
  | `youtube` | yt-dlp `ytsearch` | — |
  | `channels` | Resmî kanal içi arama (`/@kanal/search?query=`) | config'den kanal ya da aramada keşfedilen resmî kanallar |
  | `tiktok` | yt-dlp `tiktok:tag` hashtag sayfaları | — |
  | `instagram` | yt-dlp `instagram:tag` | çerez **zorunlu** |
  | `google` | Programmable Search; X/Instagram/TikTok/YouTube'daki tekil gönderi adresleri | `GOOGLE_API_KEY` + `GOOGLE_CSE_ID` |
  | `--urls` | Kullanıcının verdiği gönderi adresleri | — |
  | `--local` | Klasördeki videolar | — |
- **X araması:** Doğrudan yapılamaz (X API araması ücretli). X gönderileri yalnızca `google` ya da `--urls` ile gelir.
- **Kategori sorguları (7):** `yakin_plan`, `gol_asist`, `calim`, `kosu_mucadele`, `sevinc`, `antrenman`, `farkli_aci`. Her biri 2–4 kalıp; `{club}` kalıpları her kulüp için genişler. Örnekler: "{p} every touch", "{p} tunnel cam", "{club} training {p}".
- **Eleme:** Başlıkta soyadı yoksa; FIFA, EA FC, eFootball, PES, career mode, reaction, edit, press conference, interview, podcast vb. varsa.
- **Resmî kanal:** Ad, lig/yayıncı ipuçlarından ya da `--clubs` listesinden biriyle eşleşirse. YouTube'un doğrulanmış rozeti resmî sayılmaz.
- **Sıralama ve seçim:** Puan = resmî +1, HD +0,6, Creative Commons +0,4, süre 30–900 sn +0,5, başlıkta 4K/1080/HD +0,3, YouTube +0,3. Ardından kategoriler arasında sırayla seçilir (`diversify`).
- **İndirme:** yt-dlp, ≤1080p, yalnızca görüntü, av01 hariç. Bir platformda ENGELLİ ya da GİRİŞ GEREKLİ hatası alınınca o platform için deneme bırakılır.
- **İzin durumu:**
  - Creative Commons: atıf ile yeniden kullanım izinli.
  - Resmî kurum, standart YouTube lisansı, sosyal medya gönderisi: yeniden yayın izni yok.
- **Çıktılar:** `manifest.json` ve `06_PROJECT_FILES/kaynak_raporu.md` (platform durum tablosu, adaylar, indirilenler, indirilemeyenler). Hiç klip inmezse açık bir hata verilir ve nedenleri listelenir.
- **Durum etiketleri:** OK / ENGELLİ / ANAHTAR YOK / GİRİŞ GEREKLİ / ATLANDI / DESTEKLENMİYOR / HATA.

**3. shots**
- **Çekim çıkarma:** 10 fps tarama. 0,4 sn'den kısa ve karanlık çekimler atılır. Farklı derlemelerde aynı olan planlar (8×8 parmak izi, ≥%97 benzer) tekilleştirilir.
- **Oyuncu doğrulama:**
  - Yüz alanı ≥ %0,8 olan çekimlerden 640 px karede SFace yüz imzası çıkarılır.
  - İmzalar kümelenir (eşik 0,363). Hedef küme ya `05_IMAGES` fotoğraflarına en yakın küme, ya da en kalabalık küme (≥3 üye ve ≥ %30).
  - Hedefe ≥0,363 benzeyen kümeler hedefe katılır.
  - Her çekim için benzerlik ≥0,30 ise **target**, <0,18 ise **other**, arası **unknown**.
- **Sahne sahne kaynak değerlendirme:** Her kaynak için:
  - kullanılabilir çekim sayısı, yakın/orta/geniş dağılımı;
  - hedef ve başka yüz sayısı;
  - çözünürlük, dikey video;
  - sabit grafik/filigran (kare boyunca sapması düşük pikseller, köşe bölgeleri) ve siyah bant;
  - puan ve karar: iyi / sınırlı / kullanma.

  Rapor `kaynak_degerlendirme.md` dosyasına, kontakt sayfaları `kaynak_kontakt/*.jpg` klasörüne yazılır (yeşil = hedef, kırmızı = başka kişi, gri = belirsiz).

**4. plan**
- **Slotlar:** Referanstaki her çekim bir slot olur. Kare sayıları birikimli yuvarlamayla hesaplanır, toplam süre birebir korunur.
- **Uygun çekim seçimi:**
  - Önce aynı plan ölçeği; olmazsa yedek ölçek (yakın→orta; orta→geniş→yakın; geniş→orta).
  - "Kullanma" kararı alan kaynaklar ve "other" çekimler hiç kullanılmaz.
  - Yakın plan slotuna yalnızca doğrulanmış hedef konur (`allow_unverified_closeups` ile açılabilir).
- **Puan bileşenleri:** hareket, netlik, 1080p, doğrulanmış hedef, kategori uyumu (yakın plana yakin_plan/sevinc, donmuş kareye gol_asist/sevinc, aksiyona calim/kosu/gol/farkli_aci), resmî kaynak. Kullanım tekrarına ceza verilir.
- **Kaynak yetmezse:** Aynı çekim yeniden kullanılır ("reused" sayılır).
- **Pencere seçimi:** Aksiyonda en hareketli ana, yakın planda ortaya ortalanır.
- **Renk:** Seçilen kaynakların birleşik Lab istatistiği referansa eşlenir. Reinhard yöntemi; sapma oranı 0,5–2 aralığına sıkıştırılır; 33³ `.cube` dosyası yazılır. Vinyet açısı köşe/merkez oranından hesaplanır.
- **Müzik:** `config.music` verilirse kesimler yeni müziğin vuruşlarına ±0,12 sn içinde kaydırılır.
- **Çıktı:** `edl.json`.

**5. render**
- **Parça başına filtre zinciri:**
  - donmuş kare (`trim+loop`) ya da hız ayarı (`setpts`; ağır çekimde `framerate` harmanlaması);
  - kadraj kırpma: yüz ya da hareket merkezine göre, merkeze %80 çekilerek;
  - yakınlaşma (2 kat ölçek + `zoompan`), `tpad` ile uzatma;
  - hareket bulanıklığı (`tmix=3`);
  - `lut3d` + `vignette`;
  - açılma ve kararma (`fade`).
- **Kodlama ve birleştirme:** libx264 crf 16, preset medium; parçalar paralel işlenir; concat ile birleştirilir.
- **Ses:** İki geçişli loudnorm (hedef = referans LUFS, TP −1). İsteğe bağlı yazı (drawtext, Inter/DejaVu font, giriş/çıkışta saydamlık). İsteğe bağlı SFX: kararmalarda whoosh, bölüm başlarında impact, −8 dB, alimiter.

**6. qc** (sonuç OK / WARN / FAIL; FAIL'de çıkış kodu 2)
- Çözünürlük, fps, süre (±0,1 sn), ses akışı.
- Planlanmamış siyah kare (blackdetect), planlanmamış donma (freezedetect).
- LUFS ±1, true peak ≤ −0,5.
- Kesimlerin ±2 kare içinde bulunma oranı ≥ %85.
- 1,5 kattan fazla büyütülen planlar, oyuncu doğrulama oranı, tekrar kullanılan planlar (≤ %25), eksik slotlar.
- **Çıktılar:** kontakt sayfası PNG + `_qc.json` / `_qc.md`.

**config.json alanları:** `player`, `clubs`, `official_channels`, `providers`, `cc_only`, `texts`, `grade_strength`, `vignette`, `music`, `target_lufs`, `sfx`, `slowmo_speed` (0,5), `push_in_max` (1,25), `allow_unverified_closeups`, `preset`, `crf`.

**Yüz modelleri** (kurulum.sh indirir, sha256 doğrulanır; kaynak: `https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/<klasör>/<dosya>`):
- `face_detection_yunet_2023mar.onnx`, sha256 `8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4`
- `face_recognition_sface_2021dec.onnx`, sha256 `0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79`

---

## 8. Yapılan testler ve sonuçları

- **doctor:** Yerel bileşenlerin hepsi OK. Bulutta YouTube, googlevideo, TikTok, Instagram, X ve google.com ENGELLİ; googleapis OK. YouTube API ve Google Programmable Search için ANAHTAR YOK.
- **Trossard için gerçek fetch (bulutta):** `youtube_api` ANAHTAR YOK; `youtube` ENGELLİ; `channels` ATLANDI (o zamanki çıktıda "DESTEKLENMİYOR" yazıyordu, sonradan düzeltildi); `tiktok` ENGELLİ; `instagram` GİRİŞ GEREKLİ; `google` ANAHTAR YOK. **0 aday, 0 indirme.** Sistem bunu açıkça hata olarak bildirdi.
- **Uçtan uca duman testi:** Referans videonun kendisi kaynak klip olarak kullanıldı. **Bu bir Trossard videosu değildi, yalnızca hattın çalıştığını kanıtlamak içindi.** Çıktı silindi, kullanıcıya verilmedi.
  - **Sonuç:** 1080×1080, 60 fps, 57,75 sn, −14,4 LUFS, −1,0 dBTP. Planlanmamış siyah kare ya da donma yok. Kesimlerin %93'ü planlanan karede. 153/153 slot dolu.
  - **Beklenen uyarılar (test kaynağı yüzünden):** Düşük çözünürlük (576 px kaynak), tekrar kullanım (tek kaynak), oyuncu doğrulama oranı (geniş planlarda yüz yok).
  - **Süre:** Tam render yaklaşık 2–4 dakika, 4 çekirdekte.
- **Kalibrasyon sırasında bulunup düzeltilen hatalar:**
  - Kararma sırasında histogram kademe atladığı için sahte kesimler oluşuyordu (korelasyon ve tek yönlü parlaklık koruması eklendi).
  - Hızlı giriş donmuş karelerdi; ayrı efekt olarak tanınması sağlandı.
  - Kısa çekimlerde komşu çekimin yüzü kullanılıyordu.
  - Sondaki kararma ile siyah kuyruk tek çekim sanılıyordu.
  - 30→60 fps kare tekrarı ağır çekim sanılıyordu.
  - Aynı oyuncunun bazı yakın planları "başka kişi" sayılıyordu (üçlü kimlik + küme birleştirme ile düzeldi; 18 yüzlü plandan 15'i hedef, 0 yanlış "other").
  - Doctor'daki YouTube API testi tüm sorguları çalıştırıp günlük kotanın ~%20'sini harcayacaktı (tek sorguya indirildi).

---

## 9. Önemli kararlar ve gerekçeleri

1. **Editör `ritim` reposunda ayrı klasörde.** Kullanıcı "mevcut video editör sistemimi" dedi; ayrı repo açılamıyordu. İstenirse ayrı repoya taşınabilir.
2. **Müzik varsayılan olarak referanstan alınır.** Kesim zamanları müziğe zaten oturuyor. Kalite düşük (32 kbps); orijinal parça `config.music` ile verilebilir.
3. **Telif tutumu:**
   - Başta Claude klipleri kendisi bulmayı reddetmişti (hak sahipleri ve teknik engel gerekçesiyle).
   - Sonra kullanıcının açık talebiyle, kullanıcının kendi tarafında çalışan bir indirme aracı yazıldı.
   - Aracın şeffaflık kuralları: her klibin kaynağı ve izin durumu kaydediliyor; Creative Commons öne alınıyor (`--cc-only` seçeneği var); yayın sorumluluğu kullanıcıya ait. Bu sohbette tekrarlandı.
   - Uyarı: TikTok ve Instagram'da gömülü telifli müzik sessize alınabilir ya da video kaldırılabilir; platformun ses kütüphanesi daha güvenli. YouTube'da Content ID bildirimi gelebilir.
4. **Dürüstlük kuralları:**
   - Engelli olan hiçbir şey çalışıyor gibi gösterilmez.
   - Engel olduğunda başka görüntü hedef oyuncununmuş gibi kullanılmaz.
   - Test çıktısı Trossard videosu diye sunulmaz.
5. **Oyuncu doğrulaması yüzle yapılır.** Geniş planlarda doğrulama yok, eksik bileşen olarak listelendi.
6. **Format:** "Birebir" istendiği için 1:1 (1080×1080), 60 fps. 9:16 isteğe bağlı olarak önerildi ama yapılmadı.
7. **Kullanıcı istemedikçe PR açılmaz.** Commit ve push yalnızca belirlenen dala yapılır.

---

## 10. Bilinen sınırlar ve eksik bileşenler

| Eksik | Etkisi | Çözüm planı |
|---|---|---|
| Ağ erişimi (bulut) | İndirme yapılamıyor | Kendi bilgisayarında çalıştırmak ya da ortam ağ ayarlarından alan adlarına izin vermek |
| Geniş planlarda oyuncu doğrulama | Derlemelerde başka oyuncu planı girebilir | Forma numarası OCR'ı (PaddleOCR/EasyOCR) + oyuncu takibi |
| Olay türü sınıflama (gol/sevinç/çalım) | Kategori arama ifadesinden geliyor, çekim düzeyinde tanınmıyor | Video sınıflandırma modeli ya da skor grafiği değişimi |
| Referanstaki yazıların tespiti | Yazı stili kopyalanmıyor | Tesseract/PaddleOCR; şimdilik `config.texts` |
| Speed ramp ve interpolasyonlu ağır çekim tespiti | Yalnızca kare tekrarıyla yapılmış ağır çekim bulunuyor | Optik akış hız profili |
| SFX kütüphanesi | Ses efekti üretilmiyor | Kullanıcı lisanslı dosyaları `02_AUDIO/sfx/` klasörüne koyar |
| Müzik tanıma | Orijinal şarkı bulunamıyor | `config.music` |
| Google Programmable Search | Yeni hesaplar için kullanılabilirliği kesin değil | Google'ın güncel koşulları kontrol edilmeli |
| YouTube veri merkezi IP'leri | Bot doğrulaması istenebilir | `--cookies` |
| Uzaktan Kontrol Windows'ta | Windows klasörleri desteklenmiyor | Kullanıcı Windows'taysa ayrı yol gerekecek |

---

## 11. Şu anki durum ve yapılacak sonraki işler

**Son durum:** Kullanıcı "Bilgisayarım açık zaten" dedi. Bilgisayar klasörü bu oturuma bağlı değil (`list_computer_folders` boş). Kullanıcıya bağlantı adımları verildi; yanıt bekleniyor.

### Adım 1: Kullanıcının bilgisayarını bağla
1. Kullanıcı bilgisayarında şunu çalıştırır:
   ```bash
   git clone https://github.com/malatyabayhan5-jpg/ritim.git
   cd ritim && git checkout ccr-81737664-qzt34u
   ```
2. Klasörü paylaşır: Claude masaüstü uygulaması → Ayarlar → Claude Code → Remote Control → `ritim` klasörünü ekle. Ya da klasörün içinde `claude remote-control` çalıştırıp açık bırakır.
3. Claude `list_computer_folders` ile klasörü görür, `request_computer_folder` ile bağlanma ister, kullanıcı onaylar. (Alternatif: Kullanıcı Claude Code'u doğrudan kendi bilgisayarında bu klasörde açar.)
4. Kullanıcının işletim sistemini öğren. Windows ise PowerShell kurulumu README'de var, ama Uzaktan Kontrol çalışmaz.

### Adım 2: Kullanıcının bilgisayarında kurulum ve test
1. `cd futbol-editor && ./kurulum.sh` (ffmpeg yoksa: `brew install ffmpeg` ya da `sudo apt install ffmpeg`).
2. `.venv/bin/python -m fe doctor`. Her platformun durumunu kullanıcıya **aynen** raporla.
3. Gerekirse:
   - `cookies.txt` iste (Instagram, X, YouTube bot doğrulaması için; "Get cookies.txt LOCALLY" eklentisiyle, Netscape biçiminde).
   - İsteğe bağlı API anahtarlarını ortam değişkeni olarak al: `YT_API_KEY`, `GOOGLE_API_KEY` + `GOOGLE_CSE_ID`. **Koda ya da repoya yazma.**

### Adım 3: Trossard edit'ini üret
1. **Referans videoyu bilgisayardaki projeye koy.** Bulut kopyası bilgisayarda yok; kullanıcıdan dosya yolunu iste ya da dosyayı koymasını iste.
2. Hattı çalıştır:
   ```bash
   .venv/bin/python -m fe run --ref <referans.mp4> --player "Leandro Trossard" \
     --clubs "Arsenal,Brighton,Belgium" --max-videos 15 [--cookies cookies.txt]
   ```
3. `kaynak_raporu.md` dosyasını oku: platform durumları, adaylar, izin durumları.
4. `kaynak_degerlendirme.md` ve `kaynak_kontakt/*.jpg` dosyalarına bak; yanlış oyuncu ya da filigranlı kaynak var mı, gözle kontrol et.
5. `08_EXPORTS/leandro-trossard_qc.md` ve `_kontakt.png` dosyalarına bak; WARN ve FAIL maddelerini dürüstçe raporla.
6. Sorun varsa düzelt ve tekrarla: `config.json` ayarları, kaynak eleme (`--local` / `--urls`), `allow_unverified_closeups` vb.
7. Bitmiş MP4'ü kullanıcıya göster (SendUserFile ya da yol). Telif notunu hatırlat.

### Adım 4: Olası iyileştirmeler (kullanıcı isterse)
- 9:16 (1080×1920) çıktı seçeneği.
- Forma numarası OCR'ı ile geniş planlarda oyuncu doğrulama.
- Olay türü sınıflama.
- Referanstaki yazıların OCR ile tespiti.
- Skill'i `~/.claude/skills/` altına kopyalayıp her projede kullanılabilir yapmak.
- `futbol-editor`'ü ayrı bir repoya taşımak.
- PR açmak (yalnızca kullanıcı isterse).

---

## 12. Hızlı başvuru: komutlar

```bash
cd futbol-editor
./kurulum.sh                                   # kurulum + doctor
.venv/bin/python -m fe doctor [--offline] [--cookies c.txt]
.venv/bin/python -m fe run --ref ref.mp4 --player "Ad Soyad" --clubs "A,B,C"
.venv/bin/python -m fe analyze --ref ref.mp4 --player "Ad Soyad"
.venv/bin/python -m fe fetch --player "Ad Soyad" --clubs "A,B" [--providers youtube,tiktok|none] \
    [--channels @kanal] [--cc-only] [--urls liste.txt] [--local klasör] [--cookies c.txt] \
    [--max-videos 12] [--per-query 8]
.venv/bin/python -m fe shots  --player "Ad Soyad"
.venv/bin/python -m fe plan   --player "Ad Soyad"
.venv/bin/python -m fe render --player "Ad Soyad" [--jobs 4]
.venv/bin/python -m fe qc     --player "Ad Soyad" [--video yol.mp4]
.venv/bin/python -m unittest discover -s tests # 18 test
```
Genel seçenek: `--projects-root <klasör>` (varsayılan `projeler`). Proje yolu doğrudan `--project <yol>` ile de verilebilir.
