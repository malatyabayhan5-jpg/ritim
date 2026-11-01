"""2-3. adım: gerçek oyuncu görüntülerini platformlarda arar, sıralar ve 01_FOOTAGE'a indirir.

Stok video siteleri kullanılmaz. Her platformun erişim durumu açıkça raporlanır (kaynak_raporu.md).
"""
from __future__ import annotations

import re
import shutil
from dataclasses import asdict
from pathlib import Path

from . import sources as S
from .util import FEError, log, probe, save_json

VIDEO_EXT = {".mp4", ".mkv", ".webm", ".mov", ".m4v"}


def _key(url: str) -> str:
    m = re.search(r"(?:v=|youtu\.be/|shorts/)([\w-]{11})", url)
    return f"yt:{m.group(1)}" if m else url.split("?")[0].rstrip("/")


def discover(player: str, clubs: list[str], providers: list[str], per_query: int = 8, cookies: str | None = None,
             channels: list[str] | None = None, cc_only: bool = False):
    """Sağlayıcıları sırayla çalıştırır. Dönüş: (adaylar, platform durum tablosu)."""
    status, cands = [], []
    discovered: list[str] = []
    order = [p for p in S.DEFAULT_PROVIDERS if p in providers]
    for name in order:
        fn = S.PROVIDERS[name]
        try:
            kw = {"cookies": cookies}
            if name == "youtube_api":
                kw["cc_only"] = cc_only
            if name == "channels":
                kw.update(channels=channels, discovered=discovered[:6])
            found = fn(player, clubs, per_query, **kw)
            found = [c for c in found if not S.is_stock(c.url)]
            cands += found
            if name in ("youtube_api", "youtube"):
                discovered += [c.extra.get("channel_url") for c in found if c.official and c.extra.get("channel_url")]
                discovered = list(dict.fromkeys(discovered))
            status.append({"kaynak": name, "durum": "OK", "ayrıntı": f"{len(found)} aday"})
            log(f"  {name}: {len(found)} aday")
        except S.ProviderError as e:
            status.append({"kaynak": name, "durum": e.status, "ayrıntı": str(e)})
            log(f"  {name}: {e.status} → {e}")
        except ImportError:
            status.append({"kaynak": name, "durum": "EKSİK", "ayrıntı": "yt-dlp kurulu değil"})
    uniq = {}
    for c in cands:
        k = _key(c.url)
        if k not in uniq or (c.official and not uniq[k].official) or (c.license and not uniq[k].license):
            uniq[k] = c
    return S.rank(list(uniq.values())), status


def download(cands: list[S.Candidate], dest: Path, max_videos: int, max_height: int = 1080,
             cookies: str | None = None):
    got, errors, blocked_platforms = [], [], {}
    with S._ydl(cookies, retries=3, noplaylist=True, outtmpl=str(dest / "%(extractor_key)s_%(id)s.%(ext)s"),
                format=f"bv*[height<={max_height}][vcodec!*=av01]/bv*[height<={max_height}]/b[height<={max_height}]/b") as ydl:
        for c in cands:
            if len(got) >= max_videos:
                break
            if c.platform in blocked_platforms:
                errors.append({"url": c.url, "platform": c.platform, "durum": blocked_platforms[c.platform][0],
                               "hata": "platform engelli, denenmedi"})
                continue
            try:
                info = ydl.extract_info(c.url, download=True)
                path = Path(ydl.prepare_filename(info))
                if not path.exists():
                    cand = sorted(dest.glob(f"*{info.get('id')}.*"))
                    path = cand[0] if cand else path
                meta = probe(path)
                got.append({**asdict(c), "file": str(path), "width": meta.get("width"), "height": meta.get("height"),
                            "fps": meta.get("fps"), "uploader": info.get("uploader"),
                            "license": c.license or info.get("license"), "izin": S.permission(c)})
                log(f"  indirildi [{c.platform}/{c.category}] {c.title[:60]} ({meta.get('height')}p)")
            except Exception as e:
                pe = S.classify_error(str(e))
                errors.append({"url": c.url, "platform": c.platform, "durum": pe.status, "hata": str(pe)})
                log(f"  indirilemedi [{c.platform}] {c.title[:50]} → {pe.status}: {pe}")
                if pe.status in ("ENGELLİ", "GİRİŞ GEREKLİ"):
                    blocked_platforms[c.platform] = (pe.status, str(pe))
    return got, errors, blocked_platforms


def ingest_local(folder: Path, dest: Path) -> list[dict]:
    items = []
    for p in sorted(Path(folder).rglob("*")):
        if p.suffix.lower() in VIDEO_EXT:
            target = dest / p.name
            if not target.exists():
                shutil.copy2(p, target)
            items.append({"file": str(target), "url": None, "title": p.name, "platform": "yerel",
                          "category": "bilinmiyor", "izin": "kullanıcı sağladı"})
    return items


def write_report(path: Path, m: dict) -> None:
    L = [f"# Kaynak raporu: {m['player']}", ""]
    L += ["## Platform erişimi", "", "| Kaynak | Durum | Ayrıntı |", "|---|---|---|"]
    L += [f"| {s['kaynak']} | {s['durum']} | {s['ayrıntı']} |" for s in m["platforms"]]
    if m.get("blocked_downloads"):
        L += ["", "**İndirme engeli:** " + "; ".join(f"{k}: {v[1]}" for k, v in m["blocked_downloads"].items())]
    L += ["", f"## Bulunan adaylar ({len(m['candidates'])})", "",
          "| # | Platform | Kategori | Resmî | Lisans | Puan | Başlık |", "|---|---|---|---|---|---|---|"]
    for i, c in enumerate(m["candidates"][:60], 1):
        L.append(f"| {i} | {c['platform']} | {c['category']} | {'✓' if c['official'] else ''} | "
                 f"{c.get('license') or '-'} | {c['score']} | [{c['title'][:60]}]({c['url']}) |")
    L += ["", f"## İndirilenler ({len(m['items'])})", "", "| Dosya | Platform | Kategori | Çözünürlük | İzin durumu |",
          "|---|---|---|---|---|"]
    L += [f"| {Path(it['file']).name} | {it.get('platform')} | {it.get('category')} | {it.get('height') or '-'}p | "
          f"{it.get('izin')} |" for it in m["items"]]
    if m["errors"]:
        L += ["", f"## İndirilemeyenler ({len(m['errors'])})", ""]
        L += [f"- [{e['platform']}] {e['durum']}: {e['hata']} — {e['url']}" for e in m["errors"][:40]]
    L += ["", "> İzin durumu bilgilendirme amaçlıdır, hukuki tavsiye değildir. Yayın hakkı kontrolü kullanıcıya aittir."]
    path.write_text("\n".join(L) + "\n")


def fetch(paths: dict, player: str, max_videos: int = 12, cookies: str | None = None,
          urls: list[str] | None = None, local: Path | None = None, clubs: list[str] | None = None,
          providers: list[str] | None = None, channels: list[str] | None = None, cc_only: bool = False,
          per_query: int = 8) -> dict:
    dest = paths["footage"]
    clubs = clubs or []
    m = {"player": player, "clubs": clubs, "platforms": [], "candidates": [], "items": [], "errors": [],
         "blocked_downloads": {}}
    if local:
        m["items"] += ingest_local(local, dest)
        log(f"Yerel klasörden {len(m['items'])} video alındı")
    cands = []
    if urls:
        cands += [S.Candidate(u, u, S.platform_of(u), "urls", "bilinmiyor", "kullanıcı URL") for u in urls
                  if not S.is_stock(u)]
        m["platforms"].append({"kaynak": "urls", "durum": "OK", "ayrıntı": f"{len(cands)} adres"})
    if providers:
        log(f"Gerçek oyuncu görüntüsü aranıyor: {player} (kulüpler: {', '.join(clubs) or '-'})")
        found, status = discover(player, clubs, providers, per_query, cookies, channels, cc_only)
        cands += S.diversify(found, max(max_videos * 3, 30))
        m["platforms"] += status
    m["candidates"] = [asdict(c) for c in cands]
    if cands:
        got, errors, blocked = download(cands, dest, max_videos, cookies=cookies)
        m["items"] += got
        m["errors"] += errors
        m["blocked_downloads"] = blocked
    save_json(paths["manifest"], m)
    report = paths["root"] / "06_PROJECT_FILES" / "kaynak_raporu.md"
    write_report(report, m)
    log(f"manifest.json + kaynak_raporu.md: {len(cands)} aday, {len(m['items'])} indirilen, {len(m['errors'])} hata")
    if not m["items"]:
        reasons = [f"{s['kaynak']}: {s['durum']}" for s in m["platforms"] if s["durum"] != "OK"]
        reasons += [f"indirme/{k}: {v[0]}" for k, v in m["blocked_downloads"].items()]
        raise FEError("Hiç klip indirilemedi. " + ("; ".join(reasons) or "Aday bulunamadı.") +
                      f"\nAyrıntı: {report}")
    return m
