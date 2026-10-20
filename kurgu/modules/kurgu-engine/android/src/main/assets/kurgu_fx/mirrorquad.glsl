// Dörtlü ayna: görüntü merkezden iki eksende katlanır, dört simetrik çeyrek
// oluşur. Kaynak çeyrek sol alt ya da sol üsttür. Yakınlaştırma ile kaynağın
// merkeze yakın daha küçük bir bölgesi kullanılır; istenirse katlama ekseni
// yavaşça döner.
// P0: x=yakınlaştırma  y=dönüş hızı  z=kaynak taraf (0 alt, 1 üst)
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  vec2 p = centered(uv);
  p = rot2(p, uTime * uP0.y * 0.6);
  p = abs(p);
  float z = mix(1.0, 2.2, uP0.x);
  float ys = uP0.z > 0.5 ? 1.0 : -1.0;
  vec2 q = uncentered(vec2(-p.x, p.y * ys) / z);
  q = 1.0 - abs(1.0 - mod(q, 2.0));
  return vec4(mix(src, tex(q).rgb, uAmount), 1.0);
}
