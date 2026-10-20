// Büyüteç: kadrajda yavaşça dolaşan yuvarlak bir mercek altındaki bölgeyi
// büyütür. Merceğin kenarı bükülür (küresel mercek), cam kenarında ince
// parlak çerçeve, sol üstte yansıma ve merceğin altında yumuşak gölge vardır.
// P0: x=boyut  y=büyütme  z=hız
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  vec2 p = centered(uv);
  float t = uTime * mix(0.1, 0.8, uP0.z) + uSeed * 10.0;
  // Lissajous yolu: kadraj içinde kalır
  vec2 halfSz = vec2(aspect(), 1.0) * 0.5;
  vec2 c = vec2(sin(t * 1.0), sin(t * 1.37 + 1.0)) * (halfSz - 0.22) * 0.8;
  float R = mix(0.12, 0.3, uP0.x);
  vec2 d = p - c;
  float r = length(d) / R;
  float zoom = mix(1.4, 3.0, uP0.y);
  // Küresel mercek: kenara doğru büyütme azalır, kenarda bükülür
  float m = sqrt(max(1.0 - r * r, 0.0));
  vec2 q = c + d / zoom * mix(1.0, 0.55 + 0.45 * m, 0.7) / max(mix(1.0, m, 0.25), 0.2);
  vec3 lensC = tex(uncentered(q)).rgb;
  lensC *= 0.9 + 0.1 * m;
  float inside = smoothstep(1.0, 0.985, r);
  // Gölge (sağ alt), çerçeve, yansıma
  float sh = smoothstep(1.25, 0.9, length(p - c - vec2(0.02, -0.03)) / R) * (1.0 - inside);
  vec3 col = src * (1.0 - sh * 0.35);
  col = mix(col, lensC, inside);
  float rim = smoothstep(0.94, 0.985, r) * smoothstep(1.03, 0.99, r);
  col = mix(col, vec3(0.92, 0.9, 0.85), rim * 0.85);
  float glint = smoothstep(0.35, 0.0, length(d / R - vec2(-0.38, 0.42))) * inside;
  col = screen(col, vec3(glint * 0.35));
  return vec4(mix(src, col, uAmount), 1.0);
}
