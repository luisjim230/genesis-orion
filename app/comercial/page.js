'use client';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/useAuth';

// ── Design Tokens – Liquid Glass Light ──────────────────────────────────────
const C = {
  gold: '#c8a84b',
  goldLight: '#f5efd8',
  green: '#2e7d4f',
  blue: '#3b6ea5',
  orange: '#c8882b',
  red: '#c04040',
  text: '#1e2a3a',
  muted: '#6b7a8d',
  white: '#ffffff',
  border: 'rgba(255,255,255,0.6)',
  cardBg: 'rgba(255,255,255,0.55)',
  pageBg: 'linear-gradient(135deg, #e8ecf4 0%, #d5dde8 30%, #e0e7f0 60%, #edf1f7 100%)',
};

const glassBorder = `1px solid ${C.border}`;
const glassCard = {
  background: C.cardBg,
  backdropFilter: 'blur(24px) saturate(1.8)',
  WebkitBackdropFilter: 'blur(24px) saturate(1.8)',
  border: glassBorder,
  borderRadius: 20,
  padding: 'clamp(16px, 3vw, 24px)',
  boxShadow: '0 4px 24px rgba(30,42,58,0.07)',
};

const S = {
  page: {
    background: C.pageBg,
    minHeight: '100vh',
    fontFamily: 'Rubik, sans-serif',
    color: C.text,
    padding: 'clamp(16px, 4vw, 32px)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 24,
  },
  title: {
    fontSize: 'clamp(1.3rem, 3vw, 1.7rem)',
    fontWeight: 800,
    color: C.text,
    margin: 0,
  },
  subtitle: {
    fontSize: '0.82rem',
    color: C.muted,
    fontWeight: 500,
    marginTop: 2,
  },
  card: { ...glassCard },
  cardSm: { ...glassCard, padding: 'clamp(12px, 2vw, 18px)' },
  tabBar: {
    display: 'flex',
    gap: 4,
    background: 'rgba(255,255,255,0.35)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    borderRadius: 14,
    padding: 4,
    marginBottom: 24,
    border: glassBorder,
    flexWrap: 'wrap',
  },
  tab: {
    padding: '10px 22px',
    borderRadius: 11,
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    fontSize: '0.88rem',
    fontWeight: 600,
    color: C.muted,
    fontFamily: 'Rubik, sans-serif',
    transition: 'all .2s',
  },
  tabOn: {
    padding: '10px 22px',
    borderRadius: 11,
    border: 'none',
    background: C.white,
    cursor: 'pointer',
    fontSize: '0.88rem',
    fontWeight: 700,
    color: C.gold,
    fontFamily: 'Rubik, sans-serif',
    boxShadow: '0 2px 10px rgba(200,168,75,0.15)',
    transition: 'all .2s',
  },
  th: {
    padding: '10px 14px',
    fontSize: '0.72rem',
    fontWeight: 700,
    color: C.muted,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    borderBottom: '2px solid rgba(200,168,75,0.2)',
    textAlign: 'left',
    whiteSpace: 'nowrap',
    background: 'rgba(255,255,255,0.3)',
  },
  td: {
    padding: '10px 14px',
    fontSize: '0.84rem',
    borderBottom: '1px solid rgba(200,168,75,0.08)',
    color: C.text,
  },
  label: {
    fontSize: '0.73rem',
    fontWeight: 700,
    color: C.muted,
    marginBottom: 6,
    display: 'block',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  },
  select: {
    padding: '9px 14px',
    borderRadius: 12,
    border: glassBorder,
    background: 'rgba(255,255,255,0.7)',
    backdropFilter: 'blur(8px)',
    fontSize: '0.88rem',
    color: C.text,
    fontFamily: 'Rubik, sans-serif',
    outline: 'none',
  },
  input: {
    padding: '9px 14px',
    borderRadius: 12,
    border: glassBorder,
    background: 'rgba(255,255,255,0.7)',
    backdropFilter: 'blur(8px)',
    fontSize: '0.88rem',
    color: C.text,
    fontFamily: 'Rubik, sans-serif',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  },
  btnPrimary: {
    background: `linear-gradient(135deg, ${C.gold}, #d4b85c)`,
    color: '#fff',
    border: 'none',
    borderRadius: 12,
    padding: '10px 24px',
    fontWeight: 700,
    cursor: 'pointer',
    fontSize: '0.88rem',
    fontFamily: 'Rubik, sans-serif',
    boxShadow: '0 2px 12px rgba(200,168,75,0.3)',
    transition: 'all .2s',
  },
  btnGhost: {
    background: 'rgba(255,255,255,0.5)',
    color: C.text,
    border: glassBorder,
    borderRadius: 12,
    padding: '9px 18px',
    fontWeight: 600,
    cursor: 'pointer',
    fontSize: '0.85rem',
    fontFamily: 'Rubik, sans-serif',
    backdropFilter: 'blur(8px)',
  },
  kicker: {
    color: C.gold,
    fontSize: '0.7rem',
    fontWeight: 700,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────────
const CRC = v => '\u20A1' + Math.round(parseFloat(v) || 0).toLocaleString('es-CR');
const N = v => parseFloat(v) || 0;
const pct = v => (N(v) * 100).toFixed(1) + '%';
const pctRaw = v => (N(v) * 100).toFixed(1);
const cap1 = v => Math.min(v, 1);
const currentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const notaColor = nota => {
  if (nota === 'A') return C.green;
  if (nota === 'B') return C.blue;
  if (nota === 'C') return C.orange;
  return C.red;
};

const notaBg = nota => {
  if (nota === 'A') return 'rgba(46,125,79,0.12)';
  if (nota === 'B') return 'rgba(59,110,165,0.12)';
  if (nota === 'C') return 'rgba(200,136,43,0.12)';
  return 'rgba(192,64,64,0.12)';
};

const calcNota = score => {
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 55) return 'C';
  return 'D';
};

function calcEficiencia(cumplMeta, cumplUtil, convCotiz, cumplSeg, partLlamadas) {
  const score =
    cap1(cumplMeta) * 30 +
    cap1(cumplUtil) * 20 +
    cap1(convCotiz) * 25 +
    cap1(cumplSeg) * 15 +
    cap1(partLlamadas) * 10;
  return Math.round(score * 100) / 100;
}

function calcAllKpis(auto, manual, metaBase, numVendedores) {
  const ventasMes = N(auto?.ventas_mes);
  const mb = N(metaBase);
  const meta5 = mb * 1.05;
  const meta10 = mb * 1.10;
  const cumplMetaBase = mb > 0 ? ventasMes / mb : 0;
  const cumplMeta5 = meta5 > 0 ? ventasMes / meta5 : 0;
  const cumplMeta10 = meta10 > 0 ? ventasMes / meta10 : 0;
  const utilPct = N(auto?.utilidad_pct);
  const cumplUtil = utilPct / 30;
  const utilColones = N(auto?.utilidad_colones);
  const llamadas = N(manual?.llamadas_contestadas);
  const totalLlamadas = N(manual?.total_llamadas_mes) || 2288;
  const tasaContest = totalLlamadas > 0 ? llamadas / totalLlamadas : 0;
  const partEsperada = totalLlamadas > 0 && numVendedores > 0 ? llamadas / (totalLlamadas / numVendedores) : 0;
  const cotiz = N(manual?.cotizaciones_emitidas);
  const ventasCotiz = N(manual?.ventas_desde_cotizacion);
  const convCotiz = cotiz > 0 ? ventasCotiz / cotiz : 0;
  const segProg = N(manual?.seguimientos_programados);
  const segReal = N(manual?.seguimientos_realizados);
  const cumplSeg = segProg > 0 ? segReal / segProg : 0;
  const errores = N(manual?.errores_facturacion);
  const puntaje = calcEficiencia(cumplMetaBase, cumplUtil, convCotiz, cumplSeg, partEsperada);
  const efiFinal = Math.max(0, puntaje - errores);
  const nota = calcNota(efiFinal);

  return {
    ventasMes, metaBase: mb, meta5, meta10,
    cumplMetaBase, cumplMeta5, cumplMeta10,
    utilPct, cumplUtil, utilColones,
    llamadas, totalLlamadas, tasaContest, partEsperada,
    cotiz, ventasCotiz, convCotiz,
    segProg, segReal, cumplSeg,
    errores, puntaje, efiFinal, nota,
    facturas: N(auto?.facturas_count),
    costoTotal: N(auto?.costo_total),
  };
}

// ── Small Components ─────────────────────────────────────────────────────────
function Spinner() {
  return (
    <div style={{ padding: 48, textAlign: 'center', color: C.muted, fontSize: '0.9rem' }}>
      Cargando...
    </div>
  );
}

function Empty({ msg, sub }) {
  return (
    <div style={{ textAlign: 'center', padding: 60, color: C.muted }}>
      <div style={{ fontSize: '2rem', marginBottom: 10, opacity: 0.5 }}>---</div>
      <div style={{ fontWeight: 700, color: C.text, marginBottom: 6 }}>{msg}</div>
      {sub && <div style={{ fontSize: '0.84rem' }}>{sub}</div>}
    </div>
  );
}

function SummaryCard({ kicker, value, sub, accent }) {
  return (
    <div style={{ ...S.cardSm, flex: '1 1 200px', minWidth: 180 }}>
      <div style={S.kicker}>{kicker}</div>
      <div style={{ fontSize: 'clamp(1.2rem, 3vw, 1.6rem)', fontWeight: 800, color: accent || C.text }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: '0.78rem', color: C.muted, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function NotaBadge({ nota, size = 'md' }) {
  const sz = size === 'lg' ? { fontSize: '1rem', padding: '4px 14px' } : { fontSize: '0.78rem', padding: '2px 10px' };
  return (
    <span style={{
      display: 'inline-block',
      background: notaBg(nota),
      color: notaColor(nota),
      fontWeight: 800,
      borderRadius: 8,
      ...sz,
    }}>
      {nota}
    </span>
  );
}

function ProgressBar({ value, max = 100, color = C.gold, height = 6 }) {
  const pctVal = Math.min(100, Math.round((value / Math.max(max, 1)) * 100));
  return (
    <div style={{ background: 'rgba(200,168,75,0.12)', borderRadius: height, height, width: '100%', overflow: 'hidden' }}>
      <div style={{ background: color, borderRadius: height, height, width: pctVal + '%', transition: 'width .4s ease' }} />
    </div>
  );
}

// ── KPI Detail Panel ─────────────────────────────────────────────────────────
function KpiDetailPanel({ kpis }) {
  const items = [
    { label: '1. Ventas del Mes', value: CRC(kpis.ventasMes) },
    { label: '2. Meta Crecimiento 5%', value: CRC(kpis.meta5) },
    { label: '3. Meta Crecimiento 10%', value: CRC(kpis.meta10) },
    { label: '4. Cumpl. Meta Base', value: pctRaw(kpis.cumplMetaBase) + '%', bar: kpis.cumplMetaBase },
    { label: '5. Cumpl. Meta 5%', value: pctRaw(kpis.cumplMeta5) + '%', bar: kpis.cumplMeta5 },
    { label: '6. Cumpl. Meta 10%', value: pctRaw(kpis.cumplMeta10) + '%', bar: kpis.cumplMeta10 },
    { label: '7. Utilidad %', value: kpis.utilPct.toFixed(1) + '%' },
    { label: '8. Cumpl. Utilidad (meta 30%)', value: pctRaw(kpis.cumplUtil) + '%', bar: kpis.cumplUtil },
    { label: '9. Utilidad Colones', value: CRC(kpis.utilColones) },
    { label: '10. Llamadas Contestadas', value: kpis.llamadas },
    { label: '11. Tasa Contestacion', value: pctRaw(kpis.tasaContest) + '%', bar: kpis.tasaContest },
    { label: '12. Participacion Esperada', value: pctRaw(kpis.partEsperada) + '%', bar: kpis.partEsperada },
    { label: '13. Cotizaciones Emitidas', value: kpis.cotiz },
    { label: '14. Ventas desde Cotizacion', value: kpis.ventasCotiz },
    { label: '15. Conversion Cotizacion', value: pctRaw(kpis.convCotiz) + '%', bar: kpis.convCotiz },
    { label: '16. Seguimientos Programados', value: kpis.segProg },
    { label: '17. Seguimientos Realizados', value: kpis.segReal },
    { label: '18. Cumpl. Seguimientos', value: pctRaw(kpis.cumplSeg) + '%', bar: kpis.cumplSeg },
    { label: '19. Errores Facturacion', value: kpis.errores, accent: kpis.errores > 0 ? C.red : C.green },
    { label: '20. Eficiencia Final', value: kpis.efiFinal.toFixed(1), accent: notaColor(kpis.nota) },
  ];

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
      gap: 12,
      padding: '16px 0',
    }}>
      {items.map((it, i) => (
        <div key={i} style={{
          ...S.cardSm,
          padding: '12px 16px',
          borderLeft: `3px solid ${it.accent || C.gold}`,
        }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 600, color: C.muted, marginBottom: 4 }}>{it.label}</div>
          <div style={{ fontSize: '1.05rem', fontWeight: 700, color: it.accent || C.text }}>{it.value}</div>
          {it.bar !== undefined && (
            <div style={{ marginTop: 6 }}>
              <ProgressBar value={Math.min(it.bar, 1) * 100} color={it.accent || C.gold} height={4} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════════
export default function ComercialV2() {
  const { perfil, loading: authLoading } = useAuth();
  const isAdmin = perfil?.rol === 'admin';

  const [tab, setTab] = useState('dashboard');
  const [mes, setMes] = useState(currentMonth());
  const [loading, setLoading] = useState(false);

  // Data states
  const [vendedores, setVendedores] = useState([]);
  const [ventasData, setVentasData] = useState([]);
  const [manualesData, setManualesData] = useState({});
  const [metasData, setMetasData] = useState({});
  const [expandedRow, setExpandedRow] = useState(null);

  // Form states (tab 2)
  const [formVendedor, setFormVendedor] = useState('');
  const [formMes, setFormMes] = useState(currentMonth());
  const [formData, setFormData] = useState({});
  const [formSaving, setFormSaving] = useState(false);
  const [formMsg, setFormMsg] = useState('');

  // Historial states (tab 3)
  const [historialData, setHistorialData] = useState([]);

  // ── Load vendedores (desde datos reales de facturación) ─────────────────────
  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc('comercial_ventas_vendedor', { p_mes: currentMonth() });
      const vends = (data || []).map(d => ({ id: d.vendedor, nombre: d.vendedor }));
      setVendedores(vends);
      // Si no es admin, auto-llenar con su propio nombre
      if (perfil?.rol !== 'admin' && perfil?.nombre) {
        setFormVendedor(perfil.nombre);
      }
    })();
  }, [perfil]);

  // ── Load dashboard data ────────────────────────────────────────────────────
  const loadDashboard = useCallback(async () => {
    if (!mes) return;
    setLoading(true);
    try {
      // Auto data from RPC
      const { data: ventas } = await supabase.rpc('comercial_ventas_vendedor', { p_mes: mes });
      setVentasData(ventas || []);

      // Manual data
      const { data: manuales } = await supabase
        .from('comercial_kpis_mensual')
        .select('*')
        .eq('mes', mes);
      const manMap = {};
      (manuales || []).forEach(m => { manMap[m.vendedor] = m; });
      setManualesData(manMap);

      // Metas for each vendedor in ventas
      const vNames = (ventas || []).map(v => v.vendedor);
      const metaMap = {};
      for (const vn of vNames) {
        const { data: meta } = await supabase.rpc('comercial_promedio_historico', { p_vendedor: vn });
        metaMap[vn] = N(meta);
      }
      setMetasData(metaMap);
    } catch (e) {
      console.error('Error cargando dashboard:', e);
    }
    setLoading(false);
  }, [mes]);

  useEffect(() => {
    if (tab === 'dashboard') loadDashboard();
  }, [tab, mes, loadDashboard]);

  // ── Load form data (tab 2) ─────────────────────────────────────────────────
  const loadFormData = useCallback(async () => {
    if (!formVendedor || !formMes) return;
    const { data } = await supabase
      .from('comercial_kpis_mensual')
      .select('*')
      .eq('vendedor', formVendedor)
      .eq('mes', formMes)
      .maybeSingle();
    if (data) {
      setFormData({
        llamadas_contestadas: data.llamadas_contestadas || '',
        total_llamadas_mes: data.total_llamadas_mes || 2288,
        cotizaciones_emitidas: data.cotizaciones_emitidas || '',
        ventas_desde_cotizacion: data.ventas_desde_cotizacion || '',
        seguimientos_programados: data.seguimientos_programados || '',
        seguimientos_realizados: data.seguimientos_realizados || '',
        errores_facturacion: data.errores_facturacion || '',
        observaciones: data.observaciones || '',
      });
    } else {
      setFormData({
        llamadas_contestadas: '',
        total_llamadas_mes: 2288,
        cotizaciones_emitidas: '',
        ventas_desde_cotizacion: '',
        seguimientos_programados: '',
        seguimientos_realizados: '',
        errores_facturacion: '',
        observaciones: '',
      });
    }
  }, [formVendedor, formMes]);

  useEffect(() => {
    if (tab === 'datos') loadFormData();
  }, [tab, formVendedor, formMes, loadFormData]);

  // ── Load historial (tab 3) ─────────────────────────────────────────────────
  const loadHistorial = useCallback(async () => {
    setLoading(true);
    try {
      const now = new Date();
      const months = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
      }

      const results = [];
      for (const vend of vendedores) {
        const row = { vendedor: vend.nombre, meses: {} };
        for (const m of months) {
          const { data: ventas } = await supabase.rpc('comercial_ventas_vendedor', { p_mes: m });
          const vData = (ventas || []).find(v => v.vendedor === vend.nombre);
          const { data: manual } = await supabase
            .from('comercial_kpis_mensual')
            .select('*')
            .eq('vendedor', vend.nombre)
            .eq('mes', m)
            .maybeSingle();
          const { data: meta } = await supabase.rpc('comercial_promedio_historico', { p_vendedor: vend.nombre });
          if (vData) {
            const kpis = calcAllKpis(vData, manual, N(meta), vendedores.length);
            row.meses[m] = kpis.nota;
          } else {
            row.meses[m] = '-';
          }
        }
        results.push(row);
      }
      setHistorialData(results);
    } catch (e) {
      console.error('Error historial:', e);
    }
    setLoading(false);
  }, [vendedores]);

  useEffect(() => {
    if (tab === 'historial' && vendedores.length > 0) loadHistorial();
  }, [tab, vendedores, loadHistorial]);

  // ── Computed dashboard data ────────────────────────────────────────────────
  const dashboardRows = useMemo(() => {
    return ventasData.map(v => {
      const manual = manualesData[v.vendedor] || {};
      const mb = metasData[v.vendedor] || 0;
      const kpis = calcAllKpis(v, manual, mb, vendedores.length);
      return { vendedor: v.vendedor, kpis };
    }).sort((a, b) => b.kpis.efiFinal - a.kpis.efiFinal);
  }, [ventasData, manualesData, metasData, vendedores]);

  const summaryStats = useMemo(() => {
    if (dashboardRows.length === 0) return null;
    const totalVentas = dashboardRows.reduce((s, r) => s + r.kpis.ventasMes, 0);
    const avgUtil = dashboardRows.reduce((s, r) => s + r.kpis.utilPct, 0) / dashboardRows.length;
    const mejor = dashboardRows[0];
    const peor = dashboardRows[dashboardRows.length - 1];
    return { totalVentas, avgUtil, mejor, peor };
  }, [dashboardRows]);

  // ── Save form ──────────────────────────────────────────────────────────────
  const saveForm = async () => {
    if (!formVendedor || !formMes) return;
    setFormSaving(true);
    setFormMsg('');
    try {
      const payload = {
        vendedor: formVendedor,
        mes: formMes,
        llamadas_contestadas: N(formData.llamadas_contestadas),
        total_llamadas_mes: N(formData.total_llamadas_mes) || 2288,
        cotizaciones_emitidas: N(formData.cotizaciones_emitidas),
        ventas_desde_cotizacion: N(formData.ventas_desde_cotizacion),
        seguimientos_programados: N(formData.seguimientos_programados),
        seguimientos_realizados: N(formData.seguimientos_realizados),
        errores_facturacion: N(formData.errores_facturacion),
        observaciones: formData.observaciones || '',
      };
      const { error } = await supabase
        .from('comercial_kpis_mensual')
        .upsert(payload, { onConflict: 'vendedor,mes' });
      if (error) throw error;
      setFormMsg('Datos guardados correctamente');
    } catch (e) {
      setFormMsg('Error: ' + e.message);
    }
    setFormSaving(false);
  };

  // ── Month options ──────────────────────────────────────────────────────────
  const monthOptions = useMemo(() => {
    const opts = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('es-CR', { year: 'numeric', month: 'long' });
      opts.push({ val, label });
    }
    return opts;
  }, []);

  // ── Last 6 months for historial ────────────────────────────────────────────
  const last6Months = useMemo(() => {
    const now = new Date();
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: d.toLocaleDateString('es-CR', { month: 'short', year: '2-digit' }),
      });
    }
    return months;
  }, []);

  // ── Auth guard ─────────────────────────────────────────────────────────────
  if (authLoading) return <div style={S.page}><Spinner /></div>;
  if (!perfil) return (
    <div style={S.page}>
      <Empty msg="Acceso denegado" sub="Inicia sesion para acceder a este modulo" />
    </div>
  );

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.header}>
        <div>
          <h1 style={S.title}>Comercial KPIs</h1>
          <div style={S.subtitle}>Deposito Jimenez &middot; Equipo de Ventas</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            ...S.cardSm,
            padding: '8px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            <span style={{ fontSize: '0.75rem', color: C.muted, fontWeight: 600 }}>Vendedores</span>
            <span style={{ fontSize: '1.1rem', fontWeight: 800, color: C.gold }}>{vendedores.length}</span>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div style={S.tabBar}>
        {[
          { key: 'dashboard', label: 'Dashboard' },
          { key: 'datos', label: 'Ingresar Datos' },
          { key: 'historial', label: 'Historial' },
        ].map(t => (
          <button
            key={t.key}
            style={tab === t.key ? S.tabOn : S.tab}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ─── TAB 1: DASHBOARD ─────────────────────────────────────────── */}
      {tab === 'dashboard' && (
        <div>
          {/* Month selector */}
          <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
            <label style={S.label}>Mes</label>
            <select style={S.select} value={mes} onChange={e => setMes(e.target.value)}>
              {monthOptions.map(o => (
                <option key={o.val} value={o.val}>{o.label}</option>
              ))}
            </select>
          </div>

          {loading ? <Spinner /> : (
            <>
              {/* Summary cards */}
              {summaryStats && (
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 24 }}>
                  <SummaryCard
                    kicker="Total Ventas Equipo"
                    value={CRC(summaryStats.totalVentas)}
                    accent={C.gold}
                  />
                  <SummaryCard
                    kicker="Promedio Utilidad %"
                    value={summaryStats.avgUtil.toFixed(1) + '%'}
                    accent={C.blue}
                  />
                  <SummaryCard
                    kicker="Mejor Vendedor"
                    value={summaryStats.mejor.vendedor}
                    sub={<NotaBadge nota={summaryStats.mejor.kpis.nota} />}
                    accent={C.green}
                  />
                  <SummaryCard
                    kicker="Peor Vendedor"
                    value={summaryStats.peor.vendedor}
                    sub={<NotaBadge nota={summaryStats.peor.kpis.nota} />}
                    accent={C.red}
                  />
                </div>
              )}

              {/* Ranking table */}
              {dashboardRows.length === 0 ? (
                <Empty msg="Sin datos para este mes" sub="Selecciona otro mes o ingresa datos" />
              ) : (
                <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'Rubik, sans-serif' }}>
                      <thead>
                        <tr>
                          {['#', 'Vendedor', 'Ventas Mes', 'Meta Base', 'Cumpl. Meta', 'Utilidad %', 'Llamadas', 'Conv. Cotiz.', 'Seguim.', 'Puntaje Efic.', 'Nota'].map(h => (
                            <th key={h} style={S.th}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {dashboardRows.map((row, idx) => {
                          const k = row.kpis;
                          const isExpanded = expandedRow === row.vendedor;
                          return (
                            <React.Fragment key={row.vendedor}>
                              <tr
                                style={{
                                  cursor: 'pointer',
                                  background: isExpanded ? 'rgba(200,168,75,0.06)' : (idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.3)'),
                                  transition: 'background .15s',
                                }}
                                onClick={() => setExpandedRow(isExpanded ? null : row.vendedor)}
                              >
                                <td style={{ ...S.td, fontWeight: 700, color: C.gold, width: 40 }}>{idx + 1}</td>
                                <td style={{ ...S.td, fontWeight: 700 }}>{row.vendedor}</td>
                                <td style={S.td}>{CRC(k.ventasMes)}</td>
                                <td style={S.td}>{CRC(k.metaBase)}</td>
                                <td style={S.td}>
                                  <span style={{ color: k.cumplMetaBase >= 1 ? C.green : C.red, fontWeight: 600 }}>
                                    {pctRaw(k.cumplMetaBase)}%
                                  </span>
                                </td>
                                <td style={S.td}>{k.utilPct.toFixed(1)}%</td>
                                <td style={S.td}>{k.llamadas}</td>
                                <td style={S.td}>{pctRaw(k.convCotiz)}%</td>
                                <td style={S.td}>{pctRaw(k.cumplSeg)}%</td>
                                <td style={{ ...S.td, fontWeight: 700 }}>{k.efiFinal.toFixed(1)}</td>
                                <td style={S.td}><NotaBadge nota={k.nota} /></td>
                              </tr>
                              {isExpanded && (
                                <tr>
                                  <td colSpan={11} style={{ padding: '0 16px 16px', background: 'rgba(200,168,75,0.03)' }}>
                                    <KpiDetailPanel kpis={k} />
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ─── TAB 2: INGRESAR DATOS (admin only) ──────────────────────── */}
      {tab === 'datos' && (
        <div style={{ ...S.card, maxWidth: 700 }}>
          <div style={S.kicker}>Ingresar KPIs Manuales</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 20 }}>Datos por Vendedor</div>

          {/* Vendedor + Mes selectors */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
            <div>
              <label style={S.label}>Vendedor</label>
              {isAdmin ? (
              <select
                style={{ ...S.select, width: '100%' }}
                value={formVendedor}
                onChange={e => setFormVendedor(e.target.value)}
              >
                <option value="">Seleccionar...</option>
                {vendedores.map(v => (
                  <option key={v.id} value={v.nombre}>{v.nombre}</option>
                ))}
              </select>
              ) : (
              <div style={{ ...S.select, width: '100%', background: '#f0f0f0', cursor: 'default' }}>{perfil?.nombre || '—'}</div>
              )}
            </div>
            <div>
              <label style={S.label}>Mes</label>
              <select
                style={{ ...S.select, width: '100%' }}
                value={formMes}
                onChange={e => setFormMes(e.target.value)}
              >
                {monthOptions.map(o => (
                  <option key={o.val} value={o.val}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          {formVendedor && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, marginBottom: 20 }}>
                {[
                  { key: 'llamadas_contestadas', label: 'Llamadas Contestadas' },
                  { key: 'total_llamadas_mes', label: 'Total Llamadas Mes' },
                  { key: 'cotizaciones_emitidas', label: 'Cotizaciones Emitidas' },
                  { key: 'ventas_desde_cotizacion', label: 'Ventas desde Cotizacion' },
                  { key: 'seguimientos_programados', label: 'Seguimientos Programados' },
                  { key: 'seguimientos_realizados', label: 'Seguimientos Realizados' },
                  { key: 'errores_facturacion', label: 'Errores Facturacion' },
                ].map(f => (
                  <div key={f.key}>
                    <label style={S.label}>{f.label}</label>
                    <input
                      type="number"
                      style={S.input}
                      value={formData[f.key] ?? ''}
                      onChange={e => setFormData(prev => ({ ...prev, [f.key]: e.target.value }))}
                      placeholder="0"
                    />
                  </div>
                ))}
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={S.label}>Observaciones</label>
                <textarea
                  style={{ ...S.input, minHeight: 80, resize: 'vertical' }}
                  value={formData.observaciones || ''}
                  onChange={e => setFormData(prev => ({ ...prev, observaciones: e.target.value }))}
                  placeholder="Notas adicionales..."
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <button style={S.btnPrimary} onClick={saveForm} disabled={formSaving}>
                  {formSaving ? 'Guardando...' : 'Guardar Datos'}
                </button>
                {formMsg && (
                  <span style={{
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    color: formMsg.startsWith('Error') ? C.red : C.green,
                  }}>
                    {formMsg}
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ─── TAB 3: HISTORIAL ─────────────────────────────────────────── */}
      {tab === 'historial' && (
        <div>
          <div style={{ ...S.card, marginBottom: 20 }}>
            <div style={S.kicker}>Tendencia de Notas</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 16 }}>Ultimos 6 Meses por Vendedor</div>

            {loading ? <Spinner /> : historialData.length === 0 ? (
              <Empty msg="Sin datos historicos" sub="Los datos se calcularan cuando haya informacion disponible" />
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'Rubik, sans-serif' }}>
                  <thead>
                    <tr>
                      <th style={S.th}>Vendedor</th>
                      {last6Months.map(m => (
                        <th key={m.key} style={{ ...S.th, textAlign: 'center' }}>{m.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {historialData.map((row, idx) => (
                      <tr key={row.vendedor} style={{ background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.3)' }}>
                        <td style={{ ...S.td, fontWeight: 700 }}>{row.vendedor}</td>
                        {last6Months.map(m => {
                          const nota = row.meses[m.key];
                          return (
                            <td key={m.key} style={{ ...S.td, textAlign: 'center' }}>
                              {nota && nota !== '-' ? <NotaBadge nota={nota} /> : (
                                <span style={{ color: C.muted, fontSize: '0.8rem' }}>-</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

