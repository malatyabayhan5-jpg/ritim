// Aşırı sıkıştırma: düşük kaliteli JPEG gibi 8x8 bloklar. Blok içinde ayrıntı
// kaybolur (köşe örneklerinden çift doğrusal yeniden kurulum), renk 16x16
// bloklarda ortalanır ve kenarlara taşar, keskin kenarlarda halka (ringing)
// izleri oluşur; bazı bloklar bozuk DC değeriyle yanlış renk alır.
// P0: x=blok boyutu  y=renk taşması  z=bozulma
vec3 toYcc(vec3 c) { return vec3(dot(c, vec3(0.299, 0.587, 0.114)), dot(c, vec3(-0.169, -0.331, 0.5)), dot(c, vec3(0.5, -0.419, -0.081))); }
vec3 fromYcc(vec3 y) { return vec3(y.x + 1.402 * y.z, y.x - 0.344 * y.y - 0.714 * y.z, y.x + 1.772 * y.y); }
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  float bs = floor(mix(6.0, 22.0, uP0.x) * max(min(uRes.x, uRes.y) / 720.0, 0.75));
  vec2 pix = uv * uRes;
  vec2 b = floor(pix / bs);
  vec2 f = fract(pix / bs);
  // Luma: blok içi 2x2 örnekten çift doğrusal yeniden kurulum (yüksek frekans kaybı)
  vec2 o0 = (b + 0.25) * bs / uRes;
  vec2 o1 = (b + 0.75) * bs / uRes;
  float y00 = toYcc(tex(o0).rgb).x; float y10 = toYcc(tex(vec2(o1.x, o0.y)).rgb).x;
  float y01 = toYcc(tex(vec2(o0.x, o1.y)).rgb).x; float y11 = toYcc(tex(o1).rgb).x;
  vec2 w = clamp((f - 0.25) / 0.5, 0.0, 1.0);
  float y = mix(mix(y00, y10, w.x), mix(y01, y11, w.x), w.y);
  // Halka izi: yerel kontrastın büyük olduğu bloklarda dalgalanma
  float contrast = max(max(y00, y10), max(y01, y11)) - min(min(y00, y10), min(y01, y11));
  y += sin((f.x + f.y) * PI * 4.0) * contrast * 0.08;
  // Renk: 2 blokluk bölgede ortalanmış, taşan
  vec2 cb = (floor(pix / (bs * 2.0)) + 0.5) * bs * 2.0 / uRes;
  vec2 chroma = mix(toYcc(src).yz, toYcc(tex(cb).rgb).yz, mix(0.4, 1.0, uP0.y));
  chroma = floor(chroma * 14.0 + 0.5) / 14.0;
  vec3 col = fromYcc(vec3(floor(y * 24.0 + 0.5) / 24.0, chroma));
  // Bozuk akış: kod çözücü yukarıdan aşağı okur; hata noktasından sonraki tüm
  // bloklar kayık okunur (yatay blok kayması) ve yanlış DC (parlaklık/renk
  // ofseti) alır. Hata anları zamanla gelir gider.
  float fr = floor(uTime * 4.0);
  float on = step(1.0 - mix(0.0, 0.9, uP0.z), hash11(fr * 1.7 + 0.3));
  float rows = floor(uRes.y / bs);
  float rowTop = rows - 1.0 - b.y;
  float r0 = floor(hash11(fr * 3.3) * rows * 0.8);
  float x0 = floor(hash11(fr * 5.1) * uRes.x / bs);
  float bad = on * (step(r0 + 0.5, rowTop) + step(abs(rowTop - r0), 0.5) * step(x0, b.x));
  bad = min(bad, 1.0);
  float shiftK = floor((hash11(fr * 7.7) - 0.5) * 12.0);
  vec3 sc = tex((b + vec2(shiftK, 0.0) + 0.5) * bs / uRes).rgb;
  vec3 scy = toYcc(sc);
  vec2 offC = (hash22(vec2(fr, 2.0)) - 0.5) * 0.35;
  vec3 wrong = fromYcc(vec3(scy.x * 0.9 + (hash11(fr * 9.1) - 0.5) * 0.25, scy.yz + offC));
  col = mix(col, wrong, bad);
  return vec4(mix(src, col, uAmount), 1.0);
}
