import { iaOptionsFor, iaOriginalOf } from '../services/formats';

// Müzik kaynağı: Internet Archive "netlabels" koleksiyonu.
// Buradaki parçalar Creative Commons lisanslıdır; dinlemek ve indirmek serbesttir.
// API anahtarı gerekmez.

const BASE = 'https://archive.org';
const BASE_QUERY = 'collection:(netlabels) AND mediatype:(audio)';

function first(v) {
  if (Array.isArray(v)) return v[0] || '';
  return v || '';
}

function joinNames(v) {
  if (Array.isArray(v)) return v.filter(Boolean).join(', ');
  return v || '';
}

function clean(text) {
  return String(text || '')
    .replace(/[()":\\[\]{}^~*?!+&|/<>=-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildSearchUrl(q, rows, sort) {
  const parts = [
    'q=' + encodeURIComponent(q),
    'fl[]=identifier',
    'fl[]=title',
    'fl[]=creator',
    'fl[]=downloads',
    'rows=' + rows,
    'page=1',
    'output=json',
  ];
  if (sort) parts.push('sort[]=' + encodeURIComponent(sort));
  return `${BASE}/advancedsearch.php?${parts.join('&')}`;
}

export function artworkFor(identifier) {
  return `${BASE}/services/img/${encodeURIComponent(identifier)}`;
}

function toAlbum(doc) {
  return {
    id: doc.identifier,
    title: first(doc.title) || doc.identifier,
    artist: joinNames(doc.creator) || 'Bilinmeyen sanatçı',
    artwork: artworkFor(doc.identifier),
    downloads: doc.downloads || 0,
  };
}

async function getJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Sunucu ${res.status} döndürdü`);
  return res.json();
}

async function searchRaw(q, rows, sort) {
  const data = await getJson(buildSearchUrl(q, rows, sort));
  const docs = (data && data.response && data.response.docs) || [];
  return docs.map(toAlbum);
}

export function getPopularAlbums(rows = 24) {
  return searchRaw(BASE_QUERY, rows, 'downloads desc');
}

export function getNewAlbums(rows = 15) {
  return searchRaw(BASE_QUERY, rows, 'publicdate desc');
}

export function searchAlbums(text, rows = 40) {
  const t = clean(text);
  if (!t) return Promise.resolve([]);
  const q = `${BASE_QUERY} AND (title:(${t}) OR creator:(${t}) OR subject:(${t}))`;
  return searchRaw(q, rows, 'downloads desc');
}

export function searchByGenre(genre, rows = 40) {
  const t = clean(genre);
  return searchRaw(`${BASE_QUERY} AND subject:(${t})`, rows, 'downloads desc');
}

function parseLength(len) {
  if (!len) return 0;
  const s = String(len);
  if (s.includes(':')) {
    return s.split(':').reduce((acc, p) => acc * 60 + (parseFloat(p) || 0), 0);
  }
  return parseFloat(s) || 0;
}

function stripExt(name) {
  const base = name.split('/').pop();
  return base.replace(/\.[^.]+$/, '').replace(/_/g, ' ');
}

export async function getAlbumTracks(identifier) {
  const data = await getJson(`${BASE}/metadata/${encodeURIComponent(identifier)}`);
  const meta = (data && data.metadata) || {};
  const files = (data && data.files) || [];

  const mp3s = files.filter((f) => f.name && /\.mp3$/i.test(f.name));
  const vbr = mp3s.filter((f) => /vbr mp3/i.test(f.format || ''));
  const chosen = vbr.length ? vbr : mp3s;

  const album = first(meta.title) || identifier;
  const albumArtist = joinNames(meta.creator) || 'Bilinmeyen sanatçı';
  const license = first(meta.licenseurl);
  const artwork = artworkFor(identifier);

  const seen = new Set();
  const tracks = [];
  chosen.forEach((f) => {
    if (seen.has(f.name)) return;
    seen.add(f.name);
    tracks.push({
      id: `${identifier}/${f.name}`,
      title: f.title || stripExt(f.name),
      artist: f.artist || f.creator || albumArtist,
      album,
      albumId: identifier,
      url: `${BASE}/download/${encodeURIComponent(identifier)}/${f.name
        .split('/')
        .map(encodeURIComponent)
        .join('/')}`,
      artwork,
      duration: parseLength(f.length),
      trackNo: parseInt(f.track, 10) || 0,
      sourceFile: f.name,
      license,
    });
  });

  tracks.sort((a, b) => {
    if (a.trackNo && b.trackNo && a.trackNo !== b.trackNo) return a.trackNo - b.trackNo;
    return a.id.localeCompare(b.id);
  });

  return {
    album: { id: identifier, title: album, artist: albumArtist, artwork, license },
    tracks,
  };
}

// --- İndirme seçenekleri ---------------------------------------------------

const metaCache = {};

async function getItemFiles(identifier) {
  if (metaCache[identifier]) return metaCache[identifier];
  const data = await getJson(`${BASE}/metadata/${encodeURIComponent(identifier)}`);
  const files = (data && data.files) || [];
  metaCache[identifier] = files;
  return files;
}

// Bir Internet Archive parçasının, arşivin gerçekten sunduğu tüm biçimleri (orijinal + türevler)
export async function getTrackOptions(track) {
  const identifier = track.albumId;
  if (!identifier) return { video: [], audio: [] };
  const fileName = track.sourceFile || String(track.id).slice(identifier.length + 1).split('#')[0];
  const files = await getItemFiles(identifier);
  const original = iaOriginalOf(files, fileName);
  return iaOptionsFor(identifier, files, original);
}
