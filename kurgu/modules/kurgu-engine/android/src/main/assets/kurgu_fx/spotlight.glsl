// Sahne spot ışığı: kadrajda dolaşan eliptik bir spot dışındaki her yer
// kararır. Spotun kenarı sıcak ve yumuşak, içi hafif parlatılmış; spot yukarıdan
// geldiği için hafif bir ışık konisi (havadaki toz) görünür.
// P0: x=boyut  y=karartma  z=hız  w=kenar yumuşaklığı
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  vec2 p = centered(uv);
  float t = uTime * mix(0.15, 1.2, uP0.z) + uSeed * 7.0;
  vec2 halfSz = vec2(aspect(), 1.0) * 0.5;
  vec2 c = vec2(sin(t * 0.9) * 0.6, sin(t * 0.63 + 0.8) * 0.35) * (halfSz - 0.15);
  float R = mix(0.15, 0.45, uP0.x);
  vec2 d = (p - c) / vec2(R * 1.15, R);
  float r = length(d);
  float soft = mix(0.05, 0.6, uP0.w);
  float spot = smoothstep(1.0, 1.0 - soft, r);
  // Koni: kaynaktan (üst) spot merkezine doğru zayıf toz ışığı
  vec2 top = vec2(c.x * 0.3, 0.75);
  vec2 ax = normalize(c - top);
  vec2 rel = p - top;
  float along = dot(rel, ax);
  float across = abs(rel.x * ax.y - rel.y * ax.x);
  float coneW = R * clamp(along / max(length(c - top), 0.01), 0.0, 1.0);
  float cone = smoothstep(coneW + 0.05, coneW - 0.05, across) * step(0.0, along) * smoothstep(length(c - top) + R * 0.2, 0.0, along);
  float dark = mix(0.6, 0.06, uP0.y);
  vec3 lit = src * (1.08 + 0.12 * (1.0 - r)) + vec3(0.03, 0.025, 0.0);
  vec3 col = mix(src * dark, lit, spot);
  // Kenarda sıcak halka
  col += vec3(1.0, 0.7, 0.35) * smoothstep(soft + 0.1, 0.0, abs(r - 1.0 + soft * 0.5)) * 0.06;
  col += vec3(1.0, 0.95, 0.85) * cone * 0.07 * (1.0 - spot);
  return vec4(mix(src, col, uAmount), 1.0);
}
