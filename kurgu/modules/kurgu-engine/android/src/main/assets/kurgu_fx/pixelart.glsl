// Piksel sanatı: görüntü iri piksellere indirgenir ve 16 renkli özgün bir
// palete oturtulur (en yakın renk, algısal ağırlıklı uzaklık). Komşu pikselle
// belirgin ton farkı olan yerlere koyu bir kontur pikseli çizilir; eski oyun
// grafikleri gibi.
// P0: x=piksel boyutu  y=kontur  z=palet (0 serbest basamak, 1 tam palet)
vec3 cellColor(vec2 cell, float ps) {
  vec2 c = (cell + 0.5) * ps / uRes;
  vec2 o = ps * 0.25 / uRes;
  return (tex(c + o).rgb + tex(c - o).rgb + tex(c + vec2(o.x, -o.y)).rgb + tex(c - vec2(o.x, -o.y)).rgb) * 0.25;
}
vec3 snap(vec3 c) {
  vec3 pal[16];
  pal[0] = vec3(0.08, 0.07, 0.12);  pal[1] = vec3(0.29, 0.21, 0.33);
  pal[2] = vec3(0.18, 0.26, 0.46);  pal[3] = vec3(0.24, 0.5, 0.78);
  pal[4] = vec3(0.5, 0.8, 0.92);    pal[5] = vec3(0.14, 0.37, 0.27);
  pal[6] = vec3(0.37, 0.64, 0.3);   pal[7] = vec3(0.72, 0.86, 0.42);
  pal[8] = vec3(0.42, 0.24, 0.18);  pal[9] = vec3(0.76, 0.47, 0.32);
  pal[10] = vec3(0.96, 0.78, 0.62); pal[11] = vec3(0.72, 0.17, 0.22);
  pal[12] = vec3(0.96, 0.5, 0.2);   pal[13] = vec3(0.99, 0.86, 0.36);
  pal[14] = vec3(0.55, 0.55, 0.6);  pal[15] = vec3(0.95, 0.95, 0.91);
  vec3 best = pal[0];
  float bd = 1e9;
  for (int i = 0; i < 16; i++) {
    vec3 d = c - pal[i];
    float e = dot(d * d, vec3(0.3, 0.55, 0.15));
    if (e < bd) { bd = e; best = pal[i]; }
  }
  return best;
}
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  float ps = floor(mix(3.0, 14.0, uP0.x) * max(min(uRes.x, uRes.y) / 720.0, 0.75) + 0.5);
  vec2 cell = floor(uv * uRes / ps);
  vec3 c = cellColor(cell, ps);
  vec3 free = floor(c * 4.0 + 0.5) / 4.0;
  vec3 col = mix(free, snap(c), uP0.z);
  // Kontur: sağdaki ya da üstteki pikselden belirgin biçimde koyuysa
  float l = luma(c);
  // Komşular için tek örnek yeterli (kontur kararı kaba bir eşik)
  float lr = luma(tex((cell + vec2(1.5, 0.5)) * ps / uRes).rgb);
  float lu = luma(tex((cell + vec2(0.5, 1.5)) * ps / uRes).rgb);
  float lo = luma(tex((cell + vec2(-0.5, 0.5)) * ps / uRes).rgb);
  float edge = step(0.18, max(max(lr, lu), lo) - l);
  col = mix(col, col * 0.35 + vec3(0.02, 0.02, 0.05), edge * uP0.y);
  return vec4(mix(src, col, uAmount), 1.0);
}
