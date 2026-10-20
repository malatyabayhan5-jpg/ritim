// Gravür (banknot çizgi tramı): ton, paralel ve hafifçe kıvrılan çizgilerin
// kalınlığıyla verilir; çizgiler koyu bölgelerde kalınlaşır, açık bölgelerde
// incelir. Tonla birlikte çizgi de bükülür (kabartma hissi). En koyu tonlara
// ikinci, eğik bir çizgi katmanı eklenir. Mürekkep siyah, kahve ya da yeşil.
// P0: x=çizgi sıklığı  y=kıvrım  z=mürekkep rengi  w=kontrast
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  float sc = max(min(uRes.x, uRes.y) / 1080.0, 0.6);
  float spacing = mix(11.0, 5.0, uP0.x) * sc;
  vec2 p = uv * uRes / spacing;
  float l = luma(src);
  float k = mix(0.8, 1.6, uP0.w);
  l = clamp((l - 0.5) * k + 0.5, 0.0, 1.0);
  float wav = uP0.y;
  float y = p.y + wav * (sin(p.x * 0.07 + p.y * 0.02) * 1.6 + (vnoise(p * 0.025) - 0.5) * 3.0) + l * 1.2 * wav;
  float f = abs(fract(y) - 0.5) * 2.0;           // 0 = çizgi ortası, 1 = iki çizgi arası
  float w = mix(0.06, 0.92, pow(1.0 - l, 1.1));
  float aa = 1.6 / spacing;
  float ink = smoothstep(w + aa, w - aa, f);
  // İkinci katman: en koyu tonlar
  float y2 = dot(p, vec2(0.6, -0.8)) + wav * sin(p.y * 0.05) * 1.2;
  float f2 = abs(fract(y2) - 0.5) * 2.0;
  float w2 = mix(0.0, 0.6, smoothstep(0.35, 0.05, l));
  ink = max(ink, smoothstep(w2 + aa, w2 - aa, f2) * step(0.01, w2));
  vec3 paper = vec3(0.96, 0.94, 0.87);
  vec3 inkC = uP0.z < 0.34 ? vec3(0.06, 0.06, 0.08) : uP0.z < 0.67 ? vec3(0.3, 0.17, 0.09) : vec3(0.06, 0.26, 0.18);
  vec3 col = mix(paper, inkC, ink);
  return vec4(mix(src, col, uAmount), 1.0);
}
