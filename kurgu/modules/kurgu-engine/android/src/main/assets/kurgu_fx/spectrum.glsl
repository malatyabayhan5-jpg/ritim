// Prizma ışığı: pencere önündeki bir kristalden duvara düşen gökkuşağı
// şeritleri. Birkaç yumuşak, eğik tayf şeridi yavaşça kayar ve nefes alır;
// renkler görüntünün açık bölgelerinde daha canlıdır (yansıyan yüzey).
// P0: x=konum  y=genişlik  z=hız
vec3 spec(float t) {
  t = clamp(t, 0.0, 1.0);
  vec3 c = clamp(vec3(1.5 - abs(t * 4.0 - 3.2), 1.5 - abs(t * 4.0 - 2.0), 1.5 - abs(t * 4.0 - 0.8)), 0.0, 1.0);
  return c * smoothstep(0.0, 0.15, t) * smoothstep(1.0, 0.85, t);
}
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  vec2 p = centered(uv);
  float t = uTime * mix(0.05, 0.4, uP0.z);
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float ang = 0.9 + fi * 0.22 + sin(t + fi) * 0.08;
    vec2 dir = vec2(cos(ang), sin(ang));
    float w = mix(0.08, 0.3, uP0.y) * (1.0 - fi * 0.25);
    float c0 = (uP0.x - 0.5) * aspect() + (fi - 1.0) * 0.45 + sin(t * 1.3 + fi * 2.0) * 0.1;
    float x = (dot(p, vec2(dir.y, -dir.x)) - c0) / w;
    // Şerit boyunca sönme (ışığın düştüğü alan)
    float along = dot(p, dir);
    float fade = exp(-along * along * 2.0) * (0.75 + 0.25 * sin(t * 2.0 + fi * 3.0));
    acc += spec(x * 0.5 + 0.5) * fade * (1.0 - fi * 0.25);
  }
  float l = luma(src);
  vec3 add = acc * (0.25 + 0.6 * l);
  vec3 col = screen(src, clamp(add * 0.8 * uAmount, 0.0, 1.0));
  return vec4(col, 1.0);
}
