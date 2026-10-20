// Sıcak hava dalgalanması (serap): yerden yükselen sıcak havanın kırılması
// gibi görüntü ince, yukarı akan dalgalarla titrer; etki alt bölgede en
// güçlüdür. Hafif sıcak ton ve titreşen kontrast kaybı eklenir.
// P0: x=güç  y=yükseklik (etkilenen bölge)  z=hız
vec4 fx(vec2 uv) {
  vec2 p = uv * vec2(aspect(), 1.0);
  float t = uTime * mix(0.3, 2.0, uP0.z);
  float h = mix(0.25, 1.05, uP0.y);
  float mask = smoothstep(h, 0.0, uv.y);
  float n1 = vnoise(vec2(p.x * 18.0, p.y * 9.0 - t * 4.0));
  float n2 = vnoise(vec2(p.x * 37.0 + 3.0, p.y * 22.0 - t * 7.0));
  vec2 off = vec2(n1 - 0.5, (n2 - 0.5) * 0.6) * mix(0.003, 0.022, uP0.x) * mask * uAmount;
  vec3 col = tex(uv + off).rgb;
  // Isınan hava: hafif sıcaklık ve parlaklıkta titreşim
  float shimmer = (n2 - 0.5) * 0.06 * mask * uP0.x;
  col = col * (1.0 + shimmer) + vec3(0.03, 0.015, -0.01) * mask * uAmount;
  return vec4(col, 1.0);
}
