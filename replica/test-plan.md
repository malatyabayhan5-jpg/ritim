# Test plan: Kurgu (CapCut core loop clone)

Build: 9d15b41 + edge-case tests  Date: 2026-10-25  Env: Android emulator in CI (API 34, software GPU), unit tests on Node

Stack note: Kurgu is a React Native Android app, so the e2e tests are Maestro flows
(`kurgu/e2e/*.yaml`, run by `kurgu/e2e/run.sh` in the "Kurgu APK" workflow), not Playwright.
Selectors are testIDs and visible labels. Checks on the output are made on the exported file
(ffprobe, `text_check.py`, `fx_check.py`, `layer_check.py`) and on app log lines, not on
screenshots alone. There is no axe equivalent; labels are checked by code review
(every IconButton / ToolButton has `accessibilityLabel`).

`auto`: **e2e N** = Maestro flow N, **unit** = `kurgu/tests/*.test.mjs`, **manual** = needs the
user's phone. `result` is from CI #99 (92fe9ae, all 8 flows green) and unit tests (174 pass, `tests/edgecases.test.mjs` added for this plan). "pending CI" = added after #99, runs in #100–#104.

Emulator numbers are never presented as phone measurements.

| case | flow | type | steps | expected | auto | result |
| --- | --- | --- | --- | --- | --- | --- |
| F01-H1 | first edit and export | happy | New project → pick clips → Add → Export | MP4 in the gallery, decodes end to end, right size and fps | e2e 1 | pass (1280x720, 30 fps, 17.5 s, decoded clean) |
| F01-H2 | | happy: resolution picker | Editor: 1080p ▾ → pick → Done → Export | export screen starts from the picked mode | e2e 1 | pending CI |
| F01-E1 | | edge: no media permission | deny the picker permission | explanation, no crash, retry possible | manual | not run |
| F01-E2 | | edge: long 4K clip | 4K, several minutes | export completes, progress moves | manual | not run (emulator stalls ~70% under software GL, see to-check) |
| F01-E3 | | edge: screen locks during export | lock the phone mid-export | export continues or fails with a clear error | manual | not run |
| F01-E4 | | edge: low storage | fill the disk | free-space warning before export | manual | not run |
| F02-H1 | cut out a section | happy | tap clip → Split → move → Split → Delete middle | two clips left, timeline closes the gap | e2e 1 (split) + unit | pass |
| F02-E1 | | edge: split at the very start / end | split at 0, 1 ms, end, past end | no zero-length pieces | unit (edgecases) | pass (no split under the minimum piece) |
| F02-E2 | | edge: undo after delete | Delete → Undo → Redo | clip back, then gone again | e2e 6 + unit | pass |
| F02-E3 | | edge: delete the only clip | | empty timeline, empty hint, Export blocked with a toast | code review | not automated |
| F03-H1 | animated title | happy | Text → Add text → type → slide-up in | exported text slides in and fades out | e2e 1 + text_check | pass (0 px at 40 %, 525 px settled) |
| F03-E1 | | edge: empty text | add text, leave it empty | nothing drawn, no crash | unit (edgecases) | pass (not in the render spec) |
| F03-E2 | | edge: Arabic / RTL, emoji | AR UI, Arabic text | right-to-left layout, shaped text | e2e 2 | pass |
| F03-E3 | | edge: text past the clip end | add at the last second | text moved to fit inside the video | unit (edgecases) | pass |
| F04-H1 | auto captions | happy | Captions → Auto captions → English → base → Start | caption layers with "hello", list editable | e2e 4 | pass |
| F04-H2 | | happy: batch edit | caption list → Select → Select all | counter shows n selected | e2e 4 + unit | pass |
| F04-E1 | | edge: no speech | music-only clip | "no speech found" toast, no empty layers | unit (edgecases) | pass (no layers; toast by code review) |
| F04-E2 | | edge: offline, model not downloaded | airplane mode | download error shown, nothing faked | manual | not run |
| F05-H1 | music / voiceover | happy | Audio → Extract; Audio → Record | audio lanes appear, voice recorded at the playhead | e2e 1, e2e 7 | pass |
| F05-E1 | | edge: mic denied | deny microphone | message, no recording lane | manual | not run (flow 7 only allows) |
| F05-E2 | | edge: audio longer than the video | 20 s song on a 4 s video | cut at the video end | unit | pass |
| F05-E3 | | edge: mute the original | Clip audio tile | main track silent, extracted audio kept, each clip keeps its own volume | unit | pass (pending CI for the tile) |
| F06-H1 | effect, filter, transition | happy | Effects → duotone; Filters → vivid; transition tile | effect visible in the export window only, filter applied | e2e 1 + fx_check | pass (duotone 14.50–17.25 s, 0 % before) |
| F06-H2 | | happy: Filters / Adjust tabs | Filters → Adjust tab | Adjust panel in place | e2e 1 | pending CI |
| F06-E1 | | edge: apply to all | transition panel → Apply to all | every pair gets it, clamped to the shorter clip | unit (edgecases) | pass |
| F06-E2 | | edge: effect longer than the video | effect layer near the end | layer moved / cut to fit | probe script | pass (start pulled back to fit) |
| F07-H1 | speed ramp | happy | clip → Speed → Curve → preset | duration recomputed, smooth export | unit | pass |
| F07-E1 | | edge: 0.1x and 100x | | 4 s → 40 s; 10 s → 100 ms | unit | pass |
| F07-E2 | | edge: reverse | clip → Reverse | reversed copy encoded on device | e2e 3 | pass |
| F08-H1 | keyframes | happy | clip → diamond → move → change scale | interpolated scale | unit + e2e 1 (diamond add / remove + log) | unit pass; e2e pending CI |
| F08-E1 | | edge: keyframes after split / trim / duplicate | | keys shift with the source, duplicate keeps them | unit | pass |
| F09-H1 | picture in picture | happy | Overlay → photo → move, mask, blend | position, mask and time range right in the export | e2e 6 + layer_check | pass |
| F09-E1 | | edge: overlay longer than the video | 9 s overlay on 4 s video | starts at 0, cut at the end | unit (edgecases) | pass |
| F09-E2 | | edge: motion tracking | Track on a moving subject | keys follow, none lost | e2e 6 | pass (46 points, 0 lost) |
| F10-H1 | aspect ratio | happy | Ratio → 9:16 | canvas resized, content fitted | unit (edgecases) | pass |
| F10-E1 | | edge: background colour / blur | Background → colour or blur | bars filled; in Fill mode picking a background switches to Fit | fx-lab + unit | pass in lab; device not checked |
| F11-H1 | come back to a draft | happy | home → draft | same state, autosaved | e2e 1 | pass |
| F11-E1 | | edge: media deleted from the phone | delete the source file | missing banner, relink, Export blocked | code review | not automated |
| F11-E2 | | edge: app killed mid-edit | kill during an edit | recovered draft, toast | manual | not run |
| P-1 | performance | phone | scroll / scrub / play / edit on the user's Xiaomi | no freezes | manual | **waiting for the user** |

## Summary

- Cases: 40. Automated: 29 — passed 27 (two of them also have an e2e part pending), pending CI 2, failed 0. Probe script: 1 pass.
- Code review only: 2 (delete the only clip, deleted media). Manual, not run: 8, all need a real phone (permissions, storage, lock screen, offline, performance).
- Bugs: S1 0, S2 1 (freezes, fixes shipped, waiting for the phone), S3 1 fixed, S4 2 fixed. See `bugs.md`.

## To check (not reproduced, not filed as bugs)

- Export stalled at ~70 % once on the emulator (software GL; stacks dumped by the watchdog). Not seen
  on a device; needs a long export on the user's phone.
- Emulator frame stats: 43 % janky frames, p50 32 ms in flow 5. The emulator's software GPU dominates
  these numbers; they say nothing about the phone.
- Editor renders: 12 React renders of the editor over 10 s of playback in flow 5 (CI #99). Small, but
  not 0; check the profile on the phone if scrubbing still stutters.
