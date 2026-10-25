# Kurgu components (replica-design)

Source: the user's CapCut recording (`replica/screens/`, measured 2026-10-25) for structure and
sizes; Kurgu's own palette (`tokens.json`, `kurgu/src/theme.js`) for colour. Never taken from
CapCut: logos, icons (Kurgu uses Ionicons, MIT), copy, the cyan brand accent, illustrations.

Stack note: Kurgu is React Native, not web. The token mapping is `kurgu/src/theme.js`
(`colors`, `space`, `radius`, `font`) instead of CSS custom properties / Tailwind; components
use those names and never raw hex. Primitives live in `kurgu/src/ui/index.js`.

Status: **built** = exists and matches; **adjust** = exists, differs from the recording;
**todo** = not built.

```
TopBar                                                     S03 · adjust
  layout    close (left), search (skip), resolution dropdown + Export (right)
  sizes     48 dp high; buttons 34 dp, radius pill
  states    default, Export pressed, export disabled (empty project → toast)
  tokens    bg bg, Export bg accent / text on-accent / font small 700
  a11y      buttons with labels; Export is the primary action, last in focus order
  gap       Kurgu shows project title + save state in the middle; the recording has a
            resolution dropdown there (todo: quick 720p / 1080p / 4K menu)

ControlsRow                                                S03 · built (2026-10-25)
  layout    [fullscreen][time]  play (centre)  [marker][undo][redo]
  sizes     40–46 dp; play icon 28, others 20
  states    playing / paused; undo, redo disabled at history ends; fullscreen on / off
  tokens    icons text, disabled 0.35 opacity; time text-muted small tabular-nums
  a11y      each IconButton labelled (play/pause swaps label); ≥44 dp hit area
  gap       keyframe button (diamond) in the right group: todo

ToolButton                                                 S03, S04, S07, S11 · adjust
  layout    icon over label
  sizes     64 dp wide in the recording (Kurgu 68), icon 22–23, label tiny 11, up to 2 lines
  states    default, pressed (0.6), active (accent), disabled (0.35), badge dot, "new" tag (skip)
  tokens    icon text, label text-muted, active accent
  a11y      role button, label = visible label
  gap       Kurgu truncates to one line; recording wraps to two

Toolbar (main / context)                                   S03, S04 · built
  layout    horizontal scroll; context toolbars have a pinned back "<" tile on the left
  sizes     70–72 dp; hairline top border
  states    main, context per selection (clip, audio, text, effect, overlay), sub menus
            (audio, text, captions); scroll resets to start when the context changes
  order     follows recon.md "Layout from the user's recording"
  tokens    bg surface, border border
  a11y      back tile labelled "Back"; hardware back closes panel → sub → selection

Timeline                                                   S03 · built
  layout    ruler 22, main track 50–54 with thumbnails and "+" add-media tile at the
            right, aux rows 30 below; fixed centre playhead
  states    idle, scrubbing, pinch-zoom, playing, clip selected (white frame + trim
            handles + duration badge), dragging, missing media
  tokens    bg bg, clip clip, selected clip-selected, playhead playhead, ticks text-faint
  a11y      clips are buttons labelled by name and duration; trim by handles
  gap       left column (clip audio, cover) from the recording: todo

AddRow ("+ Add audio" / "+ Add text")                      S03 · built (2026-10-25)
  layout    full-width row starting at time 0, plus icon + label
  sizes     30 dp (audio), 26 dp (text), radius sm
  states    shown only while that track is empty; pressed
  tokens    bg surface, label text-muted tiny
  a11y      role button, label = visible label; opens the audio / text sub-toolbar

Preview                                                    S03 · built
  layout    fills the space between top bar and controls row; canvas fitted inside
  states    loading, playing, paused, error banner, fullscreen
  overlays  move / scale / rotate handles for the selected text or layer
  tokens    bg #000 (video letterbox), handles clip-selected

BottomSheetPanel                                           S05, S08, S09, S14–S17, S19 · built
  layout    title + close (or check) in the header; body; replaces the toolbar
  states    open, applying, busy
  tokens    bg surface, title h2, hairline border
  a11y      header close labelled; back closes the panel first
  gap       Filters / Adjust as one panel with tabs (Presets, Filters, Adjust, Quality): todo

Tabs                                                       S08, S15 · built
  states    active (text, underline), inactive (text-muted)

Slider                                                     S05, S15, volume · built
  states    dragging (value bubble), reset, keyframe toggle where supported
  tokens    track surface3, fill accent, thumb text
  a11y      adjustable role with value text

Chip / Swatch                                              S17, panels · built
  states    default, active (accent ring), pressed
  tokens    bg surface2, active border accent; swatches show their colour with a ring

ThumbnailTile                                              S14–S16 · built
  states    default, selected (accent ring), applied badge
  tokens    label tiny text-muted

ProgressOverlay                                            S09, S20 · built
  layout    title, keep-the-app-open note, bar + percent, cancel
  states    running, failed (error text danger), done
  tokens    bar accent on surface3; percent title

Toast                                                      all · built
  states    info, error (danger)
  a11y      announced as a live region

PermissionPrompt                                           S02, S12 · built
  states    denied → explanation + open settings
```
