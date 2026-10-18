// VHS: bant dalgalanması, kroma taşması (renk luma'dan bağımsız bulanık ve
// kaymış), aşağıdan yukarı kayan iz bozulma bandı, kafa değişim gürültüsü,
// ince tarama çizgileri, gürültü ve analog renk. Hepsi dozunda.
// P0: x=dalgalanma  y=kroma taşması  z=gürültü  w=analog renk
vec3 toYiq(vec3 c) { return vec3(dot(c, vec3(0.299, 0.587, 0.114)), dot(c, vec3(0.596, -0.274, -0.322)), dot(c, vec3(0.211, -0.523, 0.312))); }
vec3 fromYiq(vec3 y) { return vec3(y.x + 0.956 * y.y + 0.621 * y.z, y.x - 0.272 * y.y - 0.647 * y.z, y.x - 1.106 * y.y + 1.703 * y.z); }

vec4 fx(vec2 uv) {
  float a = uAmount;
  float t = uTime;
  float wob = (vnoise(vec2(uv.y * 28.0, t * 5.0)) - 0.5) * 0.0035 * mix(0.3, 2.0, uP0.x);
  wob += (vnoise(vec2(uv.y * 2.5, t * 0.8)) - 0.5) * 0.007 * uP0.x;
  float band = 1.0 - fract(t * 0.11 + uSeed);
  float inBand = smoothstep(0.04, 0.0, abs(uv.y - band));
  float lineId = floor(uv.y * uRes.y / 2.0);
  wob += inBand * (hash12(vec2(lineId, floor(t * 30.0))) - 0.5) * 0.035;
  float head = smoothstep(0.05, 0.0, uv.y);
  wob += head * (0.015 + 0.01 * sin(t * 47.0 + uv.y * 300.0));
  vec2 q = vec2(uv.x + wob * a, uv.y);

  float bleed = mix(1.0, 7.0, uP0.y) * px().x;
  vec3 yiq = toYiq(tex(q).rgb);
  vec2 ch = vec2(0.0);
  for (int i = 0; i < 8; i++) ch += toYiq(tex(q + vec2((float(i) - 1.5) * bleed, 0.0)).rgb).yz;
  yiq.yz = mix(yiq.yz, ch / 8.0, a);
  vec3 col = fromYiq(yiq);

  float l = luma(col);
  col = mix(col, vec3(l), 0.22 * uP0.w * a);
  col = mix(col, col * vec3(1.03, 1.0, 0.93) + vec3(0.035, 0.025, 0.045), uP0.w * a);
  float sl = 0.5 + 0.5 * sin(uv.y * uRes.y * PI * 0.5);
  col *= mix(1.0, 0.9 + 0.1 * sl, a);
  float n = hash12(floor(uv * uRes * vec2(0.5, 1.0)) + floor(t * 30.0) * 13.1);
  col += (n - 0.5) * (0.07 * uP0.z + inBand * 0.4 + head * 0.3) * a;
  vec2 p = uv - 0.5;
  col *= 1.0 - 0.3 * a * dot(p, p);
  return vec4(col, 1.0);
}
