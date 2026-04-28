// Estilos compartidos para el módulo Métricas Web — Liquid Glass Light Mode.
export const GOLD = '#c8a84b';
export const BURGUNDY = '#5E2733';
export const ORANGE = '#ED6E2E';
export const TEAL = '#225F74';
export const GREEN = '#2e7d4f';
export const RED = '#c04040';
export const AMBER = '#c8882b';
export const BLUE = '#3d8ef8';
export const PURPLE = '#9b87f5';

export const S = {
  page: {
    background: 'linear-gradient(135deg, #e8ecf4 0%, #d5dde8 30%, #e0e7f0 60%, #edf1f7 100%)',
    minHeight: '100vh',
    padding: '28px 32px',
    fontFamily: 'Rubik, sans-serif',
    color: 'rgba(0,0,0,0.8)',
  },
  title: { fontSize: '1.7rem', fontWeight: 700, color: 'rgba(0,0,0,0.85)', margin: 0, letterSpacing: '-0.02em' },
  caption: { fontSize: '0.85rem', color: 'rgba(0,0,0,0.45)', marginTop: '4px', marginBottom: '24px' },
  card: {
    background: 'rgba(255,255,255,0.55)',
    backdropFilter: 'blur(24px) saturate(1.8)',
    WebkitBackdropFilter: 'blur(24px) saturate(1.8)',
    border: '1px solid rgba(255,255,255,0.6)',
    borderRadius: 20,
    padding: 22,
    marginBottom: 16,
    boxShadow: '0 4px 30px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.8)',
  },
  cardInner: {
    background: 'rgba(255,255,255,0.4)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border: '1px solid rgba(255,255,255,0.5)',
    borderRadius: 14,
    padding: 16,
    boxShadow: '0 2px 12px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.7)',
  },
  input: {
    background: 'rgba(255,255,255,0.6)',
    border: '1px solid rgba(0,0,0,0.1)',
    borderRadius: 10,
    color: 'rgba(0,0,0,0.85)',
    padding: '10px 14px',
    fontSize: '0.95rem',
    width: '100%',
    outline: 'none',
    boxSizing: 'border-box',
    backdropFilter: 'blur(8px)',
    fontFamily: 'inherit',
  },
  btnPrimary: {
    background: `linear-gradient(135deg, ${GOLD}, #a08930)`,
    color: '#fff',
    border: 'none',
    borderRadius: 10,
    padding: '10px 22px',
    fontWeight: 600,
    cursor: 'pointer',
    fontSize: '0.92rem',
    boxShadow: '0 4px 20px rgba(200,168,75,0.25)',
    transition: 'all 0.15s',
    fontFamily: 'inherit',
    whiteSpace: 'nowrap',
  },
  btnGhost: {
    background: 'rgba(255,255,255,0.55)',
    color: 'rgba(0,0,0,0.7)',
    border: '1px solid rgba(0,0,0,0.1)',
    borderRadius: 10,
    padding: '10px 18px',
    cursor: 'pointer',
    fontSize: '0.88rem',
    backdropFilter: 'blur(12px)',
    transition: 'all 0.15s',
    fontFamily: 'inherit',
    whiteSpace: 'nowrap',
  },
  label: { fontSize: '0.78rem', color: 'rgba(0,0,0,0.5)', marginBottom: 6, display: 'block', fontWeight: 500, letterSpacing: '0.02em' },
  sectionTitle: { fontSize: '1.15rem', fontWeight: 700, color: 'rgba(0,0,0,0.85)', marginBottom: 4, marginTop: 8 },
  sectionCap: { fontSize: '0.82rem', color: 'rgba(0,0,0,0.5)', marginBottom: 16 },
  divider: { border: 'none', borderTop: '1px solid rgba(0,0,0,0.08)', margin: '24px 0' },
  metric: {
    background: 'rgba(255,255,255,0.6)',
    border: '1px solid rgba(0,0,0,0.06)',
    borderRadius: 14,
    padding: '16px 18px',
  },
  pillTab: (active) => ({
    background: active ? `linear-gradient(135deg, ${GOLD}, #a08930)` : 'rgba(255,255,255,0.55)',
    color: active ? '#fff' : 'rgba(0,0,0,0.65)',
    border: active ? '1px solid rgba(200,168,75,0.6)' : '1px solid rgba(0,0,0,0.08)',
    borderRadius: 12,
    padding: '9px 16px',
    cursor: 'pointer',
    fontSize: '0.86rem',
    fontWeight: 600,
    fontFamily: 'inherit',
    transition: 'all 0.15s',
    whiteSpace: 'nowrap',
    boxShadow: active ? '0 4px 16px rgba(200,168,75,0.25)' : 'none',
  }),
};

// Helpers de formateo.
export const fmtInt = (n) => Number(n || 0).toLocaleString('es-CR');
export const fmtPct = (n, signed = true) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  const sign = signed && v > 0 ? '+' : '';
  return `${sign}${v.toFixed(1)}%`;
};
export const fmtSecs = (s) => {
  const v = Number(s) || 0;
  if (v < 60) return `${v.toFixed(0)}s`;
  const m = Math.floor(v / 60);
  const r = Math.round(v % 60);
  return `${m}m ${r}s`;
};
export const fmtUSD = (n) =>
  '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export const SOURCE_OPTIONS = [
  { key: 'facebook',  label: 'Facebook',   color: '#1877F2', emoji: '📘' },
  { key: 'instagram', label: 'Instagram',  color: '#E1306C', emoji: '📷' },
  { key: 'tiktok',    label: 'TikTok',     color: '#000000', emoji: '🎵' },
  { key: 'whatsapp',  label: 'WhatsApp',   color: '#25D366', emoji: '💬' },
  { key: 'youtube',   label: 'YouTube',    color: '#FF0000', emoji: '▶️' },
  { key: 'email',     label: 'Email',      color: '#666',    emoji: '✉️' },
];

export const MEDIUM_OPTIONS = [
  { key: 'organico', label: 'Post / Reel orgánico', emoji: '🌱' },
  { key: 'pagado',   label: 'Anuncio pagado',       emoji: '💰' },
  { key: 'bio',      label: 'Link en bio',          emoji: '🔗' },
  { key: 'historia', label: 'Historia / Story',     emoji: '✨' },
];

export const DATE_RANGES = [
  { key: '7d',   label: 'Últimos 7 días' },
  { key: '14d',  label: 'Últimos 14 días' },
  { key: '28d',  label: 'Últimos 28 días' },
  { key: '90d',  label: 'Últimos 90 días' },
  { key: 'today',     label: 'Hoy' },
  { key: 'yesterday', label: 'Ayer' },
];
