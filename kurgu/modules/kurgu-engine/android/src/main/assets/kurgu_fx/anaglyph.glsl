// Kırmızı-camgöbeği 3B (anaglif): sol göz kırmızı, sağ göz camgöbeği
// kanalına yazılır. Derinlik tahmini parlaklıktan (açık = yakın) ya da
// kadraj merkezinden (merkez yakın) gelir; yakın yerler daha çok ayrışır.
// P0: x=ayrışma  y=derinlik kipi (0 parlaklık, 1 merkez)  z=özgün renk
float depthAt(vec2 uv) {
  float l = luma(tex(uv).rgb);
  vec2 p = centered(uv);
  float center = 1.0 - smoothstep(0.0, 0.7, length(p));
  return mix(l, center, uP0.y);
}
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  float sep = mix(0.002, 0.014, uP0.x) * uAmount;
  float d = depthAt(uv);
  float off = sep * (0.3 + d);
  vec3 L = tex(uv + vec2(off, 0.0)).rgb;
  vec3 R = tex(uv - vec2(off, 0.0)).rgb;
  // Renk koruyan anaglif: kırmızı kanal sol gözden, yeşil-mavi sağ gözden;
  // özgün renk azaltıldıkça gri tona çekilir (göz yorgunluğu azalır)
  vec3 Lc = mix(vec3(luma(L)), L, uP0.z);
  vec3 Rc = mix(vec3(luma(R)), R, uP0.z);
  vec3 col = vec3(Lc.r, Rc.g, Rc.b);
  return vec4(mix(src, col, step(0.001, uAmount)), 1.0);
}
