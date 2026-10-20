// Küçük gezegen: görüntü kutupsal koordinatlara sarılır; alt kenar merkezde
// toplanır, gökyüzü dışarıda kalır ve sahne yuvarlak bir gezegene dönüşür.
// Tünel kipinde tersine: gökyüzü merkezde, zemin dışarıda. Gezegen yavaşça döner.
// P0: x=yakınlaştırma  y=dönüş  z=tünel kipi
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  vec2 p = centered(uv);
  float r = length(p);
  float a = atan(p.x, -p.y) / TAU + 0.5;               // 0..1, alt yönden başlar
  a = fract(a + uTime * uP0.y * 0.05);
  float zoom = mix(1.0, 0.45, uP0.x);
  float rr = r / zoom;
  // Yarıçap -> kaynak yükseklik; üstel eğri zemini büyütür, gökyüzünü sıkıştırır
  float y = clamp(pow(rr, 1.5), 0.0, 1.0);
  if (uP0.z > 0.5) y = 1.0 - y;
  vec2 q = vec2(a, y);
  // Ek yerinde yumuşak geçiş: x=0 ve 1 kenarları karışır
  vec3 c = tex(q).rgb;
  float seam = smoothstep(0.02, 0.0, min(a, 1.0 - a));
  c = mix(c, tex(vec2(1.0 - a, y)).rgb, seam * 0.5);
  // Dış uzay: kadrajın dışında kalan bölge gökyüzünün üst rengine solar
  vec3 sky = tex(vec2(a, 0.995)).rgb;
  c = mix(c, sky, smoothstep(1.0, 1.15, rr) * step(uP0.z, 0.5));
  return vec4(mix(src, c, uAmount), 1.0);
}
