// Karışım modlu görsel katmanı (BlendLayerFx.kt): kompozisyon karesinin (uBase) üzerine
// _layer.glsl ile yerleştirilen katman rengi (uTex) W3C "Compositing and Blending"
// formülleriyle karıştırılır; sonuç katmanın alfasıyla (maske, chroma, opaklık dahil)
// alttaki kareyle harmanlanır. Mod sırası src/model/photo.js BLEND_MODES ile aynıdır.
// Kaynak sırası: _common + _layer + _blend_main.
uniform sampler2D uBase;
uniform float uBlend;
uniform mat4 uCm;      // katmanın filtre/ayar renk matrisi (Media3 RgbMatrix düzeni: renk = uCm * vec4(rgb, 1))
uniform float uCmOn;   // 1 = matris uygulanır

float lumW(vec3 c) { return dot(c, vec3(0.3, 0.59, 0.11)); }

vec3 clipColor(vec3 c) {
  float l = lumW(c);
  float n = min(min(c.r, c.g), c.b);
  float x = max(max(c.r, c.g), c.b);
  if (n < 0.0) c = l + (c - l) * l / max(l - n, 1e-5);
  if (x > 1.0) c = l + (c - l) * (1.0 - l) / max(x - l, 1e-5);
  return c;
}

vec3 setLum(vec3 c, float l) { return clipColor(c + (l - lumW(c))); }

float softLight1(float b, float s) {
  if (s <= 0.5) return b - (1.0 - 2.0 * s) * b * (1.0 - b);
  float d = b <= 0.25 ? ((16.0 * b - 12.0) * b + 4.0) * b : sqrt(b);
  return b + (2.0 * s - 1.0) * (d - b);
}

// Bindirme: alttaki renge göre çarpma ya da perde (HardLight(s, b))
float overlay1(float b, float s) { return b <= 0.5 ? 2.0 * b * s : 1.0 - 2.0 * (1.0 - b) * (1.0 - s); }

vec3 blendRgb(vec3 b, vec3 s, float m) {
  if (m < 0.5) return s;                                   // normal
  if (m < 1.5) return b * s;                               // multiply
  if (m < 2.5) return b + s - b * s;                       // screen
  if (m < 3.5) return vec3(overlay1(b.r, s.r), overlay1(b.g, s.g), overlay1(b.b, s.b));
  if (m < 4.5) return min(b, s);                           // darken
  if (m < 5.5) return max(b, s);                           // lighten
  if (m < 6.5) return min(b + s, vec3(1.0));               // add
  if (m < 7.5) return abs(b - s);                          // difference
  if (m < 8.5) return vec3(softLight1(b.r, s.r), softLight1(b.g, s.g), softLight1(b.b, s.b));
  if (m < 9.5) return setLum(s, lumW(b));                  // color
  return setLum(b, lumW(s));                               // luminosity
}

void main() {
  vec2 q = vec2((vUv.x * 2.0 - 1.0) * aspect(), vUv.y * 2.0 - 1.0);
  vec4 base = texture2D(uBase, vUv);
  vec4 l = layerColor(q);
  if (uCmOn > 0.5) l.rgb = clamp((uCm * vec4(l.rgb, 1.0)).rgb, 0.0, 1.0);
  vec3 r = clamp(blendRgb(base.rgb, l.rgb, uBlend), 0.0, 1.0);
  gl_FragColor = vec4(mix(base.rgb, r, l.a), base.a);
}
