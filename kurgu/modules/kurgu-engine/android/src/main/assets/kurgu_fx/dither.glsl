// Düzenli titreklik (ordered dither): görüntü çok az renge indirgenir; ara
// tonlar 8x8 Bayer eşik matrisiyle nokta desenine dönüşür. Üç palet: kâğıt
// üstüne mürekkep (1 bit), dört tonlu yeşil el konsolu ekranı, 8 renkli RGB.
// P0: x=piksel boyutu  y=palet  z=kontrast
//
// Bayer eşiği bit işlemleriyle tanımından hesaplanır: her bit düzeyi için
// (x xor y)*2 + y değeri, düşük bitler en anlamlı olacak şekilde birleştirilir.
float bayer8(vec2 p) {
  float v = 0.0;
  float w = 16.0;
  for (int k = 0; k < 3; k++) {
    float bx = mod(p.x, 2.0);
    float by = mod(p.y, 2.0);
    float x = mod(bx + by, 2.0);
    v += (x * 2.0 + by) * w;
    p = floor(p * 0.5);
    w *= 0.25;
  }
  return (v + 0.5) / 64.0;
}
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  float ps = floor(mix(1.0, 6.0, uP0.x) * max(min(uRes.x, uRes.y) / 720.0, 1.0) + 0.5);
  vec2 cell = floor(uv * uRes / ps);
  vec3 c = tex((cell + 0.5) * ps / uRes).rgb;
  float k = mix(0.8, 1.6, uP0.z);
  c = clamp((c - 0.5) * k + 0.5, 0.0, 1.0);
  float t = bayer8(cell);
  float l = luma(c);
  vec3 col;
  if (uP0.y < 0.34) {
    // 1 bit: kâğıt ve mürekkep
    float b = step(t, l);
    col = mix(vec3(0.1, 0.1, 0.13), vec3(0.94, 0.91, 0.84), b);
  } else if (uP0.y < 0.67) {
    // 4 ton yeşil
    float q = clamp(floor(l * 3.0 + t), 0.0, 3.0);
    col = q < 0.5 ? vec3(0.07, 0.15, 0.09) : q < 1.5 ? vec3(0.22, 0.37, 0.19) : q < 2.5 ? vec3(0.5, 0.63, 0.29) : vec3(0.79, 0.86, 0.56);
  } else {
    // 8 renk: kanal başına 1 bit
    col = step(vec3(t), c);
  }
  return vec4(mix(src, col, uAmount), 1.0);
}
