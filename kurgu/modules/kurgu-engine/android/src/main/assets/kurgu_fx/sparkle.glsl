// Bokeh ışıltı: farklı derinlikte, kenarı yumuşak ve içi hafif aydınlık bokeh
// ışıkları süzülür, nefes alır gibi parlar; küçük, keskin ışıltılar ara sıra
// dört kollu yıldız gibi parlayıp söner. Işıklar ekran karışımıyla eklenir.
// P0: x=yoğunluk  y=boyut  z=renk (0 altın .. 1 çok renkli)  w=yıldız ışıltısı
vec3 lightColor(vec2 cell) {
  vec3 gold = mix(vec3(1.0, 0.7, 0.32), vec3(1.0, 0.88, 0.62), hash12(cell + 2.0));
  vec3 multi = hsv2rgb(vec3(hash12(cell + 5.0), 0.6, 1.0));
  return mix(gold, multi, uP0.z);
}
vec3 bokehLayer(vec2 uv, float scale, float t, float sizeMul, float bright) {
  vec2 p = uv * vec2(aspect(), 1.0) * scale;
  p.y += t * 0.05 * scale;
  p.x += sin(t * 0.25 + floor(p.y) * 1.7) * 0.2;
  vec2 cell = floor(p);
  vec2 f = fract(p);
  if (hash12(cell) > mix(0.15, 0.6, uP0.x)) return vec3(0.0);
  vec2 c = 0.3 + 0.4 * hash22(cell);
  float r = mix(0.18, 0.42, hash12(cell + 4.0)) * sizeMul;
  float d = length(f - c);
  float disk = smoothstep(r, r * 0.86, d);
  float rim = smoothstep(r * 0.55, r * 0.95, d) * disk;
  float glow = exp(-d * d / (r * r * 0.9)) * 0.35;
  float tw = 0.55 + 0.45 * sin(t * (0.8 + 1.6 * hash12(cell + 1.3)) + hash12(cell) * 40.0);
  return lightColor(cell) * (disk * 0.55 + rim * 0.35 + glow) * tw * bright;
}
vec3 twinkles(vec2 uv, float t) {
  vec2 p = uv * vec2(aspect(), 1.0) * 9.0;
  vec2 cell = floor(p);
  vec2 f = fract(p) - (0.25 + 0.5 * hash22(cell + 9.0));
  if (hash12(cell + 11.0) > 0.35) return vec3(0.0);
  float life = pow(max(0.0, sin(t * (1.0 + hash12(cell)) + hash12(cell + 3.0) * TAU)), 8.0);
  float core = exp(-dot(f, f) * 900.0);
  float arms = exp(-abs(f.x) * 260.0) * exp(-abs(f.y) * 14.0) + exp(-abs(f.y) * 260.0) * exp(-abs(f.x) * 14.0);
  return vec3(1.0, 0.97, 0.9) * (core * 1.5 + arms * 0.9) * life;
}
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  float s = mix(0.6, 1.5, uP0.y);
  vec3 b = bokehLayer(uv, 2.6 / s, uTime, 1.0, 0.85)
         + bokehLayer(uv + 0.43, 5.0 / s, uTime * 1.3, 0.8, 0.6)
         + twinkles(uv, uTime * 2.0) * uP0.w;
  return vec4(screen(src, clamp(b * uAmount, 0.0, 1.0)), 1.0);
}
