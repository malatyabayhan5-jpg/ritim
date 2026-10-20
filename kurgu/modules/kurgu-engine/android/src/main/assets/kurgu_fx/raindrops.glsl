// Camdaki yağmur damlaları: buğulu camın arkasından bakış. Arka plan
// bulanık; cama yapışmış damlalar arkadaki sahneyi ters ve büyütülmüş olarak
// kırar, kenarlarında koyu çizgi ve parlak yansıma vardır. Bazı damlalar
// aşağı kayar ve arkalarında net bir iz bırakır.
// P0: x=damla boyutu  y=yoğunluk  z=buğu
//
// İki geçiş: buğulu arka plan yarım çözünürlüklü kopyadan bulanıklaştırılır.
vec4 prepass(vec2 uv) {
  vec2 d = px() * 2.0;
  return vec4((tex(uv).rgb * 2.0 + tex(uv + d).rgb + tex(uv - d).rgb + tex(uv + vec2(d.x, -d.y)).rgb + tex(uv - vec2(d.x, -d.y)).rgb) / 6.0, 1.0);
}
// Bir damla katmanı: x,y = kırılma yönü, z = damla maskesi, w = iz maskesi
vec4 dropLayer(vec2 p, float scale, float t, float density, float slide) {
  vec2 g = p * scale;
  float colId = floor(g.x);
  // Kayan damlalar sütun başına kendi hızıyla
  float sp = slide * hash11(colId * 3.1) * step(0.55, hash11(colId * 7.7));
  g.y += t * sp;
  vec2 id = floor(g);
  vec2 f = fract(g) - 0.5;
  vec2 h = hash22(id + 4.0);
  if (h.x > density) return vec4(0.0);
  vec2 c = (h - 0.5) * 0.5;
  float r = mix(0.12, 0.32, hash12(id + 9.0));
  vec2 d = (f - c) * vec2(1.0, 0.85);
  float dist = length(d);
  float m = smoothstep(r, r * 0.85, dist);
  // İz: kayan damlanın üstünde kalan net şerit
  float trail = sp > 0.0 ? smoothstep(r * 0.6, 0.0, abs(f.x - c.x)) * step(c.y, f.y) : 0.0;
  return vec4(d / r, m, trail);
}
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  vec2 p = uv * vec2(aspect(), 1.0);
  float size = mix(18.0, 6.0, uP0.x);
  float dens = mix(0.25, 0.8, uP0.y);
  vec4 a = dropLayer(p, size, uTime, dens, 0.6);
  vec4 b = dropLayer(p + 3.7, size * 2.2, uTime, dens * 0.9, 0.0);
  vec4 dr = a.z > 0.01 ? a : b;
  float mask = max(a.z, b.z);
  float trail = max(a.w, 0.0);
  // Buğulu arka plan (iz ve damla dışı)
  vec2 bd = vec2(0.006 / aspect(), 0.006) * uP0.z;
  vec3 blur = (pre(uv).rgb * 2.0 + pre(uv + bd).rgb + pre(uv - bd).rgb + pre(uv + vec2(bd.x, -bd.y)).rgb + pre(uv - vec2(bd.x, -bd.y)).rgb) / 6.0;
  vec3 fogged = mix(src, blur * 0.92 + 0.05, uP0.z);
  vec3 col = mix(fogged, src, trail * 0.8);
  // Damla içi: ters ve büyütülmüş kırılma
  vec2 refr = uv - dr.xy * vec2(0.03 / aspect(), 0.03) - (uv - 0.5) * 0.04;
  vec3 inDrop = tex(refr).rgb;
  float edge = smoothstep(0.6, 1.0, length(dr.xy));
  inDrop *= 1.0 - edge * 0.45;
  inDrop += smoothstep(0.35, 0.0, length(dr.xy - vec2(-0.3, 0.35))) * 0.35;
  col = mix(col, inDrop, mask);
  return vec4(mix(src, col, uAmount), 1.0);
}
