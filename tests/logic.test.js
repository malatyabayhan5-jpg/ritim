import test from 'node:test';
import assert from 'node:assert/strict';
import { sniffFormat, decideFormat, base64ToBytes, extFromMime, extFromUrl, isClearlyNotAudio } from '../src/services/audioFormat.js';
import * as svc from '../src/services/mediaService.js';

const b = (s) => [...Buffer.from(s, 'binary')];

test('imza tespiti', () => {
  assert.equal(sniffFormat(b('ID3\x04\x00\x00\x00\x00')), 'mp3');
  assert.equal(sniffFormat([0xff, 0xfb, 0x90, 0x64]), 'mp3');
  assert.equal(sniffFormat([0xff, 0xf1, 0x50, 0x80]), 'aac');
  assert.equal(sniffFormat(b('\x00\x00\x00\x20ftypM4A ')), 'm4a');
  assert.equal(sniffFormat(b('OggS\x00\x02')), 'ogg');
  assert.equal(sniffFormat(b('fLaC\x00\x00')), 'flac');
  assert.equal(sniffFormat(b('RIFF\x24\x00\x00\x00WAVEfmt ')), 'wav');
  assert.equal(sniffFormat(b('<!DOCTYPE html>')), null);
  assert.equal(sniffFormat([]), null);
});

test('base64 çözümü', () => {
  assert.deepEqual(base64ToBytes(Buffer.from('ID3abc').toString('base64')), b('ID3abc'));
});

test('biçim kararı', () => {
  assert.equal(decideFormat({ sniffed: 'm4a', mime: 'audio/mpeg', expected: 'mp3' }), 'm4a'); // imza kazanır
  assert.equal(decideFormat({ sniffed: null, mime: 'audio/x-m4a', expected: 'mp3' }), 'm4a');
  assert.equal(decideFormat({ sniffed: null, mime: 'application/octet-stream', expected: 'mp3' }), 'mp3');
  assert.throws(() => decideFormat({ sniffed: null, mime: 'text/html; charset=utf-8', expected: 'mp3' }), /web sayfası/);
  assert.throws(() => decideFormat({ sniffed: null, mime: 'application/json', expected: 'mp3' }));
  assert.throws(() => decideFormat({ sniffed: null, mime: 'image/png', expected: 'mp3' }));
  assert.throws(() => decideFormat({ sniffed: null, mime: '', expected: null }), /tanınan/);
});

test('uzantı ve MIME yardımcıları', () => {
  assert.equal(extFromMime('audio/mpeg; charset=x'), 'mp3');
  assert.equal(extFromUrl('https://a.com/x.M4A?y=1'), 'm4a');
  assert.equal(extFromUrl('https://a.com/stream'), null);
  assert.equal(isClearlyNotAudio('text/plain'), true);
  assert.equal(isClearlyNotAudio('audio/ogg'), false);
});

test('servis: süre ayrıştırma ve normalleştirme', () => {
  assert.equal(svc.parseDuration('3:05'), 185);
  assert.equal(svc.parseDuration('1:02:03'), 3723);
  assert.equal(svc.parseDuration(42), 42);
  assert.equal(svc.parseDuration('abc'), 0);
  assert.equal(svc.__test.normalizeItem({ title: 'x' }), null);
  assert.equal(svc.__test.normalizeItem({ id: 5, title: ' T ', duration: '0:30' }).duration, 30);
});

test('servis: mock arama ve indirme', async () => {
  await svc.loadConfig();
  await assert.rejects(svc.search('   '), /bir şey yaz/);
  const all = await svc.search('örnek');
  assert.equal(all.length, 8);
  assert.equal(new Set(all.map((x) => x.id)).size, 8);
  const one = await svc.search('parça 3');
  assert.equal(one.length, 1);
  assert.deepEqual(await svc.search('olmayan şey'), []);
  const dl = await svc.resolveDownload(one[0]);
  assert.match(dl.url, /^https:\/\/www\.soundhelix\.com\/examples\/mp3\/SoundHelix-Song-3\.mp3$/);
});

test('servis: API modu yapılandırma ve hata mesajları', async () => {
  await svc.saveConfig({ mode: 'api', baseUrl: 'https://api.ornek.com///', token: ' abc ' });
  const c = svc.getConfig();
  assert.equal(c.baseUrl, 'https://api.ornek.com');
  assert.equal(c.token, 'abc');
  let called = null;
  globalThis.fetch = async (url, opts) => {
    called = { url, opts };
    if (url.includes('/search')) return { ok: true, status: 200, json: async () => ({ results: [{ id: 'a', title: 'A', duration: '1:00' }, { id: 'a', title: 'dup' }] }) };
    return { ok: true, status: 200, json: async () => ({ url: '/files/a.m4a', mimeType: 'audio/mp4' }) };
  };
  const r = await svc.search('doğa sesi');
  assert.equal(r.length, 1); // tekrar eden id elendi
  assert.equal(called.url, 'https://api.ornek.com/search?q=do%C4%9Fa%20sesi');
  assert.equal(called.opts.headers.Authorization, 'Bearer abc');
  const d = await svc.resolveDownload(r[0]);
  assert.equal(d.url, 'https://api.ornek.com/files/a.m4a'); // göreli adres çözüldü
  assert.equal(d.headers.Authorization, 'Bearer abc');
  globalThis.fetch = async () => ({ ok: false, status: 401, json: async () => ({}) });
  await assert.rejects(svc.search('x'), /erişimi reddetti/);
  globalThis.fetch = async () => { throw new TypeError('Network request failed'); };
  await assert.rejects(svc.search('x'), /bağlanılamadı/);
  await svc.saveConfig({ mode: 'api', baseUrl: '' });
  await assert.rejects(svc.search('x'), /adresi girilmemiş/);
  await svc.saveConfig({ mode: 'mock' });
});

import * as yt from '../src/services/youtubeService.js';

test('YouTube: ISO süre ayrıştırma', () => {
  assert.equal(yt.parseIsoDuration('PT4M13S'), 253);
  assert.equal(yt.parseIsoDuration('PT1H2M3S'), 3723);
  assert.equal(yt.parseIsoDuration('PT45S'), 45);
  assert.equal(yt.parseIsoDuration('P0D'), 0);
  assert.equal(yt.parseIsoDuration('garip'), 0);
});

test('YouTube: arama akışı ve hatalar', async () => {
  await yt.loadYouTubeSettings();
  await assert.rejects(yt.searchYouTube('lofi'), /API anahtarı gerekiyor/);
  await yt.saveYouTubeSettings({ apiKey: ' KEY123 ', creativeCommonsOnly: true });
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(url);
    if (url.includes('/search?')) {
      return { ok: true, status: 200, json: async () => ({
        nextPageToken: 'NEXT',
        items: [
          { id: { videoId: 'v1' }, snippet: { title: 'Doğa &amp; Kuşlar', channelTitle: 'Kanal', thumbnails: { medium: { url: 'https://i.ytimg.com/v1.jpg' } } } },
          { id: { videoId: 'v2' }, snippet: { title: 'Gömülemez', channelTitle: 'K2', thumbnails: {} } },
          { id: { channelId: 'c1' }, snippet: { title: 'kanal sonucu' } },
        ] }) };
    }
    return { ok: true, status: 200, json: async () => ({ items: [
      { id: 'v1', contentDetails: { duration: 'PT3M5S' }, status: { license: 'creativeCommon', embeddable: true } },
      { id: 'v2', contentDetails: { duration: 'PT1M' }, status: { license: 'youtube', embeddable: false } },
    ] }) };
  };
  const r = await yt.searchYouTube('kuş sesleri');
  assert.equal(r.nextPageToken, 'NEXT');
  assert.equal(r.results.length, 1);
  assert.deepEqual(
    { id: r.results[0].id, title: r.results[0].title, duration: r.results[0].duration, license: r.results[0].license },
    { id: 'v1', title: 'Doğa & Kuşlar', duration: 185, license: 'creativeCommon' }
  );
  assert.match(calls[0], /videoLicense=creativeCommon/);
  assert.match(calls[0], /videoEmbeddable=true/);
  assert.match(calls[0], /key=KEY123/);
  assert.match(calls[1], /videos\?part=contentDetails,status&id=v1,v2/);
  globalThis.fetch = async () => ({ ok: false, status: 403, json: async () => ({ error: { errors: [{ reason: 'quotaExceeded' }] } }) });
  await assert.rejects(yt.searchYouTube('x'), /kotası doldu/);
  globalThis.fetch = async () => ({ ok: false, status: 400, json: async () => ({ error: { errors: [{ reason: 'keyInvalid' }] } }) });
  await assert.rejects(yt.searchYouTube('x'), /geçersiz/);
});

test('YouTube: link ayrıştırma ve anahtarsız arama adresi', () => {
  assert.equal(yt.parseYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(yt.parseYouTubeId('https://youtube.com/watch?feature=share&v=abcdefghijk&t=10'), 'abcdefghijk');
  assert.equal(yt.parseYouTubeId('youtu.be/abcdefghijk?si=x'), 'abcdefghijk');
  assert.equal(yt.parseYouTubeId('https://m.youtube.com/shorts/abcdefghijk'), 'abcdefghijk');
  assert.equal(yt.parseYouTubeId('https://music.youtube.com/watch?v=abcdefghijk'), 'abcdefghijk');
  assert.equal(yt.parseYouTubeId('lofi müzik'), null);
  assert.equal(yt.parseYouTubeId('https://evil.com/watch?v=abcdefghijk'), null);
  assert.equal(yt.mobileSearchUrl(' kuş sesi '), 'https://m.youtube.com/results?search_query=ku%C5%9F%20sesi');
});

test('YouTube: dış uygulamaya yönlendiren adresler engellenir', () => {
  for (const u of [
    'intent://www.youtube.com/watch?v=abcdefghijk#Intent;package=com.google.android.youtube;scheme=https;end',
    'vnd.youtube:abcdefghijk',
    'youtube://watch?v=abcdefghijk',
    'market://details?id=com.google.android.youtube',
  ]) assert.equal(yt.isExternalAppUrl(u), true, u);
  assert.equal(yt.isExternalAppUrl('https://m.youtube.com/results?search_query=x'), false);
  assert.equal(yt.isAllowedYouTubeHost('https://m.youtube.com/results?x'), true);
  assert.equal(yt.isAllowedYouTubeHost('https://consent.youtube.com/m?continue=x'), true);
  assert.equal(yt.isAllowedYouTubeHost('https://i.ytimg.com/vi/x/hq.jpg'), true);
  assert.equal(yt.isAllowedYouTubeHost('https://youtube.com.evil.com/'), false);
  assert.equal(yt.isAllowedYouTubeHost('https://ads.example.com/'), false);
});
