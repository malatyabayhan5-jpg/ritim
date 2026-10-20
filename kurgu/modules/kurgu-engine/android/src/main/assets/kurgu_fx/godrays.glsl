// Tanrı ışınları (hacimsel ışık): seçilen kaynaktan yayılan ışık hüzmeleri.
// Parlak alanlar kaynağa doğru ışınsal olarak toplanır; önündeki koyu nesneler
// (dağlar, binalar, saçlar) ışını keser ve gölge şeritleri oluşur. Hüzmeler
// hafifçe titreşir. Sıcak ya da nötr ışık.
// P0: x=kaynak yatay  y=kaynak dikey  z=uzunluk  w=eşik  P1.x=sıcaklık
//
// İki geçiş: parlak alan maskesi yarım çözünürlükte bir kez çıkarılır.
vec4 prepass(vec2 uv) {
  vec3 c = tex(uv).rgb;
  float l = max(c.r, max(c.g, c.b));
  float thr = mix(0.35, 0.85, uP0.w);
  float m = smoothstep(thr, thr + 0.2, l);
  // Kaynak çevresi her zaman biraz ışık verir (gökyüzü)
  vec2 d = (uv - uP0.xy) * vec2(aspect(), 1.0);
  m += exp(-dot(d, d) * 40.0) * 0.6;
  return vec4(c * m, 1.0);
}
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  vec2 lp = uP0.xy;
  vec2 dir = uv - lp;
  float len = mix(0.4, 0.95, uP0.z);
  float j = hash12(uv * uRes + fract(uTime) * 100.0);
  vec3 acc = vec3(0.0);
  float w = 1.0;
  float wsum = 0.0;
  for (int i = 0; i < 28; i++) {
    float t = (float(i) + j) / 28.0;
    acc += pre(uv - dir * t * len).rgb * w;
    wsum += w;
    w *= 0.94;
  }
  vec3 rays = acc / wsum;
  // Hafif titreşim: açıya bağlı yavaş değişen yoğunluk
  float ang = atan(dir.y * 1.0, dir.x * aspect());
  rays *= 0.8 + 0.4 * vnoise(vec2(ang * 6.0, uTime * 0.4));
  vec3 tint = mix(vec3(1.0, 0.98, 0.95), vec3(1.0, 0.8, 0.55), uP1.x);
  // Yalnızca yerel parlaklığı aşan ışık eklenir: zaten parlak yüzeyler yıkanmaz
  vec3 add = max(rays * 1.35 - src * 0.55, 0.0);
  vec3 col = screen(src, clamp(add * tint * uAmount, 0.0, 1.0));
  return vec4(col, 1.0);
}
