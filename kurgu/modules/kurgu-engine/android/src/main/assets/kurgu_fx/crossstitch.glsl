// Kanaviçe işlemesi: görüntü kumaş ızgarasının karelerine bölünür; her kareye
// hücre renginde, sınırlı iplik paletinden bir çarpı (X) dikiş atılır. İplik
// bükümü ince parlak çizgilerle, üstteki iplik alttakinin üzerinden geçer.
// Dikiş araları kumaş dokusu ve delikleri gösterir.
// P0: x=dikiş boyutu  y=kumaş tonu (0 krem, 1 koyu)  z=iplik parlaklığı
float strand(vec2 f, float dir, out float along) {
  // f: hücre içi -0.5..0.5; dir: +1 "/" ya da -1 "\" köşegeni
  vec2 axis = normalize(vec2(1.0, dir));
  vec2 nrm = vec2(-axis.y, axis.x);
  along = dot(f, axis);
  float across = dot(f, nrm);
  float len = 0.62;
  float w = 0.17 * smoothstep(len, len - 0.12, abs(along));   // uçlarda incelir
  return smoothstep(w, w - 0.05, abs(across)) * step(abs(along), len);
}
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  float cs = mix(8.0, 24.0, uP0.x) * max(min(uRes.x, uRes.y) / 720.0, 0.75);
  vec2 pix = uv * uRes;
  vec2 cell = floor(pix / cs);
  vec2 f = fract(pix / cs) - 0.5;
  vec3 c = tex((cell + 0.5) * cs / uRes).rgb;
  // İplik paleti: kanal başına 5 düzey, hafif doygunluk artışı
  c = mix(vec3(luma(c)), c, 1.15);
  c = floor(clamp(c, 0.0, 1.0) * 4.0 + 0.5) / 4.0;
  float a1; float a2;
  float s1 = strand(f, -1.0, a1);   // alttaki iplik
  float s2 = strand(f, 1.0, a2);    // üstteki iplik
  // İplik bükümü: eğik ince çizgiler, ipliğe yuvarlaklık gölgesi
  float twist1 = 0.85 + 0.15 * sin((a1 * 10.0 + dot(f, vec2(1.0, 1.0)) * 6.0) * PI);
  float twist2 = 0.85 + 0.15 * sin((a2 * 10.0 + dot(f, vec2(1.0, -1.0)) * 6.0) * PI);
  float shine = uP0.z;
  vec3 th1 = c * mix(1.0, twist1, shine) * 0.9;
  vec3 th2 = c * mix(1.0, twist2, shine) + shine * 0.08 * smoothstep(0.3, 0.0, abs(dot(f, vec2(0.7071, 0.7071))));
  // Kumaş: dokuma ve dört köşede delik
  vec3 fabric = mix(vec3(0.93, 0.9, 0.82), vec3(0.16, 0.16, 0.18), uP0.y);
  vec2 wp = pix / max(cs / 4.0, 1.0);
  fabric *= 0.92 + 0.08 * sin(wp.x * PI) * sin(wp.y * PI);
  float hole = smoothstep(0.08, 0.04, length(abs(f) - 0.5));
  fabric *= 1.0 - hole * 0.5;
  vec3 col = fabric;
  col = mix(col, col * 0.75, s1 * 0.5);                 // gölge
  col = mix(col, th1, s1);
  // Üstteki ipliğin altına düşen gölge
  col = mix(col, col * 0.7, strand(f + vec2(0.03, -0.03), 1.0, a2) * (1.0 - s2) * s1);
  col = mix(col, th2, s2);
  return vec4(mix(src, col, uAmount), 1.0);
}
