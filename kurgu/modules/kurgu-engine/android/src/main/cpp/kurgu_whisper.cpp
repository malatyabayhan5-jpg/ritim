// Kurgu ↔ whisper.cpp JNI köprüsü. 16 kHz mono float PCM alır, zaman damgalı
// bölümleri UTF-8 JSON bayt dizisi olarak döndürür:
//   {"lang":"tr","segments":[{"t0":0,"t1":1230,"text":"..."}]}
// Zamanlar milisaniyedir. İlerleme ve iptal atomik değişkenlerle yönetilir.
#include <jni.h>
#include <atomic>
#include <string>
#include <thread>
#include "whisper.h"

namespace {
std::atomic<int> g_progress{0};
std::atomic<bool> g_abort{false};

void appendEscaped(std::string &out, const char *s) {
  for (const unsigned char *p = reinterpret_cast<const unsigned char *>(s); *p; ++p) {
    unsigned char c = *p;
    switch (c) {
      case '"': out += "\\\""; break;
      case '\\': out += "\\\\"; break;
      case '\n': out += "\\n"; break;
      case '\r': out += "\\r"; break;
      case '\t': out += "\\t"; break;
      default:
        if (c < 0x20) {
          char buf[8];
          snprintf(buf, sizeof buf, "\\u%04x", c);
          out += buf;
        } else {
          out += static_cast<char>(c);
        }
    }
  }
}
}  // namespace

extern "C" {

JNIEXPORT jboolean JNICALL Java_expo_modules_kurguengine_WhisperNative_available(JNIEnv *, jclass) { return JNI_TRUE; }

JNIEXPORT jint JNICALL Java_expo_modules_kurguengine_WhisperNative_progress(JNIEnv *, jclass) { return g_progress.load(); }

JNIEXPORT void JNICALL Java_expo_modules_kurguengine_WhisperNative_abort(JNIEnv *, jclass) { g_abort.store(true); }

JNIEXPORT jbyteArray JNICALL Java_expo_modules_kurguengine_WhisperNative_transcribe(
    JNIEnv *env, jclass, jstring jModel, jfloatArray jPcm, jstring jLang, jint threads, jboolean jTranslate) {
  g_progress.store(0);
  g_abort.store(false);

  const char *modelPath = env->GetStringUTFChars(jModel, nullptr);
  whisper_context_params cparams = whisper_context_default_params();
  cparams.use_gpu = false;
  whisper_context *ctx = whisper_init_from_file_with_params(modelPath, cparams);
  env->ReleaseStringUTFChars(jModel, modelPath);
  if (ctx == nullptr) return nullptr;

  const char *langChars = env->GetStringUTFChars(jLang, nullptr);
  std::string lang(langChars);
  env->ReleaseStringUTFChars(jLang, langChars);

  whisper_full_params p = whisper_full_default_params(WHISPER_SAMPLING_GREEDY);
  int hw = static_cast<int>(std::thread::hardware_concurrency());
  p.n_threads = threads > 0 ? threads : (hw > 1 ? (hw > 4 ? 4 : hw) : 1);
  p.print_progress = false;
  p.print_realtime = false;
  p.print_timestamps = false;
  p.print_special = false;
  p.translate = jTranslate == JNI_TRUE;  // whisper çevirisi yalnızca İngilizceye yapar
  p.no_context = true;
  p.suppress_blank = true;
  p.token_timestamps = true;
  p.max_len = 60;           // altyazı satırı için en fazla ~60 karakterlik bölüm
  p.split_on_word = true;
  p.language = lang.empty() ? "auto" : lang.c_str();
  p.detect_language = false;
  p.progress_callback = [](whisper_context *, whisper_state *, int progress, void *) { g_progress.store(progress); };
  p.abort_callback = [](void *) -> bool { return g_abort.load(); };

  jsize n = env->GetArrayLength(jPcm);
  jfloat *pcm = env->GetFloatArrayElements(jPcm, nullptr);
  int rc = whisper_full(ctx, p, pcm, n);
  env->ReleaseFloatArrayElements(jPcm, pcm, JNI_ABORT);

  if (rc != 0 || g_abort.load()) {
    whisper_free(ctx);
    return nullptr;
  }

  std::string json = "{\"lang\":\"";
  int langId = whisper_full_lang_id(ctx);
  const char *langStr = langId >= 0 ? whisper_lang_str(langId) : nullptr;
  json += langStr ? langStr : "";
  json += "\",\"segments\":[";
  const int segments = whisper_full_n_segments(ctx);
  for (int i = 0; i < segments; ++i) {
    if (i > 0) json += ',';
    json += "{\"t0\":" + std::to_string(whisper_full_get_segment_t0(ctx, i) * 10);
    json += ",\"t1\":" + std::to_string(whisper_full_get_segment_t1(ctx, i) * 10);
    json += ",\"text\":\"";
    appendEscaped(json, whisper_full_get_segment_text(ctx, i));
    json += "\"}";
  }
  json += "]}";
  whisper_free(ctx);
  g_progress.store(100);

  jbyteArray out = env->NewByteArray(static_cast<jsize>(json.size()));
  env->SetByteArrayRegion(out, 0, static_cast<jsize>(json.size()), reinterpret_cast<const jbyte *>(json.data()));
  return out;
}

}  // extern "C"
