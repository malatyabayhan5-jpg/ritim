// Oyuncak kamera: plastik mercekli ucuz kamera görünümü. Güçlü ve hafif
// düzensiz kenar kararması, kenarlara doğru artan bulanıklık, patlayan
// doygunluk ve kontrast, bir kenardan sızan kırmızı-turuncu ışık.
// P0: x=vinyet  y=kenar bulanıklığı  z=ışık sızıntısı  w=doygunluk
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  vec2 p = centered(uv);
  float r = length(p * vec2(0.85, 1.0));
  float br = smoothstep(0.2, 0.75, r) * mix(0.0, 0.012, uP0.y);
  vec3 c = src * 0.2;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * TAU / 8.0;
    c += tex(uv + vec2(cos(a) / aspect(), sin(a)) * br).rgb * 0.1;
  }
  // Doygunluk ve kontrast
  c = mix(c, c * c * (3.0 - 2.0 * c), 0.45);
  c = mix(vec3(luma(c)), c, mix(1.0, 1.7, uP0.w));
  c = c * vec3(1.04, 1.0, 0.94);
  // Düzensiz vinyet
  float vg = smoothstep(0.25, 0.85, r + (vnoise(p * 3.0 + uSeed * 5.0) - 0.5) * 0.12);
  c *= 1.0 - vg * mix(0.2, 0.95, uP0.x);
  // Işık sızıntısı: sağ üst köşeden
  vec2 lp = uv - vec2(1.05, 0.85);
  float leak = exp(-dot(lp * vec2(aspect() * 0.7, 1.4), lp * vec2(aspect() * 0.7, 1.4)) * 4.0);
  c = screen(c, vec3(1.0, 0.35, 0.12) * leak * uP0.z * 0.9);
  return vec4(mix(src, clamp(c, 0.0, 1.0), uAmount), 1.0);
}
