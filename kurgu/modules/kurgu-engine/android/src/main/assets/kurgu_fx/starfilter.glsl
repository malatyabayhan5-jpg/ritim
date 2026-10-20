// Yıldız filtresi: objektif önüne takılan çizgili cam gibi, noktasal ışık
// kaynaklarından 4 ya da 6 kollu ince yıldız ışınları çıkar. Geniş parlak
// yüzeyler ışın üretmez. Kollar uca doğru söner, isteğe bağlı tayf rengi alır.
// P0: x=ışın uzunluğu  y=eşik  z=kol sayısı (0 dört, 1 altı)  w=gökkuşağı
//
// İki geçiş: noktasal ışık haritası (8 komşu okuması) yarım çözünürlükte bir
// kez hesaplanır; ışın toplama döngüsü bu haritadan okur.
vec4 prepass(vec2 uv) {
  vec3 c = tex(uv).rgb;
  float l = max(c.r, max(c.g, c.b));
  float sur = 0.0;
  // Çevre yarıçapı: güneş/ay diski gibi orta boy kaynakları da kapsar
  float rr = min(uRes.x, uRes.y) * 0.05;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * TAU / 8.0 + 0.39;
    vec3 s = tex(uv + vec2(cos(a), sin(a)) * px() * rr).rgb;
    sur += max(s.r, max(s.g, s.b));
  }
  sur /= 8.0;
  float thr = mix(0.55, 0.93, uP0.y);
  float k = smoothstep(thr, 1.0, l) * smoothstep(0.15, 0.45, l - sur);
  return vec4(c * k * k, 1.0);
}
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  float len = mix(0.04, 0.2, uP0.x);
  float six = step(0.5, uP0.z);
  float j = hash12(uv * uRes) * 0.5;
  vec3 acc = vec3(0.0);
  // Üç eksen (altı kol) ya da iki eksen (dört kol); her eksende iki yön
  for (int axis = 0; axis < 3; axis++) {
    if (axis == 2 && six < 0.5) break;           // dört kollu kipte üçüncü eksen yok
    float fa = float(axis);
    float on = 1.0;
    float ang = six > 0.5 ? fa * PI / 3.0 + 0.26 : fa * PI / 2.0 + 0.785;
    vec2 dir = vec2(cos(ang) / aspect(), sin(ang));
    for (int i = 1; i <= 8; i++) {
      float t = (float(i) - j) / 8.0;
      float w = exp(-t * 3.5) * on;
      vec3 a = pre(uv + dir * t * len).rgb + pre(uv - dir * t * len).rgb;
      vec3 tint = mix(vec3(1.0), clamp(abs(fract(t * 1.5 + vec3(0.0, 0.33, 0.67)) * 6.0 - 3.0) - 1.0, 0.0, 1.0) * 1.3, uP0.w);
      acc += a * w * tint;
    }
  }
  vec3 s = acc * 0.9;
  vec3 col = screen(src, clamp(s * uAmount, 0.0, 1.0));
  return vec4(col, 1.0);
}
