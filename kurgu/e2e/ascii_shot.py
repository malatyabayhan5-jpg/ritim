#!/usr/bin/env python3
"""Ekran görüntülerini CI günlüğünde okunabilir küçük ASCII görüntüye çevirir.

Yapıtlar bu ortamdan indirilemediği için klonun ekran görüntüsü günlükten incelenir.
Birden çok PNG yan yana basılır (aynı satır sayısına ölçeklenir). Kenar haritası
değil parlaklık: koyu = boşluk, açık = yoğun karakter.

    python3 ascii_shot.py ref.png clone.png --cols 38
"""

import argparse
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".claude", "skills", "replica-diff"))
import imgdiff  # noqa: E402

RAMP = " .:-=+*#%@"


def to_ascii(path, cols, rows):
    w, h, px = imgdiff.read_png(path)
    out = []
    for r in range(rows):
        y0, y1 = r * h // rows, max(r * h // rows + 1, (r + 1) * h // rows)
        line = []
        for c in range(cols):
            x0, x1 = c * w // cols, max(c * w // cols + 1, (c + 1) * w // cols)
            s = n = 0
            for y in range(y0, y1, max(1, (y1 - y0) // 4)):
                row = px[y]
                for x in range(x0, x1, max(1, (x1 - x0) // 4)):
                    p = row[x]
                    s += (299 * p[0] + 587 * p[1] + 114 * p[2]) // 1000
                    n += 1
            line.append(RAMP[min(len(RAMP) - 1, (s // max(1, n)) * len(RAMP) // 256)])
        out.append("".join(line))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("png", nargs="+")
    ap.add_argument("--cols", type=int, default=38)
    ap.add_argument("--rows", type=int, default=42)
    a = ap.parse_args()
    shots = []
    for p in a.png:
        try:
            shots.append((os.path.basename(p), to_ascii(p, a.cols, a.rows)))
        except Exception as e:  # yalnızca tanı çıktısı; hata akışı bozmaz
            shots.append((os.path.basename(p), ["(okunamadı: %s)" % e] + [""] * (a.rows - 1)))
    print("  ".join(name[: a.cols].ljust(a.cols) for name, _ in shots))
    for i in range(a.rows):
        print("  ".join(s[i].ljust(a.cols) if i < len(s) else " " * a.cols for _, s in shots))


if __name__ == "__main__":
    main()
