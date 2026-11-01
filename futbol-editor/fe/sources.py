"""Klip kaynakları: gerçek maç/oyuncu görüntüsü için platform bazlı arama.

Stok video siteleri (Pexels, Pixabay, Mixkit vb.) bilerek desteklenmez ve sonuçlardan elenir.

Sağlayıcılar ve gerçek yetenekleri:
  youtube_api   YouTube Data API v3 araması (YT_API_KEY gerekir). Lisans/kanal/çözünürlük bilgisi verir.
  youtube       yt-dlp ile YouTube araması (anahtar gerekmez, youtube.com erişimi gerekir).
  channels      Resmî kulüp/lig/yayıncı kanallarının içinde arama (yt-dlp, kanal adresleri config'den
                ya da aramada bulunan resmî kanallardan).
  tiktok        TikTok hashtag sayfaları (yt-dlp tiktok:tag; TikTok'un arama API'si yok).
  instagram     Instagram hashtag sayfaları (yt-dlp instagram:tag; pratikte giriş çerezi ister).
  google        Google Programmable Search (Custom Search JSON API; GOOGLE_API_KEY + GOOGLE_CSE_ID).
                X, Instagram, TikTok ve YouTube'daki gönderi adreslerini bulur.
  urls          Kullanıcının verdiği gönderi adresleri (X/Instagram/TikTok/YouTube).
X (Twitter) için doğrudan arama yoktur: X API araması ücretli erişim ister. X gönderileri
'google' sağlayıcısı ya da 'urls' ile bulunur, yt-dlp ile indirilir.
"""
from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field

from .util import fold

# ------------------------------------------------------------------ kurallar
STOCK_DOMAINS = ("pexels.com", "pixabay.com", "mixkit.co", "videvo.net", "coverr.co", "storyblocks.com",
                 "shutterstock.com", "istockphoto.com", "gettyimages.", "stock.adobe.com", "pond5.com",
                 "envato.com", "videezy.com", "dissolve.com", "artgrid.io", "motionarray.com")

EXCLUDE = re.compile(
    r"\b(fifa ?\d*|fc ?2[4-9]|fc mobile|efootball|pes ?20\d\d|career mode|gameplay|ultimate team|dream league|"
    r"reaction|tepki|edit|lyrics|podcast|press conference|basın toplantısı|interview|röportaj|prediction|"
    r"tutorial|ai generated|stock footage)\b", re.I)

# Kategori → arama kalıpları. {p}=oyuncu, {club}=kulüp/milli takım (config: clubs)
CATEGORIES = {
    "yakin_plan": ["{p} close up", "{p} 4K scenepack", "{p} tunnel cam", "{p} 4K clips"],
    "gol_asist": ["{p} all goals", "{p} goals and assists", "{p} goal {club}"],
    "calim": ["{p} skills dribbles", "{p} dribbling", "{p} skills {club}"],
    "kosu_mucadele": ["{p} every touch", "{p} duels", "{p} sprint speed"],
    "sevinc": ["{p} celebration", "{p} goal celebration"],
    "antrenman": ["{p} training", "{club} training {p}"],
    "farkli_aci": ["{p} player cam", "{p} tactical cam", "{p} behind the scenes", "{p} pitchside"],
}
CATEGORY_WORDS = {  # Google/hashtag aramaları için kısa terimler
    "yakin_plan": "close up", "gol_asist": "goal", "calim": "skills", "kosu_mucadele": "every touch",
    "sevinc": "celebration", "antrenman": "training", "farkli_aci": "player cam",
}
# Resmî kanal ipuçları (kanal adında geçerse resmî sayılır; kulüpler config'den eklenir)
OFFICIAL_HINTS = ["premier league", "uefa", "champions league", "europa league", "laliga", "bundesliga",
                  "serie a", "ligue 1", "fifa", "bein sports", "tnt sports", "sky sports", "dazn", "espn",
                  "cbs sports", "nbc sports", "optus sport", "canal+", "movistar", "eredivisie", "pro league",
                  "fa cup", "carabao cup", "conference league", "nations league"]


@dataclass
class Candidate:
    url: str
    title: str
    platform: str
    provider: str
    category: str
    query: str
    channel: str | None = None
    duration: float | None = None
    license: str | None = None
    hd: bool | None = None
    official: bool = False
    score: float = 0.0
    extra: dict = field(default_factory=dict)


class ProviderError(Exception):
    def __init__(self, status: str, message: str):
        super().__init__(message)
        self.status = status  # ENGELLİ / ANAHTAR YOK / GİRİŞ GEREKLİ / DESTEKLENMİYOR / HATA


# ------------------------------------------------------------- yardımcılar
def platform_of(url: str) -> str:
    h = urllib.parse.urlparse(url).netloc.lower()
    for key, name in (("youtube.com", "youtube"), ("youtu.be", "youtube"), ("tiktok.com", "tiktok"),
                      ("instagram.com", "instagram"), ("x.com", "x"), ("twitter.com", "x")):
        if key in h:
            return name
    return h or "bilinmiyor"


def is_stock(url: str) -> bool:
    h = urllib.parse.urlparse(url).netloc.lower()
    return any(d in h for d in STOCK_DOMAINS)


def is_official(channel: str | None, clubs: list[str]) -> bool:
    c = fold(channel or "")
    return bool(c) and any(fold(h) in c for h in OFFICIAL_HINTS + clubs)


def expand_queries(player: str, clubs: list[str]) -> list[tuple[str, str]]:
    out = []
    for cat, tmpls in CATEGORIES.items():
        for t in tmpls:
            if "{club}" in t:
                out += [(cat, t.format(p=player, club=c)) for c in clubs]
            else:
                out.append((cat, t.format(p=player)))
    return out


def hashtags(player: str, clubs: list[str]) -> list[str]:
    parts = fold(player).split()
    full = "".join(parts)
    tags = [full, parts[-1]] + [parts[-1] + re.sub(r"[^a-z0-9]", "", fold(c)) for c in clubs]
    return list(dict.fromkeys(t for t in tags if len(t) >= 4))


def title_ok(title: str, player: str) -> bool:
    return fold(player.split()[-1]) in fold(title) and not EXCLUDE.search(title)


def classify_error(msg: str) -> ProviderError:
    m = msg.lower()
    if ("403" in m and ("tunnel" in m or "proxy" in m)) or "connect_rejected" in m:
        return ProviderError("ENGELLİ", "Ağ politikası bu siteye erişimi engelliyor (proxy 403).")
    if "sign in to confirm" in m or "not a bot" in m:
        return ProviderError("GİRİŞ GEREKLİ", "YouTube bot doğrulaması istiyor → --cookies cookies.txt")
    if "login" in m or "log in" in m or "rate-limit" in m or "authentication" in m or "cookies" in m:
        return ProviderError("GİRİŞ GEREKLİ", "Platform giriş yapılmış oturum istiyor → --cookies cookies.txt")
    if "private" in m:
        return ProviderError("HATA", "Video gizli.")
    if "not available in your country" in m or "geo" in m:
        return ProviderError("HATA", "Bölge kısıtlaması.")
    if "unsupported url" in m:
        return ProviderError("DESTEKLENMİYOR", "yt-dlp bu adresi desteklemiyor.")
    if "timed out" in m or "name or service not known" in m or "getaddrinfo" in m:
        return ProviderError("ENGELLİ", "İnternete erişilemiyor (DNS/zaman aşımı).")
    return ProviderError("HATA", msg.strip()[:300])


def _http_json(url: str, timeout: int = 20) -> dict:
    try:
        with urllib.request.urlopen(url, timeout=timeout) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="ignore")
        try:
            msg = json.loads(body)["error"]["message"]
        except Exception:
            msg = body[:200]
        if e.code in (400, 401, 403) and ("key" in msg.lower() or "unregistered" in msg.lower()):
            raise ProviderError("ANAHTAR YOK", f"API anahtarı geçersiz/eksik: {msg}") from e
        if e.code == 403 and "quota" in msg.lower():
            raise ProviderError("HATA", f"API kotası doldu: {msg}") from e
        raise ProviderError("HATA", f"HTTP {e.code}: {msg}") from e
    except urllib.error.URLError as e:
        raise classify_error(str(e)) from e


class _QuietLogger:
    def debug(self, msg):
        pass

    info = warning = error = debug


def _ydl(cookies: str | None = None, **kw):
    import yt_dlp
    opts = {"quiet": True, "no_warnings": True, "socket_timeout": 20, "logger": _QuietLogger(), **kw}
    if cookies:
        opts["cookiefile"] = cookies
    return yt_dlp.YoutubeDL(opts)


def _iso_dur(s: str) -> float:
    m = re.fullmatch(r"P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", s or "")
    if not m:
        return 0.0
    d, h, mi, se = (int(x or 0) for x in m.groups())
    return d * 86400 + h * 3600 + mi * 60 + se


# ------------------------------------------------------------- sağlayıcılar
def youtube_api(player, clubs, per_query, cookies=None, cc_only=False, max_queries=None, **_):
    key = os.environ.get("YT_API_KEY")
    if not key:
        raise ProviderError("ANAHTAR YOK", "YT_API_KEY ortam değişkeni yok (Google Cloud → YouTube Data API v3).")
    found = {}
    for cat, q in expand_queries(player, clubs)[:max_queries]:
        params = {"part": "snippet", "type": "video", "q": q, "maxResults": min(per_query, 50), "key": key,
                  "videoEmbeddable": "any", "safeSearch": "none"}
        if cc_only:
            params["videoLicense"] = "creativeCommon"
        d = _http_json("https://www.googleapis.com/youtube/v3/search?" + urllib.parse.urlencode(params))
        for it in d.get("items", []):
            vid = it["id"].get("videoId")
            sn = it["snippet"]
            if vid and vid not in found and title_ok(sn["title"], player):
                found[vid] = Candidate(f"https://www.youtube.com/watch?v={vid}", sn["title"], "youtube",
                                       "youtube_api", cat, q, channel=sn.get("channelTitle"),
                                       official=is_official(sn.get("channelTitle"), clubs),
                                       extra={"channel_url": f"https://www.youtube.com/channel/{sn.get('channelId')}"})
    ids = list(found)
    for i in range(0, len(ids), 50):  # süre, HD ve lisans bilgisi
        d = _http_json("https://www.googleapis.com/youtube/v3/videos?" + urllib.parse.urlencode(
            {"part": "contentDetails,status", "id": ",".join(ids[i:i + 50]), "key": key}))
        for it in d.get("items", []):
            c = found[it["id"]]
            c.duration = _iso_dur(it["contentDetails"].get("duration"))
            c.hd = it["contentDetails"].get("definition") == "hd"
            c.license = "creativeCommon" if it["status"].get("license") == "creativeCommon" else "youtube"
    return list(found.values())


def youtube_search(player, clubs, per_query, cookies=None, max_queries=None, **_):
    out, seen = [], set()
    with _ydl(cookies, extract_flat=True, skip_download=True) as ydl:
        for cat, q in expand_queries(player, clubs)[:max_queries]:
            try:
                info = ydl.extract_info(f"ytsearch{per_query}:{q}", download=False)
            except Exception as e:
                raise classify_error(str(e)) from e
            for e in info.get("entries") or []:
                vid, title = e.get("id"), e.get("title") or ""
                if not vid or vid in seen or not title_ok(title, player):
                    continue
                seen.add(vid)
                out.append(Candidate(e.get("url") or f"https://www.youtube.com/watch?v={vid}", title, "youtube",
                                     "youtube", cat, q, channel=e.get("channel"), duration=e.get("duration"),
                                     official=is_official(e.get("channel"), clubs),  # doğrulanmış rozet ≠ resmî
                                     extra={"channel_url": e.get("channel_url"),
                                            "verified": bool(e.get("channel_is_verified"))}))
    return out


def channel_search(player, clubs, per_query, cookies=None, channels=None, discovered=None, **_):
    """Resmî kanalların kendi içinde arama: https://www.youtube.com/@kanal/search?query=<oyuncu>"""
    targets = list(dict.fromkeys((channels or []) + (discovered or [])))
    if not targets:
        raise ProviderError("ATLANDI", "Resmî kanal yok: config.json → official_channels (ör. '@kanaladi') "
                                              "ya da önce youtube araması resmî kanal bulmalı.")
    out = []
    with _ydl(cookies, extract_flat=True, skip_download=True, playlistend=per_query * 3) as ydl:
        for ch in targets:
            base = ch if ch.startswith("http") else f"https://www.youtube.com/{ch if ch.startswith(('@', 'channel/')) else '@' + ch}"
            try:
                info = ydl.extract_info(f"{base.rstrip('/')}/search?query={urllib.parse.quote(player)}", download=False)
            except Exception as e:
                raise classify_error(str(e)) from e
            for e in info.get("entries") or []:
                title = e.get("title") or ""
                if e.get("id") and title_ok(title, player):
                    cat = next((c for c, w in CATEGORY_WORDS.items() if w.split()[0] in title.lower()), "gol_asist")
                    out.append(Candidate(e.get("url") or f"https://www.youtube.com/watch?v={e['id']}", title,
                                         "youtube", "channels", cat, f"kanal:{ch}", channel=info.get("channel") or ch,
                                         duration=e.get("duration"), official=True))
    return out


def _tag_pages(kind, player, clubs, per_query, cookies):
    base = {"tiktok": "https://www.tiktok.com/tag/{}", "instagram": "https://www.instagram.com/explore/tags/{}/"}[kind]
    out = []
    with _ydl(cookies, extract_flat=True, skip_download=True, playlistend=per_query * 2) as ydl:
        for tag in hashtags(player, clubs):
            try:
                info = ydl.extract_info(base.format(tag), download=False)
            except Exception as e:
                raise classify_error(str(e)) from e
            for e in info.get("entries") or []:
                url = e.get("url") or e.get("webpage_url")
                if url:
                    out.append(Candidate(url, e.get("title") or e.get("description") or f"#{tag}", kind, kind,
                                         "farkli_aci", f"#{tag}", channel=e.get("uploader") or e.get("channel"),
                                         duration=e.get("duration")))
    return out


def tiktok(player, clubs, per_query, cookies=None, **_):
    return _tag_pages("tiktok", player, clubs, per_query, cookies)


def instagram(player, clubs, per_query, cookies=None, **_):
    if not cookies:
        raise ProviderError("GİRİŞ GEREKLİ", "Instagram hashtag sayfaları giriş ister → --cookies cookies.txt")
    return _tag_pages("instagram", player, clubs, per_query, cookies)


def google(player, clubs, per_query, cookies=None, max_queries=None, **_):
    key, cx = os.environ.get("GOOGLE_API_KEY"), os.environ.get("GOOGLE_CSE_ID")
    if not key or not cx:
        raise ProviderError("ANAHTAR YOK", "GOOGLE_API_KEY ve GOOGLE_CSE_ID gerekli (Programmable Search Engine).")
    out, seen = [], set()
    pairs = [(site, cat, word) for site in ("x.com", "instagram.com", "tiktok.com", "youtube.com")
             for cat, word in CATEGORY_WORDS.items()][:max_queries]
    for site, cat, word in pairs:
        q = f'"{player}" {word} video'
        d = _http_json("https://customsearch.googleapis.com/customsearch/v1?" + urllib.parse.urlencode(
            {"key": key, "cx": cx, "q": q, "siteSearch": site, "num": min(per_query, 10)}))
        for it in d.get("items", []):
            url = it.get("link", "")
            # yalnızca tekil gönderi/video adresleri (profil ya da arama sayfası değil)
            if url in seen or is_stock(url) or not re.search(r"/(status|reel|p|video|watch|shorts)\b", url):
                continue
            if fold(player.split()[-1]) not in fold(it.get("title", "") + " " + it.get("snippet", "")):
                continue
            seen.add(url)
            out.append(Candidate(url, it.get("title", url), platform_of(url), "google", cat, f"{q} site:{site}",
                                 channel=it.get("displayLink")))
    return out


PROVIDERS = {"youtube_api": youtube_api, "youtube": youtube_search, "channels": channel_search,
             "tiktok": tiktok, "instagram": instagram, "google": google}
DEFAULT_PROVIDERS = ["youtube_api", "youtube", "channels", "tiktok", "instagram", "google"]


def permission(c: Candidate) -> str:
    """İndirilen klibin yeniden kullanım durumu (hukuki tavsiye değildir)."""
    if c.license == "creativeCommon":
        return "Creative Commons (YouTube CC BY): atıf ile yeniden kullanım izinli"
    if c.official:
        return "Resmî kurum içeriği: telif hak sahibinde, yeniden yayın izni yok"
    if c.platform == "youtube":
        return "Standart YouTube lisansı: yeniden yayın izni yok"
    return f"{c.platform} gönderisi: hak sahibi yükleyen/yayıncı, yeniden yayın izni yok"


def rank(cands: list[Candidate]) -> list[Candidate]:
    for c in cands:
        s = 0.0
        s += 1.0 if c.official else 0.0
        s += 0.6 if c.hd else 0.0
        s += 0.4 if c.license == "creativeCommon" else 0.0
        if c.duration:
            s += 0.5 if 30 <= c.duration <= 900 else (-1.0 if c.duration > 1800 else 0.0)
        s += 0.3 if re.search(r"4k|1080|hd", c.title, re.I) else 0.0
        s += 0.3 if c.platform == "youtube" else 0.0  # yatay ve yüksek çözünürlük olasılığı yüksek
        c.score = round(s, 2)
    return sorted(cands, key=lambda c: -c.score)


def diversify(cands: list[Candidate], n: int) -> list[Candidate]:
    """Kategoriler arasında sırayla seçer: her görüntü türünden kaynak gelsin."""
    by_cat: dict[str, list] = {}
    for c in cands:
        by_cat.setdefault(c.category, []).append(c)
    out = []
    while len(out) < n and any(by_cat.values()):
        for cat in list(by_cat):
            if by_cat[cat] and len(out) < n:
                out.append(by_cat[cat].pop(0))
    return out
