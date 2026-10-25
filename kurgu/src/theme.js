// Kurgu görsel kimliği: koyu zemin, mor-turkuaz vurgu. (Özgün renk paleti.)
export const colors = {
  bg: '#0B0B0F',
  surface: '#15151C',
  surface2: '#1E1E28',
  surface3: '#2A2A36',
  border: '#2E2E3A',
  text: '#F4F4F8',
  textDim: '#A3A3B5',
  textFaint: '#85859A', // AA 4.5:1 surface ve surface2 üzerinde (replica/design/tokens.json)
  accent: '#8B6CFF',
  onAccent: '#0B0B0F', // vurgu zemini üstünde yazı (AA 5.3:1)
  accentSoft: 'rgba(139,108,255,0.18)',
  accent2: '#FF7EB6', // ikincil vurgu (pembe): referans uygulamanın camgöbeğinden ayrı aile
  danger: '#FF5A6E',
  warning: '#FFB547',
  success: '#3DDC97',
  clip: '#3A3A4C',
  clipSelected: '#FFFFFF',
  audio: '#1F7A5C',
  audioMusic: '#1E6E8C',
  text2: '#B8862B',
  effect: '#7A4FD6',
  overlayLayer: '#2F8F83',
  voice: '#2E8C6E',
  marker: '#FFB547',
  playhead: '#FFFFFF',
  overlay: 'rgba(0,0,0,0.6)',
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 6, md: 10, lg: 16, pill: 999 };
export const font = {
  title: { fontSize: 22, fontWeight: '700' },
  h2: { fontSize: 17, fontWeight: '700' },
  body: { fontSize: 15 },
  small: { fontSize: 13 },
  tiny: { fontSize: 11 },
};
// Editör düzeni (dp): referans kayıttan ölçüldü (replica/design/tokens.json "layout")
export const layout = { toolW: 64, toolbarH: 72, controlsH: 46, topBarH: 52 };
export const HIT = 44; // en küçük dokunma hedefi (dp)
