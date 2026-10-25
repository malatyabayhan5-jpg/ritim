# Recon map: CapCut (Android)

Scope: the core editing loop. Import media, edit on a multi-track timeline
(trim, split, move, zoom), text and captions, effects, filters, transitions,
audio, export. Out of scope: the template store, the licensed music, sound,
sticker and effect libraries, cloud space, CapCut accounts, social posting
and Pro (paywalled) features.
For: the user's own app, Kurgu (`kurgu/`, Expo + Kotlin/Media3, Android
first, TR/EN/AR). It is rebranded before any launch.
Date: 2026-10-25

## How this map was made, and its limits

- Public sources only, read through web search. This session's network
  policy blocks direct page fetches (HTTP 403 from the proxy), so pages were
  **not opened directly**. Every row below says where it came from. Facts that
  only one weak source supports are marked `low`.
- **No reference screenshots yet.** `replica/screens/` is empty. The user has
  CapCut on their phone and will send screenshots. Until then, layout facts
  (exact toolbar order, icon placement) are `guess` and must be checked against them.
- **Terms:** CapCut's Terms of Service page could not be opened (network
  policy), so its restriction clauses were not read. Nothing here uses a
  CapCut account, its code, its network calls or its assets. The work uses
  public pages plus the user's own screenshots, and the user only looks at the
  app as a normal user.
- Toolbar labels differ between app versions and regions; sources disagree on
  some menu paths. Conflicts are noted where they appear.

## Sources

| # | source | URL | notes |
| --- | --- | --- | --- |
| 1 | help center: export 2K/4K | https://www.capcut.com/help/export-videos-in-capcut | official. Mobile 4K is limited; the resolution label sits next to the Export button |
| 2 | help center: batch edit captions | https://www.capcut.com/help/batch-edit-to-recognize-subtitle | official. Text → Auto captions → pick audio source; tap a caption → Edit captions → Select (multi-select) |
| 3 | help center: templates | https://www.capcut.com/help/use-and-export-templates-in-capcut | official. Templates tab at the bottom of the home screen (out of scope, gives the home layout) |
| 4 | speed curve tool page | https://www.capcut.com/tools/speed-ramp | official marketing. Speed → Curve, presets (Montage, Hero), drag points, Add point |
| 5 | overlay guide | https://www.capcut.com/resource/how-to-add-capcut-overlays | official resource. Overlays sit on their own layers |
| 6 | Google Play listing | https://play.google.com/store/apps/details?id=com.lemon.lvoverseas | trim, split, merge, speed 0.1x–100x with curves, zoom, freeze, transitions, keyframes, slow motion, chroma key, stabilization, auto captions, TTS, motion tracking, background removal |
| 7 | Tech Dev Notes (Play mirror) | https://techdevnotes.com/apps/android/capcut-video-editor/com.lemon.lvoverseas | v18.2.0 (2026-06-18), 3.6 rating from ~12.8M ratings, 1B+ installs, Android 6.0+. Not confirmed on Play itself |
| 8 | Tuts+ tutorial (2025) | https://photography.tutsplus.com/tutorials/how-to-quickly-use-capcut-for-video-editing-tutorial-2024--cms-108707 | New project → pick clips → Add (bottom right); timeline holds video, audio, overlay, effects, text tracks; main toolbar + per-track sub toolbars |
| 9 | Metricool tutorial | https://metricool.com/capcut-video-editing/ | toolbar above a selected clip: Split, Delete, Reverse; Basic (opacity, scale, position); Smart tools (remove background, chroma key); Animation In / Out / Combo |
| 10 | VideoProc guide | https://www.videoproc.com/video-editor/how-to-use-capcut.htm | Reverse and Replace at the far right of the scrolling clip toolbar; Mask in the bottom panel |
| 11 | Hollyland guide | https://www.hollyland.com/blog/topics/capcut-video-editing | Edit → Freeze inserts a still clip; Speed 0.1x–100x |
| 12 | unifab 2026 guide | https://unifab.ai/resource/how-to-use-capcut | Overlay → Add overlay for a green-screen clip |
| 13 | Lilach Bullock tutorial | https://www.lilachbullock.com/capcut-tutorial/ | Text menu: Add text, Stickers, Auto captions, Text to audio; Audio: Sounds, Extracted, Voiceover, Effects |
| 14 | Shotkit / miracamp / tella text guides | https://shotkit.com/add-text-capcut/ · https://www.miracamp.com/learn/capcut/how-to-add-text · https://landingpage.tella.com/blog/how-to-add-text-on-capcut | text styles (font, colour, spacing, transparency, alignment), presets, animation in / out / loop with a speed slider. tella contradicts on animation (older version?) |
| 15 | miracamp export guide | https://www.miracamp.com/learn/capcut/how-to-export-high-quality-videos | export: 480p / 720p / 1080p / 4K, 24 / 30 / 60 fps, bitrate Low / Medium / High, H.264 / HEVC. `low`: third party |
| 16 | user's own phone (screenshots) | — | **pending**: the most valuable source, every real state |

## Core loop

Open the app, start a project from phone media, cut it into a short vertical
video on the timeline with text, music and effects, and export it to the
gallery. Everything must feel instant while scrubbing and playing.

## Screens

Confidence: `high` (official source), `med` (two or more third-party sources
agree), `low` (one weak source), `guess` (needs a screenshot).

| ID | screen | route / how to reach | purpose | key components | states seen | conf |
| --- | --- | --- | --- | --- | --- | --- |
| S01 | Home | app launch | start a project, reopen drafts | "New project" button, drafts list (cover, name, duration, date), bottom nav (Edit / Templates / …) | empty (no drafts), filled | med [3][8]; nav labels guess |
| S02 | Media picker | S01 New project; also Add in the editor | pick videos and photos | Video / Photo tabs, multi-select order numbers, Add button bottom right | empty gallery, permission denied, selected n | med [8] |
| S03 | Editor | after S02 Add, or a draft from S01 | the whole edit | top bar (close, resolution label, Export), preview, play / time / undo / redo, multi-track timeline with centre playhead, main toolbar (scrolls) | loading, playing, scrubbing, nothing selected | med [1][8]; toolbar order guess |
| S04 | Clip toolbar | tap a clip on the main track or overlay track | edit one clip | Split, Speed, Volume, Animation, Delete, Mask, Chroma key, Remove background, Reverse, Freeze, Replace, Opacity (Basic), Filters, Adjust | clip selected, trimming (white handles) | med [9][10][11] |
| S05 | Speed panel | S04 Speed | change clip speed | Normal tab (0.1x–100x slider), Curve tab (presets Montage, Hero…, custom editor with Add point) | normal, curve preset, custom | high [4][6] |
| S06 | Keyframe | diamond button above the timeline / on the preview | animate a property over time | add / remove diamond at playhead, keyframe dots on the clip, easing (Linear, Ease in…) | none, has keyframes, on a keyframe | low [6] + guide; layout guess |
| S07 | Text menu | main toolbar Text | add text things | Add text, Stickers (library, skip), Auto captions, Text to audio | — | med [13] |
| S08 | Text editor | S07 Add text, or tap a text clip | type and style text | keyboard + input, tabs: presets / templates, style (font, colour, stroke, spacing, opacity, alignment), effects, animation (in / out / loop + speed) | empty input, editing, RTL | med [14] |
| S09 | Auto captions | S07 Auto captions | captions from speech | source choice (original sound / voiceover), language, generate; progress; caption track | generating, no speech found, done | high [2] |
| S10 | Edit captions | tap a caption → Edit captions | fix many captions | list of lines with times, Select for multi-select, batch replace / style | list, multi-select | high [2] |
| S11 | Audio menu | main toolbar Audio | add sound | Sounds (library, skip), Extracted (from a video), Voiceover (record), Effects (SFX library, skip) | permission denied (mic) | med [13] |
| S12 | Voiceover recorder | S11 Voiceover | record narration at the playhead | hold / tap record button, level, timeline grows | recording, denied | low [13] |
| S13 | Audio clip toolbar | tap an audio clip | edit audio | Volume, Fade, Split, Delete, Speed, Voice effects, Noise reduction, Beats | — | low (weak sources) |
| S14 | Effects browser | main toolbar Effects | add a video effect | categories (blur, glow, shake…), thumbnails, intensity; effect track clip | browsing, applied | med [8][9] |
| S15 | Filters / Adjust | main toolbar or S04 Filters / Adjust | colour | filter grid with intensity; adjust sliders (brightness, contrast, saturation…) | — | med (several guides) |
| S16 | Transitions | tile between two clips on the main track | transition between clips | categories, duration slider, apply to all | none, applied | med; tile placement guess |
| S17 | Ratio / Format | main toolbar Ratio (also called Format) | canvas aspect ratio | 9:16, 1:1, 16:9, 4:3… chips | — | med (two guides, labels differ) |
| S18 | Overlay | main toolbar Overlay → Add overlay → S02 | picture in picture | overlay track, move / scale on preview, then S04 tools (mask, chroma key, blend, opacity) | — | med [5][12] |
| S19 | Export settings | tap the resolution label next to Export | choose quality | resolution (480p–1080p, limited 4K), frame rate (24 / 30 / 60), bitrate Low / Medium / High, codec | — | high [1] for label; rest low [15] |
| S20 | Export progress / done | Export | render and save | progress %, keep app open note, done: saved to gallery, share sheet | exporting, failed, done | guess |

## Flows

```
F01 Make and export a first edit
    S01 New project -> S02 pick 2 clips -> Add -> S03 -> Export -> S20 done
    happy path clicks: 5 (New project, clip, clip, Add, Export)
    edge: no media permission, very long 4K clip, phone sleeps during export, low storage

F02 Cut out a bad section
    S03 tap clip -> drag playhead -> S04 Split -> drag playhead -> Split -> tap middle piece -> Delete
    happy path clicks: 5 (+ two scrubs)
    edge: split at the very start or end, split during playback, undo after delete

F03 Add an animated title
    S03 Text -> S07 Add text -> S08 type -> animation tab -> pick in-animation -> done
    happy path clicks: 5 (+ typing)
    edge: empty text, emoji, Arabic (RTL), text past the clip end

F04 Auto captions and fixing them
    S03 Text -> S07 Auto captions -> S09 generate -> tap caption -> Edit captions -> S10
    happy path clicks: 4 to captions
    edge: no speech, music only, long video, offline

F05 Add music or a voiceover
    S03 Audio -> S11 Extracted (pick a video) | Voiceover -> S12 record -> S13 volume / fade
    happy path clicks: 3–4
    edge: mic denied, audio longer than video, mute original clip

F06 Style it: effect, filter, transition
    S03 Effects -> S14 pick; Filters -> S15 pick + intensity; tap tile between clips -> S16 pick
    happy path clicks: 2 each
    edge: apply to all, effect longer than video, stacking several effects

F07 Speed ramp
    S03 tap clip -> S04 Speed -> S05 Curve -> preset (or custom points)
    happy path clicks: 4
    edge: audio pitch, very slow (0.1x) clip length, curve on a reversed clip

F08 Zoom with keyframes
    S03 tap clip -> playhead to start -> keyframe diamond -> playhead later -> pinch preview -> diamond auto-added
    happy path clicks: 3 (+ pinch)
    edge: keyframes after split / trim (one weak source says they can disappear)

F09 Picture in picture with green screen
    S03 Overlay -> Add overlay -> S02 pick -> S18 place -> S04 Chroma key / Mask / Remove background
    happy path clicks: 5
    edge: several overlays, overlay longer than main video, blend modes

F10 Change aspect ratio
    S03 Ratio -> S17 9:16
    happy path clicks: 2
    edge: content fit vs fill, background colour / blur

F11 Come back to a draft
    S01 tap draft -> S03 (autosaved)
    happy path clicks: 1
    edge: media deleted from the phone, app killed mid-edit
```

## Components

| component | variants | states | used on |
| --- | --- | --- | --- |
| Main toolbar | icon + label, horizontally scrolling | default, pressed | S03 |
| Context sub-toolbar | per selection type (clip, audio, text, effect, caption), back arrow on the left | default, disabled (tool not valid at playhead) | S04, S13 |
| Timeline | main track with thumbnails, overlay tracks, audio waveforms, text / effect / caption bars, ruler, centre playhead, transition tiles | idle, scrubbing, pinch-zoom, playing, clip selected with trim handles, dragging | S03 |
| Preview | fit to ratio, on-canvas handles (move, pinch scale / rotate) for selected item | playing, paused, loading | S03 |
| Bottom sheet panel | tabs at top, grid of thumbnails or sliders, check (done) button | open, applying | S05, S08, S14–S17, S19 |
| Slider | value bubble, reset | dragging | S05, S15, volume |
| Thumbnail grid tile | name, selected ring, download badge (library assets, skip) | default, selected | S14–S16 |
| Keyframe button | diamond add / remove | none, on keyframe | S03 |
| Record button | hold / tap | idle, recording | S12 |
| Progress overlay | percent, cancel | running, failed | S09, S20 |
| Toast | info, error | — | all |
| Permission prompt | media, mic | denied, granted | S02, S12 |

## Inferred data model

```
Draft (Project)  id, name, cover, duration, updated_at, canvas {ratio, w, h, background}
                 evidence: S01 drafts list, F11 autosave [8]
                 confidence: med
Track            type (main | overlay | audio | text | sticker | effect | caption), order
                 evidence: S03 tracks [8]
                 confidence: med
Segment (Clip)   media_id, src_in, src_out, start, speed | speed_curve(points), volume, fade_in/out,
                 transform {x, y, scale, rotation}, opacity, filter {id, intensity}, adjust {…},
                 mask, chroma_key, blend, animation {in, out, combo}, reverse, keyframes[]
                 evidence: S04, S05, S06, F07, F08 [4][6][9][10][11]
                 confidence: med (fields), guess (names)
Keyframe         time (relative to segment), property values, easing
                 evidence: S06 (one weak source: keyframes tied to timeline time)
                 confidence: guess
TextSegment      text, start, duration, style {font, colour, stroke, spacing, opacity, align}, animation, keyframes
                 evidence: S08 [14]
                 confidence: med
CaptionSegment   text, start, end, language, source (original | voiceover), style
                 evidence: S09, S10 [2]
                 confidence: high
EffectSegment    effect_id, start, duration, intensity, target (whole video | clip)
                 evidence: S14
                 confidence: med
Transition       between main segments i and i+1, type, duration
                 evidence: S16
                 confidence: med
MediaAsset       uri, kind (video | photo | audio), width, height, duration
                 evidence: S02
                 confidence: high
ExportSettings   resolution, fps, bitrate (low | medium | high), codec
                 evidence: S19 [1][15]
                 confidence: med
```

Relationships: Draft 1-n Track, Track 1-n Segment, Segment n-1 MediaAsset,
Segment 1-n Keyframe, Draft 1-n Transition (between main segments),
Draft 1-n CaptionSegment.

Kurgu's existing model (`kurgu/src/model/schema.js`) already covers all of
these (main clips, overlays, audio, texts, effect layers, transitions,
keyframes, captions), so replica-architect has a model to check against, not
one to invent.

## Feature matrix

See `features.csv`. Must: 37, should: 20, could: 7, skip: 9 (73 rows).
Rows whose `original` is `low` or `guess` (Duplicate, Beat marks, Fullscreen
preview) still need the user's screenshots to confirm CapCut has them.

First parity run (`parity.py`, today): **80.7 / 100, 29 of 37 must-haves
done, not shippable**. The weakest areas are ux (37.5), ai (40) and
**performance (50)**. Four of the eight missing must-haves are about the
app feeling instant.

## Out of scope (cannot or should not be cloned)

- The template store and template-based editing (their content and creators).
- Licensed libraries: music and sounds, stickers, text templates, effects and
  filter packs as content. Kurgu ships its own originals (116 filters, 122
  effects, 93 transitions, 97 text styles, all written in this project).
- Cloud space, CapCut accounts, team spaces.
- Posting to TikTok and other networks through their partner integrations.
  The Android share sheet is in scope.
- Pro (paywalled) features: not accessed, never bypassed.
- AI services that run on CapCut's servers (script to video, AI avatars,
  generative effects). On-device equivalents only, or the user's own server
  and key (see Kurgu's cloud AI rules).
- Their logo, icons, illustrations, UI copy and colours.

## Size

Screens 20, flows 11, entities 10. Hard parts:

1. **Instant feel on mid-range Android**: smooth 60 fps timeline scrolling,
   scrubbing and playback, and no freeze on edits. The user reports Kurgu
   freezing on a Xiaomi in exactly these places (2026-10-25). This is the
   number one gap, ahead of any feature.
2. A real-time multi-track compositing engine (overlays, transitions, effects,
   text) with export that matches the preview.
3. On-device AI: captions (done), video background removal, motion tracking
   (done for layers), stabilization.

Size: **L** for the remaining parity on top of Kurgu (the engine and most
features exist; feel, layout and the missing tools are the work). A clone
from scratch would be XL. No promise of a perfect clone.
