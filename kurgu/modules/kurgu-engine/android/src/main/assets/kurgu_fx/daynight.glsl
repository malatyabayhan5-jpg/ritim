// Gündüzden gece (day for night): gündüz çekimini ay ışığında geceye çevirir.
// Pozlama düşürülür, renk azalır ve maviye kayar; gökyüzü (üst bölge ve
// parlak mavi alanlar) daha da koyulaşır. Noktasal parlak ışıklar (lambalar)
// sıcak rengiyle korunur.
// P0: x=karanlık  y=mavilik  z=ışıkları koru
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  float l = luma(src);
  float dark = mix(0.8, 0.42, uP0.x);
  // Ay ışığı: azaltılmış doygunluk, mavi-camgöbeği ton, gölgeler ezik
  vec3 moon = mix(vec3(l), src, 0.35) * vec3(0.62, 0.8, 1.15);
  moon = mix(vec3(luma(moon)) * vec3(0.7, 0.85, 1.2), moon, 1.0 - uP0.y * 0.6);
  vec3 col = pow(moon * dark, vec3(1.15));
  // Gökyüzü: üst bölgede ve mavimsi parlak alanlarda ek karartma
  float sky = smoothstep(0.45, 1.0, uv.y) * smoothstep(0.3, 0.7, l) * (0.5 + 0.5 * step(src.r, src.b + 0.05));
  col *= 1.0 - sky * 0.55;
  // Pratik ışıklar: çok parlak noktalar sıcak kalır
  float lamp = smoothstep(0.78, 0.97, max(src.r, max(src.g, src.b))) * uP0.z;
  col = mix(col, src * vec3(1.0, 0.9, 0.75), lamp * 0.85);
  // Hafif mavi kenar kararması
  vec2 p = uv - 0.5;
  col *= 1.0 - 0.45 * dot(p, p) * 2.0;
  return vec4(mix(src, col, uAmount), 1.0);
}
