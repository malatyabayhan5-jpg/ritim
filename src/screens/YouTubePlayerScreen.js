// YouTube videolarını YouTube'un resmi gömülü oynatıcısıyla (IFrame) açar.
// İndirme yoktur; arka planda çalma YouTube'un gömülü oynatıcısında desteklenmez.
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { colors, formatTime, radius, space } from '../theme';
import { watchUrl } from '../services/youtubeService';
import { usePlayer } from '../context/PlayerContext';

const ORIGIN = 'https://com.ritim.muzik';

function embedHtml(videoId) {
  const id = encodeURIComponent(videoId);
  return `<!doctype html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<meta name="referrer" content="strict-origin-when-cross-origin">
<style>html,body{margin:0;padding:0;background:#000;height:100%;overflow:hidden}
iframe{position:absolute;inset:0;width:100%;height:100%;border:0}</style>
</head><body>
<iframe src="https://www.youtube.com/embed/${id}?playsinline=1&autoplay=1&rel=0&modestbranding=1&origin=${encodeURIComponent(ORIGIN)}"
 referrerpolicy="strict-origin-when-cross-origin"
 allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>
</body></html>`;
}

export default function YouTubePlayerScreen({ route, navigation }) {
  const { video } = route.params;
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { isPlaying, togglePlay } = usePlayer();
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  // Yerel oynatıcı çalıyorsa iki ses üst üste binmesin
  useEffect(() => {
    if (isPlaying) togglePlay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openInYouTube = () => Linking.openURL(watchUrl(video.id)).catch(() => {});
  const playerHeight = Math.round((width * 9) / 16);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.back}>
          <Ionicons name="chevron-down" size={28} color={colors.text} />
        </Pressable>
        <Text style={styles.topLabel}>YOUTUBE</Text>
        <View style={styles.back} />
      </View>

      <View style={{ width, height: playerHeight, backgroundColor: '#000' }}>
        {failed ? (
          <View style={styles.failBox}>
            <Ionicons name="alert-circle-outline" size={32} color={colors.textDim} />
            <Text style={styles.failText}>Video uygulama içinde açılamadı.</Text>
            <Pressable onPress={openInYouTube} style={styles.ytBtn}>
              <Ionicons name="logo-youtube" size={18} color="#fff" />
              <Text style={styles.ytBtnText}>YouTube'da aç</Text>
            </Pressable>
          </View>
        ) : (
          <WebView
            source={{ html: embedHtml(video.id), baseUrl: ORIGIN }}
            style={{ backgroundColor: '#000' }}
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            allowsFullscreenVideo
            javaScriptEnabled
            domStorageEnabled
            originWhitelist={['*']}
            setSupportMultipleWindows={false}
            onLoadEnd={() => setLoading(false)}
            onError={() => setFailed(true)}
            onHttpError={() => setFailed(true)}
            onShouldStartLoadWithRequest={(req) => {
              // Oynatıcı içindeki "YouTube'da izle" gibi bağlantıları dışarıda aç
              const u = req.url || '';
              if (u.startsWith(ORIGIN) || u.startsWith('about:') || u.includes('youtube.com/embed') || u.startsWith('data:')) return true;
              if (u.includes('youtube.com') || u.includes('youtu.be')) {
                Linking.openURL(u).catch(() => {});
                return false;
              }
              return true;
            }}
          />
        )}
        {loading && !failed ? (
          <View style={styles.loader} pointerEvents="none">
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : null}
      </View>

      <ScrollView contentContainerStyle={styles.info}>
        <Text style={styles.title}>{video.title}</Text>
        <Text style={styles.channel}>
          {[video.channel, video.duration ? formatTime(video.duration) : null].filter(Boolean).join(' · ')}
        </Text>
        {video.license === 'creativeCommon' ? (
          <View style={styles.ccBadge}>
            <Text style={styles.ccText}>Creative Commons</Text>
          </View>
        ) : null}

        <Pressable onPress={openInYouTube} style={styles.ytBtnWide}>
          <Ionicons name="logo-youtube" size={20} color="#fff" />
          <Text style={styles.ytBtnText}>YouTube uygulamasında aç</Text>
        </Pressable>

        <View style={styles.note}>
          <Ionicons name="information-circle-outline" size={18} color={colors.textDim} />
          <Text style={styles.noteText}>
            YouTube videoları YouTube'un resmi oynatıcısıyla izlenir. YouTube'un kuralları gereği bu videolar indirilemez ve
            ekran kapalıyken çalmaz. Çevrimdışı dinlemek için Arşivim veya İndir sekmelerini kullanabilirsin.
          </Text>
        </View>
      </ScrollView>
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
  failText: { color: colors.textDim, fontSize: 14 },
  info: { padding: space.lg, gap: space.md },
  title: { color: colors.text, fontSize: 19, fontWeight: '800', lineHeight: 25 },
  channel: { color: colors.textDim, fontSize: 14 },
  ccBadge: { alignSelf: 'flex-start', backgroundColor: colors.accentDim, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
  ccText: { color: colors.accent, fontSize: 11, fontWeight: '800' },
  ytBtn: { flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: '#CC0000', borderRadius: radius.pill, paddingHorizontal: space.lg, paddingVertical: space.sm },
  ytBtnWide: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    backgroundColor: '#CC0000',
    borderRadius: radius.pill,
    height: 48,
    marginTop: space.sm,
  },
  ytBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  note: { flexDirection: 'row', gap: space.sm, backgroundColor: colors.surface, borderRadius: radius.md, padding: space.md, marginTop: space.sm },
  noteText: { flex: 1, color: colors.textDim, fontSize: 13, lineHeight: 19 },
});
