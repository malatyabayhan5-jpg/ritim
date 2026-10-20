// Erken renkli sinema: iki şeritli süreç yalnızca kırmızı-turuncu ve
// camgöbeği-yeşil kayıtları taşır (mavi ve mor yoktur, gök turkuaz olur);
// üç şeritli süreç ise boya transferiyle doygun, yoğun ana renkler verir.
// P0: x=süreç (0 iki şerit, 1 üç şerit)  y=doygunluk  z=solma
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  // İki şerit: kırmızı kayıt + yeşil kayıt; mavi, yeşil kayıttan türetilir
  float redRec = src.r;
  float greenRec = src.g * 0.75 + src.b * 0.25;
  vec3 two = vec3(redRec, greenRec * 0.92 + redRec * 0.05, greenRec * 0.82);
  two = mix(vec3(luma(two)), two, 1.15);
  // Üç şerit: her kanal diğer ikisinin ortalamasından ayrıştırılarak boya yoğunluğu
  vec3 dye = src - vec3((src.g + src.b) * 0.5, (src.r + src.b) * 0.5, (src.r + src.g) * 0.5);
  vec3 three = src + dye * 0.45;
  three = mix(three, three * three * (3.0 - 2.0 * three), 0.3);
  vec3 col = mix(two, clamp(three, 0.0, 1.0), uP0.x);
  col = mix(vec3(luma(col)), col, mix(0.7, 1.45, uP0.y));
  // Solma: kaldırılmış siyahlar ve sıcak, hafif kirli parlak alanlar
  col = mix(col, col * vec3(0.95, 0.9, 0.82) + vec3(0.06, 0.05, 0.04), uP0.z);
  return vec4(mix(src, clamp(col, 0.0, 1.0), uAmount), 1.0);
}
