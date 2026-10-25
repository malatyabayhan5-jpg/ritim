#!/usr/bin/env bash
# Yerel motorun saf Java parçalarını (DSP, animasyon, görüntü işleme) masaüstü JVM'de test eder.
set -euo pipefail
cd "$(dirname "$0")/.."
SRC=modules/kurgu-engine/android/src/main/java/expo/modules/kurguengine
OUT=$(mktemp -d)
trap 'rm -rf "$OUT"' EXIT
J="java -Dstdout.encoding=UTF-8"
run() { local dir="$OUT/$1"; shift; mkdir -p "$dir"; javac -encoding UTF-8 -d "$dir" "$@"; }

run dsp $SRC/dsp/SpectralDenoiser.java tools/dsp-test/DenoiseTest.java
$J -cp "$OUT/dsp" DenoiseTest

run anim $SRC/anim/Keyframes.java $SRC/vision/KeyColor.java $SRC/anim/TextAnim.java tools/anim-test/KeyframesTest.java tools/anim-test/KeyColorTest.java tools/anim-test/TextAnimTest.java
$J -cp "$OUT/anim" KeyframesTest tests/fixtures/keyframes.txt
$J -cp "$OUT/anim" KeyColorTest
$J -cp "$OUT/anim" TextAnimTest

run fx $SRC/dsp/*.java tools/dsp-test/AudioFxTest.java
$J -cp "$OUT/fx" AudioFxTest tests/fixtures/audio-presets.txt

run img $SRC/vision/ImageOps.java tools/anim-test/ImageOpsTest.java
$J -cp "$OUT/img" ImageOpsTest

run trk $SRC/vision/Tracker.java tools/anim-test/TrackerTest.java
$J -cp "$OUT/trk" TrackerTest

run gm $SRC/vision/GlobalMotion.java tools/anim-test/GlobalMotionTest.java
$J -cp "$OUT/gm" GlobalMotionTest
