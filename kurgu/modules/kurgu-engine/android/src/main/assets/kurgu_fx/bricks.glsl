// Oyuncak tuğla mozaiği: görüntü plastik tuğla plakasına dönüşür. Her tuğla
// hücre rengini parlak plastik renk basamaklarıyla alır; kenarları eğimli,
// üstünde ışık alan yuvarlak bir çıkıntı (dübel) ve çıkıntının gölgesi vardır.
// P0: x=tuğla boyutu  y=dübel  z=renk basamakları
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  float bs = mix(10.0, 34.0, uP0.x) * max(min(uRes.x, uRes.y) / 720.0, 0.6);
  vec2 pix = uv * uRes;
  vec2 cell = floor(pix / bs);
  vec2 f = fract(pix / bs) - 0.5;
  vec2 cu = (cell + 0.5) * bs / uRes;
  vec2 o = bs * 0.25 / uRes;
  vec3 c = (tex(cu + o).rgb + tex(cu - o).rgb + tex(cu + vec2(o.x, -o.y)).rgb + tex(cu - vec2(o.x, -o.y)).rgb) * 0.25;
  // Plastik renk: doygun, basamaklı
  float steps = mix(3.0, 7.0, uP0.z);
  c = mix(vec3(luma(c)), c, 1.3);
  c = floor(clamp(c, 0.0, 1.0) * steps + 0.5) / steps;
  c = clamp(c * 0.92 + 0.04, 0.0, 1.0);
  vec2 L = normalize(vec2(-0.6, 0.8));
  // Tuğla kenar eğimi
  float edge = 0.5 - max(abs(f.x), abs(f.y));
  float bevel = smoothstep(0.0, 0.07, edge);
  float side = dot(normalize(f + 1e-4), L);
  vec3 col = c * (1.0 + (1.0 - bevel) * 0.35 * side);
  col *= mix(0.55, 1.0, smoothstep(0.0, 0.025, edge));
  // Dübel: gölge, gövde kenarı ve parlak yansıma
  float r = 0.3;
  float d = length(f);
  float shadow = smoothstep(r + 0.06, r - 0.02, length(f - vec2(0.05, -0.07))) * (1.0 - smoothstep(r - 0.02, r, d));
  col *= 1.0 - shadow * 0.35 * uP0.y;
  float stud = smoothstep(r + 0.015, r - 0.015, d);
  float rim = smoothstep(r - 0.08, r, d) * stud;
  float ang = dot(normalize(f + 1e-4), L);
  vec3 studC = c * (1.0 + rim * 0.9 * ang) * (1.0 - smoothstep(r - 0.03, r + 0.01, d) * 0.3);
  studC += smoothstep(0.1, 0.0, length(f - vec2(-0.1, 0.12))) * 0.4;
  col = mix(col, studC, stud * uP0.y);
  return vec4(mix(src, col, uAmount), 1.0);
}
