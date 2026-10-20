// Kızılötesi film: bitki örtüsü kızılötesini güçlü yansıttığı için yeşiller
// parlar. Renkli kipte (sahte renk) kanallar kaydırılır: yeşiller pembe-kırmızı,
// gökyüzü koyu mavi olur. Siyah-beyaz kipte yeşiller beyaz, gök siyah ve
// parlak alanlarda halesyon (yumuşak hale) oluşur.
// P0: x=kip (0 renkli, 1 siyah-beyaz)  y=bitki tepkisi  z=hale
float irOf(vec3 c, float fol) {
  // Yeşilin diğer kanallardan baskınlığı = "bitki örtüsü" tahmini
  float veg = clamp((c.g - max(c.r, c.b) * 0.85) * 4.0, 0.0, 1.0);
  float ir = c.r * 0.78 + c.g * 0.25 - c.b * 0.12;
  return clamp(ir + veg * mix(0.25, 0.8, fol), 0.0, 1.0);
}
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  float fol = uP0.y;
  float ir = irOf(src, fol);
  // Hale: 8 noktalı yumuşak çevre (parlak kızılötesi alanlar taşar)
  float h = 0.0;
  vec2 r = vec2(0.012 / aspect(), 0.012) * mix(0.5, 2.0, uP0.z);
  for (int i = 0; i < 8; i++) {
    float a = float(i) * TAU / 8.0 + 0.3;
    h += irOf(tex(uv + vec2(cos(a), sin(a)) * r).rgb, fol);
  }
  h /= 8.0;
  float bloom = smoothstep(0.45, 1.0, h) * uP0.z;
  // Renkli kip: IR→kırmızı, kırmızı→yeşil, yeşil→mavi (renk kızılötesi film düzeni)
  vec3 fc = vec3(ir, src.r * 0.75 + src.b * 0.1, src.g * 0.8 + src.b * 0.15);
  fc = mix(vec3(luma(fc)), fc, 1.25);
  fc = screen(fc, vec3(1.0, 0.75, 0.85) * bloom * 0.6);
  // S/B kip: parlak yapraklar, koyu gök, hale
  float bw = ir * 1.1;
  bw = bw * bw * (3.0 - 2.0 * bw);
  vec3 mono = screen(vec3(bw), vec3(bloom * 0.7));
  vec3 col = mix(fc, mono, uP0.x);
  return vec4(mix(src, col, uAmount), 1.0);
}
