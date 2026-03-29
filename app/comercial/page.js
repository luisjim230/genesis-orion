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
  const [informeVentasNetas, setInformeVentasNetas] = useState(null);
  const [informeData, setInformeData] = useState([]);
  const [expandedRow, setExpandedRow] = useState(null);
  const [statusReportes, setStatusReportes] = useState(null);

  // Form states (tab 2)
  const [formVendedor, setFormVendedor] = useState('');
  const [formMes, setFormMes] = useState(currentMonth());
  const [formData, setFormData] = useState({});
  const [formSaving, setFormSaving] = useState(false);
  const [formMsg, setFormMsg] = useState('');

  // Historial states (tab 3)
  const [historialData, setHistorialData] = useState([]);

  // Ganadores states (tab 4)
  const [ganadoresData, setGanadoresData] = useState([]);
  const [ganadoresLoading, setGanadoresLoading] = useState(false);
  const [ganadoresMes, setGanadoresMes] = useState('');
  const [ganadoresVendedor, setGanadoresVendedor] = useState('');
  const [ganadoresOrden, setGanadoresOrden] = useState('utilidad');

  // Tendencias states (tab 5)
  const [tendenciasData, setTendenciasData] = useState([]);
  const [tendenciasLoading, setTendenciasLoading] = useState(false);
  const [tendenciasVendedor, setTendenciasVendedor] = useState('');
  const [tendenciasMetrica, setTendenciasMetrica] = useState('monto'); // 'monto'|'utilidad'|'cantidad'

  // Tendencias por producto
  const [productoSearch, setProductoSearch] = useState('');
  const [productoQuery, setProductoQuery] = useState('');
  const [productoData, setProductoData] = useState([]);
  const [productoLoading, setProductoLoading] = useState(false);
  const [productoSeleccionado, setProductoSeleccionado] = useState(null); // codigo_interno

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

      // Ventas netas desde informe oficial (más preciso que items facturados)
      const { data: informeRows } = await supabase
        .from('neo_informe_ventas_vendedor')
        .select('vendedor, ventas_netas, pct_utilidad, utilidad, notas_totales')
        .eq('mes', mes);
      const totalInforme = (informeRows || []).reduce((s, r) => s + N(r.ventas_netas), 0);
      setInformeVentasNetas(totalInforme > 0 ? totalInforme : null);
      setInformeData(informeRows || []);

      // Status de reportes (para alertas de datos incompletos)
      const { data: stRows } = await supabase.rpc('comercial_status_reportes', { p_mes: mes });
      setStatusReportes(stRows?.[0] || null);

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

  // ── Load ganadores (tab 4) ─────────────────────────────────────────────────
  const loadGanadores = useCallback(async () => {
    setGanadoresLoading(true);
    try {
      const params = { p_top: 100 };
      if (ganadoresMes)      params.p_mes      = ganadoresMes;
      if (ganadoresVendedor) params.p_vendedor  = ganadoresVendedor;
      const { data, error } = await supabase.rpc('comercial_top_productos', params);
      if (error) console.error('RPC ganadores error:', error);
      setGanadoresData(data || []);
    } catch (e) {
      console.error('Error ganadores:', e);
    }
    setGanadoresLoading(false);
  }, [ganadoresMes, ganadoresVendedor]);

  useEffect(() => {
    if (tab === 'ganadores') loadGanadores();
  }, [tab, ganadoresMes, ganadoresVendedor, loadGanadores]);

  // ── Load tendencias (tab 5) ────────────────────────────────────────────────
  const loadTendencias = useCallback(async () => {
    setTendenciasLoading(true);
    try {
      const params = {};
      if (tendenciasVendedor) params.p_vendedor = tendenciasVendedor;
      const { data, error } = await supabase.rpc('comercial_tendencias_mensuales', params);
      if (error) console.error('RPC tendencias error:', error);
      setTendenciasData(data || []);
    } catch (e) {
      console.error('Error tendencias:', e);
    }
    setTendenciasLoading(false);
  }, [tendenciasVendedor]);

  useEffect(() => {
    if (tab === 'tendencias') loadTendencias();
  }, [tab, tendenciasVendedor, loadTendencias]);

  const loadProducto = useCallback(async (q) => {
    if (!q || q.trim().length < 2) return;
    setProductoLoading(true);
    setProductoSeleccionado(null);
    try {
      const { data } = await supabase
        .from('neo_items_facturados')
        .select('fecha, cantidad_facturada, total, item, codigo_interno')
        .or(`item.ilike.%${q.trim()}%,codigo_interno.ilike.%${q.trim()}%`)
        .limit(8000);
      setProductoData(data || []);
    } catch (e) { console.error(e); }
    setProductoLoading(false);
  }, []);

  // ── Computed dashboard data ────────────────────────────────────────────────
  const dashboardRows = useMemo(() => {
    // Cuando hay informe de ventas cargado, usar esos datos (nombres y montos correctos)
    const baseData = informeData.length > 0
      ? informeData.map(r => ({
          vendedor:     r.vendedor,
          ventas_mes:   N(r.ventas_netas),
          utilidad_pct: N(r.pct_utilidad),
          utilidad_colones: N(r.utilidad),
          nc_monto:     N(r.notas_totales),
          nc_facturas:  0,
        }))
      : ventasData;

    return baseData.map(v => {
      const manual = manualesData[v.vendedor] || {};
      const mb = metasData[v.vendedor] || 0;
      const kpis = calcAllKpis(v, manual, mb, baseData.length);
      return { vendedor: v.vendedor, kpis, nc_monto: N(v.nc_monto), nc_facturas: N(v.nc_facturas) };
    }).sort((a, b) => b.kpis.efiFinal - a.kpis.efiFinal);
  }, [ventasData, informeData, manualesData, metasData]);

  // Date range from actual data
  const dataRange = useMemo(() => {
    if (ventasData.length === 0) return null;
    let allMin = null, allMax = null;
    ventasData.forEach(v => {
      if (v.fecha_min && (!allMin || v.fecha_min < allMin)) allMin = v.fecha_min;
      if (v.fecha_max && (!allMax || v.fecha_max > allMax)) allMax = v.fecha_max;
    });
    if (!allMin || !allMax) return null;
    const fmtDay = f => f ? f.split('/')[0] : '';
    const dayMin = parseInt(fmtDay(allMin), 10);
    const dayMax = parseInt(fmtDay(allMax), 10);
    const monthNames = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    const mm = parseInt(allMin.split('/')[1], 10) - 1;
    return { dayMin, dayMax, monthLabel: monthNames[mm] || '' };
  }, [ventasData]);

  const summaryStats = useMemo(() => {
    if (dashboardRows.length === 0) return null;
    const totalVentasItems = dashboardRows.reduce((s, r) => s + r.kpis.ventasMes, 0);
    const totalVentas = informeVentasNetas != null ? informeVentasNetas : totalVentasItems;
    const fuenteVentas = informeVentasNetas != null ? 'Informe de Ventas' : 'Ítems Facturados';
    const avgUtil = dashboardRows.reduce((s, r) => s + r.kpis.utilPct, 0) / dashboardRows.length;
    const totalNC = dashboardRows.reduce((s, r) => s + r.nc_monto, 0);
    const mejor = dashboardRows[0];
    const peor = dashboardRows[dashboardRows.length - 1];
    return { totalVentas, fuenteVentas, avgUtil, totalNC, mejor, peor };
  }, [dashboardRows, informeVentasNetas]);

  // ── Ganadores sorted ──────────────────────────────────────────────────────
  const ganadoresSorted = useMemo(() => {
    const d = [...ganadoresData];
    if (ganadoresOrden === 'monto')    d.sort((a, b) => N(b.total_monto)     - N(a.total_monto));
    else if (ganadoresOrden === 'cantidad') d.sort((a, b) => N(b.total_cantidad) - N(a.total_cantidad));
    else                               d.sort((a, b) => N(b.total_utilidad)  - N(a.total_utilidad));
    return d;
  }, [ganadoresData, ganadoresOrden]);

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
          { key: 'ganadores',   label: '🏆 Top Productos' },
          { key: 'tendencias',  label: '📈 Tendencias' },
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
          {/* Month selector + date range */}
          <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <label style={S.label}>Mes</label>
            <select style={S.select} value={mes} onChange={e => setMes(e.target.value)}>
              {monthOptions.map(o => (
                <option key={o.val} value={o.val}>{o.label}</option>
              ))}
            </select>
            {dataRange && (
              <span style={{ fontSize: '0.8rem', color: C.muted, fontWeight: 600, background: 'rgba(200,168,75,0.1)', padding: '5px 12px', borderRadius: 8 }}>
                Datos del {dataRange.dayMin} al {dataRange.dayMax} de {dataRange.monthLabel}
              </span>
            )}
          </div>

          {/* Alert: missing reports */}
          {statusReportes && (!statusReportes.tiene_items || !statusReportes.tiene_informe) && (
            <div style={{ background: 'rgba(192,64,64,0.08)', border: '1px solid rgba(192,64,64,0.25)', borderRadius: 12, padding: '12px 18px', marginBottom: 20, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>&#9888;</span>
              <div style={{ fontSize: '0.82rem', color: C.red, fontWeight: 600, lineHeight: 1.5 }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Datos incompletos para comisiones</div>
                {!statusReportes.tiene_items && <div>Falta: Lista de items facturados</div>}
                {!statusReportes.tiene_informe && <div>Falta: Informe de ventas por vendedor (necesario para notas de credito exactas)</div>}
                {statusReportes.tiene_items && statusReportes.items_dias < 15 && (
                  <div>Items facturados solo tiene {statusReportes.items_dias} dias de datos ({statusReportes.items_fecha_min} al {statusReportes.items_fecha_max})</div>
                )}
                <div style={{ color: C.muted, fontWeight: 500, marginTop: 4 }}>Sube los reportes faltantes en el modulo de Reportes para calculo exacto.</div>
              </div>
            </div>
          )}
          {statusReportes && statusReportes.tiene_items && statusReportes.tiene_informe && (
            <div style={{ background: 'rgba(46,125,79,0.08)', border: '1px solid rgba(46,125,79,0.2)', borderRadius: 12, padding: '8px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: C.green, fontSize: '0.85rem' }}>&#10003;</span>
              <span style={{ fontSize: '0.78rem', color: C.green, fontWeight: 600 }}>Datos completos — Items facturados + Informe de ventas cargados</span>
            </div>
          )}

          {loading ? <Spinner /> : (
            <>
              {/* Summary cards */}
              {summaryStats && (
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 24 }}>
                  <SummaryCard
                    kicker="Total Ventas Equipo"
                    value={CRC(summaryStats.totalVentas)}
                    sub={<span style={{ fontSize: '0.72rem', color: C.muted }}>{summaryStats.fuenteVentas}</span>}
                    accent={C.gold}
                  />
                  <SummaryCard
                    kicker="Notas de Crédito"
                    value={CRC(summaryStats.totalNC)}
                    accent={C.orange}
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
                          {['#', 'Vendedor', 'Ventas Mes', 'Notas Créd.', 'Meta Base', 'Cumpl. Meta', 'Utilidad %', 'Llamadas', 'Conv. Cotiz.', 'Seguim.', 'Puntaje Efic.', 'Nota'].map(h => (
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
                                <td style={{ ...S.td, color: row.nc_monto > 0 ? C.orange : C.muted }}>{CRC(row.nc_monto)}</td>
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
                                  <td colSpan={12} style={{ padding: '0 16px 16px', background: 'rgba(200,168,75,0.03)' }}>
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

      {/* ─── TAB 4: TOP PRODUCTOS GANADORES ──────────────────────────── */}
      {tab === 'ganadores' && (
        <div>
          {/* Filtros */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
            <div>
              <label style={S.label}>Mes</label>
              <select style={S.select} value={ganadoresMes} onChange={e => setGanadoresMes(e.target.value)}>
                <option value="">Todos (acumulado)</option>
                {monthOptions.map(o => (
                  <option key={o.val} value={o.val}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={S.label}>Vendedor</label>
              <select style={S.select} value={ganadoresVendedor} onChange={e => setGanadoresVendedor(e.target.value)}>
                <option value="">Todos</option>
                {vendedores.map(v => (
                  <option key={v.id} value={v.nombre}>{v.nombre}</option>
                ))}
              </select>
            </div>
            <div style={{ marginTop: 18 }}>
              {[
                { key: 'utilidad', label: 'Por Utilidad ₡' },
                { key: 'monto',    label: 'Por Monto' },
                { key: 'cantidad', label: 'Por Cantidad' },
              ].map(o => (
                <button
                  key={o.key}
                  onClick={() => setGanadoresOrden(o.key)}
                  style={{
                    padding: '8px 16px',
                    border: 'none',
                    borderRadius: 9,
                    cursor: 'pointer',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    fontFamily: 'Rubik, sans-serif',
                    marginRight: 6,
                    background: ganadoresOrden === o.key ? C.gold : 'rgba(255,255,255,0.5)',
                    color:      ganadoresOrden === o.key ? C.white : C.muted,
                    boxShadow:  ganadoresOrden === o.key ? '0 2px 8px rgba(200,168,75,0.3)' : 'none',
                    transition: 'all .15s',
                  }}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {ganadoresLoading ? <Spinner /> : ganadoresSorted.length === 0 ? (
            <Empty msg="Sin datos" sub="Sube los reportes de ítems facturados para ver los productos ganadores" />
          ) : (
            <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
              {/* Resumen rápido */}
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', padding: '18px 20px 14px', borderBottom: `1px solid rgba(200,168,75,0.15)` }}>
                <div style={{ flex: '1 1 140px' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: 1 }}>Productos</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, color: C.gold }}>{ganadoresSorted.length}</div>
                </div>
                <div style={{ flex: '1 1 180px' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: 1 }}>Monto Total</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: C.text }}>{CRC(ganadoresSorted.reduce((s, r) => s + N(r.total_monto), 0))}</div>
                </div>
                <div style={{ flex: '1 1 180px' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: 1 }}>Utilidad Total</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: C.green }}>{CRC(ganadoresSorted.reduce((s, r) => s + N(r.total_utilidad), 0))}</div>
                </div>
                <div style={{ flex: '1 1 140px' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: 1 }}>Utilidad Prom.</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: C.blue }}>
                    {(ganadoresSorted.reduce((s, r) => s + N(r.utilidad_pct), 0) / ganadoresSorted.length).toFixed(1)}%
                  </div>
                </div>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'Rubik, sans-serif' }}>
                  <thead>
                    <tr>
                      {['#', 'Código', 'Producto', 'Marca', 'Utilidad ₡', 'Util %', 'Monto', 'Cantidad', 'Meses', 'Mejor Vendedor', 'Peor Vendedor'].map(h => (
                        <th key={h} style={S.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ganadoresSorted.map((row, idx) => {
                      const upct = N(row.utilidad_pct);
                      const utilColor = upct >= 30 ? C.green : upct >= 15 ? C.orange : C.red;
                      const consMax = Math.max(...ganadoresSorted.map(r => N(r.consistencia)));
                      const consRatio = consMax > 0 ? N(row.consistencia) / consMax : 0;
                      const consColor = consRatio >= 0.8 ? C.green : consRatio >= 0.5 ? C.blue : C.muted;
                      return (
                        <tr
                          key={row.codigo + idx}
                          style={{ background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.3)' }}
                        >
                          <td style={{ ...S.td, fontWeight: 700, color: C.gold, width: 36 }}>{idx + 1}</td>
                          <td style={{ ...S.td, fontSize: '0.75rem', color: C.muted, fontFamily: 'monospace' }}>{row.codigo}</td>
                          <td style={{ ...S.td, fontWeight: 600, maxWidth: 220, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.producto}</td>
                          <td style={{ ...S.td, fontSize: '0.78rem', color: C.muted }}>{row.marca || '—'}</td>
                          <td style={{ ...S.td, fontWeight: 700, color: C.green }}>{CRC(row.total_utilidad)}</td>
                          <td style={{ ...S.td, fontWeight: 700, color: utilColor }}>{upct.toFixed(1)}%</td>
                          <td style={S.td}>{CRC(row.total_monto)}</td>
                          <td style={S.td}>{Math.round(N(row.total_cantidad)).toLocaleString('es-CR')}</td>
                          <td style={{ ...S.td, textAlign: 'center' }}>
                            <span style={{
                              display: 'inline-block',
                              background: consColor + '22',
                              color: consColor,
                              borderRadius: 6,
                              padding: '2px 8px',
                              fontSize: '0.78rem',
                              fontWeight: 700,
                            }}>
                              {row.consistencia}m
                            </span>
                          </td>
                          <td style={{ ...S.td, fontSize: '0.8rem' }}>
                            <div style={{ fontWeight: 600, color: C.green }}>{row.mejor_vendedor || '—'}</div>
                            <div style={{ fontSize: '0.72rem', color: C.muted }}>{CRC(row.mejor_vendedor_monto)}</div>
                          </td>
                          <td style={{ ...S.td, fontSize: '0.8rem' }}>
                            <div style={{ fontWeight: 600, color: C.orange }}>{row.peor_vendedor || '—'}</div>
                            <div style={{ fontSize: '0.72rem', color: C.muted }}>{CRC(row.peor_vendedor_monto)}</div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── TAB 5: TENDENCIAS ESTACIONALES ──────────────────────────── */}
      {tab === 'tendencias' && (() => {
        const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
        const metricaKey = tendenciasMetrica === 'monto' ? 'monto_total'
          : tendenciasMetrica === 'utilidad' ? 'utilidad_total' : 'cantidad_total';

        // Organizar datos en grid[anio][mes_num]
        const grid = {};
        (tendenciasData || []).forEach(r => {
          if (!grid[r.anio]) grid[r.anio] = {};
          grid[r.anio][r.mes_num] = r;
        });
        const anios = Object.keys(grid).map(Number).sort();
        const aniosCompletos = anios.filter(a => a < 2026); // excluir año parcial del índice

        // Promedio histórico por mes (excluye 2026 por ser parcial)
        const promMes = {};
        for (let m = 1; m <= 12; m++) {
          const vals = aniosCompletos.map(a => N(grid[a]?.[m]?.[metricaKey])).filter(v => v > 0);
          promMes[m] = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
        }
        const globalProm = Object.values(promMes).filter(v => v > 0).reduce((s, v) => s + v, 0)
          / Object.values(promMes).filter(v => v > 0).length || 1;

        // Totales anuales
        const totalAnio = {};
        anios.forEach(a => {
          totalAnio[a] = Object.values(grid[a] || {}).reduce((s, r) => s + N(r[metricaKey]), 0);
        });

        // Crecimiento año a año
        const aniosGrowth = anios.filter(a => a <= 2025);

        const fmtVal = v => tendenciasMetrica === 'cantidad'
          ? Math.round(v).toLocaleString('es-CR')
          : '₡' + (v >= 1e6 ? (v/1e6).toFixed(1) + 'M' : Math.round(v/1000) + 'K');

        const heatColor = (val, promRef) => {
          if (!promRef || !val) return 'transparent';
          const ratio = val / promRef;
          if (ratio >= 1.20) return 'rgba(46,125,79,0.22)';
          if (ratio >= 1.05) return 'rgba(46,125,79,0.10)';
          if (ratio >= 0.95) return 'transparent';
          if (ratio >= 0.80) return 'rgba(192,64,64,0.09)';
          return 'rgba(192,64,64,0.20)';
        };

        return (
          <div>
            {/* Filtros */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
              <div>
                <label style={S.label}>Vendedor</label>
                <select style={S.select} value={tendenciasVendedor} onChange={e => setTendenciasVendedor(e.target.value)}>
                  <option value="">Todo el equipo</option>
                  {vendedores.map(v => <option key={v.id} value={v.nombre}>{v.nombre}</option>)}
                </select>
              </div>
              <div style={{ marginTop: 18 }}>
                {[{k:'monto',l:'Monto ₡'},{k:'utilidad',l:'Utilidad ₡'},{k:'cantidad',l:'Cantidad'}].map(o => (
                  <button key={o.k} onClick={() => setTendenciasMetrica(o.k)} style={{
                    padding: '8px 16px', border: 'none', borderRadius: 9, cursor: 'pointer',
                    fontSize: '0.82rem', fontWeight: 700, fontFamily: 'Rubik, sans-serif', marginRight: 6,
                    background: tendenciasMetrica === o.k ? C.gold : 'rgba(255,255,255,0.5)',
                    color: tendenciasMetrica === o.k ? C.white : C.muted,
                    boxShadow: tendenciasMetrica === o.k ? '0 2px 8px rgba(200,168,75,0.3)' : 'none',
                  }}>{o.l}</button>
                ))}
              </div>
            </div>

            {/* ── Sección 0: Estacionalidad por Producto ── */}
            {(() => {
              const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
              // Parsear fecha DD/MM/YYYY → {anio, mes}
              const parseFecha = (f) => {
                if (!f || typeof f !== 'string') return null;
                const p = f.split('/');
                if (p.length < 3) return null;
                return { mes: parseInt(p[1]), anio: parseInt(p[2]) };
              };

              // Agrupar productoData por anio/mes
              const pgrid = {};
              (productoData || []).forEach(r => {
                const d = parseFecha(r.fecha);
                if (!d) return;
                if (!pgrid[d.anio]) pgrid[d.anio] = {};
                if (!pgrid[d.anio][d.mes]) pgrid[d.anio][d.mes] = { monto: 0, cantidad: 0 };
                pgrid[d.anio][d.mes].monto    += parseFloat(r.total || 0);
                pgrid[d.anio][d.mes].cantidad += parseFloat(r.cantidad_facturada || 0);
              });
              const panios = Object.keys(pgrid).map(Number).sort();
              const paniosHist = panios.filter(a => a < 2026);
              const ppromMes = {};
              for (let m = 1; m <= 12; m++) {
                const vals = paniosHist.map(a => pgrid[a]?.[m]?.monto || 0).filter(v => v > 0);
                ppromMes[m] = vals.length ? vals.reduce((s,v)=>s+v,0)/vals.length : 0;
              }
              const pglobalProm = Object.values(ppromMes).filter(v=>v>0).reduce((s,v)=>s+v,0) /
                (Object.values(ppromMes).filter(v=>v>0).length || 1);

              // Nombre del producto encontrado
              const nombreProducto = productoData[0]?.item || productoQuery;

              return (
                <div style={{ ...glassCard, marginBottom: 20 }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.08em', color: C.gold, textTransform: 'uppercase', marginBottom: 6 }}>Estacionalidad por Producto</div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
                    <input
                      type="text"
                      placeholder="Buscar producto (ej: zinc, cemento, panel...)"
                      value={productoSearch}
                      onChange={e => setProductoSearch(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { setProductoQuery(productoSearch); loadProducto(productoSearch); }}}
                      style={{ flex: '1 1 260px', padding: '8px 14px', borderRadius: 10, border: `1px solid rgba(200,168,75,0.3)`, background: 'rgba(255,255,255,0.6)', fontFamily: 'Rubik, sans-serif', fontSize: '0.85rem', color: C.text, outline: 'none' }}
                    />
                    <button
                      onClick={() => { setProductoQuery(productoSearch); loadProducto(productoSearch); }}
                      style={{ padding: '8px 20px', background: C.gold, border: 'none', borderRadius: 10, color: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: 'Rubik, sans-serif', fontSize: '0.85rem' }}
                    >Buscar</button>
                    {productoData.length > 0 && (
                      <button onClick={() => { setProductoSearch(''); setProductoQuery(''); setProductoData([]); }}
                        style={{ padding: '8px 14px', background: 'rgba(200,64,64,0.1)', border: '1px solid rgba(200,64,64,0.2)', borderRadius: 10, color: C.red, fontWeight: 600, cursor: 'pointer', fontFamily: 'Rubik, sans-serif', fontSize: '0.82rem' }}>✕ Limpiar</button>
                    )}
                  </div>

                  {productoLoading && <Spinner />}

                  {!productoLoading && productoQuery && productoData.length === 0 && (
                    <div style={{ color: C.muted, fontSize: '0.85rem', padding: '12px 0' }}>No se encontraron productos con "{productoQuery}"</div>
                  )}

                  {!productoLoading && productoData.length > 0 && (
                    <>
                      {/* Lista de productos encontrados */}
                      {(() => {
                        const distintos = Object.values(
                          productoData.reduce((acc, r) => {
                            const k = r.codigo_interno || r.item;
                            if (!acc[k]) acc[k] = { codigo: r.codigo_interno, nombre: (r.item||'').trim(), count: 0 };
                            acc[k].count++;
                            return acc;
                          }, {})
                        ).sort((a,b) => b.count - a.count);
                        return distintos.length > 1 ? (
                          <div style={{ marginBottom: 14 }}>
                            <div style={{ fontSize: '0.75rem', color: C.muted, marginBottom: 8 }}>{distintos.length} productos encontrados — elegí uno:</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                              {distintos.map(p => (
                                <button key={p.codigo} onClick={() => setProductoSeleccionado(p.codigo)}
                                  style={{ padding: '5px 12px', borderRadius: 20, border: `1.5px solid ${productoSeleccionado === p.codigo ? C.gold : 'rgba(200,168,75,0.25)'}`, background: productoSeleccionado === p.codigo ? C.gold : 'rgba(255,255,255,0.5)', color: productoSeleccionado === p.codigo ? '#fff' : C.text, fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'Rubik, sans-serif' }}>
                                  {p.nombre || p.codigo}
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : null;
                      })()}

                      {/* Solo mostrar gráfico si hay producto seleccionado (o hay solo 1) */}
                      {(() => {
                        const distintos = [...new Set(productoData.map(r => r.codigo_interno))];
                        const mostrar = distintos.length === 1 || productoSeleccionado;
                        if (!mostrar) return null;
                        const codigoFiltro = productoSeleccionado || distintos[0];
                        const datosFiltrados = productoData.filter(r => r.codigo_interno === codigoFiltro);
                        const nombreMostrar = (datosFiltrados[0]?.item || codigoFiltro || '').trim();
                        // Recalcular grid solo para este producto
                        const pgrid2 = {};
                        datosFiltrados.forEach(r => {
                          const d = parseFecha(r.fecha);
                          if (!d) return;
                          if (!pgrid2[d.anio]) pgrid2[d.anio] = {};
                          if (!pgrid2[d.anio][d.mes]) pgrid2[d.anio][d.mes] = { monto: 0, cantidad: 0 };
                          pgrid2[d.anio][d.mes].monto    += parseFloat(r.total || 0);
                          pgrid2[d.anio][d.mes].cantidad += parseFloat(r.cantidad_facturada || 0);
                        });
                        const panios2 = Object.keys(pgrid2).map(Number).sort();
                        const paniosHist2 = panios2.filter(a => a < 2026);
                        const pprom2 = {};
                        for (let m = 1; m <= 12; m++) {
                          const vals = paniosHist2.map(a => pgrid2[a]?.[m]?.monto || 0).filter(v => v > 0);
                          pprom2[m] = vals.length ? vals.reduce((s,v)=>s+v,0)/vals.length : 0;
                        }
                        const pglobal2 = Object.values(pprom2).filter(v=>v>0).reduce((s,v)=>s+v,0) /
                          (Object.values(pprom2).filter(v=>v>0).length || 1);
                        return (
                          <>
                            <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: 4, color: C.text }}>{nombreMostrar}</div>
                            <div style={{ fontSize: '0.75rem', color: C.muted, marginBottom: 16 }}>{datosFiltrados.length.toLocaleString()} registros · {panios2.join(', ')}</div>

                      {/* Barras estacionales */}
                      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 20 }}>
                        {MESES.map((nombre, i) => {
                          const m = i + 1;
                          const idx = pprom2[m] > 0 ? Math.round(pprom2[m] / pglobal2 * 100) : 0;
                          const isStrong = idx >= 105, isWeak = idx <= 95;
                          const barH = Math.max(20, Math.min(100, idx * 0.8));
                          const col = isStrong ? C.green : isWeak ? C.red : C.blue;
                          return (
                            <div key={m} style={{ flex: '1 1 50px', textAlign: 'center', minWidth: 44 }}>
                              <div style={{ fontSize: '0.72rem', fontWeight: 800, color: col, marginBottom: 3 }}>{idx > 0 ? `${idx}%` : '—'}</div>
                              <div style={{ height: barH, background: col+'33', border: `2px solid ${col}`, borderRadius: 7, margin: '0 auto 5px', width: '80%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 3 }}>
                                <div style={{ width: '60%', background: col, borderRadius: 4, height: `${Math.max(8, barH*0.6)}px` }} />
                              </div>
                              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: C.muted }}>{nombre}</div>
                              <div style={{ fontSize: '0.65rem', color: C.muted }}>
                                {pprom2[m] > 0 ? '₡'+(pprom2[m]/1e6).toFixed(1)+'M' : '—'}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Heatmap año × mes */}
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                          <thead>
                            <tr>
                              <th style={{ ...S.th, textAlign: 'left' }}>Mes</th>
                              {panios2.map(a => <th key={a} style={{ ...S.th }}>{a}</th>)}
                              <th style={{ ...S.th, color: C.gold }}>Prom.</th>
                            </tr>
                          </thead>
                          <tbody>
                            {MESES.map((nombre, i) => {
                              const m = i + 1;
                              return (
                                <tr key={m} style={{ borderBottom: '1px solid rgba(200,168,75,0.07)' }}>
                                  <td style={{ ...S.td, fontWeight: 700, color: C.muted }}>{nombre}</td>
                                  {panios2.map(a => {
                                    const val = pgrid2[a]?.[m]?.monto || 0;
                                    const ratio = pprom2[m] > 0 ? val/pprom2[m] : 0;
                                    const bg = ratio >= 1.2 ? 'rgba(46,125,79,0.2)' : ratio >= 1.05 ? 'rgba(46,125,79,0.09)' : ratio > 0 && ratio <= 0.8 ? 'rgba(192,64,64,0.18)' : ratio > 0 ? 'rgba(192,64,64,0.07)' : 'transparent';
                                    return (
                                      <td key={a} style={{ ...S.td, textAlign: 'center', background: bg, fontWeight: val > 0 ? 600 : 400 }}>
                                        {val > 0 ? '₡'+(val/1e6).toFixed(1)+'M' : <span style={{ color: C.muted }}>—</span>}
                                      </td>
                                    );
                                  })}
                                  <td style={{ ...S.td, textAlign: 'center', fontWeight: 700, color: C.gold }}>
                                    {pprom2[m] > 0 ? '₡'+(pprom2[m]/1e6).toFixed(1)+'M' : '—'}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}

                  {!productoQuery && (
                    <div style={{ color: C.muted, fontSize: '0.82rem' }}>Escribe el nombre de un producto y presiona Enter o Buscar para ver su estacionalidad histórica.</div>
                  )}
                </div>
              );
            })()}

            {tendenciasLoading ? <Spinner /> : tendenciasData.length === 0 ? (
              <Empty msg="Sin datos" sub="Carga los reportes de ítems facturados para ver tendencias" />
            ) : (<>

              {/* ── Sección 1: Índice Estacional ── */}
              <div style={{ ...S.card, marginBottom: 20 }}>
                <div style={S.kicker}>Patrón Estacional</div>
                <div style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: 4 }}>Índice por Mes</div>
                <div style={{ fontSize: '0.78rem', color: C.muted, marginBottom: 20 }}>
                  100 = promedio histórico · verde = mes fuerte · rojo = mes débil · basado en {aniosCompletos.join(', ')}
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  {MESES.map((nombre, i) => {
                    const m = i + 1;
                    const idx = promMes[m] > 0 ? Math.round(promMes[m] / globalProm * 100) : 0;
                    const isStrong = idx >= 105;
                    const isWeak   = idx <= 95;
                    const barH = Math.max(20, Math.min(120, idx * 0.9));
                    const barColor = isStrong ? C.green : isWeak ? C.red : C.blue;
                    return (
                      <div key={m} style={{ flex: '1 1 60px', textAlign: 'center', minWidth: 52 }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 800, color: barColor, marginBottom: 4 }}>{idx}%</div>
                        <div style={{
                          height: barH, background: barColor + '33', border: `2px solid ${barColor}`,
                          borderRadius: 8, margin: '0 auto 6px', width: '80%',
                          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
                          paddingBottom: 4,
                        }}>
                          <div style={{ width: '60%', background: barColor, borderRadius: 4, height: `${Math.max(10, barH * 0.6)}px` }} />
                        </div>
                        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: C.muted }}>{nombre}</div>
                        <div style={{ fontSize: '0.68rem', color: C.muted }}>{fmtVal(promMes[m])}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ── Sección 2: Tabla Año × Mes (heatmap) ── */}
              <div style={{ ...S.card, marginBottom: 20 }}>
                <div style={S.kicker}>Comparativo Histórico</div>
                <div style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: 4 }}>Año × Mes</div>
                <div style={{ fontSize: '0.78rem', color: C.muted, marginBottom: 16 }}>
                  Verde = por encima del promedio histórico del mes · Rojo = por debajo
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'Rubik, sans-serif' }}>
                    <thead>
                      <tr>
                        <th style={{ ...S.th, textAlign: 'left', minWidth: 50 }}>Mes</th>
                        {anios.map(a => <th key={a} style={{ ...S.th, minWidth: 80 }}>{a}</th>)}
                        <th style={{ ...S.th, minWidth: 80, color: C.gold }}>Prom.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {MESES.map((nombre, i) => {
                        const m = i + 1;
                        return (
                          <tr key={m} style={{ borderBottom: `1px solid rgba(200,168,75,0.08)` }}>
                            <td style={{ ...S.td, fontWeight: 700, color: C.muted, fontSize: '0.82rem' }}>{nombre}</td>
                            {anios.map(a => {
                              const val = N(grid[a]?.[m]?.[metricaKey]);
                              const bg  = heatColor(val, promMes[m]);
                              return (
                                <td key={a} style={{ ...S.td, textAlign: 'center', background: bg, fontSize: '0.78rem', fontWeight: val > 0 ? 600 : 400 }}>
                                  {val > 0 ? fmtVal(val) : <span style={{ color: C.muted }}>—</span>}
                                </td>
                              );
                            })}
                            <td style={{ ...S.td, textAlign: 'center', fontWeight: 700, color: C.gold, fontSize: '0.78rem' }}>
                              {promMes[m] > 0 ? fmtVal(promMes[m]) : '—'}
                            </td>
                          </tr>
                        );
                      })}
                      {/* Fila total */}
                      <tr style={{ borderTop: `2px solid rgba(200,168,75,0.2)`, background: 'rgba(200,168,75,0.04)' }}>
                        <td style={{ ...S.td, fontWeight: 800 }}>Total</td>
                        {anios.map(a => (
                          <td key={a} style={{ ...S.td, textAlign: 'center', fontWeight: 800, fontSize: '0.78rem' }}>
                            {fmtVal(totalAnio[a])}
                          </td>
                        ))}
                        <td style={{ ...S.td, textAlign: 'center', fontWeight: 800, color: C.gold, fontSize: '0.78rem' }}>
                          {fmtVal(Object.values(totalAnio).filter(v=>v>0).reduce((s,v)=>s+v,0) / Object.values(totalAnio).filter(v=>v>0).length)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ── Sección 3: Crecimiento Anual ── */}
              <div style={{ ...S.card }}>
                <div style={S.kicker}>Crecimiento</div>
                <div style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: 16 }}>Tendencia Anual</div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  {aniosGrowth.map((a, idx) => {
                    const prev = aniosGrowth[idx - 1];
                    const pct = prev && totalAnio[prev] > 0
                      ? ((totalAnio[a] - totalAnio[prev]) / totalAnio[prev] * 100).toFixed(1)
                      : null;
                    const maxTotal = Math.max(...aniosGrowth.map(x => totalAnio[x]));
                    const barH = maxTotal > 0 ? Math.max(40, totalAnio[a] / maxTotal * 160) : 40;
                    const isGrow = pct !== null && parseFloat(pct) > 0;
                    return (
                      <div key={a} style={{ flex: '1 1 80px', textAlign: 'center', minWidth: 80 }}>
                        {pct !== null && (
                          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: isGrow ? C.green : C.red, marginBottom: 4 }}>
                            {isGrow ? '▲' : '▼'} {Math.abs(pct)}%
                          </div>
                        )}
                        <div style={{
                          height: barH, background: `linear-gradient(180deg, ${C.gold}44, ${C.gold}88)`,
                          border: `2px solid ${C.gold}`, borderRadius: '10px 10px 0 0',
                          margin: '0 auto', width: '70%',
                        }} />
                        <div style={{ fontSize: '0.78rem', fontWeight: 800, color: C.text, marginTop: 6 }}>{a}</div>
                        <div style={{ fontSize: '0.72rem', color: C.muted }}>{fmtVal(totalAnio[a])}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

            </>)}
          </div>
        );
      })()}

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

