#!/usr/bin/env python3
"""Dışa aktarılan videoda çift ton (duotone) efekt katmanının izini arar.

Varsayılan duotone paleti (palet=0.1) her pikseli koyu mor A ile pembe B
arasındaki doğru parçasına eşler. Bir karede piksellerin büyük çoğunluğu bu
doğruya yakınsa o kare "efektli" sayılır. Efekt katmanı videonun yalnızca bir
bölümünü kapladığı için hem efektli hem efektsiz kareler bulunmalıdır.
Bağımlılık: ffmpeg (numpy gerekmez).

  python3 fx_check.py cikti.mp4   -> çıkış kodu 0: iz bulundu
"""
import subprocess
import sys

A = (0.13, 0.05, 0.35)
B = (1.0, 0.45, 0.55)
SIZE = 48
STEP = 0.25
NEAR = 0.10  # doğruya en fazla bu kadar uzak piksel "palette" sayılır
FRAC = 0.85  # karede palette olan piksel oranı


def frames(path):
    cmd = ['ffmpeg', '-v', 'error', '-i', path, '-vf', f'fps={1 / STEP},scale={SIZE}:{SIZE}', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    n = SIZE * SIZE * 3
    for i in range(len(raw) // n):
        yield raw[i * n:(i + 1) * n]


def on_palette_fraction(buf):
    d = [B[i] - A[i] for i in range(3)]
    dd = sum(x * x for x in d)
    near = 0
    for p in range(0, len(buf), 3):
        c = [buf[p + i] / 255.0 for i in range(3)]
        t = max(0.0, min(1.0, sum((c[i] - A[i]) * d[i] for i in range(3)) / dd))
        dist2 = sum((c[i] - (A[i] + t * d[i])) ** 2 for i in range(3))
        if dist2 <= NEAR * NEAR:
            near += 1
    return near / (len(buf) / 3)


def main():
    fr = [on_palette_fraction(b) for b in frames(sys.argv[1])]
    hits = [i * STEP for i, f in enumerate(fr) if f >= FRAC]
    print('kare oranları: ' + ' '.join(f'{i * STEP:.2f}s={f:.2f}' for i, f in enumerate(fr)))
    if hits and len(hits) < len(fr):
        print(f'Efekt katmanı (duotone) çıktıda görünüyor: {hits[0]:.2f}s – {hits[-1]:.2f}s ({len(hits)}/{len(fr)} örnek kare)')
        return 0
    if not hits:
        print('Efekt katmanı (duotone) çıktıda bulunamadı')
    else:
        print('Duotone tüm videoya uygulanmış görünüyor (beklenen: yalnızca katman aralığı)')
    return 1


if __name__ == '__main__':
    sys.exit(main())
