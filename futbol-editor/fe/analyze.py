"""1. adım: referans videonun stilini çıkarır → style.json + müzik WAV."""
from __future__ import annotations

from pathlib import Path

import numpy as np

from . import audio
from .features import (FaceTools, attach_faces, black_splits, classify, detect_cuts, fade_profile,
                       scan_video, segment_shots)
from .util import log, run, save_json


def _output_size(w: int, h: int, short_side: int = 1080) -> tuple[int, int]:
    s = short_side / min(w, h)
    return int(round(w * s / 2) * 2), int(round(h * s / 2) * 2)


def _pace(d: float) -> str:
    if d < 0.2:
        return "cok_hizli"
    if d < 0.7:
        return "hizli"
    if d < 1.5:
        return "orta"
    return "yavas"


def analyze_reference(ref: Path, paths: dict, short_side: int = 1080) -> dict:
    ref = Path(ref)
    log(f"Referans taranıyor: {ref.name}")
    scan = scan_video(ref, fps=60, keyframe_every=0.25, cam_step=0.2)
    info = scan.info
    cuts = detect_cuts(scan)
    cuts = sorted(cuts + black_splits(scan, cuts))
    shots = segment_shots(scan, cuts)
    faces = FaceTools()
    attach_faces(shots, scan, faces)

    med_sharp = float(np.median([s["sharp"] for s in shots if s["luma"] > 0.05] or [1]))
    med_motion = float(np.median([s["motion"] for s in shots if s["luma"] > 0.05] or [0]))
    # Kaynak 25/30 fps → 60 fps çevrildiyse her çekimde kare tekrarı vardır; ağır çekimi bu taban çizgisine göre ara.
    base_dup = float(np.median([s["dup_ratio"] for s in shots if s["dur"] >= 0.3 and s["luma"] > 0.05] or [0]))
    for s in shots:
        s["fade_in"], s["fade_out"] = fade_profile(scan, s)
        s["kind"] = classify(s)
        frames = int(round(s["dur"] * scan.fps))
        s["freeze"] = bool(s["kind"] != "black" and frames >= 3 and s["motion"] < 0.002)
        s["slowmo"] = bool(not s["freeze"] and s["kind"] != "black" and s["dur"] > 0.4 and s["dup_ratio"] > base_dup + 0.25)
        s["motion_blur"] = bool(s["sharp"] < 0.6 * med_sharp and s["motion"] > med_motion and s["dur"] > 0.15)
        s["push_in"] = round(float(np.exp(s["zoom_rate"] * s["dur"])), 3) if s["dur"] >= 0.8 else 1.0
        s.pop("_idx", None)

    # ses
    log("Müzik analiz ediliyor")
    a = {"has_audio": info["has_audio"]}
    if info["has_audio"]:
        sil = audio.trailing_silence_start(ref, info["duration"])
        music_end = round(sil, 3) if sil and sil > info["duration"] * 0.5 else round(info["duration"], 3)
        music = paths["music"] / "music.wav"
        audio.extract_music(ref, music, end=music_end, fade_out=0.3 if music_end < info["duration"] - 0.1 else 0)
        a.update(audio.onsets_and_tempo(music))
        a.update(audio.loudness(music))
        a.update(music_file=str(music), music_end=music_end, trailing_silence=round(info["duration"] - music_end, 3))
        p = run(["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=bit_rate",
                 "-of", "default=nw=1:nk=1", ref], check=False)
        br = int(p.stdout.strip()) if p.stdout.strip().isdigit() else 0
        a["source_bitrate_kbps"] = round(br / 1000) if br else None
        if br and br < 96000:
            a["warning"] = (f"Referans ses {br // 1000} kbps; düşük kalite. Orijinal parça varsa --music ile ver.")

    total = a.get("music_end", info["duration"]) if info["has_audio"] else info["duration"]
    shots = [s for s in shots if s["start"] < total - 1e-3]
    if shots:
        shots[-1]["end"] = round(total, 4)
        shots[-1]["dur"] = round(total - shots[-1]["start"], 4)

    # bölümler: kararma/siyah ile ayrılan bloklar
    sections, cur = [], []
    for s in shots:
        cur.append(s)
        if s["fade_out"] > 0 or s["kind"] == "black":
            sections.append(cur)
            cur = []
    if cur:
        sections.append(cur)
    sec_out = []
    for i, sec in enumerate(sections):
        durs = [s["dur"] for s in sec if s["kind"] != "black"]
        md = float(np.median(durs)) if durs else 0.0
        sec_out.append({"index": i, "start": sec[0]["start"], "end": sec[-1]["end"], "shots": len(sec),
                        "median_shot": round(md, 3), "pace": _pace(md) if durs else "siyah"})
    for i, sec in enumerate(sections):
        for s in sec:
            s["section"] = i

    # renk
    lab = scan.lab_samples
    vis = scan.luma[scan.luma > 0.05]
    grade = {
        "lab_mean": lab.mean(0).round(3).tolist() if lab is not None else None,
        "lab_std": lab.std(0).round(3).tolist() if lab is not None else None,
        "luma_p2": float(np.percentile(vis, 2)) if vis.size else None,
        "luma_p50": float(np.percentile(vis, 50)) if vis.size else None,
        "luma_p98": float(np.percentile(vis, 98)) if vis.size else None,
        "saturation_mean": float(scan.sat[scan.luma > 0.05].mean()) if vis.size else None,
        "vignette_corner_ratio": round(scan.corner_ratio, 3),
    }

    durs = np.array([s["dur"] for s in shots if s["kind"] != "black"])
    kinds = {k: sum(1 for s in shots if s["kind"] == k) for k in ("closeup", "medium", "wide", "black")}
    out_w, out_h = _output_size(info["width"], info["height"], short_side)
    style = {
        "reference": {"path": str(ref), "duration": info["duration"], "width": info["width"],
                      "height": info["height"], "fps": info["fps"]},
        "output": {"width": out_w, "height": out_h, "fps": round(info["fps"]) or 30, "duration": round(total, 3)},
        "summary": {
            "shots": len(shots), "cuts": len(cuts),
            "shot_dur_median": round(float(np.median(durs)), 3) if durs.size else None,
            "shot_dur_min": round(float(durs.min()), 3) if durs.size else None,
            "shot_dur_max": round(float(durs.max()), 3) if durs.size else None,
            "kinds": kinds,
            "dips_to_black": sum(1 for s in shots[:-1] if s["fade_out"] > 0),
            "fade_in_start": shots[0]["fade_in"] if shots else 0,
            "fade_out_end": next((s["fade_out"] for s in reversed(shots) if s["kind"] != "black"), 0),
            "motion_blur_shots": sum(s["motion_blur"] for s in shots),
            "slowmo_shots": sum(s["slowmo"] for s in shots),
            "freeze_shots": sum(s["freeze"] for s in shots),
            "duplicate_frame_baseline": round(base_dup, 3),
            "push_in_shots": sum(1 for s in shots if s["push_in"] > 1.03),
            "face_detection": faces.available or faces.reason,
        },
        "sections": sec_out,
        "shots": shots,
        "grade": grade,
        "audio": a,
        "text": {"detected": None, "note": "Otomatik yazı (OCR) tespiti yok; yazı istenirse config.json → texts."},
    }
    save_json(paths["style"], style)
    log(f"style.json yazıldı: {len(shots)} çekim, {len(sec_out)} bölüm, "
        f"tempo {a.get('bpm')} BPM, {kinds}")
    return style
