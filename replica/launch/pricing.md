# Pricing: Kurgu

Date: 2026-10-25

## Decision: free, no paid tier at launch

Kurgu has no server, no accounts and no paid features. Everything runs on the phone, so there is
nothing to bill for and nothing to put behind a wall. The angle (`replica/fixes.md`, H1) is exactly
that people were pushed to pay for what used to be free; a paid tier at launch would undercut it.

If money is needed later, the honest options, in order:
1. Voluntary support (one-time in-app purchase, "Destek ol") that unlocks nothing.
2. A paid add-on that costs Kurgu money to run (for example a hosted AI image generator). Today that
   feature only talks to the user's own server, so there is nothing to sell.
3. Never: watermarks, locked resolutions or frame rates, ads in the editor.

## Market reference (secondary, not verified on the vendors' pages)

The pricing pages could not be opened from this session (network policy). These figures come from
web-search summaries and are second-hand; check the real pages before quoting any of them publicly.

| product | what the source says | source | read |
| --- | --- | --- | --- |
| reference app Pro (annual) | rose from about $77 to $179.99 in early 2026 (varies by region) | [PiunikaWeb](https://piunikaweb.com/2026/01/27/capcut-pro-price-increase-100-dollars-outage/), [Newsweek](https://newsweek.com/app-used-millions-nearly-doubles-subscription-price-overnight-11535999) | 2026-10-25 via search |
| reference app Pro (monthly) | about $9.99 → $19.99 in early 2025 | [eesel.ai](https://www.eesel.ai/en/blog/capcut-alternatives) | 2026-10-25 via search |
| VN | strong free tier, no watermark on core exports | same eesel.ai summary | 2026-10-25 via search |

## Billing complaints to avoid

There is no billing, so: no renewals, no cancellation flow, no per-seat jumps. If voluntary support
is ever added, it is a one-time purchase through Google Play with no subscription.

## Stripe

Nothing to create. Google Play Billing would handle a one-time support purchase if it is ever added.
