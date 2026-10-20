// Dönen yakınlaştırma: kamera kendi ekseninde ileri geri yuvarlanırken
// yakınlaşıp uzaklaşır. Dönüş hızlandığında açısal hareket bulanıklığı
// oluşur; kenarlar yansıtılarak doldurulur.
// P0: x=açı  y=yakınlaştırma  z=hız  w=bulanıklık
vec2 mirrorUv(vec2 u) { return 1.0 - abs(1.0 - mod(u, 2.0)); }
vec4 fx(vec2 uv) {
  float t = uTime * mix(0.5, 3.0, uP0.z);
  float maxA = mix(0.08, 0.6, uP0.x) * uAmount;
  float a = sin(t) * maxA;
  float va = cos(t) * maxA;                     // açısal hız (bulanıklık için)
  float z = 1.0 + (0.5 + 0.5 * sin(t * 0.5 - 1.0)) * mix(0.05, 0.4, uP0.y) * uAmount + abs(a) * 0.4;
  vec2 p = centered(uv);
  vec3 col = vec3(0.0);
  float blur = va * 0.08 * uP0.w;
  for (int i = 0; i < 6; i++) {
    float o = (float(i) / 5.0 - 0.5) * blur;
    col += tex(mirrorUv(uncentered(rot2(p, a + o) / z))).rgb;
  }
  return vec4(col / 6.0, 1.0);
}
