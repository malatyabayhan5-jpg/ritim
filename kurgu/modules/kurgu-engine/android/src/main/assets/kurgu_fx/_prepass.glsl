// İki geçişli efektlerin ön geçişi: yarım çözünürlüklü dokuya prepass() çizilir.
// uRes kaynak görüntünün boyutudur (px() kaynak pikseli verir).
void main() {
  gl_FragColor = prepass(vUv);
}
