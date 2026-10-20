// Stroboskop: belirli sıklıkla çakan flaş. Her vuruşta kısa bir süre görüntü
// beyaza patlar, kararır ya da renkleri ters döner; vuruş hızla söner.
// P0: x=sıklık  y=biçim (0 beyaz flaş, 0.5 karartma, 1 ters renk)  z=açık kalma oranı
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  float hz = mix(1.5, 12.0, uP0.x);
  float ph = fract(uTime * hz);
  float duty = mix(0.08, 0.5, uP0.z);
  // Vuruş: açık kalma süresince dolu, sonra keskin ama yumuşatılmış sönüş
  float on = smoothstep(duty + 0.04, duty, ph);
  vec3 alt;
  if (uP0.y < 0.34) alt = mix(src, vec3(1.0), 0.85) + src * 0.2;
  else if (uP0.y < 0.67) alt = src * 0.06;
  else alt = 1.0 - src;
  vec3 col = mix(src, alt, on * uAmount);
  return vec4(col, 1.0);
}
