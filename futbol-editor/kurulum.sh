#!/usr/bin/env bash
# Otomatik futbol editörü kurulumu (macOS / Linux). Windows için README → Kurulum.
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v ffmpeg >/dev/null || ! command -v ffprobe >/dev/null; then
  echo "ffmpeg bulunamadı."
  echo "  macOS : brew install ffmpeg"
  echo "  Ubuntu: sudo apt install ffmpeg"
  exit 1
fi
PY=${PYTHON:-python3}
"$PY" -c 'import sys; assert sys.version_info >= (3, 10), "Python 3.10+ gerekli"'

[ -d .venv ] || "$PY" -m venv .venv
.venv/bin/pip install -q -U pip
.venv/bin/pip install -q -r requirements.txt

sha() { if command -v sha256sum >/dev/null; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi; }
model() {  # ad, opencv_zoo yolu, sha256
  local out="models/$1"
  if [ ! -f "$out" ] || [ "$(sha "$out")" != "$3" ]; then
    echo "Model indiriliyor: $1"
    curl -fsSL -o "$out" "https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/$2/$1"
  fi
  [ "$(sha "$out")" = "$3" ] || { echo "HATA: $1 sağlama toplamı tutmuyor"; rm -f "$out"; exit 1; }
}
mkdir -p models
model face_detection_yunet_2023mar.onnx face_detection_yunet 8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4
model face_recognition_sface_2021dec.onnx face_recognition_sface 0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79

echo
echo "Ortam testi:"
.venv/bin/python -m fe doctor || true
