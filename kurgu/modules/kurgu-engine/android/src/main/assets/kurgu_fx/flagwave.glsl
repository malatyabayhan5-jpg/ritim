// Bayrak dalgası: görüntü rüzgârda dalgalanan kumaş gibi; yatayda ilerleyen,
// sola doğru (direğe yakın) sönen dalgalar. Dalga eğimine göre kıvrımlar
// ışık alır ve gölgelenir.
// P0: x=güç  y=sıklık  z=hız  w=kıvrım gölgesi
float wave(vec2 p, float t, float f) {
  return sin(p.x * f - t + p.y * 1.3) * 0.6 + sin(p.x * f * 1.9 - t * 1.6 + p.y * 2.6 + 1.3) * 0.3 + sin(p.x * f * 0.6 - t * 0.7 - p.y * 0.8) * 0.4;
}
vec4 fx(vec2 uv) {
  vec2 p = centered(uv);
  float f = mix(5.0, 16.0, uP0.y);
  float t = uTime * mix(1.0, 6.0, uP0.z);
  float amp = mix(0.006, 0.04, uP0.x) * uAmount;
  float pole = smoothstep(-0.5 * aspect(), -0.5 * aspect() + 0.6, p.x);
  float w = wave(p, t, f);
  float e = 0.004;
  float slope = (wave(p + vec2(e, 0.0), t, f) - w) / e;
  vec2 q = p + vec2(0.3, 1.0) * w * amp * pole;
  vec3 col = tex(uncentered(q)).rgb;
  float shade = clamp(slope * amp * 2.2, -0.22, 0.22) * pole;
  col *= 1.0 + shade * mix(0.0, 1.2, uP0.w);
  col += max(shade, 0.0) * 0.25 * uP0.w;
  return vec4(col, 1.0);
}
