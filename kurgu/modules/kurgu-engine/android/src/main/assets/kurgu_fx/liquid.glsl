// Sıvı akış: görüntü yağlı bir sıvının yüzeyindeymiş gibi akar. İç içe
// bükülmüş (domain warp) gürültü alanı yumuşak, dolanan akıntılar üretir;
// akıntı çizgilerinde hafif renk ayrışması ve parlaklık oynaması olur.
// P0: x=güç  y=ölçek  z=hız
vec4 fx(vec2 uv) {
  vec2 p = uv * vec2(aspect(), 1.0) * mix(1.5, 5.0, uP0.y);
  float t = uTime * mix(0.1, 0.8, uP0.z);
  vec2 w1 = vec2(vnoise(p + vec2(0.0, t)), vnoise(p + vec2(5.2, -t * 0.8)));
  vec2 w2 = vec2(vnoise(p * 1.7 + w1 * 2.5 + vec2(1.7, 9.2) + t * 0.6), vnoise(p * 1.7 + w1 * 2.5 + vec2(8.3, 2.8) - t * 0.5));
  vec2 off = (w2 - 0.5) * mix(0.01, 0.08, uP0.x) * uAmount;
  float ca = length(w2 - 0.5) * 0.006 * uP0.x * uAmount;
  vec3 col;
  col.r = tex(uv + off * (1.0 + ca * 40.0)).r;
  col.g = tex(uv + off).g;
  col.b = tex(uv + off * (1.0 - ca * 40.0)).b;
  col *= 1.0 + (w2.x - 0.5) * 0.12 * uAmount;
  return vec4(col, 1.0);
}
