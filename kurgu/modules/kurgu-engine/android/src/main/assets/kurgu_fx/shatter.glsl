// Kırık cam: görüntü düzensiz cam parçalarına ayrılır; her parça kendi
// yönünde biraz kayar ve döner, parçalar zamanla yavaşça kıpırdar. Çatlak
// çizgileri parlak kenar ve koyu boşlukla, parçalar farklı yansımayla görünür.
// Parçalar merkezden dışa doğru daha çok yerinden oynar (darbe noktası).
// P0: x=parça boyutu  y=yer değiştirme  z=çatlaklar
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  float cells = mix(16.0, 4.0, uP0.x);
  vec2 p = centered(uv) * cells;
  // Darbe noktasından radyal parçalanma: açı yönünde uzatılmış hücreler
  vec2 ip = floor(p);
  vec2 fp = p - ip;
  float d1 = 9.0; float d2 = 9.0;
  vec2 bestId = vec2(0.0); vec2 bestC = vec2(0.0);
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = hash22(ip + g + uSeed * 5.0);
      vec2 r = g + o - fp;
      float d = dot(r, r);
      if (d < d1) { d2 = d1; d1 = d; bestId = ip + g; bestC = ip + g + o; }
      else if (d < d2) { d2 = d; }
    }
  }
  float edge = sqrt(d2) - sqrt(d1);
  vec2 h = hash22(bestId + 7.7) - 0.5;
  float distC = length(bestC / cells);
  float push = mix(0.4, 1.4, smoothstep(0.0, 0.6, distC));
  float disp = mix(0.0, 0.05, uP0.y) * uAmount * push;
  float wob = sin(uTime * 1.3 + hash12(bestId) * 20.0) * 0.25 + 0.75;
  vec2 c = bestC / cells;
  vec2 local = p / cells - c;
  float ang = h.x * 0.25 * disp * 8.0 * wob;
  vec2 q = c + rot2(local, ang) + (normalize(c + 1e-4) * 0.6 + h) * disp * wob;
  vec3 col = tex(uncentered(q)).rgb;
  // Parça başına yansıma farkı (cam yüzeyinin eğimi)
  col *= 1.0 + h.y * 0.25 * uP0.y * uAmount;
  col += max(h.x, 0.0) * 0.08 * uAmount;
  // Çatlak: koyu boşluk + parlak kırık kenarı
  float aa = cells / min(uRes.x, uRes.y);
  float crack = smoothstep(aa * 2.5, 0.0, edge) * uP0.z;
  float bright = smoothstep(aa * 6.0, aa * 1.5, edge) * uP0.z;
  col = mix(col, col * 0.15, crack * uAmount);
  col += bright * 0.25 * uAmount * (1.0 - crack);
  return vec4(mix(src, col, step(0.001, uAmount)), 1.0);
}
