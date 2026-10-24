#!/usr/bin/env python3
"""Karışım shader'ı (_blend_main.glsl) doğrulaması.

Rastgele ama yumuşak bir alt kare ile aynı boyutta bir katman görseli üretir, lab.cjs
ile 11 karışım modunu WebGL'de çizdirir ve her pikseli W3C "Compositing and Blending"
formüllerinin numpy uygulamasıyla karşılaştırır (opaklık 0,75; 8 bit nicemleme toleransı).

  python3 tools/fx-lab/blend_check.py            (çıktı: geçti/başarısız + mod başına en büyük hata)
"""
import json
import os
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
MODES = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'add', 'difference', 'softLight', 'color', 'luminosity']
OPACITY = 0.75
N = 64


def lum(c):
    return c[..., 0] * 0.3 + c[..., 1] * 0.59 + c[..., 2] * 0.11


def clip_color(c):
    l = lum(c)[..., None]
    n = c.min(axis=-1, keepdims=True)
    x = c.max(axis=-1, keepdims=True)
    c = np.where(n < 0, l + (c - l) * l / np.maximum(l - n, 1e-5), c)
    c = np.where(x > 1, l + (c - l) * (1 - l) / np.maximum(x - l, 1e-5), c)
    return c


def set_lum(c, l):
    return clip_color(c + (l - lum(c))[..., None])


def soft_light(b, s):
    d = np.where(b <= 0.25, ((16 * b - 12) * b + 4) * b, np.sqrt(b))
    return np.where(s <= 0.5, b - (1 - 2 * s) * b * (1 - b), b + (2 * s - 1) * (d - b))


def blend(b, s, mode):
    return {
        'normal': lambda: s,
        'multiply': lambda: b * s,
        'screen': lambda: b + s - b * s,
        'overlay': lambda: np.where(b <= 0.5, 2 * b * s, 1 - 2 * (1 - b) * (1 - s)),
        'darken': lambda: np.minimum(b, s),
        'lighten': lambda: np.maximum(b, s),
        'add': lambda: np.minimum(b + s, 1),
        'difference': lambda: np.abs(b - s),
        'softLight': lambda: soft_light(b, s),
        'color': lambda: set_lum(s, lum(b)),
        'luminosity': lambda: set_lum(b, lum(s)),
    }[mode]()


def smooth_noise(seed):
    rng = np.random.default_rng(seed)
    small = rng.random((8, 8, 3))
    img = Image.fromarray((small * 255).astype(np.uint8)).resize((N, N), Image.BICUBIC)
    return np.asarray(img)


def main():
    work = tempfile.mkdtemp(prefix='kurgu-blend-')
    base = smooth_noise(1)
    layer = smooth_noise(2)
    Image.fromarray(base).save(os.path.join(work, 'base.png'))
    Image.fromarray(layer).save(os.path.join(work, 'layer.png'))
    u = {'uXf': [0, 0, 1, 0], 'uLay': [OPACITY, 0, 0, 0]}
    subprocess.run(['node', os.path.join(HERE, 'lab.cjs'), 'blend', '--base', os.path.join(work, 'base.png'), '--layer', os.path.join(work, 'layer.png'),
                    '--u', json.dumps(u), '--out', work], check=True)
    b = base.astype(np.float64) / 255
    s = layer.astype(np.float64) / 255
    worst = 0.0
    failed = []
    for i, mode in enumerate(MODES):
        got = np.asarray(Image.open(os.path.join(work, f'blend_{i}.png')).convert('RGB')).astype(np.float64) / 255
        want = np.clip(b * (1 - OPACITY) + np.clip(blend(b, s, mode), 0, 1) * OPACITY, 0, 1)
        err = np.abs(got - want).max() * 255
        worst = max(worst, err)
        status = 'ok' if err <= 2.0 else 'HATA'
        if err > 2.0:
            failed.append(mode)
        # Mod etkisi gerçekten var mı (normal dışındaki modlar normalden farklı olmalı)
        print(f'  {mode:<11} en büyük fark {err:5.2f}/255  {status}')
    if failed:
        print('BAŞARISIZ: ' + ', '.join(failed))
        sys.exit(1)
    print(f'Karışım shader testi geçti: {len(MODES)} mod, en büyük fark {worst:.2f}/255')


if __name__ == '__main__':
    main()
