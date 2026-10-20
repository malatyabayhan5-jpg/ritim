// Sabun köpükleri: yükselen, sallanan saydam köpükler. İçleri arkadaki
// görüntüyü hafifçe büyütüp kırar; ince zarın kenarında açıya ve zamana göre
// akan yanardöner renkler, üstte parlak bir pencere yansıması vardır.
// P0: x=yoğunluk  y=boyut  z=hız  w=yanardönerlik
vec4 bubble(vec2 uv, float scale, float t, float size, float dens, float lid, out vec2 refr) {
  refr = vec2(0.0);
  vec2 p = uv * vec2(aspect(), 1.0) * scale;
  p.y -= t;
  vec2 id = floor(p);
  vec2 f = fract(p) - 0.5;
  vec2 h = hash22(id + lid * 7.0);
  if (h.x > dens) return vec4(0.0);
  f.x -= (h.y - 0.5) * 0.35 + sin(t * 1.7 + h.x * 25.0) * 0.08;
  float r = size * mix(0.18, 0.38, hash12(id + 2.0));
  // Hafif şekil salınımı
  float a = atan(f.y, f.x);
  float rr = r * (1.0 + 0.03 * sin(a * 2.0 + t * 3.0 + h.y * 9.0));
  float d = length(f) / rr;
  if (d > 1.05) return vec4(0.0);
  float inside = smoothstep(1.0, 0.97, d);
  float rim = smoothstep(0.75, 0.98, d) * inside;
  vec3 iri = hsv2rgb(vec3(fract(a / TAU + d * 0.8 + t * 0.2 + h.y), 0.7, 1.0));
  vec3 c = mix(vec3(1.0), iri, uP0.w) * rim * 0.55;
  c += smoothstep(0.25, 0.0, length(f / rr - vec2(-0.35, 0.4))) * 0.8 * inside;
  c += smoothstep(0.12, 0.0, length(f / rr - vec2(0.3, -0.45))) * 0.25 * inside;
  // Büyüteç gibi: köpük merkezine doğru örnekle (hücre birimi -> ekran birimi)
  refr = f * 0.3 * inside / scale;
  return vec4(c, inside);
}
vec4 fx(vec2 uv) {
  float t = uTime * mix(0.1, 0.6, uP0.z) + uSeed * 10.0;
  float size = mix(0.6, 1.4, uP0.y);
  float dens = mix(0.1, 0.45, uP0.x);
  vec2 r1; vec2 r2;
  vec4 a = bubble(uv, 3.0, t * 3.0, size, dens, 1.0, r1);
  vec4 b = bubble(uv + 0.41, 6.0, t * 4.5, size, dens, 2.0, r2);
  vec2 off = (a.a > 0.0 ? r1 : r2) * uAmount;
  vec3 col = tex(uv - vec2(off.x / aspect(), off.y)).rgb;
  col = screen(col, clamp((a.rgb + b.rgb * (1.0 - a.a) * 0.8) * uAmount, 0.0, 1.0));
  return vec4(col, 1.0);
}
