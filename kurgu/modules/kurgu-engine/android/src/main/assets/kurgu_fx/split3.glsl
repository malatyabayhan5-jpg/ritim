// Üçlü bölünmüş ekran: uzun kenar boyunca üç şerit; ortadaki özgün renkte,
// yandakiler isteğe bağlı soluk ve koyu (vurgu ortada kalır). Şeritler
// ortadan kırpılarak doldurulur, aralarında ince ayraçlar.
// P0: x=ayraç  y=yan şerit tonu  z=düzen (0 otomatik, 0.5 dikey şeritler, 1 yatay şeritler)
vec2 coverUv(vec2 l, float ta) {
  float sa = aspect();
  return ta < sa ? vec2(0.5 + (l.x - 0.5) * ta / sa, l.y) : vec2(l.x, 0.5 + (l.y - 0.5) * sa / ta);
}
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  bool cols = uP0.z < 0.34 ? aspect() >= 1.0 : uP0.z < 0.67;
  float t = cols ? uv.x : uv.y;
  float idx = floor(t * 3.0);
  vec2 l = cols ? vec2(fract(uv.x * 3.0), uv.y) : vec2(uv.x, fract(uv.y * 3.0));
  float ta = cols ? aspect() / 3.0 : aspect() * 3.0;
  vec3 col = tex(coverUv(l, ta)).rgb;
  if (abs(idx - 1.0) > 0.5) {
    float lum = luma(col);
    col = mix(col, vec3(lum) * 0.7, uP0.y * 0.8);
  }
  float g = uP0.x * 0.01;
  float px1 = cols ? 1.0 / uRes.x : 1.0 / uRes.y;
  float d = min(abs(t - 1.0 / 3.0), abs(t - 2.0 / 3.0));
  col = mix(col, vec3(0.04), smoothstep(g + px1, g, d) * step(0.0005, uP0.x));
  return vec4(mix(src, col, uAmount), 1.0);
}
