// Dijital glitch: sakin aralarla bölünen ritmik patlamalar; blok kaymaları,
// katmanlı RGB ayrışması, yatay sinyal yırtılmaları, kısa renk bozulmaları
// ve dijital gürültü. Zaman kuantalanır (dijital "kare atlama" hissi).
// P0: x=hız  y=blok boyutu  z=RGB ayrışması  w=renk bozulması
vec4 fx(vec2 uv) {
  float rate = mix(5.0, 18.0, uP0.x);
  float tq = floor(uTime * rate);
  float burst = step(0.5, hash11(tq * 1.37 + uSeed * 9.1));
  float env = mix(0.18, 1.0, burst) * uAmount;

  vec2 blocks = vec2(mix(20.0, 5.0, uP0.y), mix(36.0, 9.0, uP0.y));
  vec2 bid = floor(uv * blocks);
  vec2 off = vec2(0.0);
  if (hash12(bid + tq * 7.31) > 1.0 - 0.22 * env) off.x = (hash12(bid * 3.1 + tq) - 0.5) * 0.2 * env;
  float rows = mix(60.0, 240.0, hash11(tq + 3.0));
  float line = floor(uv.y * rows);
  float tear = step(1.0 - 0.08 * env, hash12(vec2(line, tq)));
  off.x += tear * (hash11(line * 0.7 + tq) - 0.5) * 0.14;
  vec2 q = uv + off;

  float s = (0.003 + 0.022 * uP0.z) * env * (0.5 + hash11(tq * 2.0));
  vec3 col;
  col.r = tex(q + vec2(s, s * 0.15)).r;
  col.g = tex(q + vec2(-s * 0.25, 0.0)).g;
  col.b = tex(q - vec2(s, -s * 0.2)).b;

  // Veri bozulması: bazı bloklar başka bir konumdan, kanalları karışmış ve
  // basamaklanmış olarak kopyalanır (düz renk kutusu değil, görüntüden türetilir).
  float cr = step(1.0 - 0.1 * env * uP0.w, hash12(bid.yx + tq * 3.7));
  vec2 src2 = q + (hash22(bid + tq) - 0.5) * vec2(0.3, 0.06);
  vec3 moshed = floor(tex(src2).brg * 6.0 + 0.5) / 6.0;
  moshed *= 0.85 + 0.15 * step(0.5, fract(uv.y * uRes.y * 0.5));
  col = mix(col, moshed, cr * 0.85);
  float inv = step(0.985, hash12(vec2(line * 0.13, tq))) * burst;
  col = mix(col, 1.0 - col, inv * uP0.w * uAmount);
  col += (hash12(uv * uRes + tq) - 0.5) * 0.09 * env;
  return vec4(col, 1.0);
}
