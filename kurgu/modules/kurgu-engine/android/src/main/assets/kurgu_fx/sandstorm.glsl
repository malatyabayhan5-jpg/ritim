// Kum fırtınası: turuncu-kahve, yoğun ve kıvrılan bir toz bulutu kontrastı
// yutar; yatay savrulan ince kum taneleri hızla geçer, tozun yoğunluğu dalgalar
// halinde değişir.
// P0: x=yoğunluk  y=rüzgâr  z=sıcaklık
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  vec2 p = uv * vec2(aspect(), 1.0);
  float w = mix(0.2, 1.5, uP0.y);
  float t = uTime * w;
  // Kıvrılan toz bulutu
  vec2 q = p * vec2(1.2, 2.0) + vec2(-t * 0.6, 0.0);
  float n = fbm(q + vec2(fbm(q * 0.7 + t * 0.2) * 1.5, 0.0));
  float dens = clamp(mix(0.25, 0.8, uP0.x) * (0.55 + n * 0.9), 0.0, 0.92);
  vec3 dust = mix(vec3(0.62, 0.52, 0.4), vec3(0.85, 0.55, 0.28), uP0.z);
  dust *= 0.75 + 0.35 * n;
  vec3 col = mix(src, dust * (0.5 + 0.6 * luma(src) + 0.2), dens);
  // Savrulan taneler: yatayda uzatılmış ince çizgiler
  vec2 g = p * vec2(6.0, 140.0) + vec2(-t * 9.0, 0.0);
  vec2 id = floor(g);
  float on = step(0.93, hash12(id));
  float streak = on * smoothstep(0.5, 0.0, abs(fract(g.y) - 0.5)) * hash12(id + 1.0);
  vec2 g2 = p * vec2(10.0, 260.0) + vec2(-t * 14.0, 3.0);
  float on2 = step(0.95, hash12(floor(g2)));
  col += vec3(1.0, 0.85, 0.6) * (streak * 0.35 + on2 * 0.2) * mix(0.4, 1.0, uP0.x);
  return vec4(mix(src, col, uAmount), 1.0);
}
