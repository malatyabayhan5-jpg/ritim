// Neon kontur: Sobel kenarları renk geçişli neon çizgilere dönüşür; çizgiler
// kendi ışımasını üretir, zemin kararır. Renk zamanla akar.
// P0: x=çizgi kalınlığı  y=zemin karartma  z=renk akışı  w=ışıma
float edgeAt(vec2 uv, float w) {
  vec2 o = px() * w;
  float tl = luma(tex(uv + vec2(-o.x, o.y)).rgb), tc = luma(tex(uv + vec2(0.0, o.y)).rgb), tr = luma(tex(uv + o).rgb);
  float ml = luma(tex(uv - vec2(o.x, 0.0)).rgb), mr = luma(tex(uv + vec2(o.x, 0.0)).rgb);
  float bl = luma(tex(uv - o).rgb), bc = luma(tex(uv - vec2(0.0, o.y)).rgb), br = luma(tex(uv + vec2(o.x, -o.y)).rgb);
  float gx = (tr + 2.0 * mr + br) - (tl + 2.0 * ml + bl);
  float gy = (tl + 2.0 * tc + tr) - (bl + 2.0 * bc + br);
  return length(vec2(gx, gy));
}
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  float w = mix(1.0, 3.0, uP0.x) * (uRes.y / 1080.0) + 0.5;
  float e = smoothstep(0.08, 0.45, edgeAt(uv, w));
  float g = 0.0;
  for (int i = 0; i < 12; i++) {
    float a = float(i) * TAU / 12.0;
    g += smoothstep(0.08, 0.45, edgeAt(uv + vec2(cos(a), sin(a)) * px() * w * 5.0, w));
  }
  g /= 12.0;
  float hue = fract(uv.x * 0.6 + uv.y * 0.3 + uTime * mix(0.0, 0.25, uP0.z) + uSeed);
  vec3 neon = hsv2rgb(vec3(hue, 0.85, 1.0));
  vec3 base = src * mix(1.0, 0.18, uP0.y * uAmount);
  vec3 col = base + neon * e * 1.3 * uAmount + neon * g * 0.9 * uP0.w * uAmount;
  col = mix(col, vec3(1.0), e * 0.25 * uAmount);
  return vec4(col, 1.0);
}
