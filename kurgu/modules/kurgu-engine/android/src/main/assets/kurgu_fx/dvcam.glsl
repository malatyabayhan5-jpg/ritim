// 2000'ler el kamerası: aşırı keskinleştirme haleleri, geçmeli (interlaced)
// tarama dişlenmesi, 2x2 bloklarda azaltılmış renk çözünürlüğü, yeşilimsi
// doygun renk ve kırpılmış parlak alanlar, gölgelerde dijital gürültü.
// P0: x=keskinleştirme  y=geçmeli tarama  z=gürültü  w=renk blokları
vec3 toYuv(vec3 c) { return vec3(dot(c, vec3(0.299, 0.587, 0.114)), dot(c, vec3(-0.169, -0.331, 0.5)), dot(c, vec3(0.5, -0.419, -0.081))); }
vec3 fromYuv(vec3 y) { return vec3(y.x + 1.402 * y.z, y.x - 0.344 * y.y - 0.714 * y.z, y.x + 1.772 * y.y); }
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  // Geçmeli: tek satırlar bir önceki alana ait, yatayda kayık
  float line = floor(uv.y * uRes.y);
  float odd = mod(line, 2.0);
  float shift = (sin(uTime * 3.0) * 0.5 + snoise1(uTime * 5.0) * 0.5) * 3.0 * uP0.y;
  vec2 q = uv + vec2(odd * shift / uRes.x, 0.0);
  vec2 d = px();
  float y0 = toYuv(tex(q).rgb).x;
  float yb = (toYuv(tex(q + vec2(d.x * 2.0, 0.0)).rgb).x + toYuv(tex(q - vec2(d.x * 2.0, 0.0)).rgb).x) * 0.5;
  // Keskinleştirme: yatay halo (kameraların tipik kenar vurgusu)
  float y = y0 + (y0 - yb) * mix(0.0, 2.5, uP0.x);
  // Renk: 2x2 blok ortalaması (4:2:0 benzeri)
  vec2 blk = (floor(uv * uRes / 2.0) * 2.0 + 1.0) / uRes;
  vec2 cu = mix(toYuv(tex(q).rgb).yz, toYuv(tex(blk).rgb).yz, uP0.w);
  vec3 col = fromYuv(vec3(y, cu * 1.15));
  col = col * vec3(0.98, 1.03, 0.97);
  col = min(col * 1.06, vec3(0.97));                      // kırpılmış parlak alan
  float n = hash12(floor(uv * uRes) + floor(uTime * 30.0) * 7.0) - 0.5;
  col += n * 0.08 * uP0.z * (1.0 - smoothstep(0.1, 0.5, y));
  return vec4(mix(src, col, uAmount), 1.0);
}
