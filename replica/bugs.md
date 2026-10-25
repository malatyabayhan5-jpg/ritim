# Bugs: Kurgu

Only reproduced bugs. Unconfirmed suspicions are in `test-plan.md` → "To check".

### BUG-001: The editor freezes on the user's phone

- Severity: S2 (core flow degraded)
- Flow / case: F01, F02, F06 / P-1
- Screen: S03
- Build: before 3c6df80  Device: the user's Xiaomi / Redmi / Poco

Steps
1. Open a project, scroll the timeline, edit, play the preview.

Expected: smooth scrolling, scrubbing and playback.
Actual: the user reported frequent freezes in all three (2026-10-25).
Evidence: the user's report. Not measurable on the CI emulator.
Suspected cause: the whole editor re-rendered on every position event; every slider or text change
rebuilt the native player; seeks queued up.
Status: fixes shipped (3c6df80 playhead store; live text / placement / canvas parameters; latest-wins
seek coalescing). CI: 9–12 editor renders over 10 s of playback instead of one per position event.
**Open until the user confirms on the phone.**

### BUG-002: Replacing a reversed clip kept the old reverse link

- Severity: S3
- Flow / case: F07 / F07-E2
- Screen: S04
- Build: f904ac9  Device: unit test

Steps
1. Reverse a clip.
2. Replace its media with another video.
3. Tap Reverse again.

Expected: the new video is reversed.
Actual: the old reversed video came back.
Evidence: `tests/speed.test.mjs` "replace media" (failed before the fix).
Status: fixed in 3f4dffd.

### BUG-003: Faint text failed contrast on dark surfaces

- Severity: S4
- Flow / case: all screens (hints, ruler, placeholders)
- Build: 55da45f

Expected: AA 4.5:1.  Actual: 3.83:1 on bg, 3.54:1 on surface.
Evidence: `contrast.py replica/design/tokens.json`.
Status: fixed in 863c092 (#85859A).

### BUG-004: White Export label on violet failed contrast

- Severity: S4
- Screen: S03 top bar
- Build: 863c092

Expected: AA 4.5:1 for the 14 sp bold label.  Actual: about 3.4:1.
Evidence: `contrast.py` on-accent pair.
Status: fixed in 2fad693 (dark label, `onAccent`).

### BUG-006: Preview failed whenever a fit clip had a colour or blur canvas background

- Severity: S1 (preview unusable)
- Flow / case: F02, F05, F06 / e2e 2, 3, 6, 7
- Screen: S03
- Build: image background commit (before 781c3a2)  Device: CI emulator #118

Steps
1. Open a project whose clip does not fill the canvas (default fit).
2. Wait for the preview.

Expected: the clip plays with the bars filled.
Actual: "Preview error (ERROR_CODE_VIDEO_FRAME_PROCESSING_FAILED)".
Evidence: CI #118 logcat `IllegalStateException: No call to setSamplerTexId() before bind` at
`CanvasBgProgram.drawFrame(CanvasBgFx.kt:120)`.
Cause: the shader declares the `uBgImg` sampler in every mode, but it was only set in image mode;
Media3's GlProgram refuses to draw with an unset sampler. Missed because Kotlin and GL run only in CI,
and fx-lab sets every uniform itself.
Status: fixed in c30200d: the input texture is bound as a placeholder when there is no image.
CI #123: no preview error in any flow; e2e 2–8 passed.

### BUG-007: Keyframe button was disabled while playback ran past the selected clip

- Severity: S3
- Flow / case: F08 / F08-H1
- Screen: S03
- Build: c30200d  Device: CI emulator #123 (e2e 1)

Steps
1. Play, select the first clip while playback continues past it (or the pause tap does not land).
2. Tap the keyframe diamond.

Expected: a key is added on the selected clip.
Actual: nothing; the diamond was disabled because the playhead had left the clip (BUG-005's guard).
Evidence: CI #123 flow 1 ended at 12.5 / 12.5 with the clip toolbar and no keyframe log line.
Status: fixed (pending CI): the diamond is always active; pressing it pauses playback, moves the
playhead to the nearest point inside the item and toggles the key there.

## Test tooling bugs (not app bugs)

- text_check sampled frames past the video end when the text ran to the end — fixed in eb80b39.
- text_check at 160x90 lost thin letters — fixed in c46a929.
- Flow 6 redo tap missed after undo — retried by label in f904ac9.
- Clip animation check compared brightness, but flow 1's duotone effect layer turns black into a dark
  purple, so a fully transparent first frame measured Y≈35 against 48 (CI #118). It now compares
  contrast (YHIGH − YLOW); validated on synthetic fade-in videos with a colour lift (20 vs 155 passes,
  no fade 155 vs 155 fails). The export also logs the opacity applied to its first frames.
- text_check failed when the picker returned different clips (CI #100): the frame before the text was a bright scene, and the effect layer that starts with the text darkens everything after, so the before-frame baseline could not be beaten. Now frames with the same background (mid-animation, after / exit) count as the baseline; validated on synthetic bright-then-dark videos with and without text.

### BUG-005: Keyframe button added keys outside the selected clip; Curve tool did not appear

- Severity: S3
- Flow / case: F08 / F08-H1
- Screen: S03
- Build: 4abe90c  Device: CI emulator #108 (e2e 1)

Steps
1. Play to the end of the timeline, then tap the first clip (playhead outside it).
2. Tap the keyframe diamond.

Expected: no key outside the clip; when a key is added, the Curve tool appears.
Actual: a key was added at 17.5 s on a 10 s clip; the Curve tool never showed, because the screen's
playhead value lagged the stored one by 17 ms and keys were matched within 15 ms.
Evidence: CI #108 flow 1 log `[KurguUI] keyframe main t=17526 add`, then `tool-keyEase` not found.
Status: fixed (pending CI): selecting an item outside the playhead moves the playhead into it (main
clip: its middle; text / layer: its start); the diamond is disabled outside the item and clamps to it;
key matching in the UI uses a 50 ms tolerance and removal uses the key's exact time. Unit test.
