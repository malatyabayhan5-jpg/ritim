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

## Test tooling bugs (not app bugs)

- text_check sampled frames past the video end when the text ran to the end — fixed in eb80b39.
- text_check at 160x90 lost thin letters — fixed in c46a929.
- Flow 6 redo tap missed after undo — retried by label in f904ac9.
