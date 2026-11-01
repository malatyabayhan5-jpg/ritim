"""Komut satırı: python -m fe <komut> ...

Tam otomatik:
  python -m fe run --ref referans.mp4 --player "Leandro Trossard"
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .util import FEError, log, project_paths, save_json, slugify


def _paths(args):
    root = Path(args.project) if args.project else Path(args.projects_root) / slugify(args.player or "proje")
    return project_paths(root)


def _ensure_config(paths, player):
    from .plan import DEFAULT_CONFIG
    if not paths["config"].exists():
        save_json(paths["config"], {**DEFAULT_CONFIG, "player": player or ""})


def main(argv=None):
    ap = argparse.ArgumentParser(prog="fe", description="Otomatik futbol editörü")
    ap.add_argument("--projects-root", default="projeler", help="proje klasörlerinin kökü")
    sub = ap.add_subparsers(dest="cmd", required=True)

    def common(p, ref=False, player=False):
        p.add_argument("--project", help="proje klasörü (varsayılan: projeler/<oyuncu>)")
        p.add_argument("--player", required=player, help="hedef futbolcu adı")
        if ref:
            p.add_argument("--ref", required=True, help="referans video")

    d = sub.add_parser("doctor", help="ortamı test et")
    d.add_argument("--offline", action="store_true", help="internet testini atla")
    d.add_argument("--cookies")

    a = sub.add_parser("analyze", help="1) referans analizi")
    common(a, ref=True)
    f = sub.add_parser("fetch", help="2-3) klip ara ve indir")
    common(f, player=True)
    for p in (f,):
        p.add_argument("--max-videos", type=int, default=12)
        p.add_argument("--cookies", help="YouTube bot doğrulaması için cookies.txt")
        p.add_argument("--urls", help="arama yerine indirilecek URL listesi (satır başına bir URL)")
        p.add_argument("--local", help="indirme yerine bu klasördeki videoları kullan")
    s = sub.add_parser("shots", help="4) kaynak çekim analizi + oyuncu doğrulama")
    common(s)
    pl = sub.add_parser("plan", help="5-6) eşleme, renk LUT, ses planı")
    common(pl)
    r = sub.add_parser("render", help="7-8) render")
    common(r)
    r.add_argument("--jobs", type=int)
    q = sub.add_parser("qc", help="9) kalite kontrol")
    common(q)
    q.add_argument("--video", help="kontrol edilecek mp4 (varsayılan: son çıktı)")

    run_p = sub.add_parser("run", help="hepsini sırayla çalıştır")
    common(run_p, ref=True, player=True)
    run_p.add_argument("--max-videos", type=int, default=12)
    run_p.add_argument("--cookies")
    run_p.add_argument("--urls")
    run_p.add_argument("--local")
    run_p.add_argument("--skip-fetch", action="store_true", help="01_FOOTAGE'daki mevcut klipleri kullan")
    run_p.add_argument("--jobs", type=int)

    args = ap.parse_args(argv)
    try:
        if args.cmd == "doctor":
            from .doctor import check, print_report
            return 0 if print_report(check(network=not args.offline, cookies=args.cookies)) else 1

        paths = _paths(args)
        name = slugify(args.player or paths["root"].name)
        if args.cmd in ("analyze", "run"):
            _ensure_config(paths, args.player)
            from .analyze import analyze_reference
            analyze_reference(Path(args.ref), paths)
        if args.cmd == "fetch" or (args.cmd == "run" and not args.skip_fetch):
            from .fetch import fetch
            urls = Path(args.urls).read_text().split() if args.urls else None
            fetch(paths, args.player, args.max_videos, args.cookies, urls, Path(args.local) if args.local else None)
        if args.cmd in ("shots", "run"):
            from .shots import analyze_footage
            analyze_footage(paths)
        if args.cmd in ("plan", "run"):
            _ensure_config(paths, args.player)
            from .plan import make_plan
            make_plan(paths)
        video = None
        if args.cmd in ("render", "run"):
            from .render import render
            video = render(paths, name, args.jobs)
        if args.cmd in ("qc", "run"):
            from .qc import quality_check
            video = Path(args.video) if getattr(args, "video", None) else (video or paths["exports"] / f"{name}.mp4")
            rep = quality_check(paths, video)
            return 0 if rep["status"] != "FAIL" else 2
        return 0
    except FEError as e:
        log(f"HATA: {e}")
        return 3


if __name__ == "__main__":
    sys.exit(main())
