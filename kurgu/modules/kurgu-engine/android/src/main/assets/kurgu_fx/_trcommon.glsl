// Geçiş ortak tanımları (_transitions.glsl ve _transitions2.glsl kullanır).
// A her zaman opaktır (siyah zemin üzerine); B'nin alfası geçişi oluşturur.
uniform vec4 uTr;  // tür, ilerleme (0..1), rol (0 = A giden, 1 = B gelen), tohum
uniform vec4 uTrP; // geçişe özgü parametreler (0..1): x = kenar yumuşaklığı

vec4 opaque(vec4 c) { return vec4(c.rgb * c.a, 1.0); }

// Geçişte klipler ana izdeki gibi kanvasla sınırlıdır ("doldur" modunda katman taşar).
vec4 clipC(vec2 q) {
  vec2 d = vec2(aspect(), 1.0) - abs(q);
  float k = clamp(min(d.x * uRes.x / (2.0 * aspect()), d.y * uRes.y * 0.5) + 0.5, 0.0, 1.0);
  return k <= 0.0 ? vec4(0.0) : layerColor(q) * vec4(1.0, 1.0, 1.0, k);
}

// 9 noktalı yönlü bulanıklık (katman rengi üzerinden)
vec4 blurDir(vec2 q, vec2 dir) {
  vec4 acc = vec4(0.0);
  // Piksel başına titreşim: az örnekle kopyalanma (ghosting) yerine yumuşak bulanıklık
  float j = hash12(gl_FragCoord.xy) - 0.5;
  for (int i = 0; i < 12; i++) {
    float t = (float(i) + 0.5 + j) / 12.0 - 0.5;
    vec4 c = clipC(q + dir * t);
    acc += vec4(c.rgb * c.a, c.a);
  }
  acc /= 12.0;
  return vec4(acc.rgb / max(acc.a, 1e-4), acc.a);
}

// Merkeze doğru yakınlaşma bulanıklığı
vec4 blurZoom(vec2 q, float k) {
  vec4 acc = vec4(0.0);
  float j = hash12(gl_FragCoord.xy);
  for (int i = 0; i < 12; i++) {
    float s = 1.0 - k * (float(i) + j) / 12.0;
    vec4 c = clipC(q * s);
    acc += vec4(c.rgb * c.a, c.a);
  }
  acc /= 12.0;
  return vec4(acc.rgb / max(acc.a, 1e-4), acc.a);
}

// Gelen klibin görünürlüğü (0..1) ile birlikte döner; giden klip opak döner.
vec4 roleOut(vec4 a, vec4 b, float m) {
  if (uTr.z < 0.5) return opaque(a);
  return vec4(b.rgb, b.a * clamp(m, 0.0, 1.0));
}

