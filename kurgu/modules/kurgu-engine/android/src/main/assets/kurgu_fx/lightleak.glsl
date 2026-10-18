// Işık sızıntısı: film kapısının kenarlarından sızan ışık. Lekelerin merkezi
// kadrajın dışındadır; ışık içeri doğru yumuşakça sönümlenir, yavaşça kayar ve
// nefes alır. Renkler film paletinden seçilir (kırmızı → turuncu → yumuşak sarı);
// ton parametresi paleti gül/mor ya da soğuk mavi tarafa kaydırır.
// P0: x=hız  y=palet (0 sıcak, .5 gül, 1 soğuk)  z=boyut  w=parlama
vec3 leakPalette(float k, float pal) {
  vec3 warmA = vec3(1.0, 0.28, 0.08), warmB = vec3(1.0, 0.62, 0.18), warmC = vec3(1.0, 0.86, 0.55);
  vec3 roseA = vec3(0.95, 0.18, 0.35), roseB = vec3(1.0, 0.45, 0.55), roseC = vec3(1.0, 0.78, 0.7);
  vec3 coolA = vec3(0.25, 0.35, 1.0), coolB = vec3(0.45, 0.7, 1.0), coolC = vec3(0.85, 0.9, 1.0);
  vec3 a = mix(mix(warmA, roseA, smoothstep(0.0, 0.5, pal)), coolA, smoothstep(0.5, 1.0, pal));
  vec3 b = mix(mix(warmB, roseB, smoothstep(0.0, 0.5, pal)), coolB, smoothstep(0.5, 1.0, pal));
  vec3 c = mix(mix(warmC, roseC, smoothstep(0.0, 0.5, pal)), coolC, smoothstep(0.5, 1.0, pal));
  return k < 0.5 ? mix(a, b, k * 2.0) : mix(b, c, k * 2.0 - 1.0);
}

vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  float t = uTime * mix(0.06, 0.45, uP0.x) + uSeed * 10.0;
  vec2 p = centered(uv);
  float halfW = 0.5 * aspect();
  float size = mix(0.25, 0.6, uP0.z);
  vec3 leak = vec3(0.0);
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float side = i == 1 ? 1.0 : -1.0;
    vec2 c = vec2(side * (halfW + size * 0.35 + 0.08 * sin(t * 0.9 + fi)),
                  0.45 * sin(t * (0.35 + 0.13 * fi) + fi * 2.1));
    if (i == 2) c = vec2(0.35 * halfW * sin(t * 0.4), 0.5 + size * 0.3 + 0.05 * sin(t));
    vec2 d = (p - c) * vec2(0.55, 1.0);
    float r = length(d) / (size * (0.9 + 0.25 * fi));
    float fall = exp(-r * r * 1.6);
    float breathe = 0.7 + 0.3 * sin(t * 1.3 + fi * 2.0);
    leak += leakPalette(clamp(1.0 - r * 0.9, 0.0, 1.0), uP0.y) * fall * breathe * (i == 2 ? 0.55 : 1.0);
  }
  float flash = uP0.w * pow(max(0.0, sin(t * 1.9)), 30.0);
  leak += flash * vec3(1.0, 0.85, 0.7) * 0.6 * smoothstep(0.9, 0.2, length(p) / halfW);
  vec3 col = screen(src, clamp(leak * 0.85 * uAmount, 0.0, 1.0));
  return vec4(col, 1.0);
}
