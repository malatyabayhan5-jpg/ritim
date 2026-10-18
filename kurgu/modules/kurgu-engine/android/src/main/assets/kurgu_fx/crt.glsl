// CRT ekran: kavisli cam (fıçı), RGB fosfor maskesi, tarama çizgileri, fosfor
// ışıması, köşe kararması ve hafif yenileme titremesi.
// P0: x=kavis  y=tarama çizgisi  z=fosfor maskesi  w=ışıma
vec4 fx(vec2 uv) {
  vec2 p = uv * 2.0 - 1.0;
  float k = 0.12 * uP0.x * uAmount;
  vec2 q = p * (1.0 + k * vec2(p.y * p.y, p.x * p.x));
  q = q * (1.0 - k * 0.5) * 0.5 + 0.5;
  if (q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0) return vec4(vec3(0.0), 1.0);
  vec3 col = tex(q).rgb;
  vec3 glow = (tex(q + vec2(px().x * 2.0, 0.0)).rgb + tex(q - vec2(px().x * 2.0, 0.0)).rgb + tex(q + vec2(0.0, px().y * 2.0)).rgb + tex(q - vec2(0.0, px().y * 2.0)).rgb) * 0.25;
  col = mix(col, max(col, glow), 0.6 * uP0.w * uAmount);
  float lines = uRes.y / mix(2.0, 3.5, uP0.y);
  float sl = 0.5 + 0.5 * cos(q.y * lines * TAU);
  col *= mix(1.0, 0.72 + 0.28 * sl, uP0.y * uAmount);
  float m = mod(floor(q.x * uRes.x), 3.0);
  vec3 mask = m < 1.0 ? vec3(1.0, 0.72, 0.72) : (m < 2.0 ? vec3(0.72, 1.0, 0.72) : vec3(0.72, 0.72, 1.0));
  col *= mix(vec3(1.0), mask * 1.18, uP0.z * uAmount);
  col *= 1.0 + 0.03 * sin(uTime * 120.0) * uAmount;
  vec2 v = q * (1.0 - q.yx);
  col *= mix(1.0, pow(clamp(v.x * v.y * 18.0, 0.0, 1.0), 0.3), uAmount);
  return vec4(col, 1.0);
}
