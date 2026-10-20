// Renk dalgası: kırmızı, yeşil ve mavi kanallar farklı faz ve sıklıkta
// akan sinüs dalgalarıyla ayrı ayrı bükülür; renk kanatları sıvı gibi
// birbirinden ayrılıp birleşir.
// P0: x=güç  y=sıklık  z=hız
vec2 wave(vec2 uv, float ph, float f, float t, float a) {
  return vec2(sin(uv.y * f + t + ph) * a, sin(uv.x * f * 0.7 - t * 0.8 + ph * 1.7) * a * 0.5);
}
vec4 fx(vec2 uv) {
  float f = mix(6.0, 40.0, uP0.y);
  float t = uTime * mix(0.5, 5.0, uP0.z);
  float a = mix(0.002, 0.02, uP0.x) * uAmount;
  vec3 col;
  col.r = tex(uv + wave(uv, 0.0, f, t, a)).r;
  col.g = tex(uv + wave(uv, 2.1, f * 1.1, t * 1.1, a * 0.6)).g;
  col.b = tex(uv + wave(uv, 4.2, f * 0.9, t * 0.9, a)).b;
  return vec4(col, 1.0);
}
