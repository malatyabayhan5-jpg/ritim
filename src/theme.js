export const colors = {
  bg: '#0D0E12',
  surface: '#16181F',
  surface2: '#1F222B',
  border: '#2A2E39',
  text: '#F2F3F5',
  textDim: '#9AA0AD',
  textFaint: '#5F6573',
  accent: '#F5A524',
  accentDim: 'rgba(245,165,36,0.16)',
  onAccent: '#17120A',
  danger: '#F2555A',
};

export const radius = { sm: 6, md: 10, lg: 16, xl: 24, pill: 999 };

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const type = {
  hero: { fontSize: 30, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  h1: { fontSize: 24, fontWeight: '800', color: colors.text, letterSpacing: -0.3 },
  h2: { fontSize: 18, fontWeight: '700', color: colors.text },
  body: { fontSize: 15, color: colors.text },
  bodyDim: { fontSize: 14, color: colors.textDim },
  small: { fontSize: 12, color: colors.textDim },
  label: { fontSize: 11, fontWeight: '700', color: colors.textDim, letterSpacing: 1.2, textTransform: 'uppercase' },
};

export function formatTime(sec) {
  if (!sec || !isFinite(sec) || sec < 0) return '0:00';
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r < 10 ? '0' : ''}${r}`;
}
