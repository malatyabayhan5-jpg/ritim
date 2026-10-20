// Sarkaç: görüntü üst kenar ortasından (ya da merkezden) asılıymış gibi
// sağa sola salınır. Salınım uçlarda yavaşlar, ortadan hızla geçer; açılan
// köşeler hafif büyütme ve kenar yansıtmasıyla doldurulur.
// P0: x=açı  y=hız  z=dönme noktası (0 üst kenar, 1 merkez)
vec2 mirrorUv(vec2 u) { return 1.0 - abs(1.0 - mod(u, 2.0)); }
vec4 fx(vec2 uv) {
  float maxA = mix(0.03, 0.22, uP0.x) * uAmount;
  float a = sin(uTime * mix(1.0, 5.0, uP0.y)) * maxA;
  vec2 pivotUv = vec2(0.5, mix(1.0, 0.5, uP0.z));
  vec2 p = (uv - pivotUv) * vec2(aspect(), 1.0);
  vec2 q = rot2(p, a);
  float cover = 1.0 + abs(a) * 0.6;
  q /= cover;
  vec2 quv = q / vec2(aspect(), 1.0) + pivotUv;
  return vec4(tex(mirrorUv(quv)).rgb, 1.0);
}
