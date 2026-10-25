#!/usr/bin/env python3
"""Dışa aktarılan videoda metin katmanının ve giriş animasyonunun izini arar.

Metin varsayılan stilde beyaz ve kalındır. Seçilen anlarda kare küçültülür; çok açık
pikseller (R, G, B ≥ 225) "metin" sayılır, sayıları ve dikey ağırlık merkezleri alınır:

  önce     başlangıçtan 300 ms önce: taban (videonun kendi açık pikselleri)
  ortada   giriş animasyonunun %40'ı: metin hareket ediyor ya da yarı saydam olmalı
  yerleşik animasyon bittikten 400 ms sonra: metin tam görünür
  sonra    bitişten 300 ms sonra: metin kaybolmuş olmalı

Animasyon kanıtı: ortadaki karede açık piksel sayısı yerleşik karenin %85'inden az
(silinme/belirme) ya da ağırlık merkezi en az 1,5 satır farklı (kayma). Bağımlılık: ffmpeg.

  python3 text_check.py cikti.mp4 BAŞLANGIÇ_MS BİTİŞ_MS ANİM_MS   -> çıkış 0: geçti
"""
import subprocess
import sys

W, H = 160, 90
LIGHT = 225


def frame_at(path, ms):
    cmd = ['ffmpeg', '-v', 'error', '-ss', f'{ms / 1000:.3f}', '-i', path, '-frames:v', '1',
           '-vf', f'scale={W}:{H}', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']
    buf = subprocess.run(cmd, capture_output=True, check=True).stdout
    if len(buf) < W * H * 3:
        raise RuntimeError(f'{ms} ms: kare okunamadı')
    return buf


def light_stats(buf):
    n = 0
    ys = 0.0
    for i in range(W * H):
        p = i * 3
        if buf[p] >= LIGHT and buf[p + 1] >= LIGHT and buf[p + 2] >= LIGHT:
            n += 1
            ys += i // W
    return n, (ys / n if n else -1.0)


def main():
    path, start, end, anim = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4])
    times = {
        'önce': max(0, start - 300),
        'ortada': start + int(anim * 0.4),
        'yerleşik': start + anim + 400,
        'sonra': end + 300,
    }
    st = {k: light_stats(frame_at(path, t)) for k, t in times.items()}
    desc = ', '.join(f'{k} {times[k]} ms: {st[k][0]} px (y {st[k][1]:.1f})' for k in times)
    base = st['önce'][0]
    full, cy = st['yerleşik']
    mid, my = st['ortada']
    after = st['sonra'][0]
    visible = full >= max(15, base * 2 + 10)
    animated = visible and (mid < full * 0.85 or (my >= 0 and abs(my - cy) >= 1.5))
    gone = after <= max(base * 2 + 10, full * 0.5)
    if visible and animated and gone:
        print(f'Metin testi: GEÇTİ (görünür, giriş animasyonu var, bitişte kayboluyor) — {desc}')
        return 0
    why = [w for w, ok in (('metin görünmüyor', visible), ('giriş animasyonu izi yok', animated), ('bitişten sonra kaybolmuyor', gone)) if not ok]
    print(f'Metin testi: BAŞARISIZ ({", ".join(why)}) — {desc}')
    return 1


if __name__ == '__main__':
    sys.exit(main())
