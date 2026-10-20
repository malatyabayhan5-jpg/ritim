// Disko ışıkları: tavandan inen renkli spot hüzmeleri sahneyi süpürür; zemin
// biraz karartılır, hüzmelerin düştüğü yerlerde renkli ışık lekeleri dolaşır
// ve disko topundan saçılan küçük ışık benekleri döner.
// P0: x=hız  y=yoğunluk  z=karartma
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  vec2 p = centered(uv);
  float t = uTime * mix(0.3, 2.0, uP0.x);
  vec3 light = vec3(0.0);
  // Hüzmeler: tavandaki kaynaktan açısal olarak dar ışık konileri
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    vec2 src0 = vec2((fi - 1.5) * 0.35 * aspect() * 0.6, 0.62);
    float ang = -1.5708 + sin(t * (0.6 + fi * 0.17) + fi * 1.9) * 0.7;
    vec2 d = p - src0;
    float a = atan(d.y, d.x);
    float da = abs(mod(a - ang + PI, TAU) - PI);
    float beam = smoothstep(0.12, 0.04, da) * smoothstep(1.6, 0.0, length(d));
    vec3 c = hsv2rgb(vec3(fract(fi * 0.27 + t * 0.05), 0.85, 1.0));
    light += c * beam * 0.5;
  }
  // Disko topu benekleri: dönen küçük ışık noktaları
  vec2 q = vec2(atan(p.y - 0.62, p.x) * 3.0 + t * 0.6, length(p - vec2(0.0, 0.62)) * 14.0);
  vec2 id = floor(q * vec2(4.0, 1.0));
  vec2 f = fract(q * vec2(4.0, 1.0)) - 0.5;
  float on = step(1.0 - mix(0.1, 0.45, uP0.y), hash12(id));
  float dotL = smoothstep(0.22, 0.05, length(f)) * on;
  light += hsv2rgb(vec3(hash12(id + 3.0), 0.5, 1.0)) * dotL * 0.55;
  float dark = mix(1.0, 0.35, uP0.z);
  vec3 col = src * dark + src * light * 1.3 + light * 0.18;
  return vec4(mix(src, col, uAmount), 1.0);
}
