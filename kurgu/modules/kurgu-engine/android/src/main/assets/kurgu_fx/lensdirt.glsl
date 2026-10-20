// Kirli objektif: objektif camındaki leke, toz ve parmak izi yalnızca parlak
// ışık kaynaklarının yakınında görünür olur. Parlak alanların geniş ışıması
// kir dokusuyla çarpılıp eklenir; ayrıca hafif genel parlama.
// P0: x=kir  y=eşik  z=ışıma
//
// İki geçiş: parlak alanlar yarım çözünürlükte ayıklanır; ana geçiş bunu
// geniş halkalarda örnekleyerek yumuşak ışık alanı üretir.
vec4 prepass(vec2 uv) {
  vec3 c = tex(uv).rgb;
  float l = max(c.r, max(c.g, c.b));
  float thr = mix(0.45, 0.9, uP0.y);
  return vec4(c * smoothstep(thr, thr + 0.15, l), 1.0);
}
float dirt(vec2 p) {
  // Lekeler: yumuşak büyük bulutlar + dairesel su lekeleri + ince çizikler
  float smear = smoothstep(0.45, 0.85, fbm(p * 2.2 + uSeed * 3.0));
  float spots = 0.0;
  vec2 g = p * 7.0;
  vec2 id = floor(g);
  vec2 f = fract(g) - 0.5;
  vec2 o = (hash22(id + uSeed * 9.0) - 0.5) * 0.6;
  float rr = mix(0.08, 0.3, hash12(id + 2.0));
  float dd = length(f - o);
  spots = step(0.55, hash12(id + 4.0)) * (smoothstep(rr, rr * 0.6, dd) * 0.5 + smoothstep(rr * 0.15, 0.0, abs(dd - rr * 0.85)) * 0.5);
  vec2 sp = rot2(p, 0.6) * vec2(40.0, 1.5);
  float streak = smoothstep(0.82, 0.95, vnoise(sp)) * 0.6;
  return clamp(smear * 0.7 + spots + streak, 0.0, 1.3);
}
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  float R = mix(0.08, 0.3, uP0.z);
  vec3 b = pre(uv).rgb * 0.2;
  for (int i = 0; i < 12; i++) {
    float a = float(i) * GOLDEN;
    float r = sqrt((float(i) + 0.5) / 12.0) * R;
    b += pre(uv + vec2(cos(a) / aspect(), sin(a)) * r).rgb * 0.0667;
  }
  vec2 p = uv * vec2(aspect(), 1.0);
  float d = dirt(p) * uP0.x;
  vec3 light = b * (0.35 + d * 2.2);
  return vec4(screen(src, clamp(light * uAmount, 0.0, 1.0)), 1.0);
}
