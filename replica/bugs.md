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

### BUG-008: Playhead jumped back to the old position after pause + seek

- Severity: S3
- Flow / case: F02, F08 / e2e 1
- Screen: S03
- Build: 05636af  Device: CI emulator #126

Steps
1. Play; while playing, press the keyframe diamond with the playhead past the selected clip.

Expected: playback stops, the playhead sits at the key (clip end).
Actual: the key was added at 10.0 s (log `keyframe main t=10023 add paused`), but the playhead
then showed 12.4 s, so the Curve tool (shown only on a key) never appeared.
Cause: `pause()` reports the player's position through an async event; JS had already moved the
playhead to the key, and the late event overwrote it. A paused seek reported no position of its own.
Status: first fix (d7a65f7) reported `player.currentPosition` after a paused seek, but
CompositionPlayer handles seeks asynchronously, so that still returned the old position and CI #127
saw the playhead jump back to the end (17.55 s) after the key was added at 5.0 s. Fixed again in 343e046 (CI #128: keyframe add and remove both logged at 5.0 s, the Curve tool showed):
a paused seek reports its target; `pause()` reports a position only when it was playing;
selecting an item and the keyframe diamond pause unconditionally (`playing` can lag after the player
is rebuilt at the end of the timeline).

### BUG-010: Main thread and JS thread stalled for 91 s after a video layer turned on the multi-input preview

- Severity: S1 (app freezes; Android may show "isn't responding")
- Flow / case: F01, F05 / e2e 1 (and probably e2e 6 "Kurgu isn't responding" in CI #131)
- Screen: S03
- Build: fd453bf  Device: CI emulator #133 (software GPU)

Steps
1. Two or three clips, a text, then add an effect layer (the preview switches to the multi-input graph).

Expected: the editor stays responsive.
Actual: `KurguPerf compose total=46 ... multi=true` at 02:14:17, then `main stall ms=91454` and
`jsStall ms=91261` reported at 02:15:54. Every preview rebuild itself took 20–184 ms, so the time is
spent after the rebuild, outside `applyComposition`. This matches the test driver not finding
buttons for 15–30 s in CI #129–#133.
Evidence: CI #133 flow 1 log.
CI #133 per flow: flows with layers or A/B transitions stalled 65–108 s (3: 93/108 s, 6: 65/79/89 s,
7: 72 s, 1: 91 s); flows without (2, 4, 5) had no stall at all.
Status: partly mitigated (pending CI): when a project has no video layer, image / sticker / shape
layers in normal blend mode now go through the single-input `BlendLayerFx` path like the blended ones,
so they no longer switch the preview to the multi-input graph. A/B transitions and video layers still
use it.
CI #134 stacks during a 74 s stall: the main thread waits in `HardwareRenderer.nSyncAndDrawFrame`
(the UI frame cannot be drawn), while `Effect:MultipleInputVideoGraph:Thread` keeps converting decoded
frames (`SurfaceTexture.updateTexImage`) and the playback thread keeps loading. The video graph holds
the (software) GPU and the UI cannot draw. Hypothesis: after a transition is added at the cut, main
track and both transition lanes seek into the same window and each decoder decodes from the previous
keyframe through the GL pipeline; the test videos had one keyframe per file (x264 default), so that
is hundreds of frames. Experiment (pending CI): test videos encoded with a keyframe every second like
phone cameras. If the stalls shrink, the fix is to avoid paused re-seeks in multi-input mode and to
make short-GOP preview proxies for long-GOP imports. Whether a real phone GPU shows the same length
is unknown (the emulator compiles shaders in software); the user reported freezes on a Xiaomi.

## Test tooling bugs (not app bugs)

- text_check sampled frames past the video end when the text ran to the end — fixed in eb80b39.
- text_check at 160x90 lost thin letters — fixed in c46a929.
- Flow 6 redo tap missed after undo — retried by label in f904ac9.
- Flow 1 could not find `tool-audio` after the transition step (CI #129–#131), although the button
  is on screen: CI #131 logged the main toolbar at y 1107–1163 of 1170 (density 160), the timeline
  box at 778–1098, and the failure screenshot shows the toolbar icons. An earlier reading that the
  timeline covered the toolbar was wrong (the ASCII output had been cut short when read). The
  timeline box now clips its content anyway. Maestro still did not see the id; the flow now taps the
  button by its label when the id is not visible, and on failure run.sh logs the tool ids in
  Maestro's own hierarchy to find out why.
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
