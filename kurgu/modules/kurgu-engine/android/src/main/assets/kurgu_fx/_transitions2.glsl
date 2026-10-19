// Geçiş paketi 2 (tür numarası >= 100). src/model/transitions-pack2.js ile eşleşir.
// trRender (_transitions.glsl) tanımadığı türleri buraya iletir.
// p: ilerleme 0..1, isB: gelen klip rolü, e: yumuşatılmış ilerleme, A: en/boy,
// uv: kanvas 0..1, s: kenar yumuşaklığı, mid: ortada 1 olan tepe.
vec4 trRender2(vec2 q, float type, float p, bool isB, float e, float A, vec2 uv, float s, float mid) {
  return clipC(q);
}
