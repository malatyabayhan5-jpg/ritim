// Solarizasyon (Sabattier etkisi): banyo sırasında ışığa maruz kalan film gibi
// eşiğin üstündeki tonlar tersine döner. Açık-koyu sınırlarında karanlık
// "Mackie çizgileri" oluşur. Gümüşi tek renk ile özgün renk arasında karışır.
// P0: x=eşik  y=Mackie çizgileri  z=özgün renk
vec3 solar(vec3 c, float t) {
  // Eşiğe kadar yükselir, sonra yumuşak bir tepeyle tersine iner
  vec3 up = c / t;
  vec3 down = (1.0 - c) / (1.0 - t);
  vec3 s = min(up, down);
  return clamp(s, 0.0, 1.0);
}
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  float t = mix(0.35, 0.75, uP0.x);
  vec3 sc = solar(src, t);
  vec3 mono = vec3(luma(sc)) * vec3(0.98, 1.0, 1.04);
  vec3 col = mix(mono, sc, uP0.z);
  // Mackie çizgisi: parlaklık gradyanı büyük olan sınırlar koyulaşır
  vec2 d = vec2(1.5 / uRes.y / aspect(), 1.5 / uRes.y) * (min(uRes.x, uRes.y) / 540.0);
  float gx = luma(tex(uv + vec2(d.x, 0.0)).rgb) - luma(tex(uv - vec2(d.x, 0.0)).rgb);
  float gy = luma(tex(uv + vec2(0.0, d.y)).rgb) - luma(tex(uv - vec2(0.0, d.y)).rgb);
  float g = length(vec2(gx, gy));
  float line = smoothstep(0.04, 0.22, g);
  col *= 1.0 - line * 0.85 * uP0.y;
  // Hafif kontrast: baskı kâğıdı yoğunluğu
  col = col * col * (3.0 - 2.0 * col) * 0.35 + col * 0.65;
  return vec4(mix(src, col, uAmount), 1.0);
}
