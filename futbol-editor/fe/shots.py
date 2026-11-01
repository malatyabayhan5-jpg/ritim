"""3. adım: kaynak klipleri çekimlere böler, sınıflar ve hedef oyuncuyu yüzden doğrular → shots.json."""
from __future__ import annotations

from pathlib import Path

import numpy as np

from .features import (FaceTools, attach_faces, black_splits, classify, detect_cuts, rgb_to_lab, scan_video,
                       segment_shots)
from .util import FEError, grab_frame, load_json, log, save_json

VIDEO_EXT = {".mp4", ".mkv", ".webm", ".mov", ".m4v", ".avi"}
IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp"}
SFACE_COSINE = 0.363  # OpenCV SFace önerilen eşik (cosine)


def _lab_stats(rgbs):
    if not rgbs:
        return None
    px = np.concatenate([(r[::4, ::4].reshape(-1, 3).astype(np.float32) / 255) for r in rgbs])
    lab = rgb_to_lab(px)
    return {"n": int(len(lab)), "mean": lab.mean(0).round(3).tolist(), "std": lab.std(0).round(3).tolist()}


def _thumb(rgb):
    g = rgb.astype(np.float32).mean(-1)
    h, w = g.shape
    g = g[: h - h % 8, : w - w % 8].reshape(8, (h - h % 8) // 8, 8, (w - w % 8) // 8).mean((1, 3))
    return (g > np.median(g)).ravel()


def _photo_embeddings(folder: Path, faces: FaceTools):
    embs = []
    for p in sorted(folder.glob("*")):
        if p.suffix.lower() not in IMAGE_EXT:
            continue
        rgb = grab_frame(p, 0, width=640)
        if rgb is None:
            continue
        r = faces.detect(rgb)
        if r:
            e = faces.embed(rgb, r[3])
            if e is not None:
                embs.append(e)
    return embs


def _identify(shots: list[dict], photo_embs: list) -> dict:
    """Yüz gömmelerini kümeler; hedef oyuncu kümesini seçer ve her çekime identity yazar."""
    face_shots = [s for s in shots if "_emb" in s]
    for s in shots:
        s["identity"] = "unknown"
    if not face_shots:
        return {"method": "yok", "note": "Yüz gömmesi çıkarılamadı (yakın plan yok ya da SFace modeli eksik)."}
    clusters: list[dict] = []
    for s in sorted(face_shots, key=lambda x: -x["face_area"]):
        e = s["_emb"]
        best, sim = None, -1.0
        for c in clusters:
            v = float(e @ (c["sum"] / np.linalg.norm(c["sum"])))
            if v > sim:
                best, sim = c, v
        if best is not None and sim >= SFACE_COSINE:
            best["sum"] += e
            best["members"].append(s)
        else:
            clusters.append({"sum": e.copy(), "members": [s]})
    clusters.sort(key=lambda c: -len(c["members"]))
    target, method = None, ""
    if photo_embs:
        ref = np.mean(photo_embs, 0)
        ref /= np.linalg.norm(ref)
        scored = [(float(ref @ (c["sum"] / np.linalg.norm(c["sum"]))), c) for c in clusters]
        sim, c = max(scored, key=lambda x: x[0])
        if sim >= SFACE_COSINE:
            target, method = c, f"referans fotoğraf (benzerlik {sim:.2f})"
    if target is None:
        top = clusters[0]
        share = len(top["members"]) / len(face_shots)
        if len(top["members"]) >= 3 and share >= 0.3:
            target, method = top, f"en sık görünen yüz kümesi (%{share * 100:.0f})"
    for c in clusters:
        for s in c["members"]:
            s["identity"] = "target" if c is target else "other"
    return {"method": method or "belirlenemedi", "clusters": [len(c["members"]) for c in clusters[:8]],
            "face_shots": len(face_shots),
            "target_shots": len(target["members"]) if target else 0}


def analyze_footage(paths: dict, min_shot: float = 0.4) -> dict:
    files = sorted(p for p in paths["footage"].rglob("*") if p.suffix.lower() in VIDEO_EXT)
    if not files:
        raise FEError(f"{paths['footage']} içinde video yok. Önce 'fetch' çalıştır ya da klasöre klip koy.")
    faces = FaceTools()
    if not faces.available:
        log(f"UYARI: yüz tespiti kapalı ({faces.reason}); yakın plan/oyuncu doğrulaması yapılamayacak.")
    manifest = load_json(paths["manifest"]) if paths["manifest"].exists() else {"items": []}
    by_file = {Path(it.get("file", "")).name: it for it in manifest.get("items", [])}
    all_shots, seen_thumbs, errors = [], [], []
    for n, f in enumerate(files, 1):
        log(f"[{n}/{len(files)}] çekimler çıkarılıyor: {f.name}")
        try:
            scan = scan_video(f, fps=10, keyframe_every=0.5, cam_step=0.3)
        except Exception as e:  # bozuk dosya tüm işi durdurmasın
            errors.append({"file": f.name, "error": str(e)[:300]})
            continue
        cuts = detect_cuts(scan, threshold=0.3)
        cuts = sorted(cuts + black_splits(scan, cuts))
        shots = segment_shots(scan, cuts)
        attach_faces(shots, scan, faces)
        for s in shots:
            s["kind"] = classify(s)
            if s["kind"] == "black" or s["dur"] < min_shot or s["luma"] < 0.06:
                continue
            i0, i1 = s.pop("_idx")
            seg = scan.diff[i0 + 1:i1 + 1]
            s["motion_peak"] = round(float(scan.t[i0 + 1 + int(seg.argmax())]), 3) if seg.size else s["start"]
            keys = [k[1] for k in scan.keyframes if s["start"] <= k[0] < s["end"]]
            mid = grab_frame(f, (s["start"] + s["end"]) / 2, width=640)
            if mid is None:
                continue
            th = _thumb(mid)
            if any(float((th == o).mean()) > 0.97 for o in seen_thumbs):
                continue  # başka derlemede aynı plan
            seen_thumbs.append(th)
            if faces.available and s["face_area"] >= 0.004:
                r = faces.detect(mid)
                if r:
                    e = faces.embed(mid, r[3])
                    if e is not None:
                        s["_emb"] = e
            s["lab"] = _lab_stats(keys or [mid])
            s["source"] = str(f)
            s["src_w"], s["src_h"], s["src_fps"] = scan.info["width"], scan.info["height"], scan.info["fps"]
            s["corner_ratio"] = round(scan.corner_ratio, 3)
            meta = by_file.get(f.name, {})
            s["source_url"] = meta.get("url")
            all_shots.append(s)
    photo_embs = _photo_embeddings(paths["root"] / "05_IMAGES", faces) if faces.recognizer else []
    ident = _identify(all_shots, photo_embs)
    for i, s in enumerate(all_shots):
        s.pop("_emb", None)
        s["id"] = i
    out = {"files": [str(f) for f in files], "errors": errors, "identity": ident,
           "kinds": {k: sum(1 for s in all_shots if s["kind"] == k) for k in ("closeup", "medium", "wide")},
           "shots": all_shots}
    save_json(paths["shots"], out)
    log(f"shots.json: {len(all_shots)} kullanılabilir çekim {out['kinds']}; oyuncu tespiti: {ident['method']}")
    return out
