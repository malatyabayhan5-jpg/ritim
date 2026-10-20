// Uçan kalpler: aşağıdan yukarı süzülen, hafifçe sallanıp dönen kalpler.
// Kalp şekli bu dosyadaki uzaklık fonksiyonuyla çizilir; içi degrade ve
// sol üstte parlak bir yansıma taşır, yükselirken belirip kaybolur.
// P0: x=yoğunluk  y=boyut  z=hız  w=renk (0 pembe, 0.5 kırmızı, 1 karışık)
// Cebirsel kalp eğrisi: (x² + y² - 1)³ - x² y³ <= 0 içeride
float heart(vec2 p) {
  p.y += 0.15;
  float a = dot(p, p) - 1.0;
  return a * a * a - p.x * p.x * p.y * p.y * p.y;
}
vec4 hLayer(vec2 uv, float scale, float t, float size, float dens, float lid) {
  vec2 p = uv * vec2(aspect(), 1.0) * scale;
  p.y -= t;
  vec2 id = floor(p);
  vec2 f = fract(p) - 0.5;
  vec2 h = hash22(id + lid * 13.0);
  if (h.x > dens) return vec4(0.0);
  f.x -= (h.y - 0.5) * 0.16 + sin(t * 2.0 + h.x * 30.0) * 0.05;
  f = rot2(f, sin(t * 1.5 + h.y * 20.0) * 0.35);
  float s = size * mix(0.55, 1.0, hash12(id + 5.0)) * 0.25;
  vec2 q = f / s;
  float d = heart(q);
  float m = smoothstep(0.04, -0.04, d);
  // Yaşam: yükseldikçe belir ve kaybol (ekran konumuna bağlı)
  float life = smoothstep(0.0, 0.25, uv.y) * smoothstep(1.05, 0.7, uv.y);
  vec3 pink = vec3(1.0, 0.45, 0.65);
  vec3 red = vec3(0.92, 0.12, 0.22);
  vec3 base = uP0.w < 0.5 ? mix(pink, red, uP0.w * 2.0) : mix(red, hsv2rgb(vec3(0.9 + hash12(id) * 0.25, 0.6, 1.0)), uP0.w * 2.0 - 1.0);
  vec3 c = base * (0.72 + 0.38 * smoothstep(-1.0, 1.0, q.y));
  c += smoothstep(0.3, 0.0, length(q - vec2(-0.5, 0.45))) * 0.45;
  return vec4(c, m * life);
}
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  float t = uTime * mix(0.1, 0.5, uP0.z) + uSeed * 10.0;
  float size = mix(0.6, 1.5, uP0.y);
  float dens = mix(0.12, 0.5, uP0.x);
  vec3 col = src;
  vec4 a = hLayer(uv, 7.0, t * 7.0 * 0.7, size, dens, 1.0);
  col = mix(col, a.rgb * 0.85, a.a * 0.85 * uAmount);
  vec4 b = hLayer(uv + 0.5, 3.5, t * 3.5, size, dens * 0.8, 2.0);
  col = mix(col, b.rgb, b.a * 0.95 * uAmount);
  return vec4(col, 1.0);
}
