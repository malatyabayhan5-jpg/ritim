// Metin sanatı (ASCII): görüntü karakter hücrelerine bölünür; her hücrenin
// parlaklığına göre yoğunluğu artan bir karakter seçilir ( . - : + = % * # @ ).
// Karakterler bu dosyada 5x7 nokta matrisi olarak tanımlıdır (yazı tipi dosyası
// gerekmez). Fosfor yeşili terminal ya da özgün renk; hafif ışıma.
// P0: x=hücre boyutu  y=özgün renk  z=ışıma
//
// Karakter bitleri: satır 0-3 ilk sayıda (satır*5+sütun), satır 4-6 ikinci sayıda.
vec2 glyph(float i) {
  if (i < 0.5) return vec2(0.0, 0.0);
  if (i < 1.5) return vec2(0.0, 6336.0);        // .
  if (i < 2.5) return vec2(491520.0, 0.0);      // -
  if (i < 3.5) return vec2(6336.0, 198.0);      // :
  if (i < 4.5) return vec2(1020032.0, 132.0);   // +
  if (i < 5.5) return vec2(31744.0, 31.0);      // =
  if (i < 6.5) return vec2(139635.0, 26434.0);  // %
  if (i < 7.5) return vec2(1030816.0, 686.0);   // *
  if (i < 8.5) return vec2(338922.0, 11242.0);  // #
  return vec2(718382.0, 30781.0);               // @
}
float bitAt(vec2 g, float col, float row) {
  float v = row < 4.0 ? g.x : g.y;
  float idx = row < 4.0 ? row * 5.0 + col : (row - 4.0) * 5.0 + col;
  return mod(floor(v / exp2(idx)), 2.0);
}
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  float u = floor(mix(1.5, 4.0, uP0.x) * max(min(uRes.x, uRes.y) / 540.0, 0.6) + 0.5);
  vec2 cellPx = vec2(6.0, 8.0) * u;
  vec2 pix = uv * uRes;
  vec2 cid = floor(pix / cellPx);
  vec2 cuv = (cid + 0.5) * cellPx / uRes;
  vec2 o = cellPx * 0.25 / uRes;
  vec3 c = (tex(cuv + o).rgb + tex(cuv - o).rgb + tex(cuv + vec2(o.x, -o.y)).rgb + tex(cuv - vec2(o.x, -o.y)).rgb) * 0.25;
  float l = luma(c);
  float gi = floor(clamp(pow(l, 0.85) * 1.08, 0.0, 0.999) * 10.0);
  vec2 lp = mod(pix, cellPx) / u;                 // hücre içi nokta koordinatı
  float gx = floor(lp.x);
  float ly = floor(lp.y);
  float row = 7.0 - ly;                            // üst satır 0; ly=0 boşluk satırı
  float on = 0.0;
  if (gx < 5.0 && ly > 0.5) on = bitAt(glyph(gi), gx, row);
  // Noktayı hafif yuvarlat (fosfor noktası)
  vec2 f = fract(lp) - 0.5;
  float dotShape = smoothstep(0.75, 0.35, length(f));
  float lit = on * mix(1.0, dotShape, 0.5);
  vec3 phosphor = vec3(0.35, 1.0, 0.5);
  vec3 orig = c / max(max(c.r, max(c.g, c.b)), 0.15);
  vec3 ink = mix(phosphor * (0.55 + 0.6 * l), orig * (0.6 + 0.5 * l), uP0.y);
  vec3 bg = mix(vec3(0.01, 0.03, 0.015), c * 0.12, uP0.y);
  vec3 col = bg + ink * lit;
  // Işıma: hücre parlaklığına bağlı yumuşak hale
  col += ink * l * 0.18 * uP0.z;
  return vec4(mix(src, col, uAmount), 1.0);
}
