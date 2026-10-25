# Build log

One line per milestone step: ID, date, done or partial, what is missing, what was harder than expected.

- M1 S03 2026-10-25 partial — playhead moved out of editor render, timeline scrolls without React renders (3c6df80). CI #87: editor rendered 3 times in 10 s of playback (was once per position event). Emulator gfxinfo unchanged (jank ~42%, p50 31 ms): the emulator's software GPU dominates those numbers, so they cannot show this fix. Missing: check on the user's phone.
- M1 S03 2026-10-25 partial — dragging text on the preview and the main clip's scale / position / angle sliders no longer rebuild the preview player: text x, y, rotation, opacity (`tx:`) and main clip placement (`tf:`) are live parameters now (live.js, TextLayer.kt, Fx.kt KeyedPlacement). Text content and text scale (line wrapping) still rebuild. Harder than expected: texts carried no key in the render spec, so live values had nowhere to go.
