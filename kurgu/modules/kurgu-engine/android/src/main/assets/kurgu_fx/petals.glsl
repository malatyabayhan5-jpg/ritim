// Yaprak yağmuru: rüzgârla çapraz savrulan, dönerek düşen çiçek yaprakları
// (ya da sonbahar yaprakları). Yaprak şekli ucunda çentikli bir elips; dönüşe
// göre daralır, kökü koyu, kenarı açık. Yakındaki yapraklar büyük ve yumuşak.
// P0: x=yoğunluk  y=boyut  z=rüzgâr  w=renk (0 pembe çiçek, 1 sonbahar)
vec4 petal(vec2 uv, float scale, float t, float size, float dens, float lid, float blur) {
  vec2 p = uv * vec2(aspect(), 1.0) * scale;
  float wind = mix(0.1, 1.2, uP0.z);
  p += vec2(-t * wind, t);
  vec2 id = floor(p);
  vec2 f = fract(p) - 0.5;
  vec2 h = hash22(id + lid * 23.0);
  if (h.x > dens) return vec4(0.0);
  f -= (hash22(id + 2.0) - 0.5) * 0.4;
  f.x += sin(t * 1.8 + h.y * 20.0) * 0.12;
  float spin = t * (1.0 + h.y * 2.0) + h.x * 30.0;
  vec2 q = rot2(f, spin * 0.6 + h.y * TAU);
  q.x /= max(abs(cos(spin)), 0.25);                 // dönerken daralma
  float s = size * mix(0.14, 0.24, hash12(id + 6.0));
  q /= s;
  // Çentikli elips: uçta küçük V
  float e = length(q * vec2(1.0, 0.62)) - 1.0;
  float notch = 0.35 - length(q - vec2(0.0, 1.55)) ;
  float d = max(e, notch);
  float m = smoothstep(blur, -blur, d);
  vec3 pink = mix(vec3(1.0, 0.72, 0.82), vec3(0.98, 0.86, 0.9), hash12(id));
  vec3 autumn = mix(vec3(0.85, 0.3, 0.08), vec3(0.95, 0.7, 0.15), hash12(id));
  vec3 c = mix(pink, autumn, uP0.w);
  c *= 0.75 + 0.3 * smoothstep(-1.2, 0.9, q.y);     // kök koyu
  c += smoothstep(-0.3, 0.0, e) * 0.06;
  return vec4(c, m);
}
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  float t = uTime * 0.35 + uSeed * 10.0;
  float size = mix(0.6, 1.5, uP0.y);
  float dens = mix(0.1, 0.45, uP0.x);
  vec3 col = src;
  vec4 a = petal(uv, 8.0, t * 2.4, size, dens, 1.0, 0.08);
  col = mix(col, a.rgb * 0.88, a.a * 0.9 * uAmount);
  vec4 b = petal(uv + 0.4, 4.5, t * 1.7, size, dens, 2.0, 0.1);
  col = mix(col, b.rgb, b.a * 0.95 * uAmount);
  vec4 c = petal(uv + 0.8, 2.2, t * 1.2, size, dens * 0.6, 3.0, 0.3);
  col = mix(col, c.rgb, c.a * 0.85 * uAmount);
  return vec4(col, 1.0);
}
