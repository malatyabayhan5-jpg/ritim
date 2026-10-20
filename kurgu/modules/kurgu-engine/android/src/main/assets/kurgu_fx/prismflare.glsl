// Prizma parlaması: seçilen noktadaki ışık kaynağından objektif parlaması.
// Kaynakta yumuşak çekirdek ve ince ışın yıldızı, çevresinde gökkuşağı halkası;
// kaynaktan kadraj merkezinden geçen eksen boyunca renkli altıgen ve yuvarlak
// "hayalet" yansımalar dizilir. Işınlar hafifçe parıldar.
// P0: x=kaynak yatay  y=kaynak dikey  z=hayaletler  w=gökkuşağı
float hexagon(vec2 p, float r) {
  p = abs(p);
  return max(dot(p, vec2(0.866, 0.5)), p.y) - r;
}
vec3 spectral(float t) {
  return clamp(vec3(1.5 - abs(t * 4.0 - 3.0), 1.5 - abs(t * 4.0 - 2.0), 1.5 - abs(t * 4.0 - 1.0)), 0.0, 1.0);
}
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  vec2 p = centered(uv);
  vec2 s = centered(vec2(uP0.x, uP0.y));
  vec2 d = p - s;
  float r = length(d);
  float a = atan(d.y, d.x);
  float tw = 0.85 + 0.15 * sin(uTime * 2.3);
  vec3 col = vec3(0.0);
  // Çekirdek ve geniş hale
  col += vec3(1.0, 0.92, 0.8) * (exp(-r * r * 900.0) * 1.2 + exp(-r * 9.0) * 0.35);
  // Işın yıldızı: açısal gürültüyle ince ışınlar
  float rays = pow(vnoise(vec2(a * 9.0, uSeed * 10.0 + uTime * 0.2)), 6.0) + pow(abs(cos(a * 3.0)), 60.0) * 0.6;
  col += vec3(1.0, 0.95, 0.85) * rays * exp(-r * 5.0) * 0.8 * tw;
  // Gökkuşağı halkası
  float ring = exp(-pow((r - 0.22) * 45.0, 2.0));
  col += spectral(clamp((r - 0.2) * 25.0, 0.0, 1.0)) * ring * 0.35 * uP0.w;
  // Hayaletler: kaynaktan merkeze ve ötesine eksen üzerinde
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float k = -0.35 - fi * 0.33 + hash11(fi + 3.0) * 0.15;   // eksen konumu (merkezin karşı tarafı negatif)
    vec2 gp = s * k;
    float size = mix(0.025, 0.1, hash11(fi * 7.1));
    vec2 q = p - gp;
    float sh = i == 1 || i == 4 ? hexagon(q, size) : length(q) - size;
    float disk = smoothstep(0.006, -0.006, sh);
    float edge = smoothstep(0.012, 0.0, abs(sh)) * 0.6;
    vec3 tint = mix(vec3(0.6, 0.8, 1.0), spectral(fract(fi * 0.37 + 0.2)), uP0.w);
    col += tint * (disk * 0.1 + edge * 0.07) * uP0.z;
  }
  // Kaynak kadraj dışına yaklaştıkça zayıflar
  col *= uAmount;
  return vec4(screen(src, clamp(col, 0.0, 1.0)), 1.0);
}
