// Kar: üç derinlik katmanında, yakındakiler büyük/hızlı/yumuşak, uzaktakiler
// küçük/yavaş/net; hafif rüzgâr salınımı ve soğuk renk dokunuşu.
// P0: x=yoğunluk  y=hız  z=tane boyutu  w=rüzgâr
float flakes(vec2 uv, float scale, float speed, float size, float blur, float t) {
  vec2 p = uv * vec2(aspect(), 1.0) * scale;
  p.y += t * speed;
  p.x += sin(t * 0.7 + p.y * 0.35) * (0.3 + uP0.w * 0.6) + t * uP0.w * 0.8;
  vec2 cell = floor(p);
  vec2 f = fract(p);
  float v = 0.0;
  float h = hash12(cell);
  if (h < mix(0.15, 0.75, uP0.x)) {
    vec2 c = 0.2 + 0.6 * hash22(cell + 3.1);
    float r = size * (0.5 + 0.5 * hash12(cell + 7.7));
    v = smoothstep(r, r * (1.0 - blur), length(f - c));
  }
  return v;
}
vec4 fx(vec2 uv) {
  vec3 col = tex(uv).rgb;
  float t = uTime * mix(0.4, 1.6, uP0.y);
  float s = mix(0.7, 1.4, uP0.z);
  float a = flakes(uv, 4.0, 0.9, 0.11 * s, 0.6, t) * 0.95
          + flakes(uv + 0.37, 8.0, 0.6, 0.12 * s, 0.4, t) * 0.8
          + flakes(uv + 0.71, 16.0, 0.4, 0.14 * s, 0.2, t) * 0.6;
  col = mix(col, col * vec3(0.95, 0.98, 1.06) + 0.02, 0.5 * uAmount);
  col = mix(col, vec3(0.97, 0.98, 1.0), clamp(a, 0.0, 1.0) * uAmount);
  return vec4(col, 1.0);
}
