// Baş dönmesi (dolly zoom): merkezdeki konu aynı boyutta kalırken arka plan
// ışınsal olarak çekilip itilir; sinemadaki "vertigo" çekimi. Merkez
// bölgenin boyutu ayarlanabilir, geçiş yumuşaktır.
// P0: x=güç  y=hız  z=merkez boyutu
vec2 mirrorUv(vec2 u) { return 1.0 - abs(1.0 - mod(u, 2.0)); }
vec4 fx(vec2 uv) {
  vec2 p = centered(uv);
  float r = length(p);
  float cs = mix(0.08, 0.3, uP0.z);
  float wave = sin(uTime * mix(0.5, 2.5, uP0.y));
  // Merkezden uzaklaştıkça artan ölçek: merkez sabit, kenarlar akar
  float k = smoothstep(cs, cs + 0.35, r);
  float s = 1.0 + wave * mix(0.06, 0.3, uP0.x) * k * uAmount;
  vec2 q = p / s;
  vec3 col = tex(mirrorUv(uncentered(q))).rgb;
  // Akan bölgede hafif ışınsal bulanıklık
  vec2 q2 = p / (s + wave * 0.02 * k * uAmount);
  col = mix(col, tex(mirrorUv(uncentered(q2))).rgb, 0.4 * k);
  return vec4(col, 1.0);
}
