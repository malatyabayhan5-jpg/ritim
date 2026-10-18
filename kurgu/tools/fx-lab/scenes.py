"""Efekt kalite kontrolü için özgün, lisanssız test sahneleri üretir (prosedürel).
Kullanım: python3 scenes.py <çıktı-klasörü>"""
import sys, os, math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

out = sys.argv[1] if len(sys.argv) > 1 else "scenes"
os.makedirs(out, exist_ok=True)
rng = np.random.default_rng(7)

def fbm1d(n, octaves=5, seed=0):
    r = np.random.default_rng(seed)
    x = np.linspace(0, 1, n)
    y = np.zeros(n)
    amp, freq = 1.0, 2.0
    for _ in range(octaves):
        ph = r.uniform(0, 2 * math.pi, 3)
        y += amp * (np.sin(x * freq * 2 * math.pi + ph[0]) * 0.6 + np.sin(x * freq * 4.1 * math.pi + ph[1]) * 0.4)
        amp *= 0.5; freq *= 2.1
    return y

def sunset(W=960, H=540):
    y = np.linspace(0, 1, H)[:, None]
    top = np.array([0.10, 0.12, 0.35]); mid = np.array([0.95, 0.45, 0.25]); low = np.array([1.0, 0.82, 0.45])
    t = y
    sky = np.where(t < 0.55, top + (mid - top) * (t / 0.55), mid + (low - mid) * ((t - 0.55) / 0.45))
    img = np.repeat(sky[:, None, :], W, axis=1).reshape(H, W, 3)
    yy, xx = np.mgrid[0:H, 0:W]
    d = np.hypot(xx - W * 0.62, yy - H * 0.58)
    img += (np.exp(-(d / 28) ** 2) * 1.2)[..., None] * np.array([1, 0.95, 0.8])
    img += (np.exp(-(d / 160) ** 2) * 0.35)[..., None] * np.array([1, 0.6, 0.3])
    for k, (base, amp, col, seed) in enumerate([(0.62, 0.10, (0.35, 0.18, 0.28), 1), (0.70, 0.08, (0.18, 0.10, 0.18), 2), (0.80, 0.05, (0.07, 0.05, 0.09), 3)]):
        ridge = (base + amp * fbm1d(W, seed=seed) / 2) * H
        mask = yy > ridge[None, :]
        img[mask] = np.array(col)
    water = yy > H * 0.86
    refl = img[(2 * int(H * 0.86) - yy).clip(0, H - 1), xx] * 0.55
    ripple = 0.05 * np.sin(yy * 0.9 + np.sin(xx * 0.05) * 2)
    img[water] = (refl + ripple[..., None])[water]
    return img

def night_city(W=960, H=540):
    yy, xx = np.mgrid[0:H, 0:W]
    img = np.zeros((H, W, 3)) + np.array([0.02, 0.03, 0.08]) + (1 - yy / H)[..., None] * np.array([0.03, 0.04, 0.12])
    im = Image.fromarray((img.clip(0, 1) * 255).astype(np.uint8))
    dr = ImageDraw.Draw(im)
    x = 0
    while x < W:
        w = int(rng.integers(50, 120)); h = int(rng.integers(150, 420))
        dr.rectangle([x, H - h, x + w, H], fill=(14, 15, 24))
        for wy in range(H - h + 12, H - 20, 18):
            for wx in range(x + 8, x + w - 10, 14):
                if rng.random() < 0.45:
                    c = (255, 210, 130) if rng.random() < 0.7 else (150, 200, 255)
                    dr.rectangle([wx, wy, wx + 6, wy + 9], fill=c)
        x += w + int(rng.integers(2, 10))
    arr = np.asarray(im).astype(float) / 255
    for _ in range(26):
        cx, cy = rng.uniform(0, W), rng.uniform(H * 0.75, H)
        r = rng.uniform(8, 26)
        col = np.array([1.0, 0.75, 0.35]) if rng.random() < 0.6 else np.array([1.0, 0.3, 0.35])
        d = np.hypot(xx - cx, yy - cy)
        arr += (np.exp(-(d / r) ** 2) * 0.9)[..., None] * col
    return arr

def portrait(W=960, H=540):
    yy, xx = np.mgrid[0:H, 0:W]
    bg = np.array([0.20, 0.32, 0.38]) + (xx / W)[..., None] * np.array([0.15, 0.08, 0.02])
    img = bg + 0.04 * np.sin(yy / 40)[..., None]
    cx, cy = W * 0.5, H * 0.42
    # omuzlar
    sh = ((xx - cx) / 260) ** 2 + ((yy - H * 1.05) / 230) ** 2 < 1
    img[sh] = np.array([0.55, 0.12, 0.16])
    neck = (abs(xx - cx) < 42) & (yy > cy + 60) & (yy < H * 0.82)
    img[neck] = np.array([0.80, 0.58, 0.46])
    # yüz: gölgelendirilmiş elips
    nx, ny = (xx - cx) / 105, (yy - cy) / 135
    face = nx ** 2 + ny ** 2 < 1
    shade = (0.85 + 0.25 * (-nx * 0.6 - ny * 0.3)).clip(0.55, 1.1)
    skin = np.array([0.93, 0.70, 0.57])
    img[face] = (skin[None, :] * shade[face][:, None])
    hair = ((nx ** 2 + ((yy - cy + 40) / 130) ** 2 < 1.1) & (yy < cy - 40)) | ((abs(nx) > 0.92) & (nx ** 2 + ny ** 2 < 1.25) & (yy < cy + 40))
    img[hair] = np.array([0.12, 0.08, 0.06])
    for ex in (-38, 38):
        e = ((xx - cx - ex) / 15) ** 2 + ((yy - cy + 10) / 8) ** 2 < 1
        img[e] = np.array([0.95, 0.95, 0.95])
        p = ((xx - cx - ex) / 6) ** 2 + ((yy - cy + 10) / 6) ** 2 < 1
        img[p] = np.array([0.15, 0.10, 0.08])
    m = ((xx - cx) / 34) ** 2 + ((yy - cy - 62) / 9) ** 2 < 1
    img[m] = np.array([0.75, 0.30, 0.32])
    # anahtar ışık: sağ üstte parlak pencere
    d = np.hypot(xx - W * 0.86, yy - H * 0.18)
    img += (np.exp(-(d / 60) ** 2) * 0.9)[..., None]
    return img

def chart(W=960, H=540):
    im = Image.new("RGB", (W, H), (245, 245, 240))
    dr = ImageDraw.Draw(im)
    cols = [(230, 40, 50), (250, 170, 20), (40, 170, 80), (30, 120, 220), (140, 60, 200), (20, 20, 20)]
    for i, c in enumerate(cols):
        dr.rectangle([40 + i * 150, 40, 170 + i * 150, 200], fill=c)
    for x in range(0, W, 12):
        dr.line([x, 230, x, 330], fill=(0, 0, 0), width=1)
    for i in range(10):
        dr.ellipse([60 + i * 85, 360, 120 + i * 85, 420], outline=(0, 0, 0), width=3)
    for i in range(0, W, 2):
        v = int(255 * i / W)
        dr.line([i, 450, i, 510], fill=(v, v, v))
    return np.asarray(im).astype(float) / 255

def save(name, arr):
    Image.fromarray((arr.clip(0, 1) * 255).astype(np.uint8)).save(os.path.join(out, name + ".png"))

save("sunset", sunset())
save("night", night_city())
save("portrait", portrait())
save("chart", chart())
print("ok")
