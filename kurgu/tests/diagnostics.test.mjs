import test from 'node:test';
import assert from 'node:assert/strict';
import { formatReport, installConsoleCapture, jsSnapshot } from '../src/engine/diagnostics.js';

test('report lists device, media formats and keeps the newest lines within the size limit', () => {
  const lines = Array.from({ length: 400 }, (_, i) => `09:00:00.000 I KurguPerf scrub seeks=${i} frames=${i}`);
  const text = formatReport({
    version: '1.2.3',
    device: { manufacturer: 'Xiaomi', model: 'M1', release: '13', sdk: 33, hardware: 'SM1', cores: 8, ramMb: 6000, availMb: 1500, heapMb: 256, lowRam: false, lines },
    media: [{ kind: 'video', width: 3840, height: 2160, durationMs: 12500, frameRate: 30, codec: 'video/hevc', bitrate: 42e6, size: 70e6, keyframes: { syncCount: 11, spanMs: 9960, maxGapMs: 1000 } }],
    settings: { previewQuality: 'auto' },
    jsLines: ['09:00:01.000 I [KurguUI] jsStall ms=900'],
    maxChars: 4000,
  });
  assert.ok(text.length <= 4100, `length ${text.length}`);
  assert.match(text, /Xiaomi M1 · Android 13 \(SDK 33\)/);
  assert.match(text, /#1 video · 3840x2160 · 12\.5 s · 30 fps · video\/hevc · 42\.0 Mbps/);
  assert.match(text, /keyframes 11 in 10\.0 s, max gap 1000 ms/);
  assert.match(text, /seeks=399 /, 'newest native line kept');
  assert.doesNotMatch(text, /seeks=0 /, 'oldest native line dropped');
  assert.match(text, /jsStall ms=900/);
});

test('report works without native diagnostics', () => {
  const text = formatReport({ version: '1', device: null });
  assert.match(text, /native diagnostics unavailable/);
  assert.match(text, /--- native \(0\/0\)/);
});

test('console capture keeps only Kurgu lines', () => {
  const seen = [];
  const fake = { log: (...a) => seen.push(a.join(' ')), warn: () => {}, error: () => {} };
  installConsoleCapture(fake);
  fake.log('[KurguUI] play position=0');
  fake.log('unrelated');
  assert.equal(seen.length, 2, 'original console still called');
  const snap = jsSnapshot();
  assert.equal(snap.filter((l) => l.includes('[KurguUI] play')).length, 1);
  assert.equal(snap.filter((l) => l.includes('unrelated')).length, 0);
});
