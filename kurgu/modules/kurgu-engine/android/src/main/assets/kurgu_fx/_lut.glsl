// 3B LUT uygulama (.cube). LUT, N×N'lik dilimlerin ızgara hâlinde dizildiği bir
// 2B dokuda tutulur: dilim b (mavi) -> (b mod sütun, b / sütun) karosu; karo içinde
// x = kırmızı, y = yeşil. Kırmızı/yeşil donanım çift doğrusal süzgeciyle, mavi iki
// dilim arasında elle karıştırılır (üç doğrusal ara değer). Karo kenarına yarım
// piksel içeriden örneklendiği için komşu karoya taşma olmaz.
// uP0.xyz = DOMAIN_MIN, uP1.xyz = DOMAIN_MAX
uniform sampler2D uLut;
uniform vec2 uLutGrid;    // x = N, y = sütun sayısı
uniform vec2 uLutTexSize; // doku boyutu (piksel)

vec3 lutSlice(vec2 rg, float b) {
  float n = uLutGrid.x;
  float cols = uLutGrid.y;
  float row = floor((b + 0.5) / cols);
  vec2 tile = vec2(b - row * cols, row);
  vec2 p = tile * n + rg * (n - 1.0) + 0.5;
  return texture2D(uLut, p / uLutTexSize).rgb;
}

vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  vec3 c = clamp((src - uP0.xyz) / max(uP1.xyz - uP0.xyz, vec3(1e-5)), 0.0, 1.0);
  float bz = c.b * (uLutGrid.x - 1.0);
  float b0 = floor(bz);
  float b1 = min(b0 + 1.0, uLutGrid.x - 1.0);
  vec3 col = mix(lutSlice(c.rg, b0), lutSlice(c.rg, b1), bz - b0);
  return vec4(mix(src, col, uAmount), 1.0);
}
