"""9. adım: kalite kontrol → qc_report.json / qc_report.md / kontakt sayfası."""
from __future__ import annotations

import re
from pathlib import Path

from . import audio
from .features import detect_cuts, scan_video
from .util import load_json, log, probe, run, save_json


def _intervals(stderr: str, key: str):
    starts = [float(x) for x in re.findall(rf"{key}_start:\s*(-?[\d.]+)", stderr)]
    ends = [float(x) for x in re.findall(rf"{key}_end:\s*(-?[\d.]+)", stderr)]
    return list(zip(starts, ends + [None] * (len(starts) - len(ends))))


def _covered(a, b, allowed, tol=0.1):
    return any(a >= x - tol and (b or a) <= y + tol for x, y in allowed)


def quality_check(paths: dict, video: Path) -> dict:
    edl = load_json(paths["edl"], "plan")
    out = edl["output"]
    fps = out["fps"]
    checks = []

    def add(name, ok, detail, level="FAIL"):
        checks.append({"check": name, "status": "OK" if ok else level, "detail": detail})

    info = probe(video)
    add("Çözünürlük", (info.get("width"), info.get("height")) == (out["width"], out["height"]),
        f"{info.get('width')}x{info.get('height')} (beklenen {out['width']}x{out['height']})")
    add("Kare hızı", abs(info.get("fps", 0) - fps) < 0.05, f"{info.get('fps')} fps (beklenen {fps})")
    add("Süre", abs(info["duration"] - out["duration"]) < 0.1,
        f"{info['duration']:.2f} sn (plan {out['duration']:.2f} sn)")
    add("Ses akışı", info["has_audio"] == bool(edl.get("music")),
        f"ses {'var' if info['has_audio'] else 'yok'}; {info.get('sample_rate', '-')} Hz", "WARN")

    # siyah kareler: yalnızca planlı siyah/kararma bölgelerinde olmalı
    allowed = []
    for s in edl["slots"]:
        a, b = s["t"], s["t"] + s["dur"]
        if s["kind"] == "black":
            allowed.append((a, b))
        if s.get("fade_out"):
            allowed.append((b - s["fade_out"], b))
        if s.get("fade_in"):
            allowed.append((a, a + s["fade_in"]))
    merged = []
    for a, b in sorted(allowed):
        if merged and a <= merged[-1][1] + 0.05:
            merged[-1] = (merged[-1][0], max(merged[-1][1], b))
        else:
            merged.append((a, b))
    p = run(["ffmpeg", "-hide_banner", "-nostats", "-i", video, "-vf", "blackdetect=d=0.1:pix_th=0.06",
             "-an", "-f", "null", "-"], check=False)
    blacks = _intervals(p.stderr, "black")
    bad = [(a, b) for a, b in blacks if not _covered(a, b, merged)]
    add("Beklenmeyen siyah kare", not bad, f"{len(bad)} aralık {bad[:5]}" if bad else "yok")

    p = run(["ffmpeg", "-hide_banner", "-nostats", "-i", video, "-vf", "freezedetect=n=0.003:d=0.6",
             "-an", "-f", "null", "-"], check=False)
    freezes = _intervals(p.stderr, "lavfi.freezedetect.freeze")
    planned = [(s["t"], s["t"] + s["dur"]) for s in edl["slots"] if s.get("freeze") or s["kind"] == "black"]
    badf = [(a, b) for a, b in freezes if not _covered(a, b, planned + merged, tol=0.15)]
    add("Beklenmeyen donma", not badf, f"{len(badf)} aralık {badf[:5]}" if badf else "yok", "WARN")

    if info["has_audio"]:
        ld = audio.loudness(video)
        tgt = edl["target_lufs"]
        i_ok = ld["integrated_lufs"] is not None and abs(ld["integrated_lufs"] - tgt) <= 1.0
        add("Ses yüksekliği", i_ok, f"{ld['integrated_lufs']} LUFS (hedef {tgt})", "WARN")
        tp_ok = ld["true_peak_dbfs"] is not None and ld["true_peak_dbfs"] <= -0.5
        add("True peak / clipping", tp_ok, f"{ld['true_peak_dbfs']} dBTP (sınır -0.5)")

    # kesimler planla aynı karede mi?
    scan = scan_video(video, fps=fps, keyframe_every=3600, cam_step=None)
    found = detect_cuts(scan)
    planned_cuts = []
    for prev, s in zip(edl["slots"][:-1], edl["slots"][1:]):
        if prev["kind"] == "black" or s["kind"] == "black" or prev.get("fade_out"):
            continue
        planned_cuts.append(s["t"])
    tol = 2.0 / fps
    hit = sum(1 for c in planned_cuts if any(abs(c - f) <= tol for f in found))
    ratio = hit / len(planned_cuts) if planned_cuts else 1.0
    add("Kesim zamanlaması", ratio >= 0.85,
        f"planlanan {len(planned_cuts)} kesimin {hit} tanesi ±2 karede bulundu (%{ratio * 100:.0f}). "
        "Aynı kaynaktan art arda benzer planlar düşük oranın nedeni olabilir.", "WARN")

    filled = [s for s in edl["slots"] if s["kind"] != "black"]
    upscaled = [s for s in filled if max(out["width"] / s["src_w"], out["height"] / s["src_h"]) > 1.5]
    add("Kaynak çözünürlüğü", len(upscaled) <= 0.2 * max(1, len(filled)),
        f"{len(upscaled)}/{len(filled)} plan 1.5 kattan fazla büyütüldü", "WARN")
    unver = [s for s in filled if s.get("identity") != "target"]
    add("Oyuncu doğrulama", len(unver) <= 0.5 * max(1, len(filled)),
        f"{len(filled) - len(unver)}/{len(filled)} plan yüzden hedef oyuncu olarak doğrulandı; "
        "geniş planlarda yüz görünmediği için doğrulama yapılamaz → kontakt sayfasına bak.", "WARN")
    reused = [s for s in filled if s.get("reused")]
    add("Tekrar kullanılan plan", len(reused) <= 0.25 * max(1, len(filled)),
        f"{len(reused)}/{len(filled)} plan aynı kaynak aralığını tekrar kullanıyor (kaynak klip sayısı az)", "WARN")
    miss = [s["index"] for s in edl["slots"] if s.get("missing")]
    add("Eksik plan", not miss, f"{len(miss)} slot siyah bırakıldı {miss[:10]}" if miss else "yok")

    sheet = video.with_name(video.stem + "_kontakt.png")
    cols = 8
    rows = max(1, int(out["duration"] * 2 / cols) + 1)
    run(["ffmpeg", "-v", "error", "-y", "-i", video, "-vf",
         f"fps=2,scale=240:-2,drawtext=text='%{{pts\\:hms}}':x=4:y=4:fontsize=14:fontcolor=yellow:box=1:boxcolor=black,"
         f"tile={cols}x{rows}", "-frames:v", "1", sheet], check=False)

    status = "FAIL" if any(c["status"] == "FAIL" for c in checks) else (
        "WARN" if any(c["status"] == "WARN" for c in checks) else "OK")
    report = {"video": str(video), "status": status, "checks": checks,
              "contact_sheet": str(sheet) if sheet.exists() else None, "plan_warnings": edl.get("warnings", [])}
    save_json(video.with_name(video.stem + "_qc.json"), report)
    md = [f"# Kalite kontrol: {video.name}", "", f"**Sonuç: {status}**", "", "| Kontrol | Durum | Ayrıntı |",
          "|---|---|---|"] + [f"| {c['check']} | {c['status']} | {c['detail']} |" for c in checks]
    if edl.get("warnings"):
        md += ["", "## Plan uyarıları"] + [f"- {w}" for w in edl["warnings"]]
    video.with_name(video.stem + "_qc.md").write_text("\n".join(md) + "\n")
    log(f"QC: {status}")
    for c in checks:
        log(f"  {c['status']:4s} {c['check']}: {c['detail']}")
    return report
