// Sis: farklı hızlarda sürüklenen iki katmanlı sis bulutları. Sis aşağıda
// (ya da yükseklik ayarına göre daha yukarıda) yoğunlaşır; kaldığı yerde
// kontrastı ve doygunluğu azaltır, ışıkları yumuşak hale getirir.
// P0: x=yoğunluk  y=yükseklik  z=hız  w=renk (0 soğuk mavi-gri, 1 sıcak)
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  vec2 p = uv * vec2(aspect(), 1.0);
  float t = uTime * mix(0.02, 0.15, uP0.z);
  float f1 = fbm(p * vec2(1.6, 3.0) + vec2(t * 1.0, 0.0) + uSeed * 5.0);
  float f2 = fbm(p * vec2(3.5, 6.0) + vec2(-t * 1.7, t * 0.3) + 11.0);
  float n = f1 * 0.65 + f2 * 0.35;
  float h = mix(0.35, 1.1, uP0.y);
  float grad = smoothstep(h, 0.0, uv.y) * 0.75 + 0.25;
  float dens = clamp((n - 0.22) * 2.2, 0.0, 1.0) * grad * mix(0.35, 1.0, uP0.x);
  dens = clamp(dens + grad * 0.25 * uP0.x, 0.0, 0.92);
  vec3 fogC = mix(vec3(0.72, 0.77, 0.82), vec3(0.86, 0.8, 0.7), uP0.w);
  // Sis sahnenin aydınlığını taşır: karanlık sahnede sis de koyulaşır
  float key = luma(tex(vec2(0.25, 0.5)).rgb + tex(vec2(0.75, 0.5)).rgb + tex(vec2(0.5, 0.3)).rgb + tex(vec2(0.5, 0.75)).rgb) * 0.25;
  float amb = key * 0.6 + luma(src) * 0.2 + 0.3;
  vec3 col = mix(src, fogC * amb, dens);
  // Işıklar siste yayılır (parlak noktalar sis rengini aydınlatır)
  col += src * smoothstep(0.7, 1.0, luma(src)) * dens * 0.4;
  return vec4(mix(src, col, uAmount), 1.0);
}
