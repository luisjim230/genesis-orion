export const GOLD = '#c8a84b'
export const BG = 'linear-gradient(135deg, #e8ecf4 0%, #d5dde8 30%, #e0e7f0 60%, #edf1f7 100%)'
export const CARD_BG = 'rgba(255,255,255,0.55)'
export const BLUR = 'blur(24px) saturate(1.8)'
export const BORDER = '1px solid rgba(255,255,255,0.6)'
export const SHADOW = '0 4px 30px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.8)'
export const TEXT = 'rgba(0,0,0,0.85)'
export const MUTED = 'rgba(0,0,0,0.5)'

export const S = {
  card: { background: CARD_BG, backdropFilter: BLUR, WebkitBackdropFilter: BLUR, border: BORDER, borderRadius: 20, padding: '20px 24px', boxShadow: SHADOW, marginBottom: 14 },
  badge: (c) => ({ background: c + '18', color: c, border: `1px solid ${c}44`, borderRadius: 20, padding: '3px 12px', fontSize: '0.74em', fontWeight: 600, display: 'inline-block' }),
  btn: (c, outline) => ({ background: outline ? 'transparent' : c, color: outline ? c : '#fff', border: `1.5px solid ${c}`, borderRadius: 12, padding: '7px 18px', fontSize: '0.82em', fontWeight: 600, cursor: 'pointer', transition: 'all .2s', fontFamily: 'Rubik' }),
  input: { width: '100%', padding: '10px 14px', borderRadius: 12, border: '1px solid rgba(0,0,0,0.12)', background: 'rgba(255,255,255,0.7)', fontSize: '0.9em', fontFamily: 'Rubik', color: TEXT, outline: 'none', boxSizing: 'border-box' },
  label: { fontSize: '0.78em', color: MUTED, marginBottom: 4, display: 'block' },
}

export function calcDias(ini, fin) {
  if (!ini || !fin) return 0
  let d = new Date(ini + 'T00:00:00'), end = new Date(fin + 'T00:00:00'), count = 0
  while (d <= end) { const dow = d.getDay(); if (dow >= 1 && dow <= 6) count++; d.setDate(d.getDate() + 1) }
  return count
}

export function calcHoras(hi, hf) {
  if (!hi || !hf) return 0
  const [h1, m1] = hi.split(':').map(Number)
  const [h2, m2] = hf.split(':').map(Number)
  const diff = (h2 * 60 + m2) - (h1 * 60 + m1)
  return diff > 0 ? Math.round(diff / 60 * 10) / 10 : 0
}

export function fmtFecha(f) {
  if (!f) return '—'
  const [y, m, d] = f.split('-')
  return `${d}/${m}/${y}`
}

export function iniciales(nombre) {
  if (!nombre) return '?'
  return nombre.trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase()).join('')
}

export function colorAvatar(nombre) {
  const colores = ['#3b82f6', '#8b5cf6', '#06b6d4', '#22c55e', '#f97316', '#ec4899', '#14b8a6', '#a855f7']
  let h = 0
  for (let i = 0; i < (nombre || '').length; i++) h = (h * 31 + nombre.charCodeAt(i)) >>> 0
  return colores[h % colores.length]
}
