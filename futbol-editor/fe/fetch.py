"""2-3. adım: hedef oyuncunun kliplerini internette arar ve 01_FOOTAGE'a indirir (yt-dlp)."""
from __future__ import annotations

import re
import shutil
from pathlib import Path

from .util import FEError, fold, log, probe, save_json

QUERIES = [
    "{p} scenepack 4K",
    "{p} 4K clips no watermark",
    "{p} all goals",
    "{p} skills dribbles",
    "{p} goals assists skills",
    "{p} celebration",
    "{p} highlights 1080p",
]
# Video oyunu, tepki, başkasının edit'i, dikey kısa video gibi kullanılamayacak içerikleri ele.
EXCLUDE = re.compile(
    r"\b(fifa|fc ?2[4-9]|fc mobile|efootball|pes ?20\d\d|career mode|gameplay|ultimate team|reaction|tepki|"
    r"edit|tiktok|shorts|ai |lyrics|interview|podcast|press conference|basın toplantısı)\b", re.I)


def _classify_error(msg: str) -> str:
    m = msg.lower()
    if "403" in m and ("tunnel" in m or "proxy" in m):
        return ("AĞ ENGELİ: Bu ortamın ağ politikası YouTube'u engelliyor (proxy 403). Ortam ayarlarında "
                "youtube.com, googlevideo.com, ytimg.com alanlarına izin ver ya da sistemi kendi bilgisayarında çalıştır.")
    if "sign in to confirm" in m or "not a bot" in m:
        return ("BOT DOĞRULAMASI: YouTube bu IP'den giriş istiyor (veri merkezi IP'lerinde sık görülür). "
                "Tarayıcıdan dışa aktarılmış cookies.txt dosyasını --cookies ile ver ya da kendi bilgisayarında çalıştır.")
    if "name or service not known" in m or "getaddrinfo" in m or "timed out" in m:
        return "AĞ HATASI: İnternete erişilemiyor (DNS/zaman aşımı)."
    return f"İndirme hatası: {msg[:300]}"


class _QuietLogger:
    def debug(self, msg):
        pass

    info = warning = error = debug


def search(player: str, per_query: int = 8, cookies: str | None = None, extra_queries: list[str] | None = None):
    try:
        import yt_dlp
    except ImportError as e:
        raise FEError("yt-dlp kurulu değil (pip install yt-dlp).") from e
    surname = fold(player.split()[-1])
    opts = {"quiet": True, "no_warnings": True, "extract_flat": True, "skip_download": True, "socket_timeout": 20,
            "logger": _QuietLogger()}
    if cookies:
        opts["cookiefile"] = cookies
    seen, results = set(), []
    with yt_dlp.YoutubeDL(opts) as ydl:
        for q in [q.format(p=player) for q in QUERIES] + (extra_queries or []):
            try:
                info = ydl.extract_info(f"ytsearch{per_query}:{q}", download=False)
            except Exception as e:  # yt_dlp.utils.DownloadError
                raise FEError(_classify_error(str(e))) from e
            for e in info.get("entries") or []:
                vid, title = e.get("id"), e.get("title") or ""
                dur = e.get("duration") or 0
                if not vid or vid in seen or surname not in fold(title) or EXCLUDE.search(title):
                    continue
                if dur and not (20 <= dur <= 1500):
                    continue
                seen.add(vid)
                results.append({"id": vid, "title": title, "duration": dur, "channel": e.get("channel"),
                                "url": e.get("url") or f"https://www.youtube.com/watch?v={vid}", "query": q})
    return results


def download(items: list[dict], dest: Path, max_videos: int, max_height: int = 1080, cookies: str | None = None):
    import yt_dlp
    opts = {
        "quiet": True, "no_warnings": True, "socket_timeout": 30, "retries": 3,
        # yalnızca görüntü yeterli: müzik referanstan geliyor
        "format": f"bv*[height<={max_height}][vcodec!*=av01]/bv*[height<={max_height}]/b[height<={max_height}]",
        "outtmpl": str(dest / "%(id)s.%(ext)s"),
        "noplaylist": True, "logger": _QuietLogger(),
    }
    if cookies:
        opts["cookiefile"] = cookies
    got, errors = [], []
    with yt_dlp.YoutubeDL(opts) as ydl:
        for it in items:
            if len(got) >= max_videos:
                break
            try:
                info = ydl.extract_info(it["url"], download=True)
                path = Path(ydl.prepare_filename(info))
                if not path.exists():
                    cand = sorted(dest.glob(f"{info['id']}.*"))
                    path = cand[0] if cand else path
                meta = probe(path)
                got.append({**it, "file": str(path), "width": meta.get("width"), "height": meta.get("height"),
                            "fps": meta.get("fps"), "license": info.get("license"),
                            "uploader": info.get("uploader")})
                log(f"  indirildi: {it['title'][:70]} ({meta.get('height')}p)")
            except Exception as e:
                msg = _classify_error(str(e))
                errors.append({"url": it["url"], "error": msg})
                log(f"  atlandı: {it['title'][:60]} → {msg[:120]}")
                if msg.startswith(("AĞ ENGELİ", "BOT DOĞRULAMASI")):
                    break  # aynı engel her videoda tekrar eder
    return got, errors


def ingest_local(folder: Path, dest: Path) -> list[dict]:
    items = []
    for p in sorted(Path(folder).rglob("*")):
        if p.suffix.lower() in {".mp4", ".mkv", ".webm", ".mov", ".m4v"}:
            target = dest / p.name
            if not target.exists():
                shutil.copy2(p, target)
            items.append({"file": str(target), "url": None, "title": p.name, "query": "yerel"})
    return items


def fetch(paths: dict, player: str, max_videos: int = 12, cookies: str | None = None,
          urls: list[str] | None = None, local: Path | None = None) -> dict:
    dest = paths["footage"]
    manifest = {"player": player, "items": [], "errors": [], "searched": []}
    if local:
        manifest["items"] += ingest_local(local, dest)
        log(f"Yerel klasörden {len(manifest['items'])} video alındı")
    if urls:
        cand = [{"id": None, "title": u, "url": u, "query": "kullanıcı URL"} for u in urls]
    elif not local:
        log(f"İnternette aranıyor: {player}")
        cand = search(player, cookies=cookies)
        manifest["searched"] = [c["title"] for c in cand]
        log(f"{len(cand)} aday video bulundu")
        if not cand:
            raise FEError("Aramada uygun video bulunamadı (başlıkta soyadı geçen, oyun/edit olmayan).")
    else:
        cand = []
    if cand:
        got, errors = download(cand, dest, max_videos, cookies=cookies)
        manifest["items"] += got
        manifest["errors"] += errors
        if not got and errors:
            save_json(paths["manifest"], manifest)
            raise FEError(errors[0]["error"])
    save_json(paths["manifest"], manifest)
    log(f"manifest.json: {len(manifest['items'])} video, {len(manifest['errors'])} hata")
    return manifest
