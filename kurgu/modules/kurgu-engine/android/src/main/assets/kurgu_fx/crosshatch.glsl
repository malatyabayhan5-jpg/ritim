// Mürekkep tarama (gravür kalemi): ton dört katman çizgiyle verilir; açık
// tonlarda yalnızca eğik çizgiler, koyulaştıkça çapraz, yatay ve dikey
// katmanlar eklenir. Çizgiler hafif titrek (elle çizilmiş), konturlar mürekkep.
// P0: x=çizgi aralığı  y=mürekkep kontur  z=mürekkep rengi (0 siyah, 1 sepya/lacivert)
float lines(vec2 p, float ang, float width) {
  vec2 q = rot2(p, ang);
  q.y += (vnoise(q * vec2(0.02, 0.0) + ang * 10.0) - 0.5) * 2.0;   // el titremesi
  float f = abs(fract(q.y) - 0.5);
  return smoothstep(width + 0.08, width - 0.08, f);
}
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  float l = luma(src);
  float sc = max(min(uRes.x, uRes.y) / 1080.0, 0.6);
  float spacing = mix(7.0, 16.0, uP0.x) * sc;
  vec2 p = uv * uRes / spacing;
  float ink = 0.0;
  ink = max(ink, lines(p, 0.785, 0.16) * smoothstep(0.78, 0.6, l));
  ink = max(ink, lines(p, -0.785, 0.16) * smoothstep(0.55, 0.4, l));
  ink = max(ink, lines(p, 0.0, 0.18) * smoothstep(0.35, 0.22, l));
  ink = max(ink, lines(p + 0.5, 1.5708, 0.2) * smoothstep(0.2, 0.08, l));
  // Kontur: Sobel benzeri luma gradyanı
  vec2 d = px() * 1.5 * sc;
  float gx = luma(tex(uv + vec2(d.x, 0.0)).rgb) - luma(tex(uv - vec2(d.x, 0.0)).rgb);
  float gy = luma(tex(uv + vec2(0.0, d.y)).rgb) - luma(tex(uv - vec2(0.0, d.y)).rgb);
  float edge = smoothstep(0.08, 0.3, length(vec2(gx, gy))) * uP0.y;
  ink = max(ink, edge);
  vec3 paper = vec3(0.97, 0.95, 0.9);
  vec3 inkC = mix(vec3(0.07, 0.07, 0.09), mix(vec3(0.33, 0.18, 0.08), vec3(0.08, 0.14, 0.36), step(0.5, uP0.z)), smoothstep(0.0, 0.25, uP0.z));
  vec3 col = mix(paper, inkC, ink * 0.92);
  return vec4(mix(src, col, uAmount), 1.0);
}
