# Parity: Kurgu vs CapCut (Android core loop)

Date: 2026-10-25  Build: 4abe90c  Reference: the user's own CapCut screen recording (`replica/screens/`)

## Verdict: not shippable yet

- **Feature score 87.3 / 100**; must-haves **32 of 37** done (`parity.py replica/features.csv`).
- 4 of the 5 missing must-haves are performance on a real phone. The fixes are in, but the user
  reported the freezes on their Xiaomi, and only that phone can close them. The emulator cannot
  (software GPU, 43 % janky frames whatever the app does).
- The 5th is the editor layout: it now follows the recording, but nobody has seen it on the phone yet.
- Open bugs: S1 0, S2 1 (the freezes, BUG-001, waiting for the phone check).

## Layout score per screen

Measured in CI by `kurgu/e2e/run.sh` with `imgdiff.py`: edge maps, colour ignored. The reference
is the phone area of the recording frames. The clone is the e2e screenshot of the same screen on the
emulator (540x1170). Caveat: the preview shows different videos in the two apps (the user's footage
is blurred in the reference), so the preview area always counts as different.

| screen | reference | clone screenshot | score |
| --- | --- | --- | --- |
| S01 home | S01_home | 01_ana_ekran | not measured yet |
| S03 editor | S03_editor | 04_editor | not measured yet |
| S04 clip toolbar | S04_clip_b | 06_bolme | not measured yet |
| S15 filters / adjust | S15_adjust_custom | 08_filtre | not measured yet |

CI #118 (781c3a2): the e2e flow ran and took these screenshots, but run.sh found none of them in the
working or flow directory, so no score exists yet. run.sh now also looks under `~/.maestro` (where
newer Maestro versions write screenshots), copies them into the artifact, and lists the PNGs it did
find when one is missing.

The home screen is expected to score low: Kurgu's home is a drafts list plus New project, without
CapCut's promo banner, tool grid or template tabs. Those are out of scope.

## Missing features, in build order

1. [must] Performance on the phone: scrubbing, edits without freezes, playback with layers, timeline
   scroll / pinch. Needs the user's test of the latest APK.
2. [must] Editor layout: confirm on the phone (two-line labels at 64 dp, top bar width on 360 dp).
3. [should] Clip animations in / out / combo (only text has animations today).
4. [should] Video background removal (photo only, on-device TFLite).
5. [should] Caption styles beyond the default caption look.
6. [should] Chroma key and canvas background: lab-verified, not checked on a device.
7. [should] Share sheet right after export (partial).
8. [could] Stabilization, beat marks, blend modes for video layers.

## Behaviour differences

| flow | CapCut does | Kurgu does | fix or keep |
| --- | --- | --- | --- |
| F01 export | Export starts at once, using the resolution dropdown | Same since 2026-10-25: Export starts at once with the picker's resolution / fps; codec and quality are under "More settings" in the picker | fixed (pending CI) |
| F01 export | Upsell for higher resolution (Pro) | Every resolution the encoder supports is free; unsupported modes are locked with a reason | keep (better) |
| F04 captions | Auto captions sheet: source, language, templates (where it runs was not checked) | whisper.cpp on the phone, no upload; a model download is asked for first | keep; slower on old phones |
| F05 audio | Sounds and SFX libraries | No licensed library; your own files, extract from video, record | keep (licensing) |
| F08 keyframes | Diamond adds keys; curves per key | Same; Curve tool while on a key | parity |
| F10 background | Canvas colour / style / blur | Colour and blur; no image background | build image background later |
| editor | Search button, AI tools, templates | Not present; AI tools are on-device only | keep |

## Top five next

1. The user's phone test of the latest APK, freezes first (closes 4 must-haves or shows what is left).
2. ~~Direct export from the editor's Export button~~ (done, pending CI).
3. Clip in / out animations (reuse the text animation engine for main-track clips).
4. Caption style presets.
5. Video background removal (on-device segmentation per frame; heavy, so measure on the phone).

After these: `/replica-entrepreneur`, to find what CapCut's users complain about and do better
than a copy.
