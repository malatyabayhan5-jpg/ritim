// Parlak süpürme: cilalı bir yüzeyden yansıyan ışık gibi eğik, parlak bir
// bant kadrajı düzenli aralıklarla tarar. Bant, görüntünün açık bölgelerinde
// daha güçlüdür; ortasında ince keskin bir çizgi, çevresinde yumuşak ışık.
// P0: x=genişlik  y=açı  z=hız
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  vec2 p = centered(uv);
  float ang = mix(-0.6, 1.2, uP0.y);
  vec2 dir = vec2(cos(ang), sin(ang));
  float span = 0.5 * (abs(dir.x) * aspect() + abs(dir.y)) + 0.3;
  float period = mix(3.5, 1.0, uP0.z);
  float ph = fract(uTime / period);
  // Süpürme süresi periyodun ilk %55'i, sonra bekleme
  float pos = mix(-span, span, easeInOut(ph / 0.55));
  float x = dot(p, dir) - pos;
  float w = mix(0.03, 0.18, uP0.x);
  float band = exp(-x * x / (w * w));
  float line = exp(-x * x / (w * w * 0.04));
  float active = step(ph, 0.55);
  float l = luma(src);
  vec3 add = vec3(1.0, 0.98, 0.95) * (band * (0.25 + 0.45 * l) + line * 0.35) * active;
  vec3 col = screen(src, clamp(add * uAmount, 0.0, 1.0));
  return vec4(col, 1.0);
}
