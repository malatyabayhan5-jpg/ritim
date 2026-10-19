// Yumuşak ışıma (bloom). Parlak alanlar yumuşak dizli eşikle seçilir, iki
// katmanlı (yakın + geniş hale) altın açı örneklemesiyle yayılır ve ekran
// karışımıyla eklenir; görüntü ayrıntısı korunur.
// P0: x=yarıçap  y=eşik  z=sıcaklık  w=geniş hale
//
// İki geçiş: parlak alan ayıklaması yarım çözünürlükte bir kez yapılır; hale
// örneklemesi bu dokudan okur.
vec3 brightPass(vec3 c, float thr) {
  float l = max(c.r, max(c.g, c.b));
  float knee = 0.2;
  float soft = clamp(l - thr + knee, 0.0, 2.0 * knee);
  soft = soft * soft / (4.0 * knee + 1e-4);
  return c * (max(soft, l - thr) / max(l, 1e-4));
}

vec4 prepass(vec2 uv) {
  return vec4(brightPass(tex(uv).rgb, mix(0.55, 0.95, uP0.y)), 1.0);
}

vec3 halo(vec2 uv, float radius) {
  vec2 scale = vec2(radius / aspect(), radius);
  vec3 acc = vec3(0.0);
  float wsum = 0.0;
  // Altın açı dönüşü döndürme matrisiyle, ağırlık exp(-3r²) sabit çarpanla ilerletilir
  vec2 dir = vec2(cos(uSeed), sin(uSeed));
  mat2 ga = mat2(cos(GOLDEN), sin(GOLDEN), -sin(GOLDEN), cos(GOLDEN));
  float w = exp(-1.5 / 22.0);
  float wk = exp(-3.0 / 22.0);
  for (int i = 0; i < 22; i++) {
    float r = sqrt((float(i) + 0.5) / 22.0);
    acc += pre(uv + dir * r * scale).rgb * w;
    wsum += w;
    dir = ga * dir;
    w *= wk;
  }
  return acc / wsum;
}

vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  float radius = mix(0.015, 0.07, uP0.x);
  float thr = mix(0.55, 0.95, uP0.y);
  vec3 own = brightPass(src, thr);
  // Yalnızca komşulara taşan ışık eklenir: büyük parlak alanlar yıkanmaz, ayrıntı kalır.
  vec3 b = max(halo(uv, radius) - own * 0.85, 0.0) * 1.6
         + max(halo(uv, radius * 3.2) - own * 0.6, 0.0) * 1.0 * uP0.w;
  vec3 tint = mix(vec3(1.0), vec3(1.0, 0.82, 0.62), uP0.z);
  vec3 col = screen(src, clamp(b * tint * uAmount, 0.0, 1.0));
  // Parlak çekirdeklere hafif "ışık" yükseltmesi
  col += own * 0.12 * uAmount;
  return vec4(col, 1.0);
}
