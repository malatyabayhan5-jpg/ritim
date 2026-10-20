// İkili bölünmüş ekran: görüntünün iki kopyası yan yana ya da üst üste.
// Kopyalar sıkıştırılmaz, ortadan kırpılarak bölmeyi doldurur. Otomatik
// düzende bölme uzun kenar boyunca yapılır (yatayda yan yana, dikeyde üst
// üste). İkinci kopya isteğe bağlı aynalanır; aralarda ince bir ayraç.
// P0: x=ayraç  y=ayna  z=düzen (0 otomatik, 0.5 yan yana, 1 üst üste)
vec2 coverUv(vec2 l, float ta) {
  float sa = aspect();
  return ta < sa ? vec2(0.5 + (l.x - 0.5) * ta / sa, l.y) : vec2(l.x, 0.5 + (l.y - 0.5) * sa / ta);
}
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  bool side = uP0.z < 0.34 ? aspect() >= 1.0 : uP0.z < 0.67;
  float t = side ? uv.x : uv.y;
  float idx = step(0.5, t);
  vec2 l = side ? vec2(fract(uv.x * 2.0), uv.y) : vec2(uv.x, fract(uv.y * 2.0));
  float ta = side ? aspect() * 0.5 : aspect() * 2.0;
  if (idx > 0.5 && uP0.y > 0.5) { if (side) l.x = 1.0 - l.x; else l.y = 1.0 - l.y; }
  vec3 col = tex(coverUv(l, ta)).rgb;
  // Ayraç
  float g = uP0.x * 0.012;
  float px1 = (side ? 1.0 / uRes.x : 1.0 / uRes.y);
  float sep = smoothstep(g + px1, g, abs(t - 0.5)) * step(0.0005, uP0.x);
  col = mix(col, vec3(0.04), sep);
  return vec4(mix(src, col, uAmount), 1.0);
}
