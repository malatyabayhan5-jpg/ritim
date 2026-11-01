"""Ortam kontrolü: her bileşeni gerçekten çalıştırarak test eder. Çalışmayanı çalışıyor göstermez."""
from __future__ import annotations

import importlib
import shutil
import sys

from .util import MODELS_DIR, run

NEEDED_FILTERS = ["lut3d", "vignette", "tmix", "zoompan", "framerate", "loudnorm", "ebur128", "blackdetect",
                  "freezedetect", "silencedetect", "drawtext", "tpad", "scale", "crop", "fade"]
MODELS = ["face_detection_yunet_2023mar.onnx", "face_recognition_sface_2021dec.onnx"]


def check(network: bool = True, cookies: str | None = None) -> list[dict]:
    res = []

    def add(name, status, detail, fix=""):
        res.append({"bileşen": name, "durum": status, "ayrıntı": detail, "çözüm": fix})

    v = sys.version_info
    add("Python", "OK" if v >= (3, 10) else "EKSİK", f"{v.major}.{v.minor}.{v.micro}", "Python 3.10+ kur")
    for b in ("ffmpeg", "ffprobe"):
        p = shutil.which(b)
        add(b, "OK" if p else "EKSİK", p or "bulunamadı", "ffmpeg kur (apt/brew/winget)")
    if shutil.which("ffmpeg"):
        out = run(["ffmpeg", "-hide_banner", "-filters"], check=False).stdout
        have = {line.split()[1] for line in out.splitlines() if len(line.split()) > 2 and line.startswith(" ")}
        miss = [f for f in NEEDED_FILTERS if f not in have]
        add("ffmpeg filtreleri", "OK" if not miss else "EKSİK", "tamam" if not miss else f"eksik: {miss}",
            "drawtext için libfreetype'lı tam ffmpeg sürümü kur")
        enc = run(["ffmpeg", "-hide_banner", "-encoders"], check=False).stdout
        add("libx264", "OK" if "libx264" in enc else "EKSİK", "", "GPL ffmpeg sürümü kur")
    for mod, pipname in (("numpy", "numpy"), ("cv2", "opencv-python-headless"), ("yt_dlp", "yt-dlp")):
        try:
            m = importlib.import_module(mod)
            add(mod, "OK", getattr(m, "__version__", "") or getattr(getattr(m, "version", None), "__version__", ""))
        except ImportError:
            add(mod, "EKSİK", "import edilemedi", f"pip install {pipname}")
    for m in MODELS:
        p = MODELS_DIR / m
        add(f"model {m.split('_')[1]}", "OK" if p.exists() else "EKSİK", str(p) if p.exists() else "yok",
            "kurulum.sh modelleri indirir")
    try:
        from .features import FaceTools
        ft = FaceTools()
        add("yüz tespiti/tanıma", "OK" if ft.available and ft.recognizer else "EKSİK",
            "YuNet + SFace yüklendi" if ft.available and ft.recognizer else (ft.reason or "SFace yok"))
    except Exception as e:  # pragma: no cover
        add("yüz tespiti/tanıma", "HATA", str(e)[:200])
    du = shutil.disk_usage(".")
    add("disk", "OK" if du.free > 10e9 else "UYARI", f"{du.free / 1e9:.0f} GB boş", "en az 10 GB boş alan önerilir")
    if network:
        try:
            from .fetch import search
            r = search("Leandro Trossard", per_query=2, cookies=cookies, extra_queries=[])
            add("internet araması (YouTube)", "OK", f"test araması {len(r)} sonuç döndürdü")
        except Exception as e:
            add("internet araması (YouTube)", "ENGELLİ", str(e)[:300],
                "README → 'İndirme engeli' bölümü")
    return res


def print_report(res: list[dict]) -> bool:
    w = max(len(r["bileşen"]) for r in res)
    ok = True
    for r in res:
        if r["durum"] not in ("OK", "UYARI"):
            ok = False
        line = f"{r['durum']:8s} {r['bileşen']:<{w}}  {r['ayrıntı']}"
        if r["durum"] != "OK" and r["çözüm"]:
            line += f"\n{'':8s} {'':<{w}}  → {r['çözüm']}"
        print(line)
    return ok
