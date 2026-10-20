// Oluklu cam: önüne dikey (ya da eğik) yivli cam konmuş gibi. Her yiv bir
// silindir mercek; görüntüyü yiv içinde sıkıştırıp kaydırarak tekrarlar.
// Yiv kenarlarında ince parlak ve koyu çizgiler, yiv içinde hafif bulanıklık.
// P0: x=yiv genişliği  y=kırılma  z=açı  w=parlaklık
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  vec2 p = centered(uv);
  float ang = uP0.z * 0.785;
  vec2 q = rot2(p, -ang);
  float w = mix(0.015, 0.08, uP0.x);
  float xi = q.x / w;
  float f = fract(xi) - 0.5;                        // yiv içi -0.5..0.5
  // Silindirik kırılma: yiv içindeki konuma göre kayma (merceğin eğimi)
  float bend = sin(f * PI) * 0.5;
  float k = mix(0.3, 2.2, uP0.y) * uAmount;
  vec2 off = vec2(-bend * w * k, 0.0);
  vec2 qs = q + off;
  vec2 dirB = rot2(vec2(w * 0.12, 0.0), ang) * k;
  vec2 base = uncentered(rot2(qs, ang));
  vec3 col = tex(base).rgb * 0.5 + (tex(base + vec2(dirB.x / aspect(), dirB.y)).rgb + tex(base - vec2(dirB.x / aspect(), dirB.y)).rgb) * 0.25;
  // Yiv kenarı: koyu çizgi ve yanında parlak kenar yansıması
  float aa = 1.5 / (w * min(uRes.x, uRes.y));
  float edge = smoothstep(0.5 - aa * 2.0, 0.5, abs(f));
  float hl = smoothstep(0.25, 0.42, f) * smoothstep(0.49, 0.42, f);
  col *= 1.0 - edge * 0.35 * uAmount;
  col += hl * 0.12 * uP0.w * uAmount;
  col *= 1.0 + (cos(f * PI) - 0.7) * 0.12 * uP0.w * uAmount;
  return vec4(mix(src, col, step(0.001, uAmount)), 1.0);
}
