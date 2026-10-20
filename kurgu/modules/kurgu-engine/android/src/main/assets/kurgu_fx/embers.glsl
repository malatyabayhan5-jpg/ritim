// Kıvılcımlar: aşağıdan yükselen, türbülansla savrulan kor parçacıkları.
// Her kıvılcım hareket yönünde uzamış, sıcaklığı sarıdan kırmızıya söner ve
// titreşir; alt kenarda sıcak bir ışıma vardır.
// P0: x=yoğunluk  y=hız  z=alt ışıma  w=boyut
vec3 sparks(vec2 uv, float scale, float t, float dens, float size, float lid) {
  vec2 p = uv * vec2(aspect(), 1.0) * scale;
  // Türbülans: yükselen sütunlar yatayda dalgalanır
  p.x += (vnoise(vec2(p.y * 0.5 - t * 0.6, lid)) - 0.5) * 1.2;
  p.y -= t;
  vec2 id = floor(p);
  vec2 f = fract(p) - 0.5;
  vec2 h = hash22(id + lid * 19.0);
  if (h.x > dens) return vec3(0.0);
  vec2 c = (hash22(id + 4.0) - 0.5) * 0.6;
  vec2 d = f - c;
  // Yukarı doğru uzama
  d.y *= 0.35;
  float r = 0.06 * size;
  float m = exp(-dot(d, d) / (r * r));
  float heat = hash12(id + 8.0);
  float flick = 0.6 + 0.4 * sin(t * 12.0 + h.y * 50.0);
  vec3 col = mix(vec3(1.0, 0.25, 0.05), vec3(1.0, 0.85, 0.4), heat);
  // Yükseldikçe söner
  float life = smoothstep(1.0, 0.2, uv.y);
  return col * m * flick * life * 2.2;
}
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  float t = uTime * mix(0.4, 1.8, uP0.y) + uSeed * 10.0;
  float dens = mix(0.12, 0.5, uP0.x);
  float size = mix(0.6, 1.8, uP0.w);
  vec3 s = sparks(uv, 7.0, t * 1.2, dens, size, 1.0) + sparks(uv + 0.3, 13.0, t * 1.6, dens, size * 0.8, 2.0) * 0.8;
  vec3 heatGlow = vec3(1.0, 0.35, 0.08) * smoothstep(0.45, 0.0, uv.y) * (0.75 + 0.25 * vnoise(vec2(uv.x * 6.0, uTime * 1.5))) * 0.5 * uP0.z;
  vec3 col = screen(src, clamp((s + heatGlow) * uAmount, 0.0, 1.0));
  return vec4(col, 1.0);
}
