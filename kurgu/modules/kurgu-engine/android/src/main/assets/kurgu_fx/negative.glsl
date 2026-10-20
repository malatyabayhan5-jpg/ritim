// Film negatifi: renkli negatif şeridi ışık masasında görür gibi. Tonlar ve
// renkler terstir; turuncu taban maskesi (renkli negatiflerin karakteristik
// rengi) ve film greni eklenir. Maske kapalıyken saf ters görüntü verir.
// P0: x=turuncu maske  y=kontrast  z=gren
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  vec3 neg = 1.0 - src;
  float k = mix(0.75, 1.25, uP0.y);
  neg = clamp((neg - 0.5) * k + 0.5, 0.0, 1.0);
  // Turuncu taban: yoğunluklar maskeyle çarpılır, en açık bölgeler kehribar olur
  vec3 base = vec3(1.0, 0.62, 0.36);
  vec3 masked = neg * mix(vec3(1.0), base, 0.85) + base * 0.12;
  vec3 col = mix(neg, masked, uP0.x);
  float g = hash12(floor(uv * uRes) + fract(uSeed * 3.1) * 97.0) - 0.5;
  col += g * 0.1 * uP0.z;
  return vec4(mix(src, col, uAmount), 1.0);
}
