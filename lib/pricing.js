// Helpers de cálculo del módulo Pricing.
// Todo client-side: el dataset llega del RPC pricing_dataset
// y acá calculamos clasificación ABC, banda de margen y métricas derivadas.

export const CLASE_A = 0.80;
export const CLASE_B = 0.95;
export const MARGEN_ALTO = 45;
export const MARGEN_MEDIO = 30;

export function fmtCRC(n, opts = {}) {
  const v = parseFloat(n);
  if (!isFinite(v)) return '—';
  return '₡' + v.toLocaleString('es-CR', {
    maximumFractionDigits: opts.dec ?? 0,
    minimumFractionDigits: opts.dec ?? 0,
  });
}

export function fmtPct(n, dec = 1) {
  const v = parseFloat(n);
  if (!isFinite(v)) return '—';
  return v.toFixed(dec) + '%';
}

export function fmtNum(n, dec = 0) {
  const v = parseFloat(n);
  if (!isFinite(v)) return '—';
  return v.toLocaleString('es-CR', { maximumFractionDigits: dec, minimumFractionDigits: dec });
}

export function bandaMargen(margen) {
  const m = parseFloat(margen);
  if (!isFinite(m)) return 'Bajo';
  if (m >= MARGEN_ALTO) return 'Alto';
  if (m >= MARGEN_MEDIO) return 'Medio';
  return 'Bajo';
}

// Devuelve el dataset enriquecido con clase ABC y banda de margen.
// `metric` define sobre qué se hace el Pareto: 'venta_neta' | 'utilidad_neta'
export function enriquecer(rows, metric = 'venta_neta') {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const sorted = [...rows].sort((a, b) => Number(b[metric] || 0) - Number(a[metric] || 0));
  const total = sorted.reduce((s, r) => s + Number(r[metric] || 0), 0);
  let acum = 0;
  return sorted.map((r, idx) => {
    const v = Number(r[metric] || 0);
    acum += v;
    const pctIndividual = total > 0 ? v / total : 0;
    const pctAcumulado = total > 0 ? acum / total : 0;
    const clase = pctAcumulado <= CLASE_A ? 'A' : pctAcumulado <= CLASE_B ? 'B' : 'C';
    return {
      ...r,
      _rank: idx + 1,
      _pct_individual: pctIndividual,
      _pct_acumulado: pctAcumulado,
      _clase: clase,
      _banda: bandaMargen(r.margen_pct),
      _cuadrante: `${clase}-${bandaMargen(r.margen_pct)}`,
    };
  });
}

export const RECOMENDACIONES = {
  'A-Alto':  { color:'#10b981', emoji:'⭐', text:'ESTRELLA — proteger precio, asegurar stock, empujar en pauta' },
  'A-Medio': { color:'#3b82f6', emoji:'🐄', text:'VACA LECHERA — buscar +2-3pp de margen sin perder volumen' },
  'A-Bajo':  { color:'#ef4444', emoji:'🚨', text:'REVISAR YA — alto volumen y margen flaco. Subir precio.' },
  'B-Alto':  { color:'#8b5cf6', emoji:'💎', text:'NICHO RENTABLE — empujar contenido / boletín' },
  'B-Medio': { color:'#6b7280', emoji:'📊', text:'MANTENER' },
  'B-Bajo':  { color:'#f97316', emoji:'⚠️', text:'EVALUAR DESCONTINUAR o subir precio agresivo' },
  'C-Alto':  { color:'#a855f7', emoji:'👑', text:'PREMIUM — dejar quietos, son rentables aunque vendan poco' },
  'C-Medio': { color:'#9ca3af', emoji:'❓', text:'CANDIDATO A DESCONTINUAR' },
  'C-Bajo':  { color:'#dc2626', emoji:'🗑️', text:'LIQUIDAR — ocupan espacio y capital' },
};

export function diasInventario(qtyAnual, stock) {
  const q = Number(qtyAnual || 0);
  const s = Number(stock || 0);
  if (q <= 0 || s <= 0) return null;
  return Math.round((s / (q / 365)));
}

export function periodoPresets() {
  const today = new Date();
  const fmt = (d) => d.toISOString().slice(0, 10);
  const sub = (days) => {
    const d = new Date(today);
    d.setDate(d.getDate() - days);
    return fmt(d);
  };
  const startOfYear = () => {
    const d = new Date(today.getFullYear(), 0, 1);
    return fmt(d);
  };
  return [
    { key: '30d',  label: 'Últimos 30 días',  start: sub(30),  end: fmt(today) },
    { key: '90d',  label: 'Últimos 90 días',  start: sub(90),  end: fmt(today) },
    { key: '12m',  label: 'Últimos 12 meses', start: sub(365), end: fmt(today) },
    { key: '24m',  label: 'Últimos 24 meses', start: sub(730), end: fmt(today) },
    { key: 'ytd',  label: 'Año a la fecha',   start: startOfYear(), end: fmt(today) },
  ];
}
