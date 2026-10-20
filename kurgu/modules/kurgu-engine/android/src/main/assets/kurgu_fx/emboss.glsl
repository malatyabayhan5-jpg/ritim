// Kabartma: görüntü parlaklığı bir yükseklik haritası sayılır; yönlü ışıkla
// aydınlatılarak taş, gümüş ya da altın bir rölyefe dönüşür. Malzemeye göre
// parlak yansıma eklenir; istenirse özgün renk kabartmanın üstüne bindirilir.
// P0: x=derinlik  y=ışık açısı  z=malzeme (0 taş, 0.5 gümüş, 1 altın)  w=özgün renk
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  float sc = max(min(uRes.x, uRes.y) / 1080.0, 0.5);
  vec2 d = px() * 2.6 * sc;
  float hl = luma(tex(uv - vec2(d.x, 0.0)).rgb);
  float hr = luma(tex(uv + vec2(d.x, 0.0)).rgb);
  float hd = luma(tex(uv - vec2(0.0, d.y)).rgb);
  float hu = luma(tex(uv + vec2(0.0, d.y)).rgb);
  float depth = mix(2.0, 9.0, uP0.x);
  vec3 n = normalize(vec3((hl - hr) * depth, (hd - hu) * depth, 1.0));
  float a = uP0.y * TAU;
  vec3 L = normalize(vec3(cos(a), sin(a), 0.9));
  float diff = clamp(dot(n, L), 0.0, 1.0);
  float spec = pow(clamp(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0, 1.0), 24.0);
  // Malzeme: taş (mat gri), gümüş, altın
  vec3 stone = vec3(0.62, 0.6, 0.57);
  vec3 silver = vec3(0.78, 0.8, 0.84);
  vec3 gold = vec3(0.95, 0.72, 0.32);
  float m = uP0.z;
  vec3 base = m < 0.5 ? mix(stone, silver, m * 2.0) : mix(silver, gold, m * 2.0 - 1.0);
  float shine = smoothstep(0.2, 0.6, m);
  // Taban: düzlem (n=z) diff≈0.67; kontrast için yeniden ölçeklenir
  float shade = 0.35 + (diff - 0.5) * 1.6;
  vec3 col = base * shade + spec * mix(0.15, 0.9, shine);
  // Metal görünümünde parlaklık hafifçe orijinal tona bağlı (derin bölgeler koyu)
  col *= mix(0.85, 1.1, luma(src));
  col = mix(col, col * src * 1.6 + spec * 0.4, uP0.w);
  return vec4(mix(src, col, uAmount), 1.0);
}
