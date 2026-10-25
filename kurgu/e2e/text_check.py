#!/usr/bin/env python3
"""Dışa aktarılan videoda metin katmanının ve giriş animasyonunun izini arar.

Metin varsayılan stilde beyaz ve kalındır, kanvasın ortasında durur. Seçilen anlarda kare
640x360'a küçültülür (daha küçükte harf çizgileri arka planla karışıp beyazlığını yitirir,
CI #95) ve yalnızca orta bant (yükseklik %30–70, genişlik %15–85) incelenir; çok açık
pikseller (R, G, B ≥ 225) "metin" sayılır, sayıları ve dikey ağırlık merkezleri alınır:

  önce     başlangıçtan 300 ms önce: taban (videonun kendi açık pikselleri)
  ortada   giriş animasyonunun %40'ı: metin hareket ediyor ya da yarı saydam olmalı
  yerleşik animasyon bittikten 400 ms sonra: metin tam görünür
  sonra    bitişten 300 ms sonra: metin kaybolmuş olmalı; metin videonun sonuna kadar
           sürüyorsa bunun yerine "çıkışta" (çıkış animasyonunun %60'ı): yine hareket ya
           da saydamlık izi aranır

Animasyon kanıtı: ortadaki karede açık piksel sayısı yerleşik karenin %85'inden az
(silinme/belirme) ya da ağırlık merkezi en az 4 satır farklı (kayma). Bağımlılık: ffmpeg.

  python3 text_check.py cikti.mp4 BAŞLANGIÇ_MS BİTİŞ_MS ANİM_MS   -> çıkış 0: geçti
"""
import subprocess
import sys

W, H = 640, 360
Y0, Y1 = int(H * 0.3), int(H * 0.7)
X0, X1 = int(W * 0.15), int(W * 0.85)
SHIFT = 4.0
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
    for y in range(Y0, Y1):
        row = y * W * 3
        for x in range(X0, X1):
            p = row + x * 3
            if buf[p] >= LIGHT and buf[p + 1] >= LIGHT and buf[p + 2] >= LIGHT:
                n += 1
                ys += y
    return n, (ys / n if n else -1.0)


def duration_ms(path):
    out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path],
                         capture_output=True, text=True, check=True).stdout.strip()
    return int(float(out) * 1000)


def main():
    path, start, end, anim = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4])
    total = duration_ms(path)
    tail = end + 300 < total - 50
    times = {
        'önce': max(0, start - 300),
        'ortada': start + int(anim * 0.4),
        'yerleşik': start + anim + 400,
    }
    if tail:
        times['sonra'] = end + 300
    else:
        times['çıkışta'] = end - int(anim * 0.4)
    st = {k: light_stats(frame_at(path, t)) for k, t in times.items()}
    desc = ', '.join(f'{k} {times[k]} ms: {st[k][0]} px (y {st[k][1]:.1f})' for k in times)
    base = st['önce'][0]
    full, cy = st['yerleşik']
    mid, my = st['ortada']
    visible = full >= max(30, base * 2 + 20)
    animated = visible and (mid < full * 0.85 or (my >= 0 and abs(my - cy) >= SHIFT))
    if tail:
        gone = st['sonra'][0] <= max(base * 2 + 20, full * 0.5)
        last = ('bitişten sonra kaybolmuyor', gone)
        ok_text = 'bitişte kayboluyor'
    else:
        on, oy = st['çıkışta']
        gone = on < full * 0.85 or (oy >= 0 and abs(oy - cy) >= SHIFT)
        last = ('çıkış animasyonu izi yok', gone)
        ok_text = 'çıkış animasyonu var (metin videonun sonuna kadar)'
    if visible and animated and gone:
        print(f'Metin testi: GEÇTİ (görünür, giriş animasyonu var, {ok_text}) — {desc}')
        return 0
    why = [w for w, ok in (('metin görünmüyor', visible), ('giriş animasyonu izi yok', animated), last) if not ok]
    print(f'Metin testi: BAŞARISIZ ({", ".join(why)}) — {desc}')
    return 1


if __name__ == '__main__':
    sys.exit(main())
