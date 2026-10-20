// Seçici renk (renk vurgusu): seçilen ton aralığı renkli kalır, geri kalan
// görüntü kontrastlı siyah-beyaza döner. Ton sınırı yumuşaktır; düşük
// doygunluklu (gri) pikseller seçime girmez.
// P0: x=ton  y=aralık  z=arka planı karartma  w=kontrast
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  float mx = max(src.r, max(src.g, src.b));
  float d = mx - min(src.r, min(src.g, src.b));
  float h = 0.0;
  if (d > 1e-5) {
    if (mx == src.r) h = mod((src.g - src.b) / d, 6.0);
    else if (mx == src.g) h = (src.b - src.r) / d + 2.0;
    else h = (src.r - src.g) / d + 4.0;
  }
  h /= 6.0;
  float sat = d / max(mx, 1e-5);
  float dh = abs(fract(h - uP0.x + 0.5) - 0.5);           // dairesel ton farkı
  float range = mix(0.03, 0.16, uP0.y);
  float keep = smoothstep(range + 0.04, range, dh) * smoothstep(0.12, 0.3, sat) * smoothstep(0.03, 0.12, mx);
  float l = luma(src);
  float k = mix(0.0, 0.8, uP0.w);
  float bw = mix(l, l * l * (3.0 - 2.0 * l), k) * (1.0 - 0.5 * uP0.z);
  // Seçilen renk biraz canlandırılır
  vec3 pop = mix(vec3(l), src, 1.25);
  vec3 col = mix(vec3(bw), pop, keep);
  return vec4(mix(src, col, uAmount), 1.0);
}
