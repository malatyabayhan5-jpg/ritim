// Sinyal kaybı: anten yayını kopuyor. Aralıklarla görüntü dikeyde kayar
// (dikey senkron kaçması), renk çekilir, karlanma (statik parazit) bantlar
// halinde ya da tüm ekranda belirir; aralarda görüntü sakinleşir.
// P0: x=karlanma  y=dikey kayma  z=sıklık
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  float t = uTime;
  // Kesinti zarfı: her dönemin ilk yarısında bir kesinti, gürültüyle düzensizleşir
  float period = mix(4.0, 1.5, uP0.z);
  float ph = fract(t / period);
  float env = smoothstep(0.0, 0.06, ph) * smoothstep(0.5, 0.38, ph) * (0.65 + 0.35 * (snoise1(t * 3.0 + uSeed * 7.0) * 0.5 + 0.5));
  // Dikey kayma: kesinti sırasında görüntü yukarı akar
  float roll = env * mix(0.0, 1.2, uP0.y) * fract(t * 0.7);
  vec2 q = vec2(uv.x, fract(uv.y + roll));
  vec3 col = tex(q).rgb;
  // Kare ayrım çizgisi (siyah yatay bant) kayma sırasında görünür
  float bar = smoothstep(0.03, 0.0, abs(fract(uv.y + roll) - 0.015)) * step(0.01, roll);
  col *= 1.0 - bar * 0.9;
  // Renk kaybı
  col = mix(col, vec3(luma(col)), env * 0.7);
  // Karlanma: piksel gürültüsü + yatay statik bantları
  float fr = floor(t * 30.0);
  float n = hash12(floor(uv * uRes * 0.5) + fr * 13.0);
  float bands = smoothstep(0.4, 0.9, vnoise(vec2(uv.y * 8.0, t * 6.0)));
  float snow = clamp(env * (0.35 + bands * 0.65), 0.0, 1.0) * uP0.x;
  col = mix(col, vec3(n), snow * 0.85);
  // Sakin dönemde bile hafif parazit
  col += (n - 0.5) * 0.04 * uP0.x;
  return vec4(mix(src, col, uAmount), 1.0);
}
