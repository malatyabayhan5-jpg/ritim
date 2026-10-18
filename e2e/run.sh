#!/usr/bin/env bash
# Android emülatöründe uçtan uca test. Her adımdan sonra ön plandaki uygulama kaydedilir:
# YouTube uygulamasına (ya da başka bir uygulamaya) yönlendirme olursa burada görünür.
set -u
OUT="$PWD/e2e-out"
mkdir -p "$OUT"
APK="$PWD/Ritim.apk"

adb wait-for-device
adb shell 'while [ "$(getprop sys.boot_completed)" != "1" ]; do sleep 2; done'
adb shell settings put global window_animation_scale 0
adb shell settings put global transition_animation_scale 0
adb shell settings put global animator_duration_scale 0

{
  echo "Android sürümü: $(adb shell getprop ro.build.version.release | tr -d '\r') (API $(adb shell getprop ro.build.version.sdk | tr -d '\r'))"
  if adb shell pm list packages | grep -q 'com.google.android.youtube$'; then
    echo "YouTube uygulaması: KURULU ($(adb shell dumpsys package com.google.android.youtube | grep -m1 versionName | tr -d ' \r'))"
  else
    echo "YouTube uygulaması: kurulu değil"
  fi
} > "$OUT/cihaz.txt"
cat "$OUT/cihaz.txt"

adb install -r "$APK" > "$OUT/install.txt" 2>&1 || { echo "APK kurulamadı"; cat "$OUT/install.txt"; }

curl -fsSL "https://get.maestro.mobile.dev" | bash > "$OUT/maestro-install.txt" 2>&1
export PATH="$PATH:$HOME/.maestro/bin"
export MAESTRO_CLI_NO_ANALYTICS=1
maestro --version >> "$OUT/maestro-install.txt" 2>&1

foreground() {
  adb shell dumpsys activity activities | grep -m1 -E 'mResumedActivity|topResumedActivity' | sed -E 's/.* ([a-zA-Z0-9_.]+)\/.*/\1/' | tr -d '\r'
}

: > "$OUT/sonuclar.txt"
ALL_OK=1
for flow in 1_arama_alani 2_arama_sonuclari 3_video_secme 4_geri_tusu; do
  (cd "$OUT" && maestro test "../e2e/$flow.yaml" > "$OUT/$flow.log" 2>&1)
  code=$?
  fg="$(foreground)"
  if [ $code -eq 0 ]; then res="GEÇTİ"; else res="KALDI"; ALL_OK=0; fi
  if [ "$fg" != "com.ritim.muzik" ]; then ext=" | DİKKAT: ön planda başka uygulama var"; ALL_OK=0; else ext=""; fi
  echo "$flow: $res | ön plandaki uygulama: ${fg:-bilinmiyor}$ext" | tee -a "$OUT/sonuclar.txt"
  adb exec-out screencap -p > "$OUT/${flow}_son_ekran.png" 2>/dev/null
done

# Uygulama dışına açılmaya çalışılan intent kayıtları (YouTube uygulamasına gönderim olursa burada görünür)
adb logcat -d -s ActivityTaskManager:I ActivityManager:I | grep -E 'START u0' | grep -v 'com.ritim.muzik/.MainActivity' > "$OUT/dis_intentler.txt" || true
if grep -q 'com.google.android.youtube' "$OUT/dis_intentler.txt"; then
  echo "YouTube uygulamasına intent gönderildi: EVET (hata)" | tee -a "$OUT/sonuclar.txt"; ALL_OK=0
else
  echo "YouTube uygulamasına intent gönderildi: hayır" | tee -a "$OUT/sonuclar.txt"
fi
[ $ALL_OK -eq 1 ] && echo "TOPLAM: tüm senaryolar geçti" | tee -a "$OUT/sonuclar.txt" || echo "TOPLAM: en az bir senaryo kaldı" | tee -a "$OUT/sonuclar.txt"
exit 0
