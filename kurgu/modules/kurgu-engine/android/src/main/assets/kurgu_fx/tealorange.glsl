// Camgöbeği-turuncu (teal & orange) sinema renklendirmesi. Parlaklık korunarak
// gölgeler ve soğuk tonlar camgöbeğine, ten ve sıcak ışıklar turuncuya itilir.
// Ten tonları (turuncu-kırmızı tonaj, orta doygunluk) korunur, yanmaz.
// P0: x=güç  y=ten koruması  z=kontrast
// Ton (0..1), doygunluk, değer: en büyük kanala göre altıgen ton hesabı
vec3 rgb2hsv(vec3 c) {
  float mx = max(c.r, max(c.g, c.b));
  float d = mx - min(c.r, min(c.g, c.b));
  float h = 0.0;
  if (d > 1e-5) {
    if (mx == c.r) h = mod((c.g - c.b) / d, 6.0);
    else if (mx == c.g) h = (c.b - c.r) / d + 2.0;
    else h = (c.r - c.g) / d + 4.0;
  }
  return vec3(h / 6.0, d / max(mx, 1e-5), mx);
}
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  float l = luma(src);
  vec3 hsv = rgb2hsv(src);
  // Sıcaklık: kırmızı/turuncu/sarı tonlar 1, mavi/yeşil tonlar 0
  float warm = smoothstep(0.22, 0.08, abs(fract(hsv.x + 0.45) - 0.53));
  float skin = warm * smoothstep(0.12, 0.3, hsv.y) * smoothstep(0.85, 0.5, hsv.y) * smoothstep(0.15, 0.35, l);
  vec3 teal = vec3(0.0, 0.52, 0.58);
  vec3 orange = vec3(1.0, 0.56, 0.24);
  // Hedef renk: sıcak alanlar ve parlak tonlar turuncu, gerisi camgöbeği
  float t = clamp(warm * 0.8 + smoothstep(0.55, 0.95, l) * 0.5, 0.0, 1.0);
  vec3 target = mix(teal, orange, t);
  // Parlaklığı koruyarak hedef renge kaydır (renk ve doygunluk karışımı)
  vec3 tinted = target * (l / max(luma(target), 1e-3));
  float s = uP0.x * mix(0.75, 0.35, skin * uP0.y) * (1.0 - smoothstep(0.85, 1.0, l) * 0.5);
  vec3 col = mix(src, tinted, s);
  col = mix(vec3(luma(col)), col, 1.0 + 0.25 * uP0.x);
  float k = mix(0.0, 0.6, uP0.z);
  col = mix(col, col * col * (3.0 - 2.0 * col), k);
  return vec4(mix(src, col, uAmount), 1.0);
}
