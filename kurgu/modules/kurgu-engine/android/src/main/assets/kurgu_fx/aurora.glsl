// Kuzey ışıkları: gökyüzünde dalgalanan perdeler. Perdeler dikey ince
// çizgilerden oluşur, alt kenarı keskin ve parlak yeşil, yukarı doğru morumsu
// solar. Yavaşça kıvrılıp kayar. Işık en çok karanlık gök bölgelerinde görünür.
// P0: x=yükseklik  y=hız  z=renk (0 yeşil, 1 pembe-mor)  w=parlaklık
// Üç oktavlı hafif gürültü (perde kıvrımları için yeterli, fbm'den ucuz)
float fbm3(vec2 p) { return vnoise(p) * 0.57 + vnoise(p * 2.03 + 17.1) * 0.29 + vnoise(p * 4.1 + 3.7) * 0.14; }
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  vec2 p = uv * vec2(aspect(), 1.0);
  float t = uTime * mix(0.03, 0.25, uP0.y);
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    // Perdenin alt kenarı: yavaş dalgalanan eğri
    float base = mix(0.35, 0.65, uP0.x) + fi * 0.06
               + (fbm3(vec2(p.x * 0.6 + fi * 3.1 + t, t * 0.5)) - 0.5) * 0.35;
    float y = uv.y - base;
    // Dikey ışın çizgileri
    float rays = vnoise(vec2(p.x * 40.0 + fi * 7.0 + (vnoise(vec2(p.x * 2.0, t)) - 0.5) * 6.0, t * 2.0));
    rays = 0.45 + 0.55 * rays;
    float bottom = smoothstep(-0.015, 0.02, y);
    float fade = exp(-max(y, 0.0) * mix(9.0, 4.0, fi / 2.0));
    float curtain = bottom * fade * rays;
    vec3 low = mix(vec3(0.15, 1.0, 0.45), vec3(1.0, 0.3, 0.7), uP0.z);
    vec3 high = mix(vec3(0.45, 0.2, 0.9), vec3(0.4, 0.3, 1.0), uP0.z);
    vec3 c = mix(low, high, smoothstep(0.0, 0.25, y));
    acc += c * curtain * (0.7 - fi * 0.15);
  }
  // Gökyüzü maskesi: karanlık ve üst bölgeler
  float sky = (1.0 - smoothstep(0.25, 0.75, luma(src))) * smoothstep(0.15, 0.5, uv.y);
  vec3 add = acc * mix(0.4, 1.2, uP0.w) * (0.35 + 0.65 * sky);
  vec3 col = screen(src, clamp(add * uAmount, 0.0, 1.0));
  return vec4(col, 1.0);
}
