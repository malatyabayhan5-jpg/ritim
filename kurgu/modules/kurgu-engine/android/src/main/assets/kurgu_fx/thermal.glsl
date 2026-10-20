// Termal kamera: sıcaklık görüntünün parlaklığından ve sıcak renklerinden
// tahmin edilir, hafifçe yumuşatılır (sensör çözünürlüğü) ve "demir" ya da
// gökkuşağı paletine eşlenir. Sensör gürültüsü ve ince satır deseni eklenir.
// P0: x=palet (0 demir, 1 gökkuşağı)  y=kontrast  z=gürültü  w=bulanıklık
vec3 ironPal(float t) {
  vec3 c = mix(vec3(0.0, 0.0, 0.05), vec3(0.3, 0.0, 0.55), smoothstep(0.0, 0.25, t));
  c = mix(c, vec3(0.85, 0.05, 0.35), smoothstep(0.2, 0.45, t));
  c = mix(c, vec3(1.0, 0.45, 0.0), smoothstep(0.45, 0.7, t));
  c = mix(c, vec3(1.0, 0.9, 0.2), smoothstep(0.68, 0.88, t));
  return mix(c, vec3(1.0), smoothstep(0.86, 1.0, t));
}
vec3 rainbowPal(float t) {
  vec3 c = hsv2rgb(vec3(0.7 - 0.7 * clamp(t, 0.0, 1.0), 0.95, 1.0));
  c *= smoothstep(0.0, 0.12, t) * 0.8 + 0.2;
  return mix(c, vec3(1.0), smoothstep(0.92, 1.0, t));
}
float heat(vec3 c) { return luma(c) * 0.75 + max(c.r - c.b, 0.0) * 0.35; }
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  vec2 r = vec2(1.0 / aspect(), 1.0) * mix(0.001, 0.008, uP0.w);
  float h = heat(src) * 0.4;
  h += (heat(tex(uv + vec2(r.x, 0.0)).rgb) + heat(tex(uv - vec2(r.x, 0.0)).rgb)
      + heat(tex(uv + vec2(0.0, r.y)).rgb) + heat(tex(uv - vec2(0.0, r.y)).rgb)) * 0.15;
  float c = mix(0.8, 1.8, uP0.y);
  h = clamp((h - 0.5) * c + 0.5, 0.0, 1.0);
  // Sensör gürültüsü (kare başına yenilenir) ve ince satır deseni
  float n = hash12(floor(uv * uRes * 0.5) + floor(uTime * 24.0) * 17.0) - 0.5;
  h = clamp(h + n * 0.08 * uP0.z, 0.0, 1.0);
  vec3 col = mix(ironPal(h), rainbowPal(h), uP0.x);
  col *= 1.0 - 0.06 * uP0.z * step(0.5, fract(uv.y * uRes.y / 3.0));
  return vec4(mix(src, col, uAmount), 1.0);
}
