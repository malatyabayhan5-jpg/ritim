// Anamorfik ışık çizgisi: yalnızca çevresinden belirgin biçimde parlak olan
// noktasal ışık kaynakları (lambalar, güneş, yansımalar) seçilir; bunlardan
// yatay, ince, uçlara doğru sönen mavi-camgöbeği ışık çizgileri uzanır.
// Geniş parlak yüzeyler (gökyüzü, beyaz duvar) çizgi üretmez.
// P0: x=çizgi uzunluğu  y=eşik  z=renk (0 mavi, 1 sıcak)  w=kontrast
float pointLight(vec2 uv, float thr) {
  vec3 c = tex(uv).rgb;
  float l = max(c.r, max(c.g, c.b));
  float r = 10.0;
  float surround = 0.0;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * TAU / 8.0;
    vec3 s = tex(uv + vec2(cos(a), sin(a)) * px() * r * (uRes.y / 540.0)).rgb;
    surround += max(s.r, max(s.g, s.b));
  }
  surround /= 8.0;
  float k = smoothstep(thr, 1.0, l) * smoothstep(0.15, 0.5, l - surround * 0.85);
  return k * k;
}
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  float thr = mix(0.55, 0.92, uP0.y);
  float len = mix(0.12, 0.5, uP0.x);
  float j = hash12(uv * uRes) - 0.5;
  float acc = 0.0;
  float wsum = 0.0;
  for (int i = 0; i < 40; i++) {
    float t = ((float(i) + j) / 39.5) * 2.0 - 1.0;
    float w = exp(-abs(t) * 4.0);
    acc += pointLight(uv + vec2(t * len / aspect(), 0.0), thr) * w;
    wsum += w;
  }
  float s = acc / wsum * 6.0;
  vec3 tint = mix(vec3(0.3, 0.6, 1.0), vec3(1.0, 0.62, 0.32), uP0.z);
  vec3 col = screen(src, clamp(s * tint * uAmount, 0.0, 1.0));
  col = mix(col, col * col * (3.0 - 2.0 * col), 0.2 * uP0.w * uAmount);
  return vec4(col, 1.0);
}
