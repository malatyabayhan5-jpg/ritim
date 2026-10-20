// Gece görüşü: görüntü yükseltici tüpten geçmiş gibi yeşil fosfor tonunda;
// karanlık alanlar kazançla açılır, ışık kaynakları taşar. Güçlü, kare başına
// değişen tüp gürültüsü, ince tarama deseni ve isteğe bağlı dürbün maskesi.
// P0: x=kazanç  y=gürültü  z=dürbün maskesi  w=taşma
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  float gain = mix(1.2, 4.0, uP0.x);
  float l = luma(src);
  // Taşma: 8 noktalı geniş çevre ortalaması
  float b = 0.0;
  vec2 r = vec2(0.02 / aspect(), 0.02);
  for (int i = 0; i < 8; i++) {
    float a = float(i) * TAU / 8.0;
    b += luma(tex(uv + vec2(cos(a), sin(a)) * r).rgb);
  }
  b /= 8.0;
  float v = 1.0 - exp(-l * gain);                // yumuşak doyma
  v += smoothstep(0.5, 1.0, b) * 0.6 * uP0.w;
  float frame = floor(uTime * 30.0);
  float n = hash12(floor(uv * uRes * 0.5) + frame * 19.0) - 0.5;
  float n2 = vnoise(uv * uRes * 0.08 + frame * 5.0) - 0.5;
  v += (n * 0.3 + n2 * 0.15) * uP0.y * (0.5 + 0.5 * (1.0 - v));
  v *= 0.95 + 0.05 * sin(uv.y * uRes.y * 1.3);
  v *= 0.97 + 0.03 * sin(uTime * 37.0);
  vec3 col = vec3(0.18, 1.0, 0.32) * clamp(v, 0.0, 1.2) + vec3(0.0, 0.03, 0.01);
  col = mix(col, vec3(0.75, 1.0, 0.75), smoothstep(0.85, 1.2, v) * 0.6);
  // Tüp kenarı kararması ve isteğe bağlı çift dürbün maskesi
  vec2 p = centered(uv);
  col *= 1.0 - smoothstep(0.35, 0.9, length(p)) * 0.8;
  float m1 = length(p - vec2(-0.24, 0.0));
  float m2 = length(p - vec2(0.24, 0.0));
  float mask = smoothstep(0.47, 0.44, min(m1, m2));
  col *= mix(1.0, mask, uP0.z);
  return vec4(mix(src, col, uAmount), 1.0);
}
