// Hologram: görüntü yarı saydam, tek renkli bir ışık projeksiyonuna dönüşür.
// Kenarlar parlak bir çerçeve gibi ışır, yukarı akan tarama çizgileri ve
// ince satır deseni, projeksiyon titremesi ve ara sıra yatay kayma bozulmaları.
// P0: x=renk tonu  y=tarama çizgileri  z=titreme  w=bozulma
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  float t = uTime;
  // Ara sıra yatay bozulma bandı
  float gl = step(0.92, hash11(floor(t * 8.0))) * uP0.w;
  float band = smoothstep(0.04, 0.0, abs(uv.y - hash11(floor(t * 8.0) + 3.0)));
  vec2 q = uv + vec2(gl * band * 0.03 * sin(uv.y * 400.0), 0.0);
  vec3 c = tex(q).rgb;
  float l = luma(c);
  vec2 d = px() * 2.0;
  float gx = luma(tex(q + vec2(d.x, 0.0)).rgb) - luma(tex(q - vec2(d.x, 0.0)).rgb);
  float gy = luma(tex(q + vec2(0.0, d.y)).rgb) - luma(tex(q - vec2(0.0, d.y)).rgb);
  float edge = smoothstep(0.03, 0.25, length(vec2(gx, gy)));
  vec3 tint = hsv2rgb(vec3(mix(0.42, 0.62, uP0.x), 0.7, 1.0));
  float body = l * 0.75 + edge * 0.9;
  // Tarama: ince satırlar + yukarı akan geniş parlak bant
  float lines = 0.75 + 0.25 * sin(uv.y * uRes.y * 1.6);
  float sweep = smoothstep(0.1, 0.0, abs(fract(uv.y * 1.5 - t * 0.4) - 0.5) - 0.38);
  body *= mix(1.0, lines, uP0.y);
  body += sweep * 0.25 * uP0.y * (0.3 + l);
  float flick = 1.0 - uP0.z * (0.15 * hash11(floor(t * 24.0)) + 0.1 * step(0.95, hash11(floor(t * 10.0) + 7.0)));
  vec3 holo = tint * body * flick * 1.2;
  // Yarı saydam: arka plan (özgün görüntü) koyulaştırılmış şekilde görünür
  vec3 col = src * 0.15 + holo;
  col += tint * 0.05;
  return vec4(mix(src, col, uAmount), 1.0);
}
