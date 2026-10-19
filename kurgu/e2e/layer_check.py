#!/usr/bin/env python3
"""Katman testi çıktısını denetler (6_katmanlar.yaml).

Beklenen: mor ızgaralı fotoğraf (0x8B6CFF, 1080x1350) kanvas ortasında, ölçek 0,5,
daire maskesi (yarıçap = katman yarı yüksekliğinin yarısı), 0–3 sn arasında görünür.
Ölçütler:
  1) 1,0 ve 2,0 sn: daire içi bölgede mor piksel oranı >= 0,6
  2) 1,0 sn: katman kutusunun köşesine yakın (maske dışı) bölgede mor oranı <= 0,05
  3) 4,5 ve 6,0 sn: daire içi bölgede mor oranı <= 0,05 (katman bitti)
"""
import subprocess
import sys

PURPLE = (0x8B, 0x6C, 0xFF)


def frame(path, t):
    probe = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", path], capture_output=True, text=True, check=True)
    w, h = [int(x) for x in probe.stdout.strip().split(",")[:2]]
    raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", str(t), "-i", path, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True, check=True).stdout
    return w, h, raw


def purple_ratio(w, h, raw, cx, cy, r):
    n = 0
    hit = 0
    step = max(1, int(r / 12))
    for y in range(int(cy - r), int(cy + r) + 1, step):
        for x in range(int(cx - r), int(cx + r) + 1, step):
            if x < 0 or y < 0 or x >= w or y >= h or (x - cx) ** 2 + (y - cy) ** 2 > r * r:
                continue
            o = (y * w + x) * 3
            p = raw[o:o + 3]
            n += 1
            # Mor veya ızgara beyazı (fotoğrafın kendisi)
            d = max(abs(p[0] - PURPLE[0]), abs(p[1] - PURPLE[1]), abs(p[2] - PURPLE[2]))
            if d < 48 or min(p) > 225:
                hit += 1
    return hit / max(1, n)


def main(path):
    ok = True
    lines = []
    for t, expect_on in ((1.0, True), (2.0, True), (4.5, False), (6.0, False)):
        w, h, raw = frame(path, t)
        A = w / h
        src = 1080 / 1350
        bw, bh = (w * 0.5, w * 0.5 / src) if src > A else (h * 0.5 * src, h * 0.5)
        cx, cy = w / 2, h / 2
        inner = purple_ratio(w, h, raw, cx, cy, bh * 0.25 * 0.6)
        good = inner >= 0.6 if expect_on else inner <= 0.05
        lines.append(f"{t}sn daire içi mor oranı {inner:.2f} ({'beklenen görünür' if expect_on else 'beklenen yok'})")
        ok &= good
        if t == 1.0:
            corner = purple_ratio(w, h, raw, cx + bw * 0.4, cy - bh * 0.4, min(bw, bh) * 0.06)
            lines.append(f"{t}sn maske dışı köşe mor oranı {corner:.2f} (beklenen ~0)")
            ok &= corner <= 0.05
    print("; ".join(lines))
    print("Katman testi: " + ("GEÇTİ (konum, maske ve zaman aralığı doğru)" if ok else "BAŞARISIZ"))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
