// Mozaik: kadraj kare ya da altıgen hücrelere bölünür; her hücre kendi alanının
// ortalama rengini (4 alt örnek) alır, böylece hareketli görüntüde titreşim
// azalır. İsteğe bağlı kabartma (ışık/gölge kenarı) ve hücre arası derz çizgisi.
// P0: x=hücre boyutu  y=altıgen  z=kabartma  w=derz
vec2 hexCenter(vec2 p) {
  // Sivri tepeli altıgen ızgara: en yakın merkez
  const vec2 s = vec2(1.0, 1.7320508);
  vec2 h = s * 0.5;
  vec2 a = mod(p, s) - h;
  vec2 b = mod(p - h, s) - h;
  return dot(a, a) < dot(b, b) ? p - a : p - b;
}
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  float cells = mix(70.0, 10.0, uP0.x);                 // kısa kenarda hücre sayısı
  vec2 p = centered(uv) * cells;                         // en-boy düzeltilmiş hücre uzayı
  vec2 sq = floor(p) + 0.5;
  vec2 hx = hexCenter(p);
  vec2 c = uP0.y > 0.5 ? hx : sq;
  vec2 local = p - c;                                    // hücre içi konum
  float hc = 0.5 / cells;
  vec2 cu = uncentered(c / cells);
  vec2 o = vec2(hc * 0.5) / vec2(aspect(), 1.0);
  vec3 col = (tex(cu + vec2(-o.x, -o.y)).rgb + tex(cu + vec2(o.x, -o.y)).rgb + tex(cu + vec2(-o.x, o.y)).rgb + tex(cu + vec2(o.x, o.y)).rgb) * 0.25;
  // Hücre kenarına uzaklık (0 = kenar)
  float edge = uP0.y > 0.5
    ? 0.5 - max(abs(local.x), dot(abs(local), vec2(0.5, 0.8660254)))
    : 0.5 - max(abs(local.x), abs(local.y));
  float aa = cells / uRes.y;                             // bir pikselin hücre birimindeki boyu
  // Kabartma: sol üstten gelen ışık
  float bevel = smoothstep(0.0, 0.18 + aa, edge);
  float lit = dot(normalize(local + 1e-4), normalize(vec2(-0.6, 0.8)));
  col *= 1.0 + uP0.z * (1.0 - bevel) * 0.35 * lit;
  // Derz: en az ~1 piksel genişlikte ve kenar yumuşatmalı (ince çizgide moiré olmasın)
  float gw = uP0.w * 0.1 + aa * 0.6;
  float grout = 1.0 - smoothstep(gw - aa, gw + aa, edge);
  col = mix(col, col * 0.25, grout * smoothstep(0.0, 0.05, uP0.w));
  return vec4(mix(src, col, uAmount), 1.0);
}
