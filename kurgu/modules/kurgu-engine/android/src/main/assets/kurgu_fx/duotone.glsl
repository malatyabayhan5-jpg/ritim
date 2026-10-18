// Duotone: parlaklık iki renkli bir geçişe eşlenir (gölge rengi → ışık rengi);
// ince orta ton kontrastı ve isteğe bağlı gren. Afiş/kapak görünümü.
// P0: x=palet  y=kontrast  z=orijinal renk karışımı  w=gren
vec3 paletteA(float k) {
  return k < 0.25 ? vec3(0.13, 0.05, 0.35) : (k < 0.5 ? vec3(0.05, 0.12, 0.3) : (k < 0.75 ? vec3(0.25, 0.04, 0.12) : vec3(0.02, 0.18, 0.16)));
}
vec3 paletteB(float k) {
  return k < 0.25 ? vec3(1.0, 0.45, 0.55) : (k < 0.5 ? vec3(0.35, 0.95, 0.85) : (k < 0.75 ? vec3(1.0, 0.8, 0.3) : vec3(0.9, 0.95, 0.5)));
}
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  float l = luma(src);
  l = mix(l, l * l * (3.0 - 2.0 * l), uP0.y);
  vec3 col = mix(paletteA(uP0.x), paletteB(uP0.x), l);
  col = mix(col, softLight(col, src), uP0.z * 0.6);
  col += (hash12(uv * uRes + floor(uTime * 24.0)) - 0.5) * 0.06 * uP0.w;
  return vec4(mix(src, col, uAmount), 1.0);
}
