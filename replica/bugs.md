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
make short-GOP preview proxies for long-GOP imports.
CI #136 (image layers on the single-input path + 1 s keyframes): flows 3, 6 and 7 had **no** main-
thread stall (were 65–108 s); flow 1 still stalled 91 s right after the transition made the preview
multi-input, so the keyframe interval was not the cause. That stall's stacks: main thread in
`nSyncAndDrawFrame`, playback thread idle. Cause: on Android 12+ a SurfaceView whose size changes
makes the UI wait for the video producer to deliver a frame at the new size; opening and closing
panels resizes the preview area, so every resize waited for the (slow, multi-input) video graph.
Fix (pending CI): the SurfaceView buffer has a fixed size (canvas aspect, long side 960 px), so the
view only scales and the UI never waits for the video. On a phone this wait would show as a hitch
each time a panel opens or closes.
CI #137: flows 3/6/7 stay at 0 stalls and pass, but flow 1 still froze 92 s after the transition, so
the surface size was not it (kept anyway: it avoids buffer reallocation on every panel). The stacks
show the main thread waiting for the render thread and every listed app thread idle, which points at
the emulator's software GL pipe being held. Experiment (pending CI): only the flow 1 group runs the
emulator with `-gpu swangle_indirect` (ANGLE over SwiftShader Vulkan); the stack dump now lists every
non-idle thread, not just ones picked by name. Whether a real phone GPU shows the same length
is unknown (the emulator compiles shaders in software); the user reported freezes on a Xiaomi.
CI #138: swangle made it worse: the emulator's own System UI stopped responding ("System UI isn't
responding" on the home screen, so flow 1 could not even start) and the emulator log filled with
`Failed to find ColorBuffer` / `context was preempted` errors. Reverted; every group runs
`swiftshader_indirect` again. The same run gave a clean stack for a shorter stall (flow 7, 15.8 s,
project from flow 6 with a video layer, `multi=true`): main thread in `nSyncAndDrawFrame`,
`Effect:MultipleInputVideoGraph:Thread` in `glCreateProgram` for the canvas background shader, playback
thread reading audio underruns. So the UI waits while the video graph compiles its shaders on the
emulator's software GL; flows 3/6 had 0–1 s stalls in the same run. Judgement: the length is an
emulator artefact (software shader compilation behind one GL pipe), not app code holding the main
thread, and nothing the app does on the main thread is in the stacks. Flow 7 now waits 30 s (was 5 s)
for the record panel; run.sh still prints every stall in its "Tıkanma" line, so it stays visible.
Open: the multi-input graph builds a fresh set of shader programs on each rebuild; on a phone that is a
one-off cost of tens of ms per program, but it has not been measured on a real device.
CI #139 (swiftshader everywhere): flows 2–8 all pass, stalls ≤ 1 s (JS ≤ 2.5 s); flow 7 and the
video background removal test pass again. Flow 1 stalled 50 s and then 59 s after the fade transition
(compose itself 91 ms, preview long side already 640 px for two lanes); the video graph thread was in
`glGenTextures` (Media3 `TexturePool.createTextures`), a call that only blocks when the emulator's GL
pipe is backed up. Flow 1 now waits up to 120 s for the main toolbar after the transition so the rest
of the flow (audio, text, export) is checked; the stall still prints in "Tıkanma".
CI #140/#141: flow 1 now fails one step earlier (`tool-back` within 30 s after the transition) and
flow 7 stalled 39 s. Timing in #140: the multi-input preview was built at 06:29:40 (61 ms), but the
88.8 s main-thread stall only began at 06:31:32, almost two minutes later; in #141 flow 7 the video
graph was still creating shader programs (`DefaultVideoFrameProcessor.configure`) 50 s after the
build. So the graph keeps the GL pipe busy long after it is built, while nothing is playing. Next
measurement (pending CI): the preview logs `paused activity frames= seeks= redraws=` every 2 s when
frames are processed while paused, and a live update whose values did not change no longer triggers
a redraw (each redraw is a seek, and a seek in the multi-input graph flushes every decoder).
Waits for `tool-back` (flow 1) and the record panel (flow 7) are 120 s for this run.
CI #142 (measurement): the app does no repeated work while paused. Flow 1: the multi-input preview
was built at 07:17:47; in the next 90 s the preview processed **0 frames**, issued 0 seeks and 1
redraw, then the UI stalled 82 s; the first frame arrived as the stall ended (07:19:17), a second one
after another 59 s stall. Flow 7 (cold open of flow 6's layered project): built at 07:20:34, no frame
at all until the 77 s stall ended at 07:22:14. The graph thread sat in `glGenTextures`
(`TexturePool.createTextures`) while the UI waited in `nSyncAndDrawFrame`. Single-input projects in the
same runs render 1–4 frames per redraw with no stall, and flow 6 builds a multi-input graph for the
same kind of project without any stall. Conclusion for now: on this emulator one multi-input frame
can take 60–90 s inside Media3's own GL setup, and every UI frame waits behind it; the app's code is
not in that path and sends no extra work (redraw for unchanged live values is now skipped anyway).
The input sizes are small (720p test videos, 640 px preview canvas). Open: whether a phone shows any
of this delay. To check on the phone: open a project with a transition (or a video layer) from the
home screen and note how long the preview takes to show the first frame and whether the buttons
respond meanwhile.
Status: e2e flows 1 and 7 stay red on the emulator because of this stall; flows 2–6 and 8 pass.

### BUG-011: Scrubbing the timeline responds very late on the user's phone

- Severity: S2 (core editing feels broken; no crash)
- Flow / case: F02 scrubbing / e2e 5
- Screen: S03
- Build: CI #142 APK  Device: the user's Xiaomi (reported 2026-10-27: "kaydırırken tepkime süresi çok çok uzun")

Steps
1. Open a project, drag the timeline left / right.

Expected: the preview follows the finger with real frames.
Actual (user report): the response comes very late.
Cause found in the code (not yet measured on the phone): while scrubbing, the preview allows one seek
at a time and releases it when the frame arrives (Media3 reports the first rendered frame after every
seek) or after a fixed 250 ms watchdog. If a seek takes longer than 250 ms (phone footage: 1 s+
keyframe interval, 1080p / 4K HEVC, every seek decodes from the previous keyframe), the watchdog
starts the next seek before the frame appears, the new seek cancels the old decode, and no frame is
shown until the finger stops.
Fix (pending CI): the watchdog follows the measured seek-to-frame time (2 × moving average, 250–2000
ms, and it grows when a seek is cut off), so each seek gets time to show its frame. The preview logs
`KurguPerf scrub seeks= frames= cutoffs= avgMs= maxMs=` at the end of each drag; e2e 5 adds a 3 s
slow drag and run.sh prints a "Kaydırma" line. If phone seeks still take several hundred ms, the next
step is low-resolution, short-keyframe preview proxies for imported videos.
CI #143 (emulator, 6 s 1280x720 test clips, 1 s keyframes): the build compiles; the 3 s slow drag in
e2e 5 issued 22 seeks and 21 showed their frame, 0 cut off, 143 ms average, 199 ms worst. On the
emulator seeks stayed under the old 250 ms, so it never showed the starvation; whether the phone did
depends on how long a seek takes on the user's footage, which only the phone can tell.
Status: fix in the #143 APK; phone check needed.

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
