// Eski film (8 mm): 18 kare/sn ritminde değişen film greni, toz ve çizikler,
// görüntü titremesi (gate weave), parlaklık dalgalanması, yaşlanmış renk ve vinyet.
// P0: x=gren  y=toz ve çizik  z=titreme  w=renk yaşlanması
vec4 fx(vec2 uv) {
  float a = uAmount;
  float ft = floor(uTime * 18.0);
  vec2 weave = vec2(snoise1(uTime * 3.0 + uSeed * 7.0), snoise1(uTime * 2.3 + 13.0)) * 0.0025;
  weave.y += (hash11(ft) - 0.5) * 0.002;
  vec2 q = (uv - 0.5) * (1.0 - 0.012 * a) + 0.5 + weave * uP0.z * a;
  vec3 col = tex(q).rgb;

  float l = luma(col);
  vec3 aged = vec3(l) * vec3(1.08, 0.93, 0.74) + vec3(0.05, 0.035, 0.015);
  col = mix(col, aged, 0.75 * uP0.w * a);
  col = mix(col, col * col * (3.0 - 2.0 * col), 0.3 * a);
  col *= 1.0 + (hash11(ft * 1.7 + uSeed) - 0.5) * 0.12 * uP0.z * a;

  vec2 gp = uv * uRes / 1.6;
  float g = (vnoise(gp + ft * 37.0) + hash12(gp + ft)) * 0.5 - 0.5;
  col += g * 0.2 * uP0.x * a * (1.0 - 0.4 * l);

  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float seg = floor(ft / 5.0) + fi * 11.0;
    float on = step(0.5, hash11(seg + uSeed));
    float x = hash11(seg * 1.31 + fi);
    float w = (0.7 + 1.5 * hash11(seg * 2.1)) / uRes.x;
    float lineM = smoothstep(w, 0.0, abs(uv.x - x - sin(uv.y * 3.0 + seg) * 0.004));
    float fade = smoothstep(0.2, 0.6, vnoise(vec2(uv.y * 6.0, seg)));
    col = mix(col, col * 0.55 + 0.4, lineM * fade * on * uP0.y * a);
  }
  vec2 dp = uv * vec2(aspect(), 1.0) * 16.0;
  vec2 cell = floor(dp);
  float h = hash12(cell + ft * 3.3);
  if (h > 1.0 - 0.03 * uP0.y * a) {
    vec2 c = hash22(cell + ft) * 0.6 + 0.2;
    float r = length(fract(dp) - c) * (7.0 + 9.0 * hash12(cell));
    float speck = smoothstep(1.0, 0.2, r);
    col = mix(col, h > 0.996 ? vec3(0.92, 0.9, 0.85) : vec3(0.06, 0.05, 0.04), speck * 0.85);
  }
  vec2 p = uv - 0.5;
  p.x *= 0.85;
  col *= 1.0 - smoothstep(0.25, 0.78, length(p)) * 0.6 * a;
  return vec4(col, 1.0);
}
