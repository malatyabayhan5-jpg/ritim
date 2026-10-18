// Kurgu efekt çekirdeği (GLSL ES 1.00). Android (Media3) ve efekt laboratuvarı
// (WebGL) aynı dosyayı kullanır. Her efekt dosyası `vec4 fx(vec2 uv)` tanımlar.
// Koordinatlar: uv (0,0) sol alt, (1,1) sağ üst. Renkler: BT.709 SDR (gama kodlu).
precision highp float;

uniform sampler2D uTex;
uniform vec2 uRes;      // çıktı boyutu (piksel)
uniform float uTime;    // efekt başlangıcından beri saniye
uniform float uDur;     // efekt süresi (sn), bilinmiyorsa 0
uniform float uAmount;  // yoğunluk 0..1
uniform vec4 uP0;       // efekte özgü parametreler (0..1)
uniform vec4 uP1;
uniform float uSeed;
varying vec2 vUv;

const float PI = 3.14159265;
const float TAU = 6.28318531;
const float GOLDEN = 2.39996323;

float aspect() { return uRes.x / uRes.y; }
vec2 px() { return 1.0 / uRes; }
vec4 tex(vec2 uv) { return texture2D(uTex, clamp(uv, 0.0, 1.0)); }
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

float hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }

float vnoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0; float a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return v;
}
// Yumuşak 1B gürültü (kamera sarsıntısı vb. için)
float snoise1(float t) { float i = floor(t); float f = fract(t); f = f * f * (3.0 - 2.0 * f); return mix(hash11(i), hash11(i + 1.0), f) * 2.0 - 1.0; }

vec3 screen(vec3 a, vec3 b) { return 1.0 - (1.0 - a) * (1.0 - b); }
vec3 softLight(vec3 a, vec3 b) { return mix(2.0 * a * b + a * a * (1.0 - 2.0 * b), sqrt(a) * (2.0 * b - 1.0) + 2.0 * a * (1.0 - b), step(0.5, b)); }
vec3 overlay(vec3 a, vec3 b) { return mix(2.0 * a * b, 1.0 - 2.0 * (1.0 - a) * (1.0 - b), step(0.5, a)); }
float easeInOut(float t) { t = clamp(t, 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
vec3 hsv2rgb(vec3 c) { vec3 p = abs(fract(c.xxx + vec3(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0); return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y); }
vec2 rot2(vec2 p, float a) { float c = cos(a); float s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }
// En-boy oranı düzeltilmiş merkez koordinatı (kısa kenar -0.5..0.5)
vec2 centered(vec2 uv) { vec2 p = uv - 0.5; p.x *= aspect(); return p; }
vec2 uncentered(vec2 p) { p.x /= aspect(); return p + 0.5; }
