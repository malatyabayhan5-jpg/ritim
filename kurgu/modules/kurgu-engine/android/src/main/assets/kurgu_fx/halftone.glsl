// Çizgi roman (pop-art): düz, yumuşak basamaklı renk alanları; gölgelerde
// 45° ızgarada yarım ton noktaları (noktalar rengin koyu tonudur, gri değil),
// mürekkep konturları ve hafif kağıt tonu.
// P0: x=nokta boyutu  y=mürekkep konturu  z=renk basamakları  w=kağıt tonu
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  float steps = mix(4.0, 9.0, uP0.z);
  vec3 sv = src * steps;
  vec3 post = (floor(sv) + smoothstep(0.35, 0.65, fract(sv))) / steps;
  float l = luma(post);
  vec3 sat = mix(vec3(l), post, 1.25);
  vec3 paper = mix(vec3(1.0), vec3(1.0, 0.97, 0.9), uP0.w);
  float cell = mix(7.0, 20.0, uP0.x) * (uRes.y / 1080.0) + 3.0;
  vec2 g = rot2(uv * uRes, 0.785) / cell;
  vec2 f = fract(g) - 0.5;
  float shade = smoothstep(0.75, 0.1, l);
  float r = sqrt(shade) * 0.6;
  float dotM = smoothstep(r + 0.07, r - 0.07, length(f));
  vec3 col = clamp(sat, 0.0, 1.0) * paper;
  col = mix(col, col * 0.3, dotM * 0.85);
  vec2 o = px() * 1.5;
  float e = abs(luma(tex(uv + vec2(o.x, 0.0)).rgb) - luma(tex(uv - vec2(o.x, 0.0)).rgb))
          + abs(luma(tex(uv + vec2(0.0, o.y)).rgb) - luma(tex(uv - vec2(0.0, o.y)).rgb));
  col *= 1.0 - smoothstep(0.1, 0.3, e) * uP0.y * 0.9;
  return vec4(mix(src, col, uAmount), 1.0);
}
