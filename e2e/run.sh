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

APP_UID=$(adb shell dumpsys package com.ritim.muzik | grep -m1 -oE 'userId=[0-9]+' | cut -d= -f2 | tr -d '\r')
# Bu uygulamanın (uid) şu anda çalan bir ses oynatıcısı var mı? (geçmiş kayıtları değil, anlık oynatıcı listesi)
app_playing() {
  adb shell dumpsys audio | grep 'AudioPlaybackConfiguration' | grep "u/pid:${APP_UID}/" | grep -q 'state:started'
}

foreground() {
  adb shell dumpsys activity activities | grep -m1 -E 'mResumedActivity|topResumedActivity' | sed -E 's/.* ([a-zA-Z0-9_.]+)\/.*/\1/' | tr -d '\r'
}

# Maestro'dan bağımsız ilk açılış kontrolü
adb logcat -c
adb shell monkey -p com.ritim.muzik -c android.intent.category.LAUNCHER 1 > /dev/null 2>&1
sleep 25
echo "Doğrudan açılıştan 25 sn sonra ön plandaki uygulama: $(adb shell dumpsys activity activities | grep -m1 -E 'mResumedActivity|topResumedActivity' | tr -d '\r')" > "$OUT/acilis.txt"
adb exec-out screencap -p > "$OUT/0_acilis.png" 2>/dev/null
adb logcat -d -b crash > "$OUT/acilis_cokme.txt" 2>&1 || true
adb shell am force-stop com.ritim.muzik

: > "$OUT/sonuclar.txt"
ALL_OK=1
for flow in 1_arama_alani 2_arama_sonuclari 3_video_secme 4_geri_tusu 5_video_indir 6_ses_indir 7_cevrimdisi 8_cevrimdisi_video_ve_silme 9_youtube_favori_liste 10_iptal 11_hata_yonetimi; do
  if [ "$flow" = "7_cevrimdisi" ]; then
    adb shell svc wifi disable; adb shell svc data disable; sleep 3
    echo "Ağ kapatıldı: $(adb shell dumpsys connectivity | grep -m1 -E 'Active default network' | tr -d '\r')" >> "$OUT/sonuclar.txt"
  fi
  # İptal testinde indirme hemen bitmesin diye emülatör ağı EDGE hızına düşürülür
  [ "$flow" = "10_iptal" ] && adb emu network speed edge > /dev/null 2>&1
  (cd "$OUT" && maestro test "../e2e/$flow.yaml" > "$OUT/$flow.log" 2>&1)
  code=$?
  [ "$flow" = "10_iptal" ] && adb emu network speed full > /dev/null 2>&1
  if [ "$flow" = "3_video_secme" ]; then
    sleep 12
    adb exec-out screencap -p > "$OUT/3b_oynatma_12sn.png" 2>/dev/null
    if app_playing; then echo "YouTube videosu uygulama içinde ses üretiyor: EVET" >> "$OUT/sonuclar.txt"; else echo "YouTube videosu uygulama içinde ses üretiyor: HAYIR (oynatma doğrulanamadı)" >> "$OUT/sonuclar.txt"; fi
    adb shell dumpsys audio | grep 'AudioPlaybackConfiguration' | grep "u/pid:${APP_UID}/" > "$OUT/3_audio.txt"
  fi
  if [ "$flow" = "7_cevrimdisi" ]; then
    sleep 2
    if app_playing; then
      echo "Çevrimdışı ses çalma (uygulama uid=$APP_UID): ÇALIYOR" >> "$OUT/sonuclar.txt"
    else
      echo "Çevrimdışı ses çalma (uygulama uid=$APP_UID): çalan oynatıcı bulunamadı" >> "$OUT/sonuclar.txt"
    fi
    adb shell dumpsys audio | sed -n '/playback activity/,/^$/p' | head -20 > "$OUT/audio_dumpsys.txt"
    adb shell dumpsys media_session | grep -E 'package=com.ritim|state=PlaybackState' | head -10 > "$OUT/media_session.txt"
  fi
  fg="$(foreground)"
  if [ $code -eq 0 ]; then res="GEÇTİ"; else res="KALDI"; ALL_OK=0; fi
  if [ "$fg" != "com.ritim.muzik" ]; then ext=" | DİKKAT: ön planda başka uygulama var"; ALL_OK=0; else ext=""; fi
  echo "$flow: $res | ön plandaki uygulama: ${fg:-bilinmiyor}$ext" | tee -a "$OUT/sonuclar.txt"
  adb exec-out screencap -p > "$OUT/${flow}_son_ekran.png" 2>/dev/null
done

adb shell svc wifi enable; adb shell svc data enable

# Çökme ve hata kayıtları
adb logcat -d -b crash > "$OUT/cokme.txt" 2>&1 || true
adb logcat -d -v time AndroidRuntime:E ReactNativeJS:V ReactNative:V ReactNativeJNI:V '*:F' '*:S' > "$OUT/rn_log.txt" 2>&1 || true
adb logcat -d -v time | grep -i -E 'com.ritim.muzik|FATAL|ReactNative|Hermes|SoLoader|expo' | tail -400 > "$OUT/uygulama_log.txt" || true
cp -r "$HOME/.maestro/tests" "$OUT/maestro-debug" 2>/dev/null || true

# Uygulama dışına açılmaya çalışılan intent kayıtları (YouTube uygulamasına gönderim olursa burada görünür)
adb logcat -d -s ActivityTaskManager:I ActivityManager:I | grep -E 'START u0' | grep -v 'com.ritim.muzik/.MainActivity' > "$OUT/dis_intentler.txt" || true
if grep -q 'com.google.android.youtube' "$OUT/dis_intentler.txt"; then
  echo "YouTube uygulamasına intent gönderildi: EVET (hata)" | tee -a "$OUT/sonuclar.txt"; ALL_OK=0
else
  echo "YouTube uygulamasına intent gönderildi: hayır" | tee -a "$OUT/sonuclar.txt"
fi
[ $ALL_OK -eq 1 ] && echo "TOPLAM: tüm senaryolar geçti" | tee -a "$OUT/sonuclar.txt" || echo "TOPLAM: en az bir senaryo kaldı" | tee -a "$OUT/sonuclar.txt"
exit 0
