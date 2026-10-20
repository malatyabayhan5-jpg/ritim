// Film yanığı: projektörde takılıp eriyen film. Gürültü alanında delikler
// açılır ve büyür; deliğin içi beyaz-turuncu yanma ışığı, kenarında kavrulmuş
// koyu bir halka ve parlayan kor çizgisi vardır. Yanık kenarı titreşir.
// İlerleme açıkken yanık efekt süresince büyür (bitiş geçişi için).
// P0: x=yanık boyutu  y=kor ışıması  z=ilerleme (0 sabit, 1 süre boyunca büyür)
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  vec2 p = uv * vec2(aspect(), 1.0);
  float prog = uDur > 0.0 ? clamp(uTime / uDur, 0.0, 1.0) : 0.5;
  float grow = mix(0.5, prog, uP0.z);
  // Yanma alanı: büyük ölçekli gürültü + kenarlardan içeri doğru eğilim
  vec2 e = min(uv, 1.0 - uv);
  float edgeBias = 1.0 - smoothstep(0.0, 0.5, min(e.x, e.y) * 2.0);
  float n = fbm(p * 2.2 + vec2(uSeed * 10.0, uTime * 0.05)) * 0.75 + edgeBias * 0.35;
  n += (vnoise(p * 25.0 + uTime * 3.0) - 0.5) * 0.02;    // titreşen kenar
  float level = mix(1.05, 0.45, grow * mix(0.6, 1.2, uP0.x));
  float burn = smoothstep(level - 0.01, level + 0.01, n);
  float rim = smoothstep(level - 0.09, level, n) * (1.0 - burn);
  float ember = smoothstep(level - 0.02, level, n) * (1.0 - burn);
  // Kavrulmuş halka, kor çizgisi, yanmış delikte sıcak ışık
  vec3 col = mix(src, src * vec3(0.45, 0.25, 0.12), rim * 0.85);
  vec3 glowC = vec3(1.0, 0.55, 0.12);
  col += glowC * ember * mix(0.4, 1.4, uP0.y);
  vec3 hole = mix(vec3(1.0, 0.95, 0.85), vec3(1.0, 0.6, 0.2), smoothstep(level + 0.12, level, n));
  col = mix(col, hole, burn);
  // Delik çevresinde turuncu ışık sızması
  col += glowC * smoothstep(level - 0.25, level, n) * (1.0 - burn) * 0.25 * uP0.y;
  return vec4(mix(src, col, uAmount), 1.0);
}
