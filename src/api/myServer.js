// Kendi sunucunun API katmanı.
// Gerçek API'n hazır olunca SADECE bu dosyadaki iki fonksiyonu değiştirmen yeterli.
// Uygulamanın geri kalanı (liste, indirme, kaydetme, oynatma) bu sözleşmeye göre çalışır.
//
// Sözleşme:
//   mockSearchAPI(query)  -> Promise<Array<{ id, title, artist?, duration, url }>>
//       duration: "3:00" gibi metin ya da saniye cinsinden sayı
//       url: sunucundaki öğenin kimliği / adresi (mockDownloadAPI'ye aynen verilir)
//
//   mockDownloadAPI(url)  -> Promise<{ fileUrl, ext? }>
//       fileUrl: indirilecek ses dosyasının doğrudan linki (http/https)
//       ext: "mp3" | "m4a" ... (verilmezse linkten tahmin edilir, olmazsa mp3)

// Uçtan uca test edilebilsin diye örnek kayıtlar herkese açık test MP3'lerini kullanır.
const SAMPLE = [
  { id: '1', title: 'Test', artist: 'SoundHelix', duration: '6:12', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3' },
  { id: '2', title: 'Örnek parça 2', artist: 'SoundHelix', duration: '7:05', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3' },
  { id: '3', title: 'Örnek parça 3', artist: 'SoundHelix', duration: '5:44', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3' },
  { id: '4', title: 'Örnek parça 4', artist: 'SoundHelix', duration: '5:02', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3' },
  { id: '5', title: 'Örnek parça 5', artist: 'SoundHelix', duration: '5:53', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3' },
];

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export const mockSearchAPI = async (query) => {
  await wait(400); // ağ gecikmesi taklidi
  const q = String(query || '').trim().toLocaleLowerCase('tr');
  if (!q || q === '*' || q === 'test' || q === 'hepsi') return SAMPLE;
  const hits = SAMPLE.filter(
    (s) => s.title.toLocaleLowerCase('tr').includes(q) || (s.artist || '').toLocaleLowerCase('tr').includes(q)
  );
  return hits.length ? hits : SAMPLE;
};

export const mockDownloadAPI = async (url) => {
  await wait(300);
  // Gerçek sunucunda burası ör. imzalı/geçici bir dosya linki döndürebilir.
  return { fileUrl: url, ext: 'mp3' };
};
