// Düşük poligon: görüntü titreşimli bir ızgaranın üçgenlerine bölünür. Her
// üçgen, köşelerindeki ve ağırlık merkezindeki rengin ortalamasıyla düz
// boyanır; köşe parlaklıkları yükseklik sayılarak yüzey normali bulunur ve
// yönlü ışıkla gölgelenir (yontulmuş kristal görünümü).
// P0: x=hücre boyutu  y=yüzey gölgesi  z=kenar çizgileri
//
// Köşe titreşimi ±0.35 hücre olduğundan piksel, bulunduğu hücre yarısına göre
// yalnızca 2x2 dörtgenin üçgenlerinde olabilir: 9 köşe, 8 üçgen sınaması.
vec2 vert(vec2 id) { return id + (hash22(id + uSeed * 7.0) - 0.5) * 0.7; }
float sideOf(vec2 p, vec2 a, vec2 b) { return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x); }
// Üçgen sınaması: içerideyse köşeleri ve kenara uzaklığı yazar
void tri(vec2 p, vec2 a, vec2 b, vec2 c, inout float found, inout vec2 A, inout vec2 B, inout vec2 C, inout float edgeD) {
  if (found > 0.5) return;
  float s1 = sideOf(p, a, b); float s2 = sideOf(p, b, c); float s3 = sideOf(p, c, a);
  if ((s1 >= 0.0 && s2 >= 0.0 && s3 >= 0.0) || (s1 <= 0.0 && s2 <= 0.0 && s3 <= 0.0)) {
    A = a; B = b; C = c; found = 1.0;
    edgeD = min(abs(s1) / length(b - a), min(abs(s2) / length(c - b), abs(s3) / length(a - c)));
  }
}
void quad(vec2 p, vec2 id, vec2 v00, vec2 v10, vec2 v01, vec2 v11, inout float found, inout vec2 A, inout vec2 B, inout vec2 C, inout float edgeD) {
  // Köşegen hücreye göre değişir (daha doğal ağ)
  if (hash12(id + 3.3) > 0.5) {
    tri(p, v00, v10, v01, found, A, B, C, edgeD);
    tri(p, v10, v11, v01, found, A, B, C, edgeD);
  } else {
    tri(p, v00, v10, v11, found, A, B, C, edgeD);
    tri(p, v00, v11, v01, found, A, B, C, edgeD);
  }
}
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  float cells = mix(40.0, 9.0, uP0.x);
  vec2 p = centered(uv) * cells;
  vec2 ip = floor(p);
  vec2 o = ip - step(p - ip, vec2(0.5));                 // 2x2 dörtgenin sol alt kimliği
  vec2 v00 = vert(o);                       vec2 v10 = vert(o + vec2(1.0, 0.0)); vec2 v20 = vert(o + vec2(2.0, 0.0));
  vec2 v01 = vert(o + vec2(0.0, 1.0));      vec2 v11 = vert(o + vec2(1.0, 1.0)); vec2 v21 = vert(o + vec2(2.0, 1.0));
  vec2 v02 = vert(o + vec2(0.0, 2.0));      vec2 v12 = vert(o + vec2(1.0, 2.0)); vec2 v22 = vert(o + vec2(2.0, 2.0));
  vec2 A = vec2(0.0); vec2 B = vec2(0.0); vec2 C = vec2(0.0);
  float found = 0.0;
  float edgeD = 1.0;
  quad(p, o, v00, v10, v01, v11, found, A, B, C, edgeD);
  quad(p, o + vec2(1.0, 0.0), v10, v20, v11, v21, found, A, B, C, edgeD);
  quad(p, o + vec2(0.0, 1.0), v01, v11, v02, v12, found, A, B, C, edgeD);
  quad(p, o + vec2(1.0, 1.0), v11, v21, v12, v22, found, A, B, C, edgeD);
  if (found < 0.5) return vec4(src, 1.0);
  vec2 G = (A + B + C) / 3.0;
  vec3 ca = tex(uncentered(A / cells)).rgb;
  vec3 cb = tex(uncentered(B / cells)).rgb;
  vec3 cc = tex(uncentered(C / cells)).rgb;
  vec3 cg = tex(uncentered(G / cells)).rgb;
  vec3 col = (ca + cb + cc + cg * 3.0) / 6.0;
  // Yüzey normali: köşe parlaklıkları yükseklik
  vec3 PA = vec3(A, luma(ca) * 1.5);
  vec3 PB = vec3(B, luma(cb) * 1.5);
  vec3 PC = vec3(C, luma(cc) * 1.5);
  vec3 n = normalize(cross(PB - PA, PC - PA));
  n *= sign(n.z);
  float lit = dot(n, normalize(vec3(-0.5, 0.6, 0.8)));
  col *= mix(1.0, 0.65 + 0.5 * lit, uP0.y);
  float aa = cells / min(uRes.x, uRes.y) * 1.2;
  col = mix(col, col * 0.55 + 0.05, (1.0 - smoothstep(0.0, aa * 1.5, edgeD)) * uP0.z);
  return vec4(mix(src, col, uAmount), 1.0);
}
