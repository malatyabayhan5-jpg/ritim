"""4-5. adım: referans çekim dizisini kaynak çekimlerle eşleştirir → edl.json + grade.cube."""
from __future__ import annotations

import math
from pathlib import Path

import numpy as np

from . import audio
from .features import lab_to_rgb, rgb_to_lab
from .util import FEError, load_json, log, save_json

DEFAULT_CONFIG = {
    "player": "",
    "clubs": [],             # ["Arsenal", "Brighton", "Belgium"] → kulüp aramaları + resmî kanal tespiti
    "official_channels": [], # ["@kanaladi", "https://www.youtube.com/channel/UC..."] → kanal içi arama
    "providers": ["youtube_api", "youtube", "channels", "tiktok", "instagram", "google"],
    "cc_only": False,        # true → YouTube API'de yalnızca Creative Commons lisanslı videolar
    "texts": [],            # [{"text": "LEANDRO TROSSARD", "start": 0.6, "end": 2.2, "size": 0.07, "y": 0.5}]
    "grade_strength": 1.0,  # 0 = renge dokunma, 1 = referansa tam eşle
    "vignette": True,
    "music": None,          # null → referansın müziği; yol verilirse kesimler yeni müziğin vuruşlarına kaydırılır
    "target_lufs": None,    # null → referansla aynı
    "sfx": False,           # true → 02_AUDIO/sfx/whoosh*.wav ve impact*.wav yerleştirilir
    "slowmo_speed": 0.5,
    "push_in_max": 1.25,
    "allow_unverified_closeups": False,
    "preset": "medium",
    "crf": 16,
}


def load_config(paths: dict) -> dict:
    cfg = dict(DEFAULT_CONFIG)
    if paths["config"].exists():
        cfg.update(load_json(paths["config"]))
    return cfg


# ------------------------------------------------------------ renk (LUT)
def _pooled(stats: list[dict]):
    n = np.array([s["n"] for s in stats], float)
    m = np.array([s["mean"] for s in stats])
    sd = np.array([s["std"] for s in stats])
    mean = (n[:, None] * m).sum(0) / n.sum()
    var = (n[:, None] * (sd ** 2 + (m - mean) ** 2)).sum(0) / n.sum()
    return mean, np.sqrt(var)


def build_lut(path: Path, src_mean, src_std, ref_mean, ref_std, strength: float = 1.0, size: int = 33) -> dict:
    """Reinhard renk aktarımını (Lab ortalama/sapma eşleme) 3D LUT olarak yazar."""
    ratio = np.clip(np.asarray(ref_std) / np.maximum(src_std, 1e-3), 0.5, 2.0)
    g = np.linspace(0, 1, size)
    b, gg, r = np.meshgrid(g, g, g, indexing="ij")  # .cube: R en hızlı değişir
    rgb = np.stack([r, gg, b], -1).reshape(-1, 3)
    lab = rgb_to_lab(rgb)
    out = (lab - src_mean) * ratio + np.asarray(ref_mean)
    out = lab + strength * (out - lab)
    res = np.clip(lab_to_rgb(out), 0, 1)
    with open(path, "w") as f:
        f.write(f'TITLE "futbol-editor reference match"\nLUT_3D_SIZE {size}\n')
        for row in res:
            f.write(f"{row[0]:.6f} {row[1]:.6f} {row[2]:.6f}\n")
    return {"src_mean": np.round(src_mean, 2).tolist(), "src_std": np.round(src_std, 2).tolist(),
            "ref_mean": ref_mean, "ref_std": ref_std, "std_ratio": np.round(ratio, 3).tolist(), "strength": strength}


def vignette_angle(ref_ratio: float, src_ratio: float) -> float:
    """ffmpeg vignette açısı: köşe/merkez parlaklık oranını referansa yaklaştırır."""
    want = ref_ratio / max(src_ratio, 1e-3)
    if want >= 0.98:
        return 0.0
    return round(min(math.pi / 3, math.acos(max(0.0, min(1.0, want)) ** 0.25) / 0.92), 3)


# --------------------------------------------------------------- eşleme
def _fallbacks(kind: str) -> list[str]:
    return {"closeup": ["closeup", "medium"], "medium": ["medium", "wide", "closeup"],
            "wide": ["wide", "medium"]}.get(kind, ["wide", "medium", "closeup"])


def _overlaps(used, a, b):
    return any(a < ub and b > ua for ua, ub in used)


def _window(shot, need, used, prefer_peak):
    lo, hi = shot["start"] + 0.04, shot["end"] - 0.04
    if hi - lo < need * 0.6:
        return None
    if hi - lo <= need:
        return lo if not _overlaps(used, lo, hi) else None
    center = shot["motion_peak"] if prefer_peak else (lo + hi) / 2
    tries = [center - need / 2, lo, hi - need, lo + (hi - lo - need) / 2]
    for a in tries:
        a = min(max(a, lo), hi - need)
        if not _overlaps(used, a, a + need):
            return a
    return None


def _crop_cx(shot, kind):
    cx = shot.get("face_cx") if kind in ("closeup", "medium") and shot.get("face_cx") is not None else shot["motion_cx"]
    return round(0.5 + 0.8 * (float(cx) - 0.5), 4)


def _frames(times, fps):
    f = [int(round(t * fps)) for t in times]
    return [max(1, b - a) for a, b in zip(f[:-1], f[1:])]


def _snap_to_onsets(times, onsets, tol=0.12):
    out = []
    for t in times:
        if onsets:
            o = min(onsets, key=lambda x: abs(x - t))
            out.append(o if abs(o - t) <= tol else t)
        else:
            out.append(t)
    return sorted(set(round(x, 4) for x in out))


def make_plan(paths: dict) -> dict:
    style = load_json(paths["style"], "analyze")
    shots_doc = load_json(paths["shots"], "shots")
    cfg = load_config(paths)
    bad = {src["path"] for src in shots_doc.get("sources", []) if src.get("verdict") == "kullanma"}
    pool = [s for s in shots_doc["shots"] if s["source"] not in bad]
    if bad:
        log(f"{len(bad)} kaynak değerlendirmede 'kullanma' aldı ve dışarıda bırakıldı")
    if not pool:
        raise FEError("Kullanılabilir kaynak çekim yok.")
    out = style["output"]
    fps = out["fps"]
    ref_shots = style["shots"]
    warnings = []

    # müzik ve kesim zamanları
    music = cfg.get("music") or style["audio"].get("music_file")
    times = [s["start"] for s in ref_shots] + [ref_shots[-1]["end"]]
    total = times[-1]
    if cfg.get("music"):
        mdur = audio.read_wav_duration(music) if str(music).endswith(".wav") else None
        on = audio.onsets_and_tempo(music)["onsets"]
        times = _snap_to_onsets(times, on)
        if mdur and mdur < total:
            warnings.append(f"Yeni müzik ({mdur:.1f} sn) referanstan kısa; video {mdur:.1f} sn'de kesilecek.")
            times = [t for t in times if t < mdur] + [mdur]
        total = times[-1]
        log(f"Kesimler yeni müziğin vuruşlarına kaydırıldı ({len(on)} vuruş)")
    frames = _frames(times, fps)

    use_count: dict[int, int] = {}
    used: dict[int, list] = {}
    mot = np.array([s["motion"] for s in pool])
    m_lo, m_hi = np.percentile(mot, 10), np.percentile(mot, 95)
    sharp = np.array([s["sharp"] for s in pool])
    s_hi = np.percentile(sharp, 90) or 1.0
    slots = []
    for i, (rs, nf) in enumerate(zip(ref_shots, frames)):
        dur = nf / fps
        slot = {"index": i, "t": round(sum(frames[:i]) / fps, 4), "frames": nf, "dur": round(dur, 4),
                "ref_kind": rs["kind"], "section": rs.get("section"),
                "fade_in": min(rs["fade_in"], dur), "fade_out": min(rs["fade_out"], dur),
                "freeze": rs.get("freeze", False), "motion_blur": rs.get("motion_blur", False)}
        if rs["kind"] == "black":
            slot.update(kind="black")
            slots.append(slot)
            continue
        speed = cfg["slowmo_speed"] if rs.get("slowmo") else 1.0
        push = rs.get("push_in", 1.0)
        push = min(push, cfg["push_in_max"]) if (rs["kind"] in ("closeup", "medium") and dur >= 1.2 and
                                                  1.03 < push < 1.8) else 1.0
        need = 0.0 if slot["freeze"] else dur * speed
        best = None
        # 1. tur: kullanılmamış aralıklar; 2. tur (kaynak yetmezse): aynı çekimi tekrar kullan
        for reuse in (False, True):
            for rank, kind in enumerate(_fallbacks(rs["kind"])):
                for s in pool:
                    if s["kind"] != kind:
                        continue
                    ident = s.get("identity", "unknown")
                    if ident == "other":
                        continue
                    if kind == "closeup" and ident != "target" and not cfg["allow_unverified_closeups"]:
                        continue
                    busy = [] if reuse else used.get(s["id"], [])
                    if slot["freeze"]:
                        a = None if _overlaps(busy, s["motion_peak"] - 0.3, s["motion_peak"] + 0.3) else s["motion_peak"]
                    else:
                        a = _window(s, need, busy, prefer_peak=kind != "closeup")
                    if a is None:
                        continue
                    mn = (s["motion"] - m_lo) / max(m_hi - m_lo, 1e-6)
                    score = (-1.5 * rank + (0.8 if ident == "target" else 0.0) + min(1.0, s["sharp"] / s_hi) * 0.4
                             + (0.3 if s["src_h"] >= 1080 else 0.0) - 1.2 * use_count.get(s["id"], 0))
                    cat = s.get("category")
                    if kind == "closeup":
                        score += min(1.0, s.get("face_area", 0) / 0.05)
                        score += 0.3 if cat in ("yakin_plan", "sevinc") else 0.0
                    else:
                        score += float(np.clip(mn, 0, 1.2)) * (1.0 if slot["freeze"] or rs["motion"] > 0.02 else 0.4)
                        if slot["freeze"]:
                            score += 0.3 if cat in ("gol_asist", "sevinc") else 0.0
                        else:
                            score += 0.2 if cat in ("calim", "kosu_mucadele", "gol_asist", "farkli_aci") else 0.0
                    score += 0.2 if s.get("official") else 0.0
                    if best is None or score > best[0]:
                        best = (score, s, a, kind)
                if best is not None and rank == 0:
                    break
            if best is not None:
                if reuse:
                    slot["reused"] = True
                break
        if best is None:
            warnings.append(f"Slot {i} ({rs['kind']}, {dur:.2f} sn): uygun çekim bulunamadı → siyah kare.")
            slot.update(kind="black", missing=True)
            slots.append(slot)
            continue
        _, s, a, kind = best
        use_count[s["id"]] = use_count.get(s["id"], 0) + 1
        span = (a - 0.3, a + 0.3) if slot["freeze"] else (a, a + need)
        used.setdefault(s["id"], []).append(span)
        if kind != rs["kind"]:
            slot["substitute"] = f"{rs['kind']} yerine {kind}"
        slot.update(kind=kind, shot_id=s["id"], source=s["source"], src_start=round(a, 3),
                    src_len=round(need, 3), speed=speed, push_in=push, crop_cx=_crop_cx(s, kind),
                    identity=s.get("identity"), src_w=s["src_w"], src_h=s["src_h"], src_fps=s["src_fps"],
                    source_url=s.get("source_url"))
        slots.append(slot)

    chosen = [pool_by for pool_by in pool if pool_by["id"] in use_count and pool_by.get("lab")]
    grade = {}
    g = style["grade"]
    if chosen and g.get("lab_mean") and cfg["grade_strength"] > 0:
        sm, ss = _pooled([c["lab"] for c in chosen])
        grade = build_lut(paths["lut"], sm, ss, g["lab_mean"], g["lab_std"], cfg["grade_strength"])
        grade["lut"] = str(paths["lut"])
    vig = 0.0
    if cfg["vignette"] and chosen:
        vig = vignette_angle(g.get("vignette_corner_ratio", 1.0), float(np.median([c.get("corner_ratio", 1.0)
                                                                                   for c in chosen])))
    filled = [s for s in slots if s["kind"] != "black"]
    edl = {
        "output": {**out, "duration": round(sum(frames) / fps, 4)},
        "music": music, "target_lufs": cfg.get("target_lufs") or style["audio"].get("integrated_lufs") or -14.0,
        "grade": grade, "vignette_angle": vig, "texts": cfg.get("texts", []), "sfx": cfg.get("sfx", False),
        "preset": cfg["preset"], "crf": cfg["crf"],
        "stats": {"slots": len(slots), "filled": len(filled),
                  "unique_shots": len(use_count),
                  "target_verified": sum(1 for s in filled if s.get("identity") == "target"),
                  "substituted": sum(1 for s in filled if "substitute" in s),
                  "reused": sum(1 for s in filled if s.get("reused")),
                  "missing": sum(1 for s in slots if s.get("missing"))},
        "warnings": warnings,
        "slots": slots,
    }
    save_json(paths["edl"], edl)
    log(f"edl.json: {len(slots)} slot, {edl['stats']}")
    for w in warnings[:10]:
        log(f"UYARI: {w}")
    return edl
