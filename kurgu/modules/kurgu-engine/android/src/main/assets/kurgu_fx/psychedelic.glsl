// Psikedelik: renk tonu, parlaklık ve konumla birlikte akan bir gökkuşağına
// eşlenir; renkler sürekli döner, görüntü hafif sıvı dalgalanmasıyla bükülür.
// Parlaklık yapısı korunduğu için sahne okunur kalır.
// P0: x=hız  y=renk yayılımı  z=bükülme
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  vec2 p = centered(uv);
  float t = uTime * mix(0.1, 1.2, uP0.x);
  vec2 w = vec2(sin(p.y * 9.0 + t * 2.0), cos(p.x * 8.0 - t * 1.7)) * 0.012 * uP0.z;
  vec3 c = tex(uv + w * uAmount).rgb;
  float l = luma(c);
  float hue = l * mix(0.6, 2.5, uP0.y) + t * 0.3 + length(p) * 0.8 * uP0.y + sin(p.x * 4.0 + t) * 0.1;
  vec3 rainbow = hsv2rgb(vec3(fract(hue), 0.85, 1.0));
  // Parlaklık korunur: gökkuşağı rengi, kaynak parlaklığına ölçeklenir
  vec3 col = rainbow * (0.25 + l * 1.05);
  col = mix(col, c, 0.2);
  return vec4(mix(src, col, uAmount), 1.0);
}
