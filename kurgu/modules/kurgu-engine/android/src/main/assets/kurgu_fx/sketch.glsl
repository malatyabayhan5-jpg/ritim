// Karakalem eskiz: gri ton, kendi bulanık sürümüne bölünerek (renk soldurma
// karışımı) yalnızca çizgiler ve ince ton geçişleri kalır. Koyu bölgelere
// eğik kurşun kalem taramaları eklenir; isteğe bağlı olarak özgün renk boya
// kalemi gibi hafifçe geri getirilir. Kâğıt dokusu çizgileri kırar.
// P0: x=çizgi kalınlığı  y=tarama  z=özgün renk  w=kâğıt tonu
//
// İki geçiş: bulanık gri ton yarım çözünürlükte hazırlanır.
vec4 prepass(vec2 uv) {
  vec2 d = px() * 2.5;
  float l = luma(tex(uv).rgb) * 0.2;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * TAU / 8.0;
    l += luma(tex(uv + vec2(cos(a), sin(a)) * d).rgb) * 0.1;
  }
  return vec4(vec3(l), 1.0);
}
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  float l = luma(src);
  float sc = min(uRes.x, uRes.y) / 1080.0;
  vec2 o = px() * mix(1.0, 4.0, uP0.x) * max(sc, 0.5);
  float b = pre(uv).r * 0.4 + (pre(uv + vec2(o.x, 0.0)).r + pre(uv - vec2(o.x, 0.0)).r + pre(uv + vec2(0.0, o.y)).r + pre(uv - vec2(0.0, o.y)).r) * 0.15;
  // Soldurma: l / bulanık; düz bölgeler beyaza gider, kenarlar koyu kalır
  float s = clamp(l / max(b, 0.02), 0.0, 1.0);
  s = pow(s, mix(2.0, 5.0, uP0.x));
  // Grafit dolgu: koyu bölgeler gri tona iner
  s *= mix(0.5, 1.0, smoothstep(0.03, 0.55, b));
  // Taramalar: koyu tonlarda iki yönde, kâğıt gürültüsüyle kırılmış çizgiler
  vec2 p = uv * uRes / max(sc, 0.5);
  float dark = 1.0 - smoothstep(0.1, 0.6, b);
  float h1 = vnoise(rot2(p, 0.6) * vec2(0.35, 0.02));
  float h2 = vnoise(rot2(p, -0.9) * vec2(0.35, 0.02));
  float hatch = smoothstep(0.55, 0.75, h1) * dark + smoothstep(0.55, 0.75, h2) * smoothstep(0.5, 0.9, dark);
  s *= 1.0 - hatch * 0.45 * uP0.y;
  // Kâğıt dokusu: grafit pürüzlü yüzeyin tepelerinde kalır
  float paperN = hash12(floor(p)) * 0.5 + vnoise(p * 0.25) * 0.5;
  s = mix(s, 1.0, (1.0 - s) * smoothstep(0.55, 0.95, paperN) * 0.35);
  vec3 paper = mix(vec3(1.0), vec3(0.97, 0.94, 0.86), uP0.w);
  vec3 graphite = vec3(0.16, 0.16, 0.19);
  vec3 col = mix(graphite, paper, s);
  // Renkli kalem: özgün renk açık tonlarda kâğıda sızar
  vec3 tint = mix(vec3(1.0), src / max(max(src.r, max(src.g, src.b)), 0.05), 0.8);
  col = mix(col, col * tint, uP0.z);
  return vec4(mix(src, col, uAmount), 1.0);
}
