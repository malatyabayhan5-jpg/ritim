// Kaleydoskop: kadraj merkez etrafında N parçaya bölünür ve aynalanır; desen
// yavaşça döner, hafif nabızla nefes alır.
// P0: x=parça sayısı  y=dönme hızı  z=yakınlaştırma  w=nabız
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  float n = floor(mix(3.0, 12.0, uP0.x) + 0.5);
  vec2 p = centered(uv);
  float r = length(p);
  float a = atan(p.y, p.x) + uTime * mix(0.0, 0.8, uP0.y);
  float seg = TAU / n;
  a = mod(a, seg);
  a = abs(a - seg * 0.5);
  float z = mix(1.0, 0.5, uP0.z) * (1.0 + 0.06 * uP0.w * sin(uTime * 3.0));
  vec2 q = vec2(cos(a), sin(a)) * r * z;
  vec3 col = tex(uncentered(q)).rgb;
  return vec4(mix(src, col, uAmount), 1.0);
}
