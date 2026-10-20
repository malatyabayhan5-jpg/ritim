// Hayalet yankı: görüntünün kaydırılmış, giderek sönen kopyaları üst üste
// bindirilir; kopyaların uzaklığı zamanla nefes alır, böylece hareketli bir
// çekimin bıraktığı iz gibi görünür. İsteğe bağlı olarak kopyalar gökkuşağı
// renklerine boyanır.
// P0: x=uzaklık  y=yön açısı  z=sönme  w=gökkuşağı
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  float ang = uP0.y * TAU;
  float breathe = 0.65 + 0.35 * sin(uTime * 2.2);
  vec2 dir = vec2(cos(ang) / aspect(), sin(ang)) * mix(0.008, 0.05, uP0.x) * breathe * uAmount;
  float decay = mix(0.85, 0.45, uP0.z);
  vec3 acc = src;
  float w = 1.0;
  float wsum = 1.0;
  for (int i = 1; i <= 5; i++) {
    float fi = float(i);
    w *= decay;
    vec3 c = tex(uv - dir * fi).rgb;
    vec3 tint = mix(vec3(1.0), hsv2rgb(vec3(fi / 6.0 + uTime * 0.1, 0.8, 1.0)) * 1.2, uP0.w);
    // Aydınlatarak birleştir: kopyalar koyu alanlara iz bırakır
    acc = max(acc, c * tint * w * 1.1);
    wsum += w;
  }
  vec3 col = mix(src, acc, 0.85);
  return vec4(mix(src, col, uAmount), 1.0);
}
