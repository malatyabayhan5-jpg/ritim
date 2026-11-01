"""7-8. adım: edl.json'a göre FFmpeg ile render → 08_EXPORTS/<ad>.mp4"""
from __future__ import annotations

import json
import os
import re
import shutil
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from .util import FEError, load_json, log, run

FONT_CANDIDATES = [
    "/usr/share/fonts/opentype/inter/Inter-ExtraBold.otf",
    "/usr/share/fonts/opentype/inter/Inter-Bold.otf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/Library/Fonts/Arial Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "C:/Windows/Fonts/arialbd.ttf",
]


def _esc(path: str) -> str:
    return str(path).replace("\\", "/").replace(":", "\\:").replace("'", "\\'")


def _cover(sw, sh, W, H, cx, zoom=1.0):
    s = max(W / sw, H / sh) * zoom
    w = int(round(sw * s / 2) * 2)
    h = int(round(sh * s / 2) * 2)
    x = int(min(max(cx * w - W * zoom / 2, 0), w - W * zoom))
    y = int((h - H * zoom) / 2)
    return w, h, x, y


def segment_cmd(slot: dict, edl: dict, out: Path) -> list:
    W, H, fps = edl["output"]["width"], edl["output"]["height"], edl["output"]["fps"]
    n = slot["frames"]
    enc = ["-an", "-frames:v", str(n), "-fps_mode", "cfr", "-r", str(fps), "-c:v", "libx264",
           "-preset", edl.get("preset", "medium"), "-crf", str(edl.get("crf", 16)), "-pix_fmt", "yuv420p",
           "-video_track_timescale", "90000", "-threads", "2", str(out)]
    if slot["kind"] == "black":
        return ["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", f"color=c=black:s={W}x{H}:r={fps}"] + enc

    f = []
    pre = slot["src_start"]
    if slot.get("freeze"):
        f += ["trim=end_frame=1", f"loop=loop={n + 2}:size=1:start=0", f"setpts=N/({fps}*TB)"]
    else:
        speed = slot.get("speed", 1.0)
        f.append(f"setpts=(PTS-STARTPTS)/{speed}")
        f.append(f"framerate=fps={fps}" if speed < 1 else f"fps={fps}")
    z = slot.get("push_in", 1.0)
    sw, sh, cx = slot["src_w"], slot["src_h"], slot.get("crop_cx", 0.5)
    if z > 1.0:
        w, h, x, y = _cover(sw, sh, W * 2, H * 2, cx)
        f += [f"scale={w}:{h}:flags=lanczos", f"crop={W * 2}:{H * 2}:{x}:{y}",
              f"zoompan=z='1+{z - 1:.4f}*on/{max(n - 1, 1)}':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2'"
              f":d=1:s={W}x{H}:fps={fps}"]
    else:
        w, h, x, y = _cover(sw, sh, W, H, cx)
        f += [f"scale={w}:{h}:flags=lanczos", f"crop={W}:{H}:{x}:{y}"]
    f.append("tpad=stop_mode=clone:stop_duration=3")
    if slot.get("motion_blur"):
        f.append("tmix=frames=3:weights='1 1 1'")
    if edl.get("grade", {}).get("lut"):
        f.append(f"lut3d=file='{_esc(edl['grade']['lut'])}':interp=tetrahedral")
    if edl.get("vignette_angle", 0) > 0:
        f.append(f"vignette=angle={edl['vignette_angle']}")
    dur = n / fps
    if slot.get("fade_in", 0) > 0:
        f.append(f"fade=t=in:st=0:d={slot['fade_in']:.3f}")
    if slot.get("fade_out", 0) > 0:
        f.append(f"fade=t=out:st={max(0.0, dur - slot['fade_out']):.3f}:d={slot['fade_out']:.3f}")
    f += ["setsar=1", "format=yuv420p"]
    src_len = (slot.get("src_len") or 0) + 0.5
    return (["ffmpeg", "-v", "error", "-y", "-ss", f"{max(0.0, pre):.3f}", "-t", f"{src_len:.3f}",
             "-i", slot["source"], "-vf", ",".join(f)] + enc)


def _render_segment(args):
    slot, edl, out = args
    run(segment_cmd(slot, edl, out))
    return out


def _loudnorm(music: str, total: float, target: float, tmp: Path) -> str:
    """İki geçişli loudnorm filtre dizisini döndürür."""
    base = f"atrim=0:{total:.3f},asetpts=PTS-STARTPTS"
    p = run(["ffmpeg", "-hide_banner", "-nostats", "-i", music, "-af",
             f"{base},loudnorm=I={target}:TP=-1.0:LRA=11:print_format=json", "-f", "null", "-"], check=False)
    m = re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", p.stderr, re.S)
    if not m:
        return f"{base},loudnorm=I={target}:TP=-1.0:LRA=11"
    d = json.loads(m.group(0))
    return (f"{base},loudnorm=I={target}:TP=-1.0:LRA=11:measured_I={d['input_i']}:measured_TP={d['input_tp']}"
            f":measured_LRA={d['input_lra']}:measured_thresh={d['input_thresh']}:offset={d['target_offset']}"
            f":linear=true")


def _sfx_inputs(edl: dict, sfx_dir: Path):
    """Kararmalarda whoosh, bölüm başlarında impact. Dosya yoksa boş döner."""
    if not edl.get("sfx") or not sfx_dir.exists():
        return []
    whoosh = sorted(sfx_dir.glob("whoosh*.wav"))
    impact = sorted(sfx_dir.glob("impact*.wav"))
    events = []
    prev_section = None
    for s in edl["slots"]:
        if impact and s.get("section") != prev_section and s["kind"] != "black" and s["t"] > 0:
            events.append((str(impact[len(events) % len(impact)]), s["t"]))
        prev_section = s.get("section")
        if whoosh and s.get("fade_out", 0) > 0:
            events.append((str(whoosh[len(events) % len(whoosh)]), max(0.0, s["t"] + s["dur"] - 0.35)))
    return events


def _drawtext(texts, W, H) -> list[str]:
    if not texts:
        return []
    font = next((p for p in FONT_CANDIDATES if os.path.exists(p)), None)
    if not font:
        raise FEError("Yazı için kalın bir font bulunamadı (render.FONT_CANDIDATES).")
    out = []
    for t in texts:
        a, b = float(t["start"]), float(t["end"])
        size = int(H * float(t.get("size", 0.07)))
        y = float(t.get("y", 0.5))
        txt = str(t["text"]).replace("\\", "\\\\").replace("'", "’").replace(":", "\\:").replace("%", "\\%")
        fd = min(0.2, (b - a) / 3)
        out.append(
            f"drawtext=fontfile='{_esc(font)}':text='{txt}':fontsize={size}:fontcolor=white"
            f":x=(w-text_w)/2:y=h*{y}-text_h/2:enable='between(t,{a},{b})'"
            f":alpha='if(lt(t,{a + fd}),(t-{a})/{fd},if(gt(t,{b - fd}),({b}-t)/{fd},1))'")
    return out


def render(paths: dict, name: str, jobs: int | None = None) -> Path:
    edl = load_json(paths["edl"], "plan")
    segdir = paths["proxies"] / "segments"
    if segdir.exists():
        shutil.rmtree(segdir)
    segdir.mkdir(parents=True)
    work = [(s, edl, segdir / f"seg_{s['index']:04d}.mp4") for s in edl["slots"]]
    jobs = jobs or max(1, (os.cpu_count() or 2) // 2)
    log(f"{len(work)} parça render ediliyor ({jobs} paralel)")
    done = 0
    with ThreadPoolExecutor(jobs) as ex:
        for _ in ex.map(_render_segment, work):
            done += 1
            if done % 25 == 0 or done == len(work):
                log(f"  {done}/{len(work)}")
    lst = segdir / "list.txt"
    lst.write_text("".join(f"file '{w[2].name}'\n" for w in work))
    video = paths["proxies"] / "video_noaudio.mp4"
    run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", video])

    W, H = edl["output"]["width"], edl["output"]["height"]
    total = edl["output"]["duration"]
    final = paths["exports"] / f"{name}.mp4"
    cmd = ["ffmpeg", "-v", "error", "-y", "-i", video]
    music = edl.get("music")
    events = _sfx_inputs(edl, paths["audio"] / "sfx") if music else []
    vf = _drawtext(edl.get("texts"), W, H)
    if music:
        cmd += ["-i", music]
        for f, _ in events:
            cmd += ["-i", f]
        chain = _loudnorm(music, total, edl["target_lufs"], paths["proxies"])
        fc = [f"[1:a]{chain},aresample=48000[m]"]
        if events:
            labels = ["[m]"]
            for k, (_, t) in enumerate(events):
                ms = int(t * 1000)
                fc.append(f"[{k + 2}:a]aresample=48000,volume=-8dB,adelay={ms}|{ms}[s{k}]")
                labels.append(f"[s{k}]")
            fc.append(f"{''.join(labels)}amix=inputs={len(labels)}:normalize=0,alimiter=limit=0.89[aout]")
        else:
            fc[-1] = fc[-1].replace("[m]", "[aout]")
        if vf:
            fc.append(f"[0:v]{','.join(vf)}[vout]")
        cmd += ["-filter_complex", ";".join(fc), "-map", "[vout]" if vf else "0:v", "-map", "[aout]"]
        cmd += ["-c:a", "aac", "-b:a", "320k", "-ar", "48000"]
    elif vf:
        cmd += ["-vf", ",".join(vf)]
    if vf:
        cmd += ["-c:v", "libx264", "-preset", edl.get("preset", "medium"), "-crf", str(edl.get("crf", 16)),
                "-pix_fmt", "yuv420p"]
    else:
        cmd += ["-c:v", "copy"]
    cmd += ["-t", f"{total:.3f}", "-movflags", "+faststart", final]
    run(cmd)
    log(f"Çıktı: {final}")
    return final
