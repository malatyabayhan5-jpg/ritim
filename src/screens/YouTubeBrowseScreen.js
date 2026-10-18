// API anahtarı yokken uygulama içi YouTube araması.
// YouTube'un kendi mobil sitesi (m.youtube.com) uygulamanın içindeki WebView'da gösterilir; gizli/yetkisiz API kullanılmaz.
// Bir videoya dokunulduğunda video uygulamanın kendi oynatıcısında (resmi IFrame oynatıcı) açılır.
// YouTube uygulamasını açmaya çalışan bağlantılar (intent://, vnd.youtube:) engellenir; kullanıcı uygulamada kalır.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { colors, space } from '../theme';
import { isExternalAppUrl, isAllowedYouTubeHost, mobileSearchUrl, parseYouTubeId } from '../services/youtubeService';

// Sonuç listesindeki video bağlantılarına dokunuşu yakalar ve uygulamaya bildirir
const INTERCEPT_JS = `
(function () {
  if (window.__ritimHooked) return true;
  window.__ritimHooked = true;
  function idFrom(href) {
    try {
      var u = new URL(href, location.href);
      if (/\\/watch$/.test(u.pathname)) return u.searchParams.get('v');
      var m = u.pathname.match(/^\\/(?:shorts|live)\\/([A-Za-z0-9_-]{11})/);
      return m ? m[1] : null;
    } catch (e) { return null; }
  }
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    var id = idFrom(a.getAttribute('href'));
    if (id && id.length === 11) {
      e.preventDefault();
      e.stopPropagation();
      var title = (a.getAttribute('aria-label') || a.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 200);
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'video', id: id, title: title }));
    }
  }, true);
  true;
})();
true;
`;

export default function YouTubeBrowseScreen({ route, navigation }) {
  const { query, startUrl, watchInline } = route.params || {};
  const insets = useSafeAreaInsets();
  const web = useRef(null);
  const canGoBack = useRef(false);
  const lastOpen = useRef({ id: null, at: 0 });
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [title, setTitle] = useState(query || 'YouTube');

  const uri = startUrl || mobileSearchUrl(query);

  const openVideo = useCallback(
    (id, videoTitle) => {
      const now = Date.now();
      if (lastOpen.current.id === id && now - lastOpen.current.at < 1500) return; // çift tetiklenmeyi önle
      lastOpen.current = { id, at: now };
      navigation.navigate('YouTubePlayer', {
        video: { id, title: videoTitle || 'YouTube videosu', channel: '', duration: 0 },
      });
    },
    [navigation]
  );

  // Android geri tuşu: önce WebView içinde geri git, sonra önceki ekrana dön (uygulamadan çıkma)
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (canGoBack.current && web.current) {
          web.current.goBack();
          return true;
        }
        return false; // gezinme yığını önceki ekrana döner
      });
      return () => sub.remove();
    }, [])
  );

  useEffect(() => setTitle(query || 'YouTube'), [query]);

  return (
    <View testID="yt-browse" style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <Pressable testID="yt-browse-back" onPress={() => navigation.goBack()} hitSlop={10} style={styles.btn}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.label}>YOUTUBE</Text>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
        </View>
        <Pressable
          onPress={() => {
            setFailed(false);
            web.current && web.current.reload();
          }}
          hitSlop={10}
          style={styles.btn}
        >
          <Ionicons name="refresh" size={22} color={colors.text} />
        </Pressable>
      </View>

      {failed ? (
        <View style={styles.fail}>
          <Ionicons name="cloud-offline-outline" size={40} color={colors.textFaint} />
          <Text style={styles.failTitle}>YouTube yüklenemedi</Text>
          <Text style={styles.failText}>İnternet bağlantını kontrol edip yenile.</Text>
        </View>
      ) : (
        <WebView
          ref={web}
          source={{ uri }}
          style={{ flex: 1, backgroundColor: colors.bg }}
          injectedJavaScript={watchInline ? undefined : INTERCEPT_JS}
          javaScriptEnabled
          domStorageEnabled
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction
          setSupportMultipleWindows={false}
          allowsBackForwardNavigationGestures
          onLoadEnd={() => setLoading(false)}
          onError={() => setFailed(true)}
          onMessage={(e) => {
            try {
              const msg = JSON.parse(e.nativeEvent.data);
              if (msg && msg.type === 'video' && msg.id) openVideo(msg.id, msg.title);
            } catch (err) {
              // yoksay
            }
          }}
          onNavigationStateChange={(nav) => {
            canGoBack.current = nav.canGoBack;
            // Tek sayfa uygulaması içinde izleme sayfasına geçilirse: videoyu kendi oynatıcımızda aç, listeye dön
            if (!watchInline) {
              const id = parseYouTubeId(nav.url);
              if (id) {
                openVideo(id, nav.title && !/^YouTube$/i.test(nav.title) ? nav.title.replace(/ - YouTube$/, '') : '');
                if (nav.canGoBack && web.current) web.current.goBack();
              }
            }
          }}
          onShouldStartLoadWithRequest={(req) => {
            const u = req.url || '';
            // YouTube uygulamasını açmaya çalışan bağlantıları engelle
            if (isExternalAppUrl(u)) return false;
            if (/^(about|data|blob):/i.test(u)) return true;
            if (!/^https?:/i.test(u)) return false;
            if (!watchInline) {
              const id = parseYouTubeId(u);
              if (id) {
                openVideo(id, '');
                return false;
              }
            }
            // YouTube/Google dışındaki sayfalar (reklam, dış bağlantı) uygulama içinde açılmaz
            return isAllowedYouTubeHost(u);
          }}
        />
      )}
      {loading && !failed ? (
        <View style={styles.loader} pointerEvents="none">
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.sm,
    height: 52,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  btn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  label: { color: colors.textDim, fontSize: 10, fontWeight: '800', letterSpacing: 1.4 },
  title: { color: colors.text, fontSize: 15, fontWeight: '700', marginTop: 1 },
  loader: { position: 'absolute', left: 0, right: 0, top: 120, alignItems: 'center' },
  fail: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.sm, padding: space.xxl },
  failTitle: { color: colors.text, fontSize: 17, fontWeight: '700' },
  failText: { color: colors.textDim, fontSize: 14, textAlign: 'center' },
});
