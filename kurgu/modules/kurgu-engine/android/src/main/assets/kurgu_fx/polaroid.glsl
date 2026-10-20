// Anında film: görüntü, altı daha kalın beyaz bir çerçevenin içindeki kareye
// yerleşir (kenarlar kırpılmaz, küçültülür). Görüntü anlık fotoğraf
// kimyasıyla solgun: kalkık siyahlar, camgöbeği gölgeler, sıcak ve hafif
// patlamış parlak alanlar, yumuşak kenar kararması. Çerçevede kâğıt dokusu.
// P0: x=çerçeve  y=solma  z=renk tonu (0 soğuk, 1 sıcak)
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  float bw = uP0.x * 0.06;                     // yan kenar kalınlığı (kısa kenar oranı)
  vec2 ar = vec2(aspect(), 1.0);
  vec2 p = uv * ar;
  // Pencere: yanlarda bw, altta 3.2*bw (dikey), üstte bw
  vec2 lo = vec2(bw, bw * 3.2);
  vec2 hi = ar - vec2(bw, bw);
  vec2 q = (p - lo) / (hi - lo);
  float inside = step(0.0, q.x) * step(q.x, 1.0) * step(0.0, q.y) * step(q.y, 1.0);
  // Pencere en-boyu kaynağınkinden farklı: ortadan kırp
  vec2 win = hi - lo;
  float wa = win.x / win.y;
  vec2 s = q;
  if (wa < aspect()) s.x = 0.5 + (q.x - 0.5) * wa / aspect();
  else s.y = 0.5 + (q.y - 0.5) * aspect() / wa;
  vec3 c = tex(s).rgb;
  // Anlık film kimyası
  float f = uP0.y;
  c = mix(c, c * c * (3.0 - 2.0 * c), 0.25);
  float l = luma(c);
  vec3 shadowT = mix(vec3(0.0, 0.07, 0.09), vec3(0.06, 0.03, 0.0), uP0.z);
  vec3 hiT = mix(vec3(0.97, 1.0, 1.03), vec3(1.06, 1.0, 0.88), uP0.z);
  c = c * hiT + shadowT * (1.0 - l) * (0.6 + f);
  c = mix(c, vec3(l), 0.15 * f);
  c = c * (1.0 - 0.12 * f) + 0.09 * f;
  c = mix(c, vec3(1.0, 0.98, 0.94), smoothstep(0.75, 1.0, l) * 0.3 * f);
  vec2 cq = s - 0.5;
  c *= 1.0 - 0.35 * dot(cq, cq) * 2.0;
  // Çerçeve kâğıdı ve pencere kenarındaki ince gölge
  vec3 frameC = vec3(0.96, 0.95, 0.92) * (0.97 + 0.03 * vnoise(uv * uRes * 0.3));
  float edgeD = min(min(q.x, 1.0 - q.x) * win.x, min(q.y, 1.0 - q.y) * win.y);
  c *= mix(0.85, 1.0, smoothstep(0.0, 0.006, edgeD));
  vec3 col = bw > 0.0005 ? mix(frameC, c, inside) : c;
  return vec4(mix(src, col, uAmount), 1.0);
}
