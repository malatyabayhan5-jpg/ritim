// Ritim yakınlaştırma: her vuruşta görüntü hızla içeri yakınlaşır ve yumuşakça
// geri gelir. Vuruş anında kısa bir ışınsal bulanıklık ve parlama eklenir.
// P0: x=sıklık (vuruş/dk)  y=güç  z=bulanıklık  w=parlama
vec4 fx(vec2 uv) {
  float bpm = mix(60.0, 180.0, uP0.x);
  float ph = fract(uTime * bpm / 60.0);
  // Vuruş zarfı: hızlı atak, üstel sönüş
  float env = smoothstep(0.0, 0.06, ph) * exp(-ph * 6.0) / 0.75;
  float z = 1.0 + env * mix(0.03, 0.18, uP0.y) * uAmount;
  vec2 c = uv - 0.5;
  vec2 q = c / z + 0.5;
  vec3 col = tex(q).rgb * 0.4;
  float b = env * mix(0.0, 0.05, uP0.z) * uAmount;
  col += tex(c / (z * (1.0 + b * 0.5)) + 0.5).rgb * 0.3;
  col += tex(c / (z * (1.0 + b)) + 0.5).rgb * 0.3;
  col *= 1.0 + env * 0.35 * uP0.w * uAmount;
  return vec4(col, 1.0);
}
