// Şimşek: fırtınalı karanlık bir gökyüzünde düzensiz aralıklarla çakan
// şimşekler. Çakma anında sahne soğuk beyaz ışıkla aydınlanır ve hızla söner;
// gökyüzünden aşağı inen zikzaklı, dallanan bir yıldırım ve çevresinde ışıma.
// P0: x=sıklık  y=parlaklık  z=karartma
float boltDist(vec2 p, float x0, float seed, float yEnd) {
  // Yukarıdan aşağı zikzak: x, y'ye bağlı katmanlı gürültü
  float y = p.y;
  float x = x0 + (vnoise(vec2(y * 6.0, seed)) - 0.5) * 0.35 + (vnoise(vec2(y * 22.0, seed + 3.0)) - 0.5) * 0.08 + (hash11(floor(y * 60.0) + seed) - 0.5) * 0.012;
  float d = abs(p.x - x);
  return y > yEnd ? d : 9.0;
}
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  vec2 p = centered(uv);
  // Çakma zamanlaması: her dönemde rastgele bir anda çakar
  float period = mix(4.0, 1.2, uP0.x);
  float ep = floor(uTime / period + uSeed);
  float local = uTime - (ep - uSeed) * period;
  float at = hash11(ep * 3.7) * period * 0.6;
  float tt = local - at;
  // Çift çakma: kısa flaş, kısa ara, ikinci flaş
  float flash = (exp(-max(tt, 0.0) * 18.0) + exp(-max(tt - 0.12, 0.0) * 10.0) * step(0.12, tt) * 0.7) * step(0.0, tt);
  float x0 = (hash11(ep * 9.1) - 0.5) * aspect() * 0.7;
  float yEnd = mix(-0.5, 0.0, hash11(ep * 4.3));
  float d = boltDist(p, x0, ep, yEnd);
  // Dal: ana kanaldan ayrılan ikinci kanal
  vec2 bp = p - vec2(0.0, 0.0);
  float d2 = boltDist(bp + vec2(-0.12 * sign(hash11(ep) - 0.5) * (0.5 - p.y), 0.0), x0, ep + 17.0, yEnd + 0.25);
  d2 = p.y < 0.3 - hash11(ep * 2.0) * 0.2 ? d2 : 9.0;
  float w = 0.003;
  float core = smoothstep(w, 0.0, d) + smoothstep(w * 0.7, 0.0, d2) * 0.7;
  float glow = exp(-d * 60.0) * 0.6 + exp(-d2 * 80.0) * 0.3;
  float visible = step(0.0, tt) * exp(-max(tt, 0.0) * 6.0);
  // Fırtına karartması + çakma aydınlatması
  float dark = mix(1.0, 0.45, uP0.z);
  vec3 col = src * dark * vec3(0.9, 0.95, 1.05);
  col += src * flash * mix(0.6, 1.8, uP0.y) * vec3(0.85, 0.9, 1.0);
  col += vec3(0.75, 0.82, 1.0) * (core + glow) * visible * mix(0.6, 1.3, uP0.y);
  col += vec3(0.5, 0.55, 0.7) * flash * 0.12 * smoothstep(-0.2, 0.5, p.y);
  return vec4(mix(src, col, uAmount), 1.0);
}
