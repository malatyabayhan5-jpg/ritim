// Suluboya: renkler sulandırılıp sadeleşir, boya ıslak kâğıtta düzensiz
// yayılır (gürültüyle bükülen örnekleme), boya lekelerinin kenarlarında
// pigment birikir (koyu kenar). Kâğıt dokusu, granülasyon ve kenarlarda
// boyasız kâğıt bırakan düzensiz bir çerçeve eklenir.
// P0: x=yayılma  y=koyu kenarlar  z=kâğıt dokusu  w=kâğıt çerçeve
//
// İki geçiş: yumuşatılmış renk katmanı yarım çözünürlükte hazırlanır.
vec4 prepass(vec2 uv) {
  vec2 d = px() * 3.0;
  vec3 c = tex(uv).rgb * 0.4;
  c += (tex(uv + vec2(d.x, d.y)).rgb + tex(uv + vec2(-d.x, d.y)).rgb + tex(uv + vec2(d.x, -d.y)).rgb + tex(uv - d).rgb) * 0.15;
  return vec4(c, 1.0);
}
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  vec2 p = uv * vec2(aspect(), 1.0);
  // Islak yayılma: düşük frekanslı bükme
  vec2 w = vec2(fbm(p * 5.0 + uSeed * 9.0), fbm(p * 5.0 + 31.7)) - 0.5;
  vec2 q = uv + w * mix(0.004, 0.022, uP0.x);
  vec3 c = pre(q).rgb;
  // Pigment sadeleşmesi: hafif basamak + sulandırma (kâğıt beyazına doğru)
  vec3 st = c * 6.0;
  c = (floor(st) + smoothstep(0.25, 0.75, fract(st))) / 6.0;
  c = mix(c, vec3(1.0), 0.12);
  // Kenar birikimi: renk değişiminin olduğu yerler koyulaşır (pigment çarpımı)
  vec2 e = vec2(0.004 / aspect(), 0.004);
  vec3 cx = pre(q + vec2(e.x, 0.0)).rgb - pre(q - vec2(e.x, 0.0)).rgb;
  vec3 cy = pre(q + vec2(0.0, e.y)).rgb - pre(q - vec2(0.0, e.y)).rgb;
  float edge = smoothstep(0.03, 0.25, length(cx) + length(cy));
  c = mix(c, c * c * 0.9, edge * uP0.y * 0.8);
  // Yıkama yoğunluğu: boya katmanı yer yer açık, yer yer koyu
  float dens = mix(0.82, 1.12, fbm(p * 2.5 + 7.0));
  c = 1.0 - (1.0 - c) * dens;
  // Kâğıt: lif dokusu ve koyu alanlarda granülasyon
  float fib = vnoise(uv * uRes / max(1.5, min(uRes.x, uRes.y) / 540.0) * 0.35);
  float gran = vnoise(p * 180.0);
  c *= 1.0 - (fib - 0.5) * 0.08 * uP0.z;
  c *= 1.0 - (gran - 0.5) * 0.18 * uP0.z * (1.0 - luma(c));
  vec3 paper = vec3(0.98, 0.96, 0.91);
  c *= mix(vec3(1.0), paper, uP0.z);
  // Düzensiz kâğıt çerçeve
  vec2 b = min(uv, 1.0 - uv) * vec2(aspect(), 1.0);
  float border = min(b.x, b.y) + (fbm(p * 8.0) - 0.5) * 0.05;
  float frame = smoothstep(0.08 * uP0.w, 0.08 * uP0.w + 0.02, border);
  c = mix(paper, c, mix(1.0, frame, step(0.01, uP0.w)));
  return vec4(mix(src, c, uAmount), 1.0);
}
