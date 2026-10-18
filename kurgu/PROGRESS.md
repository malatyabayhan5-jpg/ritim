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

## Aşama 4b — Cihaz içi AI araçları 🟡

| Araç | Durum | Kanıt |
|---|---|---|
| Sessizlik kaldırma | ✅ kod + birim | Gerçek test videosundan ölçülmüş verilerle testler; e2e akışı 3 (sonuç aşağıda) |
| Sahne algılama | 🟡 | Birim testleri geçiyor; ilk emülatör çalıştırmasında klip bölünmedi — teşhis günlüğü eklendi, galeri sırası kesinleştirildi |
| Gürültü azaltma | ✅ | `tools/dsp-test` (CI'da): duraklamada 9–18 dB düşüş, konuşma kaybı < 0,1 dB, SNR +5–9 dB, gecikme 0 |
| Metinden konuşma | 🟡 | Kod hazır; emülatörde yüklü ses motoruna bağlı |
| Otomatik altyazı | 🟡 | JNI köprüsü masaüstünde whisper.cpp ile çalıştırıldı; Android için derlendi (CI #17); model özetleri sabitlendi; espeak-ng konuşmasıyla e2e akışı 4 (sonuç aşağıda) |
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
| 5 | Efekt katmanı ekle (çift ton) | ✅ e2e (oluşturma); çıktıda tespit ❌ inceleniyor |
| 6 | Klibe efekt (parıltı) | ✅ e2e |
| 7 | Çoklu efekt yığını | ✅ birim |
| 8 | Efekt parametresi değiştir + geri al/yinele | ✅ birim |
| 9 | Geçiş | ✅ e2e |
| 10 | Müzik/ses | 🟡 e2e (videodan ses ayırma); dosya seçiciden müzik emülatörde otomatikleşmedi |
| 11 | Kaydet → kapat → aç, efektler korunur | ✅ birim; e2e'de efekt şeridi kontrolü eklendi |
| 12 | MP4 dışa aktar, ffmpeg ile doğrula | ✅ e2e |
| 13 | Efektin dışa aktarılan videoda görünmesi | ❌ inceleniyor |
| 14 | Dil değiştir (TR/EN/AR), RTL | ✅ e2e |
| 15 | LUT içe aktar | 🟡 birim + laboratuvar; emülatörde dosya seçici otomasyonu yok |

### Son CI sonucu (CI #25, 2026-10-18, Android 14 emülatörü, API 34)

| Akış | Sonuç |
|---|---|
| 3 — AI araçları: sahne algılama (3 sahne), geri al, sessizlik kaldırma, metinden konuşma (ses klibi eklendi) | ✅ GEÇTİ |
| 4 — Otomatik altyazı: model indirme + SHA-256 doğrulama, cihaz içi tanıma, "hello" içeren altyazı katmanı | ✅ GEÇTİ |
| 1 — Kabul: proje, içe aktarma, bölme, metin, filtre, efekt katmanı + klip efekti, geçiş, ses, kapat/aç, 720p MP4 dışa aktarma, uygulamanın süre/çözünürlük/ses denetimi | ✅ GEÇTİ |
| 2 — Dil değişimi TR → AR (RTL) → EN → TR | ✅ GEÇTİ |
| Dışa aktarılan MP4'ün ffmpeg ile baştan sona çözülmesi | ✅ hatasız |
| Efekt katmanının (çift ton) dışa aktarılan videoda otomatik tespiti | ❌ iz bulunamadı — inceleniyor (gerçek hata mı, denetim mi) |

Emülatörün GPU'su yazılımsal olduğu için dışa aktarma testi 720p ile yapılır;
1080p'de efektli dışa aktarma emülatörü kilitledi (gerçek cihazda ölçülmedi).

## Aşama 7 — Belgeler ✅

`docs/MIMARI.md` (efekt motoru, LUT), `docs/OZELLIKLER.md` (envanter), bu dosya,
`BUG_FIXES.md`, `RESEARCH_AND_LICENSES.md`, `AUDIT_REPORT.md`.

## Aşama 8 — Teslim

APK, GitHub Actions çalıştırmasının "Artifacts" bölümünde (`Kurgu-apk`). Herkese açık
sürüm (release) yayımlanmadı.
