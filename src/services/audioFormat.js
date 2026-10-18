// Ses dosyası biçimini uzantı, MIME türü ve dosyanın ilk baytlarına (imza) bakarak belirler.
// Bir linkin ".mp3" ile bitmesi dosyanın gerçekten MP3 olduğu anlamına gelmez; asıl karar imzaya göre verilir.

export const AUDIO_EXTS = ['mp3', 'm4a', 'aac', 'wav', 'ogg', 'opus', 'flac'];

const MIME_EXT = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mpeg3': 'mp3',
  'audio/x-mpeg-3': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/x-aac': 'aac',
  'audio/aacp': 'aac',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/ogg': 'ogg',
  'audio/opus': 'opus',
  'audio/flac': 'flac',
  'audio/x-flac': 'flac',
};

export function cleanMime(value) {
  return String(value || '').split(';')[0].trim().toLowerCase();
}

export function extFromMime(mime) {
  return MIME_EXT[cleanMime(mime)] || null;
}

export function extFromUrl(url) {
  const path = String(url || '').split('?')[0].split('#')[0];
  const m = path.match(/\.([a-zA-Z0-9]{2,5})$/);
  const ext = m ? m[1].toLowerCase() : '';
  return AUDIO_EXTS.includes(ext) ? ext : null;
}

// MIME türü kesin olarak ses değilse (web sayfası, JSON, görsel...) true
export function isClearlyNotAudio(mime) {
  const m = cleanMime(mime);
  if (!m) return false;
  if (m.startsWith('text/')) return true;
  if (m.startsWith('image/')) return true;
  return ['application/json', 'application/xml', 'application/xhtml+xml', 'application/javascript', 'application/pdf', 'application/zip'].includes(m);
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function base64ToBytes(b64) {
  const clean = String(b64 || '').replace(/[^A-Za-z0-9+/]/g, '');
  const out = [];
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < clean.length; i++) {
    buffer = (buffer << 6) | B64.indexOf(clean[i]);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
  }
  return out;
}

function ascii(bytes, start, len) {
  return String.fromCharCode(...bytes.slice(start, start + len));
}

// İlk baytlara bakarak biçimi bulur. Tanımazsa null döner.
export function sniffFormat(bytes) {
  if (!bytes || bytes.length < 4) return null;
  if (ascii(bytes, 0, 3) === 'ID3') return 'mp3';
  if (bytes.length >= 8 && ascii(bytes, 4, 4) === 'ftyp') return 'm4a';
  if (ascii(bytes, 0, 4) === 'OggS') return 'ogg';
  if (ascii(bytes, 0, 4) === 'fLaC') return 'flac';
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WAVE') return 'wav';
  if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) {
    // Çerçeve senkronu: katman bitleri 00 ise ADTS (AAC), değilse MPEG ses (MP3)
    return (bytes[1] & 0x06) === 0 ? 'aac' : 'mp3';
  }
  return null;
}

// Nihai karar: imza > MIME > beklenen uzantı. Ses olmadığı anlaşılırsa hata fırlatır.
export function decideFormat({ sniffed, mime, expected }) {
  if (sniffed) return sniffed;
  if (isClearlyNotAudio(mime)) {
    throw new Error('Bu adres bir ses dosyası değil, bir web sayfası ya da başka bir dosya türü döndürüyor.');
  }
  const fromMime = extFromMime(mime);
  if (fromMime) return fromMime;
  const m = cleanMime(mime);
  if (m && m !== 'application/octet-stream' && !m.startsWith('audio/') && !m.startsWith('video/mp4')) {
    throw new Error(`Desteklenmeyen dosya türü: ${m}`);
  }
  if (expected && AUDIO_EXTS.includes(expected)) return expected;
  throw new Error('Dosya tanınan bir ses biçiminde değil (MP3, M4A, AAC, WAV, OGG, FLAC).');
}
