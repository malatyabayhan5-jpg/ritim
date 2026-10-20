// Havai fişek: gökyüzünde aralıklarla patlayan renkli küreler. Her patlamada
// parçacıklar merkezden eşit hızla açılır, yerçekimiyle birlikte aşağı sarkar,
// arkalarında sönen iz bırakır ve sonunda pırıldayarak söner. Patlama anında
// sahneye kısa bir renkli ışık düşer.
// Yerçekimi tüm parçacıklara eşit etki ettiği için parçacıklar, sarkan
// merkeze göre bir çember üzerindedir: piksel yalnızca en yakın iki açısal
// parçacığa bakar (döngü yok denecek kadar ucuz).
// P0: x=yoğunluk  y=boyut  z=iz  w=renk (0 tek renk patlama, 1 karışık)
vec3 burst(vec2 p, float t, float idx, float period, float size, out float flashOut) {
  flashOut = 0.0;
  float cyc = floor(t / period + idx * 0.37);
  float lt = t - (cyc - idx * 0.37) * period;        // patlamadan beri geçen süre
  float seed = cyc * 7.3 + idx * 13.1;
  vec2 c = vec2((hash11(seed) - 0.5) * aspect() * 0.75, mix(0.0, 0.32, hash11(seed + 1.0)));
  float R = mix(0.16, 0.32, hash11(seed + 2.0)) * size;
  float life = 1.6;
  if (lt > life) return vec3(0.0);
  float k = 1.0 - exp(-lt * 3.0);                      // sürtünmeli genişleme
  float rad = R * k;
  vec2 g = vec2(0.0, -0.09 * lt * lt);                 // yerçekimi sarkması
  vec2 q = p - c - g;
  float n = 40.0;
  float a = atan(q.y, q.x) / TAU * n;
  float r = length(q);
  vec3 acc = vec3(0.0);
  float fade = smoothstep(life, life * 0.45, lt);
  vec3 base = hsv2rgb(vec3(hash11(seed + 3.0), 0.75, 1.0));
  for (int s = 0; s < 2; s++) {
    float i = floor(a) + float(s);
    float ang = (i + 0.5 + (hash11(i + seed) - 0.5) * 0.3) / n * TAU;
    float sp = 0.85 + 0.3 * hash11(i * 3.7 + seed);
    vec2 pp = vec2(cos(ang), sin(ang)) * rad * sp;
    // İz: parçacıktan merkeze doğru kısa bir çizgi parçası
    vec2 tail = pp * (1.0 - mix(0.15, 0.6, uP0.z) * (1.0 - k * 0.6));
    vec2 ab = pp - tail;
    float h = clamp(dot(q - tail, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
    float d = length(q - tail - ab * h);
    float w = 0.0045 * (0.6 + 0.4 * h);
    float spark = smoothstep(w, 0.0, d) * (0.25 + 0.75 * h);
    float tw = mix(1.0, step(0.5, hash11(floor(lt * 20.0) + i)), smoothstep(0.7, 1.2, lt));
    vec3 cc = mix(base, hsv2rgb(vec3(hash11(i + seed * 2.0), 0.7, 1.0)), uP0.w);
    acc += cc * spark * tw;
    acc += cc * exp(-d * d / 0.0004) * 0.25 * h;
  }
  flashOut = exp(-lt * 6.0);
  return (acc * 1.6 + base * exp(-r * r / (rad * rad + 1e-4)) * 0.12 * (1.0 - k)) * fade;
}
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  vec2 p = centered(uv);
  float t = uTime + uSeed * 10.0;
  float size = mix(0.6, 1.4, uP0.y);
  float period = mix(3.2, 1.6, uP0.x);
  vec3 acc = vec3(0.0);
  float fl = 0.0;
  for (int b = 0; b < 3; b++) {
    float f;
    acc += burst(p, t, float(b), period, size, f);
    fl += f;
  }
  vec3 col = src * (1.0 + fl * 0.25 * uAmount);
  col = screen(col, clamp(acc * uAmount, 0.0, 1.0));
  return vec4(col, 1.0);
}
