// Sonsuz döşeme: görüntü küçültülüp n x n döşeme olarak tekrarlanır (en-boy
// oranı korunur). Aynalı döşemede komşu kareler ters çevrilerek dikişsiz bir
// desen oluşur. Döşeme yavaşça yakınlaşıp uzaklaşır ve kayar.
// P0: x=döşeme sayısı  y=aynalı döşeme  z=hız
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  float n = mix(2.0, 6.0, uP0.x);
  float t = uTime * mix(0.0, 0.6, uP0.z);
  float zoom = n * (1.0 + 0.15 * sin(t));
  vec2 q = (uv - 0.5) * zoom + 0.5 + vec2(t * 0.3, t * 0.15);
  vec2 cell = floor(q);
  vec2 f = fract(q);
  if (uP0.y > 0.5) {
    if (mod(cell.x, 2.0) > 0.5) f.x = 1.0 - f.x;
    if (mod(cell.y, 2.0) > 0.5) f.y = 1.0 - f.y;
  }
  vec3 col = tex(f).rgb;
  // Aynasız kipte ince ayraç çizgisi
  vec2 e = min(f, 1.0 - f) * uRes / zoom;
  col *= mix(1.0, smoothstep(0.0, 1.5, min(e.x, e.y)) * 0.6 + 0.4, step(uP0.y, 0.5));
  return vec4(mix(src, col, uAmount), 1.0);
}
