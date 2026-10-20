// Kristal küre: kadrajın ortasında cam bir küre; kürenin içinden sahne ters
// dönmüş ve kırılarak büyümüş görünür (gerçek camdaki gibi). Kürenin dışı
// bulanıklaşır ve koyulaşır; kenarda parlak Fresnel halkası, üstte pencere
// yansıması ve altında gölge vardır.
// P0: x=boyut  y=kırılma  z=arka planı karartma
vec4 fx(vec2 uv) {
  vec3 src = tex(uv).rgb;
  vec2 p = centered(uv);
  float R = mix(0.2, 0.46, uP0.x);
  float r = length(p) / R;
  // Dış: hafif bulanık, koyulaşmış
  vec2 d = vec2(0.006 / aspect(), 0.006);
  vec3 bg = (src * 2.0 + tex(uv + d).rgb + tex(uv - d).rgb + tex(uv + vec2(d.x, -d.y)).rgb + tex(uv - vec2(d.x, -d.y)).rgb) / 6.0;
  bg *= mix(1.0, 0.35, uP0.z);
  // Gölge
  float sh = smoothstep(1.4, 0.8, length((p - vec2(0.0, -R * 0.95)) / vec2(R * 1.1, R * 0.25)));
  vec3 col = bg * (1.0 - sh * 0.5);
  if (r < 1.0) {
    // Küresel kırılma: kenara doğru güçlenen bükülme, görüntü ters döner
    float z = sqrt(1.0 - r * r);
    float k = mix(0.6, 1.4, uP0.y);
    vec2 q = -p / R * (1.0 - z * 0.35) * k * 0.55;
    vec3 inner = tex(uncentered(q)).rgb;
    float fres = pow(1.0 - z, 3.0);
    inner = mix(inner, vec3(0.85, 0.9, 1.0), fres * 0.55);
    inner *= 0.9 + 0.15 * z;
    // Pencere yansıması (sol üst)
    vec2 hp = p / R - vec2(-0.38, 0.42);
    inner += smoothstep(0.22, 0.0, length(hp * vec2(1.0, 1.4))) * 0.55;
    inner += smoothstep(0.08, 0.0, abs(r - 0.93)) * 0.15;
    col = mix(col, inner, smoothstep(1.0, 0.985, r));
  }
  return vec4(mix(src, col, uAmount), 1.0);
}
