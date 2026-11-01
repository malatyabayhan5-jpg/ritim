"""Ses analizi: tempo, vuruşlar, ses yüksekliği, sondaki sessizlik."""
from __future__ import annotations

import re
import subprocess
import wave
from pathlib import Path

import numpy as np

from .util import run


def extract_music(src, dst: Path, end: float | None = None, fade_out: float = 0.3) -> Path:
    """Videodaki sesi 48 kHz stereo WAV olarak çıkarır (isteğe bağlı kırpma + yumuşak bitiş)."""
    cmd = ["ffmpeg", "-v", "error", "-y", "-i", src, "-vn"]
    af = []
    if end:
        cmd += ["-t", f"{end:.3f}"]
        if fade_out > 0:
            af.append(f"afade=t=out:st={max(0.0, end - fade_out):.3f}:d={fade_out}")
    if af:
        cmd += ["-af", ",".join(af)]
    cmd += ["-ac", "2", "-ar", "48000", "-c:a", "pcm_s16le", dst]
    run(cmd)
    return dst


def _mono(path, sr: int = 22050) -> np.ndarray:
    p = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-vn", "-ac", "1", "-ar", str(sr),
                        "-f", "s16le", "-"], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    return np.frombuffer(p.stdout, np.int16).astype(np.float32) / 32768.0


def onsets_and_tempo(path, sr: int = 22050) -> dict:
    x = _mono(path, sr)
    if x.size < sr:
        return {"bpm": None, "onsets": [], "beat_period": None}
    hop, n = 512, 2048
    frames = np.lib.stride_tricks.sliding_window_view(x, n)[::hop] * np.hanning(n)
    spec = np.log1p(10 * np.abs(np.fft.rfft(frames, axis=1)))
    flux = np.maximum(0, np.diff(spec, axis=0)).sum(1)
    flux = (flux - flux.mean()) / (flux.std() + 1e-9)
    fps = sr / hop
    seg = flux - flux.mean()
    ac = np.correlate(seg, seg, "full")[len(seg) - 1:]
    lags = np.arange(len(ac)) / fps
    with np.errstate(divide="ignore"):
        bpm = np.where(lags > 0, 60 / np.maximum(lags, 1e-9), 0)
    mask = (bpm > 70) & (bpm < 180)
    best = int(np.argmax(ac * mask))
    tempo = float(60 / lags[best]) if best else None
    thr = 2.0
    pk = [i for i in range(1, len(flux) - 1)
          if flux[i] > thr and flux[i] >= flux[i - 1] and flux[i] >= flux[i + 1]]
    onsets = [round((i + 1) * hop / sr, 3) for i in pk]
    strength = [round(float(flux[i]), 2) for i in pk]
    return {"bpm": round(tempo, 1) if tempo else None, "beat_period": round(60 / tempo, 4) if tempo else None,
            "onsets": onsets, "onset_strength": strength}


def loudness(path) -> dict:
    p = run(["ffmpeg", "-hide_banner", "-nostats", "-i", path, "-af", "ebur128=peak=true", "-f", "null", "-"], check=False)
    txt = p.stderr
    summ = txt[txt.rfind("Summary:"):] if "Summary:" in txt else txt

    def grab(key):
        m = re.search(rf"{key}:\s+(-?[\d.]+|-inf)", summ)
        return float(m.group(1)) if m and m.group(1) != "-inf" else None

    return {"integrated_lufs": grab("I"), "lra": grab("LRA"), "true_peak_dbfs": grab("Peak")}


def trailing_silence_start(path, duration: float, noise_db: int = -50, min_len: float = 0.5) -> float | None:
    """Dosyanın sonuna kadar süren sessizliğin başlangıcı (yoksa None)."""
    p = run(["ffmpeg", "-hide_banner", "-nostats", "-i", path, "-af",
             f"silencedetect=noise={noise_db}dB:d={min_len}", "-f", "null", "-"], check=False)
    starts = [float(s) for s in re.findall(r"silence_start: (-?[\d.]+)", p.stderr)]
    ends = [float(s) for s in re.findall(r"silence_end: (-?[\d.]+)", p.stderr)]
    if starts and (len(ends) < len(starts) or ends[-1] >= duration - 0.05):
        return starts[-1]
    return None


def read_wav_duration(path) -> float:
    with wave.open(str(path)) as w:
        return w.getnframes() / w.getframerate()
