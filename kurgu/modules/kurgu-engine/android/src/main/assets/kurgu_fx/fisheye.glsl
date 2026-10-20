// Balık gözü objektif: eş-uzaklıklı (equidistant) izdüşümle kadraj fıçı
// biçimde bükülür; merkez büyür, kenarlar sıkışır. Dairesel kipte görüntü
// siyah bir çerçeve içinde daireye sığar. Kenarlarda objektifin renk saçağı.
// P0: x=güç  y=dairesel kip  z=renk saçağı
//
// Çıktı yarıçapı r (kenarda 1) bir görüş açısına (r * θmax) karşılık gelir;
// kaynak (düz objektif) yarıçapı tan(r θmax) / tan(θmax) olur. Kenar yerinde kalır.
vec2 lens(vec2 p, float th, float R) {
  float r = length(p) / R;
  if (r < 1e-5) return p;
  float s = tan(min(r * th, 1.5)) / tan(th);
  return p * s / r;
}
vec4 fx(vec2 uv) {
  vec2 p = centered(uv);
  float circ = step(0.5, uP0.y);
  float th = mix(0.35, 1.3, uP0.x) * uAmount + 1e-3;
  float R = circ > 0.5 ? 0.5 : length(vec2(aspect(), 1.0) * 0.5);
  float fr = uP0.z * 0.01 * uAmount;
  vec3 col = vec3(tex(uncentered(lens(p * (1.0 + fr), th, R))).r,
                  tex(uncentered(lens(p, th, R))).g,
                  tex(uncentered(lens(p * (1.0 - fr), th, R))).b);
  float r = length(p) / R;
  // Dairesel maske ve objektif kenar kararması
  float mask = mix(1.0, smoothstep(1.0, 0.985, r), circ * step(0.001, uAmount));
  col *= mask * (1.0 - 0.3 * uAmount * smoothstep(0.5, 1.0, r));
  return vec4(col, 1.0);
}
