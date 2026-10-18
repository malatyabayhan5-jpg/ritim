// Yumuşak ışıma (bloom). Parlak alanlar yumuşak dizli eşikle seçilir, iki
// katmanlı (yakın + geniş hale) altın açı örneklemesiyle yayılır ve ekran
// karışımıyla eklenir; görüntü ayrıntısı korunur.
// P0: x=yarıçap  y=eşik  z=sıcaklık  w=geniş hale
vec3 brightPass(vec3 c, float thr) {
  float l = max(c.r, max(c.g, c.b));
  float knee = 0.2;
  float soft = clamp(l - thr + knee, 0.0, 2.0 * knee);
  soft = soft * soft / (4.0 * knee + 1e-4);
  return c * (max(soft, l - thr) / max(l, 1e-4));
}

vec3 halo(vec2 uv, float radius, float thr) {
  vec2 scale = vec2(radius / aspect(), radius);
  vec3 acc = vec3(0.0);
  float wsum = 0.0;
  for (int i = 0; i < 36; i++) {
    float fi = float(i);
    float r = sqrt((fi + 0.5) / 36.0);
    float a = fi * GOLDEN + uSeed;
    float w = exp(-r * r * 3.0);
    acc += brightPass(tex(uv + vec2(cos(a), sin(a)) * r * scale).rgb, thr) * w;
    wsum += w;
  }
  return acc / wsum;
}

vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  float radius = mix(0.015, 0.07, uP0.x);
  float thr = mix(0.55, 0.95, uP0.y);
  vec3 own = brightPass(src, thr);
  // Yalnızca komşulara taşan ışık eklenir: büyük parlak alanlar yıkanmaz, ayrıntı kalır.
  vec3 b = max(halo(uv, radius, thr) - own * 0.85, 0.0) * 1.6
         + max(halo(uv, radius * 3.2, thr) - own * 0.6, 0.0) * 1.0 * uP0.w;
  vec3 tint = mix(vec3(1.0), vec3(1.0, 0.82, 0.62), uP0.z);
  vec3 col = screen(src, clamp(b * tint * uAmount, 0.0, 1.0));
  // Parlak çekirdeklere hafif "ışık" yükseltmesi
  col += own * 0.12 * uAmount;
  return vec4(col, 1.0);
}
