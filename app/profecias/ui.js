'use client';

export const COLORES = {
  oro: '#c8a84b',
  oroSuave: 'rgba(200,168,75,0.15)',
  fondo: '#f0f2f5',
  texto: '#1c1f26',
  rojoFuerte: '#9B2C2C',
  rojo: '#E53E3E',
  amarillo: '#D69E2E',
  verde: '#38A169',
  gris: '#718096',
  grisSuave: '#EDF2F7',
};

export const SEMAFORO = {
  rojo_critico:    { emoji: '⚫', label: 'Quebrado', color: '#9B2C2C' },
  rojo:            { emoji: '🔴', label: 'Pedir YA', color: '#E53E3E' },
  amarillo:        { emoji: '🟡', label: 'Pedir pronto', color: '#D69E2E' },
  verde:           { emoji: '🟢', label: 'Saludable', color: '#38A169' },
  gris_excedente:  { emoji: '🟦', label: 'Sobre-stock', color: '#3182CE' },
  gris_sin_demanda:{ emoji: '⚪', label: 'Sin demanda', color: '#718096' },
  gris_sin_datos:  { emoji: '⚪', label: 'Sin datos', color: '#A0AEC0' },
};

export const MADUREZ = {
  recien_nacido: { emoji: '🆕', label: 'Recién nacido', color: '#805AD5' },
  validacion:    { emoji: '🌱', label: 'Validación',    color: '#3182CE' },
  joven:         { emoji: '📈', label: 'Joven',         color: '#38A169' },
  maduro:        { emoji: '🏛️', label: 'Maduro',        color: '#1c1f26' },
  sin_ventas:    { emoji: '⚪', label: 'Sin ventas',    color: '#A0AEC0' },
};

export const CLASIFICACIONES = [
  { value: 'normal',               label: 'Normal' },
  { value: 'en_promocion',         label: 'En promoción' },
  { value: 'falta_promocion',      label: 'Falta promoción' },
  { value: 'estacional',           label: 'Estacional' },
  { value: 'dormido_discontinuar', label: 'Dormido / discontinuar' },
];

export const CONFIANZA = {
  alta:   { label: 'Alta',   color: '#38A169' },
  media:  { label: 'Media',  color: '#3182CE' },
  baja:   { label: 'Baja',   color: '#D69E2E' },
  manual: { label: 'Manual', color: '#805AD5' },
};

export function fmtNum(v, digitos = 0) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('es-CR', { minimumFractionDigits: digitos, maximumFractionDigits: digitos });
}

export function fmtMoney(v, moneda = 'CRC') {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  if (moneda === 'USD') return '$' + n.toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return '₡' + Math.round(n).toLocaleString('es-CR');
}

export function fmtFecha(s) {
  if (!s) return '—';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString('es-CR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function diasDesde(s) {
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

export function SemaforoBadge({ value, mini }) {
  const s = SEMAFORO[value] || { emoji: '·', label: value || '—', color: '#718096' };
  return (
    <span title={s.label} style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: mini ? 13 : 14,
      color: s.color, fontWeight: 600,
    }}>
      <span style={{ fontSize: mini ? 14 : 16 }}>{s.emoji}</span>
      {!mini && <span>{s.label}</span>}
    </span>
  );
}

export function MadurezBadge({ value }) {
  const m = MADUREZ[value] || { emoji: '·', label: value || '—', color: '#718096' };
  return (
    <span title={m.label} style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 999,
      background: 'rgba(0,0,0,0.04)', color: m.color,
      fontSize: 12, fontWeight: 600,
    }}>
      <span>{m.emoji}</span>
      <span>{m.label}</span>
    </span>
  );
}

export function ConfianzaIndicator({ value }) {
  const c = CONFIANZA[value] || { label: value || '—', color: '#718096' };
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 4,
      fontSize: 11, fontWeight: 700, color: '#fff', background: c.color,
    }}>{c.label}</span>
  );
}

export function BanderasIcons({ row }) {
  const banderas = [];
  if (row.bandera_stockout) banderas.push({ k: 'stockout', icon: '🔄', label: 'Stockout: cliente vino sin stock' });
  if (row.bandera_discontinuar) banderas.push({ k: 'disc', icon: '⚠️', label: 'Sin venta reciente: posible discontinuar' });
  if (row.proveedor_pausado) banderas.push({ k: 'paus', icon: '⏸️', label: 'Proveedor pausado' });
  if (row.oculto_compras) banderas.push({ k: 'oc', icon: '🙈', label: 'Oculto del módulo de compras' });
  if (!banderas.length) return null;
  return (
    <span style={{ display: 'inline-flex', gap: 4 }}>
      {banderas.map((b) => (
        <span key={b.k} title={b.label} style={{ fontSize: 14, cursor: 'help' }}>{b.icon}</span>
      ))}
    </span>
  );
}

export function TendenciaIndicator({ pct }) {
  const n = Number(pct);
  if (!Number.isFinite(n) || Math.abs(n) < 0.5) return <span style={{ color: '#718096' }}>—</span>;
  const up = n > 0;
  return (
    <span style={{ color: up ? '#38A169' : '#E53E3E', fontWeight: 600 }}>
      {up ? '↑' : '↓'} {Math.abs(n).toFixed(1)}%
    </span>
  );
}
