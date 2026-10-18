package expo.modules.kurguengine;

/**
 * whisper.cpp JNI köprüsü (src/main/cpp/kurgu_whisper.cpp). Kütüphane
 * yüklenemezse ya da 32 bit cihazdaysa {@link #isAvailable()} false döner.
 */
public final class WhisperNative {
  private static final boolean LOADED;

  static {
    boolean ok;
    try {
      String override = System.getProperty("kurgu.whisper.lib");
      if (override != null) System.load(override);
      else System.loadLibrary("kurgu_whisper");
      ok = true;
    } catch (Throwable t) {
      ok = false;
    }
    LOADED = ok;
  }

  private WhisperNative() {}

  public static boolean isAvailable() {
    return LOADED && available();
  }

  static native boolean available();

  /** @return UTF-8 JSON {lang, segments:[{t0,t1,text}]} ya da hata/iptalde null */
  static native byte[] transcribe(String modelPath, float[] pcm16kMono, String language, int threads);

  /** 0..100 */
  static native int progress();

  static native void abort();

  public static String transcribeJson(String modelPath, float[] pcm, String language, int threads) {
    byte[] out = transcribe(modelPath, pcm, language, threads);
    return out == null ? null : new String(out, java.nio.charset.StandardCharsets.UTF_8);
  }

  public static int currentProgress() {
    return LOADED ? progress() : 0;
  }

  public static void cancel() {
    if (LOADED) abort();
  }
}
