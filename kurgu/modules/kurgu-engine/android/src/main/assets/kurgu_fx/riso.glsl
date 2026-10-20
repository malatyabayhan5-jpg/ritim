// Risograf baskı: görüntü iki spot mürekkebe ayrıştırılır (optik yoğunluk
// uzayında en küçük kareler çözümü), her mürekkep kendi grenli tramıyla ve
// hafif kaymış (baskı kayması) olarak kâğıda çarpımsal basılır.
// P0: x=palet (pembe/mavi, turuncu/camgöbeği, sarı/mor, kırmızı/lacivert)
//     y=baskı kayması  z=gren
void inks(float sel, out vec3 a, out vec3 b) {
  if (sel < 0.25) { a = vec3(1.0, 0.28, 0.55); b = vec3(0.0, 0.47, 0.75); }
  else if (sel < 0.5) { a = vec3(1.0, 0.45, 0.1); b = vec3(0.0, 0.55, 0.58); }
  else if (sel < 0.75) { a = vec3(1.0, 0.85, 0.05); b = vec3(0.45, 0.22, 0.62); }
  else { a = vec3(0.92, 0.16, 0.2); b = vec3(0.12, 0.16, 0.32); }
}
// Kaynak rengi iki mürekkebin yoğunluklarına ayır
vec2 separate(vec3 c, vec3 DA, vec3 DB) {
  vec3 D = -log(clamp(c, 0.02, 1.0) / vec3(0.97, 0.95, 0.9));
  D = max(D, 0.0);
  float aa = dot(DA, DA);
  float bb = dot(DB, DB);
  float ab = dot(DA, DB);
  float det = aa * bb - ab * ab;
  float da = (bb * dot(DA, D) - ab * dot(DB, D)) / det;
  float db = (aa * dot(DB, D) - ab * dot(DA, D)) / det;
  return clamp(vec2(da, db), 0.0, 1.0);
}
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  vec3 a; vec3 b;
  inks(uP0.x, a, b);
  vec3 DA = -log(a + 0.02);
  vec3 DB = -log(b + 0.02);
  vec2 off = vec2(0.004, -0.003) * uP0.y;
  float dA = separate(src, DA, DB).x;
  float dB = separate(tex(uv + off).rgb, DA, DB).y;
  // Gren: stencil tramı gibi rastgele eşik (sabit, kıpırdamaz)
  float sc = max(min(uRes.x, uRes.y) / 1080.0, 0.5);
  vec2 gp = floor(uv * uRes / (1.5 * sc));
  float nA = hash12(gp + 3.1);
  float nB = hash12(gp + 17.7);
  float g = uP0.z;
  dA = mix(dA, step(nA, dA * 1.1) * 0.95, g * 0.7);
  dB = mix(dB, step(nB, dB * 1.1) * 0.95, g * 0.7);
  // Kâğıda çarpımsal baskı (mürekkep yarı saydam)
  vec3 paper = vec3(0.97, 0.95, 0.9);
  vec3 col = paper * mix(vec3(1.0), a, dA) * mix(vec3(1.0), b, dB);
  col *= 1.0 - (vnoise(uv * uRes * 0.05) - 0.5) * 0.06;
  return vec4(mix(src, col, uAmount), 1.0);
}
