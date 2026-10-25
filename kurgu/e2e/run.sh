#!/usr/bin/env bash
# Kurgu emülatör testi: test medyası üretir, emülatöre yükler, Maestro akışlarını
# çalıştırır ve dışa aktarılan MP4'ü ffprobe ile doğrular. Sonuçlar e2e-out/ altında.
set -u
OUT="$PWD/e2e-out"
mkdir -p "$OUT/media"
APK="$PWD/Kurgu.apk"
PKG=app.kurgu.editor

adb wait-for-device
adb shell 'while [ "$(getprop sys.boot_completed)" != "1" ]; do sleep 2; done'
for k in window_animation_scale transition_animation_scale animator_duration_scale; do adb shell settings put global $k 0; done
# Emülatör donarsa (CI #62: QEMU "hanging thread") adb çağrıları sonsuza dek beklemesin
ADB=$(command -v adb)
adb() { timeout 180 "$ADB" "$@"; }
echo "Android $(adb shell getprop ro.build.version.release | tr -d '\r') (API $(adb shell getprop ro.build.version.sdk | tr -d '\r'))" > "$OUT/cihaz.txt"

# Test medyası: iki video (farklı boyut ve ses), bir fotoğraf, bir müzik dosyası
M="$OUT/media"
ffmpeg -loglevel error -y -f lavfi -i testsrc2=size=1280x720:rate=30 -f lavfi -i sine=frequency=440:sample_rate=44100 -t 6 -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest "$M/kurgu_video1.mp4"
ffmpeg -loglevel error -y -f lavfi -i testsrc=size=720x1280:rate=30 -f lavfi -i sine=frequency=660:sample_rate=44100 -t 5 -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest "$M/kurgu_video2.mp4"
ffmpeg -loglevel error -y -f lavfi -i "color=c=0x8B6CFF:size=1080x1350,drawgrid=w=135:h=135:t=4:c=white" -frames:v 1 "$M/kurgu_foto.jpg"
ffmpeg -loglevel error -y -f lavfi -i "sine=frequency=330:sample_rate=44100" -t 12 -c:a libmp3lame -b:a 128k "$M/kurgu_muzik.mp3"
# Otomatik altyazı testi: sentezlenmiş İngilizce konuşma (espeak-ng) + düz arka plan
if command -v espeak-ng > /dev/null; then
  espeak-ng -v en-us -s 135 -w "$M/konusma.wav" "Hello world. This is an automatic caption test for the video editor." 2> /dev/null
  ffmpeg -loglevel error -y -f lavfi -i "color=c=0x203040:size=640x360:rate=30" -i "$M/konusma.wav" -af "adelay=600|600,apad" \
    -t 10 -c:v libx264 -pix_fmt yuv420p -c:a aac -ar 44100 "$M/kurgu_konusma.mp4"
fi
# AI testi: 3 belirgin sahne (2,5 sn) ve 2.–4. saniyeler arası sessiz ses
ffmpeg -loglevel error -y -f lavfi -i testsrc2=size=640x360:rate=30:d=2.5 -f lavfi -i smptebars=size=640x360:rate=30:d=2.5 -f lavfi -i "mandelbrot=size=640x360:rate=30" \
  -f lavfi -i "sine=frequency=500:sample_rate=44100:duration=7.5" \
  -filter_complex "[2]trim=duration=2.5,setpts=PTS-STARTPTS[m];[0][1][m]concat=n=3:v=1:a=0,format=yuv420p[v];[3]volume='if(between(t,2,4),0,1)':eval=frame[a]" \
  -map "[v]" -map "[a]" -c:v libx264 -c:a aac -t 7.5 "$M/kurgu_sahne.mp4"
ls -l "$M" >> "$OUT/cihaz.txt"
adb shell mkdir -p /sdcard/DCIM/Camera /sdcard/Music

# Tüm test medyası bir kez yüklenir. Kabul akışı seçicideki ilk üç öğeyi seçer;
# AI akışları videolarını benzersiz sürelerinden bulur (sahne 00:07, konuşma 00:10).
for f in kurgu_konusma.mp4 kurgu_sahne.mp4 kurgu_video1.mp4 kurgu_foto.jpg kurgu_video2.mp4 kurgu_muzik.mp3; do
  [ -f "$M/$f" ] || continue
  case "$f" in *.mp3) dir=Music ;; *) dir=DCIM/Camera ;; esac
  adb push "$M/$f" "/sdcard/$dir/" > /dev/null
  adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d "file:///sdcard/$dir/$f" > /dev/null 2>&1 || true
  sleep 1.2
done
adb shell content call --uri content://media --method scan_volume --arg external_primary > /dev/null 2>&1 || true
sleep 5

# Akış başarısız olursa ekrandaki metinleri günlüğe yaz (hata iletisini görmek için)
screen_texts() {
  adb shell uiautomator dump /sdcard/ui.xml > /dev/null 2>&1
  adb shell cat /sdcard/ui.xml 2>/dev/null | grep -o 'text="[^"]\+"' | sed 's/text=//' | head -40 | tr '\n' ' '
}

"$ADB" install -r "$APK" > "$OUT/install.txt" 2>&1 || { echo "APK kurulamadı"; cat "$OUT/install.txt"; }
adb shell pm grant $PKG android.permission.POST_NOTIFICATIONS > /dev/null 2>&1 || true
adb shell pm grant $PKG android.permission.RECORD_AUDIO > /dev/null 2>&1 || true

curl -fsSL "https://get.maestro.mobile.dev" | bash > "$OUT/maestro-install.txt" 2>&1
export PATH="$PATH:$HOME/.maestro/bin"
export MAESTRO_CLI_NO_ANALYTICS=1

adb logcat -c
: > "$OUT/sonuclar.txt"
# Akışlar CI'da üç gruba bölünür, her grup taze bir emülatörde çalışır (E2E_FLOWS):
# uzun oturumda emülatörün sanal GPU'su tükenip donabiliyor (CI #62, #65). Grup
# içinde 2/5 numaralı akışlar 3/4'ün, 7 numaralı akış 6'nın projesini açar.
FLOWS=${E2E_FLOWS:-"3_ai_araclari 4_otomatik_altyazi 2_dil_rtl 5_performans 6_katmanlar 7_seslendirme 8_fotograf 1_kabul_akisi"}
ran() { [[ " $FLOWS " == *" $1 "* ]]; }
mp4s() { adb shell ls /sdcard/Movies/Kurgu/ 2>/dev/null | tr -d '\r' | grep '\.mp4$' | sort; }
for flow in $FLOWS; do
  [ "$flow" = 5_performans ] && adb shell dumpsys gfxinfo $PKG reset > /dev/null 2>&1
  mp4s > "$OUT/once_$flow.txt"
  # Akış başına üst sınır: tek bir takılan akış tüm işi zaman aşımına uğratmasın
  (cd "$OUT" && timeout 1500 maestro test "../kurgu/e2e/$flow.yaml" > "$OUT/$flow.log" 2>&1)
  code=$?
  # Maestro altyapı hatası (ekran görüntüsü alınamadı) uygulama hatası değildir: akış bir kez yinelenir
  if [ $code -ne 0 ] && grep -q "Screenshot returned null" "$OUT/$flow.log"; then
    echo "$flow: ekran görüntüsü altyapı hatası, akış yineleniyor" >> "$OUT/sonuclar.txt"
    mv "$OUT/$flow.log" "$OUT/$flow.ilk.log"
    (cd "$OUT" && timeout 1500 maestro test "../kurgu/e2e/$flow.yaml" > "$OUT/$flow.log" 2>&1)
    code=$?
  fi
  adb logcat -d -s "ReactNativeJS:*" "KurguExport:*" "KurguAI:*" 2>/dev/null | grep -E "Kurgu(AI|Export|UI|Photo)" | sed "s/^/[$flow] /" | cut -c1-3500 >> "$OUT/kurgu_gunluk.txt"
  # Media3 uyarıları (zorla akış sonu, zaman aşımı, kodlayıcı): takılma teşhisi için
  adb logcat -d "*:S" ExternalTextureManager:W DefaultVideoFrameProcessor:W VideoFrameProcessingTaskExecutor:W MultipleInputVideoGraph:W DefaultVideoCompositor:W TransformerInternal:W MuxerWrapper:W ExoAssetLoaderVideoRenderer:W CCodec:W 2>/dev/null | grep -v "^-----" | head -40 | sed "s/^/[$flow] /" | cut -c1-400 >> "$OUT/medya3.txt"
  # Yerel hata ayrıntıları (önizleme/dışa aktarma istisnaları) akış başına
  adb logcat -d 2>/dev/null | grep -E "KurguPreview|KurguExport|AndroidRuntime|IllegalStateException|IllegalArgumentException|ExoPlaybackException|PlaybackException|Caused by|\tat androidx.media3" | head -60 | sed "s/^/[$flow] /" >> "$OUT/yerel_hatalar.txt"
  adb logcat -c
  mp4s | comm -13 "$OUT/once_$flow.txt" - > "$OUT/yeni_$flow.txt"
  if [ $code -eq 0 ]; then
    echo "$flow: GEÇTİ" >> "$OUT/sonuclar.txt"
  else
    echo "$flow: BAŞARISIZ (çıkış $code) — ekranda: $(screen_texts | cut -c1-1500)" >> "$OUT/sonuclar.txt"
    adb exec-out screencap -p > "$OUT/hata_$flow.png" 2>/dev/null
  fi
  [ $code -eq 124 ] && echo "$flow: 25 dk akış sınırı aşıldı" >> "$OUT/sonuclar.txt"
  # Performans ölçümü 5. akıştan hemen sonra (sonraki akışlar ölçümü bozmasın)
  if [ "$flow" = 5_performans ]; then
    {
      echo "Performans (emülatör, yazılımsal GPU — gerçek cihaz değildir):"
      adb shell dumpsys gfxinfo $PKG 2>/dev/null | grep -E "Total frames rendered|Janky frames|50th percentile|90th percentile|95th percentile|99th percentile|Number Slow UI thread|Number Frame deadline missed" | sed 's/^/  /'
      adb shell dumpsys meminfo $PKG 2>/dev/null | grep -E "TOTAL PSS|TOTAL RSS|Native Heap|Graphics" | head -4 | sed 's/^ */  /'
      # Editör ekranı çizim sayısı: oynat/duraklat anlarındaki toplam (aradaki fark oynatma sırasındaki çizimler)
      grep "\[5_performans\].*\[KurguUI\] \(play\|pause\) " "$OUT/kurgu_gunluk.txt" | sed 's/.*\[KurguUI\] /  editör çizimi: /' | head -6
    } > "$OUT/performans.txt"
  fi
  if ! timeout 30 "$ADB" shell echo ok > /dev/null 2>&1; then
    echo "$flow sonrası emülatör yanıt vermiyor; kalan akışlar atlandı" >> "$OUT/sonuclar.txt"
    adb() { return 1; }  # aşağıdaki çıktı denetimleri ölü cihazı beklemesin
    break
  fi
done

cat "$OUT/performans.txt" >> "$OUT/sonuclar.txt" 2>/dev/null

# Katman akışının çıktısı: akış sırasında oluşan yeni dosya
LAYERFILE=$(head -1 "$OUT/yeni_6_katmanlar.txt" 2>/dev/null)
if ! ran 6_katmanlar; then
  :
elif [ -n "$LAYERFILE" ]; then
  adb pull "/sdcard/Movies/Kurgu/$LAYERFILE" "$OUT/katman.mp4" > /dev/null
  python3 "$(dirname "$0")/layer_check.py" "$OUT/katman.mp4" > "$OUT/katman.txt" 2>&1
  tail -1 "$OUT/katman.txt" >> "$OUT/sonuclar.txt"
  head -1 "$OUT/katman.txt" | cut -c1-600 >> "$OUT/sonuclar.txt"
  for s in 1 2 5; do ffmpeg -v error -y -ss $s -i "$OUT/katman.mp4" -frames:v 1 "$OUT/katman_${s}sn.png" 2>/dev/null; done
else
  echo "Katman testi: dışa aktarılmış video bulunamadı" >> "$OUT/sonuclar.txt"
fi
# Karışım modu: akış 3 "Ekran" modunu seçer; seçim ve önizlemede hata olmaması günlükten
if ran 3_ai_araclari; then
  if grep -q "\[3_ai_araclari\].*\[KurguUI\] blend screen" "$OUT/kurgu_gunluk.txt"; then
    if grep -q "\[3_ai_araclari\].*previewError" "$OUT/kurgu_gunluk.txt"; then
      echo "Karışım testi: BAŞARISIZ (Ekran modu seçildi ama önizleme hatası var)" >> "$OUT/sonuclar.txt"
    else
      echo "Karışım testi: GEÇTİ (Ekran modu seçildi, önizleme hatası yok)" >> "$OUT/sonuclar.txt"
    fi
  else
    echo "Karışım testi: BAŞARISIZ (günlükte karışım seçimi yok)" >> "$OUT/sonuclar.txt"
  fi
fi
# Anahtar kare düğmesi: akış 1 ana klipte ekler ve aynı anda kaldırır (günlükten)
if ran 1_kabul_akisi; then
  if grep -q "\[1_kabul_akisi\].*\[KurguUI\] keyframe main .* add" "$OUT/kurgu_gunluk.txt" && grep -q "\[1_kabul_akisi\].*\[KurguUI\] keyframe main .* remove" "$OUT/kurgu_gunluk.txt"; then
    echo "Anahtar kare testi: GEÇTİ (ekle ve kaldır günlükte)" >> "$OUT/sonuclar.txt"
  else
    echo "Anahtar kare testi: BAŞARISIZ (günlükte ekle/kaldır yok)" >> "$OUT/sonuclar.txt"
  fi
fi
# Altyazı stili: akış 4 altyazılara "Sarı" stilini uygular
if ran 4_otomatik_altyazi; then
  if grep -q "\[4_otomatik_altyazi\].*\[KurguUI\] captionStyle yellow" "$OUT/kurgu_gunluk.txt"; then
    echo "Altyazı stili testi: GEÇTİ (Sarı uygulandı)" >> "$OUT/sonuclar.txt"
  else
    echo "Altyazı stili testi: BAŞARISIZ (günlükte stil seçimi yok)" >> "$OUT/sonuclar.txt"
  fi
fi
# Ritim: akış 3 ses klibinde vuruş işaretlerini çalıştırır
if ran 3_ai_araclari; then
  bl=$(grep -E "\[3_ai_araclari\].*\[KurguUI\] beats " "$OUT/kurgu_gunluk.txt" | tail -1 | sed 's/.*\[KurguUI\] //')
  if [ -z "$bl" ]; then
    echo "Ritim testi: BAŞARISIZ (günlükte ritim satırı yok)" >> "$OUT/sonuclar.txt"
  elif echo "$bl" | grep -q "failed"; then
    echo "Ritim testi: BAŞARISIZ ($bl)" >> "$OUT/sonuclar.txt"
  else
    echo "Ritim testi: GEÇTİ ($bl)" >> "$OUT/sonuclar.txt"
  fi
fi
# Sabitleme: akış 3 ilk klipte sarsıntıyı ölçer ve konum anahtar kareleri yazar
if ran 3_ai_araclari; then
  sl=$(grep -E "\[3_ai_araclari\].*\[KurguAI\] stabilize " "$OUT/kurgu_gunluk.txt" | tail -1 | sed 's/.*\[KurguAI\] //')
  if [ -z "$sl" ]; then
    echo "Sabitleme testi: BAŞARISIZ (günlükte sabitleme satırı yok)" >> "$OUT/sonuclar.txt"
  elif echo "$sl" | grep -qE "failed|keys=0( |$)"; then
    echo "Sabitleme testi: BAŞARISIZ ($sl)" >> "$OUT/sonuclar.txt"
  else
    echo "Sabitleme testi: GEÇTİ ($sl)" >> "$OUT/sonuclar.txt"
  fi
fi
# Dışa aktarma ilk denemede düştüyse (akış "Tekrar dene" ile sürer) bu gizlenmez
for flow in 1_kabul_akisi 6_katmanlar; do
  ran "$flow" || continue
  ar=$(grep -E "\[$flow\].*\[KurguExport\] auto-retry" "$OUT/kurgu_gunluk.txt" | head -1 | sed 's/.*\[KurguExport\] //')
  [ -n "$ar" ] && echo "UYARI: $flow dışa aktarma takıldı, uygulama kendiliğinden yeniden başlattı ($ar)" >> "$OUT/sonuclar.txt"
  fl=$(grep -E "\[$flow\].*\[KurguExport\] failed" "$OUT/kurgu_gunluk.txt" | head -1 | sed 's/.*\[KurguExport\] //')
  [ -n "$fl" ] && echo "UYARI: $flow dışa aktarma başarısız oldu ($fl); akış Tekrar dene ile sürdü" >> "$OUT/sonuclar.txt"
done
# Videoda arka plan kaldırma: akış 7 kişisiz test videosunda yerel boru hattını çalıştırır
if ran 7_seslendirme; then
  cl=$(grep -E "\[7_seslendirme\].*\[KurguUI\] cutout " "$OUT/kurgu_gunluk.txt" | tail -1 | sed 's/.*\[KurguUI\] //')
  if [ -z "$cl" ]; then
    echo "Arka plan kaldırma testi: BAŞARISIZ (günlükte satır yok)" >> "$OUT/sonuclar.txt"
  elif echo "$cl" | grep -q "failed"; then
    echo "Arka plan kaldırma testi: BAŞARISIZ ($cl)" >> "$OUT/sonuclar.txt"
  elif echo "$cl" | grep -qE "frames=[1-9]"; then
    echo "Arka plan kaldırma testi: GEÇTİ (boru hattı çalıştı; test videosunda kişi yok: $cl)" >> "$OUT/sonuclar.txt"
  else
    echo "Arka plan kaldırma testi: BAŞARISIZ (kare işlenmedi: $cl)" >> "$OUT/sonuclar.txt"
  fi
fi
# Hareket takibi: akış 6 takip düğmesine basar; yerel izleyicinin sonucu günlükte
if ran 6_katmanlar; then
  tl=$(grep -E "\[6_katmanlar\].*\[KurguAI\] track .*points=[1-9]" "$OUT/kurgu_gunluk.txt" | tail -1 | sed 's/.*\[KurguAI\] //')
  [ -n "$tl" ] && echo "Takip testi: GEÇTİ ($tl)" >> "$OUT/sonuclar.txt" || echo "Takip testi: BAŞARISIZ (günlükte takip sonucu yok)" >> "$OUT/sonuclar.txt"
fi

# Dışa aktarılan videoyu cihazdan al ve bağımsız bir araçla (ffprobe) denetle
adb shell ls -l /sdcard/Movies/Kurgu/ > "$OUT/galeri.txt" 2>&1
OUTFILE=$(head -1 "$OUT/yeni_1_kabul_akisi.txt" 2>/dev/null)
if ! ran 1_kabul_akisi; then
  :
elif [ -n "$OUTFILE" ]; then
  adb pull "/sdcard/Movies/Kurgu/$OUTFILE" "$OUT/cikti.mp4" > /dev/null
  ffprobe -v error -show_entries format=duration,size:stream=codec_type,codec_name,width,height,r_frame_rate -of default=nw=1 "$OUT/cikti.mp4" > "$OUT/ffprobe.txt" 2>&1
  # Çıktının tamamı hatasız çözülebiliyor mu?
  if ffmpeg -v error -i "$OUT/cikti.mp4" -f null - > "$OUT/cozme.txt" 2>&1 && [ ! -s "$OUT/cozme.txt" ]; then
    echo "Dışa aktarılan MP4 baştan sona hatasız çözüldü" >> "$OUT/sonuclar.txt"
  else
    echo "Dışa aktarılan MP4 çözülürken hata: $(head -3 "$OUT/cozme.txt")" >> "$OUT/sonuclar.txt"
  fi
  # Efekt katmanı çıktıya gerçekten işlendi mi? (yalnızca katman aralığında)
  python3 "$(dirname "$0")/fx_check.py" "$OUT/cikti.mp4" > "$OUT/efekt.txt" 2>&1
  # Metin ve giriş animasyonu: dışa aktarma günlüğündeki ilk metnin zamanlarıyla
  tl=$(grep -E "\[1_kabul_akisi\].*KurguExport: text start=" "$OUT/kurgu_gunluk.txt" | tail -1)
  if [ -n "$tl" ]; then
    ts=$(echo "$tl" | sed -E 's/.*start=([0-9]+).*/\1/'); te=$(echo "$tl" | sed -E 's/.* end=([0-9]+).*/\1/'); tm=$(echo "$tl" | sed -E 's/.* ms=([0-9]+).*/\1/')
    python3 "$(dirname "$0")/text_check.py" "$OUT/cikti.mp4" "$ts" "$te" "$tm" >> "$OUT/sonuclar.txt" 2>&1 || true
    echo "  ($tl)" | sed 's/.*KurguExport: /  metin: /' >> "$OUT/sonuclar.txt"
  else
    echo "Metin testi: BAŞARISIZ (dışa aktarma günlüğünde metin yok)" >> "$OUT/sonuclar.txt"
  fi
  tail -1 "$OUT/efekt.txt" >> "$OUT/sonuclar.txt"
  head -1 "$OUT/efekt.txt" | cut -c1-900 >> "$OUT/sonuclar.txt"
  # Kare başına ortalama renk (efektlerin görsel izi)
  for t in 1 3 5 7 9 11 13 15 17; do
    rgb=$(ffmpeg -v error -ss $t -i "$OUT/cikti.mp4" -frames:v 1 -vf scale=1:1 -f rawvideo -pix_fmt rgb24 - 2>/dev/null | od -An -tu1 | tr -s ' ')
    echo "  ${t}sn ortalama RGB:$rgb" >> "$OUT/sonuclar.txt"
  done
  # Örnek kareler (efekt/metin görsel kontrolü)
  for s in 1 3 5 8; do ffmpeg -v error -y -ss $s -i "$OUT/cikti.mp4" -frames:v 1 "$OUT/kare_${s}sn.png" 2>/dev/null; done
  echo "Çıktı: $OUTFILE" >> "$OUT/sonuclar.txt"
  sed 's/^/  /' "$OUT/ffprobe.txt" >> "$OUT/sonuclar.txt"
else
  echo "Galeride (Movies/Kurgu) dışa aktarılmış video bulunamadı" >> "$OUT/sonuclar.txt"
fi

# Fotoğraf akışının çıktısı (Pictures/Kurgu): 1080×1350 kaynak 1:1 kırpıldı → 1080x1080 beklenir
PHOTOFILE=$(adb shell ls /sdcard/Pictures/Kurgu/ 2>/dev/null | tr -d '\r' | grep -E '\.(jpg|png)$' | tail -1)
if ! ran 8_fotograf; then
  :
elif [ -n "$PHOTOFILE" ]; then
  adb pull "/sdcard/Pictures/Kurgu/$PHOTOFILE" "$OUT/fotograf_cikti.jpg" > /dev/null
  dims=$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0:s=x "$OUT/fotograf_cikti.jpg" 2>/dev/null)
  [ "$dims" = "1080x1080" ] && verdict="GEÇTİ" || verdict="BEKLENMEYEN BOYUT"
  echo "Fotoğraf çıktısı: $PHOTOFILE ($dims, beklenen 1080x1080) — $verdict" >> "$OUT/sonuclar.txt"
else
  echo "Galeride (Pictures/Kurgu) dışa aktarılmış fotoğraf bulunamadı" >> "$OUT/sonuclar.txt"
fi

# Klip animasyonu: akış 1 ilk klibe "yakınlaş" girişi verir (500 ms, opaklık 0 → 1). Akışın efekt
# katmanı (duotone) siyahı da renklendirdiği için parlaklık değil karşıtlık ölçülür: başta görüntü
# neredeyse düzdür (YHIGH − YLOW küçük), 1. saniyede klip tam görünür.
if ran 1_kabul_akisi && [ -f "$OUT/cikti.mp4" ]; then
  if grep -q "\[1_kabul_akisi\].*\[KurguUI\] clipAnim .*zoomIn" "$OUT/kurgu_gunluk.txt"; then
    yrange() { ffmpeg -v error -ss "$1" -i "$OUT/cikti.mp4" -frames:v 1 -vf "signalstats,metadata=print:file=-" -f null - 2>/dev/null | python3 -c "
import re, sys
t = sys.stdin.read()
hi = re.search(r'YHIGH=([0-9.]+)', t); lo = re.search(r'YLOW=([0-9.]+)', t)
print(float(hi.group(1)) - float(lo.group(1)) if hi and lo else '')"; }
    r0=$(yrange 0.04); r1=$(yrange 1.0)
    if [ -n "$r0" ] && [ -n "$r1" ] && python3 -c "import sys; a,b=float(sys.argv[1]),float(sys.argv[2]); sys.exit(0 if a < 0.5*b and b > 15 else 1)" "$r0" "$r1"; then
      echo "Klip animasyonu testi: GEÇTİ (karşıtlık başta $r0, 1. sn $r1)" >> "$OUT/sonuclar.txt"
    else
      echo "Klip animasyonu testi: BAŞARISIZ (karşıtlık başta ${r0:-?}, 1. sn ${r1:-?}; giriş animasyonu izi yok)" >> "$OUT/sonuclar.txt"
      # Tanı: dışa aktarmada ilk karelere uygulanan opaklık (Fx.kt KeyedOpacity)
      grep -E "\[1_kabul_akisi\].*KurguExport *: opacity " "$OUT/kurgu_gunluk.txt" | sed 's/.*KurguExport *: /  /' | tail -6 >> "$OUT/sonuclar.txt"
    fi
  else
    echo "Klip animasyonu testi: BAŞARISIZ (günlükte animasyon seçimi yok)" >> "$OUT/sonuclar.txt"
  fi
fi
# Düzen karşılaştırması (replica-diff): referans kayıttan referans kareler ile klonun
# aynı ekranları. Kenar haritası ızgarası, renk yok sayılır; önizlemedeki videolar farklı olduğu için
# önizleme alanı da farka katkı verir. Puanlar sonuclar.txt'ye, fark görselleri yapıta.
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
IMGDIFF="$REPO_ROOT/.claude/skills/replica-diff/imgdiff.py"
REF="$REPO_ROOT/replica/screens/phone"
if ran 1_kabul_akisi && [ -f "$IMGDIFF" ] && [ -d "$REF" ]; then
  for pair in S01_home:01_ana_ekran S03_editor:04_editor S04_clip_b:06_bolme S15_adjust_custom:08_filtre; do
    ref=${pair%%:*}; shot=${pair##*:}
    # Maestro ekran görüntüsünü sürüme göre çalışma dizinine, akış dosyasının yanına ya da
    # ~/.maestro/tests/<zaman> altına yazar; bulunan kopya yapıta girsin diye $OUT'a alınır
    img=$(find "$OUT" "$(dirname "$0")" "$HOME/.maestro" /tmp -maxdepth 5 -name "$shot.png" 2>/dev/null | head -1)
    if [ -n "$img" ] && [ "$(dirname "$img")" != "$OUT" ]; then cp "$img" "$OUT/$shot.png" && img="$OUT/$shot.png"; fi
    if [ ! -f "$REF/$ref.png" ] || [ -z "$img" ]; then
      echo "Düzen farkı $ref: ekran görüntüsü yok ($shot.png; bulunan png: $(find "$OUT" "$(dirname "$0")" "$HOME/.maestro" -maxdepth 5 -name '0*.png' 2>/dev/null | head -3 | tr '\n' ' '))" >> "$OUT/sonuclar.txt"
      continue
    fi
    # Ana ekran dışında önizleme alanı (referansta yüksekliğin %10–53'ü) ayrıca hariç tutulup puanlanır:
    # iki uygulamada önizlemede farklı videolar var. Ölçek: referansın iki farklı ekranı birbirine 75.
    mask=""
    [ "$ref" != "S01_home" ] && mask="--ignore 0,0.10,1,0.53"
    python3 "$IMGDIFF" "$REF/$ref.png" "$img" $mask --json > "$OUT/fark_${ref}_maske.json" 2>/dev/null || true
    python3 "$(dirname "$0")/ascii_shot.py" "$REF/$ref.png" "$img" >> "$OUT/ekran_ascii.txt" 2>&1 || true
    if python3 "$IMGDIFF" "$REF/$ref.png" "$img" --out "$OUT/fark_$ref.png" --json > "$OUT/fark_$ref.json" 2> "$OUT/fark_$ref.err"; then
      python3 - "$OUT/fark_$ref.json" "$ref" "$shot" "$OUT/fark_${ref}_maske.json" >> "$OUT/sonuclar.txt" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
regs = ', '.join(f"{r['where']} {r['w']}x{r['h']}@{r['x']},{r['y']}" for r in d.get('regions', [])[:3])
try:
    m = json.load(open(sys.argv[4]))
    masked = f"; önizleme hariç {m['score']} ({m['verdict']})" if m.get('ignored') else ""
except Exception:
    masked = ""
print(f"Düzen farkı {sys.argv[2]} ↔ {sys.argv[3]}: {d['score']} ({d['verdict']}){masked}, yükseklik farkı %{d.get('height_delta_pct', 0)}; en farklı: {regs}")
PY
    else
      echo "Düzen farkı $ref: karşılaştırılamadı ($(head -c 200 "$OUT/fark_$ref.err"))" >> "$OUT/sonuclar.txt"
    fi
  done
fi

adb logcat -d -b crash > "$OUT/cokme.txt" 2>&1 || true
adb logcat -d -s "ReactNativeJS:*" "KurguAI:*" "AndroidRuntime:*" "CompositionPlayer:*" "Transformer:*" "ExoPlayerImpl:*" > "$OUT/logcat.txt" 2>&1 || true
[ -s "$OUT/cokme.txt" ] && grep -q "$PKG" "$OUT/cokme.txt" && echo "UYARI: uygulama çökme kaydı var (cokme.txt)" >> "$OUT/sonuclar.txt"
cat "$OUT/sonuclar.txt"
# Ekran görüntüleri (referans | klon) ASCII olarak: yapıt indirilemeyen ortamlarda düzen incelemesi için
if [ -s "$OUT/ekran_ascii.txt" ]; then echo "===== ekranlar (referans | klon) ====="; cat "$OUT/ekran_ascii.txt"; fi

# Ayrıntılar iş günlüğüne de yazılır (yapıt indirilemeyen ortamlar için)
for flow in $FLOWS; do
  echo "===== $flow (son 40 satır) ====="
  tail -40 "$OUT/$flow.log" 2>/dev/null
done
echo "===== çökme kayıtları ====="
grep -A30 "$PKG" "$OUT/cokme.txt" 2>/dev/null | head -60
echo "===== AI araçları günlüğü ====="
cat "$OUT/kurgu_gunluk.txt" 2>/dev/null | head -250
echo "===== Media3 uyarıları ====="
cat "$OUT/medya3.txt" 2>/dev/null | head -120
echo "===== yerel hata ayrıntıları (akış başına) ====="
cut -c1-400 "$OUT/yerel_hatalar.txt" 2>/dev/null | head -150
echo "===== JS / yerel hata satırları ====="
grep -E " E |Error|Exception|FATAL" "$OUT/logcat.txt" 2>/dev/null | grep -vE "Unable to resolve|chatty" | head -60
