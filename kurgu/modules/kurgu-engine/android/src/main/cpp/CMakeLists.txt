# Otomatik altyazı: whisper.cpp (MIT, ggml-org/whisper.cpp) cihaz içi konuşma
# tanıma. Kaynak, derleme sırasında sabitlenmiş bir commit'ten indirilir
# (bütünlük: commit özeti). Yalnızca 64 bit ABI'lerde derlenir; diğerlerinde
# köprü "kullanılamaz" döner.
cmake_minimum_required(VERSION 3.22)
project(kurgu_whisper C CXX)

set(CMAKE_CXX_STANDARD 17)
set(KURGU_WHISPER_COMMIT d1be6fde11ac6e0407606b4e42fe72d34add8037) # v1.9.5
set(KURGU_WHISPER_SOURCE "" CACHE PATH "Yerel whisper.cpp kaynağı (test için)")

if (ANDROID_ABI STREQUAL "armeabi-v7a" OR ANDROID_ABI STREQUAL "x86")
  add_library(kurgu_whisper SHARED kurgu_whisper_stub.cpp)
  return()
endif()

set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)
set(WHISPER_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(WHISPER_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(WHISPER_BUILD_SERVER OFF CACHE BOOL "" FORCE)
set(WHISPER_ALL_WARNINGS OFF CACHE BOOL "" FORCE)
set(GGML_OPENMP OFF CACHE BOOL "" FORCE)
set(GGML_NATIVE OFF CACHE BOOL "" FORCE)
set(GGML_BACKEND_DL OFF CACHE BOOL "" FORCE)
set(GGML_CCACHE OFF CACHE BOOL "" FORCE)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)
if (NOT CMAKE_BUILD_TYPE OR CMAKE_BUILD_TYPE STREQUAL "Debug")
  # Hata ayıklama derlemesinde bile model çıkarımı -O2 ile derlenir (aksi hâlde çok yavaş)
  set(CMAKE_C_FLAGS "${CMAKE_C_FLAGS} -O2")
  set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -O2")
endif()

include(FetchContent)
if (KURGU_WHISPER_SOURCE)
  FetchContent_Declare(whisper SOURCE_DIR ${KURGU_WHISPER_SOURCE})
else()
  FetchContent_Declare(whisper
    GIT_REPOSITORY https://github.com/ggml-org/whisper.cpp.git
    GIT_TAG v1.9.5
    GIT_SHALLOW TRUE)
endif()
FetchContent_MakeAvailable(whisper)
if (NOT KURGU_WHISPER_SOURCE)
  # Bütünlük: etiketin beklenen commit'i gösterdiğini doğrula
  execute_process(COMMAND git rev-parse HEAD WORKING_DIRECTORY ${whisper_SOURCE_DIR}
    OUTPUT_VARIABLE KURGU_WHISPER_HEAD OUTPUT_STRIP_TRAILING_WHITESPACE)
  if (NOT KURGU_WHISPER_HEAD STREQUAL KURGU_WHISPER_COMMIT)
    message(FATAL_ERROR "whisper.cpp commit uyuşmuyor: ${KURGU_WHISPER_HEAD} != ${KURGU_WHISPER_COMMIT}")
  endif()
endif()

add_library(kurgu_whisper SHARED kurgu_whisper.cpp)
target_link_libraries(kurgu_whisper PRIVATE whisper)
if (ANDROID)
  find_library(LOG_LIB log)
  target_link_libraries(kurgu_whisper PRIVATE ${LOG_LIB})
  target_link_options(kurgu_whisper PRIVATE -Wl,--gc-sections -Wl,--exclude-libs,ALL)
endif()
target_compile_options(kurgu_whisper PRIVATE -fvisibility=hidden)
