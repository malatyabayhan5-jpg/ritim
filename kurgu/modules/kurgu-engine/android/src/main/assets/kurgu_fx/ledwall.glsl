// LED ekran: görüntü siyah zemin üzerinde eşit aralıklı, yuvarlak LED
// noktalarına dönüşür. Nokta boyutu sabit, parlaklığı hücre rengidir; her
// LED hafif bir ışıma saçar ve LED'ler arasında küçük üretim farkları vardır.
// P0: x=nokta aralığı  y=ışıma  z=doygunluk
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  float cs = mix(5.0, 20.0, uP0.x) * max(min(uRes.x, uRes.y) / 720.0, 0.6);
  vec2 pix = uv * uRes;
  vec2 cell = floor(pix / cs);
  vec2 f = fract(pix / cs) - 0.5;
  vec3 c = tex((cell + 0.5) * cs / uRes).rgb;
  c = mix(vec3(luma(c)), c, mix(1.0, 1.6, uP0.z));
  c = clamp(c, 0.0, 1.0);
  // LED başına küçük parlaklık ve renk sapması
  c *= 0.92 + 0.12 * hash12(cell + 5.0);
  float d = length(f);
  float led = smoothstep(0.36, 0.28, d);
  float core = smoothstep(0.22, 0.0, d);
  float glow = exp(-d * d * 9.0) * uP0.y;
  // Yakın komşuların ışığı (ortalama renk) zemini hafif boyar
  vec3 col = c * (led * 0.9 + core * 0.35) * 1.15 + c * glow * 0.55;
  col += vec3(0.012, 0.012, 0.016);
  return vec4(mix(src, col, uAmount), 1.0);
}
