# Launch plan: Kurgu

Date: 2026-10-25. Nothing below has been done yet; every item is a to-do for the user.

## Before launch (gates)

1. The user's phone test of the latest APK: no freezes while scrolling, editing and playing (BUG-001,
   the 4 open performance must-haves). Do not launch before this.
2. A long export on the phone (5+ minutes of video) to confirm the stall recovery (`test-plan.md`).
3. Name screening checks in `brand.md` (Türk Patent first), then a lawyer if the name stays.
4. Privacy policy and support page (a simple static page next to `kurgu/landing/`); Google Play data
   safety form: no data collected, no data shared; captions model download from the model host only.
5. Store assets: real screenshots from the phone (editor, timeline, captions, export), feature graphic
   1024 × 500, icon 512 × 512 (from `assets/icon.png`).

## Beta

- Google Play closed testing track with 10–20 testers (friends, local creators). Ask each one for one
  exported video and one thing that annoyed them.
- Crash reporting: Play Console's Android vitals (no extra SDK, keeps the no-tracking promise).

## Where to talk about it

- Turkish creator communities (YouTube / Instagram editing groups, Ekşi Sözlük, r/Turkey) with a short
  video made in Kurgu: lead with "filigransız, hesapsız, ücretsiz".
- Arabic creator communities, since Arabic and RTL text work.
- A Product Hunt or Hacker News "Show" post that leads with on-device captions and free 4K export,
  without naming any other app.

## First 10 users

Talk to them by hand: what they edit, on which phone, what made them stop. Their phones are the
performance test matrix.
