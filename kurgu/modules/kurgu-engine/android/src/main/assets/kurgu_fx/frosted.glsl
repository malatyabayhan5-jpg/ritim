// Buzlu cam: görüntü pürüzlü camın arkasında; her nokta çevresinden rastgele
// saçılan örneklerle yumuşar, camın buzlanma dokusu ışığı hafifçe açar.
// İsteğe bağlı olarak ortada elle silinmiş gibi net bir pencere kalır.
// P0: x=buzlanma  y=net merkez  z=parlaklık
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  vec2 p = centered(uv);
  // Silinmiş pencere: düzensiz kenarlı elips
  float wipe = 0.0;
  if (uP0.y > 0.01) {
    float r = length(p * vec2(0.8, 1.0)) + (fbm(p * 6.0) - 0.5) * 0.08;
    wipe = smoothstep(0.32 * uP0.y + 0.04, 0.32 * uP0.y - 0.02, r);
  }
  float rad = mix(0.004, 0.025, uP0.x) * (1.0 - wipe);
  vec3 acc = vec3(0.0);
  vec2 cell = floor(uv * uRes);
  for (int i = 0; i < 6; i++) {
    vec2 h = hash22(cell + float(i) * 17.3) - 0.5;
    acc += tex(uv + h * vec2(rad / aspect(), rad) * 2.0).rgb;
  }
  vec3 col = acc / 6.0;
  // Buz dokusu: kristal desenli hafif aydınlanma
  float frost = fbm(p * 30.0) * 0.6 + vnoise(p * 140.0) * 0.4;
  col = mix(col, vec3(1.0), (0.04 + frost * 0.1) * mix(0.3, 1.0, uP0.z) * (1.0 - wipe));
  col *= mix(0.95, 1.08, uP0.z);
  col = mix(col, src, wipe);
  // Pencere kenarında yoğunlaşmış su damlacıkları (ince parlak halka)
  return vec4(mix(src, col, uAmount), 1.0);
}
