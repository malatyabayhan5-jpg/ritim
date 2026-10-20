// Film şeridi: görüntü, kenarlarında delikleri olan bir film şeridinin
// karelerine yerleşir ve şerit yavaşça akar. Yatay kadrajda şerit dikey akar
// (kareler üst üste), dikey kadrajda yatay. Şeridin dışında görüntünün
// bulanık ve koyulaştırılmış hâli zemin olur.
// P0: x=hız  y=görünen kare sayısı  z=film tonu (0 renkli, 1 sepya)
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  bool vert = aspect() >= 1.0;
  // Şerit koordinatları: a = akış yönü (0..1 ekran), b = şerit enine (-0.5..0.5)
  float a = vert ? uv.y : uv.x;
  float across = vert ? (uv.x - 0.5) * aspect() : (uv.y - 0.5) / aspect();
  float frames = mix(1.6, 3.6, uP0.y);
  float frameLen = 1.0 / frames;                      // ekran boyunca kare uzunluğu
  // Kare en-boy: kaynakla aynı; şerit genişliği buna göre
  float fw = frameLen * (vert ? aspect() : 1.0 / aspect());   // kare eni (kısa kenar biriminde)
  float stripW = fw * 1.32;
  float flow = a + uTime * mix(0.0, 0.25, uP0.x);
  float fi = floor(flow / frameLen);
  float fa = fract(flow / frameLen);
  vec3 bg = (tex(uv + vec2(0.01, 0.0)).rgb + tex(uv - vec2(0.01, 0.0)).rgb + tex(uv + vec2(0.0, 0.015)).rgb + tex(uv - vec2(0.0, 0.015)).rgb) * 0.25 * 0.35;
  vec3 col = bg;
  if (abs(across) < stripW * 0.5) {
    vec3 film = vec3(0.05, 0.04, 0.035);
    col = film;
    // Kare penceresi
    float fb = across / fw + 0.5;                      // kare içi enine 0..1
    float fl = (fa - 0.5) / 0.9 + 0.5;                 // kare içi boyuna, araya pay
    if (fb > 0.0 && fb < 1.0 && fl > 0.0 && fl < 1.0) {
      vec2 suv = vert ? vec2(fb, fl) : vec2(fl, fb);
      vec3 c = tex(suv).rgb;
      vec3 sep = vec3(luma(c)) * vec3(1.05, 0.9, 0.7);
      col = mix(c, sep, uP0.z) * (0.92 + 0.08 * hash11(fi));
    }
    // Delikler: her iki kenarda, kare başına 4 tane
    float edgeB = abs(across) - fw * 0.5;               // > 0 kenar bandında
    if (edgeB > 0.0) {
      float hp = fract(flow / frameLen * 4.0);
      float hw = (stripW - fw) * 0.5;
      vec2 hq = vec2((edgeB / hw - 0.5) * hw, (hp - 0.5) * frameLen * 0.25);
      vec2 hb = vec2(hw * 0.28, frameLen * 0.25 * 0.28);
      vec2 dq = abs(hq) - hb;
      float hole = smoothstep(0.002, -0.002, max(dq.x, dq.y));
      col = mix(col, bg * 2.2 + 0.05, hole);
    }
  }
  return vec4(mix(src, col, uAmount), 1.0);
}
