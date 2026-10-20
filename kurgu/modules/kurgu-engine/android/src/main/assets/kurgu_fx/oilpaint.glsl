// Yağlı boya: görüntü, titreşimli bir ızgaraya yerleşmiş yönlü fırça
// darbeleriyle yeniden boyanır. Her darbe, merkezindeki rengi alan eliptik bir
// lekedir; yönü bölgesel olarak tutarlı bir alandan gelir. Üst üste binen
// darbelerden önceliği yüksek olan görünür. Darbenin içinde kıl izleri, kenarında
// kabarık boya (empasto) ışığı; aralarda alt boya ve tuval dokusu kalır.
// P0: x=fırça boyutu  y=tuval dokusu  z=doygunluk
//
// İki geçiş: darbe renkleri yumuşatılmış yarım çözünürlüklü kopyadan okunur.
vec4 prepass(vec2 uv) {
  vec2 d = px() * 1.5;
  return vec4((tex(uv).rgb * 2.0 + tex(uv + d).rgb + tex(uv - d).rgb + tex(uv + vec2(d.x, -d.y)).rgb + tex(uv - vec2(d.x, -d.y)).rgb) / 6.0, 1.0);
}
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  float cells = mix(90.0, 30.0, uP0.x);
  vec2 p = centered(uv) * cells;
  vec2 ip = floor(p);
  vec3 col = pre(uv).rgb * 0.92;          // alt boya
  // Yön alanı: yavaş değişen gürültü (piksel başına bir kez); darbeler
  // komşularıyla aynı yöne yatar
  float ang0 = vnoise(p * 0.09 + 5.0) * 5.0;
  float bestPri = -1.0;
  vec2 local = vec2(0.0);
  vec2 bestId = vec2(0.0);
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 id = ip + vec2(float(i), float(j));
      vec2 h = hash22(id + uSeed * 11.0);
      vec2 c = id + h;
      float ang = ang0 + (h.x - 0.5) * 0.5;
      vec2 d = rot2(p - c, -ang);
      vec2 hs = vec2(mix(1.0, 1.6, h.y), mix(0.42, 0.6, h.x));
      vec2 q = d / hs;
      float e = dot(q, q);
      float pri = hash12(id + 1.7);
      if (e < 1.0 && pri > bestPri) {
        bestPri = pri;
        local = q;
        bestId = id;
        col = pre(uncentered(c / cells)).rgb;
      }
    }
  }
  if (bestPri >= 0.0) {
    // Kıl izleri: darbe boyunca uzanan ince çizgiler
    float bristle = vnoise(vec2(local.x * 1.2, local.y * 9.0) + bestId * 3.1);
    col *= 0.9 + 0.2 * bristle;
    // Empasto: darbe kenarında kabarık boya, üstten ışık alır
    float e = dot(local, local);
    col += smoothstep(0.55, 0.95, e) * 0.09 * sign(local.y + 0.15);
    col *= 1.0 - smoothstep(0.85, 1.0, e) * 0.12;
  }
  col = mix(vec3(luma(col)), col, mix(0.95, 1.4, uP0.z));
  // Tuval örgüsü
  vec2 cp = uv * uRes / max(2.0, min(uRes.x, uRes.y) / 360.0);
  float weave = sin(cp.x * 1.7) * sin(cp.y * 1.7) * 0.5;
  col *= 1.0 + weave * 0.08 * uP0.y;
  return vec4(mix(src, col, uAmount), 1.0);
}
