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
echo "Android $(adb shell getprop ro.build.version.release | tr -d '\r') (API $(adb shell getprop ro.build.version.sdk | tr -d '\r'))" > "$OUT/cihaz.txt"

# Test medyası: iki video (farklı boyut ve ses), bir fotoğraf, bir müzik dosyası
M="$OUT/media"
ffmpeg -loglevel error -y -f lavfi -i testsrc2=size=1280x720:rate=30 -f lavfi -i sine=frequency=440:sample_rate=44100 -t 6 -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest "$M/kurgu_video1.mp4"
ffmpeg -loglevel error -y -f lavfi -i testsrc=size=720x1280:rate=30 -f lavfi -i sine=frequency=660:sample_rate=44100 -t 5 -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest "$M/kurgu_video2.mp4"
ffmpeg -loglevel error -y -f lavfi -i "color=c=0x8B6CFF:size=1080x1350,drawgrid=w=135:h=135:t=4:c=white" -frames:v 1 "$M/kurgu_foto.jpg"
ffmpeg -loglevel error -y -f lavfi -i "sine=frequency=330:sample_rate=44100" -t 12 -c:a libmp3lame -b:a 128k "$M/kurgu_muzik.mp3"
ls -l "$M" >> "$OUT/cihaz.txt"

adb shell mkdir -p /sdcard/DCIM/Camera /sdcard/Music
adb push "$M/kurgu_video1.mp4" /sdcard/DCIM/Camera/ > /dev/null
adb push "$M/kurgu_foto.jpg" /sdcard/DCIM/Camera/ > /dev/null
adb push "$M/kurgu_video2.mp4" /sdcard/DCIM/Camera/ > /dev/null
adb push "$M/kurgu_muzik.mp3" /sdcard/Music/ > /dev/null
adb shell content call --uri content://media --method scan_volume --arg external_primary > /dev/null 2>&1 || true
for f in DCIM/Camera/kurgu_video1.mp4 DCIM/Camera/kurgu_foto.jpg DCIM/Camera/kurgu_video2.mp4 Music/kurgu_muzik.mp3; do
  adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d "file:///sdcard/$f" > /dev/null 2>&1 || true
done
sleep 5

adb install -r "$APK" > "$OUT/install.txt" 2>&1 || { echo "APK kurulamadı"; cat "$OUT/install.txt"; }
adb shell pm grant $PKG android.permission.POST_NOTIFICATIONS > /dev/null 2>&1 || true

curl -fsSL "https://get.maestro.mobile.dev" | bash > "$OUT/maestro-install.txt" 2>&1
export PATH="$PATH:$HOME/.maestro/bin"
export MAESTRO_CLI_NO_ANALYTICS=1

adb logcat -c
: > "$OUT/sonuclar.txt"
for flow in 1_kabul_akisi 2_dil_rtl; do
  (cd "$OUT" && maestro test "../kurgu/e2e/$flow.yaml" > "$OUT/$flow.log" 2>&1)
  code=$?
  if [ $code -eq 0 ]; then echo "$flow: GEÇTİ" >> "$OUT/sonuclar.txt"; else echo "$flow: BAŞARISIZ (çıkış $code)" >> "$OUT/sonuclar.txt"; adb exec-out screencap -p > "$OUT/hata_$flow.png" 2>/dev/null; fi
done

# Dışa aktarılan videoyu cihazdan al ve bağımsız bir araçla (ffprobe) denetle
adb shell ls -l /sdcard/Movies/Kurgu/ > "$OUT/galeri.txt" 2>&1
OUTFILE=$(adb shell ls /sdcard/Movies/Kurgu/ 2>/dev/null | tr -d '\r' | grep -m1 '\.mp4$')
if [ -n "$OUTFILE" ]; then
  adb pull "/sdcard/Movies/Kurgu/$OUTFILE" "$OUT/cikti.mp4" > /dev/null
  ffprobe -v error -show_entries format=duration,size:stream=codec_type,codec_name,width,height,r_frame_rate -of default=nw=1 "$OUT/cikti.mp4" > "$OUT/ffprobe.txt" 2>&1
  # Çıktının tamamı hatasız çözülebiliyor mu?
  if ffmpeg -v error -i "$OUT/cikti.mp4" -f null - > "$OUT/cozme.txt" 2>&1 && [ ! -s "$OUT/cozme.txt" ]; then
    echo "Dışa aktarılan MP4 baştan sona hatasız çözüldü" >> "$OUT/sonuclar.txt"
  else
    echo "Dışa aktarılan MP4 çözülürken hata: $(head -3 "$OUT/cozme.txt")" >> "$OUT/sonuclar.txt"
  fi
  # Örnek kareler (efekt/metin görsel kontrolü)
  for s in 1 3 5 8; do ffmpeg -v error -y -ss $s -i "$OUT/cikti.mp4" -frames:v 1 "$OUT/kare_${s}sn.png" 2>/dev/null; done
  echo "Çıktı: $OUTFILE" >> "$OUT/sonuclar.txt"
  sed 's/^/  /' "$OUT/ffprobe.txt" >> "$OUT/sonuclar.txt"
else
  echo "Galeride (Movies/Kurgu) dışa aktarılmış video bulunamadı" >> "$OUT/sonuclar.txt"
fi

adb logcat -d -b crash > "$OUT/cokme.txt" 2>&1 || true
adb logcat -d -s "ReactNativeJS:*" "AndroidRuntime:*" "CompositionPlayer:*" "Transformer:*" "ExoPlayerImpl:*" > "$OUT/logcat.txt" 2>&1 || true
[ -s "$OUT/cokme.txt" ] && grep -q "$PKG" "$OUT/cokme.txt" && echo "UYARI: uygulama çökme kaydı var (cokme.txt)" >> "$OUT/sonuclar.txt"
cat "$OUT/sonuclar.txt"

# Ayrıntılar iş günlüğüne de yazılır (yapıt indirilemeyen ortamlar için)
for flow in 1_kabul_akisi 2_dil_rtl; do
  echo "===== $flow (son 40 satır) ====="
  tail -40 "$OUT/$flow.log" 2>/dev/null
done
echo "===== çökme kayıtları ====="
grep -A30 "$PKG" "$OUT/cokme.txt" 2>/dev/null | head -60
echo "===== JS / yerel hata satırları ====="
grep -E " E |Error|Exception|FATAL" "$OUT/logcat.txt" 2>/dev/null | grep -vE "Unable to resolve|chatty" | head -60

# Ekran görüntülerinin küçültülmüş kopyaları günlüğe base64 olarak yazılır
# (yapıt indirilemeyen ortamlarda görsel kontrol için).
for img in "$OUT"/*.png; do
  [ -f "$img" ] || continue
  name=$(basename "$img" .png)
  ffmpeg -v error -y -i "$img" -vf "scale=300:-2" -q:v 7 "/tmp/k_$name.jpg" 2>/dev/null || continue
  echo "KURGU_IMG_BEGIN $name"
  base64 -w 0 "/tmp/k_$name.jpg"; echo
  echo "KURGU_IMG_END $name"
done
