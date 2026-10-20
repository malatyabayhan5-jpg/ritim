// 2x2 ızgara: görüntü dört karede tekrarlanır. Kareler arasında koyu boşluk,
// köşeleri yuvarlatılmış; her kare kendi zamanlamasıyla hafifçe nefes alır
// (sırayla yakınlaşıp uzaklaşır), canlı bir kolaj görünümü verir.
// P0: x=boşluk  y=köşe yuvarlaklığı  z=sıralı hareket
const float N = 2.0;
float roundBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  vec2 cell = floor(uv * N);
  vec2 l = fract(uv * N);
  float gap = uP0.x * 0.06;
  // Kare içi konum (boşluk payı düşülmüş), aspect korunur
  vec2 inner = (l - 0.5) / (1.0 - gap) + 0.5;
  float k = cell.x + cell.y * N;
  float z = 1.0 + 0.06 * uP0.z * (0.5 + 0.5 * sin(uTime * 1.6 - k * 1.3));
  vec3 col = tex((inner - 0.5) / z + 0.5).rgb;
  vec2 pp = (l - 0.5) * vec2(aspect(), 1.0);
  vec2 hb = vec2(aspect(), 1.0) * 0.5 * (1.0 - gap);
  float r = uP0.y * 0.12 * min(hb.x, hb.y) * 2.0;
  float d = roundBox(pp, hb, r);
  float aa = N / min(uRes.x, uRes.y) * 1.5;
  float m = smoothstep(aa, -aa, d);
  col = mix(vec3(0.05, 0.05, 0.06), col, m);
  return vec4(mix(src, col, uAmount), 1.0);
}
