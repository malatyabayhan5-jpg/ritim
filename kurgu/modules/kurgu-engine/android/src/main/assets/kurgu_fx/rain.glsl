// Yağmur: farklı derinlikte eğimli yağmur çizgileri, uzak katmanda pus,
// serin ve hafif koyu sahne rengi; damlalar arkasındaki görüntüyü hafif kırar.
// P0: x=yoğunluk  y=hız  z=eğim  w=sahne karartma
float streaks(vec2 uv, float scale, float speed, float len, float t, out vec2 refr) {
  float slant = mix(-0.25, 0.25, uP0.z);
  vec2 p = uv * vec2(aspect(), 1.0) * vec2(scale, scale * 0.25);
  p.x += p.y * slant * 4.0;
  p.y += t * speed;
  vec2 cell = floor(p);
  vec2 f = fract(p);
  refr = vec2(0.0);
  if (hash12(cell) > mix(0.85, 0.35, uP0.x)) return 0.0;
  float x = 0.1 + 0.8 * hash12(cell + 2.3);
  float y0 = hash12(cell + 9.1);
  float dx = abs(f.x - x);
  float dy = fract(f.y - y0);
  float body = smoothstep(0.12, 0.0, dx) * smoothstep(len, 0.0, dy) * smoothstep(0.0, 0.05, dy);
  refr = vec2((f.x - x) * 0.02, 0.0) * body;
  return body;
}
vec4 fx(vec2 uv) {
  float t = uTime * mix(0.6, 1.8, uP0.y);
  vec2 r1, r2, r3;
  float a = streaks(uv, 22.0, 3.2, 0.6, t, r1) * 0.9
          + streaks(uv + 0.31, 45.0, 2.3, 0.5, t, r2) * 0.6
          + streaks(uv + 0.67, 90.0, 1.6, 0.4, t, r3) * 0.4;
  vec3 col = tex(uv + (r1 + r2) * uAmount).rgb;
  col = mix(col, col * vec3(0.82, 0.88, 0.95) + vec3(0.02, 0.03, 0.05), uP0.w * uAmount);
  col = screen(col, vec3(0.78, 0.84, 0.95) * clamp(a, 0.0, 1.0) * 0.75 * uAmount);
  return vec4(col, 1.0);
}
