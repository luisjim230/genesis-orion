'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { supabase as sb } from '../../../lib/supabase';

// ── Estilos — mismo look que /app/finanzas/page.js ─────────────────────────
const S = {
  page:   { background: 'var(--cream)', minHeight: '100vh', padding: '28px 32px', fontFamily: 'DM Sans,sans-serif', color: 'var(--text-primary)' },
  title:  { fontSize: '1.7rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 },
  cap:    { fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '4px', marginBottom: '24px' },
  div:    { border: 'none', borderTop: '1px solid var(--border-soft)', margin: '20px 0' },
  tabs:   { display: 'flex', gap: '4px', marginBottom: '24px', flexWrap: 'wrap' },
  tab:    (a) => ({ background: a ? 'var(--orange)' : '#fff', color: a ? '#fff' : 'var(--text-muted)', border: '1px solid ' + (a ? 'var(--orange)' : 'var(--border)'), borderRadius: '8px', padding: '8px 16px', cursor: 'pointer', fontWeight: a ? 700 : 400, fontSize: '0.88rem' }),
  g4:     { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px', marginBottom: '20px' },
  kpi:    { background: '#fff', borderRadius: '12px', padding: '16px', border: '1px solid var(--border-soft)' },
  kpiL:   { fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '6px' },
  kpiV:   { fontSize: '1.4rem', fontWeight: 700, color: 'var(--orange)' },
  inp:    { background: 'var(--cream)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)', padding: '8px 12px', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' },
  btn:    { background: '#fff', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 16px', cursor: 'pointer', fontSize: '0.88rem' },
  info:   { background: '#EBF8FF', border: '1px solid #BEE3F8', borderRadius: '8px', padding: '14px', color: '#2C5282', fontSize: '0.88rem' },
};

// ── Utilidades ─────────────────────────────────────────────────────────────
const N = (v) => {
  if (v == null || v === '') return 0;
  return parseFloat(String(v).replace(/,/g, '').replace(/\s/g, '')) || 0;
};

const fC = (v) => '₡' + Math.abs(N(v)).toLocaleString('es-CR', { maximumFractionDigits: 0 });

const fCShort = (v) => {
  const n = Math.abs(N(v));
  if (n >= 1_000_000) return '₡' + (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return '₡' + (n / 1_000).toFixed(0) + 'K';
  return '₡' + n.toFixed(0);
};

// "70-30-12-01 Combustible y lubricantes" → "Combustible y lubricantes"
const cleanName = (cta) => cta?.replace(/^[\d-]+\s*/, '').trim() || cta || '—';

// ── Categorías ──────────────────────────────────────────────────────────────
const CATS = [
  { key: 'Nómina',            color: '#6366f1', icon: '👥', keywords: ['sueld','ccss','aguinaldo','vacacion','cesant'] },
  { key: 'Operativo',         color: '#f59e0b', icon: '🔧', keywords: ['combustible','mantenimiento','empaque','encomienda'] },
  { key: 'Viáticos',          color: '#f97316', icon: '🍽️', keywords: ['viatico','alimento'] },
  { key: 'Alquileres',        color: '#10b981', icon: '🏢', codePrefix: ['70-30-18'], keywords: ['alquiler'] },
  { key: 'Servicios Públicos', color: '#06b6d4', icon: '💡', keywords: ['internet','teléfono','telefono','agua ','luz ','energia','electricid'] },
  { key: 'Comercial',         color: '#ec4899', icon: '📣', keywords: ['publicidad','capacitacion','comision'] },
  { key: 'Servicios Prof.',   color: '#8b5cf6', icon: '🛡️', keywords: ['seguridad','servicios profesionales','dominio','rastreo','profesional'] },
  { key: 'Depreciación',      color: '#6b7280', icon: '📉', codePrefix: ['70-80'] },
  { key: 'Financiero',        color: '#ef4444', icon: '🏦', codePrefix: ['90'] },
];

function categorize(cta) {
  if (!cta) return 'Otros';
  const code = cta.split(' ')[0].trim();
  const desc = cta.toLowerCase();
  for (const cat of CATS) {
    if (cat.codePrefix?.some(p => code.startsWith(p))) return cat.key;
    if (cat.keywords?.some(k => desc.includes(k)))     return cat.key;
  }
  return 'Otros';
}

const CAT_MAP = Object.fromEntries(CATS.map(c => [c.key, c]));
CAT_MAP['Otros'] = { key: 'Otros', color: '#64748b', icon: '📦' };

function getCode(cta) { return cta?.split(' ')[0].trim() || ''; }
function isIngreso(cta) { return getCode(cta).startsWith('40'); }
function isCosto(cta)   { return getCode(cta).startsWith('50'); }
function isGasto(cta)   { const c = getCode(cta); return c.startsWith('70') || c.startsWith('77') || c.startsWith('90'); }

// ── Fetch paginado por mes ─────────────────────────────────────────────────
async function fetchByMonth(yearMonth) {
  const [y, m] = yearMonth.split('-').map(Number);
  const from = `${yearMonth}-01`;
  const to   = `${yearMonth}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
  let all = [], off = 0;
  while (true) {
    const { data, error } = await sb
      .from('neo_movimientos_contables')
      .select('fecha,cuenta_contable,debe_contabilidad,haber_contabilidad')
      .not('fecha', 'is', null)
      .not('cuenta_contable', 'is', null)
      .gte('fecha', from).lte('fecha', to)
      .range(off, off + 999);
    if (error || !data?.length) break;
    all = [...all, ...data];
    if (data.length < 1000) break;
    off += 1000;
  }
  return all;
}

// ── Componentes UI ─────────────────────────────────────────────────────────
function SyncBadge({ fecha }) {
  if (!fecha) return null;
  const f = new Date(fecha).toLocaleString('es-CR', {
    timeZone: 'America/Costa_Rica', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  return (
    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
      📅 Datos al: <strong style={{ color: 'var(--text-primary)' }}>{f}</strong>
    </span>
  );
}

function KPI({ label, value, color, sub }) {
  return (
    <div style={S.kpi}>
      <div style={S.kpiL}>{label}</div>
      <div style={{ ...S.kpiV, color: color || 'var(--orange)' }}>{value}</div>
      {sub && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>{sub}</div>}
    </div>
  );
}

// ── SVG Pie Chart (donut) ──────────────────────────────────────────────────
function PieChart({ data, selected, onSelect }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <div style={{ color: 'var(--text-muted)', padding: '40px', textAlign: 'center' }}>Sin datos</div>;

  const CX = 110, CY = 110, R = 88, RI = 44;
  let angle = -Math.PI / 2;

  const slices = data.filter(d => d.value > 0).map(d => {
    const sweep = (d.value / total) * 2 * Math.PI;
    const end   = angle + sweep;
    const cos0  = Math.cos(angle), sin0 = Math.sin(angle);
    const cos1  = Math.cos(end),   sin1 = Math.sin(end);
    const large = sweep > Math.PI ? 1 : 0;
    const path  = `M ${CX+RI*cos0} ${CY+RI*sin0} L ${CX+R*cos0} ${CY+R*sin0} A ${R} ${R} 0 ${large} 1 ${CX+R*cos1} ${CY+R*sin1} L ${CX+RI*cos1} ${CY+RI*sin1} A ${RI} ${RI} 0 ${large} 0 ${CX+RI*cos0} ${CY+RI*sin0} Z`;
    const slice = { ...d, path, pct: d.value / total };
    angle = end;
    return slice;
  });

  return (
    <svg width="220" height="220" viewBox="0 0 220 220" style={{ overflow: 'visible' }}>
      {slices.map((s, i) => (
        <path
          key={i} d={s.path} fill={s.color}
          opacity={!selected || selected === s.label ? 1 : 0.2}
          stroke="#fff" strokeWidth="2"
          style={{ cursor: 'pointer', transform: selected === s.label ? 'scale(1.04)' : 'scale(1)', transformOrigin: `${CX}px ${CY}px`, transition: 'opacity 0.2s, transform 0.15s' }}
          onClick={() => onSelect(selected === s.label ? null : s.label)}
        >
          <title>{s.label}: {fC(s.value)} ({(s.pct * 100).toFixed(1)}%)</title>
        </path>
      ))}
      <text x={CX} y={CY - 5} textAnchor="middle" fill="var(--text-muted)" fontSize="11">Total</text>
      <text x={CX} y={CY + 12} textAnchor="middle" fill="var(--orange)" fontSize="12" fontWeight="700">{fCShort(total)}</text>
    </svg>
  );
}

// ── SVG Bar Chart ──────────────────────────────────────────────────────────
function BarChart({ months }) {
  if (!months.length) return null;
  const W = 560, H = 160, PL = 55, PR = 16, PT = 10;
  const IW = W - PL - PR;
  const maxV = Math.max(...months.flatMap(m => [m.ingresos, m.gastos, 1]));
  const bw  = Math.max(8, (IW / months.length) / 2 - 6);
  const gap = IW / months.length;

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H + 40}`} preserveAspectRatio="xMidYMid meet" style={{ display: 'block' }}>
      {[0, 0.25, 0.5, 0.75, 1].map(p => {
        const y = PT + H - p * H;
        return (
          <g key={p}>
            <line x1={PL} y1={y} x2={W - PR} y2={y} stroke="#e2e8f0" strokeWidth="1" strokeDasharray="4 4" />
            <text x={PL - 4} y={y + 4} textAnchor="end" fill="#94a3b8" fontSize="9">{fCShort(maxV * p)}</text>
          </g>
        );
      })}
      {months.map((m, i) => {
        const cx   = PL + i * gap + gap / 2;
        const ingH = (m.ingresos / maxV) * H;
        const gasH = (m.gastos   / maxV) * H;
        return (
          <g key={i}>
            <rect x={cx - bw - 2} y={PT + H - ingH} width={bw} height={ingH} fill="#10b981" rx="2"><title>Ingresos: {fC(m.ingresos)}</title></rect>
            <rect x={cx + 2}      y={PT + H - gasH}  width={bw} height={gasH} fill="#ef4444" rx="2"><title>Gastos: {fC(m.gastos)}</title></rect>
            <text x={cx} y={PT + H + 16} textAnchor="middle" fill="#64748b" fontSize="9">{m.label}</text>
          </g>
        );
      })}
      <line x1={PL} y1={PT + H} x2={W - PR} y2={PT + H} stroke="#cbd5e1" strokeWidth="1" />
      <rect x={W - PR - 80} y={PT}      width="10" height="10" fill="#10b981" rx="2" />
      <text x={W - PR - 67} y={PT + 9}  fill="#64748b" fontSize="9">Ingresos</text>
      <rect x={W - PR - 80} y={PT + 14} width="10" height="10" fill="#ef4444" rx="2" />
      <text x={W - PR - 67} y={PT + 23} fill="#64748b" fontSize="9">Gastos</text>
    </svg>
  );
}

// ── Tab: Desglose de Gastos ─────────────────────────────────────────────────
function TabDesglose({ rows }) {
  const [selected, setSelected] = useState(null);
  const [expanded, setExpanded] = useState(new Set());

  const grouped = useMemo(() => {
    const map = {};
    rows.filter(r => isGasto(r.cuenta_contable)).forEach(r => {
      const cat  = categorize(r.cuenta_contable);
      const name = cleanName(r.cuenta_contable);
      if (!map[cat]) map[cat] = { total: 0, accounts: {} };
      map[cat].total += N(r.debe_contabilidad);
      map[cat].accounts[name] = (map[cat].accounts[name] || 0) + N(r.debe_contabilidad);
    });
    return Object.entries(map)
      .map(([k, v]) => ({
        label: k,
        value: v.total,
        accounts: Object.entries(v.accounts)
          .map(([name, amt]) => ({ name, amt }))
          .sort((a, b) => b.amt - a.amt),
        ...(CAT_MAP[k] || CAT_MAP['Otros']),
      }))
      .sort((a, b) => b.value - a.value);
  }, [rows]);

  const total = grouped.reduce((s, d) => s + d.value, 0);
  const displayed = selected ? grouped.filter(d => d.label === selected) : grouped;

  function toggleRow(label) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(label)) { next.delete(label); }
      else                 { next.add(label); }
      return next;
    });
    setSelected(prev => prev === label ? null : label);
  }

  if (!grouped.length) return <div style={S.info}>Sin movimientos de gastos para este mes.</div>;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: '24px', alignItems: 'start' }}>

      {/* Pie chart */}
      <div style={{ background: '#fff', borderRadius: '12px', padding: '16px', border: '1px solid var(--border-soft)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
        <PieChart data={grouped} selected={selected} onSelect={(lbl) => {
          setSelected(lbl);
          if (lbl) setExpanded(prev => { const n = new Set(prev); n.add(lbl); return n; });
        }} />
        {selected && (
          <button style={{ ...S.btn, fontSize: '0.78rem', padding: '4px 12px' }} onClick={() => { setSelected(null); setExpanded(new Set()); }}>
            ✕ Ver todas
          </button>
        )}
        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textAlign: 'center' }}>Clic en sector para filtrar</div>
      </div>

      {/* Lista con acordeón */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
          {selected ? `Filtro: ${selected}` : `${grouped.length} categorías · Total ${fC(total)}`}
        </div>

        {displayed.map((cat) => {
          const pct      = total > 0 ? (cat.value / total) * 100 : 0;
          const isOpen   = expanded.has(cat.label);
          const info     = CAT_MAP[cat.label] || CAT_MAP['Otros'];
          const isActive = selected === cat.label;

          return (
            <div key={cat.label} style={{ background: '#fff', borderRadius: '10px', border: `1px solid ${isActive ? info.color : 'var(--border-soft)'}`, overflow: 'hidden', transition: 'border-color 0.15s' }}>

              {/* Header de categoría — clic expande/colapsa */}
              <div
                style={{ padding: '12px 14px', cursor: 'pointer', userSelect: 'none' }}
                onClick={() => toggleRow(cat.label)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: info.color, display: 'inline-block', flexShrink: 0 }} />
                    {info.icon} {cat.label}
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 400 }}>({cat.accounts.length} cuentas)</span>
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: '0.95rem', fontWeight: 700, color: info.color }}>{fC(cat.value)}</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '6px' }}>{pct.toFixed(1)}%</span>
                    </div>
                    <span style={{ color: 'var(--orange)', fontSize: '0.78rem', width: '14px', textAlign: 'center' }}>{isOpen ? '▲' : '▼'}</span>
                  </div>
                </div>
                {/* Barra de progreso categoría */}
                <div style={{ background: '#f1f5f9', borderRadius: '4px', height: '5px', overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: info.color, borderRadius: '4px', transition: 'width 0.4s ease' }} />
                </div>
              </div>

              {/* Acordeón: cuentas individuales */}
              {isOpen && (
                <div style={{ borderTop: '1px solid var(--border-soft)', padding: '8px 14px 12px' }}>
                  {cat.accounts.map((acc, j) => {
                    const accPct = cat.value > 0 ? (acc.amt / cat.value) * 100 : 0;
                    return (
                      <div key={j} style={{ marginBottom: j < cat.accounts.length - 1 ? '8px' : 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                          <span style={{ fontSize: '0.81rem', color: 'var(--text-primary)' }}>{acc.name}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>{fC(acc.amt)}</span>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', minWidth: '36px', textAlign: 'right' }}>{accPct.toFixed(1)}%</span>
                          </div>
                        </div>
                        <div style={{ background: '#f1f5f9', borderRadius: '3px', height: '4px', overflow: 'hidden' }}>
                          <div style={{ width: `${accPct}%`, height: '100%', background: info.color, opacity: 0.6, borderRadius: '3px' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Tab: Comparativo Mensual ────────────────────────────────────────────────
function TabComparativo({ currentMonth }) {
  const [compData, setCompData] = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [loaded,   setLoaded]   = useState(false);

  useEffect(() => {
    if (loaded) return;
    setLoading(true);
    (async () => {
      const months = [];
      const now = new Date(currentMonth + '-01');
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
      }
      const results = await Promise.all(months.map(ym => fetchByMonth(ym)));
      const data = months.map((ym, idx) => {
        const r   = results[idx];
        const ing = r.filter(x => isIngreso(x.cuenta_contable)).reduce((s, x) => s + N(x.haber_contabilidad), 0);
        const cos = r.filter(x => isCosto(x.cuenta_contable)).reduce((s, x) => s + N(x.debe_contabilidad), 0);
        const gas = r.filter(x => isGasto(x.cuenta_contable)).reduce((s, x) => s + N(x.debe_contabilidad), 0);
        const [y, m] = ym.split('-');
        const lbl = new Date(+y, +m - 1, 1).toLocaleString('es-CR', { month: 'short' }).replace('.', '');
        return { ym, label: lbl.charAt(0).toUpperCase() + lbl.slice(1), ingresos: ing, costos: cos, gastos: gas, utilidad: ing - cos - gas };
      });
      setCompData(data);
      setLoading(false);
      setLoaded(true);
    })();
  }, [currentMonth, loaded]);

  if (loading) return <div style={S.info}>⏳ Cargando comparativo de 6 meses…</div>;

  return (
    <div>
      <div style={{ background: '#fff', borderRadius: '12px', padding: '20px', border: '1px solid var(--border-soft)', marginBottom: '20px' }}>
        <div style={{ fontSize: '0.88rem', color: 'var(--text-muted)', marginBottom: '12px' }}>📊 Ingresos vs Gastos totales (últimos 6 meses)</div>
        <BarChart months={compData.map(d => ({ ...d, gastos: d.costos + d.gastos }))} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '12px' }}>
        {compData.map(m => (
          <div key={m.ym} style={{ background: '#fff', borderRadius: '10px', padding: '14px', border: `1px solid ${m.ym === currentMonth ? 'var(--orange)' : 'var(--border-soft)'}` }}>
            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: m.ym === currentMonth ? 'var(--orange)' : 'var(--text-primary)', marginBottom: '10px' }}>
              {m.label} {m.ym.split('-')[0]} {m.ym === currentMonth && '← actual'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '0.8rem' }}>
              {[['Ingresos','#10b981',m.ingresos],['Costo ventas','#f59e0b',m.costos],['Gastos op.','#ef4444',m.gastos]].map(([lbl, col, val]) => (
                <div key={lbl} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>{lbl}</span>
                  <span style={{ color: col, fontWeight: 600 }}>{fC(val)}</span>
                </div>
              ))}
              <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: '5px', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Utilidad</span>
                <span style={{ color: m.utilidad >= 0 ? '#10b981' : '#ef4444', fontWeight: 700 }}>{fC(m.utilidad)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Página principal ────────────────────────────────────────────────────────
export default function MovimientosPage() {
  const today = new Date();
  const defaultMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

  const [month,   setMonth]   = useState(defaultMonth);
  const [rows,    setRows]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [maxDate, setMaxDate] = useState(null);
  const [tab,     setTab]     = useState(0);

  useEffect(() => {
    setLoading(true);
    (async () => {
      const [data, maxRes] = await Promise.all([
        fetchByMonth(month),
        sb.from('neo_movimientos_contables').select('fecha').not('fecha','is',null).order('fecha',{ascending:false}).limit(1),
      ]);
      setRows(data);
      if (maxRes.data?.[0]?.fecha) setMaxDate(maxRes.data[0].fecha);
      setLoading(false);
    })();
  }, [month]);

  const kpis = useMemo(() => {
    const ing = rows.filter(r => isIngreso(r.cuenta_contable)).reduce((s, r) => s + N(r.haber_contabilidad), 0);
    const cos = rows.filter(r => isCosto(r.cuenta_contable)).reduce((s, r)  => s + N(r.debe_contabilidad), 0);
    const gas = rows.filter(r => isGasto(r.cuenta_contable)).reduce((s, r)  => s + N(r.debe_contabilidad), 0);
    return { ing, cos, gas, util: ing - cos - gas };
  }, [rows]);

  const exportCSV = useCallback(() => {
    if (!rows.length) return;
    const cols = ['fecha','cuenta_contable','debe_contabilidad','haber_contabilidad'];
    const csv  = [cols.join(','), ...rows.map(r => cols.map(c => `"${String(r[c]??'').replace(/"/g,'""')}"`).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,\ufeff' + encodeURIComponent(csv);
    a.download = `movimientos_${month}.csv`;
    a.click();
  }, [rows, month]);

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <Link href="/finanzas" style={{ color: 'var(--text-muted)', fontSize: '0.82rem', textDecoration: 'none', display: 'inline-block', marginBottom: '6px' }}>
            ← Finanzas
          </Link>
          <h1 style={S.title}>📒 Movimientos Contables</h1>
          <div style={S.cap}>
            Desglose por categoría · Comparativo mensual
            {!loading && <span style={{ marginLeft: '8px' }}>· {rows.length.toLocaleString('es-CR')} registros</span>}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <SyncBadge fecha={maxDate} />
          <input type="month" value={month} onChange={e => setMonth(e.target.value)} style={S.inp} />
          <button style={S.btn} onClick={exportCSV} disabled={!rows.length}>⬇️ Exportar CSV</button>
        </div>
      </div>

      <hr style={S.div} />

      {/* KPIs */}
      <div style={S.g4}>
        <KPI label="💰 Ingresos del mes"  value={loading ? '…' : fC(kpis.ing)}  color="#10b981" sub="Cuentas 40-XX" />
        <KPI label="📦 Costo de ventas"   value={loading ? '…' : fC(kpis.cos)}  color="#f59e0b" sub="Cuentas 50-XX" />
        <KPI label="💸 Gastos operativos" value={loading ? '…' : fC(kpis.gas)}  color="#ef4444" sub="70-XX · 77-XX · 90-XX" />
        <KPI label="📈 Utilidad neta"     value={loading ? '…' : fC(kpis.util)} color={kpis.util >= 0 ? '#10b981' : '#ef4444'} sub={kpis.util >= 0 ? 'Positiva ✓' : 'Negativa ⚠️'} />
      </div>

      {/* Tabs */}
      <div style={S.tabs}>
        {['📊 Desglose de Gastos', '📅 Comparativo Mensual'].map((t, i) => (
          <button key={t} style={S.tab(tab === i)} onClick={() => setTab(i)}>{t}</button>
        ))}
      </div>

      {loading ? (
        <div style={S.info}>⏳ Cargando movimientos de {month}…</div>
      ) : (
        <>
          {tab === 0 && <TabDesglose rows={rows} />}
          {tab === 1 && <TabComparativo currentMonth={month} />}
        </>
      )}
    </div>
  );
}
