// Su dalgası: merkezden yayılan, uzaklaştıkça sönen halkalar; kırılmayla kayan
// görüntü ve dalga tepelerinde hafif ışık parlaması.
// P0: x=dalga boyu  y=hız  z=güç  w=merkezin dikey konumu
vec4 fx(vec2 uv) {
  vec2 c = vec2(0.5, mix(0.3, 0.7, uP0.w));
  vec2 p = centered(uv) - centered(c);
  float d = length(p);
  float k = mix(18.0, 60.0, uP0.x);
  float ph = d * k - uTime * mix(2.0, 9.0, uP0.y);
  float damp = exp(-d * 3.0);
  float h = sin(ph) * damp;
  float slope = cos(ph) * damp;
  vec2 dir = d > 1e-4 ? p / d : vec2(0.0);
  float s = mix(0.004, 0.028, uP0.z) * uAmount;
  vec3 col = tex(uv + dir * h * s * vec2(1.0 / aspect(), 1.0)).rgb;
  col += vec3(0.12) * max(0.0, slope) * uAmount * uP0.z;
  return vec4(col, 1.0);
}
