// Objektif bulanıklığı (bokeh): netlik dışı bir objektif gibi disk biçimli
// bulanıklık. Parlak noktalar ağırlıklandırılarak keskin kenarlı, içi dolu
// ışık disklerine (bokeh topları) dönüşür. İstenirse ortada net bir alan kalır.
// P0: x=yarıçap  y=bokeh parlaklığı  z=net merkez
//
// İki geçiş: yarım çözünürlüklü kopya, parlak alanları vurgulayan ağırlık
// alfa kanalında olacak şekilde hazırlanır; disk örneklemesi bu dokudan okur.
vec4 prepass(vec2 uv) {
  vec3 c = tex(uv).rgb;
  float l = max(c.r, max(c.g, c.b));
  float w = 1.0 + pow(smoothstep(0.55, 1.0, l), 2.0) * mix(2.0, 18.0, uP0.y);
  return vec4(c, w / 20.0);
}
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  vec2 p = centered(uv);
  float focus = uP0.z > 0.01 ? smoothstep(0.08 + 0.25 * uP0.z, 0.2 + 0.4 * uP0.z, length(p)) : 1.0;
  float R = mix(0.006, 0.03, uP0.x) * focus;
  vec2 sc = vec2(R / aspect(), R);
  vec3 acc = vec3(0.0);
  float wsum = 0.0;
  // Altın açı spirali: diski eşit yoğunlukta örnekler (ağırlık kenarda sabit:
  // keskin kenarlı disk)
  vec2 dir = vec2(cos(uSeed * 6.0), sin(uSeed * 6.0));
  mat2 ga = mat2(cos(GOLDEN), sin(GOLDEN), -sin(GOLDEN), cos(GOLDEN));
  for (int i = 0; i < 24; i++) {
    float r = sqrt((float(i) + 0.5) / 24.0);
    vec4 s = pre(uv + dir * r * sc);
    float w = s.a * 20.0;
    acc += s.rgb * w;
    wsum += w;
    dir = ga * dir;
  }
  vec3 col = acc / max(wsum, 1e-4);
  // Ağırlık nedeniyle düşen genel parlaklığı telafi et, parlak diskleri koru
  col = mix(col, max(col, pre(uv).rgb), 0.15);
  col = mix(src, col, focus);
  return vec4(mix(src, col, uAmount), 1.0);
}
