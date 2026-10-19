// Yönlü hareket bulanıklığı: seçilen açıda, parlak alanların izini koruyan
// yumuşak bulanıklık; isteğe bağlı hızlanıp yavaşlayan "whip" vuruşu.
// P0: x=uzunluk  y=açı  z=whip (ritim)  w=parlak iz
//
// İki geçiş: parlak iz ağırlığı (pow) yarım çözünürlükte bir kez hesaplanır;
// iz örneklemesi bu dokudan okur.
vec4 prepass(vec2 uv) {
  vec3 s = tex(uv).rgb;
  return vec4(s, pow(luma(s), 3.0));
}
vec4 fx(vec2 uv) {
  float ang = uP0.y * PI;
  vec2 dir = vec2(cos(ang), sin(ang)) * vec2(1.0 / aspect(), 1.0);
  float whip = mix(1.0, pow(0.5 + 0.5 * sin(uTime * TAU * 1.5), 3.0), uP0.z);
  float len = mix(0.005, 0.08, uP0.x) * uAmount * whip;
  vec3 src = tex(uv).rgb;
  vec3 acc = vec3(0.0);
  float wsum = 0.0;
  float j = hash12(uv * uRes);
  for (int i = 0; i < 24; i++) {
    float t = (float(i) + j) / 24.0 - 0.5;
    vec4 s = pre(uv + dir * t * len);
    float w = 1.0 + s.a * 4.0 * uP0.w;
    acc += s.rgb * w;
    wsum += w;
  }
  // Çok kısa izde yarım çözünürlüklü doku yerine keskin kaynağa yumuşak geçiş
  float lenPx = len * uRes.y;
  return vec4(mix(src, acc / wsum, smoothstep(0.5, 3.0, lenPx)), 1.0);
}
