// Ağartma atlama (bleach bypass): gümüşün banyodan çıkarılmadığı film işlemi.
// Görüntünün kendi parlaklığı renk üzerine "overlay" ile bindirilir: doygunluk
// düşer, siyahlar derinleşir, parlak alanlar metalik bir sertlik kazanır.
// P0: x=gümüş katmanı  y=kontrast  z=sıcaklık (0 soğuk çelik, 1 sıcak bakır)  w=gren
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  float l = luma(src);
  // Gümüş katmanı: luma, rengin üzerine overlay; ardından kısmi renk kaybı
  vec3 silver = overlay(vec3(l), src);
  silver = mix(silver, vec3(luma(silver)), 0.2 + 0.3 * uP0.x);
  // Pozlama telafisi: overlay orta tonları karartır, parlaklık geri kazanılır
  silver *= mix(1.0, 1.0 + 0.6 * (1.0 - l), 0.6);
  vec3 col = mix(src, silver, mix(0.4, 0.9, uP0.x));
  // S eğrisi kontrast (orta ton çevresinde)
  float k = mix(0.15, 0.75, uP0.y);
  col = mix(col, col * col * (3.0 - 2.0 * col), k);
  // Gölge / ışık renk sıcaklığı: soğuk çelik ya da sıcak bakır
  vec3 coolT = vec3(0.92, 1.0, 1.06);
  vec3 warmT = vec3(1.07, 1.0, 0.9);
  col *= mix(coolT, warmT, uP0.z);
  // İnce, luma bağımlı gren (orta tonlarda en belirgin)
  float g = hash12(floor(uv * uRes) + fract(uSeed * 7.0) * 311.0) - 0.5;
  col += g * 0.09 * uP0.w * (1.0 - abs(l * 2.0 - 1.0));
  return vec4(mix(src, col, uAmount), 1.0);
}
