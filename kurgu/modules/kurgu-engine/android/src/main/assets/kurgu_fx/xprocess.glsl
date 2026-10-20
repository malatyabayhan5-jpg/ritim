// Çapraz banyo (cross process): dia filmi negatif banyosunda işlenmiş gibi.
// Kanal başına farklı eğriler: kırmızı ve yeşil sert S eğrisi, mavi
// sıkıştırılıp yükseltilir. Sonuç: sarı-yeşil parlak alanlar, camgöbeği ya da
// mor gölgeler, patlayan doygunluk ve hafif kenar kararması.
// P0: x=eğri gücü  y=gölge tonu (0 camgöbeği, 1 mor)  z=doygunluk  w=vinyet
vec3 sCurve(vec3 c, vec3 k) {
  vec3 s = c * c * (3.0 - 2.0 * c);
  return mix(c, s, k);
}
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  float k = uP0.x;
  vec3 col = sCurve(src, vec3(1.0, 0.8, 0.0) * mix(0.6, 1.6, k));
  // Mavi kanal: düzleştirilmiş ve kaldırılmış (gölgelere mavi, ışıklara sarı)
  col.b = mix(src.b, 0.18 + src.b * 0.62, k);
  // Yeşili parlak tonlarda biraz yükselt (sarımsı-yeşil ışık)
  col.g += 0.06 * k * smoothstep(0.4, 1.0, luma(src));
  // Gölge tonu: camgöbeği ya da mor
  float sh = 1.0 - smoothstep(0.0, 0.55, luma(col));
  vec3 shadowTint = mix(vec3(-0.04, 0.03, 0.06), vec3(0.05, -0.03, 0.07), uP0.y);
  col += shadowTint * sh * k;
  float l = luma(col);
  col = mix(vec3(l), col, mix(1.0, 1.6, uP0.z));
  vec2 p = uv - 0.5;
  col *= 1.0 - uP0.w * 0.9 * smoothstep(0.2, 0.75, dot(p, p) * 2.2);
  return vec4(mix(src, col, uAmount), 1.0);
}
