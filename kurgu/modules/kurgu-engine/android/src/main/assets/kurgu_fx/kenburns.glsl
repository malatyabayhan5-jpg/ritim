// Ken Burns hareketi: durağan çekime efekt süresi boyunca yavaş, yumuşak bir
// yaklaşma (ya da uzaklaşma) ve seçilen yönde kaydırma. Süre bilinmiyorsa
// 8 saniyelik ileri-geri döngü kullanılır. Kenarlar her zaman doludur.
// P0: x=yakınlaştırma miktarı  y=kaydırma yönü  z=uzaklaşma (0 yaklaş, 1 uzaklaş)
vec4 fx(vec2 uv) {
  float prog = uDur > 0.0 ? clamp(uTime / uDur, 0.0, 1.0) : 0.5 - 0.5 * cos(uTime * TAU / 8.0);
  float e = easeInOut(prog);
  if (uP0.z > 0.5) e = 1.0 - e;
  float zmax = mix(1.06, 1.35, uP0.x);
  float z = mix(1.0, zmax, e * uAmount);
  // Kaydırma: yakınlaşmanın açtığı pay kadar seçilen yöne
  float ang = uP0.y * TAU;
  vec2 room = (1.0 - 1.0 / z) * 0.5 * vec2(1.0, 1.0);
  vec2 pan = vec2(cos(ang), sin(ang)) * room * e;
  vec2 q = (uv - 0.5) / z + 0.5 + pan;
  return vec4(tex(q).rgb, 1.0);
}
