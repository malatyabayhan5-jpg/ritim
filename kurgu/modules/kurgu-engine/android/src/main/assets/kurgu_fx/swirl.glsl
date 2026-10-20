// Girdap: görüntü merkez çevresinde burulur; burulma merkezde en güçlü,
// yarıçapın dışında sıfırdır (yumuşak geçiş). Hız verilirse girdap yavaşça
// ileri geri salınır. Burulan bölge kenarda hafif kararır (derinlik hissi).
// P0: x=güç  y=yarıçap  z=salınım hızı
vec4 fx(vec2 uv) {
  vec2 p = centered(uv);
  float R = mix(0.25, 0.9, uP0.y);
  float r = length(p);
  float k = clamp(1.0 - r / R, 0.0, 1.0);
  k = k * k * (3.0 - 2.0 * k);
  float osc = mix(1.0, sin(uTime * mix(0.5, 3.0, uP0.z)), step(0.01, uP0.z));
  float ang = k * mix(1.0, 7.0, uP0.x) * osc * uAmount;
  vec2 q = rot2(p, ang);
  vec3 col = tex(uncentered(q)).rgb;
  col *= 1.0 - 0.15 * k * abs(osc) * uAmount * uP0.x;
  return vec4(col, 1.0);
}
