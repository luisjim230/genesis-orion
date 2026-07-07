'use client';
import { useState, useEffect, useMemo } from 'react';
import { supabase as sb } from '../../lib/supabase';

// ── Marca ──────────────────────────────────────────────────────────────────
const ORANGE = '#ED6E2E';
const TEAL   = '#225F74';
const GRIS   = '#94A3B8';
const ROJO   = '#E53E3E';

// ── Estilos ────────────────────────────────────────────────────────────────
const S = {
  page:    { background:'var(--cream)', minHeight:'100vh', padding:'28px 32px', fontFamily:'DM Sans,sans-serif', color:'var(--text-primary)' },
  title:   { fontSize:'1.7rem', fontWeight:700, color:'var(--text-primary)', margin:0 },
  caption: { fontSize:'0.82rem', color:'var(--text-muted)', marginTop:'4px', marginBottom:'24px' },
  grid5:   { display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:'12px', marginBottom:'24px' },
  card:    { background:'#fff', borderRadius:'14px', padding:'18px 20px', border:'1px solid var(--border-soft)', boxShadow:'0 1px 3px rgba(0,0,0,0.04)' },
  panel:   { background:'#fff', borderRadius:'14px', padding:'22px 24px', border:'1px solid var(--border-soft)', marginBottom:'22px' },
  panelH:  { fontSize:'1rem', fontWeight:700, color:'var(--text-primary)', marginBottom:'2px' },
  panelC:  { fontSize:'0.78rem', color:'var(--text-muted)', marginBottom:'16px' },
  tbl:     { width:'100%', borderCollapse:'collapse', fontSize:'0.83rem' },
  th:      { background:'var(--cream)', color:'var(--text-muted)', padding:'9px 12px', textAlign:'right', borderBottom:'1px solid var(--border-soft)', fontWeight:600, fontSize:'0.78rem', whiteSpace:'nowrap' },
  thL:     { background:'var(--cream)', color:'var(--text-muted)', padding:'9px 12px', textAlign:'left', borderBottom:'1px solid var(--border-soft)', fontWeight:600, fontSize:'0.78rem', whiteSpace:'nowrap' },
  td:      (i) => ({ padding:'8px 12px', borderBottom:'1px solid var(--border-soft)', background:i%2===0?'#ffffff':'#fdf8f8', textAlign:'right', fontSize:'0.82rem', whiteSpace:'nowrap' }),
  tdL:     (i) => ({ padding:'8px 12px', borderBottom:'1px solid var(--border-soft)', background:i%2===0?'#ffffff':'#fdf8f8', textAlign:'left', fontSize:'0.82rem', fontWeight:600, whiteSpace:'nowrap' }),
  nota:    { fontSize:'0.76rem', color:'var(--text-muted)', marginTop:'12px', lineHeight:1.5 },
};

// ── Utilidades numéricas ────────────────────────────────────────────────────
const N = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };

// Helper único de montos: ≥1M → "₡291.4M" · <1M → "₡850k"
function fMonto(v) {
  const n = N(v); const a = Math.abs(n); const s = n < 0 ? '-' : '';
  if (a >= 1e6) return `${s}₡${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${s}₡${Math.round(a / 1e3)}k`;
  return `${s}₡${Math.round(a).toLocaleString('es-CR')}`;
}
const fPct = (v, dec = 1) => `${N(v).toFixed(dec)}%`;

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function mesCorto(m) {
  const p = String(m).split('-');
  const mm = parseInt(p[1], 10);
  return `${MESES[mm - 1] || '?'} ${(p[0] || '').slice(2)}`;
}
function mesLargo(m) {
  const nombres = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const p = String(m).split('-');
  return `${nombres[parseInt(p[1], 10) - 1] || '?'} ${p[0]}`;
}

const gastosTot = (m) => N(m.gastos_operativos) + N(m.gastos_financieros);

// Semáforo del margen de seguridad
function semSeg(v) {
  const n = N(v);
  if (n >= 40) return { color: '#2F855A', bg: '#F0FFF4', border: '#9AE6B4', label: 'Saludable' };
  if (n >= 20) return { color: '#B7791F', bg: '#FFFBEB', border: '#FAD776', label: 'Atención' };
  return { color: '#C53030', bg: '#FFF5F5', border: '#FEB2B2', label: 'Riesgo' };
}

// ── Tarjeta KPI ─────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color, bg, border }) {
  return (
    <div style={{ ...S.card, ...(bg ? { background: bg, border: `1px solid ${border}` } : {}) }}>
      <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: '1.55rem', fontWeight: 700, color: color || TEAL, letterSpacing: '-0.02em', lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

// ── Gráfico principal: barras apiladas (gastos + utilidad neta) ─────────────
function GraficoBarras({ meses, eqUB }) {
  const [tip, setTip] = useState(null); // { i, x, y }
  if (!meses.length) return null;

  const CW = 840, CH = 360, padL = 58, padR = 20, padT = 26, padB = 56;
  const pW = CW - padL - padR, pH = CH - padT - padB;

  const barTop = (m) => Math.max(N(m.utilidad_bruta), gastosTot(m), 0);
  const yMax = Math.max(...meses.map(barTop), eqUB, 1) * 1.15;
  const yS = (v) => padT + pH - (v / yMax) * pH;
  const colW = pW / meses.length;
  const bW = Math.min(colW * 0.55, 48);
  const grid = Array.from({ length: 6 }, (_, i) => (yMax / 5) * i);

  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    setTip((t) => (t ? { ...t, x: e.clientX - r.left, y: e.clientY - r.top } : t));
  };

  return (
    <div style={{ position: 'relative' }} onMouseMove={onMove} onMouseLeave={() => setTip(null)}>
      <svg viewBox={`0 0 ${CW} ${CH}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        <rect x={padL} y={padT} width={pW} height={pH} fill="#FAFAFA" rx="4" />

        {grid.map((val, i) => (
          <g key={i}>
            <line x1={padL} y1={yS(val)} x2={CW - padR} y2={yS(val)} stroke="#E2E8F0" strokeWidth="1" strokeDasharray="3,3" />
            <text x={padL - 8} y={yS(val) + 4} textAnchor="end" fontSize="10" fill="#94A3B8">{fMonto(val)}</text>
          </g>
        ))}

        {meses.map((m, i) => {
          const gt = gastosTot(m), un = N(m.utilidad_neta), ub = N(m.utilidad_bruta);
          const neg = un < 0;
          const x = padL + i * colW + (colW - bW) / 2;
          const y0 = yS(0);
          return (
            <g key={i} style={{ cursor: 'pointer' }}
               onMouseEnter={() => setTip({ i, x: 0, y: 0 })}>
              {neg ? (
                // Mes negativo: barra de gastos completa, marcada en rojo
                <rect x={x} y={yS(gt)} width={bW} height={y0 - yS(gt)} fill="#FEB2B2" stroke={ROJO} strokeWidth="1" rx="3" />
              ) : (
                <>
                  {/* Gastos operativos + financieros (gris, abajo) */}
                  <rect x={x} y={yS(gt)} width={bW} height={y0 - yS(gt)} fill={GRIS} rx="3" opacity="0.85" />
                  {/* Utilidad neta (naranja, encima) */}
                  <rect x={x} y={yS(ub)} width={bW} height={yS(gt) - yS(ub)} fill={ORANGE} rx="3" />
                </>
              )}
              {/* Zona de hover invisible a toda la altura de la columna */}
              <rect x={padL + i * colW} y={padT} width={colW} height={pH} fill="transparent"
                    onMouseEnter={() => setTip({ i, x: 0, y: 0 })} />
              <text x={x + bW / 2} y={CH - padB + 16} textAnchor="middle" fontSize="10"
                    fill={neg ? ROJO : '#4A5568'} fontWeight={neg ? 700 : 400}>{mesCorto(m.mes)}</text>
            </g>
          );
        })}

        {/* Línea de equilibrio (utilidad bruta mínima) */}
        <line x1={padL} y1={yS(eqUB)} x2={CW - padR} y2={yS(eqUB)} stroke={TEAL} strokeWidth="1.6" strokeDasharray="6,4" />
        <text x={CW - padR} y={yS(eqUB) - 5} textAnchor="end" fontSize="9.5" fill={TEAL} fontWeight="600">
          Equilibrio {fMonto(eqUB)}
        </text>

        {/* Leyenda */}
        <rect x={padL} y={8} width="11" height="11" fill={ORANGE} rx="2" />
        <text x={padL + 16} y={17} fontSize="10" fill="#4A5568">Utilidad neta</text>
        <rect x={padL + 108} y={8} width="11" height="11" fill={GRIS} rx="2" opacity="0.85" />
        <text x={padL + 124} y={17} fontSize="10" fill="#4A5568">Gastos oper.+fin.</text>
        <line x1={padL + 232} y1={13} x2={padL + 248} y2={13} stroke={TEAL} strokeWidth="1.6" strokeDasharray="4,3" />
        <text x={padL + 254} y={17} fontSize="10" fill="#4A5568">Punto de equilibrio</text>
      </svg>

      {tip && meses[tip.i] && (() => {
        const m = meses[tip.i];
        const rows = [
          ['Ventas', fMonto(m.ventas_netas)],
          ['Utilidad bruta', fMonto(m.utilidad_bruta)],
          ['Gastos', fMonto(gastosTot(m))],
          ['Utilidad neta', fMonto(m.utilidad_neta)],
          ['Margen', fPct(m.margen_bruto_pct)],
        ];
        const left = Math.min(Math.max(tip.x + 14, 8), 640);
        return (
          <div style={{ position: 'absolute', left, top: Math.max(tip.y - 10, 8), pointerEvents: 'none',
                        background: 'rgba(26,26,26,0.94)', color: '#fff', borderRadius: 10, padding: '10px 12px',
                        fontSize: '0.75rem', minWidth: 168, boxShadow: '0 6px 20px rgba(0,0,0,0.25)', zIndex: 5 }}>
            <div style={{ fontWeight: 700, marginBottom: 6, color: ORANGE }}>{mesLargo(m.mes)}</div>
            {rows.map(([k, v], j) => (
              <div key={j} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '1px 0',
                                    color: k === 'Utilidad neta' && N(m.utilidad_neta) < 0 ? '#FEB2B2' : '#E2E8F0' }}>
                <span style={{ opacity: 0.7 }}>{k}</span><span style={{ fontWeight: 600 }}>{v}</span>
              </div>
            ))}
          </div>
        );
      })()}

      <div style={S.nota}>
        Diciembre concentra provisiones anuales (aguinaldo, renta, marchamos) — es normal que dé negativo.
        Cifras sin IVA, antes de impuesto de renta.
      </div>
    </div>
  );
}

// ── Gráfico secundario: margen bruto % ──────────────────────────────────────
function GraficoMargen({ meses }) {
  if (meses.length < 2) return null;
  const CW = 840, CH = 220, padL = 46, padR = 20, padT = 20, padB = 40;
  const pW = CW - padL - padR, pH = CH - padT - padB;

  const vals = meses.map((m) => N(m.margen_bruto_pct));
  const lo = Math.floor((Math.min(...vals) - 4) / 5) * 5;
  const yMin = Math.max(0, lo);
  const yMax = Math.ceil((Math.max(...vals) + 4) / 5) * 5;
  const rng = yMax - yMin || 1;
  const xS = (i) => padL + (pW / (meses.length - 1)) * i;
  const yS = (v) => padT + pH - ((v - yMin) / rng) * pH;
  const grid = Array.from({ length: 5 }, (_, i) => yMin + (rng / 4) * i);

  const pts = meses.map((m, i) => `${xS(i)},${yS(N(m.margen_bruto_pct))}`);
  const areaPath = `M ${xS(0)},${yS(yMin)} L ${pts.join(' L ')} L ${xS(meses.length - 1)},${yS(yMin)} Z`;
  const linePath = `M ${pts.join(' L ')}`;

  return (
    <svg viewBox={`0 0 ${CW} ${CH}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      <defs>
        <linearGradient id="margenFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={TEAL} stopOpacity="0.22" />
          <stop offset="100%" stopColor={TEAL} stopOpacity="0.02" />
        </linearGradient>
      </defs>

      {grid.map((val, i) => (
        <g key={i}>
          <line x1={padL} y1={yS(val)} x2={CW - padR} y2={yS(val)} stroke="#E2E8F0" strokeWidth="1" strokeDasharray="3,3" />
          <text x={padL - 8} y={yS(val) + 4} textAnchor="end" fontSize="10" fill="#94A3B8">{val.toFixed(0)}%</text>
        </g>
      ))}

      <path d={areaPath} fill="url(#margenFill)" />
      <path d={linePath} fill="none" stroke={TEAL} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />

      {meses.map((m, i) => (
        <g key={i}>
          <circle cx={xS(i)} cy={yS(N(m.margen_bruto_pct))} r="3.4" fill={TEAL} stroke="#fff" strokeWidth="1.4" />
          <text x={xS(i)} y={yS(N(m.margen_bruto_pct)) - 9} textAnchor="middle" fontSize="8.5" fill={TEAL} fontWeight="600">
            {N(m.margen_bruto_pct).toFixed(0)}
          </text>
          <text x={xS(i)} y={CH - padB + 16} textAnchor="middle" fontSize="9.5" fill="#4A5568">{mesCorto(m.mes)}</text>
        </g>
      ))}
    </svg>
  );
}

// ── Bloque colapsable "Cómo leer esto" ──────────────────────────────────────
function ComoLeer() {
  const [open, setOpen] = useState(false);
  const item = (t, d) => (
    <div style={{ marginBottom: 10 }}>
      <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{t}</span>
      <span style={{ color: 'var(--text-muted)' }}> {d}</span>
    </div>
  );
  return (
    <div style={{ ...S.panel, marginBottom: 8 }}>
      <div onClick={() => setOpen(!open)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}>
        <div style={S.panelH}>📖 Cómo leer esto</div>
        <span style={{ color: ORANGE, fontSize: '0.9rem' }}>{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div style={{ marginTop: 16, fontSize: '0.84rem', lineHeight: 1.5 }}>
          {item('Utilidad neta =', 'ventas − costo de mercadería − gastos operativos y financieros, antes de impuesto de renta.')}
          {item('Punto de equilibrio =', 'gastos ÷ margen bruto: las ventas mínimas del mes para no perder plata.')}
          {item('Margen de seguridad =', 'qué tanto pueden caer las ventas antes de tocar el equilibrio.')}
          {item('Fuente:', 'libro mayor contable (NEO), no el POS. Se actualiza con cada carga de movimientos contables.')}
        </div>
      )}
    </div>
  );
}

// ── Página ──────────────────────────────────────────────────────────────────
export default function ProyeccionPage() {
  const [kpi, setKpi] = useState(null);
  const [meses, setMeses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [k, e] = await Promise.all([
          sb.from('per_kpis').select('*').maybeSingle(),
          sb.from('per_estado_resultados').select('*').order('mes', { ascending: true }),
        ]);
        if (k.error) throw k.error;
        if (e.error) throw e.error;
        setKpi(k.data);
        setMeses(e.data || []);
      } catch (err) {
        setError(err.message || 'Error cargando datos');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const mesesDesc = useMemo(() => [...meses].sort((a, b) => (a.mes < b.mes ? 1 : -1)), [meses]);
  const eqUB = kpi ? N(kpi.punto_equilibrio_ventas) * N(kpi.margen_prom_3m) / 100 : 0;
  const seg = semSeg(kpi?.margen_seguridad_pct);

  if (loading) {
    return <div style={S.page}><div style={{ color: 'var(--text-muted)', padding: 40 }}>⏳ Cargando…</div></div>;
  }
  if (error || !kpi) {
    return <div style={S.page}><div style={{ color: ROJO, padding: 40 }}>No se pudieron cargar los datos. {error}</div></div>;
  }

  return (
    <div style={S.page}>
      <h1 style={S.title}>🎯 Proyección &amp; Equilibrio</h1>
      <div style={S.caption}>
        Estado de resultados mensual desde el libro mayor contable · datos al mes {mesLargo(kpi.ultimo_mes)} ·
        cifras sin IVA, antes de impuesto de renta.
      </div>

      {/* A · Tarjetas KPI */}
      <div style={S.grid5}>
        <KpiCard label="Utilidad neta / mes" value={fMonto(kpi.util_neta_prom_3m)} sub="promedio últimos 3 meses" color={ORANGE} />
        <KpiCard label="Margen bruto" value={fPct(kpi.margen_prom_3m)} sub="promedio últimos 3 meses" color={TEAL} />
        <KpiCard label="Punto de equilibrio" value={fMonto(kpi.punto_equilibrio_ventas)} sub="ventas mínimas / mes" color={TEAL} />
        <KpiCard label="Margen de seguridad" value={fPct(kpi.margen_seguridad_pct, 0)} sub={`colchón antes de perder · ${seg.label}`}
                 color={seg.color} bg={seg.bg} border={seg.border} />
        <KpiCard label="Proyección anual" value={fMonto(kpi.proyeccion_neta_anual)} sub="utilidad neta antes de renta" color={TEAL} />
      </div>

      {/* B · Gráfico principal */}
      <div style={S.panel}>
        <div style={S.panelH}>Utilidad neta vs. gastos por mes</div>
        <div style={S.panelC}>La barra llega hasta la utilidad bruta; la porción naranja es lo que queda después de gastos. Tiene que superar la línea de equilibrio.</div>
        <GraficoBarras meses={meses} eqUB={eqUB} />
      </div>

      {/* C · Gráfico de margen */}
      <div style={S.panel}>
        <div style={S.panelH}>Margen bruto mensual</div>
        <div style={S.panelC}>Porcentaje de cada venta que queda después del costo de mercadería.</div>
        <GraficoMargen meses={meses} />
      </div>

      {/* D · Tabla estado de resultados */}
      <div style={S.panel}>
        <div style={S.panelH}>Estado de resultados mensual</div>
        <div style={S.panelC}>En millones de colones · sin IVA · antes de impuesto de renta.</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={S.tbl}>
            <thead>
              <tr>
                <th style={S.thL}>Mes</th>
                <th style={S.th}>Ventas</th>
                <th style={S.th}>Costo</th>
                <th style={S.th}>Utilidad bruta</th>
                <th style={S.th}>Margen %</th>
                <th style={S.th}>Gastos</th>
                <th style={S.th}>Utilidad neta</th>
                <th style={S.th}>Equilibrio (ventas)</th>
              </tr>
            </thead>
            <tbody>
              {mesesDesc.map((m, i) => {
                const un = N(m.utilidad_neta);
                return (
                  <tr key={m.mes}>
                    <td style={S.tdL(i)}>{mesCorto(m.mes)}</td>
                    <td style={S.td(i)}>{fMonto(m.ventas_netas)}</td>
                    <td style={S.td(i)}>{fMonto(m.costo_ventas)}</td>
                    <td style={S.td(i)}>{fMonto(m.utilidad_bruta)}</td>
                    <td style={S.td(i)}>{fPct(m.margen_bruto_pct)}</td>
                    <td style={S.td(i)}>{fMonto(gastosTot(m))}</td>
                    <td style={{ ...S.td(i), color: un < 0 ? ROJO : 'var(--text-primary)', fontWeight: un < 0 ? 700 : 400 }}>{fMonto(un)}</td>
                    <td style={S.td(i)}>{fMonto(m.punto_equilibrio_ventas)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* E · Cómo leer esto */}
      <ComoLeer />
    </div>
  );
}
