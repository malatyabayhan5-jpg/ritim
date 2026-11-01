"""Sentetik videolarla hızlı regresyon testleri: python -m unittest discover -s tests"""
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fe.features import black_splits, detect_cuts, fade_profile, rgb_to_lab, lab_to_rgb, scan_video, segment_shots  # noqa: E402
from fe.plan import build_lut, _frames, vignette_angle  # noqa: E402


def make_video(path, parts, fps=30, size="320x240"):
    """parts: [(renk, süre, fade_out_süresi)] → sert kesimli, isteğe bağlı siyaha kararan test videosu."""
    inputs, chains = [], []
    for i, (color, dur, fout) in enumerate(parts):
        inputs += ["-f", "lavfi", "-i", f"color=c={color}:s={size}:r={fps}:d={dur}"]
        f = f"[{i}:v]format=yuv420p"
        if fout:
            f += f",fade=t=out:st={dur - fout}:d={fout}"
        chains.append(f + f"[v{i}]")
    fc = ";".join(chains) + ";" + "".join(f"[v{i}]" for i in range(len(parts))) + f"concat=n={len(parts)}:v=1[o]"
    subprocess.run(["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex", fc, "-map", "[o]",
                    "-c:v", "libx264", "-crf", "18", str(path)], check=True)


class TestColor(unittest.TestCase):
    def test_lab_roundtrip(self):
        rgb = np.random.default_rng(0).random((500, 3))
        self.assertLess(np.abs(lab_to_rgb(rgb_to_lab(rgb)) - rgb).max(), 1e-4)

    def test_identity_lut(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "id.cube"
            build_lut(p, np.array([50.0, 0, 0]), np.array([20.0, 10, 10]), [50.0, 0, 0], [20.0, 10, 10], size=9)
            rows = np.loadtxt(p, skiprows=2)
            g = np.linspace(0, 1, 9)
            self.assertLess(abs(rows[1, 0] - g[1]), 1e-3)   # R en hızlı değişen eksen
            self.assertLess(abs(rows[9, 1] - g[1]), 1e-3)

    def test_vignette(self):
        self.assertEqual(vignette_angle(1.0, 1.0), 0.0)
        self.assertGreater(vignette_angle(0.8, 0.95), 0.1)


class TestTiming(unittest.TestCase):
    def test_frames_sum_matches(self):
        times = [0, 0.1, 0.217, 1.03, 2.5]
        self.assertEqual(sum(_frames(times, 60)), round(2.5 * 60))


class TestScan(unittest.TestCase):
    def test_cuts_and_dip(self):
        with tempfile.TemporaryDirectory() as d:
            v = Path(d) / "t.mp4"
            make_video(v, [("red", 1.0, 0), ("green", 1.0, 0.4), ("blue", 0.5, 0), ("black", 0.6, 0), ("white", 0.5, 0)])
            scan = scan_video(v, fps=30, keyframe_every=0.5, cam_step=None)
            cuts = detect_cuts(scan)
            cuts = sorted(cuts + black_splits(scan, cuts))
            for want in (1.0, 2.0, 2.5, 3.1):
                self.assertTrue(any(abs(c - want) < 0.07 for c in cuts), f"{want} kesimi bulunamadı: {cuts}")
            shots = segment_shots(scan, cuts)
            green = next(s for s in shots if abs(s["start"] - 1.0) < 0.07)
            _, fout = fade_profile(scan, green)
            self.assertGreater(fout, 0.2)


if __name__ == "__main__":
    unittest.main()
