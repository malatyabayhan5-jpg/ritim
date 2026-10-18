#!/usr/bin/env bash
# Ritim - otomatik kurulum ve APK derleme
# Termux (Android), Linux veya macOS'ta çalışır.
set -e

SRC="$(cd "$(dirname "$0")" && pwd)"
APP="$HOME/ritim"
PKGS="expo-audio expo-file-system expo-status-bar @react-native-async-storage/async-storage @react-navigation/native @react-navigation/bottom-tabs @react-navigation/native-stack react-native-screens react-native-safe-area-context @expo/vector-icons"

say() { printf '\n\033[1;33m>> %s\033[0m\n' "$1"; }

# 1) Sistem paketleri
if command -v pkg >/dev/null 2>&1 && [ -n "$PREFIX" ]; then
  say "Termux paketleri güncelleniyor"
  yes | pkg update || true
  pkg install -y nodejs-lts git
elif command -v apt-get >/dev/null 2>&1 && ! command -v node >/dev/null 2>&1; then
  say "Node.js kuruluyor"
  sudo apt-get update && sudo apt-get install -y nodejs npm git
fi

command -v node >/dev/null 2>&1 || { echo "Node.js bulunamadı. https://nodejs.org adresinden 20 veya üstünü kur."; exit 1; }
NODE_MAJOR="$(node -v | sed 's/^v\([0-9]*\).*/\1/')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Node.js 20 veya üstü gerekli (şu an: $(node -v))."; exit 1
fi

# 2) Expo projesi
if [ ! -f "$APP/package.json" ]; then
  say "Expo projesi oluşturuluyor (birkaç dakika sürebilir)"
  npx --yes create-expo-app@latest "$APP" --template blank@sdk-54
fi
cd "$APP"

say "Bağımlılıklar kuruluyor"
npx --yes expo install $PKGS

# 3) Uygulama kodları
say "Uygulama dosyaları kopyalanıyor"
cp "$SRC/App.js" "$SRC/app.json" "$SRC/eas.json" "$APP/"
rm -rf "$APP/src"
cp -r "$SRC/src" "$APP/src"

say "Sürüm uyumluluğu kontrol ediliyor"
npx --yes expo install --fix || true

if [ -d .git ]; then
  git config user.email >/dev/null 2>&1 || git config user.email "ritim@local"
  git config user.name >/dev/null 2>&1 || git config user.name "Ritim"
  git add -A && git commit -qm "Ritim uygulama kodları" || true
fi

# 4) EAS ile APK derleme (Expo'nun bulut sunucularında)
say "EAS CLI kuruluyor"
npm install -g eas-cli

if ! eas whoami >/dev/null 2>&1; then
  say "Expo hesabınla giriş yap (hesabın yoksa: https://expo.dev/signup)"
  eas login
fi

say "APK derleniyor. Sorulan sorulara Enter / Y ile onay ver."
eas build --platform android --profile preview

say "Bitti. Yukarıdaki linkten APK'yı indirip telefonuna kurabilirsin."
