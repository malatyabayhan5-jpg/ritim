// Sonsuz çerçeve (Droste etkisi): görüntü kendi içinde, ortada küçültülmüş bir
// kopya olarak sonsuza dek tekrar eder; her kopyanın çevresinde ince bir çerçeve.
// Sürekli içeri doğru yakınlaşan sonsuz bir tünel hissi verir.
// P0: x=iç ölçek  y=hız  z=çerçeve
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  float k = mix(0.35, 0.75, uP0.x);                    // her düzeyin bir öncekine oranı
  vec2 q = uv - 0.5;
  // Sürekli yakınlaşma: bir düzey boyunca ölçek k^(-faz)
  float ph = fract(uTime * mix(0.0, 0.35, uP0.y));
  q *= pow(k, ph);
  // Kutu uzaklığı (0..0.5): düzey numarası
  float m = max(abs(q.x), abs(q.y)) * 2.0;              // 0 merkez, 1 kenar
  float lvl = floor(log(max(m, 1e-4)) / log(k));         // m in (k^(n+1), k^n]
  lvl = max(lvl, 0.0);
  vec2 s = q / pow(k, lvl);
  vec2 suv = s + 0.5;
  vec3 col = tex(suv).rgb;
  // Çerçeve: her düzeyin dış kenarında
  float mm = max(abs(s.x), abs(s.y)) * 2.0;
  float fw = uP0.z * 0.035;
  float frame = smoothstep(1.0 - fw - 0.004, 1.0 - fw, mm) * step(0.001, uP0.z);
  vec3 frameC = vec3(0.95, 0.94, 0.9);
  col = mix(col, frameC, frame);
  // İç düzeylerde hafif gölge (derinlik)
  col *= 1.0 - 0.08 * min(lvl, 4.0) * uP0.z;
  return vec4(mix(src, col, uAmount), 1.0);
}
