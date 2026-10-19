// Kurgu geçişleri (gerçek A/B karışımı). Geçiş penceresinde giden klip (A, alt)
// ve gelen klip (B, üst) ana izin üzerinde iki ayrı katman olarak çizilir; bu dosya
// her rol için katman rengini hesaplar. A her zaman opaktır (siyah zemin üzerine),
// böylece altta kalan ana iz görünmez; B'nin alfası geçişi oluşturur.
// Tür numaraları src/model/catalog.js TRANSITIONS ile aynıdır. Tüm geçişler özgündür.
// Ortak yardımcılar _trcommon.glsl'dedir.
vec4 trRender(vec2 q) {
  float type = floor(uTr.x + 0.5);
  float p = clamp(uTr.y, 0.0, 1.0);
  bool isB = uTr.z > 0.5;
  float e = easeInOut(p);
  float A = aspect();
  vec2 uv = vec2(q.x / A * 0.5 + 0.5, q.y * 0.5 + 0.5);
  float s = 0.004 + 0.06 * uTrP.x; // kenar yumuşaklığı
  float mid = 1.0 - abs(2.0 * p - 1.0); // ortada 1

  // --- Temel ---
  if (type == 1.0) { // çapraz geçiş
    vec4 c = clipC(q);
    return roleOut(c, c, e);
  }
  if (type == 2.0) { // siyaha geçiş
    vec4 c = clipC(q);
    if (!isB) return opaque(vec4(c.rgb * (1.0 - smoothstep(0.0, 0.5, p)), c.a));
    return vec4(c.rgb * smoothstep(0.5, 1.0, p), c.a * step(0.5, p));
  }
  if (type == 3.0) { // beyaza geçiş
    vec4 c = clipC(q);
    if (!isB) return opaque(vec4(mix(c.rgb * c.a, vec3(1.0), smoothstep(0.0, 0.5, p)), 1.0));
    float k = step(0.5, p);
    return vec4(mix(vec3(1.0), c.rgb * c.a, smoothstep(0.5, 1.0, p)), k);
  }
  if (type == 4.0) { // flaş
    vec4 c = clipC(q);
    if (!isB) return opaque(vec4(c.rgb + smoothstep(0.2, 0.5, p), c.a));
    return vec4(min(c.rgb + 1.0 - smoothstep(0.5, 0.85, p), 1.0), c.a * step(0.5, p));
  }
  if (type == 5.0) { // bulanık çapraz geçiş
    float r = mid * 0.06;
    vec4 c = 0.5 * (blurDir(q, vec2(r * A, 0.0)) + blurDir(q, vec2(0.0, r)));
    return roleOut(c, c, e);
  }
  if (type == 6.0) { // parlaklık geçişi: gelen klip koyu bölgelerinden belirir
    vec4 c = clipC(q);
    float l = luma(c.rgb);
    return roleOut(c, c, smoothstep(l - 0.12, l + 0.12, e * 1.24 - 0.12));
  }

  // --- Silme ---
  if (type >= 10.0 && type < 30.0) {
    vec4 c = clipC(q);
    float m = 1.0;
    float maxR = length(vec2(A, 1.0)) + s;
    if (type == 10.0) m = smoothstep(-s, s, uv.x - mix(1.0 + s, -s, e)); // sola
    else if (type == 11.0) m = smoothstep(-s, s, mix(-s, 1.0 + s, e) - uv.x); // sağa
    else if (type == 12.0) m = smoothstep(-s, s, mix(-s, 1.0 + s, e) - uv.y); // yukarı
    else if (type == 13.0) m = smoothstep(-s, s, uv.y - mix(1.0 + s, -s, e)); // aşağı
    else if (type == 14.0) m = smoothstep(-s, s, mix(-s, 1.0 + s, e) - (uv.x + 1.0 - uv.y) * 0.5); // çapraz
    else if (type == 15.0) m = 1.0 - smoothstep(-s, s, length(q) - e * maxR); // iris açılış
    else if (type == 16.0) m = smoothstep(-s, s, length(q) - (1.0 - e) * maxR); // iris kapanış
    else if (type == 17.0) { // saat
      float a = fract(atan(q.x, q.y) / TAU + 1.0);
      m = 1.0 - smoothstep(-0.004, 0.004, a - e * 1.01);
    } else if (type == 18.0) { // jaluzi
      float f = fract(uv.y * 8.0);
      m = smoothstep(0.0, 0.06, e * 1.06 - f);
    } else if (type == 19.0) { // dama
      vec2 g = uv * vec2(8.0, 8.0 / A);
      vec2 cell = floor(g);
      vec2 f = fract(g);
      float d = mod(cell.x + cell.y, 2.0) * 0.5;
      float local = clamp((p - d) / 0.5, 0.0, 1.0);
      m = smoothstep(-0.04, 0.04, local * 1.08 - 0.04 - (f.x + f.y) * 0.5);
    } else if (type == 20.0) { // gürültülü çözülme
      float n = 0.6 * vnoise(uv * vec2(A, 1.0) * 14.0 + uTr.w * 31.0) + 0.4 * hash12(floor(uv * uRes / 2.0));
      m = smoothstep(n - 0.06, n + 0.06, e * 1.12 - 0.06);
    } else if (type == 21.0) m = 1.0 - smoothstep(-s, s, abs(uv.x - 0.5) - e * 0.5 - s); // perde (yatay açılış)
    else if (type == 22.0) m = 1.0 - smoothstep(-s, s, abs(uv.y - 0.5) - e * 0.5 - s); // perde (dikey açılış)
    else if (type == 23.0) { // kalp
      float k = max(e * 2.6, 1e-3);
      m = 1.0 - smoothstep(-s, s, sdHeart(q / k) * k);
    } else if (type == 24.0) { // yıldız
      float k = max(e * 3.2, 1e-3);
      m = 1.0 - smoothstep(-s, s, sdStar(q / k) * k);
    } else if (type == 25.0) { // dikey şeritler (sıralı)
      float col = floor(uv.x * 10.0);
      float d = col / 10.0 * 0.6;
      m = smoothstep(d, d + 0.4, p);
    } else if (type == 26.0) { // elmas
      m = 1.0 - smoothstep(-s, s, abs(q.x) + abs(q.y) - e * (A + 1.0 + s));
    }
    return roleOut(c, c, m);
  }

  // --- Kaydırma / itme ---
  if (type >= 30.0 && type < 40.0) {
    vec2 dir = vec2(0.0);
    float k = type - 30.0;
    float d = mod(k, 4.0);
    if (d == 0.0) dir = vec2(-1.0, 0.0); else if (d == 1.0) dir = vec2(1.0, 0.0); else if (d == 2.0) dir = vec2(0.0, 1.0); else dir = vec2(0.0, -1.0);
    vec2 span = vec2(2.0 * A, 2.0);
    if (k < 4.0) { // kaydır: B üstten kayarak gelir, A sabit
      vec4 b = clipC(q + dir * span * (1.0 - e));
      return roleOut(clipC(q), b, 1.0);
    }
    // it: A çıkar, B girer
    vec4 a = clipC(q - dir * span * e);
    vec4 b = clipC(q + dir * span * (1.0 - e));
    return roleOut(a, b, 1.0);
  }

  // --- Kamera ---
  if (type == 40.0) { // yakınlaş
    if (!isB) return opaque(blurZoom(q / (1.0 + 1.5 * e), 0.25 * e));
    vec4 b = blurZoom(q / (1.0 + 0.35 * (1.0 - e)), 0.15 * (1.0 - e));
    return vec4(b.rgb, b.a * smoothstep(0.35, 0.75, p));
  }
  if (type == 41.0) { // uzaklaş
    if (!isB) return opaque(clipC(q * (1.0 + 1.2 * e)));
    vec4 b = clipC(q / (1.0 + 0.6 * (1.0 - e)));
    return vec4(b.rgb, b.a * smoothstep(0.3, 0.8, p));
  }
  if (type == 42.0) { // döndür
    if (!isB) return opaque(clipC(rot2(q, -e * PI) * (1.0 + 1.5 * e)));
    vec4 b = clipC(rot2(q, (1.0 - e) * PI) * (1.0 + 1.5 * (1.0 - e)));
    return vec4(b.rgb, b.a * smoothstep(0.4, 0.6, p));
  }
  if (type == 43.0 || type == 44.0) { // hızlı kaydırma (whip pan) sola / sağa
    float sgn = type == 43.0 ? -1.0 : 1.0;
    vec2 span = vec2(2.0 * A, 0.0) * sgn;
    vec2 blur = vec2(mid * 0.45 * A, 0.0);
    vec4 a = blurDir(q - span * e, blur);
    vec4 b = blurDir(q - span * (e - 1.0), blur);
    return roleOut(a, b, 1.0);
  }
  if (type == 45.0) { // yakınlaşma bulanıklığıyla çapraz geçiş
    vec4 c = blurZoom(q, mid * 0.3);
    return roleOut(c, c, e);
  }
  if (type == 46.0) { // dalga
    float amp = mid * 0.035;
    vec2 qq = q + normalize(q + 1e-4) * sin(length(q) * 28.0 - p * 18.0) * amp;
    vec4 c = clipC(qq);
    return roleOut(c, c, e);
  }

  // --- Efekt ---
  if (type == 50.0) { // bozulma (glitch)
    float g = mid;
    float row = floor(uv.y * 26.0);
    float tick = floor(p * 24.0);
    float sh = (hash11(row * 1.7 + tick) - 0.5) * 0.35 * g * step(0.55, hash11(row * 3.1 + tick * 7.0));
    vec2 o = vec2(sh * A * 2.0, 0.0);
    vec2 rgb = vec2(0.02 * g * A, 0.0);
    vec4 c0 = clipC(q + o + rgb);
    vec4 c1 = clipC(q + o);
    vec4 c2 = clipC(q + o - rgb);
    vec4 c = vec4(c0.r, c1.g, c2.b, c1.a);
    if (!isB) return opaque(c);
    return vec4(c.rgb, c.a * step(0.5, p));
  }
  if (type == 51.0) { // ışık sızması
    vec2 lp = vec2(mix(-1.2, 1.2, p) * A, 0.3);
    float leak = exp(-dot(q - lp, q - lp) * 1.2) * mid;
    vec3 warm = vec3(1.0, 0.55, 0.2) * leak * 1.2 + vec3(1.0, 0.85, 0.6) * mid * 0.25;
    vec4 c = clipC(q);
    c.rgb = screen(c.rgb, clamp(warm, 0.0, 1.0));
    return roleOut(c, c, smoothstep(0.25, 0.75, p));
  }
  if (type == 52.0) { // film yanığı
    float n = fbm(uv * vec2(A, 1.0) * 2.5 + uTr.w * 13.0);
    float thr = e * 1.3 - 0.15;
    float d = n - thr;
    float edge = exp(-d * d * 500.0);
    vec3 burn = mix(vec3(1.0, 0.35, 0.05), vec3(1.0, 0.9, 0.5), edge);
    vec4 c = clipC(q);
    c.rgb = mix(c.rgb, burn, clamp(edge * 1.2, 0.0, 1.0));
    return roleOut(c, c, smoothstep(0.01, -0.01, d) + edge);
  }
  if (type == 53.0) { // pikselleş
    float cells = exp(mix(log(uRes.y * 0.5), log(14.0), mid));
    vec2 cs = vec2(2.0 / cells);
    vec2 qq = (floor(q / cs) + 0.5) * cs;
    vec4 c = clipC(qq);
    if (!isB) return opaque(c);
    return vec4(c.rgb, c.a * step(0.5, p));
  }
  if (type == 54.0) { // renk kayması + çapraz geçiş
    vec2 o = vec2(mid * 0.05 * A, 0.0);
    vec4 r = clipC(q + o);
    vec4 g = clipC(q);
    vec4 b = clipC(q - o);
    vec4 c = vec4(r.r, g.g, b.b, g.a);
    return roleOut(c, c, e);
  }

  // Paket 2 geçişleri (tür >= 100): _transitions2.glsl
  return trRender2(q, type, p, isB, e, A, uv, s, mid);
}
