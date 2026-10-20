// Kara tahta tebeşir: kenarlar tebeşir çizgisine dönüşür; tebeşirin tahta
// yüzeyinde kırılan, pürüzlü dokusu vardır. Açık tonlar seyrek eğik tebeşir
// taramasıyla doldurulur. Tahtada silgi lekeleri; isteğe bağlı renkli tebeşir.
// P0: x=çizgi kalınlığı  y=tarama  z=tahta rengi (0 yeşil, 1 kara)  w=renkli tebeşir
//
// İki geçiş: yumuşatılmış parlaklık yarım çözünürlükte hazırlanır.
vec4 prepass(vec2 uv) {
  vec2 d = px() * 1.5;
  float l = (luma(tex(uv).rgb) * 2.0 + luma(tex(uv + d).rgb) + luma(tex(uv - d).rgb) + luma(tex(uv + vec2(d.x, -d.y)).rgb) + luma(tex(uv - vec2(d.x, -d.y)).rgb)) / 6.0;
  return vec4(vec3(l), 1.0);
}
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  float sc = max(min(uRes.x, uRes.y) / 1080.0, 0.5);
  vec2 d = px() * mix(1.5, 4.0, uP0.x) * sc * 1.5;
  float tl = pre(uv + vec2(-d.x, d.y)).r; float tc = pre(uv + vec2(0.0, d.y)).r; float tr = pre(uv + d).r;
  float ml = pre(uv - vec2(d.x, 0.0)).r; float mr = pre(uv + vec2(d.x, 0.0)).r;
  float bl = pre(uv - d).r; float bc = pre(uv - vec2(0.0, d.y)).r; float br = pre(uv + vec2(d.x, -d.y)).r;
  float gx = (tr + 2.0 * mr + br) - (tl + 2.0 * ml + bl);
  float gy = (tl + 2.0 * tc + tr) - (bl + 2.0 * bc + br);
  float edge = smoothstep(0.12, 0.5, length(vec2(gx, gy)));
  // Tebeşir dokusu: tahtanın pürüzü tebeşiri yer yer tutmaz
  vec2 pp = uv * uRes / sc;
  float grit = hash12(floor(pp)) * 0.45 + vnoise(pp * 0.18) * 0.55;
  float line = edge * smoothstep(0.2, 0.55, grit + edge * 0.25);
  // Açık tonlar için seyrek tebeşir taraması
  float l = pre(uv).r;
  vec2 hp = rot2(pp, 0.9);
  float strokes = smoothstep(0.62, 0.8, vnoise(hp * vec2(0.08, 0.6)));
  float fill = strokes * smoothstep(0.3, 0.85, l) * uP0.y * smoothstep(0.15, 0.6, grit);
  float chalk = clamp(line * 0.95 + fill * 0.55 + smoothstep(0.55, 1.0, l) * 0.12 * uP0.y, 0.0, 1.0);
  // Tahta: renk, silgi lekeleri, toz
  vec3 board = mix(vec3(0.12, 0.2, 0.16), vec3(0.09, 0.09, 0.1), uP0.z);
  vec2 bp = uv * vec2(aspect(), 1.0);
  board += (fbm(bp * vec2(1.5, 5.0) + 3.0) - 0.45) * 0.07;
  board += vnoise(pp * 0.5) * 0.02;
  vec3 chalkC = vec3(0.93, 0.93, 0.9);
  vec3 colored = clamp(src / max(max(src.r, max(src.g, src.b)), 0.1), 0.0, 1.0) * 0.85 + 0.15;
  chalkC = mix(chalkC, colored, uP0.w);
  vec3 col = mix(board, chalkC, chalk);
  return vec4(mix(src, col, uAmount), 1.0);
}
