// Piksel sıralama: parlaklığı eşiğin üstündeki pikseller seçilen yönde
// akıtılıp uzatılır; parlak bölgeler eriyip damlıyormuş gibi çizgilere
// dönüşür. Her sütunun akış uzunluğu farklıdır ve zamanla yavaşça değişir.
// (Gerçek sıralama yerine tek geçişte yaklaşım: akış yönünün tersinde
// eşiği geçen en parlak örnek, uzaklıkla sönerek taşınır.)
// P0: x=eşik  y=uzunluk  z=yön (0 aşağı, 0.33 yukarı, 0.66 sağa, 1 sola)
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  vec2 dir = uP0.z < 0.25 ? vec2(0.0, 1.0) : uP0.z < 0.5 ? vec2(0.0, -1.0) : uP0.z < 0.75 ? vec2(-1.0, 0.0) : vec2(1.0, 0.0);
  float thr = mix(0.35, 0.85, uP0.x);
  // Sütun (ya da satır) başına akış uzunluğu
  float lane = dir.x == 0.0 ? floor(uv.x * uRes.x / 2.0) : floor(uv.y * uRes.y / 2.0);
  float len = mix(0.05, 0.4, uP0.y) * (0.3 + 0.7 * hash11(lane * 0.73)) * (0.75 + 0.25 * sin(uTime * 0.8 + hash11(lane) * 6.0));
  vec3 best = src;
  float bestL = luma(src) > thr ? luma(src) : -1.0;
  for (int i = 1; i <= 16; i++) {
    float t = float(i) / 16.0;
    vec3 c = tex(uv + dir * t * len * vec2(1.0, 1.0)).rgb;
    float l = luma(c);
    // Sönme: uzaktaki örnek daha az etkili
    float lw = l * (1.0 - t * 0.6);
    if (l > thr && lw > bestL) { bestL = lw; best = mix(c, src, t * 0.5); }
  }
  vec3 col = bestL > 0.0 ? best : src;
  // Akışın içinde hafif çizgi dokusu
  col *= 0.94 + 0.06 * hash11(lane * 1.9);
  return vec4(mix(src, col, uAmount), 1.0);
}
