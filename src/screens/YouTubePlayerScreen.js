// YouTube videolarını uygulamanın içinde açar.
// Önce YouTube'un resmi IFrame (gömülü) oynatıcısı denenir. Gömülü oynatma reddedilirse
// (video sahibi gömmeyi kapatmış ya da YouTube oynatıcıyı doğrulayamamışsa), video otomatik olarak
// YouTube'un kendi mobil izleme sayfasıyla yine bu ekranda oynatılır. Dış uygulamaya yönlendirme yoktur.
// İndirme yoktur; YouTube'un kuralları gereği gömülü oynatıcı ekran kapalıyken çalmaz.
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { colors, formatTime, radius, space } from '../theme';
import { isAllowedYouTubeHost, isExternalAppUrl, mobileWatchUrl, parseYouTubeId } from '../services/youtubeService';
import { usePlayer } from '../context/PlayerContext';
import { useLibrary } from '../context/LibraryContext';
import TrackActionsSheet from '../components/TrackActionsSheet';
import { useDownloadOptions } from '../components/DownloadOptions';
import { youtubeTrack } from '../services/youtubeService';

const ORIGIN = 'https://com.ritim.muzik';

function playerHtml(videoId) {
  const id = JSON.stringify(String(videoId));
  return `<!doctype html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<meta name="referrer" content="strict-origin-when-cross-origin">
<style>html,body{margin:0;padding:0;background:#000;height:100%;overflow:hidden}
#p,iframe{position:absolute;inset:0;width:100%;height:100%;border:0}</style>
</head><body>
<div id="p"></div>
<script>
function post(o){ if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(o)); }
window.onerror = function(){ post({ type: 'error', code: 'script' }); };
function onYouTubeIframeAPIReady(){
  new YT.Player('p', {
    videoId: ${id},
    playerVars: { playsinline: 1, autoplay: 1, rel: 0, modestbranding: 1, origin: ${JSON.stringify(ORIGIN)} },
    events: {
      onReady: function(e){ post({ type: 'ready' }); try { e.target.playVideo(); } catch (x) {} },
      onError: function(e){ post({ type: 'error', code: e.data }); },
      onStateChange: function(e){ post({ type: 'state', state: e.data }); }
    }
  });
}
</script>
<script src="https://www.youtube.com/iframe_api" onerror="post({type:'error',code:'api'})"></script>
</body></html>`;
}

const EMBED_ERRORS = {
  2: 'Geçersiz video kimliği.',
  5: 'Bu video gömülü oynatıcıda oynatılamıyor.',
  100: 'Video bulunamadı veya kaldırılmış.',
  101: 'Video sahibi başka uygulamalarda oynatılmasına izin vermiyor.',
  150: 'Video sahibi başka uygulamalarda oynatılmasına izin vermiyor.',
  153: 'YouTube bu oynatıcıyı doğrulayamadı.',
};

export default function YouTubePlayerScreen({ route, navigation }) {
  const [video, setVideo] = useState(route.params.video);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { isPlaying, togglePlay } = usePlayer();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState('embed'); // 'embed' | 'watch'
  const lib = useLibrary();
  const { openDownloadOptions } = useDownloadOptions();
  const [sheet, setSheet] = useState(null);
  const yt = youtubeTrack(video);
  const fav = lib.isFavorite(yt.id);

  const actions = (
    <View style={styles.actionsRow}>
      <Pressable testID="yt-fav" onPress={() => lib.toggleFavorite(yt)} style={styles.actionBtn} hitSlop={6}>
        <Ionicons name={fav ? 'heart' : 'heart-outline'} size={22} color={fav ? colors.accent : colors.text} />
        <Text style={styles.actionText}>{fav ? 'Favorilerde' : 'Favori'}</Text>
      </Pressable>
      <Pressable testID="yt-playlist" onPress={() => setSheet({ track: yt, playlists: true })} style={styles.actionBtn} hitSlop={6}>
        <Ionicons name="add-circle-outline" size={22} color={colors.text} />
        <Text style={styles.actionText}>Listeye ekle</Text>
      </Pressable>
      <Pressable testID="yt-download" onPress={() => openDownloadOptions(yt)} style={styles.actionBtn} hitSlop={6}>
        <Ionicons name="arrow-down-circle-outline" size={22} color={colors.text} />
        <Text style={styles.actionText}>İndir</Text>
      </Pressable>
    </View>
  );
  const sheetEl = (
    <TrackActionsSheet track={sheet ? sheet.track : null} startOnPlaylists={sheet ? sheet.playlists : false} onClose={() => setSheet(null)} />
  );
  const [embedCode, setEmbedCode] = useState(null);

  // Yerel müzik çalıyorsa iki ses üst üste binmesin
  useEffect(() => {
    if (isPlaying) togglePlay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setMode('embed');
    setEmbedCode(null);
  }, [video.id]);

  // Gömme kapalıysa: videoyu yine uygulama içinde YouTube'un mobil izleme sayfasında aç
  const watchInApp = useCallback(() => {
    navigation.navigate('YouTubeBrowse', { startUrl: mobileWatchUrl(video.id), query: video.title, watchInline: true });
  }, [navigation, video]);

  if (mode === 'watch') {
    return (
      <View testID="yt-player" style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.topBar}>
          <Pressable testID="yt-player-back" onPress={() => navigation.goBack()} hitSlop={10} style={styles.back}>
            <Ionicons name="chevron-down" size={28} color={colors.text} />
          </Pressable>
          <Text style={styles.topLabel}>YOUTUBE</Text>
          <View style={styles.back} />
        </View>
        <View testID="yt-watch-mode" style={styles.modeNote}>
          <Ionicons name="information-circle-outline" size={16} color={colors.textDim} />
          <Text style={styles.modeNoteText}>
            Bu video gömülü oynatıcıda açılamadı{embedCode ? ` (YouTube kodu ${embedCode})` : ''}; YouTube'un mobil oynatıcısıyla burada oynatılıyor.
          </Text>
        </View>
        {actions}
        <WebView
          testID="yt-watch-webview"
          source={{ uri: mobileWatchUrl(video.id) }}
          style={{ flex: 1, backgroundColor: '#000' }}
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          allowsFullscreenVideo
          javaScriptEnabled
          domStorageEnabled
          setSupportMultipleWindows={false}
          onLoadEnd={() => setLoading(false)}
          onShouldStartLoadWithRequest={(req) => {
            const u = req.url || '';
            if (isExternalAppUrl(u)) return false; // YouTube uygulamasını açma
            if (/^(about|data|blob):/i.test(u)) return true;
            return isAllowedYouTubeHost(u);
          }}
        />
        {loading ? (
          <View style={[styles.loader, { top: 120 }]} pointerEvents="none">
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : null}
        {sheetEl}
      </View>
    );
  }

  const playerHeight = Math.round((width * 9) / 16);

  return (
    <View testID="yt-player" style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <Pressable testID="yt-player-back" onPress={() => navigation.goBack()} hitSlop={10} style={styles.back}>
          <Ionicons name="chevron-down" size={28} color={colors.text} />
        </Pressable>
        <Text style={styles.topLabel}>YOUTUBE</Text>
        <View style={styles.back} />
      </View>

      <View style={{ width, height: playerHeight, backgroundColor: '#000' }}>
        {error ? (
          <View style={styles.failBox}>
            <Ionicons name="alert-circle-outline" size={32} color={colors.textDim} />
            <Text style={styles.failText}>{error}</Text>
            <Pressable onPress={watchInApp} style={styles.ytBtn}>
              <Ionicons name="logo-youtube" size={18} color="#fff" />
              <Text style={styles.ytBtnText}>YouTube sayfasında izle</Text>
            </Pressable>
          </View>
        ) : (
          <WebView
            key={video.id}
            source={{ html: playerHtml(video.id), baseUrl: ORIGIN }}
            style={{ backgroundColor: '#000' }}
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            allowsFullscreenVideo
            javaScriptEnabled
            domStorageEnabled
            originWhitelist={['*']}
            setSupportMultipleWindows={false}
            onLoadEnd={() => setLoading(false)}
            onError={() => setError('Oynatıcı yüklenemedi. İnternet bağlantını kontrol et.')}
            onMessage={(e) => {
              try {
                const msg = JSON.parse(e.nativeEvent.data);
                if (msg.type === 'ready') setLoading(false);
                if (msg.type === 'error') {
                  // Gömülü oynatıcı reddetti: YouTube'un mobil oynatıcısına bu ekranda geç
                  setEmbedCode(msg.code);
                  if ([2, 100].includes(msg.code)) {
                    setLoading(false);
                    setError(EMBED_ERRORS[msg.code]);
                  } else {
                    setLoading(true);
                    setMode('watch');
                  }
                }
              } catch (err) {
                // yoksay
              }
            }}
            onShouldStartLoadWithRequest={(req) => {
              const u = req.url || '';
              if (isExternalAppUrl(u)) return false; // YouTube uygulamasını açma
              if (u.startsWith(ORIGIN) || /^(about|data|blob):/i.test(u)) return true;
              if (/youtube(-nocookie)?\.com\/(embed|iframe_api|s\/player)|ytimg\.com|googlevideo\.com|google\.com|gstatic\.com|doubleclick\.net/i.test(u)) {
                return true;
              }
              // Oynatıcıdaki başlık / "YouTube'da izle" gibi bağlantılar: başka video ise burada aç, değilse yok say
              const id = parseYouTubeId(u);
              if (id && id !== video.id) setVideo({ id, title: 'YouTube videosu', channel: '', duration: 0 });
              return false;
            }}
          />
        )}
        {loading && !error ? (
          <View style={styles.loader} pointerEvents="none">
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : null}
      </View>

      <ScrollView contentContainerStyle={styles.info}>
        <Text style={styles.title}>{video.title}</Text>
        {actions}
        {video.channel || video.duration ? (
          <Text style={styles.channel}>
            {[video.channel, video.duration ? formatTime(video.duration) : null].filter(Boolean).join(' · ')}
          </Text>
        ) : null}
        {video.license === 'creativeCommon' ? (
          <View style={styles.ccBadge}>
            <Text style={styles.ccText}>Creative Commons</Text>
          </View>
        ) : null}

        <View style={styles.note}>
          <Ionicons name="information-circle-outline" size={18} color={colors.textDim} />
          <Text style={styles.noteText}>
            YouTube videoları YouTube'un resmi oynatıcısıyla bu uygulamanın içinde izlenir. YouTube'un kuralları gereği bu
            videolar indirilemez ve ekran kapalıyken çalmaz. Çevrimdışı dinlemek için Arşivim veya İndir sekmelerini kullanabilirsin.
          </Text>
        </View>
      </ScrollView>
      {sheetEl}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.sm, height: 48 },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  topLabel: { color: colors.textDim, fontSize: 11, fontWeight: '800', letterSpacing: 1.4 },
  loader: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  failBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.sm, padding: space.lg },
  failText: { color: colors.textDim, fontSize: 14, textAlign: 'center' },
  info: { padding: space.lg, gap: space.md },
  title: { color: colors.text, fontSize: 19, fontWeight: '800', lineHeight: 25 },
  channel: { color: colors.textDim, fontSize: 14 },
  ccBadge: { alignSelf: 'flex-start', backgroundColor: colors.accentDim, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
  ccText: { color: colors.accent, fontSize: 11, fontWeight: '800' },
  ytBtn: { flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: '#CC0000', borderRadius: radius.pill, paddingHorizontal: space.lg, paddingVertical: space.sm },
  ytBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  actionsRow: { flexDirection: 'row', gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.sm },
  actionBtn: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: space.sm, borderRadius: radius.md, backgroundColor: colors.surface },
  actionText: { color: colors.text, fontSize: 12, fontWeight: '600' },
  modeNote: { flexDirection: 'row', gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.sm, alignItems: 'flex-start' },
  modeNoteText: { flex: 1, color: colors.textDim, fontSize: 12, lineHeight: 17 },
  note: { flexDirection: 'row', gap: space.sm, backgroundColor: colors.surface, borderRadius: radius.md, padding: space.md, marginTop: space.sm },
  noteText: { flex: 1, color: colors.textDim, fontSize: 13, lineHeight: 19 },
});
