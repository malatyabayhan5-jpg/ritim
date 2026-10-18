// =====================================================================
//  KENDİ SUNUCU API'N İÇİN BAĞLANTI NOKTASI
// ---------------------------------------------------------------------
//  Uygulama yalnızca bu dosyadaki iki fonksiyonu çağırır.
//  Gerçek API'ni bağlarken sadece bu iki fonksiyonun içini değiştirmen
//  yeterli; ekranlar, indirme ve oynatıcı kodu aynı kalır.
//
//  mockSearchAPI(query)  -> Promise<SonuçListesi>
//     Her sonuç şu alanları taşır:
//       id        (string, zorunlu)  benzersiz kimlik
//       title     (string, zorunlu)  parça adı
//       artist    (string, isteğe bağlı)
//       duration  (string "3:00" veya saniye cinsinden sayı, isteğe bağlı)
//       url       (string, zorunlu)  mockDownloadAPI'ye verilecek değer
//       thumbnail (string, isteğe bağlı) kapak görseli adresi
//
//  mockDownloadAPI(url)  -> Promise<{ url, ext?, headers? }>
//       url      indirilecek ses dosyasının doğrudan adresi (http/https)
//       ext      'mp3' | 'm4a' | 'aac' | 'wav' | 'ogg' | 'flac' (varsayılan: adresten ya da 'mp3')
//       headers  sunucun kimlik doğrulama istiyorsa, örn. { Authorization: 'Bearer ...' }
//                (bu başlıklar telefonda saklanmaz, sadece indirme sırasında kullanılır)
// =====================================================================

// Deneme için herkese açık örnek ses dosyaları (SoundHelix test parçaları).
// Gerçek API'ni bağladığında bu listeyi silebilirsin.
const SAMPLE_BASE = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-';

const MOCK_LIBRARY = [
  { id: '1', title: 'Test', artist: 'Deneme sunucusu', duration: '3:00', url: 'dummy_url_1' },
  { id: '2', title: 'Sabah Işığı', artist: 'Deneme sunucusu', duration: '7:05', url: 'dummy_url_2' },
  { id: '3', title: 'Gece Treni', artist: 'Deneme sunucusu', duration: '5:44', url: 'dummy_url_3' },
  { id: '4', title: 'Yağmur Sonrası', artist: 'Deneme sunucusu', duration: '5:02', url: 'dummy_url_4' },
  { id: '5', title: 'Kıyı Yolu', artist: 'Deneme sunucusu', duration: '5:53', url: 'dummy_url_5' },
  { id: '6', title: 'Uzak Şehir', artist: 'Deneme sunucusu', duration: '4:33', url: 'dummy_url_6' },
];

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

export const IS_MOCK = true; // Gerçek API'ni bağlayınca false yap (ekrandaki "Deneme modu" etiketi kalkar)

export const mockSearchAPI = async (query) => {
  await delay(500);
  const q = String(query || '').trim().toLocaleLowerCase('tr');
  if (!q) return [];
  // "test" ya da "*" yazınca hepsini göster, diğer aramalarda başlığa göre süz
  if (q === 'test' || q === '*') return MOCK_LIBRARY;
  return MOCK_LIBRARY.filter(
    (it) => it.title.toLocaleLowerCase('tr').includes(q) || (it.artist || '').toLocaleLowerCase('tr').includes(q)
  );
};

export const mockDownloadAPI = async (url) => {
  await delay(300);
  const n = parseInt(String(url).replace(/\D/g, ''), 10) || 1;
  return { url: `${SAMPLE_BASE}${n}.mp3`, ext: 'mp3' };
};
