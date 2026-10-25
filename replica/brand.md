# Brand: Kurgu

Date: 2026-10-25

## Name

**Kurgu** stays: it is the user's chosen name, already in the app, the package (`app.kurgu.editor`)
and the docs. It is the ordinary Turkish word for film editing / montage (and "fiction"), so it says
what the app does to its main audience. It shares no sound, look or meaning with the reference app.

Risks to keep in mind: a common dictionary word is weak as a trademark on its own (descriptive in
Turkish for this category), and other products may already use it.

| check | result |
| --- | --- |
| web search "Kurgu" video editor app Android Google Play | run 2026-10-25 (search tool summary): no app named Kurgu found in the results. Not proof of absence |
| Google Play / App Store exact name | to run (on the phone) |
| Türk Patent (turkpatent.gov.tr), classes 9 and 42 | to run |
| EUIPO / TMview | to run |
| USPTO, WIPO Global Brand Database | to run |
| domain (kurgu.app, kurgu.com.tr, getkurgu.com) | to run (whois is blocked from this session) |
| handles (X, Instagram, TikTok, GitHub) | to run |

These are screening checks, not legal clearance. Before spending money on the name, a trademark lawyer
should search it properly, especially in Türkiye.

## Palette

Own palette in `kurgu/src/theme.js` and `replica/design/tokens.json`: violet primary `#8B6CFF`, pink
secondary `#FF7EB6`, dark neutrals. The reference app's look is black / white with a cyan export
button (`#00C8DF`, measured from the user's recording). On 2026-10-25 Kurgu's secondary accent moved
from teal `#2EE6C9` (same colour family as that cyan) to pink, so no part of the palette sits next to
the reference's signature colour. Contrast check: 23 pairs, 0 AA failures.

## Logo

The existing mark is Kurgu's own: a rounded "K" monogram, white stem and two gradient arms on near
black. The arms' gradient now runs violet → pink (was violet → teal), recoloured in `assets/icon.png`,
`adaptive-icon.png`, `splash-icon.png`, `favicon.png`. It shares no shape, colour pair or letterform
trick with the reference's mark.

Brief for a final version (designer or image model):
- idea: two clips meeting at a cut, drawn as the arms of a K
- mark type: monogram plus wordmark "Kurgu"
- must read at 16 px and as a 1024 px icon with no transparency
- deliverables: SVG, 1024 × 1024 icon, Android adaptive foreground / background, favicon set, 1200 × 630 social image
- check it side by side with the reference's logo before use

## Voice

Plain, warm, exact.
- plain, not childish: everyday Turkish, no anglicisms when a Turkish word exists ("Dışa aktar", not "Export et")
- warm, not chatty: one short sentence, no exclamation marks in errors
- exact, not technical: say what happened and what to do; codes only as a small second line

| do | don't |
| --- | --- |
| "Dışa aktarma takıldı; baştan bir kez daha deneniyor…" | "Hata oluştu!" |
| "720p ile yeniden dene" | "Lütfen ayarları değiştirip tekrar deneyiniz." |
| "Altyazılar telefonda oluşturulur, hiçbir şey yüklenmez." | "Gizliliğiniz bizim için önemlidir." |
| "Ses kapalı" | "Klip sesi devre dışı bırakıldı." |
| "Bu modu telefon desteklemiyor; en yakın moda inildi." | "Desteklenmeyen kodlayıcı yapılandırması." |

The new strings written today (export retry, lower resolution, beats, curves, clip animations, caption
styles, background image) follow this voice in TR, EN and AR.

## Sweep

`replica/brand.json` lists the reference's name, company, domains and colour. `sweep.py . --config
replica/brand.json`: **clean** on 2026-10-25 after
- code comments and docs said the reference's name: they now say "referans uygulama / referans kayıt";
  product research links moved from `kurgu/RESEARCH_AND_LICENSES.md` to `replica/recon.md`;
- six stale sub-agent worktrees under `.claude/worktrees` (clean, their branches kept) were removed.

`replica/` is planning material and keeps the reference's name on purpose; it is never shipped.
