// Pop-art kolaj: 2x2 ızgaranın her karesi görüntünün farklı, üç tonlu ve
// cesur renkli bir afiş baskısıdır (gölge, orta ton, ışık). Ton sınırları
// yumuşatılmış; kareler arasında ince boşluk.
// P0: x=boşluk  y=kontrast  z=palet kaydırma
void pal(float k, out vec3 a, out vec3 b, out vec3 c) {
  if (k < 0.5) { a = vec3(0.12, 0.05, 0.32); b = vec3(0.96, 0.2, 0.5); c = vec3(1.0, 0.9, 0.25); }
  else if (k < 1.5) { a = vec3(0.04, 0.24, 0.22); b = vec3(1.0, 0.5, 0.1); c = vec3(0.65, 0.95, 0.92); }
  else if (k < 2.5) { a = vec3(0.28, 0.04, 0.06); b = vec3(0.18, 0.58, 1.0); c = vec3(1.0, 0.95, 0.78); }
  else { a = vec3(0.08, 0.08, 0.1); b = vec3(0.62, 0.22, 0.92); c = vec3(0.45, 1.0, 0.45); }
}
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  vec2 cell = floor(uv * 2.0);
  vec2 l = fract(uv * 2.0);
  float gap = uP0.x * 0.05;
  vec2 inner = (l - 0.5) / (1.0 - gap) + 0.5;
  vec3 c0 = tex(inner).rgb;
  float lum = luma(c0);
  float k = mix(1.0, 2.2, uP0.y);
  lum = clamp((lum - 0.5) * k + 0.5, 0.0, 1.0);
  float idx = mod(cell.x + (1.0 - cell.y) * 2.0 + floor(uP0.z * 3.99), 4.0);
  vec3 a; vec3 b; vec3 c;
  pal(idx, a, b, c);
  float s1 = smoothstep(0.3, 0.36, lum);
  float s2 = smoothstep(0.62, 0.68, lum);
  vec3 col = mix(mix(a, b, s1), c, s2);
  vec2 e = abs(inner - 0.5);
  float inside = step(max(e.x, e.y), 0.5);
  col = mix(vec3(0.97, 0.96, 0.92), col, inside);
  return vec4(mix(src, col, uAmount), 1.0);
}
