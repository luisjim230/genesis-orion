'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { supabase as sb } from '../../../lib/supabase';

// ── Paleta dark ────────────────────────────────────────────────────────────
const BG    = '#0f172a';
const CARD  = '#1e293b';
const CARD2 = '#243044';
const BOR   = '#334155';
const TXT   = '#f1f5f9';
const MUT   = '#94a3b8';
const ORG   = '#f97316';

const S = {
  page:   { background: BG, minHeight: '100vh', padding: '28px 32px', fontFamily: 'DM Sans,sans-serif', color: TXT },
  title:  { fontSize: '1.7rem', fontWeight: 700, color: TXT, margin: 0 },
  cap:    { fontSize: '0.82rem', color: MUT, marginTop: '4px', marginBottom: '24px' },
  div:    { border: 'none', borderTop: `1px solid ${BOR}`, margin: '20px 0' },
  tabs:   { display: 'flex', gap: '4px', marginBottom: '24px', flexWrap: 'wrap' },
  tab:    (a) => ({ background: a ? ORG : CARD, color: a ? '#fff' : MUT, border: `1px solid ${a ? ORG : BOR}`, borderRadius: '8px', padding: '8px 16px', cursor: 'pointer', fontWeight: a ? 700 : 400, fontSize: '0.88rem', transition: 'all 0.15s' }),
  g4:     { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px', marginBottom: '20px' },
  g2:     { display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '16px' },
  kpi:    { background: CARD, borderRadius: '12px', padding: '16px', border: `1px solid ${BOR}` },
  kpiL:   { fontSize: '0.78rem', color: MUT, marginBottom: '6px' },
  kpiV:   { fontSize: '1.4rem', fontWeight: 700 },
  inp:    { background: BG, border: `1px solid ${BOR}`, borderRadius: '8px', color: TXT, padding: '8px 12px', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' },
  lbl:    { fontSize: '0.82rem', color: MUT, marginBottom: '4px', display: 'block' },
  btn:    { background: CARD, color: TXT, border: `1px solid ${BOR}`, borderRadius: '8px', padding: '8px 16px', cursor: 'pointer', fontSize: '0.88rem' },
  info:   { background: '#1e3a5f', border: '1px solid #2563eb', borderRadius: '8px', padding: '14px', color: '#93c5fd', fontSize: '0.88rem' },
};

// ── Utilidades ─────────────────────────────────────────────────────────────
const N = (v) => {
  if (v == null || v === '') return 0;
  const s = String(v).replace(/,/g, '').replace(/\s/g, '');
  return parseFloat(s) || 0;
};

const fC = (v) => {
  const n = N(v);
  return '₡' + Math.abs(n).toLocaleString('es-CR', { maximumFractionDigits: 0 });
};

const fCShort = (v) => {
  const n = Math.abs(N(v));
  if (n >= 1_000_000) return '₡' + (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return '₡' + (n / 1_000).toFixed(0) + 'K';
  return '₡' + n.toFixed(0);
};

// ── Categorías de gastos ────────────────────────────────────────────────────
const CATS = [
  { key: 'Nómina',           color: '#6366f1', icon: '👥', keywords: ['sueld','ccss','aguinaldo','vacacion','cesant'] },
  { key: 'Operativo',        color: '#f59e0b', icon: '🔧', keywords: ['combustible','mantenimiento','empaque','encomienda'] },
  { key: 'Viáticos',         color: '#f97316', icon: '🍽️', keywords: ['viatico','alimento'] },
  { key: 'Alquileres',       color: '#10b981', icon: '🏢', codePrefix: ['70-30-18'], keywords: ['alquiler'] },
  { key: 'Servicios Públicos',color: '#06b6d4', icon: '💡', keywords: ['internet','teléfono','telefono','agua ','luz ','energia','electricid'] },
  { key: 'Comercial',        color: '#ec4899', icon: '📣', keywords: ['publicidad','capacitacion','comision'] },
  { key: 'Servicios Prof.',  color: '#8b5cf6', icon: '🛡️', keywords: ['seguridad','servicios profesionales','dominio','rastreo','profesional'] },
  { key: 'Depreciación',     color: '#6b7280', icon: '📉', codePrefix: ['70-80'] },
  { key: 'Financiero',       color: '#ef4444', icon: '🏦', codePrefix: ['90'] },
];

function categorize(cta) {
  if (!cta) return 'Otros';
  const code = cta.split(' ')[0].trim();
  const desc = cta.toLowerCase();
  for (const cat of CATS) {
    if (cat.codePrefix?.some(p => code.startsWith(p))) return cat.key;
    if (cat.keywords?.some(k => desc.includes(k))) return cat.key;
  }
  return 'Otros';
}

const CAT_MAP = Object.fromEntries(CATS.map(c => [c.key, c]));
CAT_MAP['Otros'] = { key: 'Otros', color: '#475569', icon: '📦' };

function getCode(cta) { return cta?.split(' ')[0].trim() || ''; }
function isIngreso(cta)    { const c = getCode(cta); return c.startsWith('40'); }
function isCosto(cta)      { const c = getCode(cta); return c.startsWith('50'); }
function isGasto(cta)      { const c = getCode(cta); return c.startsWith('70') || c.startsWith('77') || c.startsWith('90'); }

// ── Fetch paginado ─────────────────────────────────────────────────────────
async function fetchByMonth(yearMonth) {
  const [y, m] = yearMonth.split('-').map(Number);
  const from = `${yearMonth}-01`;
  const last = new Date(y, m, 0).getDate();
  const to   = `${yearMonth}-${String(last).padStart(2, '0')}`;

  let all = [], off = 0;
  while (true) {
    const { data, error } = await sb
      .from('neo_movimientos_contables')
      .select('fecha,cuenta_contable,debe_contabilidad,haber_contabilidad')
      .not('fecha', 'is', null)
      .not('cuenta_contable', 'is', null)
      .gte('fecha', from)
      .lte('fecha', to)
      .range(off, off + 999);
    if (error || !data?.length) break;
    all = [...all, ...data];
    if (data.length < 1000) break;
    off += 1000;
  }
  return all;
}

// ── SyncBadge ──────────────────────────────────────────────────────────────
function SyncBadge({ fecha }) {
  if (!fecha) return null;
  const f = new Date(fecha).toLocaleString('es-CR', {
    timeZone: 'America/Costa_Rica', day: '2-digit', month: '2-digit',
    year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  return (
    <span style={{ fontSize: '0.78rem', color: MUT }}>
      📅 Datos al: <strong style={{ color: TXT }}>{f}</strong>
    </span>
  );
}

// ── KPI Card ────────────────────────────────────────────────────────────────
function KPI({ label, value, color, sub }) {
  return (
    <div style={S.kpi}>
      <div style={S.kpiL}>{label}</div>
      <div style={{ ...S.kpiV, color: color || ORG }}>{value}</div>
      {sub && <div style={{ fontSize: '0.75rem', color: MUT, marginTop: '4px' }}>{sub}</div>}
    </div>
  );
}

// ── SVG Pie Chart ───────────────────────────────────────────────────────────
function PieChart({ data, selected, onSelect }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <div style={{ color: MUT, padding: '40px', textAlign: 'center' }}>Sin datos</div>;

  const CX = 110, CY = 110, R = 88, RI = 44;
  let angle = -Math.PI / 2;

  const slices = data.filter(d => d.value > 0).map(d => {
    const sweep = (d.value / total) * 2 * Math.PI;
    const end   = angle + sweep;
    const x1 = CX + R * Math.cos(angle), y1 = CY + R * Math.sin(angle);
    const x2 = CX + R * Math.cos(end),   y2 = CY + R * Math.sin(end);
    const ix1 = CX + RI * Math.cos(angle), iy1 = CY + RI * Math.sin(angle);
    const ix2 = CX + RI * Math.cos(end),   iy2 = CY + RI * Math.sin(end);
    const large = sweep > Math.PI ? 1 : 0;
    const path = `M ${ix1} ${iy1} L ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} L ${ix2} ${iy2} A ${RI} ${RI} 0 ${large} 0 ${ix1} ${iy1} Z`;
    const midA  = angle + sweep / 2;
    const slice = { ...d, path, midA, pct: d.value / total };
    angle = end;
    return slice;
  });

  return (
    <svg width="220" height="220" viewBox="0 0 220 220" style={{ overflow: 'visible' }}>
      {slices.map((s, i) => {
        const active = !selected || selected === s.label;
        const scale  = selected === s.label ? 1.04 : 1;
        const tx = CX * (1 - scale), ty = CY * (1 - scale);
        return (
          <path
            key={i}
            d={s.path}
            fill={s.color}
            opacity={active ? 1 : 0.3}
            stroke={BG}
            strokeWidth="2"
            style={{ cursor: 'pointer', transform: `scale(${scale})`, transformOrigin: `${CX}px ${CY}px`, transition: 'opacity 0.2s, transform 0.15s' }}
            onClick={() => onSelect(selected === s.label ? null : s.label)}
          >
            <title>{s.label}: {fC(s.value)} ({(s.pct * 100).toFixed(1)}%)</title>
          </path>
        );
      })}
      <text x={CX} y={CY - 6} textAnchor="middle" fill={TXT} fontSize="11" fontWeight="600">Total</text>
      <text x={CX} y={CY + 10} textAnchor="middle" fill={ORG} fontSize="10">{fCShort(data.reduce((s,d)=>s+d.value,0))}</text>
    </svg>
  );
}

// ── SVG Bar Chart ───────────────────────────────────────────────────────────
function BarChart({ months }) {
  if (!months.length) return null;
  const W = 560, H = 160, PL = 55, PR = 16, PT = 10, PB = 30;
  const IW = W - PL - PR;
  const maxV = Math.max(...months.flatMap(m => [m.ingresos, m.gastos, 1]));
  const bw = Math.max(8, (IW / months.length) / 2 - 6);
  const gap = IW / months.length;

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H + PB + PT}`} preserveAspectRatio="xMidYMid meet" style={{ display: 'block' }}>
      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map(p => {
        const y = PT + H - p * H;
        return (
          <g key={p}>
            <line x1={PL} y1={y} x2={W - PR} y2={y} stroke={BOR} strokeWidth="1" strokeDasharray="4 4" />
            <text x={PL - 4} y={y + 4} textAnchor="end" fill={MUT} fontSize="9">{fCShort(maxV * p)}</text>
          </g>
        );
      })}
      {/* Bars */}
      {months.map((m, i) => {
        const cx  = PL + i * gap + gap / 2;
        const ingH = (m.ingresos / maxV) * H;
        const gasH = (m.gastos   / maxV) * H;
        return (
          <g key={i}>
            <rect x={cx - bw - 2} y={PT + H - ingH} width={bw} height={ingH} fill="#10b981" rx="2">
              <title>Ingresos: {fC(m.ingresos)}</title>
            </rect>
            <rect x={cx + 2} y={PT + H - gasH} width={bw} height={gasH} fill="#ef4444" rx="2">
              <title>Gastos: {fC(m.gastos)}</title>
            </rect>
            <text x={cx} y={PT + H + 16} textAnchor="middle" fill={MUT} fontSize="9">{m.label}</text>
          </g>
        );
      })}
      {/* Baseline */}
      <line x1={PL} y1={PT + H} x2={W - PR} y2={PT + H} stroke={BOR} strokeWidth="1" />
      {/* Legend */}
      <rect x={W - PR - 80} y={PT} width="10" height="10" fill="#10b981" rx="2" />
      <text x={W - PR - 67} y={PT + 9} fill={MUT} fontSize="9">Ingresos</text>
      <rect x={W - PR - 80} y={PT + 14} width="10" height="10" fill="#ef4444" rx="2" />
      <text x={W - PR - 67} y={PT + 23} fill={MUT} fontSize="9">Gastos</text>
    </svg>
  );
}

// ── Tab: Desglose de Gastos ─────────────────────────────────────────────────
function TabDesglose({ rows }) {
  const [selected, setSelected] = useState(null);

  const grouped = useMemo(() => {
    const map = {};
    rows.filter(r => isGasto(r.cuenta_contable)).forEach(r => {
      const cat = categorize(r.cuenta_contable);
      if (!map[cat]) map[cat] = 0;
      map[cat] += N(r.debe_contabilidad);
    });
    return Object.entries(map)
      .map(([k, v]) => ({ label: k, value: v, ...CAT_MAP[k] }))
      .sort((a, b) => b.value - a.value);
  }, [rows]);

  const total = grouped.reduce((s, d) => s + d.value, 0);

  const filtered = selected ? grouped.filter(d => d.label === selected) : grouped;

  if (!grouped.length) {
    return <div style={S.info}>Sin movimientos de gastos para este mes.</div>;
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '24px', alignItems: 'start' }}>
      {/* Pie */}
      <div style={{ background: CARD, borderRadius: '12px', padding: '16px', border: `1px solid ${BOR}`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
        <PieChart data={grouped} selected={selected} onSelect={setSelected} />
        {selected && (
          <button style={{ ...S.btn, fontSize: '0.78rem', padding: '4px 12px' }} onClick={() => setSelected(null)}>
            ✕ Quitar filtro
          </button>
        )}
        <div style={{ width: '100%', fontSize: '0.75rem', color: MUT, textAlign: 'center' }}>
          Clic en sector para filtrar
        </div>
      </div>

      {/* Lista */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ fontSize: '0.82rem', color: MUT, marginBottom: '4px' }}>
          {selected ? `Mostrando: ${selected}` : `${grouped.length} categorías · Total ${fC(total)}`}
        </div>
        {filtered.map((cat, i) => {
          const pct = total > 0 ? (cat.value / total) * 100 : 0;
          const info = CAT_MAP[cat.label] || CAT_MAP['Otros'];
          return (
            <div
              key={cat.label}
              style={{ background: selected === cat.label ? CARD2 : CARD, borderRadius: '10px', padding: '12px 14px', border: `1px solid ${selected === cat.label ? info.color : BOR}`, cursor: 'pointer', transition: 'all 0.15s' }}
              onClick={() => setSelected(selected === cat.label ? null : cat.label)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ fontSize: '0.88rem', fontWeight: 600, color: TXT }}>
                  {info.icon || '📦'} {cat.label}
                </span>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '0.95rem', fontWeight: 700, color: info.color }}>{fC(cat.value)}</span>
                  <span style={{ fontSize: '0.75rem', color: MUT, marginLeft: '8px' }}>{pct.toFixed(1)}%</span>
                </div>
              </div>
              <div style={{ background: BG, borderRadius: '4px', height: '6px', overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: info.color, borderRadius: '4px', transition: 'width 0.4s ease' }} />
              </div>
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
        const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        months.push(ym);
      }

      const results = await Promise.all(months.map(ym => fetchByMonth(ym)));

      const data = months.map((ym, idx) => {
        const rows = results[idx];
        const ing = rows.filter(r => isIngreso(r.cuenta_contable)).reduce((s, r) => s + N(r.haber_contabilidad), 0);
        const cos = rows.filter(r => isCosto(r.cuenta_contable)).reduce((s, r) => s + N(r.debe_contabilidad), 0);
        const gas = rows.filter(r => isGasto(r.cuenta_contable)).reduce((s, r) => s + N(r.debe_contabilidad), 0);
        const [y, m] = ym.split('-');
        const label = new Date(+y, +m - 1, 1).toLocaleString('es-CR', { month: 'short' }).replace('.', '');
        return { ym, label: label.charAt(0).toUpperCase() + label.slice(1), ingresos: ing, costos: cos, gastos: gas, utilidad: ing - cos - gas };
      });

      setCompData(data);
      setLoading(false);
      setLoaded(true);
    })();
  }, [currentMonth, loaded]);

  if (loading) return <div style={S.info}>⏳ Cargando comparativo de 6 meses…</div>;

  return (
    <div>
      {/* Barchart */}
      <div style={{ background: CARD, borderRadius: '12px', padding: '20px', border: `1px solid ${BOR}`, marginBottom: '20px' }}>
        <div style={{ fontSize: '0.88rem', color: MUT, marginBottom: '12px' }}>📊 Ingresos vs Gastos totales (últimos 6 meses)</div>
        <BarChart months={compData.map(d => ({ ...d, gastos: d.costos + d.gastos }))} />
      </div>

      {/* Cards por mes */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
        {compData.map(m => (
          <div key={m.ym} style={{ background: m.ym === currentMonth ? CARD2 : CARD, borderRadius: '10px', padding: '14px', border: `1px solid ${m.ym === currentMonth ? ORG : BOR}` }}>
            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: m.ym === currentMonth ? ORG : TXT, marginBottom: '10px' }}>
              {m.label} {m.ym.split('-')[0]} {m.ym === currentMonth && '← actual'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '0.8rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: MUT }}>Ingresos</span>
                <span style={{ color: '#10b981', fontWeight: 600 }}>{fC(m.ingresos)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: MUT }}>Costo ventas</span>
                <span style={{ color: '#f59e0b', fontWeight: 600 }}>{fC(m.costos)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: MUT }}>Gastos op.</span>
                <span style={{ color: '#ef4444', fontWeight: 600 }}>{fC(m.gastos)}</span>
              </div>
              <div style={{ borderTop: `1px solid ${BOR}`, paddingTop: '5px', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: MUT }}>Utilidad</span>
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

  // Cargar datos del mes seleccionado
  useEffect(() => {
    setLoading(true);
    (async () => {
      const [data, maxRes] = await Promise.all([
        fetchByMonth(month),
        sb.from('neo_movimientos_contables').select('fecha').not('fecha', 'is', null).order('fecha', { ascending: false }).limit(1),
      ]);
      setRows(data);
      if (maxRes.data?.[0]?.fecha) setMaxDate(maxRes.data[0].fecha);
      setLoading(false);
    })();
  }, [month]);

  // KPIs
  const kpis = useMemo(() => {
    const ing = rows.filter(r => isIngreso(r.cuenta_contable)).reduce((s, r) => s + N(r.haber_contabilidad), 0);
    const cos = rows.filter(r => isCosto(r.cuenta_contable)).reduce((s, r) => s + N(r.debe_contabilidad), 0);
    const gas = rows.filter(r => isGasto(r.cuenta_contable)).reduce((s, r) => s + N(r.debe_contabilidad), 0);
    return { ing, cos, gas, util: ing - cos - gas };
  }, [rows]);

  // Export CSV
  const exportCSV = useCallback(() => {
    if (!rows.length) return;
    const cols = ['fecha', 'cuenta_contable', 'debe_contabilidad', 'haber_contabilidad'];
    const header = cols.join(',');
    const lines = rows.map(r => cols.map(c => `"${String(r[c] ?? '').replace(/"/g, '""')}"`).join(','));
    const csv = [header, ...lines].join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,\ufeff' + encodeURIComponent(csv);
    a.download = `movimientos_${month}.csv`;
    a.click();
  }, [rows, month]);

  const TABS = ['📊 Desglose de Gastos', '📅 Comparativo Mensual'];

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
            <Link href="/finanzas" style={{ color: MUT, fontSize: '0.85rem', textDecoration: 'none' }}>
              ← Finanzas
            </Link>
          </div>
          <h1 style={S.title}>📒 Movimientos Contables</h1>
          <div style={S.cap}>
            Desglose por categoría · Comparativo mensual · {rows.length.toLocaleString('es-CR')} registros cargados
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <SyncBadge fecha={maxDate} />
          <div>
            <input
              type="month"
              value={month}
              onChange={e => setMonth(e.target.value)}
              style={{ ...S.inp, colorScheme: 'dark' }}
            />
          </div>
          <button style={S.btn} onClick={exportCSV} disabled={!rows.length}>
            ⬇️ Exportar CSV
          </button>
        </div>
      </div>

      <hr style={S.div} />

      {/* KPI Cards */}
      <div style={S.g4}>
        <KPI label="💰 Ingresos del mes"    value={loading ? '…' : fC(kpis.ing)}  color="#10b981" sub="Cuentas 40-XX" />
        <KPI label="📦 Costo de ventas"     value={loading ? '…' : fC(kpis.cos)}  color="#f59e0b" sub="Cuentas 50-XX" />
        <KPI label="💸 Gastos operativos"   value={loading ? '…' : fC(kpis.gas)}  color="#ef4444" sub="70-XX · 77-XX · 90-XX" />
        <KPI
          label="📈 Utilidad neta"
          value={loading ? '…' : fC(kpis.util)}
          color={kpis.util >= 0 ? '#10b981' : '#ef4444'}
          sub={kpis.util >= 0 ? 'Positiva ✓' : 'Negativa ⚠️'}
        />
      </div>

      {/* Tabs */}
      <div style={S.tabs}>
        {TABS.map((t, i) => (
          <button key={t} style={S.tab(tab === i)} onClick={() => setTab(i)}>{t}</button>
        ))}
      </div>

      {/* Contenido */}
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
