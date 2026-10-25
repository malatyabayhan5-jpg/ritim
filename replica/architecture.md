# Architecture: Kurgu (a rebuild of CapCut's core editing features)

Reads `replica/recon.md` and `replica/features.csv` (2026-10-25: parity 80.7,
29 of 37 must-haves). Kurgu already exists, so this file records the stack it
keeps, maps the recon to the code that implements it, and orders the
remaining work.

## Stack

The user's stack is kept. There is no server: CapCut's core loop is an
on-device editor, and Kurgu's rules forbid hidden paid services and embedded
API keys.

| layer | choice | why |
| --- | --- | --- |
| app | Expo SDK 54, React Native 0.81, React 19 (JS) | already built; fast UI iteration; TR/EN/AR with RTL |
| media engine | Kotlin Expo module `kurgu-engine` on AndroidX Media3 1.9.4 (CompositionPlayer for preview, Transformer for export) | the same composition code drives preview and export, so they match |
| effects | GLSL shaders (`assets/kurgu_fx`), Media3 GlEffect | GPU, one pass per effect; verified in `tools/fx-lab` |
| audio | Kotlin/Java DSP (`dsp/`), Media3 AudioProcessor | effects, presets, denoise, volume keyframes |
| on-device AI | whisper.cpp (captions), TFLite person model (photo), Java tracker (ZNCC) | offline, free, no keys |
| storage | JSON project files in the app's document dir (`src/storage/library.js`), atomic write with a backup | single user, offline; no database needed |
| cloud AI | off by default; only through the user's own server and key | rule: never a key in the app, never a fake result |
| auth, payments, email, jobs, hosting | none | not in the core loop; added only if the user decides to sell (replica-launch) |
| CI | GitHub Actions: unit tests, APK build, Maestro e2e on an emulator in 3 groups | the only test device available to this project |

## Schema

There is no SQL. Projects are one JSON document per project
(`kurgu.project`, version 1, `src/model/schema.js`, with `migrateProject`).
Tables in the recon's sense map to arrays in that document:

| recon entity | Kurgu field | notes |
| --- | --- | --- |
| Draft | `project` {id, name, canvas {ratio, width, height, fit, background}, fps, updatedAt} | `listProjects` reads covers and metadata |
| Track main | `project.main[]` (createMainClip) | srcIn, srcOut, speed, speedSegments, transform, keyframes, fx, effects, filter, adjust, lut, volume, fades, transition, reverse |
| Track overlay | `project.overlays[]` (createOverlay) with `lane` | mask, chroma, blend, opacity, keyframes |
| Track audio | `project.audio[]` (createAudioClip) with role music / voice / sfx | volume keyframes, audio fx |
| TextSegment | `project.texts[]` (createText) | style, animIn / animOut / animLoop, keyframes |
| EffectSegment | `project.effectLayers[]` | start, duration, effect id, params |
| CaptionSegment | `project.texts[]` with caption role | SRT import / export |
| Transition | `main[i].transition` {type, durationMs} | between i-1 and i |
| Keyframe | `keyframes[prop] = [{t, v, e}]` on each item, t relative to the item | shared evaluator: `src/model/keyframes.js` and `Keyframes.java` |
| MediaAsset | `project.media{id: {uri, kind, width, height, durationMs, ...}}` | files adopted into app storage |
| ExportSettings | export screen state + `exportVideo` options | resolution, fps, quality tier, codec |

Access rules: single user, app-private storage. Hard constraints the recon
implies, enforced in the model layer (`src/model/timeline.js`), not the UI:
main clips never overlap, overlays never overlap within a lane, keyframe
times stay inside the item after split and trim, and a project always loads
(the `.bak.json` copy restores a half-written save).

## API

The "API" is the bridge between the JS editor and the native engine
(`KurguEngineModule.kt`) plus the preview view's props. By flow:

| call | does | input | output | flow |
| --- | --- | --- | --- | --- |
| `probe` | read media metadata | uri | width, height, duration, rotation, audio / video | F01, F09 |
| `thumbnails`, `waveform` | timeline strips | media, times / range | image uris, peaks | all timeline flows |
| `KurguPreview` view: `spec`, `live`, `previewQuality` props; `play`, `pause`, `seekTo`, `setScrubbing`; events `onPosition`, `onPlaybackState`, `onPreviewError` | real-time preview of the render spec | spec JSON (structure), live JSON (slider values) | position, state, errors | every flow |
| `exportVideo`, `cancelExport`, `saveToGallery`, `encoderCapabilities`, `deviceStatus` | render to MP4 | spec, resolution, fps, bitrate, codec | progress events, file | F01 |
| `reverseVideo` | reversed copy of a clip | media | new media | (S04 Reverse) |
| `transcribe`, `captionModels`, `downloadCaptionModel` | auto captions | media, language, model | segments | F04 |
| `synthesizeSpeech` | text to speech | text, voice | audio file | (S07) |
| `requestMicPermission`, `startRecording`, `recordingLevel`, `stopRecording` | voiceover | — | audio file, level | F05 |
| `sceneScores` | scene detection, auto cut | media | scores | (AI) |
| `trackMotion`, `cancelAi` | motion tracking | media, range, box | points | F09 |
| `keyColor`, `segmentPerson`, `renderPhoto`, `eraseRect`, `imageStats`, `saveImageToGallery` | chroma key colour, photo tools | image | results | F09, photo |

Webhooks: none. Jobs: none (export runs in a foreground service,
`ExportService.kt`). Official APIs only: Android MediaCodec, Media3,
whisper.cpp, TFLite. Nothing of CapCut's.

## The parts that bite

- **Real-time on a mid-range phone (the top risk, reported by the user on a
  Xiaomi).** Three causes, in order:
  1. JS re-render storms. The playhead was React state: every position event
     (60/s) re-rendered the whole 1400-line editor. Fixed in 3c6df80
     (`src/editor/playhead.js`): in CI #87 the editor rendered 3 times during
     10 s of playback. Still to check on the phone.
  2. Full preview rebuild on every structural edit:
     `KurguPreviewView.applyComposition` builds a new Media3 composition and
     calls `setComposition` + `prepare`. When the multi-input graph has ended
     once, it also releases the player. On a phone that means a black or
     frozen preview for hundreds of ms after each edit. Fix: keep the
     last frame visible during the rebuild, coalesce rapid edits (one rebuild
     at the end of a burst, live params for everything a slider touches),
     and treat more edits as live parameters instead of structure.
  3. Seeks while scrubbing. Each seek flushes the multi-input graph. Fix:
     latest-wins coalescing on the native side (never more than one seek in
     flight), plus scrubbing mode.
- **Preview and export must match.** Both use `CompositionFactory`; the
  differences (speed mapping, blend layers) are tested in e2e 1 and 6 by
  analysing the exported MP4.
- **Media3 1.9.4 limits.** The compositor only alpha blends (blend modes need
  composition-level effects); the multi-input graph cannot be reused after
  the end (rebuild); emulator GL is far slower than a phone (export test
  stalls at 70% there).
- **Decoder count.** Each overlay or transition lane is another hardware
  decoder; phones have a limit (often 4–16). Overlay and transition lanes
  share decoders where they can, and the preview drops resolution.
- **Storage and big files.** 4K inputs, low storage warnings
  (`deviceStatus`), atomic saves.
- **Background and process death.** Export runs in a foreground service;
  the editor saves on background and on close.
- **RTL.** Arabic UI and text, timeline stays left-to-right (time axis).

## Build order

Milestones list the screens (S-IDs from recon) and the code they touch.
Order: the missing must-haves from `parity.py`, the user's reported freezes
first.

1. **Vertical slice, made instant (S03, F01, F02).** On the user's phone:
   - [x] playhead out of editor render, timeline scroll without React renders (3c6df80)
   - [ ] no frozen preview on edits: keep last frame, coalesce rebuilds, more edits as live params (`KurguPreviewView.kt`, `renderSpec.js` / `live.js`)
   - [ ] native latest-wins seek coalescing while scrubbing (`KurguPreviewView.kt`)
   - [ ] measure: render counts, seek latency and rebuild time logged in e2e 5; the user re-tests on the phone
2. **Layout parity (S03, S04, S07, S11, S14–S19).** After the user's
   screenshots arrive (replica-design): main toolbar order, clip sub-toolbar,
   bottom sheet panels, export settings behind the resolution label. Own
   icons and words.
3. **Remaining must-haves:**
   - [ ] speed up to 100x (S05; today 10x)
   - [ ] caption list multi-select and batch edit (S10)
   - [ ] text animation visual check on device (S08)
4. **Should-haves:** clip animations in / out / combo (S04), replace clip
   (S04), video background removal (S04, on-device model), chroma key visual
   check, caption styles, canvas background blur, apply transition to all.
5. **Could-haves:** duplicate clip, beat marks, stabilization, fullscreen
   preview (each only if the screenshots confirm CapCut has it).
6. **Fixes from replica-entrepreneur** once it has run (what CapCut's users
   complain about).
