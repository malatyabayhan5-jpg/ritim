// Zoom bulanıklığı: merkeze doğru (veya merkezden dışarı) hızla atılan kamera
// hissi; merkez net kalır, kenarlara doğru uzayan ışınlar. İsteğe bağlı ritmik vuruş.
// P0: x=güç  y=net merkez boyutu  z=vuruş (ritim)  w=yön (0 içeri, 1 dışarı)
vec4 fx(vec2 uv) {
  vec2 c = vec2(0.5);
  vec2 v = uv - c;
  float beat = mix(1.0, 0.25 + 0.75 * pow(0.5 + 0.5 * sin(uTime * TAU * 2.0), 6.0), uP0.z);
  float clearR = mix(0.05, 0.3, uP0.y);
  float amt = mix(0.05, 0.35, uP0.x) * uAmount * beat * smoothstep(clearR, clearR + 0.3, length(v * vec2(aspect(), 1.0)));
  float dirSign = uP0.w > 0.5 ? 1.0 : -1.0;
  vec3 acc = vec3(0.0);
  float wsum = 0.0;
  float j = hash12(uv * uRes) / 24.0;
  for (int i = 0; i < 24; i++) {
    float t = (float(i) / 24.0 + j);
    float w = 1.0 - t * 0.6;
    acc += tex(c + v * (1.0 + dirSign * amt * t)).rgb * w;
    wsum += w;
  }
  return vec4(acc / wsum, 1.0);
}
