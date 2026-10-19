import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { DICTIONARIES, LANGUAGES } from '../src/i18n/core';
import {
  AUDIO_FX_DEFAULTS,
  AUDIO_FX_EFFECTS,
  AUDIO_FX_PARAMS,
  AUDIO_PRESETS,
  AUDIO_PRESET_CATEGORIES,
  NATIVE_KEYS,
  applyAudioPreset,
  audioFxSpec,
  audioFxValues,
  clampParam,
  createAudioFx,
  isAudioFxActive,
  isEffectOn,
  isPresetModified,
  pitchRatio,
  presetParams,
  setAudioEffectOn,
  setAudioFxParam,
} from '../src/model/audio-fx';

const root = process.cwd();
const dspDir = join(root, 'modules/kurgu-engine/android/src/main/java/expo/modules/kurguengine/dsp');
const has = (lang, key) => {
  const node = key.split('.').reduce((n, k) => (n && typeof n === 'object' ? n[k] : undefined), DICTIONARIES[lang]);
  return typeof node === 'string' && node.trim().length > 0;
};

/** AudioFxChain.java'daki dizileri okur (JS ve Java tanımları aynı olmalı). */
function javaArrays() {
  const src = readFileSync(join(dspDir, 'AudioFxChain.java'), 'utf8');
  const block = (name) => {
    const m = src.match(new RegExp(`public static final (?:String|float)\\[\\] ${name} = \\{([\\s\\S]*?)\\};`));
    assert.ok(m, `AudioFxChain.${name} bulunamadı`);
    return m[1].replace(/\/\/.*$/gm, '').split(',').map((s) => s.trim()).filter(Boolean);
  };
  const num = (s) => Number(s.replace(/f$/, ''));
  return {
    keys: block('KEYS').map((s) => JSON.parse(s)),
    min: block('MIN').map(num),
    max: block('MAX').map(num),
    defaults: block('DEFAULTS').map(num),
  };
}

test('parametre tanımları Java AudioFxChain ile birebir aynı (anahtar, sıra, sınır, varsayılan)', () => {
  const j = javaArrays();
  assert.deepEqual(NATIVE_KEYS, j.keys);
  assert.equal(j.min.length, j.keys.length);
  assert.equal(j.max.length, j.keys.length);
  assert.equal(j.defaults.length, j.keys.length);
  NATIVE_KEYS.forEach((k, i) => {
    const d = AUDIO_FX_PARAMS.find((x) => x.key === k);
    assert.ok(Math.abs(d.min - j.min[i]) < 1e-6, `${k}.min ${d.min} ≠ ${j.min[i]}`);
    assert.ok(Math.abs(d.max - j.max[i]) < 1e-6, `${k}.max ${d.max} ≠ ${j.max[i]}`);
    assert.ok(Math.abs(d.default - j.defaults[i]) < 1e-6, `${k}.default ${d.default} ≠ ${j.defaults[i]}`);
  });
  for (const d of AUDIO_FX_PARAMS) {
    assert.ok(d.min < d.max, `${d.key}: min < max`);
    assert.ok(d.default >= d.min && d.default <= d.max, `${d.key}: varsayılan sınır dışında`);
    assert.ok(['bool', 'db', 'hz', 'hzLfo', 'ms', 'pct', 'ratio', 'q', 'st', 'bits'].includes(d.unit), `${d.key}: birim ${d.unit}`);
  }
  assert.equal(new Set(AUDIO_FX_PARAMS.map((x) => x.key)).size, AUDIO_FX_PARAMS.length, 'yinelenen parametre anahtarı');
  // Kotlin ayrıştırıcı aynı anahtar dizisini kullanır
  const kt = readFileSync(join(dspDir, '../AudioFx.kt'), 'utf8');
  assert.match(kt, /AudioFxChain\.KEYS/);
  assert.match(kt, /optDouble\("pitch"/);
});

test('en az 40 ön ayar: benzersiz kimlik, geçerli kategori, sınırlar içinde değerler', () => {
  assert.ok(AUDIO_PRESETS.length >= 40, `ön ayar sayısı ${AUDIO_PRESETS.length}`);
  const ids = new Set();
  for (const pr of AUDIO_PRESETS) {
    assert.match(pr.id, /^[a-zA-Z0-9]+$/);
    assert.ok(!ids.has(pr.id), `yinelenen ön ayar: ${pr.id}`);
    ids.add(pr.id);
    assert.ok(AUDIO_PRESET_CATEGORIES.includes(pr.category), `${pr.id}: kategori`);
    assert.ok(pr.icon, `${pr.id}: simge`);
    assert.ok(Object.keys(pr.params).length > 0, `${pr.id}: boş`);
    for (const [k, v] of Object.entries(pr.params)) {
      const d = AUDIO_FX_PARAMS.find((x) => x.key === k);
      assert.ok(d, `${pr.id}: bilinmeyen parametre ${k}`);
      assert.ok(typeof v === 'number' && Number.isFinite(v), `${pr.id}.${k}: sayı değil`);
      assert.ok(v >= d.min && v <= d.max, `${pr.id}.${k}=${v} sınır dışında [${d.min}, ${d.max}]`);
      assert.equal(clampParam(k, v), Math.round(v * 10000) / 10000, `${pr.id}.${k}: adıma oturmuyor`);
    }
    assert.ok(isAudioFxActive(createAudioFx(pr.id)), `${pr.id}: hiçbir efekt etkin değil`);
  }
  for (const c of AUDIO_PRESET_CATEGORIES) {
    assert.ok(AUDIO_PRESETS.filter((pr) => pr.category === c).length >= 8, `${c}: az ön ayar`);
  }
});

test('ön ayarlar gerçekten farklı (normalize parametre uzaklığı)', () => {
  const vec = (id) => {
    const v = audioFxValues(createAudioFx(id));
    return AUDIO_FX_PARAMS.map((d) => {
      // Kapalı bir efektin parametreleri sesi etkilemez: karşılaştırmada varsayılan sayılır.
      const eff = AUDIO_FX_EFFECTS.find((e) => e.params.includes(d) || e.toggle === d.key);
      const live = !eff?.toggle || v[eff.toggle] >= 0.5;
      const x = live ? v[d.key] : d.default;
      return (x - d.min) / (d.max - d.min);
    });
  };
  const vecs = AUDIO_PRESETS.map((pr) => [pr.id, vec(pr.id)]);
  let min = Infinity;
  let pair = '';
  for (let i = 0; i < vecs.length; i++) {
    for (let j = i + 1; j < vecs.length; j++) {
      const dist = vecs[i][1].reduce((s, x, k) => s + Math.abs(x - vecs[j][1][k]), 0);
      if (dist < min) { min = dist; pair = `${vecs[i][0]} / ${vecs[j][0]}`; }
      assert.ok(dist >= 0.25, `ön ayarlar fazla benzer: ${vecs[i][0]} / ${vecs[j][0]} (uzaklık ${dist.toFixed(3)})`);
    }
  }
  console.log(`  en yakın iki ön ayar: ${pair} (normalize L1 uzaklık ${min.toFixed(3)})`);
});

test('adlar üç dilde: ön ayar, kategori, efekt, parametre, birim', () => {
  const keys = [
    ...AUDIO_PRESETS.map((pr) => `audioFx.preset.${pr.id}`),
    ...AUDIO_PRESET_CATEGORIES.map((c) => `audioFx.category.${c}`),
    ...AUDIO_FX_EFFECTS.map((e) => `audioFx.effect.${e.id}`),
    ...AUDIO_FX_PARAMS.filter((d) => !AUDIO_FX_EFFECTS.some((e) => e.toggle === d.key)).map((d) => `audioFx.param.${d.key}`),
    ...['db', 'hz', 'khz', 'ms', 'pct', 'ratio', 'q', 'st', 'bits'].map((u) => `audioFx.unit.${u}`),
    ...['title', 'none', 'advanced', 'reset', 'modified', 'custom', 'on', 'off', 'hint', 'boostHint'].map((k) => `audioFx.${k}`),
  ];
  for (const { code } of LANGUAGES) {
    assert.deepEqual(keys.filter((k) => !has(code, k)), [], `${code}: eksik çeviri`);
  }
  // Ön ayar adları her dilde benzersiz
  for (const { code } of LANGUAGES) {
    const names = AUDIO_PRESETS.map((pr) => DICTIONARIES[code].audioFx.preset[pr.id]);
    assert.equal(new Set(names).size, names.length, `${code}: aynı adlı iki ön ayar`);
  }
  // Paket fazlalık içermez: tanımlı her ön ayar adı bir ön ayara karşılık gelir
  const extra = Object.keys(DICTIONARIES.tr.audioFx.preset).filter((id) => !AUDIO_PRESETS.some((pr) => pr.id === id));
  assert.deepEqual(extra, []);
});

test('durum yardımcıları ve yerel tanım', () => {
  assert.equal(audioFxSpec(null), null);
  assert.equal(audioFxSpec(createAudioFx()), null);
  const fx = createAudioFx('podcast');
  const spec = audioFxSpec(fx);
  assert.deepEqual(Object.keys(spec), [...NATIVE_KEYS, 'pitch']);
  for (const v of Object.values(spec)) assert.ok(typeof v === 'number' && Number.isFinite(v));
  assert.equal(spec.compOn, 1);
  assert.equal(spec.revOn, 0);
  assert.equal(isPresetModified(fx), false);

  const tweaked = setAudioFxParam(fx, 'compRatio', 6);
  assert.equal(tweaked.preset, 'podcast');
  assert.equal(isPresetModified(tweaked), true);
  assert.equal(audioFxSpec(tweaked).compRatio, 6);
  assert.equal(isPresetModified(applyAudioPreset(tweaked, 'podcast')), false);

  // Sınır dışı / adım dışı değerler kırpılır
  assert.equal(audioFxValues(setAudioFxParam(fx, 'gainDb', 40)).gainDb, 12);
  assert.equal(audioFxValues(setAudioFxParam(fx, 'pitch', 3.4)).pitch, 3);
  assert.equal(audioFxValues(setAudioFxParam(fx, 'pitch', 'x')).pitch, 0);
  assert.equal(setAudioFxParam(fx, 'nope', 1), fx);

  // Varsayılana dönen değer durumda tutulmaz
  const clean = setAudioFxParam(createAudioFx(), 'gainDb', 0);
  assert.deepEqual(clean.params, {});

  // Yalnızca perde ya da yalnızca kazanç da etkin sayılır
  assert.deepEqual(Object.keys(audioFxSpec(setAudioFxParam(null, 'pitch', -5))).length, NATIVE_KEYS.length + 1);
  assert.ok(audioFxSpec(setAudioFxParam(null, 'gainDb', 6)));

  // Efekt aç/kapat
  let e = setAudioEffectOn(createAudioFx(), 'reverb', true);
  assert.equal(isEffectOn(e, 'reverb'), true);
  e = setAudioEffectOn(e, 'reverb', false);
  assert.equal(isAudioFxActive(e), false);
  e = setAudioEffectOn(setAudioFxParam(null, 'pitch', 4), 'pitch', false);
  assert.equal(audioFxValues(e).pitch, 0);

  // Perde oranı
  assert.equal(pitchRatio(12), 2);
  assert.equal(pitchRatio(-12), 0.5);
  assert.ok(Math.abs(pitchRatio(7) - 1.498307) < 1e-6);
  assert.equal(pitchRatio(0), 1);

  // %100 üstü kazanç: +12 dB ≈ x3.98, sınırlayıcı Java tarafında kırpmayı önler (AudioFxTest)
  assert.equal(AUDIO_FX_DEFAULTS.gainDb, 0);
  assert.equal(AUDIO_FX_PARAMS.find((d) => d.key === 'gainDb').max, 12);
});

test('ön ayar örnek dosyası güncel (Java AudioFxTest tüm ön ayarları bu dosyadan işler)', () => {
  const lines = ['# Otomatik üretildi: tests/audio-fx.test.mjs (UPDATE_FIXTURES=1). Biçim: kimlik | anahtar=değer ... (audioFxSpec)'];
  for (const pr of AUDIO_PRESETS) {
    const spec = audioFxSpec(createAudioFx(pr.id));
    lines.push(`${pr.id} | ${Object.entries(spec).map(([k, v]) => `${k}=${v}`).join(' ')}`);
  }
  const file = join(root, 'tests/fixtures/audio-presets.txt');
  const text = `${lines.join('\n')}\n`;
  if (process.env.UPDATE_FIXTURES) writeFileSync(file, text);
  assert.equal(readFileSync(file, 'utf8'), text, 'örnek dosyası eski: UPDATE_FIXTURES=1 npm test');
  // ön ayar parametreleri tanımla tutarlı
  for (const pr of AUDIO_PRESETS) for (const [k, v] of Object.entries(presetParams(pr.id))) assert.equal(v, pr.params[k]);
});

test('AudioFxPanel derlenir (JSX, içe aktarımlar çözülür)', () => {
  // Panel hiçbir yerden içe aktarılmadığı için (henüz) burada ayrıca derlenir; esbuild
  // ayrı süreçte çalışır (test paketine gömülmez).
  assert.ok(existsSync(join(root, 'node_modules/esbuild')), 'esbuild yok');
  const script = `const r = require('esbuild').buildSync({ entryPoints: ['src/editor/AudioFxPanel.js'], bundle: true, packages: 'external', jsx: 'automatic', loader: { '.js': 'jsx' }, format: 'esm', write: false, logLevel: 'error' }); process.stdout.write(r.outputFiles[0].text);`;
  const r = spawnSync(process.execPath, ['-e', script], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /audiofx-preset-/);
  assert.match(r.stdout, /panel-audiofx/);
});
