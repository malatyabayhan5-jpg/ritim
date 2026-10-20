// Rüya ışıltısı (Orton etkisi): görüntünün bulanık ve aydınlatılmış bir kopyası
// keskin görüntüyle "ekran" karışımında birleşir; ayrıntı korunurken her şey
// yumuşak, parlak ve masalsı bir ışığa bürünür. Doygunluk hafifçe artar.
// P0: x=yumuşaklık  y=ışıltı  z=doygunluk
//
// İki geçiş: yarım çözünürlükte 9 noktalı bulanık kopya, ana geçişte geniş
// halkada yeniden örneklenir.
vec4 prepass(vec2 uv) {
  vec2 d = px() * 3.0;
  vec3 c = tex(uv).rgb * 0.2;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * TAU / 8.0;
    c += tex(uv + vec2(cos(a), sin(a)) * d).rgb * 0.1;
  }
  return vec4(c, 1.0);
}
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  float R = mix(0.006, 0.03, uP0.x);
  vec3 b = pre(uv).rgb * 0.2;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * TAU / 8.0 + 0.4;
    b += pre(uv + vec2(cos(a) / aspect(), sin(a)) * R).rgb * 0.1;
  }
  // Bulanık kopya aydınlatılır, sonra keskin görüntüyle ekran karışımı
  vec3 bright = b * b * mix(0.8, 1.7, uP0.y);
  vec3 col = screen(src, bright);
  col = mix(col, (col + b) * 0.5, 0.25 * uP0.x);
  col = mix(vec3(luma(col)), col, mix(1.0, 1.35, uP0.z));
  return vec4(mix(src, col, uAmount), 1.0);
}
