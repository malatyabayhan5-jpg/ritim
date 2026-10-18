// 32 bit ABI'ler için yer tutucu: otomatik altyazı bu cihazlarda kullanılamaz.
#include <jni.h>

extern "C" {
JNIEXPORT jboolean JNICALL Java_expo_modules_kurguengine_WhisperNative_available(JNIEnv *, jclass) { return JNI_FALSE; }
JNIEXPORT jbyteArray JNICALL Java_expo_modules_kurguengine_WhisperNative_transcribe(JNIEnv *, jclass, jstring, jfloatArray, jstring, jint) { return nullptr; }
JNIEXPORT jint JNICALL Java_expo_modules_kurguengine_WhisperNative_progress(JNIEnv *, jclass) { return 0; }
JNIEXPORT void JNICALL Java_expo_modules_kurguengine_WhisperNative_abort(JNIEnv *, jclass) {}
}
