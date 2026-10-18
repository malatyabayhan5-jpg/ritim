void main() {
  // Yoğunluk 0 iken (ör. efekt katmanının zaman penceresi dışında) görüntü aynen geçer.
  if (uAmount <= 0.0) { gl_FragColor = vec4(texture2D(uTex, vUv).rgb, 1.0); return; }
  gl_FragColor = vec4(clamp(fx(vUv).rgb, 0.0, 1.0), 1.0);
}
