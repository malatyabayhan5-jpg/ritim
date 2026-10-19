// Kurgu katman çizimi (resim içinde resim, üst video/görsel katmanı).
// Girdi: katmanın kendi karesi (kaynak boyutunda). Çıktı: kanvas boyutunda,
// katmanın dışı tamamen saydam bir kare. Media3 birleştiricisi bu kareyi
// alt katmanların üzerine alfa karışımıyla koyar (karıştırılmamış alfa).
// Android (LayerFx.kt) ve efekt laboratuvarı (lab.cjs layer) aynı dosyayı kullanır.
// Kaynak sırası: _common + _layer + _transitions + _layer_main.
//
// Koordinatlar: kanvas q (x: -A..A, y: -1..1, y yukarı; A = en/boy). Konum uniform'ları
// NDC'dir (-1..1). Yerel katman koordinatı l: (-1..1)^2.
uniform vec2 uSrcRes;   // katman kaynağının boyutu (piksel)
uniform vec4 uXf;       // x, y (NDC), ölçek (kanvasa sığdırılmış boyuta göre), döndürme (radyan, saat yönü)
uniform vec4 uLay;      // opaklık, yatay çevirme (0/1), dikey çevirme (0/1), -
uniform vec4 uCrop;     // kaynak kırpma: x0, y0, x1, y1 (0..1, y yukarı)
uniform vec4 uMaskA;    // tür (0 yok, 1 dikdörtgen, 2 elips, 3 doğrusal, 4 bant, 5 kalp, 6 yıldız), merkez x, merkez y, açı (radyan)
uniform vec4 uMaskB;    // yarı genişlik, yarı yükseklik (katman yarı yüksekliği birimi), yumuşaklık, köşe yuvarlama (0..1)
uniform float uMaskInv; // 1 = maskeyi ters çevir
uniform vec4 uKey;      // anahtar renk r, g, b, etkin (0/1)
uniform vec4 uKeyP;     // tolerans, kenar yumuşaklığı, taşma bastırma (0..1), -
uniform vec4 uLay2;     // kaynak döndürme (çeyrek tur, saat yönü 0..3), sığdırma (0 sığdır, 1 doldur), -, -

vec2 chromaOf(vec3 c) {
  float y = luma(c);
  return vec2((c.b - y) / 1.8556, (c.r - y) / 1.5748);
}

vec3 fromYC(float y, vec2 cc) {
  float r = y + 1.5748 * cc.y;
  float b = y + 1.8556 * cc.x;
  float g = (y - 0.2126 * r - 0.0722 * b) / 0.7152;
  return vec3(r, g, b);
}

float sdRoundBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

// Kalp eğrisi (x²+y²-1)³ - x²y³ = 0; uzaklık ≈ f / |∇f|
float sdHeart(vec2 p) {
  p.y += 0.15;
  p *= 1.25;
  float a = dot(p, p) - 1.0;
  float f = a * a * a - p.x * p.x * p.y * p.y * p.y;
  vec2 g = vec2(6.0 * p.x * a * a - 2.0 * p.x * p.y * p.y * p.y, 6.0 * p.y * a * a - 3.0 * p.x * p.x * p.y * p.y);
  return f / max(length(g), 1e-3) / 1.25;
}

// Beş köşeli yıldız: köşeler arası düz kenarlar (kutupsal, kenara dik uzaklık)
float sdStar(vec2 p) {
  float n = 5.0;
  float inner = 0.45;
  float a = atan(p.x, p.y);
  float seg = TAU / n;
  float k = mod(a + seg * 0.5, seg) - seg * 0.5; // en yakın köşeye göre açı
  vec2 q = length(p) * vec2(cos(k), abs(sin(k)));
  // Kenar: (1,0) köşesinden (inner*cos(seg/2), inner*sin(seg/2)) iç köşesine
  vec2 tip = vec2(1.0, 0.0);
  vec2 inn = inner * vec2(cos(seg * 0.5), sin(seg * 0.5));
  vec2 e = inn - tip;
  vec2 w = q - tip;
  float h = clamp(dot(w, e) / dot(e, e), 0.0, 1.0);
  float d = length(w - e * h);
  float s = sign(e.x * w.y - e.y * w.x);
  return -d * s;
}

float maskAlpha(vec2 l, float aspL, float aaUnit) {
  float type = uMaskA.x;
  if (type < 0.5) return 1.0;
  vec2 m = vec2(l.x * aspL, l.y) - vec2(uMaskA.y * aspL, uMaskA.z);
  m = rot2(m, uMaskA.w);
  vec2 hs = max(uMaskB.xy, vec2(1e-3));
  float d;
  if (type < 1.5) d = sdRoundBox(m, hs, uMaskB.w * min(hs.x, hs.y));
  else if (type < 2.5) d = (length(m / hs) - 1.0) * min(hs.x, hs.y);
  else if (type < 3.5) d = m.y;
  else if (type < 4.5) d = abs(m.y) - hs.y;
  else if (type < 5.5) d = sdHeart(m / hs.x) * hs.x;
  else d = sdStar(m / hs.x) * hs.x;
  float f = max(uMaskB.z, aaUnit);
  float a = 1.0 - smoothstep(-f, f, d);
  return uMaskInv > 0.5 ? 1.0 - a : a;
}

/** Kanvas noktası q'da katmanın rengi ve alfası (maske, chroma ve opaklık dahil). */
vec4 layerColor(vec2 q) {
  float A = aspect();
  vec2 crop = max(uCrop.zw - uCrop.xy, vec2(1e-4));
  float srcAspect = (uSrcRes.x * crop.x) / max(1.0, uSrcRes.y * crop.y);
  float turns = floor(uLay2.x + 0.5);
  if (mod(turns, 2.0) > 0.5) srcAspect = 1.0 / srcAspect;
  // Kanvasa sığdırılmış (veya doldurulmuş) yarı boyut (yatay birim: kanvas yarı yüksekliği)
  vec2 ext;
  if (uLay2.y > 0.5) ext = srcAspect > A ? vec2(srcAspect, 1.0) : vec2(A, A / srcAspect);
  else ext = srcAspect > A ? vec2(A, A / srcAspect) : vec2(srcAspect, 1.0);
  ext *= max(uXf.z, 1e-4);
  vec2 d = q - vec2(uXf.x * A, uXf.y);
  // Saat yönünde döndürülmüş katmanın yerel koordinatı: noktayı ters yönde döndür
  vec2 l = rot2(d, uXf.w) / ext;
  // Kenar yumuşatma: bir çıktı pikselinin yerel birimdeki boyu
  float pxL = 2.0 / (uRes.y * min(ext.x, ext.y));
  vec2 edge = (1.0 - abs(l)) / pxL;
  float inside = clamp(min(edge.x, edge.y) + 0.5, 0.0, 1.0);
  if (inside <= 0.0) return vec4(0.0);
  vec2 luv = l * 0.5 + 0.5;
  // Kaynak döndürme (ana izdeki 90° adımlı döndürmeyle aynı): görüntü saat yönünde döner
  vec2 suv = luv;
  if (turns > 0.5 && turns < 1.5) suv = vec2(1.0 - luv.y, luv.x);
  else if (turns > 1.5 && turns < 2.5) suv = 1.0 - luv;
  else if (turns > 2.5) suv = vec2(luv.y, 1.0 - luv.x);
  if (uLay.y > 0.5) suv.x = 1.0 - suv.x;
  if (uLay.z > 0.5) suv.y = 1.0 - suv.y;
  vec4 src = texture2D(uTex, clamp(uCrop.xy + suv * crop, 0.0, 1.0));
  vec3 c = src.rgb;
  float a = src.a * inside;
  if (uKey.w > 0.5) {
    vec2 kc = chromaOf(uKey.rgb);
    vec2 cc = chromaOf(c);
    float tol = mix(0.02, 0.4, uKeyP.x);
    float soft = mix(0.005, 0.3, uKeyP.y);
    a *= smoothstep(tol, tol + soft, distance(cc, kc));
    // Taşma bastırma: anahtar renk yönündeki renk bileşeni azaltılır (parlaklık korunur)
    float kl = length(kc);
    if (kl > 1e-3) {
      vec2 kd = kc / kl;
      cc -= kd * max(dot(cc, kd), 0.0) * uKeyP.z;
      c = clamp(fromYC(luma(c), cc), 0.0, 1.0);
    }
  }
  a *= maskAlpha(l, ext.x / ext.y, pxL);
  a *= clamp(uLay.x, 0.0, 1.0);
  return vec4(c, a);
}
