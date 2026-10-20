// 8 mm ev filmi: 18 kare/sn'lik kare kayması (pencere sallantısı), köşeleri
// yuvarlak, kenarı sönen film penceresi, iri ve kareye göre değişen gren,
// soluk ve sıcak renkler, pozlama titremesi ve kenardan ara sıra giren ışık.
// P0: x=pencere sallantısı  y=gren  z=film penceresi  w=solma
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  float frame = floor(uTime * 18.0);
  // Pencere sallantısı: kareden kareye küçük sıçramalar + yavaş kayma
  vec2 jit = (vec2(hash11(frame * 1.3), hash11(frame * 2.1 + 5.0)) - 0.5) * vec2(0.002, 0.006);
  jit += vec2(snoise1(uTime * 0.7) * 0.003, snoise1(uTime * 0.5 + 9.0) * 0.006);
  vec2 q = (uv - 0.5) * 0.96 + 0.5 + jit * uP0.x * 2.0;
  vec3 col = tex(q).rgb * 0.6 + (tex(q + vec2(0.0015, 0.0)).rgb + tex(q - vec2(0.0015, 0.0)).rgb) * 0.2;
  // Solma: kalkık siyahlar, sıcak-macenta kayması, azalmış doygunluk
  float fade = uP0.w;
  col = mix(col, vec3(luma(col)), 0.25 * fade);
  col = col * mix(vec3(1.0), vec3(1.06, 0.97, 0.82), fade) + vec3(0.06, 0.04, 0.05) * fade;
  // Pozlama titremesi
  col *= 1.0 + (hash11(frame * 0.7 + 3.0) - 0.5) * 0.1;
  // Gren: iri, kareye göre yeni
  float sc = max(min(uRes.x, uRes.y) / 720.0, 0.75);
  vec2 gp = uv * uRes / (2.0 * sc);
  float g = vnoise(gp + frame * 17.0) * 0.6 + hash12(floor(gp) + frame) * 0.4 - 0.5;
  col += g * 0.16 * uP0.y * (0.6 + 0.4 * (1.0 - luma(col)));
  // Kenardan sızan ışık (birkaç saniyede bir)
  float leak = smoothstep(0.65, 1.0, snoise1(uTime * 0.6 + 3.0) * 0.5 + 0.5);
  col += vec3(1.0, 0.45, 0.15) * leak * 0.35 * smoothstep(0.35, 0.0, uv.x) * (0.6 + 0.4 * sin(uv.y * 5.0 + uTime));
  // Film penceresi: yuvarlak köşeli dikdörtgen, yumuşak kenar
  vec2 p = abs(q - 0.5) * 2.0;
  vec2 ar = vec2(aspect(), 1.0);
  vec2 d = max(p * ar - (ar - 0.2), 0.0);
  float gate = 1.0 - smoothstep(0.05, 0.12, length(d));
  float soft = 1.0 - smoothstep(0.55, 1.0, length((q - 0.5) * vec2(1.0, 1.15)) * 1.2);
  col *= mix(1.0, gate * (0.75 + 0.25 * soft), uP0.z);
  return vec4(mix(src, col, uAmount), 1.0);
}
