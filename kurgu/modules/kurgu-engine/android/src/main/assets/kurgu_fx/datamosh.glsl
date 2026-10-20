// Veri ezmesi (datamosh): sıkıştırılmış videoda anahtar kare kaybolunca
// hareket vektörlerinin eski görüntüyü sürüklemesi gibi. Makro bloklar kendi
// rastgele yönlerinde kayar ve rengini çevresine bulaştırarak uzar; bloklar
// zaman zaman "yenilenir". Blok kenarlarında hafif renk kayması.
// P0: x=blok boyutu  y=sürükleme  z=sıklık  w=renk kayması
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  float bs = floor(mix(8.0, 40.0, uP0.x) * max(min(uRes.x, uRes.y) / 720.0, 0.75));
  vec2 blk = floor(uv * uRes / bs);
  // Bölümler: her bölümde bir grup blok "takılır"
  float seg = floor(uTime * mix(1.0, 5.0, uP0.z));
  float segT = fract(uTime * mix(1.0, 5.0, uP0.z));
  // Büyük bölgeler halinde etkilenme (gerçek kayıp gibi kümelenir)
  float region = vnoise(blk * 0.12 + seg * 3.7);
  float active = smoothstep(0.55, 0.62, region) * step(0.2, hash11(seg * 1.7 + 0.3));
  vec2 mv = (hash22(floor(blk / 3.0) + seg * 11.0) - 0.5) * 2.0;
  mv = normalize(mv + 1e-3) * mix(0.3, 1.0, length(mv));
  float drag = mix(0.02, 0.18, uP0.y) * (0.3 + segT);
  // Sürüklenmiş örnekleme: blok yönünde birkaç örneğin en parlak/koyusu karışır (bulaşma)
  vec2 off = mv * drag * vec2(1.0 / aspect(), 1.0);
  vec2 bq = (blk + 0.5) * bs / uRes;
  vec2 inBlk = uv - bq;
  vec3 smear = tex(uv - off).rgb * 0.5 + tex(uv - off * 0.6 + inBlk * 0.3).rgb * 0.3 + tex(bq - off * 1.2).rgb * 0.2;
  vec3 col = mix(src, smear, active * uAmount);
  // Blok kenarı renk kayması ve kuantalama
  vec2 lf = fract(uv * uRes / bs);
  float edge = step(0.92, max(lf.x, lf.y));
  vec3 shift = vec3(tex(uv - off + vec2(0.004, 0.0)).r, col.g, tex(uv - off - vec2(0.004, 0.0)).b);
  col = mix(col, shift, active * uP0.w * uAmount);
  col = mix(col, floor(col * 12.0) / 12.0, active * 0.5 * uAmount);
  col *= 1.0 - edge * active * 0.12 * uAmount;
  return vec4(col, 1.0);
}
