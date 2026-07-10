'use client';
import { useState, useEffect, useCallback } from 'react';
import { supabase as sb } from '../../lib/supabase';

// ── Marca ──────────────────────────────────────────────────────────────────
const ORANGE = '#ED6E2E';
const VINO   = '#5E2733';
const TEAL   = '#225F74';
const CREMA  = '#FDF4F4';
const ROJO   = '#E53E3E';
const AMBAR  = '#D69E2E';
const VERDE  = '#2F855A';
const GRIS   = '#94A3B8';

// ── Estilos (mobile-first) ───────────────────────────────────────────────────
const S = {
  page:    { background: CREMA, minHeight: '100vh', padding: '18px 14px 60px', fontFamily: 'DM Sans,sans-serif', color: '#1a1a1a' },
  wrap:    { maxWidth: 1180, margin: '0 auto' },
  title:   { fontSize: '1.5rem', fontWeight: 800, color: VINO, margin: 0, letterSpacing: '-0.02em' },
  caption: { fontSize: '0.78rem', color: '#7a6a6a', marginTop: 4, marginBottom: 18 },
  heroGrid:{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginBottom: 20 },
  hero:    (bg, bd) => ({ background: bg || '#fff', borderRadius: 16, padding: '15px 16px', border: `1.5px solid ${bd || '#f0e3e3'}`, boxShadow: '0 1px 4px rgba(0,0,0,0.05)', position: 'relative', overflow: 'hidden' }),
  heroLbl: { fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#8a7a7a', marginBottom: 7, display: 'flex', alignItems: 'center', gap: 5 },
  heroVal: (c) => ({ fontSize: '1.55rem', fontWeight: 800, color: c || TEAL, letterSpacing: '-0.02em', lineHeight: 1.05 }),
  heroSub: { fontSize: '0.7rem', color: '#8a7a7a', marginTop: 6, lineHeight: 1.35 },
  panel:   { background: '#fff', borderRadius: 16, border: '1px solid #f0e3e3', marginBottom: 14, overflow: 'hidden' },
  panelHead:(open) => ({ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none', padding: '15px 18px', borderBottom: open ? '1px solid #f4eaea' : 'none' }),
  panelTit:{ fontSize: '0.98rem', fontWeight: 700, color: VINO, display: 'flex', alignItems: 'center', gap: 8 },
  panelBody:{ padding: '14px 18px 18px' },
  tbl:     { width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' },
  th:      { background: CREMA, color: '#8a7a7a', padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid #f0e3e3', fontWeight: 700, fontSize: '0.72rem', whiteSpace: 'nowrap', position: 'sticky', top: 0 },
  thL:     { background: CREMA, color: '#8a7a7a', padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #f0e3e3', fontWeight: 700, fontSize: '0.72rem', whiteSpace: 'nowrap', position: 'sticky', top: 0 },
  td:      (i) => ({ padding: '7px 10px', borderBottom: '1px solid #f7efef', background: i % 2 ? '#fdf8f8' : '#fff', textAlign: 'right', fontSize: '0.8rem', whiteSpace: 'nowrap' }),
  tdL:     (i) => ({ padding: '7px 10px', borderBottom: '1px solid #f7efef', background: i % 2 ? '#fdf8f8' : '#fff', textAlign: 'left', fontSize: '0.8rem' }),
  nota:    { fontSize: '0.72rem', color: '#9a8a8a', marginTop: 10, lineHeight: 1.5 },
  chip:    (c, bg) => ({ display: 'inline-block', fontSize: '0.66rem', fontWeight: 700, color: c, background: bg, borderRadius: 999, padding: '2px 8px', whiteSpace: 'nowrap' }),
  btn:     { background: ORANGE, color: '#fff', border: 'none', borderRadius: 10, padding: '9px 16px', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' },
  btnGhost:{ background: '#fff', color: VINO, border: '1.5px solid #e6d5d5', borderRadius: 10, padding: '8px 14px', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' },
  input:   { border: '1.5px solid #e6d5d5', borderRadius: 8, padding: '7px 10px', fontSize: '0.85rem', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' },
};

// ── Utilidades ────────────────────────────────────────────────────────────────
const N = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
function fMonto(v) {
  const n = N(v); const a = Math.abs(n); const s = n < 0 ? '-' : '';
  if (a >= 1e6) return `${s}₡${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${s}₡${Math.round(a / 1e3)}k`;
  return `${s}₡${Math.round(a).toLocaleString('es-CR')}`;
}
const fFull = (v) => `₡${Math.round(N(v)).toLocaleString('es-CR')}`;
const fPct  = (v, d = 1) => `${N(v).toFixed(d)}%`;
const fNum  = (v) => Math.round(N(v)).toLocaleString('es-CR');

const MESES_C = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function mesCorto(m) {
  const p = String(m).split('-'); const mm = parseInt(p[1], 10);
  return `${MESES_C[mm - 1] || '?'} ${(p[0] || '').slice(2)}`;
}
function fFecha(d) {
  if (!d) return '—';
  const dt = new Date(d);
  return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`;
}

// Semáforo de estado del capital muerto
const ESTADO_INFO = {
  recien_nacido: { label: '🟢 En maduración', c: VERDE,  bg: '#F0FFF4', bd: '#9AE6B4' },
  observacion:   { label: '🟡 En observación', c: AMBAR, bg: '#FFFBEB', bd: '#FAD776' },
  lento:         { label: '🟠 Lento',          c: ORANGE, bg: '#FFF7ED', bd: '#FBD38D' },
  muerto:        { label: '🔴 Muerto',         c: ROJO,   bg: '#FFF5F5', bd: '#FEB2B2' },
  vivo:          { label: '✅ Vivo',           c: TEAL,   bg: '#EBF8FF', bd: '#BEE3F8' },
};
function semGmroi(v) {
  const n = N(v);
  if (n < 1.5)  return { c: ROJO,  bg: '#FFF5F5', bd: '#FEB2B2', label: 'Bajo' };
  if (n <= 2.5) return { c: AMBAR, bg: '#FFFBEB', bd: '#FAD776', label: 'Medio' };
  return { c: VERDE, bg: '#F0FFF4', bd: '#9AE6B4', label: 'Sano' };
}
function semCohorte(v) {
  const n = N(v);
  if (n >= 70) return VERDE;
  if (n >= 40) return AMBAR;
  return ROJO;
}

// ── Tarjeta hero ─────────────────────────────────────────────────────────────
function Hero({ icon, label, value, valueColor, sub, bg, bd }) {
  return (
    <div style={S.hero(bg, bd)}>
      <div style={S.heroLbl}><span>{icon}</span>{label}</div>
      <div style={S.heroVal(valueColor)}>{value}</div>
      {sub && <div style={S.heroSub}>{sub}</div>}
    </div>
  );
}

// ── Sección expandible ───────────────────────────────────────────────────────
function Section({ title, icon, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={S.panel}>
      <div style={S.panelHead(open)} onClick={() => setOpen(!open)}>
        <div style={S.panelTit}><span>{icon}</span>{title}</div>
        <span style={{ color: ORANGE, fontSize: '0.85rem' }}>{open ? '▲' : '▼'}</span>
      </div>
      {open && <div style={S.panelBody}>{children}</div>}
    </div>
  );
}

// ── Pantalla de configuración ────────────────────────────────────────────────
function Config({ onClose, onSaved }) {
  const [data, setData] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    (async () => {
      const r = await fetch('/api/incomodidad/config');
      const j = await r.json();
      setData(j);
    })();
  }, []);

  const toggle = (cta) => setData((d) => ({
    ...d,
    cuentas: d.cuentas.map((c) => c.cuenta_contable === cta ? { ...c, incluir: !c.incluir } : c),
  }));
  const setCfg = (k, v) => setData((d) => ({ ...d, config: { ...d.config, [k]: v } }));
  const setGasto = (i, k, v) => setData((d) => ({ ...d, gastos_nuevos: d.gastos_nuevos.map((g, j) => j === i ? { ...g, [k]: v } : g) }));
  const delGasto = (i) => setData((d) => ({ ...d, gastos_nuevos: d.gastos_nuevos.map((g, j) => j === i ? { ...g, _delete: true } : g) }));
  const addGasto = () => setData((d) => ({ ...d, gastos_nuevos: [...d.gastos_nuevos, { concepto: '', monto_mensual: '', fecha_inicio: '' }] }));

  const guardar = async () => {
    setSaving(true); setMsg(null);
    try {
      const r = await fetch('/api/incomodidad/config', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: {
            margen_bruto_objetivo: data.config?.margen_bruto_objetivo,
            costos_fijos_override: data.config?.costos_fijos_override,
          },
          cuentas: data.cuentas,
          gastos_nuevos: data.gastos_nuevos,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Error');
      setMsg('✅ Guardado. Refrescando…');
      onSaved && onSaved();
      setTimeout(onClose, 700);
    } catch (e) {
      setMsg('❌ ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  if (!data) return <div style={{ padding: 30, color: '#8a7a7a' }}>⏳ Cargando configuración…</div>;

  const sinClasif = data.cuentas.filter((c) => c.sin_clasificar);
  const clasif = data.cuentas.filter((c) => !c.sin_clasificar);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100, overflowY: 'auto', padding: '20px 12px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', background: '#fff', borderRadius: 16, padding: '20px 18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div style={{ fontSize: '1.15rem', fontWeight: 800, color: VINO }}>⚙️ Configuración del equilibrio</div>
          <button style={S.btnGhost} onClick={onClose}>Cerrar ✕</button>
        </div>
        <div style={{ fontSize: '0.78rem', color: '#8a7a7a', marginBottom: 16 }}>
          Marcá qué cuentas cuentan como gasto fijo. El punto de equilibrio se recalcula solo.
        </div>

        {/* Margen y override */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12, marginBottom: 18 }}>
          <div>
            <label style={{ fontSize: '0.74rem', fontWeight: 700, color: '#8a7a7a' }}>Margen bruto objetivo (%)</label>
            <input style={S.input} type="number" step="0.5"
              value={data.config?.margen_bruto_objetivo != null ? (N(data.config.margen_bruto_objetivo) * 100) : ''}
              onChange={(e) => setCfg('margen_bruto_objetivo', N(e.target.value) / 100)} />
          </div>
          <div>
            <label style={{ fontSize: '0.74rem', fontWeight: 700, color: '#8a7a7a' }}>Override gasto fijo (₡, opcional)</label>
            <input style={S.input} type="number" placeholder="automático"
              value={data.config?.costos_fijos_override ?? ''}
              onChange={(e) => setCfg('costos_fijos_override', e.target.value)} />
          </div>
        </div>

        {/* Cuentas sin clasificar (destacadas) */}
        {sinClasif.length > 0 && (
          <div style={{ background: '#FFF7ED', border: '1px solid #FBD38D', borderRadius: 10, padding: 12, marginBottom: 14 }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: ORANGE, marginBottom: 8 }}>⚠ {sinClasif.length} cuenta(s) sin clasificar — decidí si van al equilibrio</div>
            {sinClasif.map((c) => (
              <label key={c.cuenta_contable} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: '0.8rem' }}>
                <input type="checkbox" checked={!!c.incluir} onChange={() => toggle(c.cuenta_contable)} />
                <span style={{ flex: 1 }}>{c.cuenta_contable}</span>
                <span style={{ color: '#8a7a7a', fontWeight: 600 }}>{fMonto(c.avg_mes)}/mes</span>
              </label>
            ))}
          </div>
        )}

        {/* Todas las cuentas */}
        <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid #f0e3e3', borderRadius: 10, marginBottom: 16 }}>
          {clasif.map((c, i) => (
            <label key={c.cuenta_contable} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', fontSize: '0.78rem', background: i % 2 ? '#fdf8f8' : '#fff' }}>
              <input type="checkbox" checked={!!c.incluir} onChange={() => toggle(c.cuenta_contable)} />
              <span style={{ flex: 1, color: c.incluir ? '#1a1a1a' : '#b0a0a0' }}>{c.cuenta_contable}</span>
              <span style={{ color: '#8a7a7a', fontWeight: 600 }}>{fMonto(c.avg_mes)}/mes</span>
            </label>
          ))}
        </div>

        {/* Gastos nuevos */}
        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: VINO, marginBottom: 8 }}>Gastos nuevos recurrentes (ajuste auto-extinguible)</div>
        {data.gastos_nuevos.filter((g) => !g._delete).map((g, i) => {
          const realIdx = data.gastos_nuevos.indexOf(g);
          return (
            <div key={g.id ?? 'new' + i} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
              <input style={{ ...S.input, flex: 2 }} placeholder="Concepto" value={g.concepto || ''} onChange={(e) => setGasto(realIdx, 'concepto', e.target.value)} />
              <input style={{ ...S.input, flex: 1 }} type="number" placeholder="₡/mes" value={g.monto_mensual ?? ''} onChange={(e) => setGasto(realIdx, 'monto_mensual', e.target.value)} />
              <input style={{ ...S.input, flex: 1 }} type="date" value={g.fecha_inicio ? String(g.fecha_inicio).slice(0, 10) : ''} onChange={(e) => setGasto(realIdx, 'fecha_inicio', e.target.value)} />
              <button style={{ ...S.btnGhost, padding: '7px 10px' }} onClick={() => delGasto(realIdx)}>🗑</button>
            </div>
          );
        })}
        <button style={{ ...S.btnGhost, marginTop: 4 }} onClick={addGasto}>＋ Agregar gasto</button>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20, alignItems: 'center' }}>
          {msg && <span style={{ fontSize: '0.8rem', color: '#8a7a7a' }}>{msg}</span>}
          <button style={S.btn} onClick={guardar} disabled={saving}>{saving ? 'Guardando…' : 'Guardar cambios'}</button>
        </div>
      </div>
    </div>
  );
}

// ── Página ────────────────────────────────────────────────────────────────────
export default function IncomodidadPage() {
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCfg, setShowCfg] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const [capRes, cap, gmroi, ventas, coh, eq, gastoDet, perdMes, perdRes, meta] = await Promise.all([
        sb.from('incomodidad_capital_muerto_resumen').select('*').maybeSingle(),
        sb.from('incomodidad_capital_muerto').select('*').in('estado', ['muerto', 'lento']).order('capital', { ascending: false }).limit(50),
        sb.from('incomodidad_gmroi').select('*'),
        sb.from('incomodidad_ventas_perdidas').select('*').gt('venta_perdida_est', 0).limit(60),
        sb.from('incomodidad_cohortes').select('*'),
        sb.from('incomodidad_equilibrio').select('*').maybeSingle(),
        sb.from('incomodidad_gasto_detalle').select('*').limit(12),
        sb.from('incomodidad_perdidas_inv_mensual').select('*'),
        sb.from('incomodidad_perdidas_inv_resumen').select('*').maybeSingle(),
        sb.from('incomodidad_meta').select('*').maybeSingle(),
      ]);
      const err = [capRes, cap, gmroi, ventas, coh, eq, gastoDet, perdMes, perdRes, meta].find((x) => x.error);
      if (err) throw err.error;
      setD({
        capRes: capRes.data, cap: cap.data || [], gmroi: gmroi.data || [],
        ventas: ventas.data || [], coh: coh.data || [], eq: eq.data,
        gastoDet: gastoDet.data || [], perdMes: perdMes.data || [], perdRes: perdRes.data,
        meta: meta.data,
      });
    } catch (e) {
      setError(e.message || 'Error cargando datos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  if (loading) return <div style={S.page}><div style={{ color: '#8a7a7a', padding: 40 }}>⏳ Cargando panel…</div></div>;
  if (error || !d) return <div style={S.page}><div style={{ color: ROJO, padding: 40 }}>No se pudieron cargar los datos. {error}</div></div>;

  const { capRes, cap, gmroi, ventas, coh, eq, gastoDet, perdMes, perdRes, meta } = d;
  const gmroiGlobal = gmroi.find((g) => g.es_global);
  const gmroiProv = gmroi.filter((g) => !g.es_global && (N(g.inv_costo) > 0)).sort((a, b) => N(a.gmroi ?? 999) - N(b.gmroi ?? 999));
  const ventaPerdidaTotal = ventas.reduce((s, v) => s + N(v.venta_perdida_est), 0);
  const nQuebrados = ventas.length;
  const gm = semGmroi(gmroiGlobal?.gmroi);
  const perdSem = N(perdRes?.mes_actual) > N(perdRes?.promedio_12m);
  const cruceColor = N(eq?.pct_equilibrio) >= 100 ? VERDE : (N(eq?.dia_cruce) <= 28 ? TEAL : ROJO);

  return (
    <div style={S.page}>
      <div style={S.wrap}>
        {/* Encabezado */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h1 style={S.title}>🔥 Panel de Incomodidad</h1>
            <div style={S.caption}>Los números que obligan a actuar · datos al {fFecha(meta?.datos_al)}</div>
          </div>
          <button style={S.btnGhost} onClick={() => setShowCfg(true)}>⚙️ Configurar equilibrio</button>
        </div>

        {/* ── Fila hero (5 tarjetas) ── */}
        <div style={S.heroGrid}>
          <Hero icon="💀" label="Capital muerto" valueColor={ROJO} value={fMonto(capRes?.capital_muerto)}
            bg={ESTADO_INFO.muerto.bg} bd={ESTADO_INFO.muerto.bd}
            sub={`${fNum(capRes?.n_muerto)} SKU · 🟠 lento ${fMonto(capRes?.capital_lento)}`} />
          <Hero icon="📦" label="GMROI global" valueColor={gm.c} value={N(gmroiGlobal?.gmroi).toFixed(2)}
            bg={gm.bg} bd={gm.bd}
            sub={`${gm.label} · utilidad 365d ÷ inventario`} />
          <Hero icon="🚫" label="Ventas perdidas / mes" valueColor={ROJO} value={fMonto(ventaPerdidaTotal)}
            bg={ESTADO_INFO.muerto.bg} bd={ESTADO_INFO.muerto.bd}
            sub={`${nQuebrados} SKU activos quebrados`} />
          <Hero icon="🎯" label="Equilibrio del mes" valueColor={cruceColor} value={fPct(eq?.pct_equilibrio, 0)}
            bg={N(eq?.pct_equilibrio) >= 100 ? ESTADO_INFO.recien_nacido.bg : '#fff'}
            bd={N(eq?.pct_equilibrio) >= 100 ? ESTADO_INFO.recien_nacido.bd : '#f0e3e3'}
            sub={N(eq?.pct_equilibrio) >= 100 ? '¡Equilibrio cruzado! 🎉' : `a este ritmo lo cruzás el día ${eq?.dia_cruce ?? '—'}`} />
          <Hero icon="🩸" label="Pérdidas inventario" valueColor={perdSem ? ROJO : VERDE} value={fMonto(perdRes?.mes_actual)}
            bg={perdSem ? ESTADO_INFO.muerto.bg : ESTADO_INFO.recien_nacido.bg}
            bd={perdSem ? ESTADO_INFO.muerto.bd : ESTADO_INFO.recien_nacido.bd}
            sub={`mes actual · prom 12m ${fMonto(perdRes?.promedio_12m)}`} />
        </div>

        {/* ── KPI 5 · Equilibrio (detalle) ── */}
        <Section title="Punto de equilibrio del mes en vivo" icon="🎯" defaultOpen>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 10, marginBottom: 14 }}>
            <MiniStat label="Gasto fijo / mes" value={fMonto(eq?.gasto_fijo_final)} color={VINO} />
            <MiniStat label="Venta mínima (equilibrio)" value={fMonto(eq?.equilibrio_ventas)} color={TEAL} />
            <MiniStat label="Venta acumulada" value={fMonto(eq?.venta_mes)} color={ORANGE} />
            <MiniStat label="Promedio diario" value={fMonto(eq?.promedio_diario)} color={TEAL} />
            <MiniStat label="Proyección del mes" value={fMonto(eq?.proyeccion_mes)} color={VINO} />
          </div>
          <BarraEquilibrio pct={N(eq?.pct_equilibrio)} dia={eq?.dia_cruce} />
          {eq?.crecimiento && (
            <div style={{ background: '#FFF7ED', border: '1px solid #FBD38D', borderRadius: 10, padding: '10px 12px', marginTop: 12, fontSize: '0.8rem', color: ORANGE, fontWeight: 600 }}>
              ⚠ Tu estructura de gastos está creciendo — el promedio de 3 meses ({fMonto(eq?.base_3m)}) supera al de 12 meses ({fMonto(eq?.base_12m)}) en más de 10%.
            </div>
          )}
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: VINO, marginBottom: 8 }}>
              Cómo se arma el gasto fijo · base 12m {fMonto(eq?.base_12m)} · base 3m {fMonto(eq?.base_3m)} · gastos nuevos +{fMonto(eq?.ajuste_nuevos)}
            </div>
            <div style={{ overflowX: 'auto', maxHeight: 320 }}>
              <table style={S.tbl}>
                <thead><tr><th style={S.thL}>Cuenta contable</th><th style={S.th}>₡/mes</th></tr></thead>
                <tbody>
                  {gastoDet.map((g, i) => (
                    <tr key={g.cuenta_contable}>
                      <td style={S.tdL(i)}>{g.cuenta_contable}</td>
                      <td style={S.td(i)}>{fFull(g.avg_mes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div style={S.nota}>Base = promedio móvil de 12 meses cerrados (reparte estacionales como aguinaldo y marchamo), sin asientos de cierre fiscal. Ventas sin IVA.</div>
        </Section>

        {/* ── KPI 1 · Capital muerto ── */}
        <Section title="Capital muerto — inventario que no rota" icon="💀" defaultOpen>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 10, marginBottom: 14 }}>
            <MiniStat label="🔴 Muerto" value={fMonto(capRes?.capital_muerto)} color={ROJO} sub={`${fNum(capRes?.n_muerto)} SKU`} />
            <MiniStat label="🟠 Lento" value={fMonto(capRes?.capital_lento)} color={ORANGE} sub={`${fNum(capRes?.n_lento)} SKU`} />
            <MiniStat label="🟡 Observación" value={fMonto(capRes?.capital_observacion)} color={AMBAR} sub={`${fNum(capRes?.n_observacion)} SKU`} />
            <MiniStat label="🟢 En maduración" value={fMonto(capRes?.capital_maduracion)} color={VERDE} sub={`${fNum(capRes?.n_maduracion)} SKU nuevos`} />
          </div>
          <div style={{ overflowX: 'auto', maxHeight: 440 }}>
            <table style={S.tbl}>
              <thead>
                <tr>
                  <th style={S.thL}>Código</th><th style={S.thL}>Descripción</th>
                  <th style={S.th}>Capital</th><th style={S.th}>Edad</th>
                  <th style={S.th}>Sin venta</th><th style={S.th}>% vida</th>
                  <th style={S.thL}>Estado</th><th style={S.th}>Últ. venta</th>
                </tr>
              </thead>
              <tbody>
                {cap.map((r, i) => {
                  const info = ESTADO_INFO[r.estado] || ESTADO_INFO.vivo;
                  return (
                    <tr key={r.codigo}>
                      <td style={S.tdL(i)}>{r.codigo}</td>
                      <td style={{ ...S.tdL(i), maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.descripcion}>{r.descripcion}</td>
                      <td style={{ ...S.td(i), fontWeight: 700 }}>{fMonto(r.capital)}</td>
                      <td style={S.td(i)}>{r.edad_confiable ? `${fNum(r.edad_dias)}d` : '≥1a*'}</td>
                      <td style={S.td(i)}>{fNum(r.dias_sin_venta)}d</td>
                      <td style={S.td(i)}>{fPct(N(r.pct_vida_sin_vender) * 100, 0)}</td>
                      <td style={S.tdL(i)}><span style={S.chip(info.c, info.bg)}>{info.label}</span></td>
                      <td style={S.td(i)}>{fFecha(r.ult_venta)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={S.nota}>🔴 Muerto = edad &gt; 180d y &gt; 180d sin vender. 🟢 En maduración (≤60d) no cuenta como muerto. *≥1a = SKU veterano, existía antes de que empezáramos a cargar datos.</div>
        </Section>

        {/* ── KPI 2 · GMROI ── */}
        <Section title="GMROI por proveedor" icon="📦">
          <div style={{ overflowX: 'auto', maxHeight: 420 }}>
            <table style={S.tbl}>
              <thead>
                <tr><th style={S.thL}>Proveedor</th><th style={S.th}>Utilidad 365d</th><th style={S.th}>Inventario</th><th style={S.th}>GMROI</th></tr>
              </thead>
              <tbody>
                {gmroiProv.map((g, i) => {
                  const s = semGmroi(g.gmroi);
                  return (
                    <tr key={g.proveedor}>
                      <td style={{ ...S.tdL(i), maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={g.proveedor}>{g.proveedor}</td>
                      <td style={S.td(i)}>{fMonto(g.ub_365)}</td>
                      <td style={S.td(i)}>{fMonto(g.inv_costo)}</td>
                      <td style={{ ...S.td(i), fontWeight: 700 }}><span style={S.chip(s.c, s.bg)}>{N(g.gmroi).toFixed(2)}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={S.nota}>GMROI = utilidad bruta de los últimos 365 días ÷ inventario actual al costo. 🔴 &lt;1.5 · 🟡 1.5–2.5 · 🟢 &gt;2.5. Ordenado de peor a mejor.</div>
        </Section>

        {/* ── KPI 3 · Ventas perdidas ── */}
        <Section title="Ventas perdidas por quiebre" icon="🚫">
          <div style={{ overflowX: 'auto', maxHeight: 420 }}>
            <table style={S.tbl}>
              <thead>
                <tr><th style={S.thL}>Código</th><th style={S.thL}>Descripción</th><th style={S.th}>Venta diaria</th><th style={S.th}>Días en cero</th><th style={S.th}>Perdido (est.)</th></tr>
              </thead>
              <tbody>
                {ventas.map((v, i) => (
                  <tr key={v.codigo}>
                    <td style={S.tdL(i)}>{v.codigo}</td>
                    <td style={{ ...S.tdL(i), maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={v.descripcion}>{v.descripcion}</td>
                    <td style={S.td(i)}>{fMonto(v.venta_diaria_prom)}</td>
                    <td style={S.td(i)}>{fNum(v.dias_cero_aprox)}</td>
                    <td style={{ ...S.td(i), fontWeight: 700, color: ROJO }}>{fMonto(v.venta_perdida_est)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={S.nota}>SKU activos con existencia 0. Venta perdida = venta diaria promedio (últimos 180d con stock) × días transcurridos del mes (aproximación conservadora — no sabemos el día exacto del quiebre).</div>
        </Section>

        {/* ── KPI 4 · Cohortes ── */}
        <Section title="Cohortes de ingreso — sell-through" icon="📈">
          <div style={{ overflowX: 'auto' }}>
            <table style={S.tbl}>
              <thead>
                <tr><th style={S.thL}>Cohorte (mes ingreso)</th><th style={S.th}>SKU</th><th style={S.th}>30 días</th><th style={S.th}>60 días</th><th style={S.th}>90 días</th></tr>
              </thead>
              <tbody>
                {coh.map((c, i) => (
                  <tr key={c.cohorte}>
                    <td style={S.tdL(i)}>{mesCorto(c.cohorte)}</td>
                    <td style={S.td(i)}>{fNum(c.skus)}</td>
                    <td style={{ ...S.td(i), color: semCohorte(c.st30), fontWeight: 700 }}>{fPct(c.st30, 0)}</td>
                    <td style={{ ...S.td(i), color: semCohorte(c.st60), fontWeight: 700 }}>{fPct(c.st60, 0)}</td>
                    <td style={{ ...S.td(i), color: semCohorte(c.st90), fontWeight: 700 }}>{fPct(c.st90, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={S.nota}>% del inventario inicial (aprox. por unidades: vendidas ÷ (vendidas + existencia)) ya vendido a los 30/60/90 días de ingresar. 🟢 ≥70% · 🟡 40–70% · 🔴 &lt;40%.</div>
        </Section>

        {/* ── KPI 6 · Pérdidas de inventario ── */}
        <Section title="Pérdidas de inventario (mermas, autoconsumo, diferencias)" icon="🩸">
          <GraficoPerdidas data={perdMes} />
          <div style={{ overflowX: 'auto', marginTop: 12 }}>
            <table style={S.tbl}>
              <thead>
                <tr><th style={S.thL}>Mes</th><th style={S.th}>Mermas</th><th style={S.th}>Autoconsumo</th><th style={S.th}>Diferencias</th><th style={S.th}>Total</th></tr>
              </thead>
              <tbody>
                {[...perdMes].reverse().map((p, i) => (
                  <tr key={p.mes}>
                    <td style={S.tdL(i)}>{mesCorto(p.mes)}</td>
                    <td style={S.td(i)}>{fMonto(p.mermas)}</td>
                    <td style={S.td(i)}>{fMonto(p.autoconsumo)}</td>
                    <td style={S.td(i)}>{fMonto(p.diferencias)}</td>
                    <td style={{ ...S.td(i), fontWeight: 700 }}>{fMonto(p.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={S.nota}>Cuentas 77-10-01/02/03. No entran al punto de equilibrio — es pérdida de inventario, tiene su propia tarjeta.</div>
        </Section>
      </div>

      {showCfg && <Config onClose={() => setShowCfg(false)} onSaved={cargar} />}
    </div>
  );
}

// ── Componentes auxiliares ────────────────────────────────────────────────────
function MiniStat({ label, value, color, sub }) {
  return (
    <div style={{ background: CREMA, borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#8a7a7a', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: '1.05rem', fontWeight: 800, color: color || TEAL, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: '0.66rem', color: '#9a8a8a', marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function BarraEquilibrio({ pct, dia }) {
  const p = Math.min(100, Math.max(0, N(pct)));
  const cruzado = N(pct) >= 100;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', color: '#8a7a7a', marginBottom: 5 }}>
        <span>Llevás <b style={{ color: VINO }}>{fPct(pct, 0)}</b> del equilibrio</span>
        <span>{cruzado ? '🎉 cruzado' : `cruce estimado: día ${dia ?? '—'}`}</span>
      </div>
      <div style={{ background: '#f0e3e3', borderRadius: 999, height: 16, overflow: 'hidden', position: 'relative' }}>
        <div style={{ width: `${p}%`, height: '100%', background: cruzado ? VERDE : `linear-gradient(90deg, ${ORANGE}, ${VINO})`, borderRadius: 999, transition: 'width .4s' }} />
      </div>
    </div>
  );
}

function GraficoPerdidas({ data }) {
  if (!data || data.length < 2) return null;
  const CW = 820, CH = 220, padL = 46, padR = 14, padT = 16, padB = 34;
  const pW = CW - padL - padR, pH = CH - padT - padB;
  const vals = data.map((m) => N(m.total));
  const yMax = Math.max(...vals, 1) * 1.15;
  const yS = (v) => padT + pH - (v / yMax) * pH;
  const colW = pW / data.length;
  const bW = Math.min(colW * 0.6, 34);
  const grid = Array.from({ length: 5 }, (_, i) => (yMax / 4) * i);
  return (
    <svg viewBox={`0 0 ${CW} ${CH}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      {grid.map((val, i) => (
        <g key={i}>
          <line x1={padL} y1={yS(val)} x2={CW - padR} y2={yS(val)} stroke="#f0e3e3" strokeWidth="1" strokeDasharray="3,3" />
          <text x={padL - 6} y={yS(val) + 4} textAnchor="end" fontSize="9.5" fill="#b0a0a0">{fMonto(val)}</text>
        </g>
      ))}
      {data.map((m, i) => {
        const x = padL + i * colW + (colW - bW) / 2;
        const parts = [
          { v: N(m.mermas), c: ROJO },
          { v: N(m.autoconsumo), c: AMBAR },
          { v: N(m.diferencias), c: VINO },
        ];
        let acc = 0;
        return (
          <g key={i}>
            {parts.map((p, j) => {
              const h = (Math.max(p.v, 0) / yMax) * pH;
              const y = yS(acc + Math.max(p.v, 0));
              acc += Math.max(p.v, 0);
              return <rect key={j} x={x} y={y} width={bW} height={h} fill={p.c} opacity="0.9" />;
            })}
            <text x={x + bW / 2} y={CH - padB + 14} textAnchor="middle" fontSize="9" fill="#8a7a7a">{mesCorto(m.mes)}</text>
          </g>
        );
      })}
      <rect x={padL} y={2} width="10" height="10" fill={ROJO} rx="2" /><text x={padL + 14} y={11} fontSize="9.5" fill="#8a7a7a">Mermas</text>
      <rect x={padL + 70} y={2} width="10" height="10" fill={AMBAR} rx="2" /><text x={padL + 84} y={11} fontSize="9.5" fill="#8a7a7a">Autoconsumo</text>
      <rect x={padL + 170} y={2} width="10" height="10" fill={VINO} rx="2" /><text x={padL + 184} y={11} fontSize="9.5" fill="#8a7a7a">Diferencias</text>
    </svg>
  );
}
