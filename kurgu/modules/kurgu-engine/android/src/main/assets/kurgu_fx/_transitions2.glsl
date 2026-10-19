// Geçiş paketi 2 (tür numarası >= 100). src/model/transitions-pack2.js ile eşleşir.
// trRender (_transitions.glsl) tanımadığı türleri buraya iletir.
// p: ilerleme 0..1, isB: gelen klip rolü, e: yumuşatılmış ilerleme, A: en/boy,
// uv: kanvas 0..1, s: kenar yumuşaklığı, mid: ortada 1 olan tepe.
//
// Kural: A (giden) rolü her zaman tüm kanvası kaplayan opak bir renk döndürür;
// B (gelen) rolünün alfası geçişi oluşturur. Bu paketteki klipler siyah zemin
// üzerine çizilmiş tam bir kare gibi davranır (t2frame): "sığdır" modundaki
// siyah bantlar da klibe aittir, böylece p = 1'de görüntü tam olarak B olur.
// Tüm geçişler özgün çizimdir.

float t2pw() { return 2.0 / uRes.y; } // bir pikselin kanvas birimindeki boyu
vec3 t2frame(vec2 q) { vec4 c = clipC(q); return c.rgb * c.a; } // siyah zemin üzerine klip
// Yarı boyutu hs olan dikdörtgenin içi (kenar yumuşatmalı)
float t2box(vec2 q, vec2 hs) { vec2 d = hs - abs(q); return clamp(min(d.x, d.y) / t2pw() + 0.5, 0.0, 1.0); }
// Rol çıktısı: A opak, B maske alfasıyla
vec4 t2out(vec3 c, float m, bool isB) { return isB ? vec4(c, clamp(m, 0.0, 1.0)) : vec4(c, 1.0); }
// Uçlarda kesinlik: p = 0'da yalnızca A, p = 1'de yalnızca B
float t2ends(float m, float p) { return mix(clamp(m, 0.0, 1.0) * smoothstep(0.0, 0.02, p), 1.0, smoothstep(0.98, 1.0, p)); }
// Kanvas dışına taşan örneklemeyi aynalayarak içeri katla (bulanık dönüş/çarpıtma için)
vec2 t2mirror(vec2 q, float A) {
  vec2 h = vec2(A, 1.0);
  vec2 m = mod(q + h, 4.0 * h);
  m = mix(m, 4.0 * h - m, step(2.0 * h, m));
  return clamp(m - h, -h + t2pw(), h - t2pw()); // kenarda yumuşatma bandına düşmesin
}
// Gelen kenarın gidenin üzerine düşürdüğü yumuşak gölge (d: kenara uzaklık, A tarafında > 0)
float t2shadow(float d, float p) {
  return 1.0 - 0.32 * exp(-max(d, 0.0) / 0.05) * smoothstep(0.0, 0.06, p) * smoothstep(1.0, 0.94, p);
}
// Zıplama eğrisi (0..1, sonda 1)
float t2bounce(float t) {
  t = clamp(t, 0.0, 1.0);
  if (t < 0.3636) return 7.5625 * t * t;
  if (t < 0.7273) { t -= 0.5454; return 7.5625 * t * t + 0.75; }
  if (t < 0.9091) { t -= 0.8182; return 7.5625 * t * t + 0.9375; }
  t -= 0.9545;
  return 7.5625 * t * t + 0.984375;
}
// Jöle eğrisi: hızlanarak 1'e varır, aynı hızla aşıp sönümlü salınımla oturur
float t2spring(float t) {
  t = clamp(t, 0.0, 1.0);
  float T = 0.45;
  if (t < T) { float u = t / T; return 2.0 * u * u - u * u * u; } // varışta hız 1/T
  float tau = t - T;
  float x = 1.0 + (1.0 / T / 12.0) * exp(-6.0 * tau) * sin(12.0 * tau);
  return mix(x, 1.0, smoothstep(0.85, 1.0, t));
}

// Küp yüzü: düşey eksen çevresinde th kadar dönmüş küpün bir yüzü (face 0 giden, 1 gelen).
// q.x dönüş yönündeki eksen; hw: yüzün o yöndeki yarı boyu (küp yarı derinliği), hh: diğer yarı boy.
// Dönüş: (yerel x, yerel y, kapsama, ışık)
vec4 t2cubeFace(vec2 q, float th, float hw, float hh, float face, float push) {
  float D = 4.0;
  vec3 o = vec3(0.0, 0.0, -D);
  vec3 d = vec3(q, D);
  float sn = sin(th);
  float cs = cos(th);
  vec3 n = face < 0.5 ? vec3(-sn, 0.0, -cs) : vec3(cs, 0.0, -sn);
  vec3 u = face < 0.5 ? vec3(cs, 0.0, -sn) : vec3(sn, 0.0, cs);
  vec3 c = vec3(0.0, 0.0, hw + push) + n * hw;
  float den = dot(d, n);
  if (den > -1e-4) return vec4(0.0);
  vec3 P = o + d * (dot(c - o, n) / den);
  vec2 l = vec2(dot(P - c, u), P.y);
  return vec4(l, t2box(l, vec2(hw, hh) + 0.5 * t2pw()), mix(0.42, 1.0, clamp(-n.z, 0.0, 1.0)));
}

// Düşey eksen çevresinde dönen tek düzlem (kart). Dönüş: (yerel x, yerel y, kapsama, ön yüz 1 / arka yüz 0)
vec4 t2card(vec2 q, float th, float hw, float hh, float push) {
  float D = 4.0;
  vec3 o = vec3(0.0, 0.0, -D);
  vec3 d = vec3(q, D);
  vec3 n = vec3(-sin(th), 0.0, -cos(th));
  vec3 u = vec3(cos(th), 0.0, -sin(th));
  vec3 c = vec3(0.0, 0.0, push);
  float den = dot(d, n);
  if (abs(den) < 1e-5) return vec4(0.0);
  float t = dot(c - o, n) / den;
  if (t <= 0.0) return vec4(0.0);
  vec3 P = o + d * t;
  vec2 l = vec2(dot(P - c, u), P.y);
  float front = den < 0.0 ? 1.0 : 0.0;
  if (front < 0.5) l.x = -l.x; // arka yüz aynalanmadan okunur
  return vec4(l, t2box(l, vec2(hw, hh)), front);
}

// Kapı kanadı: x = -A menteşesinden açılan sol kanat (sağ kanat için q.x aynalanır).
// Dönüş: (kaynak x, kaynak y, kapsama, -)
vec3 t2door(vec2 q, float phi, float A) {
  float D = max(2.2, A + 0.6); // yakın kamera: belirgin perspektif
  vec3 o = vec3(0.0, 0.0, -D);
  vec3 d = vec3(q, D);
  vec3 u = vec3(cos(phi), 0.0, -sin(phi));
  vec3 n = vec3(-sin(phi), 0.0, -cos(phi));
  vec3 c = vec3(-A, 0.0, 0.0);
  float den = dot(d, n);
  if (abs(den) < 1e-5) return vec3(0.0);
  float t = dot(c - o, n) / den;
  if (t <= 0.0) return vec3(0.0);
  vec3 P = o + d * t;
  float lx = dot(P - c, u);
  return vec3(-A + lx, P.y, t2box(vec2(lx - 0.5 * A, P.y), vec2(0.5 * A + 0.5 * t2pw(), 1.0)));
}

// Açısal hareket bulanıklığı (aynalı örnekleme, piksel başına titreşim)
vec3 t2spin(vec2 q, float th, float span, float z, float A) {
  vec3 acc = vec3(0.0);
  float j = hash12(gl_FragCoord.xy);
  for (int i = 0; i < 10; i++) {
    float t = (float(i) + j) / 10.0 - 0.5;
    acc += t2frame(t2mirror(rot2(q, th + span * t) / z, A));
  }
  return acc / 10.0;
}

// Televizyon kapanışı: t = 0 tam görüntü, t = 1 tamamen kapalı (siyah)
vec3 t2tv(vec2 q, float t, float A) {
  float pw = t2pw();
  float sy = max(1.0 - smoothstep(0.0, 0.5, t), 1.5 * pw);
  float sx = max(1.0 - smoothstep(0.5, 0.82, t), 0.004);
  float fade = 1.0 - smoothstep(0.82, 1.0, t);
  float inside = t2box(q, vec2(A * sx, sy));
  vec3 c = t2frame(q / vec2(sx, sy));
  c = mix(c, vec3(1.0), smoothstep(0.15, 0.5, t));
  float lineK = smoothstep(0.3, 0.5, t) * fade;
  float gx = max(abs(q.x) - A * sx, 0.0);
  float glow = exp(-q.y * q.y / (sy * sy + 0.0006)) * exp(-gx * gx / 0.004) * lineK;
  return c * inside * fade + vec3(0.75, 0.88, 1.0) * glow * 0.9;
}

vec4 trRender2(vec2 q, float type, float p, bool isB, float e, float A, vec2 uv, float s, float mid) {
  float pw = t2pw();
  float w = max(s * 1.2, 1.5 * pw); // kenar yumuşaklığı (kanvas birimi)
  float R = length(vec2(A, 1.0));   // merkezden köşeye uzaklık

  // ================= Silme (ek) =================
  if (type == 100.0) { // yelpaze: üst ortadan iki yana simetrik süpürme
    float a = atan(abs(q.x), q.y); // 0 yukarı .. PI aşağı
    float d = ((e * 1.1 - 0.05) * PI - a) * max(length(q), 0.3);
    return t2out(t2frame(q), t2ends(smoothstep(-w, w, d), p), isB);
  }
  if (type == 101.0) { // sarmal: merkezden dışa üç turluk spiral
    float r = length(q);
    float a = fract(atan(q.x, q.y) / TAU + 1.0);
    float v = a + 3.0 * r / R; // 0..4
    float g = length(vec2(3.0 / R, 1.0 / (TAU * max(r, 1e-3))));
    float d = (e * 4.4 - 0.2 - v) / g;
    return t2out(t2frame(q), t2ends(smoothstep(-w, w, d), p), isB);
  }
  if (type == 102.0) { // dalgalı silme: soldan sağa dalgalanan kenar
    float amp = 0.11;
    float x0 = mix(-A - amp - 2.0 * w, A + amp + 2.0 * w, e);
    float ph1 = q.y * 5.0 + p * 9.0;
    float ph2 = q.y * 11.0 - p * 6.0 + 1.3;
    float edge = x0 + amp * (0.6 * sin(ph1) + 0.4 * sin(ph2));
    float slope = amp * (3.0 * cos(ph1) + 4.4 * cos(ph2));
    float d = (edge - q.x) / sqrt(1.0 + slope * slope);
    vec3 c = t2frame(q);
    if (!isB) return vec4(c * t2shadow(-d, p), 1.0);
    c = mix(c, vec3(1.0), 0.22 * exp(-d * d / 0.0006) * mid);
    return vec4(c, t2ends(smoothstep(-w, w, d), p));
  }
  if (type == 103.0) { // zikzak: aşağıdan yukarı dişli kenar
    float h = 0.09;
    float P = 2.0 * A / 6.0;
    float tri = abs(fract((q.x + p * P) / P) * 2.0 - 1.0);
    float y0 = mix(-1.0 - 2.0 * h - 2.0 * w, 1.0 + 2.0 * w, e);
    float d = (y0 + h * 2.0 * tri - q.y) / sqrt(1.0 + pow(4.0 * h / P, 2.0));
    vec3 c = t2frame(q);
    if (!isB) return vec4(c * t2shadow(-d, p), 1.0);
    return vec4(c, t2ends(smoothstep(-w, w, d), p));
  }
  if (type == 104.0) { // çapraz jaluzi: eğik çıtalar ortalarından açılır, köşeden köşeye dalga
    float W = 0.26;
    float u = dot(q, vec2(0.70710678));
    float f = abs(fract(u / W) - 0.5) * W; // çıta orta çizgisine uzaklık
    float along = dot(q, vec2(0.70710678, -0.70710678)) / ((A + 1.0) * 0.70710678) * 0.5 + 0.5;
    float local = easeInOut(clamp((e - along * 0.4) / 0.6, 0.0, 1.0));
    float d = local * (0.5 * W + 2.0 * pw) - pw - f;
    return t2out(t2frame(q), t2ends(smoothstep(-pw, pw, d), p), isB);
  }
  if (type == 105.0) { // yumuşak süpürme: geniş, hafif aydınlık eğimli geçiş bandı
    vec2 n = normalize(vec2(1.0, 0.35));
    float L = dot(vec2(A, 1.0), abs(n));
    float band = 0.7;
    float c0 = mix(-L - band, L + band, e);
    float x = dot(q, n) - c0;
    float m = 1.0 - smoothstep(-0.5 * band, 0.5 * band, x);
    vec3 c = t2frame(q);
    c = screen(c, vec3(1.0, 0.97, 0.92) * 0.14 * exp(-x * x / (band * band * 0.12)) * mid);
    return t2out(c, t2ends(m, p), isB);
  }

  // ================= Şekil =================
  if (type == 110.0) { // benekler: merkezden dışa büyüyen daireler
    float cs = 0.25;
    vec2 g = q / cs + 0.5;
    vec2 id = floor(g);
    vec2 f = (fract(g) - 0.5) * cs;
    vec2 cc = id * cs;
    float delay = length(cc) / R * 0.55 + hash12(id + 3.1) * 0.1;
    float local = easeInOut(clamp((e - delay) / 0.35, 0.0, 1.0));
    float rad = mix(-2.0 * pw, cs * 0.75, local);
    float m = 1.0 - smoothstep(rad - pw, rad + pw, length(f));
    return t2out(t2frame(q), t2ends(m, p), isB);
  }
  if (type == 111.0) { // petek: altıgenler soldan alttan sağa üste doğru büyüyerek belirir
    float hr = 0.17;
    vec2 rr = vec2(1.0, 1.7320508);
    vec2 h = rr * 0.5;
    vec2 p0 = q / hr;
    vec2 a = mod(p0, rr) - h;
    vec2 b = mod(p0 - h, rr) - h;
    vec2 gv = dot(a, a) < dot(b, b) ? a : b;
    vec2 hid = floor((p0 - gv) * 2.0 + 0.5); // hücre kimliği (kayan nokta hatasına dayanıklı)
    vec2 cc = hid * 0.5 * hr;
    float hd = max(abs(gv.x), abs(gv.x) * 0.5 + abs(gv.y) * 0.8660254);
    vec2 n = normalize(vec2(1.0, 1.0));
    float delay = clamp(dot(cc, n) / dot(vec2(A, 1.0), n) * 0.5 + 0.5, 0.0, 1.0) * 0.6 + hash12(hid + 1.7) * 0.12;
    float local = clamp((e - delay) / 0.28, 0.0, 1.0);
    float k = easeInOut(local) * 1.04;
    float d = (0.5 * k - hd) * hr;
    vec3 c = t2frame(q);
    if (isB) c = mix(c, vec3(1.0), 0.25 * (1.0 - local)); // yeni beliren petek hafif parlar
    return t2out(c, t2ends(smoothstep(-pw, pw, d), p), isB);
  }
  if (type == 112.0) { // üçgenler: yukarıdan aşağı ağırlık merkezinden büyüyen üçgen ızgara
    float L = 0.32;
    vec2 sk = vec2(q.x - q.y * 0.57735027, q.y * 1.15470054) / L;
    vec2 cell = floor(sk);
    vec2 f = fract(sk);
    float up = step(1.0, f.x + f.y);
    vec2 g = mix(f, 1.0 - f, up);
    vec2 cs = cell + mix(vec2(1.0 / 3.0), vec2(2.0 / 3.0), up);
    vec2 cq = vec2(cs.x + cs.y * 0.5, cs.y * 0.8660254) * L;
    float delay = (0.5 - cq.y * 0.5) * 0.6 + hash12(cell * 1.3 + up * 7.0) * 0.1;
    float local = clamp((e - delay) / 0.3, 0.0, 1.0);
    float k = easeInOut(local) * 1.06;
    vec2 gg = vec2(1.0 / 3.0) + (g - vec2(1.0 / 3.0)) / max(k, 1e-3);
    float mg = min(min(gg.x, gg.y), 1.0 - gg.x - gg.y) * k * L * 0.8660254;
    float m = k < 1e-3 ? 0.0 : smoothstep(-pw, pw, mg);
    return t2out(t2frame(q), t2ends(m, p), isB);
  }
  if (type == 113.0) { // X açılış: kanvas köşegenlerinden genişleyen çarpı
    float d1 = abs(q.x - q.y * A) / R;
    float d2 = abs(q.x + q.y * A) / R;
    float maxD = A / R;
    float d = e * (maxD + 2.0 * w) - w - min(d1, d2);
    return t2out(t2frame(q), t2ends(smoothstep(-w, w, d), p), isB);
  }
  if (type == 114.0) { // diyafram: altı kanatlı objektif kapanır, gelen klip açılırken belirir
    float t = p < 0.5 ? p * 2.0 : (1.0 - p) * 2.0; // 0 açık .. 1 kapalı
    float k = easeInOut(t);
    float Ri = mix(R * 1.02 + 0.06, 0.0, k);
    vec2 pr = rot2(q, k * 0.9);
    float a = atan(pr.y, pr.x);
    float seg = TAU / 6.0;
    float aa = mod(a + seg * 0.5, seg) - seg * 0.5;
    float r = length(pr);
    float hd = r * cos(aa); // altıgen kenarına dik uzaklık
    float hole = 1.0 - smoothstep(Ri - pw, Ri + pw, hd);
    // Kanatlar: koyu metal, hafif dönen ışık, kanat kenar çizgileri (altıgen kenarlarının uzantısı)
    float sheen = 0.5 + 0.5 * cos(a * 6.0 + log(max(r, 1e-3)) * 3.0 + k * 2.0);
    vec3 blade = vec3(0.085, 0.09, 0.1) + vec3(0.07, 0.075, 0.085) * sheen * smoothstep(1.6, 0.0, r);
    float lines = 0.0;
    for (int i = 0; i < 6; i++) {
      float an = float(i) * seg;
      vec2 nn = vec2(cos(an), sin(an));
      vec2 tt = vec2(-nn.y, nn.x);
      float dl = abs(dot(pr, nn) - Ri);
      float along = dot(pr, tt);
      lines = max(lines, (1.0 - smoothstep(0.0, 2.0 * pw, dl)) * step(Ri * 0.57735, along));
    }
    blade *= 1.0 - 0.6 * lines;
    if (!isB) return vec4(p < 0.5 ? mix(blade, t2frame(q), hole) : blade, 1.0);
    if (p < 0.5) return vec4(0.0);
    return vec4(mix(blade, t2frame(q), hole), 1.0);
  }
  if (type == 115.0) { // halkalar: içten dışa, yönü dönüşümlü dolan eş merkezli halkalar
    float bw = (R + 0.02) / 6.0;
    float u = length(q) / bw;
    float i = floor(u);
    float f = fract(u);
    float local = clamp((e - i / 6.0 * 0.5) / 0.5, 0.0, 1.0);
    float fill = easeInOut(local);
    float pos = mod(i, 2.0) < 0.5 ? f : 1.0 - f;
    float d = (fill * (1.0 + 4.0 * pw / bw) - 2.0 * pw / bw - pos) * bw;
    return t2out(t2frame(q), t2ends(smoothstep(-pw, pw, d), p), isB);
  }

  // ================= Perspektif (3B) =================
  if (type == 120.0 || type == 121.0) { // küp: sola (120) / yukarı (121) döner
    float th = e * PI * 0.5;
    bool vert = type == 121.0;
    vec2 qq = vert ? vec2(-q.y, q.x) : q;
    float hw = vert ? 1.0 : A;
    float hh = vert ? A : 1.0;
    vec4 f = t2cubeFace(qq, th, hw, hh, isB ? 1.0 : 0.0, mid * hw * 0.9);
    vec2 l = vert ? vec2(f.y, -f.x) : f.xy;
    vec3 c = t2frame(l) * f.w;
    return isB ? vec4(c, t2ends(f.z, p)) : vec4(c * f.z, 1.0);
  }
  if (type == 122.0 || type == 123.0) { // kart çevirme: yatay (122) / dikey (123)
    bool vert = type == 123.0;
    vec2 qq = vert ? vec2(q.y, q.x) : q;
    float hw = vert ? 1.0 : A;
    float hh = vert ? A : 1.0;
    float th = e * PI;
    vec4 f = t2card(qq, th, hw, hh, mid * 1.2);
    vec2 l = vert ? vec2(f.y, f.x) : f.xy;
    float lit = mix(0.45, 1.0, abs(cos(th)));
    vec3 c = t2frame(l) * lit;
    if (!isB) return vec4(c * f.z * f.w, 1.0);
    return vec4(c, t2ends(f.z * (1.0 - f.w), p));
  }
  if (type == 124.0) { // kapı: giden klip iki kanat olarak izleyiciye doğru açılır
    float phi = e * PI * 0.5;
    float sx = q.x < 0.0 ? 1.0 : -1.0; // sağ yarı sol kanada aynalanır
    vec3 dr = t2door(vec2(q.x * sx, q.y), phi, A);
    float cover = dr.z;
    float lit = mix(1.0, 0.45, e) * (1.0 - 0.25 * e * clamp((dr.x + A) / A, 0.0, 1.0)); // serbest kenar daha koyu
    if (!isB) return vec4(t2frame(vec2(dr.x * sx, dr.y)) * cover * lit, 1.0);
    float z = 1.14 - 0.14 * e; // arkadaki gelen klip hafifçe yaklaşır
    vec3 c = t2frame(q / z) * mix(0.55, 1.0, e);
    return vec4(c, t2ends(1.0 - cover, p));
  }
  if (type == 125.0) { // sayfa çevirme: sağ alt köşeden kalkan, arkası kâğıt renginde sayfa
    vec2 n = normalize(vec2(-1.0, 0.55));
    vec2 c0 = vec2(A, -1.0);
    float smax = max(max(dot(vec2(-2.0 * A, 2.0), n), dot(vec2(-2.0 * A, 0.0), n)), dot(vec2(0.0, 2.0), n));
    float d0 = e * (smax + 0.06);
    float sd = dot(q - c0, n);
    vec2 qr = q - 2.0 * (sd - d0) * n; // katlanma çizgisine göre yansıma
    float fd = sdRoundBox(qr, vec2(A, 1.0), 0.0);
    float beyond = smoothstep(-pw, pw, sd - d0);
    float flap = (1.0 - smoothstep(-pw, pw, fd)) * beyond;
    if (!isB) {
      float sh = (1.0 - smoothstep(0.0, 0.12, fd)) * beyond * (1.0 - flap);
      return vec4(t2frame(q) * (1.0 - 0.45 * sh * smoothstep(0.0, 0.05, p)), 1.0);
    }
    float lifted = 1.0 - beyond;
    float under = 1.0 - 0.5 * exp(-max(d0 - sd, 0.0) / 0.07) * smoothstep(1.0, 0.9, e);
    vec3 b = t2frame(q) * under;
    float x = sd - d0;
    vec3 paper = vec3(0.93, 0.92, 0.89) * (0.72 + 0.28 * smoothstep(0.0, 0.22, x)) * (1.0 - 0.12 * smoothstep(0.3, 1.2, x));
    return vec4(mix(b, paper, flap), t2ends(max(lifted, flap), p));
  }
  if (type == 126.0) { // döşeme çevirme: kareler köşegen sırayla dönerek gelen klibe döner
    float ts = 1.0 / 3.0;
    vec2 g = q / ts;
    vec2 id = floor(g);
    vec2 f = (fract(g) - 0.5) * ts;
    vec2 cc = (id + 0.5) * ts;
    float delay = clamp((cc.x / A + cc.y) * 0.25 + 0.5, 0.0, 1.0) * 0.62 + hash12(id + 4.2) * 0.08;
    float local = clamp((p - delay) / 0.3, 0.0, 1.0);
    float th = easeInOut(local) * PI;
    float cs = cos(th);
    float hw = ts * 0.5;
    float lx = f.x / max(abs(cs), 1e-3);
    // Perspektif: yakın kenar tam boy, uzak kenar kısalır (hücre dışına taşmaz)
    float persp = 1.0 - 0.28 * sin(th) * (0.5 - 0.5 * clamp(lx / hw, -1.0, 1.0) * sign(cs + 1e-4));
    float ly = f.y / persp;
    float cover = t2box(vec2(lx * abs(cs), ly), vec2(hw * abs(cs), hw) + pw);
    vec3 c = t2frame(cc + vec2(lx, ly)) * mix(0.45, 1.0, abs(cs));
    bool backSide = th > PI * 0.5;
    if (!isB) return vec4(backSide ? vec3(0.0) : c * cover, 1.0);
    return vec4(c, backSide ? t2ends(cover, p) : 0.0);
  }
  if (type == 127.0) { // akordeon: giden klip yukarı doğru katlanarak toplanır
    float H = 2.0 * (1.0 - e);
    float bottom = 1.0 - H;
    float N = 6.0;
    float sinPhi = sqrt(max(1.0 - H * H * 0.25, 0.0));
    float t = (1.0 - q.y) / max(H, 1e-4) * N;
    float i = floor(t);
    float f = fract(t);
    float even = mod(i, 2.0) < 0.5 ? 1.0 : 0.0;
    float depth = mix(1.0 - f, f, even); // sırta göre derinlik (0 sırt, 1 vadi)
    float xs = 1.0 - 0.1 * sinPhi * depth;
    vec2 src = vec2(q.x / xs, 1.0 - t * 2.0 / N);
    float lit = mix(1.0, mix(0.5, 0.95, even), sinPhi) * (1.0 - 0.35 * sinPhi * pow(abs(2.0 * f - 1.0), 6.0));
    float cover = smoothstep(-pw, pw, q.y - bottom) * t2box(vec2(q.x / xs, 0.0), vec2(A, 2.0));
    if (!isB) return vec4(t2frame(src) * lit * cover, 1.0);
    float sh = 1.0 - 0.45 * exp(-max(bottom - q.y, 0.0) / 0.06) * sinPhi * smoothstep(1.0, 0.85, e);
    return vec4(t2frame(q) * sh, t2ends(1.0 - cover, p));
  }

  // ================= Hareket =================
  if (type == 130.0) { // dörde bölün: giden klip dört parçaya ayrılıp köşelere kayar
    vec2 off = vec2(A, 1.0) * easeInOut(p) * 1.03;
    vec2 sg = vec2(q.x < 0.0 ? -1.0 : 1.0, q.y < 0.0 ? -1.0 : 1.0);
    vec2 dd = abs(q) - off;
    float cover = clamp(min(dd.x, dd.y) / pw + 0.5, 0.0, 1.0);
    if (!isB) return vec4(t2frame(q - sg * off) * cover, 1.0);
    float sh = 1.0 - 0.4 * exp(-max(-min(dd.x, dd.y), 0.0) / 0.04) * mid;
    return vec4(t2frame(q / (1.12 - 0.12 * e)) * sh, t2ends(1.0 - cover, p));
  }
  if (type == 131.0) { // zıplayarak düşüş: gelen klip yukarıdan düşer ve seker
    float y = 2.0 * (1.0 - t2bounce(p));
    vec2 src = q - vec2(0.0, y);
    if (!isB) {
      float dist = (y - 1.0) - q.y; // gelenin alt kenarının altı
      float sh = exp(-max(dist, 0.0) / 0.1) * step(0.0, dist) * 0.45 * smoothstep(0.0, 0.05, p) * (1.0 - smoothstep(0.9, 1.0, p));
      return vec4(t2frame(q) * (1.0 - sh), 1.0);
    }
    return vec4(t2frame(src), t2ends(t2box(src, vec2(A, 1.0) + 0.5 * pw), p));
  }
  if (type == 132.0) { // jöle: gelen klip sağdan iter, aşıp esneyerek yerine oturur
    float x = t2spring(p);
    float Lx = A - 2.0 * A * x;
    float Rx = max(Lx + 2.0 * A, A);
    vec2 srcB = vec2(-A + (q.x - Lx) / (Rx - Lx) * 2.0 * A, q.y);
    if (!isB) return vec4(t2frame(vec2(q.x - Lx + A, q.y)), 1.0);
    float cover = clamp((q.x - Lx) / pw + 0.5, 0.0, 1.0);
    return vec4(t2frame(srcB), t2ends(cover, p));
  }
  if (type == 133.0) { // yer değiştirme: iki kart derinlikte yer değiştirir
    float k = sin(PI * e);
    float sc = 1.0 - 0.27 * k;
    float rad = 0.07 * k;
    vec2 cA = vec2(-A * k, 0.0);
    vec2 cB = vec2(A * k, 0.0);
    float dA = sdRoundBox((q - cA) / sc, vec2(A, 1.0), rad / sc) * sc;
    float dB = sdRoundBox((q - cB) / sc, vec2(A, 1.0), rad / sc) * sc;
    float mA = 1.0 - smoothstep(-pw, pw, dA);
    float mB = 1.0 - smoothstep(-pw, pw, dB);
    float back = 1.0 - 0.3 * k;
    if (!isB) {
      vec3 bg = vec3(0.045) * (1.0 - 0.7 * (1.0 - smoothstep(0.0, 0.18, min(dA, dB))));
      vec3 ca = t2frame((q - cA) / sc) * (p < 0.5 ? 1.0 : back);
      return vec4(mix(bg, ca, mA), 1.0);
    }
    vec3 cb = t2frame((q - cB) / sc) * (p < 0.5 ? back : 1.0);
    return vec4(cb, t2ends(p < 0.5 ? mB * (1.0 - mA) : mB, p));
  }
  if (type == 134.0) { // iç içe şeritler: yatay şeritler sırayla zıt yönlere itilir
    float N = 8.0;
    float i = clamp(floor(uv.y * N), 0.0, N - 1.0);
    float dir = mod(i, 2.0) < 0.5 ? 1.0 : -1.0;
    float local = clamp((p - i / (N - 1.0) * 0.3) / 0.7, 0.0, 1.0);
    float k = easeInOut(local);
    vec2 srcA = q + vec2(dir * 2.0 * A * k, 0.0);
    vec2 srcB = q + vec2(dir * 2.0 * A * (k - 1.0), 0.0);
    if (!isB) return vec4(t2frame(srcA), 1.0);
    return vec4(t2frame(srcB), t2ends(t2box(srcB, vec2(A + 0.5 * pw, 2.0)), p));
  }
  if (type == 135.0) { // film şeridi: uzaklaşır, şerit bir kare kayar, yakınlaşır
    float z = 1.0 - 0.3 * (smoothstep(0.0, 0.3, p) - smoothstep(0.7, 1.0, p));
    float pitch = 2.16;
    float yc = -pitch * easeInOut(clamp((p - 0.22) / 0.56, 0.0, 1.0));
    vec2 f = q / z + vec2(0.0, yc);
    vec2 fb = f + vec2(0.0, pitch);
    if (isB) return vec4(t2frame(fb), t2ends(t2box(fb, vec2(A, 1.0)), p));
    float filmW = A + 0.2;
    vec3 col = vec3(0.03);
    float onFilm = t2box(vec2(f.x, 0.0), vec2(filmW, 9.0));
    vec3 base = vec3(0.075, 0.06, 0.05);
    float hy = mod(f.y, 0.2) - 0.1;
    float hole = 1.0 - smoothstep(-pw, pw, sdRoundBox(vec2(abs(f.x) - (A + 0.105), hy), vec2(0.04, 0.055), 0.015));
    base = mix(base, vec3(0.82, 0.8, 0.74), hole);
    col = mix(col, base, onFilm);
    return vec4(mix(col, t2frame(f), t2box(f, vec2(A, 1.0))), 1.0);
  }
  if (type == 136.0) { // salınarak giriş: gelen klip sol alt köşesi çevresinde dönerek oturur
    float t = clamp(p, 0.0, 1.0) - 1.0;
    float x = 1.0 + 2.2 * t * t * t + 1.2 * t * t; // hafif aşmalı yumuşak çıkış
    float ang = (1.0 - x) * PI * 0.5;
    vec2 piv = vec2(-A, -1.0);
    vec2 src = piv + rot2(q - piv, ang);
    if (!isB) {
      vec2 ss = piv + rot2(q - vec2(0.05, -0.06) - piv, ang);
      float sh = (1.0 - smoothstep(-0.03, 0.15, sdRoundBox(ss, vec2(A, 1.0), 0.0))) * 0.5 * smoothstep(1.0, 0.85, p);
      return vec4(t2frame(q) * (1.0 - sh), 1.0);
    }
    return vec4(t2frame(src), t2ends(t2box(src, vec2(A, 1.0)), p));
  }

  // ================= Kamera (ek) =================
  if (type == 137.0) { // geçit: giden klip yakınlaşırken ortadan açılan pencerede gelen klip
    if (!isB) return opaque(blurZoom(q / (1.0 + 1.2 * e), 0.3 * mid));
    vec2 hs = vec2(A, 1.0) * (pow(e, 1.4) * 1.06);
    float rad = min(0.12 * (1.0 - e), min(hs.x, hs.y));
    float sd = sdRoundBox(q, hs, rad);
    float inside = 1.0 - smoothstep(-pw, pw, sd);
    float rim = (1.0 - smoothstep(0.006, 0.006 + 1.5 * pw, abs(sd - 0.006))) * smoothstep(0.0, 0.1, p) * smoothstep(1.0, 0.85, p);
    vec3 c = t2frame(q / (1.35 - 0.35 * e));
    c = mix(c, vec3(1.0), rim * (1.0 - inside));
    return vec4(c, t2ends(max(inside, rim * 0.9), p));
  }
  if (type == 138.0) { // dönme bulanıklığı: hızlanarak dönen giden, yavaşlayarak oturan gelen
    float th = p < 0.5 ? PI * pow(p * 2.0, 2.0) * 0.5 : -PI * pow(2.0 - p * 2.0, 2.0) * 0.5;
    float span = mid * mid * 1.1;
    vec3 c = t2spin(q, th, span, 1.0 + 0.15 * mid, A);
    return t2out(c, t2ends(smoothstep(0.42, 0.58, p), p), isB);
  }

  // ================= Organik =================
  if (type == 140.0) { // mürekkep: birkaç noktadan yayılan, kenarı koyulaşan mürekkep lekesi
    float sd0 = uTr.w * 7.0;
    vec2 s1 = vec2(-0.45 * A, 0.4);
    vec2 s2 = vec2(0.5 * A, -0.2);
    vec2 s3 = vec2(0.05 * A, -0.78);
    float n = fbm(q * 2.2 + sd0);
    float dmin = min(min(length(q - s1), length(q - s2) * 1.1), length(q - s3) * 1.25);
    float field = dmin + (n - 0.5) * 0.6 + (vnoise(q * 26.0 + sd0) - 0.5) * 0.05;
    float thr = e * (R * 1.1 + 1.05) - 0.45;
    float d = thr - field;
    if (!isB) return vec4(t2frame(q), 1.0);
    vec3 c = t2frame(q) * (1.0 - 0.6 * exp(-max(d, 0.0) / 0.03));
    return vec4(c, t2ends(smoothstep(-pw, pw, d), p));
  }
  if (type == 141.0) { // duman: dalgalanan dumanın içinden belirme
    vec2 bq = q * 1.6 + uTr.w * 5.0;
    vec2 warp = vec2(fbm(bq + vec2(0.0, p * 1.5)), fbm(bq + vec2(3.7, -p))) - 0.5;
    float n = fbm(bq + warp * 1.4);
    float d = (e * 1.4 - 0.2) - n;
    float haze = exp(-d * d / 0.02) * 0.55 * smoothstep(0.0, 0.12, p) * smoothstep(1.0, 0.88, p);
    vec3 c = t2frame(q + warp * 0.06 * haze);
    c = mix(c, vec3(0.9, 0.91, 0.93), haze + 0.08 * mid);
    return t2out(c, t2ends(smoothstep(-0.08, 0.08, d), p), isB);
  }
  if (type == 142.0) { // kâğıt yanığı: kömürleşen kenarlı, közlü delikler açılır
    float n = fbm(q * 1.8 + uTr.w * 11.0);
    float hot = min(length(q - vec2(0.3 * A, 0.25)), length(q - vec2(-0.5 * A, -0.55)) * 1.15);
    float field = hot * 0.8 + n * 0.9;
    float thr = mix(-0.1, R * 0.9 + 0.85, e);
    float d = field - thr; // > 0: giden kâğıt duruyor
    vec3 ember = vec3(1.0, 0.5, 0.1);
    if (!isB) {
      vec3 c = t2frame(q);
      float ch = 1.0 - smoothstep(0.0, 0.11, d);
      c = mix(c, vec3(0.13, 0.07, 0.03), ch * 0.7);
      c *= 1.0 - 0.65 * (1.0 - smoothstep(0.0, 0.035, d));
      c += ember * 1.6 * exp(-d * d / 0.00012);
      return vec4(c, 1.0);
    }
    vec3 c = t2frame(q) + ember * 0.4 * exp(min(d, 0.0) / 0.035) * smoothstep(1.0, 0.9, e);
    c += ember * 1.6 * exp(-d * d / 0.00012);
    return vec4(min(c, 1.0), t2ends(smoothstep(0.004, -0.004, d), p));
  }
  if (type == 143.0) { // erime: giden klip boya gibi aşağı akar, yukarıdan gelen belirir
    float v = 0.55 * vnoise(vec2(q.x * 3.0 + uTr.w * 9.0, 1.0)) + 0.45 * vnoise(vec2(q.x * 7.0, 7.0));
    float dd = pow(p, 1.8) * (2.1 + 2.4 * v);
    float edge = 1.0 - dd; // gidenin üst kenarı
    float cover = smoothstep(-pw, pw, edge - q.y);
    if (!isB) {
      vec3 c = t2frame(vec2(q.x, q.y + dd));
      float wet = exp(-max(edge - q.y, 0.0) / 0.025);
      float on = smoothstep(0.0, 0.1, p);
      c = c * (1.0 - 0.25 * wet * on) + 0.25 * on * exp(-pow((edge - q.y - 0.012) / 0.006, 2.0));
      return vec4(c * cover, 1.0);
    }
    return vec4(t2frame(q), t2ends(1.0 - cover, p));
  }
  if (type == 144.0) { // rüzgâr: giden klip soldan başlayarak yatay çizgiler halinde savrulur
    float rh = hash11(floor((q.y + 1.0) * 90.0) * 1.37 + 3.0) * 0.6 + hash11(floor((q.y + 1.0) * 230.0) * 0.71 + 9.0) * 0.4;
    float n = vnoise(q * vec2(3.0, 7.0) + uTr.w * 4.0);
    float rel = (q.x / A * 0.5 + 0.5) * 0.55 + n * 0.25 + rh * 0.12;
    float age = p * 1.35 - rel;
    float cover = 1.0 - smoothstep(0.0, 0.35, age);
    if (!isB) {
      float ag = max(age, 0.0);
      vec3 c = t2frame(q - vec2(pow(ag, 1.5) * (0.6 + 0.8 * rh) * A, (rh - 0.5) * 0.05 * ag));
      c = mix(c, vec3(luma(c) * 1.15), smoothstep(0.0, 0.35, ag) * 0.5);
      return vec4(c * cover, 1.0);
    }
    return vec4(t2frame(q), t2ends(1.0 - cover, p));
  }
  if (type == 145.0) { // buzlu cam: buzlu camın ardında bulutsu çözülme
    vec2 jit = hash22(floor(q * uRes.y * 0.5) + 0.5) - 0.5;
    vec3 c = t2frame(t2mirror(q + jit * 0.09 * mid, A));
    c = mix(c, vec3(0.84, 0.9, 0.96) * (0.4 + 0.7 * luma(c)), 0.22 * mid);
    float n = fbm(q * 2.5 + uTr.w * 3.0);
    float m = smoothstep(n - 0.18, n + 0.18, e * 1.36 - 0.18);
    return t2out(c, t2ends(m, p), isB);
  }
  if (type == 146.0) { // su damlası: merkezden yayılan halka dalgası, kırılmalı kenar
    float r = length(q);
    float Rw = mix(-0.15, R + 0.25, e);
    float x = r - Rw;
    float wave = exp(-x * x / 0.012);
    float dw = -x / 0.006 * wave;
    float rip = sin(x * 40.0) * exp(min(x, 0.0) / 0.15) * step(x, 0.0) * 0.4;
    float amp = smoothstep(0.0, 0.1, p) * smoothstep(1.0, 0.85, p);
    vec2 dir = q / max(r, 1e-4);
    vec3 c = t2frame(q - dir * (dw * 0.006 + rip * 0.012) * amp);
    float hl = wave * (0.3 + 0.25 * dot(dir, vec2(-0.6, 0.8))) * amp;
    c = screen(c, vec3(hl));
    return t2out(c, t2ends(smoothstep(pw, -pw, x), p), isB);
  }

  // ================= Işık =================
  if (type == 150.0) { // ışık süpürmesi: eğik parlak ışık çubuğu geçerken klip değişir
    vec2 n = normalize(vec2(1.0, 0.3));
    float L = dot(vec2(A, 1.0), abs(n));
    float c0 = mix(-L - 0.5, L + 0.5, e);
    float x = dot(q, n) - c0;
    float light = exp(-x * x / 0.0035) * 0.95 + exp(-x * x / 0.08) * 0.45 + 0.06 * mid;
    vec3 c = screen(t2frame(q), vec3(1.0, 0.95, 0.86) * clamp(light, 0.0, 1.0));
    return t2out(c, t2ends(1.0 - smoothstep(-0.05, 0.05, x), p), isB);
  }
  if (type == 151.0) { // flaşlı yakınlaşma: hızla yakınlaşan giden beyaza patlar, gelen yerine oturur
    if (!isB) {
      float t = min(p * 2.0, 1.0);
      vec4 c = blurZoom(q / (1.0 + 0.8 * t * t), 0.3 * t * t);
      float f = pow(smoothstep(0.3, 1.0, t), 2.0);
      return vec4(screen(c.rgb * c.a, vec3(f)), 1.0);
    }
    if (p < 0.5) return vec4(0.0);
    float t = p * 2.0 - 1.0;
    float k = (1.0 - t) * (1.0 - t);
    vec4 c = blurZoom(q / (1.0 + 0.6 * k), 0.3 * k);
    float f = 1.0 - smoothstep(0.0, 0.7, t);
    return vec4(screen(c.rgb * c.a, vec3(f)), 1.0);
  }
  if (type == 152.0) { // prizma: kenarında gökkuşağı kırınımı olan silme
    float bw = 0.35;
    float x0 = mix(-A - bw, A + bw, e);
    float d = x0 - q.x;
    float band = exp(-d * d / (bw * bw * 0.25));
    vec2 o = vec2(band * 0.06, 0.0);
    vec3 c = vec3(t2frame(q + o).r, t2frame(q).g, t2frame(q - o).b);
    vec3 rainbow = hsv2rgb(vec3(clamp(0.5 + d / 0.24, 0.0, 1.0) * 0.8, 0.85, 1.0)) * exp(-d * d / 0.01) * 0.55;
    c = screen(c, rainbow);
    return t2out(c, t2ends(smoothstep(-0.02, 0.02, d), p), isB);
  }
  if (type == 153.0) { // güneş patlaması: merkezden dönen ışınlar, ışığın içinden belirme
    float a = atan(q.y, q.x);
    float r = length(q);
    float rays = pow(0.5 + 0.5 * cos(a * 14.0 + p * 2.5), 6.0) * 0.6 + pow(0.5 + 0.5 * cos(a * 9.0 - p * 3.7 + 1.0), 10.0) * 0.4;
    float I = mid * (rays * exp(-r * 0.6) * 1.3 + exp(-r * r * 2.5) * 1.1);
    vec3 c = screen(t2frame(q), clamp(vec3(1.0, 0.88, 0.66) * I, 0.0, 1.0));
    float Rb = e * (R + 0.4) - 0.05;
    return t2out(c, t2ends(1.0 - smoothstep(Rb - 0.35, Rb + 0.05, r), p), isB);
  }

  // ================= Dijital =================
  if (type == 160.0) { // tarama satırları: önce tek, sonra çift satırlar yukarıdan çizilir
    float lines = 180.0;
    float y01 = 1.0 - uv.y;
    float row = floor(y01 * lines);
    float odd = mod(row, 2.0);
    float sweep = odd < 0.5 ? clamp(p / 0.55, 0.0, 1.0) : clamp((p - 0.45) / 0.55, 0.0, 1.0);
    float pos = sweep * 1.06 - 0.03;
    float m = smoothstep(-0.002, 0.002, pos - (row + 0.5) / lines);
    float beamOn = step(0.001, sweep) * step(sweep, 0.999);
    float beam = exp(-pow((y01 - pos) / 0.012, 2.0)) * beamOn;
    vec3 c = t2frame(q + vec2(beam * 0.01, 0.0));
    c = screen(c, vec3(0.55, 0.85, 1.0) * beam * 0.7);
    return t2out(c, t2ends(m, p), isB);
  }
  if (type == 161.0) { // VHS geri sarma: dikey kayma, iz bozulması, renk kanaması
    float g = mid;
    float tick = floor(p * 30.0);
    float roll = (isB ? -1.0 : 1.0) * 1.1 * pow(isB ? 1.0 - p : p, 2.0) * 2.0;
    float yy = mod(q.y + roll + 1.0, 2.2) - 1.0;
    float bar = smoothstep(1.0, 1.0 + pw, yy);
    float band = floor(q.y * 18.0);
    float tear = step(0.82, hash11(band * 1.7 + tick)) * (hash11(band + tick * 3.1) - 0.5) * 0.25;
    float sx = g * (0.03 * sin(q.y * 14.0 + p * 40.0) + tear);
    vec2 bq = vec2(q.x + sx * A, yy);
    float ch = 0.015 * g * A;
    vec3 c = vec3(t2frame(bq + vec2(ch, 0.0)).r, t2frame(bq).g, t2frame(bq - vec2(ch, 0.0)).b);
    float ny = fract(p * 2.3) * 2.0 - 1.0;
    float noise = step(abs(q.y - ny), 0.06 * g) * hash12(floor(q * vec2(220.0, 300.0)) + tick);
    c = mix(c, vec3(luma(c)), 0.3 * g);
    c = mix(c, vec3(noise), 0.6 * step(0.001, noise));
    c *= 1.0 - bar * 0.9;
    return t2out(c, step(0.5, p), isB);
  }
  if (type == 162.0) { // blok bozulması: rastgele bloklar sarsılarak tek tek gelen klibe döner
    vec2 id1 = floor(q / vec2(0.28, 0.14) + uTr.w * 3.0);
    vec2 id2 = floor(q / vec2(0.09, 0.05));
    float small = step(0.55, hash12(id1 + 2.1));
    vec2 bid = mix(id1, id2 + 100.0, small);
    float ts = 0.12 + hash12(bid + 0.7) * 0.76;
    float near = 1.0 - smoothstep(0.0, 0.1, abs(p - ts));
    vec2 off = (hash22(bid + floor(p * 20.0)) - 0.5) * vec2(0.25 * A, 0.05) * near;
    vec2 o = vec2(0.03 * near, 0.0);
    vec2 bq = q + off;
    vec3 c = vec3(t2frame(bq + o).r, t2frame(bq).g, t2frame(bq - o).b);
    if (near > 0.5 && hash12(bid + 5.3) > 0.7) c = c.gbr;
    return t2out(c, t2ends(step(ts, p), p), isB);
  }
  if (type == 163.0) { // piksel sürüklemesi: satır satır uzayan piksel izleriyle silme
    float row = floor(q.y / 0.008);
    float rl = hash11(row * 1.31 + uTr.w * 17.0);
    float rl2 = vnoise(vec2(q.y * 6.0, 1.0));
    float len = (0.08 + 0.5 * rl * rl + 0.25 * rl2) * mid * 2.0 + 1e-3;
    float front = mix(-A - 0.6, A + 0.6, e) + (rl2 - 0.5) * 0.3 * mid;
    float d = q.x - front; // > 0: giden tarafı
    float k = clamp(1.0 - abs(d) / len, 0.0, 1.0);
    vec2 src = vec2(clamp(mix(q.x, front, k * k * (3.0 - 2.0 * k) * 0.9), -A + pw, A - pw), q.y);
    return t2out(t2frame(src), t2ends(smoothstep(pw, -pw, d), p), isB);
  }
  if (type == 164.0) { // yarım ton: gelen klip parlaklığına göre büyüyen noktalarla belirir
    float cell = 0.05;
    vec2 r = rot2(q, PI * 0.25) / cell;
    vec2 id = floor(r);
    vec2 f = fract(r) - 0.5;
    if (!isB) return vec4(t2frame(q), 1.0);
    vec2 cq = rot2((id + 0.5) * cell, -PI * 0.25);
    float lb = luma(t2frame(cq));
    float t = clamp(e * 1.3 - 0.15 + (lb - 0.5) * 0.35 * mid, 0.0, 1.0);
    float rad = t * 0.75;
    float aa = pw / cell;
    float m = rad < 1e-3 ? 0.0 : 1.0 - smoothstep(rad - aa, rad + aa, length(f));
    return vec4(t2frame(q), t2ends(m, p));
  }
  if (type == 165.0) { // televizyon: giden ekran çizgiye, çizgi noktaya söner; gelen tersiyle açılır
    if (!isB) return vec4(p < 0.5 ? t2tv(q, p * 2.0, A) : vec3(0.0), 1.0);
    if (p < 0.5) return vec4(0.0);
    return vec4(t2tv(q, 2.0 - p * 2.0, A), 1.0);
  }

  // ================= Çarpıtma =================
  if (type == 170.0) { // girdap: iki klip ortada en güçlü olan girdapta değişir
    float r = length(q);
    float k = 1.0 - smoothstep(0.0, R, r);
    vec2 src = t2mirror(rot2(q, mid * 4.0 * k * k), A);
    return t2out(t2frame(src), t2ends(smoothstep(0.35, 0.65, p), p), isB);
  }
  if (type == 171.0) { // mercek: ortası şişen balık gözü çarpıtmasıyla değişim
    float r = length(q);
    float str = mid * 0.75;
    vec2 src = q * (1.0 - str * pow(1.0 - smoothstep(0.0, R, r), 1.5));
    vec3 c = t2frame(src) * (1.0 - 0.35 * mid * smoothstep(0.3, R, r));
    return t2out(c, t2ends(smoothstep(0.35, 0.65, p), p), isB);
  }
  if (type == 172.0) { // sıvı biçim değişimi: akış alanıyla bükülerek birbirine dönüşme
    vec2 fq = q * 1.5 + uTr.w * 4.0;
    vec2 flow = vec2(fbm(fq + vec2(1.7, 9.2)), fbm(fq + vec2(8.3, 2.8))) - 0.5;
    vec2 src = isB ? q - flow * 0.5 * (1.0 - e) : q + flow * 0.5 * e;
    float n = fbm(fq * 0.7 + 4.0);
    float m = smoothstep(n - 0.15, n + 0.15, e * 1.3 - 0.15);
    return t2out(t2frame(t2mirror(src, A)), t2ends(m, p), isB);
  }
  if (type == 173.0) { // kaleydoskop: görüntü dönen altı dilimli aynaya katlanıp açılır
    vec2 pq = rot2(q, p * 2.0) / (1.0 + 0.3 * mid);
    float a = atan(pq.y, pq.x);
    float seg = TAU / 6.0;
    float am = abs(mod(a, seg) - seg * 0.5);
    vec2 kq = length(pq) * vec2(cos(am), sin(am));
    vec3 c = mix(t2frame(q), t2frame(t2mirror(kq, A)), smoothstep(0.0, 0.6, mid));
    return t2out(c, t2ends(smoothstep(0.4, 0.6, p), p), isB);
  }

  return clipC(q);
}
