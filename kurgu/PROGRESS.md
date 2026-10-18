# Kurgu — İlerleme

Son güncelleme: 2026-10-18. Durum değerleri: ✅ bitti ve test edildi · 🟡 kısmen ·
⏳ yapılmadı. "Test edildi" ifadesinin hangi testi kastettiği her satırda yazılıdır.

## Aşama 1 — Denetim ✅

`AUDIT_REPORT.md`: kaynak kodun tamamı okundu, Media3 davranışları kaynak koddan
doğrulandı, emülatörde uçtan uca akış çalıştırıldı. 3 kritik, 5 yüksek, 5 orta,
3 düşük bulgu.

## Aşama 2 — Hata düzeltme ✅ (bu turun kapsamı)

`BUG_FIXES.md`: K1, K2, K3, Y1, Y2, Y3, Y4, Y5, O1 düzeltildi.
Açık kalanlar: O2 (gerçek çapraz geçiş), O3 (%100 üzeri ses, ses efektleri),
O4 (kare adımı), O5 (önizlemede ısınma uyarısı), D1–D3.

## Aşama 3 — Araştırma ✅

`RESEARCH_AND_LICENSES.md`: kaynaklar, tarih, lisanslar ve kararlar. Kullanılan tek
üçüncü taraf shader kodu MIT lisanslı hash fonksiyonlarıdır (atıflı).

## Aşama 4 — Efekt motoru ve kütüphanesi 🟡

| İş | Durum | Kanıt |
|---|---|---|
| Veri güdümlü GPU efekt motoru (GLSL dosyası + katalog) | ✅ | Birim testleri; CI'da APK derlemesi |
| 21 özgün efekt, 10 kategori, gerçek küçük resimler | ✅ | Efekt laboratuvarında 4 sahnede görsel QA, 30 karelik akıcılık ölçümü |
| Klip efekt yığını (≤4) + efekt katmanı şeridi | ✅ | 12 birim testi; e2e adımları |
| Kaydet/aç, geri al/yinele, eski projelerin taşınması | ✅ | Birim testleri |
| Önizleme = dışa aktarma (aynı shader, aynı tohum) | ✅ (mimari) / e2e | `e2e/fx_check.py` dışa aktarılan MP4'te efektin yalnızca katman aralığında görünmesini denetler |
| 3B LUT (.cube) içe aktarma + yoğunluk | ✅ | 6 birim testi; laboratuvarda GPU ↔ CPU referansı ≤ 1/255 (boyut 2, 17, 33, 65) |
| Hedef sayılar (≥100 efekt, ≥100 filtre, ≥80 geçiş, ≥60 metin, ≥40 ses) | ⏳ | "Önce kalite" ilkesiyle ilk 21 amiral efekt tamamlandı; sayı hedefleri sonraki turlarda |
| Maske, chroma key, PiP | ⏳ | Çok girdili birleştirici gerekir |
| Gerçek çapraz geçişler (A/B klip karışımı) | ⏳ | Aynı |
| Metin animasyon ön ayarları genişletme, ses efektleri | ⏳ | — |

## Aşama 4b — Cihaz içi AI araçları ✅ (5 araç; arka plan kaldırma ve çeviri ⏳)

| Araç | Durum | Kanıt |
|---|---|---|
| Sessizlik kaldırma | ✅ | Birim testleri + emülatör (CI #29: 2190–3850 ms kaldırıldı) |
| Sahne algılama | ✅ | Birim testleri + emülatör (CI #29: kesmeler 2500/5000 ms) |
| Gürültü azaltma | ✅ | `tools/dsp-test` (CI'da): duraklamada 9–18 dB düşüş, konuşma kaybı < 0,1 dB, SNR +5–9 dB, gecikme 0 |
| Metinden konuşma | ✅ | Emülatörde ses klibi eklendi (CI #29); ses kalitesi cihazın TTS motoruna bağlı |
| Otomatik altyazı | ✅ | Emülatörde konuşma kelimesi kelimesine doğru tanındı (CI #29); 64 bit cihaz gerekir |
| Arka plan kaldırma, altyazı çevirisi | ⏳ | Sonraki tur |

## Aşama 5 — Performans 🟡

- Efekt başına performans sınıfı katalogda (`light/medium/heavy`), yoğun efektler
  arayüzde işaretli. Shader kaynakları bir kez okunur ve önbelleğe alınır; LUT
  dokuları dosya değişmedikçe yeniden ayrıştırılmaz.
- **Gerçek cihazda ölçüm yapılmadı** (cihaz yok): kare süresi, ısınma, pil.

## Aşama 6 — Testler

| # | Senaryo | Durum |
|---|---|---|
| 1 | Proje oluştur → çoklu medya içe aktar | ✅ e2e |
| 2 | Böl / kırp | ✅ e2e (böl), birim (kırp) |
| 3 | Metin ekle | ✅ e2e |
| 4 | Filtre | ✅ e2e |
| 5 | Efekt katmanı ekle (çift ton) | ✅ e2e |
| 6 | Klibe efekt (parıltı) | ✅ e2e |
| 7 | Çoklu efekt yığını | ✅ birim |
| 8 | Efekt parametresi değiştir + geri al/yinele | ✅ birim |
| 9 | Geçiş | ✅ e2e |
| 10 | Müzik/ses | 🟡 e2e (videodan ses ayırma, metinden konuşma); dosya seçiciden müzik emülatörde otomatikleşmedi |
| 11 | Kaydet → kapat → aç, efektler korunur | ✅ birim; e2e'de efekt şeridi kontrolü eklendi |
| 12 | MP4 dışa aktar, ffmpeg ile doğrula | ✅ e2e |
| 13 | Efektin dışa aktarılan videoda görünmesi | ✅ e2e (`fx_check.py`) |
| 14 | Dil değiştir (TR/EN/AR), RTL | ✅ e2e |
| 15 | LUT içe aktar | 🟡 birim + laboratuvar; emülatörde dosya seçici otomasyonu yok |

### Son CI sonucu (CI #29, 2026-10-18, Android 14 emülatörü, API 34) — 4/4 GEÇTİ

| Akış | Sonuç |
|---|---|
| 3 — AI araçları: sahne algılama (kesmeler 2500/5000 ms), geri al, sessizlik kaldırma (2190–3850 ms), metinden konuşma (ses klibi eklendi) | ✅ GEÇTİ |
| 4 — Otomatik altyazı: model indirme + SHA-256 doğrulama, cihaz içi tanıma: "Hello world! This is an automatic caption test for the video editor." | ✅ GEÇTİ |
| 1 — Kabul: proje, içe aktarma, bölme, metin, filtre, efekt katmanı + klip efekti, geçiş, ses, kapat/aç, 720p MP4 dışa aktarma, uygulamanın süre/çözünürlük/ses denetimi | ✅ GEÇTİ |
| 2 — Dil değişimi TR → AR (RTL) → EN → TR | ✅ GEÇTİ |
| Dışa aktarılan MP4'ün ffmpeg ile baştan sona çözülmesi | ✅ hatasız (1280×720, 30 fps, 17,47 sn, H.264 + AAC) |
| Efekt katmanının (çift ton) çıktıda yalnızca kendi aralığında görünmesi | ✅ 14,50–17,25 sn karelerinde palet oranı 0,97–0,99; diğer tüm karelerde 0,00 |

Notlar:
- Emülatörün GPU'su yazılımsal (SwiftShader) olduğu için dışa aktarma testi 720p ile
  yapılır; parıltı efektli bölüm kare başına ~4 sn sürdü. Gerçek cihazda performans
  ölçülmedi.
- Bu turda bulunan iki gerçek hata (Y6 yerleşim, Y7 muxer zaman aşımı) düzeltildi ve
  bu çalıştırmayla doğrulandı.

## Aşama 7 — Belgeler ✅

`docs/MIMARI.md` (efekt motoru, LUT), `docs/OZELLIKLER.md` (envanter), bu dosya,
`BUG_FIXES.md`, `RESEARCH_AND_LICENSES.md`, `AUDIT_REPORT.md`.

## Aşama 8 — Teslim

APK, GitHub Actions çalıştırmasının "Artifacts" bölümünde (`Kurgu-apk`). Herkese açık
sürüm (release) yayımlanmadı.
