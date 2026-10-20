// Kod yağmuru: sütunlar halinde aşağı akan yeşil karakter dizileri. Her
// sütunun kendi hızı ve uzunluğu var; dizinin başı beyaza yakın parlar, kuyruğu
// söner. Karakterler 5x7 rastgele nokta desenidir ve zaman zaman değişir.
// Görüntü karakterlerin parlaklığını belirler; böylece sahne kodun içinden görünür.
// P0: x=yoğunluk  y=hız  z=karakter boyutu  w=özgün görüntü
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  float u = floor(mix(2.0, 4.5, uP0.z) * max(min(uRes.x, uRes.y) / 540.0, 0.6) + 0.5);
  vec2 cellPx = vec2(6.0, 8.0) * u;
  vec2 pix = uv * uRes;
  vec2 cid = floor(pix / cellPx);
  float rows = uRes.y / cellPx.y;
  // Sütun parametreleri
  float hs = hash11(cid.x * 1.31 + 7.0);
  float speed = mix(4.0, 14.0, hs) * mix(0.4, 1.6, uP0.y);
  float len = mix(6.0, 22.0, hash11(cid.x * 0.77 + 2.0));
  float active = step(hash11(cid.x * 2.9), mix(0.35, 0.95, uP0.x));
  // Baş konumu (satır, üstten aşağı)
  float head = mod(uTime * speed + hs * 97.0, rows + len);
  float rowTop = rows - 1.0 - cid.y;
  float dist = head - rowTop;                      // 0 = baş, pozitif = kuyruk
  float trail = (dist >= 0.0 && dist < len) ? 1.0 - dist / len : 0.0;
  trail *= active;
  // Karakter: hücre ve zaman dilimine göre rastgele 5x7 desen (seyrek değişir)
  float change = floor(uTime * (2.0 + 6.0 * hash12(cid)) + hash12(cid + 3.0) * 10.0);
  vec2 lp = mod(pix, cellPx) / u;
  float gx = floor(lp.x);
  float gy = floor(lp.y);
  float on = 0.0;
  if (gx < 5.0 && gy > 0.5) on = step(0.5, hash12(cid * 7.0 + vec2(gx, gy) * 13.0 + change * 1.7));
  float l = luma(src);
  float bright = trail * mix(1.0, 0.35 + 1.1 * l, uP0.w);
  vec3 green = vec3(0.25, 1.0, 0.45);
  vec3 headC = vec3(0.85, 1.0, 0.9);
  vec3 glyphC = mix(green * bright, headC, smoothstep(0.92, 1.0, trail));
  vec3 bg = src * mix(0.08, 0.35, uP0.w) * vec3(0.6, 1.0, 0.7);
  vec3 col = bg + glyphC * on;
  col += green * trail * 0.06;
  return vec4(mix(src, col, uAmount), 1.0);
}
