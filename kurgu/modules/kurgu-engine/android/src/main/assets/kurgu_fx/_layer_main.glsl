// Katman shader'ının giriş noktası (bkz. _layer.glsl, _transitions.glsl).
void main() {
  vec2 q = vec2((vUv.x * 2.0 - 1.0) * aspect(), vUv.y * 2.0 - 1.0);
  gl_FragColor = uTr.x > 0.5 ? trRender(q) : layerColor(q);
}
