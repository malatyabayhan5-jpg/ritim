// İndirme seçenekleri: kaynağın GERÇEKTEN sunduğu dosyalardan oluşturulur.
// Kaynakta olmayan çözünürlük ya da bit hızı listelenmez; telefonda dönüştürme yapılmaz.
//
// DownloadOption:
// {
//   key,                 benzersiz anahtar (ör. "video-720", "audio-mp3-128")
//   kind,                'video' | 'audio'
//   label,               menüde görünen ad (ör. "720p HD", "MP3 · 128 kbps")
//   detail,              ek açıklama (ör. "Orijinal dosya", "Değişken bit hızı")
//   ext,                 dosya uzantısı (mp4, mp3, m4a, ogg, flac...)
//   height,              video yüksekliği (yalnızca video, biliniyorsa)
//   bitrateKbps,         ses bit hızı (biliniyorsa)
//   size,                bayt (biliniyorsa, yoksa null)
//   url,                 dosyanın doğrudan adresi
//   original,            kaynağın orijinal dosyası mı
//   headers              (isteğe bağlı) indirme isteğine eklenecek başlıklar
// }

const VIDEO_LABELS = { 360: '360p', 480: '480p', 720: '720p HD', 1080: '1080p Full HD', 1440: '1440p', 2160: '2160p 4K' };

export function videoLabel(height) {
  if (!height) return 'Video';
  return VIDEO_LABELS[height] || `${height}p`;
}

export function formatBytes(bytes) {
  if (!bytes || !isFinite(bytes)) return null;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// Seçenekleri sıralar ve "En iyi kalite" kısayolunu, yalnızca en az iki gerçek video seçeneği varsa ekler.
export function finalizeOptions(options) {
  const seen = new Set();
  const clean = (options || []).filter((o) => {
    if (!o || !o.url || !o.kind || seen.has(o.key)) return false;
    seen.add(o.key);
    return true;
  });
  const videos = clean.filter((o) => o.kind === 'video').sort((a, b) => (a.height || 0) - (b.height || 0));
  const audios = clean
    .filter((o) => o.kind === 'audio')
    .sort((a, b) => {
      if (a.original !== b.original) return a.original ? -1 : 1;
      return (b.bitrateKbps || 0) - (a.bitrateKbps || 0);
    });
  if (videos.length >= 2) {
    const best = videos[videos.length - 1];
    videos.push({ ...best, key: 'video-best', label: 'En iyi kullanılabilir kalite', detail: videoLabel(best.height), best: true });
  }
  return { video: videos, audio: audios };
}

// ---------------------------------------------------------------------------
// Internet Archive: bir öğenin dosya listesinden, belirli bir parçanın (orijinal dosya adı) tüm
// türevlerini (VBR MP3, 128Kbps MP3, Ogg Vorbis, FLAC, MP4 türevleri...) seçenek olarak çıkarır.

function iaFileUrl(identifier, name) {
  return `https://archive.org/download/${encodeURIComponent(identifier)}/${String(name)
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;
}

function extOf(name) {
  const m = /\.([A-Za-z0-9]{2,5})$/.exec(String(name || ''));
  return m ? m[1].toLowerCase() : '';
}

function num(v) {
  const n = parseFloat(v);
  return isFinite(n) && n > 0 ? n : null;
}

function iaAudioOption(identifier, f, isOriginal) {
  const fmt = String(f.format || '');
  const ext = extOf(f.name);
  let label;
  let detail = isOriginal ? 'Orijinal dosya' : null;
  let bitrate = null;
  let key;
  const kbps = /(\d+)\s*Kbps MP3/i.exec(fmt);
  if (kbps) {
    bitrate = Number(kbps[1]);
    label = `MP3 · ${bitrate} kbps`;
    key = `audio-mp3-${bitrate}`;
  } else if (/VBR MP3/i.test(fmt)) {
    label = 'MP3 · değişken bit hızı';
    detail = detail || 'Yüksek kalite';
    key = 'audio-mp3-vbr';
    bitrate = 256; // sıralama için yaklaşık değer
  } else if (/Ogg Vorbis/i.test(fmt) || ext === 'ogg') {
    label = 'OGG Vorbis';
    key = 'audio-ogg';
  } else if (/Flac/i.test(fmt) || ext === 'flac') {
    label = /24bit/i.test(fmt) ? 'FLAC · 24 bit (kayıpsız)' : 'FLAC (kayıpsız)';
    key = 'audio-flac';
    bitrate = 1000;
  } else if (/WAVE/i.test(fmt) || ext === 'wav') {
    label = 'WAV (kayıpsız)';
    key = 'audio-wav';
    bitrate = 1400;
  } else if (/Apple Lossless|ALAC/i.test(fmt)) {
    return null; // Android'de oynatma desteği tutarsız
  } else if (ext === 'm4a' || /AAC|M4A/i.test(fmt)) {
    label = 'M4A (AAC)';
    key = 'audio-m4a';
  } else if (ext === 'mp3') {
    label = 'MP3';
    key = 'audio-mp3';
  } else {
    return null;
  }
  const explicitBitrate = num(f.bitrate);
  if (explicitBitrate && !kbps) bitrate = Math.round(explicitBitrate);
  return {
    key: isOriginal ? `${key}-orig` : key,
    kind: 'audio',
    label: isOriginal ? `Orijinal format · ${label}` : label,
    detail,
    ext: ext || 'mp3',
    bitrateKbps: bitrate,
    size: num(f.size),
    url: iaFileUrl(identifier, f.name),
    original: !!isOriginal,
  };
}

function iaVideoOption(identifier, f, isOriginal) {
  const ext = extOf(f.name);
  if (!['mp4', 'webm', 'ogv', 'm4v', 'mov'].includes(ext)) return null;
  const h = num(f.height);
  const height = h ? Math.round(h) : null;
  return {
    key: `video-${height || ext}${isOriginal ? '-orig' : ''}-${f.name}`,
    kind: 'video',
    label: videoLabel(height),
    detail: [String(f.format || ext.toUpperCase()), isOriginal ? 'orijinal' : null].filter(Boolean).join(' · '),
    ext,
    height,
    size: num(f.size),
    url: iaFileUrl(identifier, f.name),
    original: !!isOriginal,
  };
}

// files: archive.org/metadata/{id} yanıtındaki "files" dizisi
// originalName: parçanın/videonun orijinal dosya adı (türevler f.original ile ona bağlıdır)
export function iaOptionsFor(identifier, files, originalName) {
  const list = Array.isArray(files) ? files : [];
  const group = list.filter((f) => f && f.name && (f.name === originalName || f.original === originalName));
  const opts = [];
  group.forEach((f) => {
    const isOriginal = f.name === originalName;
    const isVideoFile = ['mp4', 'webm', 'ogv', 'm4v', 'mov'].includes(extOf(f.name));
    const o = isVideoFile ? iaVideoOption(identifier, f, isOriginal) : iaAudioOption(identifier, f, isOriginal);
    if (o) opts.push(o);
  });
  // Aynı çözünürlükte birden fazla video varsa yalnızca MP4 olanı (yoksa ilkini) tut
  const byHeight = {};
  opts
    .filter((o) => o.kind === 'video')
    .forEach((o) => {
      const k = o.height || o.ext;
      if (!byHeight[k] || (byHeight[k].ext !== 'mp4' && o.ext === 'mp4')) byHeight[k] = o;
    });
  const videos = Object.values(byHeight).map((o) => ({ ...o, key: `video-${o.height || o.ext}` }));
  return finalizeOptions([...videos, ...opts.filter((o) => o.kind === 'audio')]);
}

// Bir dosyanın orijinalini bulur (türevse f.original'a gider)
export function iaOriginalOf(files, name) {
  const f = (files || []).find((x) => x.name === name);
  if (f && f.source === 'derivative' && f.original) return f.original;
  return name;
}
