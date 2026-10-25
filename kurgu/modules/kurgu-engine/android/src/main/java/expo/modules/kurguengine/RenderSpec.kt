package expo.modules.kurguengine

import org.json.JSONArray
import org.json.JSONObject

// JS tarafındaki src/engine/renderSpec.js'in ürettiği düz, platformdan bağımsız
// render tanımı. Tüm zamanlar milisaniye, konumlar NDC (-1..1, y yukarı).

data class FxParams(
  val vignette: Float,
  val grain: Float,
  val pixelate: Float,
  val rgbShift: Float,
  val glitch: Float,
  val sharpen: Float,
  val highlights: Float,
  val shadows: Float,
  val fade: Float,
) {
  val isNoOp: Boolean
    get() = vignette <= 0f && grain <= 0f && pixelate <= 0f && rgbShift <= 0f && glitch <= 0f && sharpen <= 0f &&
      highlights == 0f && shadows == 0f && fade <= 0f
}

data class MainClip(
  val key: String,
  val uri: String,
  val kind: String,
  val srcInMs: Long,
  val srcOutMs: Long,
  val sourceDurationMs: Long,
  val speed: Float,
  val volume: Float,
  val fadeInMs: Long,
  val fadeOutMs: Long,
  val colorMatrix: FloatArray?,
  val fit: String,
  val rotation: Float,
  val flipH: Boolean,
  val flipV: Boolean,
  val scale: Float,
  val offsetX: Float,
  val offsetY: Float,
  val blur: Float,
  val fx: FxParams,
  val effects: List<ShaderFxSpec>,
  val lut: LutSpec?,
  val denoise: Float,
  val speedSegments: FloatArray? = null,
  val outMs: Long = 0,
  val startMs: Long = 0,
  val angle: Float = 0f, // serbest açı (derece, saat yönü), anahtar kare tabanı
  val opacity: Float = 1f,
  val keyframes: Map<String, FloatArray> = emptyMap(),
  val audioFx: AudioFxSpec? = null,
  val volumeKf: FloatArray? = null,
)

data class AudioClip(
  val key: String,
  val uri: String,
  val startMs: Long,
  val srcInMs: Long,
  val srcOutMs: Long,
  val sourceDurationMs: Long,
  val speed: Float,
  val volume: Float,
  val fadeInMs: Long,
  val fadeOutMs: Long,
  val denoise: Float,
  val speedSegments: FloatArray? = null,
  val outMs: Long = 0,
  val audioFx: AudioFxSpec? = null,
  val volumeKf: FloatArray? = null,
)

data class TransitionSpec(
  val type: String,
  val atMs: Long,
  val durationMs: Long,
)

data class TextSpec(
  val text: String,
  val startMs: Long,
  val endMs: Long,
  val x: Float,
  val y: Float,
  val scale: Float,
  val rotation: Float,
  val sizeRel: Float,
  val color: Int,
  val background: Int,
  val stroke: Int,
  val strokeWidthRel: Float,
  val shadow: Boolean,
  val align: String,
  val bold: Boolean,
  val italic: Boolean,
  val font: String,
  val letterSpacing: Float,
  val lineHeight: Float,
  val opacity: Float,
  val animIn: String,
  val animOut: String,
  val animMs: Long,
  val rtl: Boolean,
  // Sonradan eklenen isteğe bağlı alanlar; varsayılanlar eski çizimi aynen verir.
  val animLoop: String = "none",
  val color2: Int = 0,
  val shadowColor: Int = 0xA0000000.toInt(), // #000000A0
  val shadowBlur: Float = 0.08f,
  val shadowX: Float = 0f,
  val shadowY: Float = 0.05f,
  val boxStyle: String = "block",
  val boxRadius: Float = 0.25f,
  val boxPad: Float = 0.35f,
  val deco: String = "none",
  val decoColor: Int = 0xFFFFFFFF.toInt(),
  // Anahtar kareler: x, y, scale, rotation, opacity (metin başına göre ms; Keyframes.java)
  val keyframes: Map<String, FloatArray> = emptyMap(),
  // Canlı parametre anahtarı (önizlemede `tx:<key>`: x, y, döndürme, opaklık)
  val key: String = "",
)

/**
 * Üst katman öğesi (resim içinde resim / üst video / görsel). Konum NDC, ölçek
 * kanvasa sığdırılmış boyuta göre, döndürme derece (saat yönü). Anahtar kare izleri
 * Keyframes.java biçiminde paketlidir; iz varsa sabit değerin yerine geçer.
 */
data class LayerClip(
  val key: String,
  val uri: String,
  val kind: String,
  val startMs: Long,
  val srcInMs: Long,
  val srcOutMs: Long,
  val sourceDurationMs: Long,
  val speed: Float,
  val colorMatrix: FloatArray?,
  val xf: FloatArray, // x, y, ölçek, döndürme (derece)
  val opacity: Float,
  val flipH: Boolean,
  val flipV: Boolean,
  val crop: FloatArray, // x0, y0, x1, y1
  val mask: FloatArray, // tür, cx, cy, açı (derece), yarı genişlik, yarı yükseklik, yumuşaklık, köşe, ters
  val chroma: FloatArray, // r, g, b, etkin, tolerans, yumuşaklık, taşma
  val keyframes: Map<String, FloatArray>,
  val rot: Int = 0, // kaynak döndürme, çeyrek tur (ana izdeki 90° döndürme)
  val fit: Int = 0, // 0 sığdır, 1 doldur
  val tr: FloatArray? = null, // geçiş: tür, pencere başı ms, süre ms, rol (0 A, 1 B), yumuşaklık
  val effects: List<ShaderFxSpec> = emptyList(),
  val lut: LutSpec? = null,
)

data class RenderSpec(
  val width: Int,
  val height: Int,
  val fps: Int,
  val totalMs: Long,
  val main: List<MainClip>,
  val audioLanes: List<List<AudioClip>>,
  val transitions: List<TransitionSpec>,
  val texts: List<TextSpec>,
  val globalFx: FxParams,
  val effectLayers: List<ShaderFxSpec>,
  // Alttan üste katman şeritleri; her şerit kendi dizisinde, öğeleri çakışmaz.
  val layers: List<List<LayerClip>> = emptyList(),
  // Karışım modlu görsel katmanları (alttan üste): kompozisyon düzeyinde BlendLayerFx ile çizilir
  val blendLayers: List<BlendLayerSpec> = emptyList(),
) {
  companion object {
    fun parse(json: String): RenderSpec = parse(JSONObject(json))

    fun parse(o: JSONObject): RenderSpec {
      val main = o.optJSONArray("main").objects().map { parseMain(it) }
      val lanes = o.optJSONArray("audioLanes").arrays().map { lane -> lane.objects().map { parseAudio(it) } }
      val transitions = o.optJSONArray("transitions").objects().map {
        TransitionSpec(it.optString("type", "fade"), it.optLong("atMs"), it.optLong("durationMs", 500))
      }
      val texts = o.optJSONArray("texts").objects().map { parseText(it) }
      return RenderSpec(
        width = even(o.optInt("width", 1080)),
        height = even(o.optInt("height", 1920)),
        fps = o.optInt("fps", 30).coerceIn(1, 120),
        totalMs = o.optLong("totalMs"),
        main = main,
        audioLanes = lanes.filter { it.isNotEmpty() },
        transitions = transitions,
        texts = texts,
        globalFx = parseFx(o.optJSONObject("globalFx")),
        effectLayers = o.optJSONArray("effectLayers").objects().map { parseShaderFx(it) },
        layers = o.optJSONArray("layers").arrays().map { lane -> lane.objects().map { parseLayer(it) } }.filter { it.isNotEmpty() },
        blendLayers = o.optJSONArray("blendLayers").objects().map { BlendLayerSpec(parseLayer(it), it.optInt("blend", 0).coerceIn(0, 10)) },
      )
    }

    private fun floats(arr: JSONArray?, n: Int, def: FloatArray): FloatArray =
      if (arr == null || arr.length() < n) def else FloatArray(n) { arr.optDouble(it, def.getOrElse(it) { 0f }.toDouble()).toFloat() }

    private fun parseKf(k: JSONObject?): Map<String, FloatArray> {
      val kf = mutableMapOf<String, FloatArray>()
      if (k == null) return kf
      for (name in k.keys()) {
        val arr = k.optJSONArray(name) ?: continue
        if (arr.length() >= 7 && arr.length() % 7 == 0) kf[name] = FloatArray(arr.length()) { arr.optDouble(it, 0.0).toFloat() }
      }
      return kf
    }

    private fun parseLayer(o: JSONObject): LayerClip {
      val kf = mutableMapOf<String, FloatArray>()
      o.optJSONObject("kf")?.let { k ->
        for (name in k.keys()) {
          val arr = k.optJSONArray(name) ?: continue
          if (arr.length() >= 7 && arr.length() % 7 == 0) kf[name] = FloatArray(arr.length()) { arr.optDouble(it, 0.0).toFloat() }
        }
      }
      return LayerClip(
        key = o.optString("key"),
        uri = o.getString("uri"),
        kind = o.optString("kind", "video"),
        startMs = o.optLong("startMs"),
        srcInMs = o.optLong("srcInMs"),
        srcOutMs = o.optLong("srcOutMs"),
        sourceDurationMs = o.optLong("sourceDurationMs"),
        speed = o.optDouble("speed", 1.0).toFloat(),
        colorMatrix = o.optJSONArray("colorMatrix")?.let { a -> if (a.length() == 16) FloatArray(16) { a.optDouble(it, 0.0).toFloat() } else null },
        xf = floats(o.optJSONArray("xf"), 4, floatArrayOf(0f, 0f, 1f, 0f)),
        opacity = o.optDouble("opacity", 1.0).toFloat().coerceIn(0f, 1f),
        flipH = o.optBoolean("flipH"),
        flipV = o.optBoolean("flipV"),
        crop = floats(o.optJSONArray("crop"), 4, floatArrayOf(0f, 0f, 1f, 1f)),
        mask = floats(o.optJSONArray("mask"), 9, floatArrayOf(0f, 0f, 0f, 0f, 0.5f, 0.5f, 0.02f, 0f, 0f)),
        chroma = floats(o.optJSONArray("chroma"), 7, floatArrayOf(0f, 1f, 0f, 0f, 0.4f, 0.3f, 0.5f)),
        keyframes = kf,
        rot = o.optInt("rot", 0).coerceIn(0, 3),
        fit = o.optInt("fit", 0),
        tr = o.optJSONArray("tr")?.let { a -> if (a.length() >= 5) FloatArray(5) { a.optDouble(it, 0.0).toFloat() } else null },
        effects = o.optJSONArray("effects").objects().map { parseShaderFx(it) },
        lut = o.optJSONObject("lut")?.let { l -> l.optString("uri").takeIf { it.isNotEmpty() }?.let { LutSpec(it, l.optDouble("amount", 1.0).toFloat().coerceIn(0f, 1f)) } },
      )
    }

    private fun parseShaderFx(o: JSONObject): ShaderFxSpec {
      val arr = o.optJSONArray("params")
      return ShaderFxSpec(
        key = o.optString("key"),
        heavy = o.optBoolean("heavy"),
        shader = o.getString("shader"),
        amount = o.optDouble("amount", 1.0).toFloat().coerceIn(0f, 1f),
        params = FloatArray(8) { i -> arr?.optDouble(i, 0.0)?.toFloat() ?: 0f },
        seed = o.optDouble("seed", 0.37).toFloat(),
        startMs = o.optLong("startMs"),
        endMs = o.optLong("endMs"),
        kfAmount = o.optJSONArray("kfAmount")?.let { a -> if (a.length() >= 7 && a.length() % 7 == 0) FloatArray(a.length()) { a.optDouble(it, 0.0).toFloat() } else null },
        kfOriginMs = o.optLong("kfOriginMs", o.optLong("startMs")),
      )
    }

    private fun even(v: Int): Int = maxOf(2, v - (v % 2))

    private fun parseFx(o: JSONObject?): FxParams = FxParams(
      vignette = o?.optDouble("vignette", 0.0)?.toFloat() ?: 0f,
      grain = o?.optDouble("grain", 0.0)?.toFloat() ?: 0f,
      pixelate = o?.optDouble("pixelate", 0.0)?.toFloat() ?: 0f,
      rgbShift = o?.optDouble("rgbShift", 0.0)?.toFloat() ?: 0f,
      glitch = o?.optDouble("glitch", 0.0)?.toFloat() ?: 0f,
      sharpen = o?.optDouble("sharpen", 0.0)?.toFloat() ?: 0f,
      highlights = o?.optDouble("highlights", 0.0)?.toFloat() ?: 0f,
      shadows = o?.optDouble("shadows", 0.0)?.toFloat() ?: 0f,
      fade = o?.optDouble("fade", 0.0)?.toFloat() ?: 0f,
    )

    private fun parseMain(o: JSONObject): MainClip {
      val matrix = o.optJSONArray("colorMatrix")?.let { arr ->
        if (arr.length() == 16) FloatArray(16) { arr.optDouble(it, 0.0).toFloat() } else null
      }
      return MainClip(
        key = o.optString("key"),
        uri = o.getString("uri"),
        kind = o.optString("kind", "video"),
        srcInMs = o.optLong("srcInMs"),
        srcOutMs = o.optLong("srcOutMs"),
        sourceDurationMs = o.optLong("sourceDurationMs"),
        speed = o.optDouble("speed", 1.0).toFloat(),
        volume = o.optDouble("volume", 1.0).toFloat(),
        fadeInMs = o.optLong("fadeInMs"),
        fadeOutMs = o.optLong("fadeOutMs"),
        denoise = o.optDouble("denoise", 0.0).toFloat().coerceIn(0f, 1f),
        audioFx = parseAudioFx(o.optJSONObject("audioFx")),
        volumeKf = o.optJSONArray("volumeKf")?.let { a -> FloatArray(a.length()) { a.optDouble(it, 0.0).toFloat() } }?.takeIf { it.size >= 7 },
        colorMatrix = matrix,
        fit = o.optString("fit", "fit"),
        rotation = o.optDouble("rotation", 0.0).toFloat(),
        flipH = o.optBoolean("flipH"),
        flipV = o.optBoolean("flipV"),
        scale = o.optDouble("scale", 1.0).toFloat(),
        offsetX = o.optDouble("offsetX", 0.0).toFloat(),
        offsetY = o.optDouble("offsetY", 0.0).toFloat(),
        blur = o.optDouble("blur", 0.0).toFloat(),
        fx = parseFx(o.optJSONObject("fx")),
        effects = o.optJSONArray("effects").objects().map { parseShaderFx(it) },
        lut = o.optJSONObject("lut")?.let { l -> l.optString("uri").takeIf { it.isNotEmpty() }?.let { LutSpec(it, l.optDouble("amount", 1.0).toFloat().coerceIn(0f, 1f)) } },
        speedSegments = o.optJSONArray("speedSegments")?.let { a -> if (a.length() >= 2 && a.length() % 2 == 0) FloatArray(a.length()) { a.optDouble(it, 1.0).toFloat() } else null },
        outMs = o.optLong("outMs"),
        startMs = o.optLong("startMs"),
        angle = o.optDouble("angle", 0.0).toFloat(),
        opacity = o.optDouble("opacity", 1.0).toFloat().coerceIn(0f, 1f),
        keyframes = parseKeyframes(o.optJSONObject("kf")),
      )
    }

    /** Paketli anahtar kare izleri (Keyframes.java biçimi, kare başına 7 sayı). */
    fun parseKeyframes(k: JSONObject?): Map<String, FloatArray> {
      val kf = mutableMapOf<String, FloatArray>()
      if (k == null) return kf
      for (name in k.keys()) {
        val arr = k.optJSONArray(name) ?: continue
        if (arr.length() >= 7 && arr.length() % 7 == 0) kf[name] = FloatArray(arr.length()) { arr.optDouble(it, 0.0).toFloat() }
      }
      return kf
    }

    private fun parseAudio(o: JSONObject) = AudioClip(
      key = o.optString("key"),
      uri = o.getString("uri"),
      startMs = o.optLong("startMs"),
      srcInMs = o.optLong("srcInMs"),
      srcOutMs = o.optLong("srcOutMs"),
      sourceDurationMs = o.optLong("sourceDurationMs"),
      speed = o.optDouble("speed", 1.0).toFloat(),
      volume = o.optDouble("volume", 1.0).toFloat(),
      fadeInMs = o.optLong("fadeInMs"),
      fadeOutMs = o.optLong("fadeOutMs"),
      denoise = o.optDouble("denoise", 0.0).toFloat().coerceIn(0f, 1f),
      audioFx = parseAudioFx(o.optJSONObject("audioFx")),
      volumeKf = o.optJSONArray("volumeKf")?.let { a -> FloatArray(a.length()) { a.optDouble(it, 0.0).toFloat() } }?.takeIf { it.size >= 7 },
      speedSegments = o.optJSONArray("speedSegments")?.let { a -> if (a.length() >= 2 && a.length() % 2 == 0) FloatArray(a.length()) { a.optDouble(it, 1.0).toFloat() } else null },
      outMs = o.optLong("outMs"),
    )

    internal fun parseText(o: JSONObject) = TextSpec(
      key = o.optString("key"),
      text = o.optString("text"),
      startMs = o.optLong("startMs"),
      endMs = o.optLong("endMs"),
      x = o.optDouble("x", 0.0).toFloat(),
      y = o.optDouble("y", 0.0).toFloat(),
      scale = o.optDouble("scale", 1.0).toFloat(),
      rotation = o.optDouble("rotation", 0.0).toFloat(),
      sizeRel = o.optDouble("sizeRel", 0.06).toFloat(),
      color = parseColor(o.optString("color", "#FFFFFFFF")),
      background = parseColor(o.optString("background", "#00000000")),
      stroke = parseColor(o.optString("stroke", "#00000000")),
      strokeWidthRel = o.optDouble("strokeWidthRel", 0.0).toFloat(),
      shadow = o.optBoolean("shadow"),
      align = o.optString("align", "center"),
      bold = o.optBoolean("bold"),
      italic = o.optBoolean("italic"),
      font = o.optString("font", "sans"),
      letterSpacing = o.optDouble("letterSpacing", 0.0).toFloat(),
      lineHeight = o.optDouble("lineHeight", 1.2).toFloat(),
      opacity = o.optDouble("opacity", 1.0).toFloat(),
      animIn = o.optString("animIn", "none"),
      animOut = o.optString("animOut", "none"),
      animMs = o.optLong("animMs", 400),
      rtl = o.optBoolean("rtl"),
      animLoop = o.optString("animLoop", "none"),
      color2 = parseColor(o.optString("color2", "#00000000")),
      shadowColor = parseColor(o.optString("shadowColor", "#000000A0")),
      shadowBlur = o.optDouble("shadowBlur", 0.08).toFloat().coerceIn(0f, 1f),
      shadowX = o.optDouble("shadowX", 0.0).toFloat().coerceIn(-0.5f, 0.5f),
      shadowY = o.optDouble("shadowY", 0.05).toFloat().coerceIn(-0.5f, 0.5f),
      boxStyle = o.optString("boxStyle", "block"),
      boxRadius = o.optDouble("boxRadius", 0.25).toFloat().coerceIn(0f, 2f),
      boxPad = o.optDouble("boxPad", 0.35).toFloat().coerceIn(0f, 2f),
      deco = o.optString("deco", "none"),
      decoColor = parseColor(o.optString("decoColor", "#FFFFFFFF")),
      keyframes = parseKf(o.optJSONObject("kf")),
    )

    // "#RRGGBB" veya "#RRGGBBAA" -> ARGB int
    fun parseColor(s: String): Int {
      val hex = s.removePrefix("#")
      return try {
        when (hex.length) {
          6 -> (0xFF shl 24) or hex.toLong(16).toInt()
          8 -> {
            val rgb = hex.substring(0, 6).toLong(16).toInt()
            val a = hex.substring(6, 8).toInt(16)
            (a shl 24) or rgb
          }
          else -> 0
        }
      } catch (e: NumberFormatException) {
        0
      }
    }
  }
}

internal fun JSONArray?.objects(): List<JSONObject> {
  if (this == null) return emptyList()
  return (0 until length()).mapNotNull { optJSONObject(it) }
}

internal fun JSONArray?.arrays(): List<JSONArray> {
  if (this == null) return emptyList()
  return (0 until length()).mapNotNull { optJSONArray(it) }
}

/** Karışım modlu görsel katmanı: katman yerleşimi + mod (src/model/photo.js BLEND_MODES sırası). */
data class BlendLayerSpec(val layer: LayerClip, val mode: Int)
