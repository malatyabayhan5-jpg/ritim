// Ateş böcekleri: alacakaranlıkta yumuşak yollar çizerek süzülen, nefes alır
// gibi yanıp sönen küçük ışıklar. Her biri parlak bir çekirdek ve geniş bir
// ışıma taşır; iki derinlik katmanı. Sahne hafifçe karartılır.
// P0: x=yoğunluk  y=boyut  z=renk (0 sarı-yeşil, 1 buz mavisi)  w=hız
vec3 layer(vec2 uv, float scale, float t, float size, float dens) {
  vec2 p = uv * vec2(aspect(), 1.0) * scale;
  // Yalnızca en yakın 2x2 hücre: böcek merkezi kendi hücresinin içinde kaldığı
  // için pikselin bulunduğu hücre yarısı uzak komşuları eler
  vec2 id0 = floor(p) - step(fract(p), vec2(0.5));
  vec3 acc = vec3(0.0);
  for (int j = 0; j <= 1; j++) {
    for (int i = 0; i <= 1; i++) {
      vec2 id = id0 + vec2(float(i), float(j));
      if (hash12(id + 1.0) > dens) continue;
      vec2 h = hash22(id + 3.0);
      // Yumuşak yol: iki salınımın toplamı
      vec2 c = id + 0.5 + 0.45 * vec2(sin(t * (0.5 + h.x) + h.y * TAU), cos(t * (0.4 + h.y * 0.7) + h.x * TAU));
      float d = length(p - c);
      float blink = smoothstep(0.1, 0.9, 0.5 + 0.5 * sin(t * (0.7 + h.x * 1.3) + h.y * 40.0));
      float core = exp(-d * d / (0.0009 * size * size));
      float glow = exp(-d * d / (0.02 * size * size)) * 0.35;
      acc += vec3(core + glow) * blink;
    }
  }
  return acc;
}
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  float t = uTime * mix(0.4, 1.6, uP0.w) + uSeed * 30.0;
  float size = mix(0.6, 1.8, uP0.y) * 2.2;
  float dens = mix(0.15, 0.6, uP0.x);
  float b = layer(uv, 5.0, t, size, dens).r + layer(uv + 0.37, 9.0, t * 1.2, size * 0.8, dens).r * 0.6;
  vec3 tint = mix(vec3(0.85, 1.0, 0.35), vec3(0.55, 0.85, 1.0), uP0.z);
  vec3 col = src * mix(1.0, 0.82, uAmount) + tint * b * uAmount;
  col = mix(col, vec3(1.0, 1.0, 0.9), clamp(b - 1.0, 0.0, 1.0) * 0.5 * uAmount);
  return vec4(col, 1.0);
}
