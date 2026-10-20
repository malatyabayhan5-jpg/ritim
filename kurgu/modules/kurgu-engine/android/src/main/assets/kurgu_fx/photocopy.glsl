// Fotokopi: görüntü sert siyah-beyaza çekilir; eşik tonere bağlı olarak
// pürüzlüdür, koyu alanlar kenarlarda kalınlaşır. Toner lekeleri, tambur
// çiziği gibi dikey şeritler ve her karede biraz değişen kopya gürültüsü
// eklenir; kâğıt hafif gridir.
// P0: x=eşik  y=toner  z=şeritler
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  float sc = max(min(uRes.x, uRes.y) / 1080.0, 0.5);
  // Hafif yayılma: koyu alanlar kenarda büyür (en küçük luma)
  vec2 d = px() * 1.5 * sc;
  float l = luma(src);
  l = min(l, luma(tex(uv + vec2(d.x, 0.0)).rgb) + 0.06);
  l = min(l, luma(tex(uv - vec2(0.0, d.y)).rgb) + 0.06);
  float frame = floor(uTime * 12.0);
  vec2 gp = floor(uv * uRes / (1.5 * sc));
  float n = vnoise(uv * uRes / (3.0 * sc) + frame * 3.7) * 0.6 + hash12(gp + frame) * 0.4;
  float thr = mix(0.18, 0.52, uP0.x) + (n - 0.5) * 0.25 * (0.4 + uP0.y);
  float ink = smoothstep(thr + 0.05, thr - 0.05, l);
  // Toner lekeleri (kalıcı) ve kopya tozu (kareye göre)
  float speck = step(0.996 - 0.006 * uP0.y, hash12(gp + 91.0));
  float dust = step(0.9985 - 0.002 * uP0.y, hash12(gp + frame * 7.1));
  ink = max(ink, max(speck, dust));
  // Dikey tambur şeritleri: sütun başına sabit, hafif titreyen
  float colId = floor(uv.x * uRes.x / (4.0 * sc));
  float streak = step(0.985 - 0.03 * uP0.z, hash11(colId * 1.37 + 3.0)) * (0.5 + 0.5 * vnoise(vec2(colId, uv.y * 6.0 + frame * 0.3)));
  ink = max(ink, streak * 0.55 * uP0.z);
  // Kenarlara doğru zayıflayan tarama ışığı (gri kâğıt)
  vec3 paper = vec3(0.9, 0.9, 0.88) - 0.06 * smoothstep(0.3, 0.8, abs(uv.x - 0.5) * 2.0);
  vec3 col = mix(paper, vec3(0.06, 0.06, 0.07), ink);
  return vec4(mix(src, col, uAmount), 1.0);
}
