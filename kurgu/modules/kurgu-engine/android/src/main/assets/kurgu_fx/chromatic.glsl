// Kromatik sapma: lens kenarına doğru artan, dağılım boyunca yumuşak örneklenen
// RGB ayrışması ve hafif fıçı bozulması; isteğe bağlı ritmik nabız.
// P0: x=güç  y=fıçı bozulması  z=nabız  w=yön (0 radyal, 1 yatay)
vec4 fx(vec2 uv) {
  vec2 p = uv - 0.5;
  vec2 pa = p * vec2(aspect(), 1.0);
  float r2 = dot(pa, pa);
  float pulse = 1.0 + uP0.z * 0.8 * pow(0.5 + 0.5 * sin(uTime * 6.2832 * 1.5), 4.0);
  float k = (0.004 + 0.035 * uP0.x) * uAmount * pulse;
  vec2 dir = mix(p * (0.3 + r2 * 3.0), vec2(0.5, 0.0), uP0.w);
  float inset = 1.0 - k * 1.6 - uP0.y * 0.04 * uAmount;
  vec2 q = 0.5 + p * inset * (1.0 + uP0.y * 0.12 * r2 * uAmount);
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 6; i++) {
    float f = float(i) / 5.0;
    acc.r += tex(q + dir * k * (0.6 + f * 0.8)).r;
    acc.g += tex(q + dir * k * (f - 0.5) * 0.3).g;
    acc.b += tex(q - dir * k * (0.6 + f * 0.8)).b;
  }
  return vec4(acc / 6.0, 1.0);
}
