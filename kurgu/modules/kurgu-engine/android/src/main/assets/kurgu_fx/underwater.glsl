// Su altı: görüntü su kütlesinin içinden bakılıyormuş gibi dalgalanır;
// derinlikle artan mavi-yeşil renk ve kırmızı kaybı, su yüzeyinden düşen
// hareketli kostik ışık ağı, yukarıdan inen yumuşak ışık hüzmeleri ve
// süzülen küçük parçacıklar.
// P0: x=derinlik  y=kostik  z=dalgalanma  w=parçacıklar
float caustic(vec2 p, float t) {
  // Hareketli Voronoi hücrelerinin kenar ağı (F2 - F1 küçük olan yerler parlak),
  // hafifçe bükülmüş: su yüzeyinin odakladığı ışık ağı
  p += vec2(vnoise(p * 0.8 + t * 0.2), vnoise(p * 0.8 - t * 0.2 + 5.0)) * 0.8;
  vec2 ip = floor(p);
  vec2 fp = p - ip;
  float d1 = 9.0; float d2 = 9.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 h = hash22(ip + g);
      vec2 o = 0.5 + 0.4 * sin(t * (0.6 + h) + h * TAU);
      float d = length(g + o - fp);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
    }
  }
  return pow(1.0 - smoothstep(0.0, 0.25, d2 - d1), 3.0);
}
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  vec2 p = uv * vec2(aspect(), 1.0);
  float t = uTime;
  vec2 off = vec2(vnoise(p * 4.0 + t * 0.6) - 0.5, vnoise(p * 4.0 - t * 0.5 + 9.0) - 0.5) * 0.012 * uP0.z;
  vec3 c = tex(uv + off).rgb;
  // Derinlik: kırmızı emilir, mavi-yeşil sis
  float depth = mix(0.3, 1.0, uP0.x) * (0.6 + 0.4 * (1.0 - uv.y));
  c *= mix(vec3(1.0), vec3(0.35, 0.8, 0.95), depth);
  vec3 water = vec3(0.02, 0.22, 0.32);
  c = mix(c, water + c * 0.3, depth * 0.45);
  // Kostikler: üstte daha güçlü
  float ca = caustic(p * 5.0, t * 1.2) * uP0.y;
  c += vec3(0.6, 0.9, 1.0) * ca * 0.22 * (0.4 + 0.6 * uv.y);
  // Işık hüzmeleri
  float rays = vnoise(vec2((p.x + uv.y * 0.3) * 6.0, t * 0.15));
  c += vec3(0.4, 0.75, 0.85) * smoothstep(0.55, 0.9, rays) * smoothstep(0.2, 1.0, uv.y) * 0.12;
  // Parçacıklar
  vec2 g = p * 18.0 + vec2(sin(t * 0.3) * 0.5, t * 0.25);
  vec2 id = floor(g);
  vec2 f = fract(g) - 0.5 - (hash22(id) - 0.5) * 0.7;
  float part = step(0.85, hash12(id + 2.0)) * smoothstep(0.06, 0.0, length(f));
  c += vec3(0.7, 0.85, 0.9) * part * 0.35 * uP0.w;
  return vec4(mix(src, c, uAmount), 1.0);
}
