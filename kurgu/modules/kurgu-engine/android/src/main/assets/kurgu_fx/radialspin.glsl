// Dönme bulanıklığı: kamera ekseni etrafında hızla dönüyormuş gibi açısal
// bulanıklık; bulanıklık merkezden uzaklaştıkça artar, merkezde net bir alan
// kalabilir.
// P0: x=güç  y=net merkez
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  vec2 p = centered(uv);
  float r = length(p);
  float clear = mix(0.0, 0.35, uP0.y);
  float k = smoothstep(clear, clear + 0.3, r);
  float ang = mix(0.02, 0.2, uP0.x) * k * uAmount;
  float j = hash12(uv * uRes) - 0.5;
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 14; i++) {
    float t = (float(i) + j) / 13.0 - 0.5;
    acc += tex(uncentered(rot2(p, t * ang))).rgb;
  }
  vec3 col = acc / 14.0;
  return vec4(col, 1.0);
}
