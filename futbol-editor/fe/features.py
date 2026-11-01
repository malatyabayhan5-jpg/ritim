"""Görüntü analizi: kare özellikleri, kesim tespiti, kamera hareketi, yüz, renk."""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from .util import MODELS_DIR, grab_frame, iter_frames, probe

ANALYSIS_WIDTH = 320


# ---------------------------------------------------------------- renk uzayı
def srgb_to_linear(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def linear_to_srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055)


_M = np.array([[0.4124564, 0.3575761, 0.1804375],
               [0.2126729, 0.7151522, 0.0721750],
               [0.0193339, 0.1191920, 0.9503041]])
_MI = np.linalg.inv(_M)
_WHITE = np.array([0.95047, 1.0, 1.08883])


def rgb_to_lab(rgb):
    """rgb: (...,3) 0-1 sRGB → CIELAB."""
    xyz = srgb_to_linear(rgb) @ _M.T / _WHITE
    e = 216 / 24389
    k = 24389 / 27
    f = np.where(xyz > e, np.cbrt(xyz), (k * xyz + 16) / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


def lab_to_rgb(lab):
    fy = (lab[..., 0] + 16) / 116
    fx = fy + lab[..., 1] / 500
    fz = fy - lab[..., 2] / 200
    e = 216 / 24389
    k = 24389 / 27
    f = np.stack([fx, fy, fz], -1)
    xyz = np.where(f ** 3 > e, f ** 3, (116 * f - 16) / k)
    xyz[..., 1] = np.where(lab[..., 0] > k * e, fy ** 3, lab[..., 0] / k)
    return linear_to_srgb((xyz * _WHITE) @ _MI.T)


# ---------------------------------------------------------- kare özellikleri
def luma(f):
    return 0.2126 * f[..., 0] + 0.7152 * f[..., 1] + 0.0722 * f[..., 2]


def color_hist(rgb_u8):
    q = (rgb_u8[::2, ::2] >> 5).astype(np.int32)  # 8 seviye/kanal
    idx = q[..., 0] * 64 + q[..., 1] * 8 + q[..., 2]
    h = np.bincount(idx.ravel(), minlength=512).astype(np.float32)
    return h / h.sum()


def sharpness(gray):
    lap = 4 * gray[1:-1, 1:-1] - gray[:-2, 1:-1] - gray[2:, 1:-1] - gray[1:-1, :-2] - gray[1:-1, 2:]
    return float(lap.var())


def green_ratio(f, y):
    r, g, b = f[..., 0], f[..., 1], f[..., 2]
    mx = f.max(-1)
    mn = f.min(-1)
    sat = (mx - mn) / np.maximum(mx, 1e-3)
    return float(((g > r * 1.08) & (g > b * 1.03) & (sat > 0.15) & (y > 0.10)).mean())


def saturation(f):
    mx = f.max(-1)
    mn = f.min(-1)
    return float(((mx - mn) / np.maximum(mx, 1e-3)).mean())


# ----------------------------------------------------- kamera hareketi (faz)
_WIN_CACHE: dict = {}


def _phase_corr(a, b):
    key = a.shape
    if key not in _WIN_CACHE:
        _WIN_CACHE[key] = np.outer(np.hanning(a.shape[0]), np.hanning(a.shape[1]))
    w = _WIN_CACHE[key]
    A = np.fft.fft2((a - a.mean()) * w)
    B = np.fft.fft2((b - b.mean()) * w)
    R = A * np.conj(B)
    R /= np.abs(R) + 1e-9
    r = np.fft.ifft2(R).real
    iy, ix = np.unravel_index(int(r.argmax()), r.shape)
    h, wd = r.shape

    def sub(c, l, rr):  # parabolik alt-piksel
        d = l - 2 * c + rr
        return 0.0 if abs(d) < 1e-9 else 0.5 * (l - rr) / d

    dy = iy + sub(r[iy, ix], r[(iy - 1) % h, ix], r[(iy + 1) % h, ix])
    dx = ix + sub(r[iy, ix], r[iy, (ix - 1) % wd], r[iy, (ix + 1) % wd])
    if dy > h / 2:
        dy -= h
    if dx > wd / 2:
        dx -= wd
    return -dx, -dy  # b'nin a'ya göre kayması


def camera_motion(g0, g1):
    """İki gri kare arasında (dx, dy, zoom) tahmini. dx,dy kare genişliğine oranla; zoom >1 = yaklaşma."""
    h, w = g0.shape
    dx, dy = _phase_corr(g0, g1)
    lx, _ = _phase_corr(g0[:, : w // 2], g1[:, : w // 2])
    rx, _ = _phase_corr(g0[:, w // 2:], g1[:, w // 2:])
    _, ty = _phase_corr(g0[: h // 2], g1[: h // 2])
    _, by = _phase_corr(g0[h // 2:], g1[h // 2:])
    zx = (rx - lx) / (w / 2)
    zy = (by - ty) / (h / 2)
    return dx / w, dy / h, 1.0 + (zx + zy) / 2


# ------------------------------------------------------------------ yüzler
class FaceTools:
    """OpenCV YuNet (tespit) + SFace (tanıma). Modeller yoksa available=False."""

    def __init__(self):
        self.available = False
        self.recognizer = None
        try:
            import cv2  # noqa
        except ImportError:
            self.reason = "opencv-python-headless kurulu değil"
            return
        det = MODELS_DIR / "face_detection_yunet_2023mar.onnx"
        rec = MODELS_DIR / "face_recognition_sface_2021dec.onnx"
        if not det.exists():
            self.reason = f"{det.name} yok (kurulum.sh modelleri indirir)"
            return
        import cv2
        self.cv2 = cv2
        self.detector = cv2.FaceDetectorYN.create(str(det), "", (320, 320), 0.7, 0.3, 50)
        if rec.exists():
            self.recognizer = cv2.FaceRecognizerSF.create(str(rec), "")
        self.available = True
        self.reason = ""

    def detect(self, rgb):
        """En büyük yüz: (alan_oranı, merkez_x_oranı, merkez_y_oranı, ham_satır) veya None."""
        if not self.available:
            return None
        bgr = np.ascontiguousarray(rgb[..., ::-1])
        h, w = bgr.shape[:2]
        self.detector.setInputSize((w, h))
        _, faces = self.detector.detect(bgr)
        if faces is None or len(faces) == 0:
            return None
        f = max(faces, key=lambda r: r[2] * r[3])
        return float(f[2] * f[3] / (w * h)), float((f[0] + f[2] / 2) / w), float((f[1] + f[3] / 2) / h), f

    def embed(self, rgb, face_row):
        if self.recognizer is None:
            return None
        bgr = np.ascontiguousarray(rgb[..., ::-1])
        aligned = self.recognizer.alignCrop(bgr, face_row)
        e = self.recognizer.feature(aligned).ravel().astype(np.float32)
        return e / (np.linalg.norm(e) + 1e-9)


# --------------------------------------------------------- video tarama
@dataclass
class Scan:
    info: dict
    fps: float
    t: np.ndarray                 # kare zamanları
    luma: np.ndarray              # ortalama parlaklık 0-1
    sat: np.ndarray
    green: np.ndarray
    sharp: np.ndarray
    diff: np.ndarray              # ardışık kare mutlak farkı (hareket enerjisi)
    hist_d: np.ndarray            # ardışık renk histogramı farkı (kesim)
    corr: np.ndarray              # ardışık gri karelerin yapı korelasyonu (kararma ≠ kesim)
    chroma_d: np.ndarray          # ardışık karelerin ortalama renk tonu farkı
    motion_cx: np.ndarray         # hareketin yatay ağırlık merkezi 0-1
    cam: list = field(default_factory=list)       # (t0, t1, dx, dy, zoom)
    keyframes: list = field(default_factory=list)  # (t, rgb uint8 küçük)
    corner_ratio: float = 1.0     # köşe/merkez parlaklık oranı (vinyet)
    lab_samples: np.ndarray | None = None


def scan_video(path, fps: float, keyframe_every: float = 0.5, cam_step: float | None = 0.2) -> Scan:
    info = probe(path)
    if not info.get("has_video"):
        raise ValueError(f"{path}: video akışı yok")
    fps = min(fps, info["fps"] or fps)
    cam_k = max(1, int(round(cam_step * fps))) if cam_step else 0
    key_k = max(1, int(round(keyframe_every * fps)))
    T, L, S, G, SH, D, HD, CX, CR, CH = ([] for _ in range(10))
    cam, keys, gray_ring = [], [], []
    corner_sum = center_sum = 0.0
    lab_pool = []
    prev_gray = prev_hist = prev_chroma = None
    for i, (t, rgb) in enumerate(iter_frames(path, fps, ANALYSIS_WIDTH, info)):
        f = rgb.astype(np.float32) / 255.0
        y = luma(f)
        g = y[::2, ::2]
        hist = color_hist(rgb)
        m = f[::4, ::4].reshape(-1, 3).mean(0)
        chroma = m / max(float(m.sum()), 1e-3)
        T.append(t)
        L.append(float(y.mean()))
        S.append(saturation(f[::2, ::2]))
        G.append(green_ratio(f[::2, ::2], g))
        SH.append(sharpness(g))
        if prev_gray is None:
            D.append(0.0)
            HD.append(0.0)
            CX.append(0.5)
            CR.append(0.0)
            CH.append(0.0)
        else:
            ad = np.abs(g - prev_gray)
            D.append(float(ad.mean()))
            HD.append(float(0.5 * np.abs(hist - prev_hist).sum()))
            col = ad.sum(0)
            CX.append(float((col * np.arange(col.size)).sum() / max(col.sum(), 1e-6) / col.size))
            a0, a1 = prev_gray - prev_gray.mean(), g - g.mean()
            den = float(np.sqrt((a0 * a0).sum() * (a1 * a1).sum()))
            CR.append(float((a0 * a1).sum() / den) if den > 1e-6 else (1.0 if a0.std() < 1e-3 and a1.std() < 1e-3 else 0.0))
            CH.append(float(np.abs(chroma - prev_chroma).sum()))
        if cam_k:
            gray_ring.append(g)
            if len(gray_ring) > cam_k + 1:
                gray_ring.pop(0)
        if cam_k and i % cam_k == 0 and len(gray_ring) == cam_k + 1:
            dx, dy, z = camera_motion(gray_ring[0], gray_ring[-1])
            cam.append((t - cam_k / fps, t, dx, dy, z))
        if i % key_k == 0:
            keys.append((t, rgb.copy()))
            if L[-1] > 0.08:
                hh, ww = y.shape
                ch, cw = hh // 5, ww // 5
                corners = np.concatenate([y[:ch, :cw].ravel(), y[:ch, -cw:].ravel(), y[-ch:, :cw].ravel(), y[-ch:, -cw:].ravel()])
                corner_sum += float(corners.mean())
                center_sum += float(y[2 * ch:3 * ch, 2 * cw:3 * cw].mean())
                lab_pool.append(rgb_to_lab(f[::8, ::8].reshape(-1, 3)))
        prev_gray, prev_hist, prev_chroma = g, hist, chroma
    if not T:
        raise ValueError(f"{path}: kare okunamadı")
    return Scan(info=info, fps=fps, t=np.array(T), luma=np.array(L), sat=np.array(S), green=np.array(G),
                sharp=np.array(SH), diff=np.array(D), hist_d=np.array(HD), corr=np.array(CR),
                chroma_d=np.array(CH), motion_cx=np.array(CX), cam=cam,
                keyframes=keys, corner_ratio=corner_sum / center_sum if center_sum else 1.0,
                lab_samples=np.concatenate(lab_pool) if lab_pool else None)


def detect_cuts(scan: Scan, threshold: float = 0.28, ratio: float = 3.0, min_gap: float = 0.05) -> list[float]:
    """Sert kesim zamanları. Histogram farkı hem mutlak eşiği hem yerel ortancanın 'ratio' katını aşmalı."""
    hd = scan.hist_d
    n = len(hd)
    cuts = []
    win = max(3, int(scan.fps * 0.25))
    for i in range(1, n):
        lo, hi = max(1, i - win), min(n, i + win + 1)
        neigh = np.concatenate([hd[lo:i], hd[i + 1:hi]])
        med = float(np.median(neigh)) if neigh.size else 0.0
        # siyahtan/siyaha geçişte histogram zaten çok değişir; çok karanlık karelerde kesim sayma
        both_dark = scan.luma[i] < 0.03 and scan.luma[i - 1] < 0.03
        # aynı görüntünün parlaklığı değişiyorsa (kararma/açılma/flaş) kesim değildir
        same_image = scan.corr[i] > 0.85 and scan.chroma_d[i] < 0.06
        if not same_image and scan.chroma_d[i] < 0.06:
            # kararma/açılma: parlaklık kesimin iki yanında da düzgün ve tek yönlü değişiyor
            k = max(2, int(scan.fps * 0.1))
            seg = scan.luma[max(0, i - k):min(n, i + k + 1)]
            steps = np.diff(seg)
            total = abs(seg[-1] - seg[0])
            if len(seg) > 3 and (np.all(steps <= 1e-3) or np.all(steps >= -1e-3)) \
                    and total > 0.15 * max(seg.max(), 1e-3) \
                    and np.abs(steps).max() <= 0.4 * total and (np.abs(steps) > 1e-3).mean() >= 0.5:
                same_image = True  # tek bir sıçrama değil, kademeli değişim
        if hd[i] > threshold and hd[i] > ratio * max(med, 0.02) and not both_dark and not same_image:
            t = float(scan.t[i])
            if not cuts or t - cuts[-1] >= min_gap:
                cuts.append(t)
    return cuts


def segment_shots(scan: Scan, cuts: list[float]) -> list[dict]:
    """Kesimlere göre çekimler ve her çekimin özellikleri."""
    end = float(scan.t[-1] + 1 / scan.fps)
    bounds = [0.0] + cuts + [end]
    shots = []
    for a, b in zip(bounds[:-1], bounds[1:]):
        m = (scan.t >= a - 1e-6) & (scan.t < b - 1e-6)
        if not m.any():
            continue
        idx = np.nonzero(m)[0]
        inner = idx[1:] if len(idx) > 1 else idx  # ilk kare kesim farkını taşır
        lum = scan.luma[idx]
        cams = [c for c in scan.cam if c[0] >= a - 1e-6 and c[1] <= b + 1e-6]
        zoom_rate = 0.0
        pan = 0.0
        if cams:
            span = sum(c[1] - c[0] for c in cams)
            zoom_rate = float(np.log(np.prod([max(0.5, min(2.0, c[4])) for c in cams])) / span) if span else 0.0
            pan = float(np.mean([abs(c[2]) for c in cams]) / ((cams[0][1] - cams[0][0]) or 1))
        sharp = scan.sharp[idx]
        shots.append({
            "start": round(a, 4), "end": round(b, 4), "dur": round(b - a, 4),
            "luma": float(lum.mean()), "luma_first": float(lum[:2].mean()), "luma_last": float(lum[-2:].mean()),
            "sat": float(scan.sat[idx].mean()), "green": float(scan.green[idx].mean()),
            "motion": float(scan.diff[inner].mean()) if len(inner) else 0.0,
            "motion_cx": float(np.median(scan.motion_cx[inner])) if len(inner) else 0.5,
            "sharp": float(np.median(sharp)),
            "zoom_rate": round(zoom_rate, 4),   # log-ölçek/sn; + yaklaşma
            "pan_rate": round(pan, 4),          # kare genişliği/sn
            "dup_ratio": float((scan.diff[inner] < 0.0015).mean()) if len(inner) else 0.0,
            "_idx": (int(idx[0]), int(idx[-1])),
        })
    return shots


def black_splits(scan: Scan, cuts: list[float], dark: float = 0.02, min_len: float = 0.25) -> list[float]:
    """Siyah bölümlerin (≥min_len) başlangıç/bitişini ek kesim noktası olarak döndürür."""
    out, i, n = [], 0, len(scan.luma)
    while i < n:
        if scan.luma[i] < dark:
            j = i
            while j < n and scan.luma[j] < dark:
                j += 1
            if (j - i) / scan.fps >= min_len:
                for t in (float(scan.t[i]), float(scan.t[j]) if j < n else None):
                    if t and t > 0 and all(abs(t - c) > 0.05 for c in cuts + out):
                        out.append(t)
            i = j
        else:
            i += 1
    return sorted(out)


def fade_profile(scan: Scan, shot: dict, dark: float = 0.03) -> tuple[float, float]:
    """Çekimin başındaki siyahtan açılma ve sonundaki siyaha kararma sürelerini (sn) tahmin eder."""
    i0, i1 = shot["_idx"]
    lum = scan.luma[i0:i1 + 1]
    n = len(lum)
    if n < 4 or lum.max() < 3 * dark:
        return 0.0, 0.0
    w = max(1, int(scan.fps * 0.05))
    sm = np.convolve(lum, np.ones(w) / w, mode="same")
    k = max(1, int(scan.fps * 0.1))
    fin = fout = 0.0
    if lum[-1] < dark:
        j = n - 1
        while j - k >= 0 and sm[j - k] > sm[j] + 0.003:
            j -= k
        fout = (n - 1 - j) / scan.fps
    if lum[0] < dark:
        j = 0
        while j + k < n and sm[j + k] > sm[j] + 0.003:
            j += k
        fin = j / scan.fps
    return round(fin, 3), round(fout, 3)


def classify(shot: dict) -> str:
    """Çekim ölçeği: black / closeup / wide / medium."""
    if shot["luma"] < 0.03:
        return "black"
    face = shot.get("face_area") or 0.0
    if face >= 0.015 and shot["green"] < 0.45:
        return "closeup"
    if shot["green"] >= 0.30:
        return "wide"
    return "medium"


def attach_faces(shots: list[dict], scan: Scan, faces: FaceTools, want_embed: bool = False) -> None:
    """Her çekimin kendi karelerinde en büyük yüzü bulur (anahtar kare yoksa ortadaki kare okunur)."""
    for s in shots:
        s["face_area"] = 0.0
        s["face_cx"] = None
        if not faces.available:
            continue
        ks = [k for k in scan.keyframes if s["start"] - 1e-6 <= k[0] < s["end"]]
        if not ks:
            mid = (s["start"] + s["end"]) / 2
            rgb = grab_frame(scan.info["path"], mid, width=ANALYSIS_WIDTH * 2)
            ks = [(mid, rgb)] if rgb is not None else []
        best = None
        for t, rgb in ks[:6]:
            r = faces.detect(rgb)
            if r and (best is None or r[0] > best[0][0]):
                best = (r, rgb)
        if best:
            (area, cx, _cy, row), rgb = best
            s["face_area"] = round(area, 5)
            s["face_cx"] = round(cx, 4)
            if want_embed and area >= 0.004:
                e = faces.embed(rgb, row)
                if e is not None:
                    s["_emb"] = e
