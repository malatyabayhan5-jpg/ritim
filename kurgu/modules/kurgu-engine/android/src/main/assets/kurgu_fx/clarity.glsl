// HDR ayrıntı (yerel kontrast): görüntü, bulanık yerel ortalamasından
// ayrıştırılır. Ayrıntı katmanı güçlendirilir; yerel ortalama ise sıkıştırılır
// (gölgeler açılır, parlak alanlar geri kazanılır). Dokular belirginleşir.
// P0: x=ayrıntı  y=ton sıkıştırma  z=doygunluk  w=yarıçap
//
// İki geçiş: yerel ortalama yarım çözünürlükte 9 noktadan hesaplanır; ana
// geçiş bu dokuyu geniş bir halkada tekrar örnekler.
vec4 prepass(vec2 uv) {
  vec2 d = px() * 2.0;
  vec3 c = tex(uv).rgb * 0.25;
  c += (tex(uv + vec2(d.x, 0.0)).rgb + tex(uv - vec2(d.x, 0.0)).rgb + tex(uv + vec2(0.0, d.y)).rgb + tex(uv - vec2(0.0, d.y)).rgb) * 0.125;
  c += (tex(uv + d).rgb + tex(uv - d).rgb + tex(uv + vec2(d.x, -d.y)).rgb + tex(uv - vec2(d.x, -d.y)).rgb) * 0.0625;
  return vec4(c, 1.0);
}
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  float r = mix(0.004, 0.02, uP0.w);
  vec2 sc = vec2(r / aspect(), r);
  vec3 avg = pre(uv).rgb * 0.2;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * TAU / 8.0;
    avg += pre(uv + vec2(cos(a), sin(a)) * sc).rgb * 0.1;
  }
  float la = luma(avg);
  float l = luma(src);
  // Ayrıntı: parlaklık farkı (renk kaymasını önlemek için luma üzerinden)
  // Yumuşak sınır: küçük dokular güçlenir, büyük kenar farkları hale üretmez
  float dd = l - la;
  float detail = dd * mix(0.4, 2.2, uP0.x) / (1.0 + abs(dd) * 9.0);
  // Ton sıkıştırma: yerel ortalama 0.5'e doğru çekilir
  float laC = mix(la, 0.5 + (la - 0.5) * 0.55, uP0.y);
  float nl = clamp(laC + (l - la) + detail, 0.0, 1.0);
  vec3 col = src * (nl / max(l, 1e-3));
  col = mix(col, vec3(nl) + (src - vec3(l)), step(l, 0.02));
  col = mix(vec3(luma(col)), col, mix(0.8, 1.45, uP0.z));
  return vec4(mix(src, clamp(col, 0.0, 1.0), uAmount), 1.0);
}
