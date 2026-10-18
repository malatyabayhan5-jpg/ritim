// Tilt-shift (minyatür): odak bandının dışında giderek artan disk bulanıklığı
// (parlak noktalar bokeh gibi ağırlıklandırılır), canlı renk ve hafif kontrast.
// P0: x=odak konumu  y=odak genişliği  z=bulanıklık  w=doygunluk
vec4 fx(vec2 uv) {
  float center = mix(0.2, 0.8, uP0.x);
  float width = mix(0.04, 0.3, uP0.y);
  float d = max(0.0, abs(uv.y - center) - width);
  float radius = smoothstep(0.0, 0.4, d) * mix(4.0, 24.0, uP0.z) * uAmount * (uRes.y / 1080.0);
  vec3 acc = vec3(0.0);
  float wsum = 0.0;
  for (int i = 0; i < 40; i++) {
    float fi = float(i);
    float r = sqrt((fi + 0.5) / 40.0);
    float a = fi * GOLDEN;
    vec3 s = tex(uv + vec2(cos(a), sin(a)) * r * radius * px()).rgb;
    float w = 1.0 + pow(luma(s), 4.0) * 6.0;
    acc += s * w;
    wsum += w;
  }
  vec3 col = acc / wsum;
  float l = luma(col);
  col = mix(vec3(l), col, 1.0 + uP0.w * 0.5 * uAmount);
  col = mix(col, col * col * (3.0 - 2.0 * col), 0.2 * uAmount);
  return vec4(col, 1.0);
}
