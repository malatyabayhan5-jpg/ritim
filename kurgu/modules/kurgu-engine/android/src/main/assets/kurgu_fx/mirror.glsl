// Ayna bölme: görüntünün bir yarısı ekseninde aynalanarak diğer yarıya
// yansıtılır; simetrik, büyülü bir kompozisyon. Eksen dikey ya da yatay,
// kaynak taraf ve eksen konumu ayarlanabilir.
// P0: x=eksen (0 dikey, 1 yatay)  y=kaynak taraf (0 sol/alt, 1 sağ/üst)  z=eksen konumu
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  float pos = mix(0.3, 0.7, uP0.z);
  vec2 q = uv;
  if (uP0.x < 0.5) {
    bool keepLeft = uP0.y < 0.5;
    if (keepLeft ? uv.x > pos : uv.x < pos) q.x = 2.0 * pos - uv.x;
  } else {
    bool keepLow = uP0.y < 0.5;
    if (keepLow ? uv.y > pos : uv.y < pos) q.y = 2.0 * pos - uv.y;
  }
  q = 1.0 - abs(1.0 - mod(q, 2.0));
  q = abs(q);
  return vec4(mix(src, tex(q).rgb, uAmount), 1.0);
}
