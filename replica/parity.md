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
| S03 editor | S03_editor | 04_editor | 25.2 / 100, preview left out 19.4 (CI #128) |
| S04 clip toolbar | S04_clip_b | 06_bolme | 30.8 / 100, preview left out 24.7 (CI #128) |
| S15 filters / adjust | S15_adjust_custom | 08a_ayarla | 7.5 / 100, preview left out 9.3 (CI #129, Adjust tab) |

CI #123 (c30200d) produced the first scores (0 = nothing alike, 100 = same edges). For scale: two
different screens of the reference app score 75 against each other. CI #126 printed both editor
screens as ASCII in the job log, which showed the main cause: on the emulator (about 540 × 1170 dp)
Kurgu's fixed 210 dp timeline took ~18 % of the height and the preview ~70 %, while in the recording
the timeline (ruler to toolbar, ~283 of ~876 dp) takes ~32 %. The timeline height is now 32 % of the
screen (210–320 dp). Leaving the preview out only lifts the editor from 13.1 to 18.2, so the rest of
the gap is the proportions, not the footage. With the 32 % timeline (CI #128) the editor scores 25.2
and the clip toolbar 30.8. Reading the ASCII screens: preview, clip strip at the playhead and the
audio / text rows now sit at the same heights as in the recording; what still differs is the top
(the recording crop includes the status bar, the emulator screenshot does not, about 2 % of the
height), the controls row (a little lower in Kurgu), Kurgu's brighter and larger toolbar icons, and
the clip audio / cover column on the left. The reference home screen is light-themed and a template
feed, so its 3.8 stays expected.

Adjust (S15, 7.5): in the recording a panel opens as a tall bottom sheet (~30 % of the height) and
the timeline shrinks to a thin clip strip; in Kurgu the panel is short (~19 %) and the full timeline
stays above it. Planned: shrink the timeline while a panel is open so the preview and the panel get
the room. Not done yet because several e2e flows tap timeline items with a panel open; it needs a
pass over the flows first.

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
