// Röntgen: tonlar ters çevrilir ve soğuk bir ışık masası rengine boyanır;
// yoğun (açık) yapıların kenarları parlar, kemik görüntüsü gibi. Film
// greni ve ışık masasının ortası daha aydınlık.
// P0: x=kenar ışıması  y=renk tonu  z=kontrast
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  float l = luma(src);
  float sc = max(min(uRes.x, uRes.y) / 1080.0, 0.5);
  vec2 d = px() * 2.0 * sc;
  float gx = luma(tex(uv + vec2(d.x, 0.0)).rgb) - luma(tex(uv - vec2(d.x, 0.0)).rgb);
  float gy = luma(tex(uv + vec2(0.0, d.y)).rgb) - luma(tex(uv - vec2(0.0, d.y)).rgb);
  vec2 d2 = d * 3.0;
  float gx2 = luma(tex(uv + vec2(d2.x, 0.0)).rgb) - luma(tex(uv - vec2(d2.x, 0.0)).rgb);
  float gy2 = luma(tex(uv + vec2(0.0, d2.y)).rgb) - luma(tex(uv - vec2(0.0, d2.y)).rgb);
  float edge = smoothstep(0.03, 0.3, length(vec2(gx, gy))) + smoothstep(0.05, 0.5, length(vec2(gx2, gy2))) * 0.5;
  float inv = 1.0 - l;
  float k = mix(0.9, 2.0, uP0.z);
  inv = clamp((inv - 0.45) * k + 0.45, 0.0, 1.0);
  inv = pow(inv, 1.4);
  vec3 tint = hsv2rgb(vec3(uP0.y, 0.55, 1.0));
  vec3 col = tint * inv * 0.9 + mix(tint, vec3(1.0), 0.6) * edge * 0.55 * uP0.x;
  // Işık masası: ortası daha aydınlık; gren
  vec2 p = uv - 0.5;
  col *= 1.05 - dot(p, p) * 1.2;
  col += (hash12(floor(uv * uRes) + fract(uSeed) * 77.0) - 0.5) * 0.05;
  return vec4(mix(src, col, uAmount), 1.0);
}
