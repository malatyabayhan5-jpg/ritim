// Eski fotoğraf: sepya (ya da soğuk selenyum) tonlu, yumuşak odaklı baskı.
// Kenarlara doğru solma ve kararma, kâğıt dokusu, kahverengi küf lekeleri
// (foxing) ve kâğıdın katlanmasından kalan açık renkli kırık çizgileri.
// P0: x=ton (0 sepya, 1 selenyum)  y=solma  z=lekeler  w=kırışıklar
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  vec2 d = px() * 1.5;
  vec3 c = src * 0.5 + (tex(uv + d).rgb + tex(uv - d).rgb) * 0.25;
  float l = luma(c);
  l = l * l * (3.0 - 2.0 * l) * 0.6 + l * 0.4;
  vec3 sepia = mix(vec3(0.2, 0.12, 0.07), vec3(1.0, 0.92, 0.76), l);
  vec3 selen = mix(vec3(0.12, 0.11, 0.14), vec3(0.93, 0.93, 0.95), l);
  vec3 col = mix(sepia, selen, uP0.x);
  // Solma: kontrast ve siyah düzeyi kaybı, kenarlarda daha çok
  vec2 p = uv - 0.5;
  float r = dot(p, p) * 2.0;
  col = mix(col, vec3(0.86, 0.8, 0.68), uP0.y * (0.18 + 0.4 * smoothstep(0.2, 0.9, r)));
  col *= 1.0 - 0.3 * smoothstep(0.3, 1.0, r);
  // Kâğıt dokusu
  vec2 q = uv * vec2(aspect(), 1.0);
  col *= 0.96 + 0.06 * vnoise(q * 300.0) + 0.03 * fbm(q * 8.0);
  // Küf lekeleri: dağınık kahverengi benekler
  vec2 g = q * 9.0;
  vec2 id = floor(g);
  vec2 f = fract(g) - 0.5 - (hash22(id + uSeed) - 0.5) * 0.6;
  float rr = mix(0.05, 0.22, hash12(id + 7.0));
  float spot = step(0.72, hash12(id + 3.0)) * smoothstep(rr, rr * 0.3, length(f) + (vnoise(g * 5.0) - 0.5) * 0.1);
  col = mix(col, col * vec3(0.78, 0.6, 0.42), spot * uP0.z * 0.8);
  // Kırışıklar: iki kırık çizgi (açık renk, aşınmış emülsiyon)
  float cr = 0.0;
  vec2 c1 = rot2(q - vec2(0.3 * aspect(), 0.6), 0.5 + uSeed);
  cr = max(cr, smoothstep(0.004, 0.0, abs(c1.y + (fbm(c1 * 6.0) - 0.5) * 0.06)));
  vec2 c2 = rot2(q - vec2(0.75 * aspect(), 0.3), -1.1 + uSeed);
  cr = max(cr, smoothstep(0.003, 0.0, abs(c2.y + (fbm(c2 * 7.0 + 4.0) - 0.5) * 0.05)) * step(c2.x, 0.15));
  col = mix(col, vec3(0.95, 0.92, 0.85), cr * uP0.w * 0.8);
  return vec4(mix(src, col, uAmount), 1.0);
}
