"""Ortak yardımcılar: komut çalıştırma, ffprobe, kare okuma, proje klasörü."""
from __future__ import annotations

import json
import re
import shutil
import subprocess
import unicodedata
from pathlib import Path

import numpy as np

PKG_DIR = Path(__file__).resolve().parent
ROOT_DIR = PKG_DIR.parent
MODELS_DIR = ROOT_DIR / "models"

PROJECT_DIRS = [
    "01_FOOTAGE", "02_AUDIO", "03_MUSIC", "04_GRAPHICS", "05_IMAGES",
    "06_PROJECT_FILES", "07_PROXIES", "08_EXPORTS", "09_ARCHIVE",
]


class FEError(RuntimeError):
    """Kullanıcıya olduğu gibi gösterilecek hata."""


def log(msg: str) -> None:
    print(f"[fe] {msg}", flush=True)


def run(cmd, check: bool = True) -> subprocess.CompletedProcess:
    cmd = [str(c) for c in cmd]
    p = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if check and p.returncode != 0:
        raise FEError(f"Komut başarısız ({p.returncode}): {' '.join(cmd)[:400]}\n{p.stderr[-2000:]}")
    return p


def need_binary(name: str) -> str:
    path = shutil.which(name)
    if not path:
        raise FEError(f"'{name}' bulunamadı. Kurulum: README.md → Kurulum.")
    return path


def _ratio(s: str) -> float:
    num, _, den = (s or "0/1").partition("/")
    den_f = float(den or 1)
    return float(num) / den_f if den_f else 0.0


def probe(path) -> dict:
    p = run(["ffprobe", "-v", "error", "-show_entries",
             "format=duration:stream=codec_type,codec_name,width,height,r_frame_rate,avg_frame_rate,sample_rate,channels",
             "-of", "json", path])
    d = json.loads(p.stdout)
    v = next((s for s in d.get("streams", []) if s["codec_type"] == "video"), None)
    a = next((s for s in d.get("streams", []) if s["codec_type"] == "audio"), None)
    info = {"path": str(path), "duration": float(d.get("format", {}).get("duration", 0) or 0),
            "has_video": v is not None, "has_audio": a is not None}
    if v:
        fps = _ratio(v.get("avg_frame_rate")) or _ratio(v.get("r_frame_rate"))
        info.update(width=int(v["width"]), height=int(v["height"]), fps=round(fps, 3), vcodec=v.get("codec_name"))
    if a:
        info.update(sample_rate=int(a.get("sample_rate") or 0), channels=int(a.get("channels") or 0),
                    acodec=a.get("codec_name"))
    return info


def iter_frames(path, fps: float, width: int, info: dict | None = None):
    """Videoyu ffmpeg ile küçültüp (zaman, RGB uint8 HxWx3) kareleri üretir."""
    info = info or probe(path)
    h = max(2, int(round(info["height"] * width / info["width"] / 2)) * 2)
    cmd = ["ffmpeg", "-v", "error", "-i", str(path), "-an",
           "-vf", f"fps={fps},scale={width}:{h}:flags=area,format=rgb24", "-f", "rawvideo", "-"]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    n = width * h * 3
    i = 0
    try:
        while True:
            buf = proc.stdout.read(n)
            if len(buf) < n:
                break
            yield i / fps, np.frombuffer(buf, np.uint8).reshape(h, width, 3)
            i += 1
    finally:
        proc.stdout.close()
        proc.kill()
        proc.wait()


def grab_frame(path, t: float, width: int = 640) -> np.ndarray | None:
    """Belirli bir andaki tek kareyi RGB olarak döndürür."""
    info = probe(path)
    h = max(2, int(round(info["height"] * width / info["width"] / 2)) * 2)
    p = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{max(0.0, t):.3f}", "-i", str(path), "-frames:v", "1",
                        "-vf", f"scale={width}:{h},format=rgb24", "-f", "rawvideo", "-"],
                       stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    if len(p.stdout) < width * h * 3:
        return None
    return np.frombuffer(p.stdout[: width * h * 3], np.uint8).reshape(h, width, 3)


def slugify(text: str) -> str:
    t = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", t.lower()).strip("-") or "proje"


def fold(text: str) -> str:
    """Aksanları ve büyük/küçük harf farkını kaldırır (başlık eşleştirme için)."""
    return unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower()


def project_paths(root: Path) -> dict:
    root = Path(root)
    for d in PROJECT_DIRS:
        (root / d).mkdir(parents=True, exist_ok=True)
    pf = root / "06_PROJECT_FILES"
    return {
        "root": root,
        "footage": root / "01_FOOTAGE",
        "audio": root / "02_AUDIO",
        "music": root / "03_MUSIC",
        "graphics": root / "04_GRAPHICS",
        "proxies": root / "07_PROXIES",
        "exports": root / "08_EXPORTS",
        "style": pf / "style.json",
        "manifest": pf / "manifest.json",
        "shots": pf / "shots.json",
        "edl": pf / "edl.json",
        "config": pf / "config.json",
        "lut": pf / "grade.cube",
    }


def save_json(path: Path, data) -> None:
    Path(path).write_text(json.dumps(data, ensure_ascii=False, indent=2))


def load_json(path: Path, what: str = ""):
    path = Path(path)
    if not path.exists():
        raise FEError(f"{path} yok. Önce {what or 'önceki adımı'} çalıştır.")
    return json.loads(path.read_text())
