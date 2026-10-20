// Işık hızı yıldızları: kameraya doğru uçan yıldızlar merkezden dışa doğru
// çizgiler halinde akar; uzaklaştıkça hızlanır, uzar ve parlar. Sahne hafifçe
// karartılır (uzay derinliği). Kutupsal koordinatlarda açısal dilimler ve
// her dilimde döngüsel derinlik.
// P0: x=yoğunluk  y=hız  z=çizgi uzunluğu  w=karartma
vec3 starLayer(vec2 p, float t, float bins, float dens, float lid) {
  float r = length(p);
  float a = atan(p.y, p.x) / TAU + 0.5;
  float bin = floor(a * bins);
  float fa = fract(a * bins) - 0.5;
  float h = hash11(bin * 1.7 + lid * 31.0);
  if (h > dens) return vec3(0.0);
  // Derinlik döngüsü: z 1'den 0'a; ekran yarıçapı ~ 0.05 / z
  float z = fract(hash11(bin * 3.1 + lid) - t * (0.25 + h * 0.3));
  float rs = 0.04 / max(z, 0.02);
  float len = rs * mix(0.05, 0.5, uP0.z) * (1.0 - z);
  float along = smoothstep(rs - len, rs, r) * smoothstep(rs + 0.01, rs, r);
  float width = abs(fa) * r * TAU / bins;          // açısal uzaklık -> gerçek uzaklık
  float w = 0.0015 + 0.002 * (1.0 - z);
  float m = along * smoothstep(w, 0.0, width);
  vec3 c = mix(vec3(0.7, 0.85, 1.0), vec3(1.0), hash11(bin + 5.0));
  return c * m * (1.0 - z) * 1.6;
}
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  vec2 p = centered(uv);
  float t = uTime * mix(0.3, 2.0, uP0.y) + uSeed * 5.0;
  float dens = mix(0.25, 0.85, uP0.x);
  vec3 s = starLayer(p, t, 220.0, dens, 1.0) + starLayer(p, t * 0.8, 150.0, dens, 2.0);
  vec3 col = src * mix(1.0, mix(0.85, 0.3, uP0.w), uAmount);
  col = screen(col, clamp(s * uAmount, 0.0, 1.0));
  return vec4(col, 1.0);
}
