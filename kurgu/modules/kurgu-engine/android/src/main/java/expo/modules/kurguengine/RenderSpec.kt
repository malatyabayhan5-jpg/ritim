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
)

data class AudioClip(
  val uri: String,
  val startMs: Long,
  val srcInMs: Long,
  val srcOutMs: Long,
  val sourceDurationMs: Long,
  val speed: Float,
  val volume: Float,
  val fadeInMs: Long,
  val fadeOutMs: Long,
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
      )
    }

    private fun parseShaderFx(o: JSONObject): ShaderFxSpec {
      val arr = o.optJSONArray("params")
      return ShaderFxSpec(
        shader = o.getString("shader"),
        amount = o.optDouble("amount", 1.0).toFloat().coerceIn(0f, 1f),
        params = FloatArray(8) { i -> arr?.optDouble(i, 0.0)?.toFloat() ?: 0f },
        seed = o.optDouble("seed", 0.37).toFloat(),
        startMs = o.optLong("startMs"),
        endMs = o.optLong("endMs"),
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
        uri = o.getString("uri"),
        kind = o.optString("kind", "video"),
        srcInMs = o.optLong("srcInMs"),
        srcOutMs = o.optLong("srcOutMs"),
        sourceDurationMs = o.optLong("sourceDurationMs"),
        speed = o.optDouble("speed", 1.0).toFloat(),
        volume = o.optDouble("volume", 1.0).toFloat(),
        fadeInMs = o.optLong("fadeInMs"),
        fadeOutMs = o.optLong("fadeOutMs"),
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
      )
    }

    private fun parseAudio(o: JSONObject) = AudioClip(
      uri = o.getString("uri"),
      startMs = o.optLong("startMs"),
      srcInMs = o.optLong("srcInMs"),
      srcOutMs = o.optLong("srcOutMs"),
      sourceDurationMs = o.optLong("sourceDurationMs"),
      speed = o.optDouble("speed", 1.0).toFloat(),
      volume = o.optDouble("volume", 1.0).toFloat(),
      fadeInMs = o.optLong("fadeInMs"),
      fadeOutMs = o.optLong("fadeOutMs"),
    )

    private fun parseText(o: JSONObject) = TextSpec(
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
