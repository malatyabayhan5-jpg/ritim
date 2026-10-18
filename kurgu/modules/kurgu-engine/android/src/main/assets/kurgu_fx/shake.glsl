// Kamera sarsıntısı: iki ölçekli yumuşak gürültüyle öteleme ve dönme, hareket
// yönüne uygun bulanıklık. Kenarda siyah boşluk kalmaması için hafif yakınlaştırır.
// P0: x=şiddet  y=frekans  z=dönme  w=hareket bulanıklığı
vec2 shakeAt(float t, float f) {
  return vec2(snoise1(t * f + uSeed * 31.0), snoise1(t * f * 1.13 + 57.0 + uSeed * 17.0))
       + 0.35 * vec2(snoise1(t * f * 2.7 + 5.0), snoise1(t * f * 2.9 + 9.0));
}
vec4 fx(vec2 uv) {
  float amp = mix(0.004, 0.035, uP0.x) * uAmount;
  float f = mix(3.0, 14.0, uP0.y);
  vec2 o = shakeAt(uTime, f) * amp;
  vec2 vel = o - shakeAt(uTime - 1.0 / 30.0, f) * amp;
  float ang = snoise1(uTime * f * 0.8 + 91.0) * 0.03 * uP0.z * uAmount;
  float zoom = 1.0 + amp * 3.0 + abs(ang) * 0.7;
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 9; i++) {
    float s = (float(i) / 8.0 - 0.5) * uP0.w * 1.5;
    vec2 p = rot2(centered(uv), ang) / zoom;
    acc += tex(uncentered(p) + o + vel * s).rgb;
  }
  return vec4(acc / 9.0, 1.0);
}
