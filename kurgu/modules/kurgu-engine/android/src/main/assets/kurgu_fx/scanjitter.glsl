// Tarama titremesi: yatay senkron kaybı. İnce satır grupları rastgele yatay
// kayar, ara sıra görüntünün bir bandı büyük bir sıçramayla eğilir; kayan
// satırlarda renk kanalları ayrışır ve bazı satırlar düşer (kararır).
// P0: x=güç  y=sıklık  z=satır yüksekliği  w=RGB ayrışması
vec4 fx(vec2 uv) {
  float lh = floor(mix(1.0, 8.0, uP0.z) * max(uRes.y / 720.0, 0.75));
  float line = floor(uv.y * uRes.y / lh);
  float rate = mix(4.0, 24.0, uP0.y);
  float fr = floor(uTime * rate);
  // Patlama zarfı: belirli anlarda yoğunlaşır
  float burst = smoothstep(0.35, 0.85, snoise1(uTime * mix(0.8, 3.0, uP0.y) + uSeed * 10.0) * 0.5 + 0.5);
  float h = hash12(vec2(line, fr));
  float jit = (h - 0.5) * step(1.0 - mix(0.05, 0.5, burst), hash12(vec2(line * 0.37, fr + 7.0)));
  // Büyük eğilme bandı
  float bandY = hash11(fr * 0.71 + 2.0);
  float band = smoothstep(0.06, 0.0, abs(uv.y - bandY)) * step(0.6, hash11(fr * 1.3)) * burst;
  float dx = (jit * 0.06 + band * (uv.y - bandY + 0.06) * 0.8) * mix(0.2, 1.0, uP0.x) * (0.3 + burst) * uAmount;
  float split = abs(dx) * mix(0.0, 2.5, uP0.w) + 0.002 * uP0.w * burst * uAmount;
  vec3 col;
  col.r = tex(vec2(uv.x + dx + split, uv.y)).r;
  col.g = tex(vec2(uv.x + dx, uv.y)).g;
  col.b = tex(vec2(uv.x + dx - split, uv.y)).b;
  // Düşen satırlar
  float drop = step(0.985 - burst * 0.03, hash12(vec2(line, fr + 3.0)));
  col = mix(col, col * 0.15, drop * uAmount);
  return vec4(col, 1.0);
}
