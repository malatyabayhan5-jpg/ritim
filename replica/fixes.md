# What CapCut users complain about, and what Kurgu does about it

Date: 2026-10-25

## Sample size and its limits (read this first)

- **Verbatim reviews collected: 0.** This session's network policy blocks the App Store RSS feed,
  the Hacker News Algolia API, Reddit, Google Play and Trustpilot pages (connection refused). The
  skill requires verbatim, linked quotes, so `replica/reviews.csv` holds no rows. Nothing here is a
  quote from a user.
- What exists instead: **web search summaries of secondary sources** (third-party review analyses,
  news, competitor blogs, CapCut's own help pages). Search results are summarised by the search
  tool, so even the numbers below are second-hand. Several sources are competitors of CapCut and
  have a reason to make it look bad.
- To do this properly: allow `itunes.apple.com`, `hn.algolia.com`, `www.reddit.com` and
  `play.google.com` in the environment's network settings, or paste reviews from the phone, then
  run `reviews.py`.

## 1. What they hate (secondary evidence only)

| # | problem | evidence (second-hand) | strength |
| --- | --- | --- | --- |
| H1 | Features that used to be free moved behind Pro (captions styles, effects, 1080p / 60 fps exports, cloud), and the Pro price rose sharply in early 2026 | [unstar.app analysis of 1–3★ Google Play reviews](https://unstar.app/blog/capcut-everything-is-pro-now-cant-export-reviews-2026) (reports 900 reviews in 56 days naming Pro / paywall; third-party), [VEED review](https://www.veed.io/learn/capcut-review), [Newsweek](https://newsweek.com/app-used-millions-nearly-doubles-subscription-price-overnight-11535999), [PiunikaWeb](https://piunikaweb.com/2026/01/27/capcut-pro-price-increase-100-dollars-outage/), [Unbox PH](https://unbox.ph/gadget/capcut-is-great-but-only-if-youre-willing-to-pay/amp/), Trustpilot pages ([1](https://www.trustpilot.com/review/www.capcut.com?page=3), [2](https://uk.trustpilot.com/review/www.capcut.com?page=9)) | strongest: several independent sources agree |
| H2 | Exports fail or freeze near the end ("refused at the last step", "stuck at 99 %") | unstar.app (reports 70 reviews about an export refused at the last step), [Meta developer forum thread](https://developers.secure.facebook.com/community/threads/809552951271542), CapCut's own help pages on [export](https://www.capcut.com/help/export-video-on-capcut) and the [export button](https://www.capcut.com/help/export-button-not-working) | medium: one analysis + forum + vendor help |
| H3 | App slows down or stops responding on heavy projects ("memory overload", per CapCut's help) | CapCut help pages (above); troubleshooting guides of low quality (not used) | thin |
| H4 | Terms of service give CapCut a broad licence to user content | [eesel.ai](https://www.eesel.ai/en/blog/capcut-alternatives), [Splice blog](https://spliceapp.com/blog/capcut-alternatives-apps-for-users-dissatisfied-with-capcut/) (a competitor) | thin and partisan; check the actual terms before saying anything public |

## 2. What is missing (as users ask for it)

Not measurable without verbatim reviews. The only explicit ask in the summaries is "keep 1080p / 60 fps
export free", which is H1.

## 3. What is unsolved

- People who edit for clients or sponsors and need their footage to stay on the phone (H4).
- People in regions where CapCut was pulled from a store (US App Store, January 2025, per
  [VEED](https://dhl.veed.io/learn/capcut-alternative)); not Kurgu's main market (TR / AR), noted only.

## Fix plan

| fix | evidence | size | skill | Kurgu today |
| --- | --- | --- | --- | --- |
| Every export resolution and frame rate the phone can encode is free, no watermark, no account | H1 | S | replica-launch (say it) | already true: no paywall, no watermark code, no account |
| Export that survives a stall: watchdog detects no progress, restarts the export once from the start, tells the user | H2 | M | replica-build | done 2026-10-25: one automatic restart after a stall, with a notice |
| Honest export progress: no fake 99 %, show the reason when it fails and a lower-resolution retry button | H2 | S | replica-build | done 2026-10-25: error screen offers the next lower supported resolution |
| Everything on the device: captions (whisper.cpp), background removal, tracking run locally; no upload | H4 | S | replica-launch (say it), replica-backend (keep it true) | already true; the optional image generator talks only to the user's own server |
| Light mode for big projects: lower preview resolution automatically, warn before memory runs out | H3 | M | replica-build | partial: preview quality setting and lower preview resolution for multi-lane projects |

## The angle

1. **For people who were pushed to pay for what used to be free**, Kurgu keeps every export
   resolution, frame rate and core tool free, with no watermark and no account.
   Evidence: H1, several independent secondary sources (no verbatim count).
2. **For creators whose footage must not leave the phone**, Kurgu does captions, cut-outs and
   tracking on the device.
   Evidence: H4, thin and partisan.
3. **For people whose exports die at the last step**, Kurgu checks its own output and recovers from
   a stall instead of hanging at 99 %.
   Evidence: H2, medium. Only honest to claim once the automatic restart is built and measured on
   phones.

**Recommended: 1**, with 2 as the supporting promise. Never use CapCut's name in Kurgu's name, ads or
store listing; a comparison page is a question for a lawyer.

Next: `/replica-brand`.
