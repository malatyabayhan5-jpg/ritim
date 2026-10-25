// Kanvas arka planı (CanvasBgFx.kt): kaynak kare kanvasa sığdırılır (Media3 Presentation
// LAYOUT_SCALE_TO_FIT ile aynı yerleşim), kalan boşluklar düz renkle ya da kaynağın kanvası
// dolduracak kadar büyütülmüş bulanık ve hafif karartılmış kopyasıyla doldurulur.
// uP0 = (kaynak en/boy oranı, kip: 0 renk / 1 bulanık, bulanıklık 0..1, karartma 0..1)
// uP1 = arka plan rengi (RGBA, 0..1). Çıktı boyutu (uRes) kanvas boyutudur.

vec2 fitHalf(float s, float a, bool fill) {
  bool wide = s > a;
  if (fill) return wide ? vec2(s / a, 1.0) : vec2(1.0, a / s);
  return wide ? vec2(1.0, a / s) : vec2(s / a, 1.0);
}

// Altın açı sarmalında 48 örnek: büyük yarıçapta bile düzgün, tek geçişli bulanıklık.
// Yarıçap kaynak genişliğinin kesri; dikey adım en/boy oranıyla düzeltilir (daire biçimli).
vec3 blurAt(vec2 uv, float r, float s) {
  vec3 acc = tex(uv).rgb;
  for (int i = 1; i < 48; i++) {
    float fi = float(i);
    float d = r * sqrt(fi / 48.0);
    float a = fi * GOLDEN;
    acc += tex(uv + vec2(cos(a), sin(a) * s) * d).rgb;
  }
  return acc / 48.0;
}

vec4 fx(vec2 uv) {
  float a = aspect();
  float s = max(uP0.x, 0.01);
  vec2 q = uv * 2.0 - 1.0;
  vec2 inner = q / fitHalf(s, a, false);
  if (abs(inner.x) <= 1.0 && abs(inner.y) <= 1.0) return tex(inner * 0.5 + 0.5);
  if (uP0.y < 0.5) return vec4(uP1.rgb, 1.0);
  vec2 uvFill = (q / fitHalf(s, a, true)) * 0.5 + 0.5;
  vec3 c = blurAt(uvFill, mix(0.02, 0.07, clamp(uP0.z, 0.0, 1.0)), s);
  return vec4(c * (1.0 - 0.6 * clamp(uP0.w, 0.0, 1.0)), 1.0);
}
