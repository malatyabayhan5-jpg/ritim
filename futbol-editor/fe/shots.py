"""3. adım: kaynak klipleri çekimlere böler, sınıflar ve hedef oyuncuyu yüzden doğrular → shots.json."""
from __future__ import annotations

from pathlib import Path

import numpy as np

from .features import (FaceTools, attach_faces, black_splits, classify, detect_cuts, rgb_to_lab, scan_video,
                       segment_shots)
from .util import FEError, grab_frame, load_json, log, save_json

VIDEO_EXT = {".mp4", ".mkv", ".webm", ".mov", ".m4v", ".avi"}
IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp"}
SFACE_COSINE = 0.363  # OpenCV SFace önerilen eşik (cosine): aynı kişi kümesi
TARGET_SIM = 0.30     # hedef küme merkezine bu benzerlik ve üstü → hedef oyuncu
OTHER_SIM = 0.18      # bunun altı → kesin başka kişi; aradaki belirsiz ("unknown") kalır
MIN_FACE_FOR_ID = 0.008  # daha küçük yüzlerin gömmesi güvenilmez (640 px karede ~55 px)


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
    if target is not None:
        cen = target["sum"] / np.linalg.norm(target["sum"])
        # aynı kişinin farklı ışık/açıdan oluşmuş alt kümelerini hedefe kat
        for c in clusters:
            if c is not target and float((c["sum"] / np.linalg.norm(c["sum"])) @ cen) >= SFACE_COSINE:
                target["members"] += c["members"]
        cen = np.sum([s["_emb"] for s in target["members"]], 0)
        cen /= np.linalg.norm(cen)
        for s in face_shots:
            sim = float(s["_emb"] @ cen)
            s["identity_sim"] = round(sim, 3)
            s["identity"] = "target" if sim >= TARGET_SIM else ("other" if sim < OTHER_SIM else "unknown")
    return {"method": method or "belirlenemedi", "clusters": [len(c["members"]) for c in clusters[:8]],
            "face_shots": len(face_shots),
            "target_shots": sum(1 for s in face_shots if s.get("identity") == "target"),
            "other_shots": sum(1 for s in face_shots if s.get("identity") == "other")}


def _overlay_and_bars(scan) -> dict:
    """Sabit grafik/filigran (skor tabelası, kanal logosu) ve siyah bant oranı tahmini."""
    frames = [k[1] for k in scan.keyframes if k[1].mean() > 20][:240]
    if len(frames) < 8:
        return {"overlay_ratio": None, "letterbox": None}
    g = np.stack([fr.astype(np.float32).mean(-1) / 255 for fr in frames])
    mean = g.mean(0)
    bars = mean < 0.04
    static = (g.std(0) < 0.03) & ~bars
    h, w = mean.shape
    zones = {"sol_ust": static[: h // 4, : w // 3], "sag_ust": static[: h // 4, -w // 3:],
             "sol_alt": static[-h // 4:, : w // 3], "sag_alt": static[-h // 4:, -w // 3:]}
    where = [k for k, z in zones.items() if z.mean() > 0.04]
    return {"overlay_ratio": round(float(static.mean()), 4), "overlay_zones": where,
            "letterbox": round(float(bars.mean()), 3)}


def evaluate_sources(sources: list[dict], paths: dict) -> None:
    """Kaynak videoları sahne sahne puanlar; rapor ve kaynak başına kontakt sayfası yazar."""
    import cv2
    out_dir = paths["root"] / "06_PROJECT_FILES" / "kaynak_kontakt"
    out_dir.mkdir(parents=True, exist_ok=True)
    for src in sources:
        shots = src["_shots"]
        kinds = {k: sum(1 for x in shots if x["kind"] == k) for k in ("closeup", "medium", "wide")}
        tgt = sum(1 for x in shots if x.get("identity") == "target")
        oth = sum(1 for x in shots if x.get("identity") == "other")
        notes = []
        if src["height"] < 720 and src["width"] < 1280:
            notes.append(f"düşük çözünürlük ({src['width']}x{src['height']})")
        if src["height"] > src["width"]:
            notes.append("dikey video (TikTok/Reels); yatay çıktı için kırpma kaybı yüksek")
        if (src.get("overlay_ratio") or 0) > 0.01:
            notes.append(f"sabit grafik/filigran olası: {', '.join(src.get('overlay_zones') or []) or 'dağınık'}")
        if (src.get("letterbox") or 0) > 0.1:
            notes.append("siyah bantlı (letterbox/pillarbox)")
        if oth > tgt and oth >= 2:
            notes.append("başka kişilerin yüzleri hedef oyuncudan fazla → farklı oyuncu ağırlıklı olabilir")
        score = (len(shots) / 10 + 2 * tgt / max(1, len(shots)) + (1 if min(src["width"], src["height"]) >= 1080 else 0)
                 + (0.5 if src["official"] else 0) - (1 if (src.get("overlay_ratio") or 0) > 0.01 else 0)
                 - 2 * (oth > tgt and oth >= 2))
        src.update(usable=len(shots), kinds=kinds, target_verified=tgt, other_faces=oth, notes=notes,
                   score=round(score, 2),
                   verdict="kullanma" if (not shots or (oth > tgt and oth >= 2)) else ("iyi" if score >= 2 else "sınırlı"))
        if src["_thumbs"]:
            tiles = []
            for x, im in zip(shots, src["_thumbs"]):
                t = cv2.resize(np.ascontiguousarray(im[..., ::-1]), (240, int(240 * im.shape[0] / im.shape[1])))
                t = cv2.copyMakeBorder(t, 0, max(0, 240 - t.shape[0]), 0, 0, cv2.BORDER_CONSTANT)[:240]
                color = {"target": (80, 220, 80), "other": (60, 60, 230)}.get(x.get("identity"), (200, 200, 200))
                label = f"{x['start']:.1f}s {x['kind']} {x.get('identity', '')}"
                cv2.rectangle(t, (0, 0), (239, 20), (0, 0, 0), -1)
                cv2.putText(t, label, (4, 15), cv2.FONT_HERSHEY_SIMPLEX, 0.42, color, 1, cv2.LINE_AA)
                tiles.append(t)
            cols = 6
            while len(tiles) % cols:
                tiles.append(np.zeros_like(tiles[0]))
            sheet = np.vstack([np.hstack(tiles[i:i + cols]) for i in range(0, len(tiles), cols)])
            p = out_dir / f"{Path(src['file']).stem}.jpg"
            cv2.imwrite(str(p), sheet, [cv2.IMWRITE_JPEG_QUALITY, 85])
            src["contact_sheet"] = str(p)
    L = ["# Kaynak değerlendirmesi (sahne sahne)", "",
         "| Dosya | Platform | Kategori | Çözünürlük | Kullanılabilir çekim | Yakın/Orta/Geniş | Hedef oyuncu | "
         "Başka yüz | Puan | Karar | Notlar |", "|---|---|---|---|---|---|---|---|---|---|---|"]
    for src in sorted(sources, key=lambda x: -x["score"]):
        k = src["kinds"]
        L.append(f"| {src['file']} | {src['platform']}{' (resmî)' if src['official'] else ''} | {src['category']} | "
                 f"{src['width']}x{src['height']} | {src['usable']}/{src['shots_total']} | "
                 f"{k['closeup']}/{k['medium']}/{k['wide']} | {src['target_verified']} | {src['other_faces']} | "
                 f"{src['score']} | {src['verdict']} | {'; '.join(src['notes']) or '-'} |")
    L += ["", "Kontakt sayfaları: `06_PROJECT_FILES/kaynak_kontakt/` (yeşil = hedef oyuncu, kırmızı = başka kişi)."]
    (paths["root"] / "06_PROJECT_FILES" / "kaynak_degerlendirme.md").write_text("\n".join(L) + "\n")


def analyze_footage(paths: dict, min_shot: float = 0.4) -> dict:
    files = sorted(p for p in paths["footage"].rglob("*") if p.suffix.lower() in VIDEO_EXT)
    if not files:
        raise FEError(f"{paths['footage']} içinde video yok. Önce 'fetch' çalıştır ya da klasöre klip koy.")
    faces = FaceTools()
    if not faces.available:
        log(f"UYARI: yüz tespiti kapalı ({faces.reason}); yakın plan/oyuncu doğrulaması yapılamayacak.")
    manifest = load_json(paths["manifest"]) if paths["manifest"].exists() else {"items": []}
    by_file = {Path(it.get("file", "")).name: it for it in manifest.get("items", [])}
    all_shots, seen_thumbs, errors, sources = [], [], [], []
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
        meta = by_file.get(f.name, {})
        src = {"file": f.name, "path": str(f), "platform": meta.get("platform", "yerel"),
               "category": meta.get("category", "bilinmiyor"), "official": bool(meta.get("official")),
               "url": meta.get("url"), "izin": meta.get("izin"), "title": meta.get("title"),
               "width": scan.info["width"], "height": scan.info["height"], "fps": scan.info["fps"],
               "duration": round(scan.info["duration"], 1), "shots_total": len(shots),
               **_overlay_and_bars(scan)}
        thumbs, kept = [], []
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
            if faces.available and s["face_area"] >= MIN_FACE_FOR_ID:
                r = faces.detect(mid)
                if r:
                    e = faces.embed(mid, r[3])
                    if e is not None:
                        s["_emb"] = e
            s["lab"] = _lab_stats(keys or [mid])
            s["source"] = str(f)
            s["src_w"], s["src_h"], s["src_fps"] = scan.info["width"], scan.info["height"], scan.info["fps"]
            s["corner_ratio"] = round(scan.corner_ratio, 3)
            s["source_url"] = meta.get("url")
            s["category"] = src["category"]
            s["platform"] = src["platform"]
            s["official"] = src["official"]
            all_shots.append(s)
            kept.append(s)
            thumbs.append(mid)
        src["_shots"], src["_thumbs"] = kept, thumbs
        sources.append(src)
    photo_embs = _photo_embeddings(paths["root"] / "05_IMAGES", faces) if faces.recognizer else []
    ident = _identify(all_shots, photo_embs)
    for i, s in enumerate(all_shots):
        s.pop("_emb", None)
        s["id"] = i
    evaluate_sources(sources, paths)
    out = {"files": [str(f) for f in files], "errors": errors, "identity": ident,
           "sources": [{k: v for k, v in src.items() if not k.startswith("_")} for src in sources],
           "kinds": {k: sum(1 for s in all_shots if s["kind"] == k) for k in ("closeup", "medium", "wide")},
           "shots": all_shots}
    save_json(paths["shots"], out)
    log(f"shots.json: {len(all_shots)} kullanılabilir çekim {out['kinds']}; oyuncu tespiti: {ident['method']}")
    return out
