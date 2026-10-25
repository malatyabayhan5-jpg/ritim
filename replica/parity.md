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
| S01 home | S01_home | 01_ana_ekran | 3.8 / 100, different (CI #123) |
| S03 editor | S03_editor | 04_editor | 12.5 / 100, different (CI #123) |
| S04 clip toolbar | S04_clip_b | 06_bolme | not measured: flow 1 stopped before this screenshot (CI #123) |
| S15 filters / adjust | S15_adjust_custom | 08_filtre | not measured: same |

CI #123 (c30200d) produced the first scores (0 = nothing alike, 100 = same edges). Both are far below
the 75 "close" mark. What the report says: on the editor the most different regions are the middle
(the preview, which shows different videos by design), the top bar and the bottom right; on home it
is the whole middle (Kurgu's drafts list against the reference's banner and tool grid). The images
could not be inspected from this session (artifact downloads are blocked), so it is not yet known
how much of the editor's 12.5 is real layout difference and how much is the preview content and a
2.8 % height difference between the recording crop and the 540x1170 emulator. Next step: a score
with the preview area masked, and a look at the diff images by the user.

The home screen is expected to score low: Kurgu's home is a drafts list plus New project, without
CapCut's promo banner, tool grid or template tabs. Those are out of scope.

## Missing features, in build order

1. [must] Performance on the phone: scrubbing, edits without freezes, playback with layers, timeline
   scroll / pinch. Needs the user's test of the latest APK.
2. [must] Editor layout: confirm on the phone (two-line labels at 64 dp, top bar width on 360 dp).
3. [should] Chroma key, canvas background (colour / blur / image) and video background removal: CI
   and lab verified, not checked on a device. Removal only finds people.
4. [should] Share sheet right after export (partial).
5. [could] Stabilization: translation only (no rotation); CI #123 ran it on the test clip
   (33 samples, 14 keys) — 18 of 33 samples hit the zoom margin, so fast shakes are only partly
   removed at Medium.

Built since the last diff, CI-verified in #123: clip in / out / combo animations, caption style
presets, beat marks, blend modes for video layers, video background removal (pipeline; the test
clip has no person), stabilization.

## Behaviour differences

| flow | CapCut does | Kurgu does | fix or keep |
| --- | --- | --- | --- |
| F01 export | Export starts at once, using the resolution dropdown | Same since 2026-10-25: Export starts at once with the picker's resolution / fps; codec and quality are under "More settings" in the picker | fixed (CI #118) |
| F01 export | Upsell for higher resolution (Pro) | Every resolution the encoder supports is free; unsupported modes are locked with a reason | keep (better) |
| F04 captions | Auto captions sheet: source, language, templates (where it runs was not checked) | whisper.cpp on the phone, no upload; a model download is asked for first | keep; slower on old phones |
| F05 audio | Sounds and SFX libraries | No licensed library; your own files, extract from video, record | keep (licensing) |
| F08 keyframes | Diamond adds keys; curves per key | Same; Curve tool while on a key | parity |
| F10 background | Canvas colour / style / blur | Colour, blur and image (CI #123) | parity |
| editor | Search button, AI tools, templates | Not present; AI tools are on-device only | keep |

## Top five next

1. The user's phone test of the latest APK, freezes first (closes 4 must-haves or shows what is left).
2. ~~Direct export from the editor's Export button~~ (done, CI #118).
3. ~~Clip in / out animations~~, ~~caption style presets~~, ~~video background removal~~ (done).
4. Layout score with the preview masked; look at the diff images (editor scored 12.5 / 100).
5. Stabilization on real shaky phone footage (rotation is not corrected).

After these: `/replica-entrepreneur`, to find what CapCut's users complain about and do better
than a copy.
