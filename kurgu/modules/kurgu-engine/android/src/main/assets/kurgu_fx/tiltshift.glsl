// Tilt-shift (minyatür): odak bandının dışında giderek artan disk bulanıklığı
// (parlak noktalar bokeh gibi ağırlıklandırılır), canlı renk ve hafif kontrast.
// P0: x=odak konumu  y=odak genişliği  z=bulanıklık  w=doygunluk
//
// İki geçiş: bokeh ağırlığı (pow) yarım çözünürlükte bir kez hesaplanıp alfa
// kanalına yazılır; disk örneklemesi bu dokudan okur. Odak bandında örnekleme
// yapılmaz (keskin kaynak kullanılır).
vec4 prepass(vec2 uv) {
  vec3 s = tex(uv).rgb;
  return vec4(s, pow(luma(s), 4.0));
}
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  float center = mix(0.2, 0.8, uP0.x);
  float width = mix(0.04, 0.3, uP0.y);
  float d = max(0.0, abs(uv.y - center) - width);
  float radius = smoothstep(0.0, 0.4, d) * mix(4.0, 24.0, uP0.z) * uAmount * (uRes.y / 1080.0);
  vec3 col = src;
  if (radius > 0.25) {
    vec3 acc = vec3(0.0);
    float wsum = 0.0;
    // Altın açı dönüşü her adımda bir döndürme matrisiyle ilerletilir (sin/cos yok)
    vec2 dir = vec2(1.0, 0.0);
    mat2 ga = mat2(cos(GOLDEN), sin(GOLDEN), -sin(GOLDEN), cos(GOLDEN));
    for (int i = 0; i < 40; i++) {
      float r = sqrt((float(i) + 0.5) / 40.0);
      vec4 s = pre(uv + dir * r * radius * px());
      float w = 1.0 + s.a * 6.0;
      acc += s.rgb * w;
      wsum += w;
      dir = ga * dir;
    }
    // Çok küçük yarıçapta yarım çözünürlüklü doku yerine keskin kaynağa yumuşak geçiş
    col = mix(src, acc / wsum, smoothstep(0.25, 2.0, radius));
  }
  float l = luma(col);
  col = mix(vec3(l), col, 1.0 + uP0.w * 0.5 * uAmount);
  col = mix(col, col * col * (3.0 - 2.0 * col), 0.2 * uAmount);
  return vec4(col, 1.0);
}
