// Konfeti: renkli kâğıt parçaları yalpalayarak düşer. Her parça kendi ekseni
// etrafında takla atar (genişliği kosinüsle daralıp genişler, ters yüzü
// daha koyu görünür), sağa sola salınır. Üç derinlik katmanı.
// P0: x=yoğunluk  y=boyut  z=hız  w=renk (0 canlı, 1 pastel/altın)
vec4 piece(vec2 uv, float scale, float t, float size, float dens, float layerId) {
  vec2 p = uv * vec2(aspect(), 1.0) * scale;
  float colId = floor(p.x);
  float sp = 0.6 + hash11(colId * 3.3 + layerId) * 0.8;
  p.y += t * sp;
  vec2 id = floor(p);
  vec2 f = fract(p) - 0.5;
  vec2 h = hash22(id + layerId * 17.0);
  if (h.x > dens) return vec4(0.0);
  f.x += sin(t * 2.0 + h.y * 30.0) * 0.18;
  float spin = t * (2.0 + h.y * 4.0) + h.x * 20.0;
  vec2 q = rot2(f, h.y * TAU + t * (h.x - 0.5) * 2.0);
  float flip = cos(spin);
  vec2 hs = vec2(0.22 * abs(flip) + 0.02, 0.1) * size;
  vec2 dq = abs(q) - hs;
  float m = smoothstep(0.02, -0.02, max(dq.x, dq.y));
  float hue = hash12(id + 9.0);
  vec3 vivid = hsv2rgb(vec3(hue, 0.85, 1.0));
  vec3 pastel = mix(hsv2rgb(vec3(hue, 0.4, 1.0)), vec3(1.0, 0.82, 0.4), step(0.6, hash12(id + 4.0)));
  vec3 c = mix(vivid, pastel, uP0.w);
  c *= flip > 0.0 ? 1.0 : 0.65;                    // arka yüz gölgede
  c += pow(abs(flip), 8.0) * 0.25;                 // yüzey yansıması
  return vec4(c, m);
}
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  float t = uTime * mix(0.3, 1.4, uP0.z) + uSeed * 20.0;
  float size = mix(0.6, 1.5, uP0.y);
  float dens = mix(0.15, 0.6, uP0.x);
  vec3 col = src;
  vec4 a = piece(uv, 4.0, t * 0.8, size * 0.9, dens, 1.0);
  col = mix(col, a.rgb * 0.85, a.a * uAmount);
  vec4 b = piece(uv + 0.3, 7.0, t * 0.65, size, dens, 2.0);
  col = mix(col, b.rgb * 0.75, b.a * uAmount);
  vec4 c = piece(uv + 0.7, 2.6, t, size * 0.85, dens * 0.8, 3.0);
  col = mix(col, c.rgb, c.a * uAmount);
  return vec4(col, 1.0);
}
