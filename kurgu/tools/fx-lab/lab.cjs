// Kurgu efekt laboratuvarı: uygulamanın kullandığı GLSL efekt dosyalarını
// başsız Chromium (WebGL 1 / GLSL ES 1.00) ile test sahnelerine uygular.
// Görsel kalite kontrolü, öncesi/sonrası karşılaştırma, zamansal akıcılık
// ölçümü ve katalog küçük resimleri buradan üretilir.
//
//   node lab.cjs render  --fx glow,vhs --scenes dir --out dir [--times 0,0.5,1] [--amount 1]
//   node lab.cjs thumbs  --scene file.png --out dir [--size 160]
//   node lab.cjs motion  --fx glow --scene file.png --out dir   (30 kare, kareler arası fark)
//   node lab.cjs lut     --cube file.cube --scene file.png --out file.png [--amount 1]
//
// Playwright yolu PLAYWRIGHT_MODULE ile, Chromium yolu CHROMIUM ile değiştirilebilir.

const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/node-tools/node_modules/playwright');

const FX_DIR = path.join(__dirname, '../../modules/kurgu-engine/android/src/main/assets/kurgu_fx');
const CATALOG = path.join(__dirname, '../../src/model/fx-catalog.json');

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : def;
}

function shaderSource(id) {
  const read = (f) => fs.readFileSync(path.join(FX_DIR, f), 'utf8');
  return `${read('_common.glsl')}\n${read(`${id}.glsl`)}\n${read('_main.glsl')}`;
}

function catalog() {
  return JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
}

/** Katalogdaki varsayılan parametrelerden uP0/uP1 dizileri. */
function defaultParams(entry, overrides = {}) {
  const p = new Array(8).fill(0);
  (entry?.params || []).forEach((def, i) => {
    p[def.slot ?? i] = overrides[def.key] ?? def.default;
  });
  return p;
}

const PAGE = `<!doctype html><html><body style="margin:0"><canvas id=c></canvas><script>
window.renderFx = async (frag, imgUrl, frames, lut) => {
  const img = new Image(); img.src = imgUrl; await img.decode();
  const c = document.getElementById('c'); c.width = img.width; c.height = img.height;
  const gl = c.getContext('webgl', { preserveDrawingBuffer: true, premultipliedAlpha: false });
  const vs = 'attribute vec4 aFramePosition; varying vec2 vUv; void main(){ gl_Position = aFramePosition; vUv = aFramePosition.xy * 0.5 + 0.5; }';
  const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o);
    if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
  const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, frag));
  gl.linkProgram(pr); if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
  gl.useProgram(pr);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,0,1, 1,-1,0,1, -1,1,0,1, 1,1,0,1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(pr, 'aFramePosition'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, 0, 0);
  const tx = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tx);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
  const u = (n) => gl.getUniformLocation(pr, n);
  gl.uniform1i(u('uTex'), 0); gl.uniform2f(u('uRes'), c.width, c.height);
  if (lut) {
    // LUT dokusu (_lut.glsl): ızgara düzeni Android'deki LutFx.kt ile aynı, Y çevrilmez
    const lt = gl.createTexture(); gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, lt);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    const bytes = Uint8Array.from(atob(lut.rgba), (ch) => ch.charCodeAt(0));
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, lut.width, lut.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(u('uLut'), 1); gl.uniform2f(u('uLutGrid'), lut.size, lut.cols); gl.uniform2f(u('uLutTexSize'), lut.width, lut.height);
  }
  const out = [];
  for (const f of frames) {
    gl.uniform1f(u('uTime'), f.time); gl.uniform1f(u('uDur'), f.dur || 0); gl.uniform1f(u('uAmount'), f.amount);
    gl.uniform4f(u('uP0'), f.p[0], f.p[1], f.p[2], f.p[3]); gl.uniform4f(u('uP1'), f.p[4], f.p[5], f.p[6], f.p[7]);
    gl.uniform1f(u('uSeed'), f.seed || 0.37);
    gl.viewport(0, 0, c.width, c.height); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    out.push(c.toDataURL('image/png'));
  }
  return out;
};
</script></body></html>`;

async function withPage(fn) {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(PAGE);
    return await fn(page);
  } finally {
    await browser.close();
  }
}

const dataUrl = (file) => `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`;
const writePng = (file, url) => fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));

async function render() {
  const ids = arg('fx').split(',');
  const sceneDir = arg('scenes');
  const out = arg('out');
  const times = (arg('times', '0.5')).split(',').map(Number);
  const amount = Number(arg('amount', '1'));
  const overrides = JSON.parse(arg('params', '{}'));
  fs.mkdirSync(out, { recursive: true });
  const cat = catalog();
  const scenes = fs.readdirSync(sceneDir).filter((f) => /^[a-z]+\.png$/.test(f) && !f.startsWith('r'));
  await withPage(async (page) => {
    for (const id of ids) {
      const entry = cat.effects.find((e) => e.id === id);
      const frag = shaderSource(entry?.shader || id);
      for (const s of scenes) {
        const frames = times.map((time) => ({ time, dur: 3, amount, p: defaultParams(entry, overrides) }));
        const urls = await page.evaluate(([f, img, fr]) => window.renderFx(f, img, fr), [frag, dataUrl(path.join(sceneDir, s)), frames]);
        urls.forEach((u, i) => writePng(path.join(out, `${id}__${s.replace('.png', '')}__t${times[i]}.png`), u));
      }
      console.log(`rendered ${id}`);
    }
  });
}

async function motion() {
  const id = arg('fx');
  const scene = arg('scene');
  const out = arg('out');
  const n = Number(arg('frames', '30'));
  fs.mkdirSync(out, { recursive: true });
  const entry = catalog().effects.find((e) => e.id === id);
  await withPage(async (page) => {
    const frames = Array.from({ length: n }, (_, i) => ({ time: i / 30, dur: n / 30, amount: 1, p: defaultParams(entry) }));
    const urls = await page.evaluate(([f, img, fr]) => window.renderFx(f, img, fr), [shaderSource(entry?.shader || id), dataUrl(scene), frames]);
    urls.forEach((u, i) => writePng(path.join(out, `${id}_${String(i).padStart(3, '0')}.png`), u));
  });
}

async function thumbs() {
  const scene = arg('scene');
  const out = arg('out');
  fs.mkdirSync(out, { recursive: true });
  const cat = catalog();
  await withPage(async (page) => {
    for (const entry of cat.effects) {
      const t = entry.thumbTime ?? 0.6;
      const urls = await page.evaluate(([f, img, fr]) => window.renderFx(f, img, fr), [
        shaderSource(entry.shader),
        dataUrl(scene),
        [{ time: t, dur: 3, amount: entry.thumbAmount ?? 1, p: defaultParams(entry) }],
      ]);
      writePng(path.join(out, `${entry.id}.png`), urls[0]);
    }
  });
}

/** .cube -> ızgara dokusu (LutFx.kt ile aynı düzen). */
function cubeTexture(file) {
  let size = 0; const vals = []; let dmin = [0, 0, 0]; let dmax = [1, 1, 1];
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split(/\s+/);
    if (/^[0-9+.-]/.test(line)) vals.push(parts.slice(0, 3).map(Number));
    else if (parts[0] === 'LUT_3D_SIZE') size = Number(parts[1]);
    else if (parts[0] === 'DOMAIN_MIN') dmin = parts.slice(1, 4).map(Number);
    else if (parts[0] === 'DOMAIN_MAX') dmax = parts.slice(1, 4).map(Number);
  }
  if (vals.length !== size ** 3) throw new Error(`LUT_DATA ${vals.length}/${size ** 3}`);
  const cols = Math.ceil(Math.sqrt(size)); const rows = Math.ceil(size / cols);
  const width = cols * size; const height = rows * size;
  const out = Buffer.alloc(width * height * 4);
  for (let b = 0; b < size; b++) for (let g = 0; g < size; g++) for (let r = 0; r < size; r++) {
    const v = vals[r + g * size + b * size * size];
    const o = (((Math.floor(b / cols) * size + g) * width) + (b % cols) * size + r) * 4;
    for (let k = 0; k < 3; k++) out[o + k] = Math.round(Math.max(0, Math.min(1, v[k])) * 255);
    out[o + 3] = 255;
  }
  return { size, cols, width, height, dmin, dmax, rgba: out.toString('base64') };
}

async function lut() {
  const cube = cubeTexture(arg('cube'));
  const amount = Number(arg('amount', '1'));
  await withPage(async (page) => {
    const p = [...cube.dmin, 0, ...cube.dmax, 0];
    const urls = await page.evaluate(([f, img, fr, l]) => window.renderFx(f, img, fr, l), [shaderSource('_lut'), dataUrl(arg('scene')), [{ time: 0, amount, p }], cube]);
    writePng(arg('out'), urls[0]);
  });
}

const cmd = process.argv[2];
({ render, motion, thumbs, lut }[cmd] || (() => { console.error('render | motion | thumbs'); process.exit(2); }))()
  .catch((e) => { console.error(e.message || e); process.exit(1); });
