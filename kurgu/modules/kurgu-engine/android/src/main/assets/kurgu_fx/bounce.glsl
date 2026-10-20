// Ritim zıplaması: görüntü her vuruşta top gibi zıplar; yere değdiği anda
// basılıp yayvanlaşır, havadayken hafifçe uzar. Kenarlar boş kalmasın diye
// görüntü az miktarda büyütülür ve kenarda yansıtılır.
// P0: x=sıklık  y=yükseklik  z=esneme
vec2 mirrorUv(vec2 u) { return 1.0 - abs(1.0 - mod(u, 2.0)); }
vec4 fx(vec2 uv) {
  float hz = mix(0.8, 3.0, uP0.x);
  float ph = fract(uTime * hz);
  // Parabolik zıplama yüksekliği (0 yerde)
  float h = 4.0 * ph * (1.0 - ph);
  float hgt = h * mix(0.02, 0.1, uP0.y) * uAmount;
  // Esneme: yerde basık (ph 0 ya da 1 yakınında), havada uzun
  float impact = exp(-ph * 14.0) + exp(-(1.0 - ph) * 30.0) * 0.5;
  float sq = (impact * 0.08 - h * 0.025) * uP0.z * uAmount;
  vec2 scale = vec2(1.0 + sq, 1.0 - sq) * 1.04;
  vec2 c = uv - vec2(0.5, 0.0);               // alt kenara göre ölçekle
  vec2 q = c / scale + vec2(0.5, 0.0);
  q.y -= hgt;
  vec3 col = tex(mirrorUv(q)).rgb;
  return vec4(col, 1.0);
}
