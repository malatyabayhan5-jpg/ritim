// Vitray: görüntü düzensiz Voronoi camlarına bölünür. Her cam, merkezindeki
// rengi doygun ve arkadan aydınlatılmış gibi alır; cam içinde dökme camın
// dalgalı dokusu görülür. Camlar arasında kurşun çıtalar, kenarlarında ışık
// sızması vardır.
// P0: x=cam boyutu  y=kurşun kalınlığı  z=ışıma
//
// İki geçiş: cam rengi yumuşatılmış yarım çözünürlüklü kopyadan okunur.
vec4 prepass(vec2 uv) {
  vec2 d = px() * 3.0;
  return vec4((tex(uv).rgb * 2.0 + tex(uv + d).rgb + tex(uv - d).rgb + tex(uv + vec2(d.x, -d.y)).rgb + tex(uv - vec2(d.x, -d.y)).rgb) / 6.0, 1.0);
}
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  float cells = mix(28.0, 8.0, uP0.x);
  vec2 p = centered(uv) * cells;
  vec2 ip = floor(p);
  vec2 fp = p - ip;
  float d1 = 9.0;
  float d2 = 9.0;
  vec2 best = vec2(0.0);
  vec2 bestId = vec2(0.0);
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = 0.15 + 0.7 * hash22(ip + g + uSeed * 13.0);
      vec2 r = g + o - fp;
      float d = dot(r, r);
      if (d < d1) { d2 = d1; d1 = d; best = ip + g + o; bestId = ip + g; }
      else if (d < d2) { d2 = d; }
    }
  }
  // Kenara uzaklık yaklaşımı: sqrt(d2) - sqrt(d1)
  float edge = sqrt(d2) - sqrt(d1);
  vec3 glass = pre(uncentered(best / cells)).rgb;
  glass = mix(vec3(luma(glass)), glass, 1.6);
  glass = clamp(glass * 1.15 + 0.03, 0.0, 1.0);
  // Dökme cam dokusu ve cam başına ton farkı
  float tex2 = vnoise(p * 3.5 + bestId * 7.0) * 0.6 + vnoise(p * 9.0) * 0.4;
  glass *= 0.82 + 0.3 * tex2 + (hash12(bestId) - 0.5) * 0.12;
  // Arkadan ışık: cam ortası parlak, kenarlara doğru koyulaşır
  glass *= mix(1.0, 0.75 + 0.45 * smoothstep(0.0, 0.5, edge), uP0.z);
  float lead = mix(0.03, 0.12, uP0.y);
  float aa = cells / min(uRes.x, uRes.y) * 1.5;
  float leadM = 1.0 - smoothstep(lead, lead + aa, edge);
  vec3 leadC = vec3(0.06, 0.06, 0.07) + 0.08 * smoothstep(lead, 0.0, edge);
  // Kurşunun kenarında ışık sızması
  vec3 col = mix(glass, leadC, leadM);
  col += glass * 0.35 * uP0.z * smoothstep(lead + aa * 4.0, lead, edge) * (1.0 - leadM);
  return vec4(mix(src, col, uAmount), 1.0);
}
