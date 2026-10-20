// Odak halkası (iris bulanıklığı): seçilen noktadaki eliptik alan net kalır,
// dışarısı uzaklaştıkça artan disk bulanıklığıyla yumuşar; portre ve ürün
// çekimlerinde konuyu öne çıkarır.
// P0: x=odak genişliği  y=bulanıklık  z=odak yatay  w=odak dikey
//
// İki geçiş: bulanıklık yarım çözünürlüklü kopyadan altın açı diskiyle okunur.
vec4 prepass(vec2 uv) {
  vec2 d = px();
  return vec4((tex(uv + d).rgb + tex(uv - d).rgb + tex(uv + vec2(d.x, -d.y)).rgb + tex(uv - vec2(d.x, -d.y)).rgb) * 0.25, 1.0);
}
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  vec2 p = centered(uv) - centered(uP0.zw);
  float fw = mix(0.12, 0.45, uP0.x);
  float r = length(p * vec2(0.8, 1.0));
  float k = smoothstep(fw, fw + 0.3, r);
  float R = mix(0.006, 0.03, uP0.y) * k;
  vec3 acc = vec3(0.0);
  vec2 dir = vec2(cos(uSeed * 5.0), sin(uSeed * 5.0));
  mat2 ga = mat2(cos(GOLDEN), sin(GOLDEN), -sin(GOLDEN), cos(GOLDEN));
  for (int i = 0; i < 16; i++) {
    float rr = sqrt((float(i) + 0.5) / 16.0);
    acc += pre(uv + dir * rr * vec2(R / aspect(), R)).rgb;
    dir = ga * dir;
  }
  vec3 col = mix(src, acc / 16.0, smoothstep(0.0, 0.25, k));
  return vec4(mix(src, col, uAmount), 1.0);
}
