'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import BiDashboard from './BiDashboard';
import BiInteligencia from './BiInteligencia';

// ── Semáforo de urgencia ────────────────────────────────────────────────────
function urgencia(diasRestantes, leadTime) {
  if (diasRestantes === null) return { color: '#999', label: '—', orden: 99 };
  if (diasRestantes <= 0) return { color: '#E53E3E', label: '🔴 Vencido', orden: 0 };
  if (diasRestantes <= leadTime) return { color: '#E53E3E', label: '🔴 Pedí YA', orden: 1 };
  if (diasRestantes <= leadTime * 1.5) return { color: '#D69E2E', label: '🟡 Urgente', orden: 2 };
  if (diasRestantes <= leadTime * 2.5) return { color: '#DD6B20', label: '🟠 Pronto', orden: 3 };
  return { color: '#38A169', label: '🟢 OK', orden: 4 };
}

function fmtFecha(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtMeses(meses) {
  if (meses === null || meses === undefined) return '—';
  if (meses >= 99) return '∞';
  return meses.toFixed(1) + ' m';
}

function fmtCRC(val) {
  if (!val && val !== 0) return '—';
  return '₡' + Math.round(val).toLocaleString('es-CR');
}

// ── Mini gráfico SVG ─────────────────────────────────────────────────────────
function MiniGrafico({ existencias, consumoMensual, leadTimeDias, diasQuiebre }) {
  if (!consumoMensual || consumoMensual <= 0)
    return <span style={{ color: '#ccc', fontSize: 11 }}>sin datos</span>;
  const W = 100, H = 32;
  const mesesTotal = Math.min((existencias / consumoMensual) + 1, 12);
  const puntos = [];
  for (let m = 0; m <= Math.ceil(mesesTotal); m++) {
    const inv = Math.max(existencias - consumoMensual * m, 0);
    const x = (m / Math.ceil(mesesTotal)) * W;
    const y = H - (existencias > 0 ? (inv / existencias) * (H - 4) : 0);
    puntos.push(`${x},${y}`);
    if (inv === 0) break;
  }
  const xQuiebre = diasQuiebre ? Math.min((diasQuiebre / 30 / Math.ceil(mesesTotal)) * W, W) : null;
  const xLead = leadTimeDias && diasQuiebre ? Math.max(xQuiebre - (leadTimeDias / 30 / Math.ceil(mesesTotal)) * W, 0) : null;
  return (
    <svg width={W} height={H} style={{ overflow: 'visible' }}>
      {xLead !== null && <line x1={xLead} y1={0} x2={xLead} y2={H} stroke="#D69E2E" strokeWidth={1} strokeDasharray="3,2" />}
      {xQuiebre !== null && <line x1={xQuiebre} y1={0} x2={xQuiebre} y2={H} stroke="#E53E3E" strokeWidth={1} strokeDasharray="3,2" />}
      <polyline points={puntos.join(' ')} fill="none" stroke="var(--teal,#2B6CB0)" strokeWidth={1.5} />
      <line x1={0} y1={H} x2={W} y2={H} stroke="#eee" strokeWidth={1} />
    </svg>
  );
}

function colorGrupo(items) {
  const minOrden = Math.min(...items.map(i => i._urgencia.orden));
  if (minOrden <= 1) return { bg: '#FFF5F5', border: '#FC8181' };
  if (minOrden === 2) return { bg: '#FFFFF0', border: '#F6E05E' };
  if (minOrden === 3) return { bg: '#FFFAF0', border: '#FBD38D' };
  return { bg: '#F0FFF4', border: '#9AE6B4' };
}

// ── Tabs del módulo ──────────────────────────────────────────────────────────
const TABS = [
  { id: 'proveedor', label: '🏭 Por Proveedor' },
  { id: 'productos', label: '🔍 Todos los Productos' },
  { id: 'dashboard', label: '📊 Dashboard Ejecutivo' },
  { id: 'inteligencia', label: '🧠 Inteligencia' },
];

export default function KronosTab({ calc, transitoMap }) {
  const [leadTimes, setLeadTimes] = useState({});
  const [editando, setEditando] = useState(null);
  const [editVal, setEditVal] = useState('');
  const [editNotas, setEditNotas] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [busquedaPlana, setBusquedaPlana] = useState('');
  const [filtroUrgencia, setFiltroUrgencia] = useState('todos');
  const [filtroUrgenciaPlana, setFiltroUrgenciaPlana] = useState('todos');
  const [expandidos, setExpandidos] = useState({});
  const [msg, setMsg] = useState(null);
  const [consumoHistorico, setConsumoHistorico] = useState({});
  const [ultimaCompraMap, setUltimaCompraMap] = useState({});
  const [preciosMap, setPreciosMap] = useState({});
  const [cargandoHistorial, setCargandoHistorial] = useState(true);
  const [periodos, setPeriodos] = useState([]);
  const [tabActivo, setTabActivo] = useState('proveedor');
  const [sortPlana, setSortPlana] = useState({ col: '_urgencia_orden', dir: 'asc' });
  const [paginaPlana, setPaginaPlana] = useState(1);
  const PAGE_SIZE = 50;

  useEffect(() => {
    cargarLeadTimes();
    cargarConsumoHistorico();
    cargarUltimasCompras();
  }, []);

  // Última fecha de entrada de stock por código. Se usa como piso de 30 días
  // antes de clasificar un producto como "muerto" / liquidable / sobrestock.
  async function cargarUltimasCompras() {
    try {
      let offset = 0;
      const BATCH = 1000;
      const map = {};
      while (true) {
        const { data, error } = await supabase
          .from('neo_items_comprados')
          .select('codigo_interno,fecha')
          .range(offset, offset + BATCH - 1);
        if (error || !data || !data.length) break;
        data.forEach(r => {
          const cod = (r.codigo_interno || '').toString().trim();
          if (!cod || !r.fecha) return;
          const f = r.fecha;
          if (!map[cod] || f > map[cod]) map[cod] = f;
        });
        if (data.length < BATCH) break;
        offset += BATCH;
      }
      setUltimaCompraMap(map);
    } catch (e) { console.error(e); }
  }

  // Días desde la última entrada de stock. Si nunca se compró en el histórico
  // cargado, devuelve Infinity (= el producto no es "nuevo").
  const diasDesdeUltimaCompra = useCallback((codigo) => {
    const cod = (codigo || '').toString().trim();
    const f = ultimaCompraMap[cod];
    if (!f) return Infinity;
    const ms = Date.now() - new Date(f).getTime();
    return Math.floor(ms / 86400000);
  }, [ultimaCompraMap]);

  async function cargarLeadTimes() {
    try {
      const { data } = await supabase.from('proveedores_leadtime').select('*');
      const map = {};
      (data || []).forEach(r => { map[r.proveedor] = r; });
      setLeadTimes(map);
    } catch (e) { console.error(e); }
  }

  async function cargarConsumoHistorico() {
    setCargandoHistorial(true);
    try {
      const { data: ps } = await supabase
        .from('neo_items_facturados')
        .select('periodo_reporte')
        .not('periodo_reporte', 'is', null)
        .limit(1000);
      const periodosUnicos = [...new Set((ps || []).map(r => r.periodo_reporte))].sort();
      setPeriodos(periodosUnicos);

      if (!periodosUnicos.length) { setCargandoHistorial(false); return; }

      let offset = 0;
      const BATCH = 1000;
      const acum = {};
      const precios = {};

      while (true) {
        const { data, error } = await supabase
          .from('neo_items_facturados')
          .select('codigo_interno,cantidad_facturada,cantidad_devuelta,fecha,precio_unitario,costo_unitario')
          .range(offset, offset + BATCH - 1);
        if (error || !data || !data.length) break;
        data.forEach(r => {
          const cod = (r.codigo_interno || '').toString().trim();
          if (!cod) return;
          const qty = (parseFloat(r.cantidad_facturada) || 0) - (parseFloat(r.cantidad_devuelta) || 0);
          const mes = r.fecha ? r.fecha.slice(0, 7) : null;
          if (!acum[cod]) acum[cod] = { totalUnidades: 0, meses: new Set(), precioSum: 0, costoSum: 0, cnt: 0 };
          acum[cod].totalUnidades += qty;
          if (mes) acum[cod].meses.add(mes);
          if (r.precio_unitario) { acum[cod].precioSum += parseFloat(r.precio_unitario) || 0; acum[cod].cnt++; }
          if (r.costo_unitario) acum[cod].costoSum += parseFloat(r.costo_unitario) || 0;
        });
        if (data.length < BATCH) break;
        offset += BATCH;
      }

      const consumo = {};
      const pMap = {};
      Object.entries(acum).forEach(([cod, v]) => {
        consumo[cod] = v.totalUnidades / (v.meses.size || 1);
        if (v.cnt > 0) pMap[cod] = { precio: v.precioSum / v.cnt, costo: v.costoSum / v.cnt };
      });
      setConsumoHistorico(consumo);
      setPreciosMap(pMap);
    } catch (e) { console.error(e); }
    setCargandoHistorial(false);
  }

  async function guardarLeadTime(proveedor) {
    const dias = parseInt(editVal) || 30;
    setGuardando(true);
    try {
      await supabase.from('proveedores_leadtime').upsert({
        proveedor, lead_time_dias: dias,
        activo: leadTimes[proveedor]?.activo ?? true, notas: editNotas,
      }, { onConflict: 'proveedor' });
      setLeadTimes(prev => ({ ...prev, [proveedor]: { ...prev[proveedor], proveedor, lead_time_dias: dias, activo: prev[proveedor]?.activo ?? true, notas: editNotas } }));
      setEditando(null);
      mostrarMsg(`Lead time de ${proveedor} guardado: ${dias} días`);
    } catch (e) { mostrarMsg('Error al guardar', 'err'); }
    setGuardando(false);
  }

  async function toggleActivo(proveedor) {
    const actual = leadTimes[proveedor];
    const nuevoActivo = !(actual?.activo ?? true);
    try {
      await supabase.from('proveedores_leadtime').upsert({
        proveedor, lead_time_dias: actual?.lead_time_dias || 8,
        activo: nuevoActivo, notas: actual?.notas || '',
      }, { onConflict: 'proveedor' });
      setLeadTimes(prev => ({ ...prev, [proveedor]: { ...prev[proveedor], proveedor, activo: nuevoActivo } }));
    } catch (e) { mostrarMsg('Error al actualizar', 'err'); }
  }

  function mostrarMsg(t, tipo = 'ok') {
    setMsg({ t, tipo });
    setTimeout(() => setMsg(null), 3500);
  }

  // ── Proyecciones (core logic) ────────────────────────────────────────────
  const proyecciones = useMemo(() => {
    if (!calc || !calc.length) return [];
    const hoy = new Date();
    return calc.map(item => {
      const cod = (item.codigo || '').toString().trim();
      const prov = (item.ultimo_proveedor || '').trim();
      const existencias = parseFloat(item.existencias) || 0;
      const enTransito = transitoMap?.[cod] || 0;
      const stockTotal = existencias + enTransito;
      const consumoReal = consumoHistorico[cod];
      const consumoNeo = parseFloat(item.promedio_mensual) || 0;
      const consumoMensual = (consumoReal !== undefined && consumoReal > 0) ? consumoReal : consumoNeo;
      const fuenteConsumo = (consumoReal !== undefined && consumoReal > 0) ? 'real' : (consumoNeo > 0 ? 'neo' : null);
      const lt = leadTimes[prov];
      const leadTimeDias = lt?.lead_time_dias || 8;
      const activo = lt?.activo ?? true;
      const pInfo = preciosMap[cod];
      const precio = pInfo?.precio || parseFloat(item.precio_venta) || 0;
      const costo = pInfo?.costo || parseFloat(item.costo) || 0;
      const margen = precio > 0 ? ((precio - costo) / precio) * 100 : 0;
      const ventaMensualCRC = consumoMensual * precio;

      if (!consumoMensual || consumoMensual <= 0) {
        return {
          ...item, _consumoMensual: 0, _fuenteConsumo: null,
          _mesesCobertura: null, _diasQuiebre: null, _fechaQuiebre: null,
          _fechaPedido: null, _diasParaPedir: null,
          _urgencia: urgencia(null, 0), _urgencia_orden: 99,
          _leadTime: leadTimeDias, _activo: activo,
          _precio: precio, _costo: costo, _margen: margen, _ventaMensualCRC: 0,
          _valorStock: existencias * costo,
        };
      }

      const mesesCobertura = stockTotal / consumoMensual;
      const diasQuiebre = Math.round(mesesCobertura * 30);
      const fechaQuiebre = new Date(hoy.getTime() + diasQuiebre * 86400000);
      const fechaPedido = new Date(fechaQuiebre.getTime() - leadTimeDias * 86400000);
      const diasParaPedir = Math.round((fechaPedido.getTime() - hoy.getTime()) / 86400000);
      const urg = urgencia(diasParaPedir, leadTimeDias);

      return {
        ...item,
        _consumoMensual: consumoMensual, _fuenteConsumo: fuenteConsumo,
        _mesesCobertura: mesesCobertura, _diasQuiebre: diasQuiebre,
        _fechaQuiebre: fechaQuiebre.toISOString().slice(0, 10),
        _fechaPedido: fechaPedido.toISOString().slice(0, 10),
        _diasParaPedir: diasParaPedir, _leadTime: leadTimeDias, _activo: activo,
        _urgencia: urg, _urgencia_orden: urg.orden,
        _precio: precio, _costo: costo, _margen: margen,
        _ventaMensualCRC: ventaMensualCRC,
        _valorStock: existencias * costo,
      };
    });
  }, [calc, consumoHistorico, leadTimes, transitoMap, preciosMap]);

  const stats = useMemo(() => ({
    rojos: proyecciones.filter(i => i._urgencia.orden <= 1).length,
    amarillos: proyecciones.filter(i => i._urgencia.orden === 2).length,
    naranjas: proyecciones.filter(i => i._urgencia.orden === 3).length,
    verdes: proyecciones.filter(i => i._urgencia.orden === 4).length,
  }), [proyecciones]);

  // ── Vista plana con sort y paginación ──────────────────────────────────────
  const productosPlanos = useMemo(() => {
    let items = [...proyecciones];
    if (busquedaPlana.trim()) {
      const q = busquedaPlana.toLowerCase();
      items = items.filter(i =>
        [i.codigo, i.nombre, i.ultimo_proveedor, i.categoria]
          .some(v => (v || '').toLowerCase().includes(q))
      );
    }
    if (filtroUrgenciaPlana !== 'todos') {
      const ordenMax = { critico: 1, urgente: 2, pronto: 3, ok: 4 };
      const max = ordenMax[filtroUrgenciaPlana] ?? 99;
      items = items.filter(i => i._urgencia.orden <= max);
    }
    // Sort
    const { col, dir } = sortPlana;
    items.sort((a, b) => {
      let va = a[col] ?? (typeof a[col] === 'number' ? 0 : '');
      let vb = b[col] ?? (typeof b[col] === 'number' ? 0 : '');
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      if (va < vb) return dir === 'asc' ? -1 : 1;
      if (va > vb) return dir === 'asc' ? 1 : -1;
      return 0;
    });
    return items;
  }, [proyecciones, busquedaPlana, filtroUrgenciaPlana, sortPlana]);

  const paginasTotal = Math.ceil(productosPlanos.length / PAGE_SIZE);
  const productosPlanosPagina = productosPlanos.slice((paginaPlana - 1) * PAGE_SIZE, paginaPlana * PAGE_SIZE);

  function toggleSort(col) {
    setSortPlana(prev => prev.col === col ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' });
    setPaginaPlana(1);
  }
  function SortIcon({ col }) {
    if (sortPlana.col !== col) return <span style={{ color: '#ccc', marginLeft: 3 }}>↕</span>;
    return <span style={{ color: 'var(--orange)', marginLeft: 3 }}>{sortPlana.dir === 'asc' ? '↑' : '↓'}</span>;
  }

  // ── Dashboard ejecutivo ──────────────────────────────────────────────────
  const dashboard = useMemo(() => {
    const conConsumo = proyecciones.filter(i => i._consumoMensual > 0);
    // Productos críticos con mayor venta mensual
    const criticos = proyecciones
      .filter(i => i._urgencia.orden <= 1 && i._ventaMensualCRC > 0)
      .sort((a, b) => b._ventaMensualCRC - a._ventaMensualCRC)
      .slice(0, 50);

    // Valor en riesgo: ventas que se perderían si se agota stock esta semana
    const valorEnRiesgo = proyecciones
      .filter(i => i._urgencia.orden <= 1)
      .reduce((s, i) => s + i._ventaMensualCRC, 0);

    // Inversión sugerida: costo * cantidad necesaria para reponer a 2 meses
    const inversionSugerida = proyecciones
      .filter(i => i._urgencia.orden <= 2 && i._costo > 0 && i._consumoMensual > 0)
      .reduce((s, i) => {
        const necesario = Math.max(0, i._consumoMensual * 2 - (parseFloat(i.existencias) || 0));
        return s + necesario * i._costo;
      }, 0);

    // Sobrestock: más de 6 meses de cobertura y valor alto
    const sobrestock = conConsumo
      .filter(i => i._mesesCobertura >= 6 && i._valorStock > 0)
      .sort((a, b) => b._valorStock - a._valorStock)
      .slice(0, 50);

    const totalInversionStock = proyecciones.reduce((s, i) => s + (i._valorStock || 0), 0);
    const capitalInmovilizado = sobrestock.reduce((s, i) => s + (i._valorStock || 0), 0);

    // Proveedores con más rojos
    const porProveedor = {};
    proyecciones.forEach(i => {
      const p = i.ultimo_proveedor || 'Sin proveedor';
      if (!porProveedor[p]) porProveedor[p] = { rojos: 0, total: 0 };
      porProveedor[p].total++;
      if (i._urgencia.orden <= 1) porProveedor[p].rojos++;
    });
    const provConProblemas = Object.entries(porProveedor)
      .filter(([, v]) => v.rojos > 0)
      .sort((a, b) => b[1].rojos - a[1].rojos)
      .slice(0, 10);

    return { criticos, valorEnRiesgo, inversionSugerida, sobrestock, totalInversionStock, capitalInmovilizado, provConProblemas };
  }, [proyecciones]);

  // ── Inteligencia: cuadrante margen × urgencia ─────────────────────────────
  const inteligencia = useMemo(() => {
    const conDatos = proyecciones.filter(i => i._consumoMensual > 0 && i._margen > 0);

    // Estrellas en riesgo: alto margen (>30%) + alta rotación + urgentes o críticos
    const estrellasEnRiesgo = conDatos
      .filter(i => i._margen >= 30 && i._urgencia.orden <= 2)
      .sort((a, b) => (b._margen * b._ventaMensualCRC) - (a._margen * a._ventaMensualCRC))
      .slice(0, 50);

    // Productos muertos: en inventario pero sin consumo real en historial.
    // Productos ingresados hace menos de 30 días quedan fuera: son nuevos y
    // todavía no tuvieron tiempo de venderse — marcarlos como muertos genera
    // alertas falsas el mismo día que se reciben.
    const muertos = proyecciones
      .filter(i =>
        !consumoHistorico[i.codigo] &&
        (parseFloat(i.existencias) || 0) > 0 &&
        (parseFloat(i.promedio_mensual) || 0) === 0 &&
        diasDesdeUltimaCompra(i.codigo) >= 30
      )
      .sort((a, b) => (parseFloat(b.existencias) || 0) - (parseFloat(a.existencias) || 0))
      .slice(0, 50);

    // Candidatos a liquidar: sobrestock + margen bajo (<15%). Mismo criterio
    // de 30 días en inventario antes de decidir liquidar.
    const liquidar = conDatos
      .filter(i =>
        i._mesesCobertura >= 4 &&
        i._margen < 15 &&
        i._valorStock > 0 &&
        diasDesdeUltimaCompra(i.codigo) >= 30
      )
      .sort((a, b) => b._valorStock - a._valorStock)
      .slice(0, 50);

    // Score de prioridad de compra: urgencia × venta mensual × margen
    const prioridad = proyecciones
      .filter(i => i._urgencia.orden <= 3 && i._consumoMensual > 0)
      .map(i => ({
        ...i,
        _scorePrioridad: ((5 - i._urgencia.orden) * 20) + (i._ventaMensualCRC / 1000) + i._margen,
      }))
      .sort((a, b) => b._scorePrioridad - a._scorePrioridad)
      .slice(0, 50);

    return { estrellasEnRiesgo, muertos, liquidar, prioridad };
  }, [proyecciones, consumoHistorico, diasDesdeUltimaCompra]);

  // ── Vista por proveedor (igual que antes) ──────────────────────────────────
  const grupos = useMemo(() => {
    let items = proyecciones;
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase();
      items = items.filter(i =>
        [i.codigo, i.nombre, i.ultimo_proveedor, i.categoria]
          .some(v => (v || '').toLowerCase().includes(q))
      );
    }
    if (filtroUrgencia !== 'todos') {
      const ordenMax = { critico: 1, urgente: 2, pronto: 3, ok: 4 };
      const max = ordenMax[filtroUrgencia] ?? 99;
      items = items.filter(i => i._urgencia.orden <= max);
    }
    const activos = {}, pausados = {};
    items.forEach(item => {
      const prov = (item.ultimo_proveedor || 'Sin proveedor').trim();
      const esPausado = leadTimes[prov]?.activo === false;
      const dest = esPausado ? pausados : activos;
      if (!dest[prov]) dest[prov] = [];
      dest[prov].push(item);
    });
    const ordenar = (g) => Object.entries(g)
      .map(([prov, items]) => ({ prov, items: [...items].sort((a, b) => a._urgencia.orden - b._urgencia.orden), minOrden: Math.min(...items.map(i => i._urgencia.orden)) }))
      .sort((a, b) => a.minOrden - b.minOrden);
    return { activos: ordenar(activos), pausados: ordenar(pausados) };
  }, [proyecciones, busqueda, filtroUrgencia, leadTimes]);

  function toggleExpand(prov) { setExpandidos(prev => ({ ...prev, [prov]: !prev[prov] })); }
  function expandirTodos() {
    const all = {};
    [...grupos.activos, ...grupos.pausados].forEach(g => { all[g.prov] = true; });
    setExpandidos(all);
  }
  function colapsarTodos() { setExpandidos({}); }
  const totalFiltrado = grupos.activos.reduce((s, g) => s + g.items.length, 0) + grupos.pausados.reduce((s, g) => s + g.items.length, 0);

  // ── Fila de producto (vista por proveedor) ──────────────────────────────
  function FilaProducto({ item, idx }) {
    const cod = (item.codigo || '').toString().trim();
    return (
      <tr style={{ borderBottom: '1px solid #f0f0f0', background: idx % 2 === 0 ? 'white' : '#fafafa' }}>
        <td style={{ padding: '6px 10px' }}>
          <span style={{ fontWeight: 700, color: item._urgencia.color, fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
            {item._urgencia.label}
          </span>
        </td>
        <td style={{ padding: '6px 10px', color: 'var(--orange)', fontFamily: 'monospace', fontSize: '0.73rem' }}>{item.codigo}</td>
        <td style={{ padding: '6px 10px', maxWidth: 240 }}>
          <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.78rem' }}>{item.nombre}</div>
          <div style={{ fontSize: '0.67rem', color: '#999' }}>{item.categoria}</div>
        </td>
        <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 600, fontSize: '0.78rem' }}>{parseFloat(item.existencias) || 0}</td>
        <td style={{ padding: '6px 10px', textAlign: 'right', color: '#DD6B20', fontSize: '0.78rem' }}>
          {(transitoMap?.[cod] || 0) > 0 ? transitoMap[cod] : '—'}
        </td>
        <td style={{ padding: '6px 10px', textAlign: 'right', fontSize: '0.78rem' }}>
          {item._consumoMensual > 0 ? (
            <span>{item._consumoMensual.toFixed(1)}<span style={{ fontSize: '0.65rem', color: item._fuenteConsumo === 'real' ? '#38A169' : '#bbb', marginLeft: 3 }}>{item._fuenteConsumo === 'real' ? '●' : '○'}</span></span>
          ) : <span style={{ color: '#ccc' }}>—</span>}
        </td>
        <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 600, fontSize: '0.78rem', color: item._mesesCobertura !== null ? (item._mesesCobertura < 1 ? '#E53E3E' : item._mesesCobertura < 2 ? '#D69E2E' : '#38A169') : '#ccc' }}>
          {fmtMeses(item._mesesCobertura)}
        </td>
        <td style={{ padding: '6px 10px', textAlign: 'right', fontSize: '0.73rem', color: item._diasQuiebre !== null && item._diasQuiebre < 30 ? '#E53E3E' : '#555' }}>
          {item._fechaQuiebre ? fmtFecha(item._fechaQuiebre) : '—'}
          {item._diasQuiebre !== null && <div style={{ fontSize: '0.63rem', color: '#aaa' }}>en {item._diasQuiebre}d</div>}
        </td>
        <td style={{ padding: '6px 10px', textAlign: 'right', fontSize: '0.73rem' }}>
          <span style={{ fontWeight: 700, color: item._urgencia.color }}>{item._fechaPedido ? fmtFecha(item._fechaPedido) : '—'}</span>
          {item._diasParaPedir !== null && item._diasParaPedir !== undefined && (
            <div style={{ fontSize: '0.63rem', color: item._diasParaPedir < 0 ? '#E53E3E' : '#aaa' }}>
              {item._diasParaPedir < 0 ? `hace ${Math.abs(item._diasParaPedir)}d` : `en ${item._diasParaPedir}d`}
            </div>
          )}
        </td>
        <td style={{ padding: '6px 10px' }}>
          <MiniGrafico existencias={parseFloat(item.existencias) || 0} consumoMensual={item._consumoMensual} leadTimeDias={item._leadTime} diasQuiebre={item._diasQuiebre} />
        </td>
      </tr>
    );
  }

  // ── Card de proveedor ──────────────────────────────────────────────────
  function CardProveedor({ prov, items, pausado }) {
    const abierto = expandidos[prov] ?? false;
    const { bg, border } = colorGrupo(items);
    const lt = leadTimes[prov];
    const estaEditando = editando === prov;
    const criticos = items.filter(i => i._urgencia.orden <= 1).length;
    const urgentes = items.filter(i => i._urgencia.orden === 2).length;
    return (
      <div style={{ marginBottom: 10, border: `1px solid ${border}`, borderRadius: 10, overflow: 'hidden', opacity: pausado ? 0.65 : 1 }}>
        <div onClick={() => toggleExpand(prov)} style={{ background: bg, padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: '0.88rem', color: '#2a3a50', flex: 1 }}>{abierto ? '▼' : '▶'} {prov}</span>
          {criticos > 0 && <span style={{ background: '#FED7D7', color: '#C53030', borderRadius: 12, padding: '2px 8px', fontSize: '0.72rem', fontWeight: 700 }}>🔴 {criticos}</span>}
          {urgentes > 0 && <span style={{ background: '#FEFCBF', color: '#744210', borderRadius: 12, padding: '2px 8px', fontSize: '0.72rem', fontWeight: 700 }}>🟡 {urgentes}</span>}
          <span style={{ fontSize: '0.72rem', color: '#888' }}>{items.length} prods.</span>
          <div onClick={e => e.stopPropagation()}>
            {estaEditando ? (
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <input type="number" min={1} value={editVal} onChange={e => setEditVal(e.target.value)} style={{ width: 52, padding: '3px 6px', border: '1px solid var(--orange)', borderRadius: 4, fontSize: '0.75rem' }} />
                <span style={{ fontSize: '0.7rem', color: '#888' }}>días</span>
                <button onClick={() => guardarLeadTime(prov)} disabled={guardando} style={{ padding: '3px 8px', background: 'var(--orange)', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.72rem' }}>{guardando ? '...' : '✓'}</button>
                <button onClick={() => setEditando(null)} style={{ padding: '3px 6px', background: '#eee', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.72rem' }}>✕</button>
              </div>
            ) : (
              <button onClick={() => { setEditando(prov); setEditVal(lt?.lead_time_dias || 8); setEditNotas(lt?.notas || ''); }} style={{ fontSize: '0.72rem', color: 'var(--teal)', background: 'none', border: '1px solid var(--teal)', borderRadius: 6, cursor: 'pointer', padding: '3px 8px', whiteSpace: 'nowrap' }}>
                ⏱ {lt?.lead_time_dias ? `${lt.lead_time_dias}d` : 'Lead time'}
              </button>
            )}
          </div>
          <div onClick={e => e.stopPropagation()}>
            <button onClick={() => toggleActivo(prov)} style={{ fontSize: '0.7rem', padding: '3px 8px', borderRadius: 6, border: '1px solid #ddd', background: pausado ? '#fff3e0' : '#f7f7f7', cursor: 'pointer', color: pausado ? '#DD6B20' : '#888', whiteSpace: 'nowrap' }}>
              {pausado ? '▶ Activar' : '⏸ Pausar'}
            </button>
          </div>
        </div>
        {abierto && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.77rem' }}>
              <thead>
                <tr style={{ background: '#f7f9fc' }}>
                  {['Estado','Código','Nombre','Exist.','Tránsito','Consumo/mes','Cobertura','Quiebre stock','Pedir antes de','Proyección'].map(h => (
                    <th key={h} style={{ padding: '6px 10px', fontSize: '0.7rem', color: '#666', borderBottom: '1px solid #eee', whiteSpace: 'nowrap', textAlign: ['Estado','Código','Nombre'].includes(h) ? 'left' : 'right' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>{items.map((item, idx) => <FilaProducto key={item.codigo + idx} item={item} idx={idx} />)}</tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  // ── Tabla plana de productos ─────────────────────────────────────────────
  function TablaPlana() {
    const thStyle = (col) => ({
      padding: '8px 10px', fontSize: '0.7rem', color: '#555', borderBottom: '2px solid #e2e8f0',
      whiteSpace: 'nowrap', textAlign: 'right', cursor: 'pointer', userSelect: 'none',
      background: sortPlana.col === col ? '#f0f4ff' : '#f7f9fc',
    });
    const thStyleL = (col) => ({ ...thStyle(col), textAlign: 'left' });

    return (
      <div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <input className="module-input" style={{ flex: 1, minWidth: 260 }}
            placeholder="🔍 Buscar por código, nombre, proveedor, categoría..."
            value={busquedaPlana} onChange={e => { setBusquedaPlana(e.target.value); setPaginaPlana(1); }} />
          <select value={filtroUrgenciaPlana} onChange={e => { setFiltroUrgenciaPlana(e.target.value); setPaginaPlana(1); }}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: '0.82rem', background: 'white' }}>
            <option value="todos">📋 Todos los estados</option>
            <option value="critico">🔴 Solo Críticos</option>
            <option value="urgente">🟡 Hasta Urgentes</option>
            <option value="pronto">🟠 Hasta Pronto</option>
          </select>
          <span style={{ fontSize: '0.78rem', color: '#888', whiteSpace: 'nowrap' }}>{productosPlanos.length} productos</span>
        </div>

        <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid #e2e8f0' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.77rem' }}>
            <thead>
              <tr>
                <th style={thStyleL('_urgencia_orden')} onClick={() => toggleSort('_urgencia_orden')}>Estado<SortIcon col="_urgencia_orden" /></th>
                <th style={thStyleL('codigo')} onClick={() => toggleSort('codigo')}>Código<SortIcon col="codigo" /></th>
                <th style={thStyleL('nombre')} onClick={() => toggleSort('nombre')}>Nombre<SortIcon col="nombre" /></th>
                <th style={thStyleL('ultimo_proveedor')} onClick={() => toggleSort('ultimo_proveedor')}>Proveedor<SortIcon col="ultimo_proveedor" /></th>
                <th style={thStyle('existencias')} onClick={() => toggleSort('existencias')}>Exist.<SortIcon col="existencias" /></th>
                <th style={thStyle('_consumoMensual')} onClick={() => toggleSort('_consumoMensual')}>Cons./mes<SortIcon col="_consumoMensual" /></th>
                <th style={thStyle('_mesesCobertura')} onClick={() => toggleSort('_mesesCobertura')}>Cobertura<SortIcon col="_mesesCobertura" /></th>
                <th style={thStyle('_diasParaPedir')} onClick={() => toggleSort('_diasParaPedir')}>Días p/pedir<SortIcon col="_diasParaPedir" /></th>
                <th style={thStyle('_ventaMensualCRC')} onClick={() => toggleSort('_ventaMensualCRC')}>Venta/mes ₡<SortIcon col="_ventaMensualCRC" /></th>
                <th style={thStyle('_margen')} onClick={() => toggleSort('_margen')}>Margen %<SortIcon col="_margen" /></th>
                <th style={thStyle('_fechaQuiebre')}>Quiebre</th>
              </tr>
            </thead>
            <tbody>
              {productosPlanosPagina.length === 0 && (
                <tr><td colSpan={11} style={{ textAlign: 'center', padding: 32, color: '#aaa' }}>Sin resultados</td></tr>
              )}
              {productosPlanosPagina.map((item, idx) => {
                const cod = (item.codigo || '').toString().trim();
                const enTransito = transitoMap?.[cod] || 0;
                return (
                  <tr key={item.codigo + idx} style={{ borderBottom: '1px solid #f0f0f0', background: idx % 2 === 0 ? 'white' : '#fafafa' }}>
                    <td style={{ padding: '6px 10px' }}>
                      <span style={{ fontWeight: 700, color: item._urgencia.color, fontSize: '0.73rem', whiteSpace: 'nowrap' }}>{item._urgencia.label}</span>
                    </td>
                    <td style={{ padding: '6px 10px', color: 'var(--orange)', fontFamily: 'monospace', fontSize: '0.72rem' }}>{item.codigo}</td>
                    <td style={{ padding: '6px 10px', maxWidth: 220 }}>
                      <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.78rem' }}>{item.nombre}</div>
                      <div style={{ fontSize: '0.65rem', color: '#aaa' }}>{item.categoria}</div>
                    </td>
                    <td style={{ padding: '6px 10px', fontSize: '0.72rem', color: '#555', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.ultimo_proveedor || '—'}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 600, fontSize: '0.78rem' }}>
                      {parseFloat(item.existencias) || 0}
                      {enTransito > 0 && <div style={{ fontSize: '0.63rem', color: '#DD6B20' }}>+{enTransito} tránsito</div>}
                    </td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', fontSize: '0.78rem' }}>
                      {item._consumoMensual > 0 ? item._consumoMensual.toFixed(1) : <span style={{ color: '#ccc' }}>—</span>}
                      <span style={{ fontSize: '0.62rem', color: item._fuenteConsumo === 'real' ? '#38A169' : '#bbb', marginLeft: 3 }}>{item._fuenteConsumo === 'real' ? '●' : '○'}</span>
                    </td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 600, fontSize: '0.78rem', color: item._mesesCobertura !== null ? (item._mesesCobertura < 1 ? '#E53E3E' : item._mesesCobertura < 2 ? '#D69E2E' : '#38A169') : '#ccc' }}>
                      {fmtMeses(item._mesesCobertura)}
                    </td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', fontSize: '0.78rem' }}>
                      <span style={{ fontWeight: 700, color: item._urgencia.color }}>
                        {item._diasParaPedir !== null ? (item._diasParaPedir < 0 ? `hace ${Math.abs(item._diasParaPedir)}d` : `en ${item._diasParaPedir}d`) : '—'}
                      </span>
                    </td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', fontSize: '0.77rem', color: '#2a3a50' }}>
                      {item._ventaMensualCRC > 0 ? fmtCRC(item._ventaMensualCRC) : '—'}
                    </td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', fontSize: '0.77rem', fontWeight: 600, color: item._margen >= 30 ? '#38A169' : item._margen >= 15 ? '#DD6B20' : item._margen > 0 ? '#E53E3E' : '#ccc' }}>
                      {item._margen > 0 ? item._margen.toFixed(1) + '%' : '—'}
                    </td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', fontSize: '0.72rem', color: item._diasQuiebre !== null && item._diasQuiebre < 30 ? '#E53E3E' : '#777' }}>
                      {item._fechaQuiebre ? fmtFecha(item._fechaQuiebre) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        {paginasTotal > 1 && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center', marginTop: 14, flexWrap: 'wrap' }}>
            <button disabled={paginaPlana === 1} onClick={() => setPaginaPlana(1)} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #ddd', background: 'white', cursor: paginaPlana === 1 ? 'default' : 'pointer', opacity: paginaPlana === 1 ? 0.4 : 1 }}>«</button>
            <button disabled={paginaPlana === 1} onClick={() => setPaginaPlana(p => p - 1)} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #ddd', background: 'white', cursor: paginaPlana === 1 ? 'default' : 'pointer', opacity: paginaPlana === 1 ? 0.4 : 1 }}>‹</button>
            {Array.from({ length: Math.min(paginasTotal, 7) }, (_, i) => {
              let pg = i + 1;
              if (paginasTotal > 7) {
                if (paginaPlana <= 4) pg = i + 1;
                else if (paginaPlana >= paginasTotal - 3) pg = paginasTotal - 6 + i;
                else pg = paginaPlana - 3 + i;
              }
              return (
                <button key={pg} onClick={() => setPaginaPlana(pg)} style={{ padding: '5px 10px', borderRadius: 6, border: `1px solid ${pg === paginaPlana ? 'var(--orange)' : '#ddd'}`, background: pg === paginaPlana ? 'var(--orange)' : 'white', color: pg === paginaPlana ? 'white' : '#333', cursor: 'pointer', fontWeight: pg === paginaPlana ? 700 : 400 }}>{pg}</button>
              );
            })}
            <button disabled={paginaPlana === paginasTotal} onClick={() => setPaginaPlana(p => p + 1)} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #ddd', background: 'white', cursor: paginaPlana === paginasTotal ? 'default' : 'pointer', opacity: paginaPlana === paginasTotal ? 0.4 : 1 }}>›</button>
            <button disabled={paginaPlana === paginasTotal} onClick={() => setPaginaPlana(paginasTotal)} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #ddd', background: 'white', cursor: paginaPlana === paginasTotal ? 'default' : 'pointer', opacity: paginaPlana === paginasTotal ? 0.4 : 1 }}>»</button>
            <span style={{ fontSize: '0.75rem', color: '#888' }}>Página {paginaPlana} de {paginasTotal} · mostrando {(paginaPlana-1)*PAGE_SIZE+1}–{Math.min(paginaPlana*PAGE_SIZE, productosPlanos.length)} de {productosPlanos.length}</span>
          </div>
        )}
      </div>
    );
  }

  // ── Dashboard Ejecutivo ──────────────────────────────────────────────────
  function DashboardEjecutivo() {
    const kpiStyle = (color) => ({
      background: 'white', borderRadius: 10, padding: '16px 20px',
      border: `1px solid #e2e8f0`, borderTop: `4px solid ${color}`,
      flex: 1, minWidth: 180,
    });

    return (
      <div>
        {/* KPIs financieros */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
          <div style={kpiStyle('#E53E3E')}>
            <div style={{ fontSize: '0.72rem', color: '#888', marginBottom: 4, fontWeight: 600 }}>💸 VENTAS EN RIESGO (críticos)</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#E53E3E' }}>{fmtCRC(dashboard.valorEnRiesgo)}</div>
            <div style={{ fontSize: '0.7rem', color: '#aaa', marginTop: 4 }}>ventas/mes de productos que se agotan</div>
          </div>
          <div style={kpiStyle('#DD6B20')}>
            <div style={{ fontSize: '0.72rem', color: '#888', marginBottom: 4, fontWeight: 600 }}>🛒 INVERSIÓN SUGERIDA (reponer a 2m)</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#DD6B20' }}>{fmtCRC(dashboard.inversionSugerida)}</div>
            <div style={{ fontSize: '0.7rem', color: '#aaa', marginTop: 4 }}>para productos críticos y urgentes</div>
          </div>
          <div style={kpiStyle('#9B59B6')}>
            <div style={{ fontSize: '0.72rem', color: '#888', marginBottom: 4, fontWeight: 600 }}>📦 CAPITAL INMOVILIZADO (sobrestock)</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#9B59B6' }}>{fmtCRC(dashboard.capitalInmovilizado)}</div>
            <div style={{ fontSize: '0.7rem', color: '#aaa', marginTop: 4 }}>en productos con +6 meses de cobertura</div>
          </div>
          <div style={kpiStyle('#38A169')}>
            <div style={{ fontSize: '0.72rem', color: '#888', marginBottom: 4, fontWeight: 600 }}>📊 TOTAL INVENTARIO (a costo)</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#38A169' }}>{fmtCRC(dashboard.totalInversionStock)}</div>
            <div style={{ fontSize: '0.7rem', color: '#aaa', marginTop: 4 }}>valor total del inventario actual</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
          {/* Top 50 críticos más rentables */}
          <div style={{ background: 'white', borderRadius: 10, border: '1px solid #e2e8f0', padding: 16 }}>
            <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: 12, color: '#2a3a50' }}>
              🔴 Top productos críticos más rentables
              <span style={{ fontSize: '0.7rem', color: '#aaa', fontWeight: 400, marginLeft: 8 }}>máxima prioridad de compra</span>
            </div>
            <div style={{ overflowY: 'auto', maxHeight: 320 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.73rem' }}>
                <thead><tr style={{ background: '#f7f9fc' }}>
                  {['#','Código','Nombre','Venta/mes','Margen'].map(h => <th key={h} style={{ padding: '5px 8px', color: '#888', borderBottom: '1px solid #eee', textAlign: h === '#' || h === 'Código' || h === 'Nombre' ? 'left' : 'right', fontSize: '0.68rem' }}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {dashboard.criticos.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', padding: 16, color: '#aaa' }}>Sin datos de precio</td></tr>}
                  {dashboard.criticos.map((item, i) => (
                    <tr key={item.codigo} style={{ borderBottom: '1px solid #f5f5f5', background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                      <td style={{ padding: '5px 8px', color: '#bbb', fontSize: '0.68rem' }}>{i + 1}</td>
                      <td style={{ padding: '5px 8px', color: 'var(--orange)', fontFamily: 'monospace', fontSize: '0.7rem' }}>{item.codigo}</td>
                      <td style={{ padding: '5px 8px', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.nombre}</td>
                      <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 600 }}>{fmtCRC(item._ventaMensualCRC)}</td>
                      <td style={{ padding: '5px 8px', textAlign: 'right', color: item._margen >= 30 ? '#38A169' : '#DD6B20', fontWeight: 600 }}>{item._margen.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Sobrestock */}
          <div style={{ background: 'white', borderRadius: 10, border: '1px solid #e2e8f0', padding: 16 }}>
            <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: 12, color: '#2a3a50' }}>
              🏔️ Sobrestock — capital inmovilizado
              <span style={{ fontSize: '0.7rem', color: '#aaa', fontWeight: 400, marginLeft: 8 }}>+6 meses de cobertura</span>
            </div>
            <div style={{ overflowY: 'auto', maxHeight: 320 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.73rem' }}>
                <thead><tr style={{ background: '#f7f9fc' }}>
                  {['#','Código','Nombre','Cobertura','Valor stock'].map(h => <th key={h} style={{ padding: '5px 8px', color: '#888', borderBottom: '1px solid #eee', textAlign: h === '#' || h === 'Código' || h === 'Nombre' ? 'left' : 'right', fontSize: '0.68rem' }}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {dashboard.sobrestock.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', padding: 16, color: '#aaa' }}>Sin sobrestock detectado</td></tr>}
                  {dashboard.sobrestock.map((item, i) => (
                    <tr key={item.codigo} style={{ borderBottom: '1px solid #f5f5f5', background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                      <td style={{ padding: '5px 8px', color: '#bbb', fontSize: '0.68rem' }}>{i + 1}</td>
                      <td style={{ padding: '5px 8px', color: 'var(--orange)', fontFamily: 'monospace', fontSize: '0.7rem' }}>{item.codigo}</td>
                      <td style={{ padding: '5px 8px', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.nombre}</td>
                      <td style={{ padding: '5px 8px', textAlign: 'right', color: '#9B59B6', fontWeight: 600 }}>{fmtMeses(item._mesesCobertura)}</td>
                      <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 600, color: '#9B59B6' }}>{fmtCRC(item._valorStock)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Proveedores con más problemas */}
        <div style={{ background: 'white', borderRadius: 10, border: '1px solid #e2e8f0', padding: 16 }}>
          <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: 12, color: '#2a3a50' }}>
            ⚠️ Proveedores con más productos críticos
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {dashboard.provConProblemas.length === 0 && <span style={{ color: '#aaa', fontSize: '0.8rem' }}>Sin datos</span>}
            {dashboard.provConProblemas.map(([prov, stats]) => (
              <div key={prov} style={{ background: '#FFF5F5', border: '1px solid #FC8181', borderRadius: 8, padding: '8px 14px', fontSize: '0.78rem' }}>
                <div style={{ fontWeight: 700, color: '#C53030', marginBottom: 2 }}>🔴 {stats.rojos} críticos</div>
                <div style={{ fontSize: '0.7rem', color: '#555' }}>{prov}</div>
                <div style={{ fontSize: '0.65rem', color: '#aaa' }}>{stats.total} productos total</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Inteligencia ─────────────────────────────────────────────────────────
  function TabInteligencia() {
    const [subTab, setSubTab] = useState('prioridad');
    const subTabs = [
      { id: 'prioridad', label: '⚡ Lista de Compra Priorizada' },
      { id: 'estrellas', label: '⭐ Estrellas en Riesgo' },
      { id: 'liquidar', label: '🏷️ Candidatos a Liquidar' },
      { id: 'muertos', label: '💀 Productos Sin Movimiento' },
    ];

    function TablaIntel({ items, cols }) {
      return (
        <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid #e2e8f0', maxHeight: 500, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.74rem' }}>
            <thead style={{ position: 'sticky', top: 0 }}>
              <tr style={{ background: '#f7f9fc' }}>
                {cols.map(c => <th key={c.k} style={{ padding: '7px 10px', color: '#666', borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap', textAlign: c.r ? 'right' : 'left', fontSize: '0.68rem' }}>{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && <tr><td colSpan={cols.length} style={{ textAlign: 'center', padding: 32, color: '#aaa' }}>Sin datos</td></tr>}
              {items.map((item, i) => (
                <tr key={item.codigo + i} style={{ borderBottom: '1px solid #f0f0f0', background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                  {cols.map(c => (
                    <td key={c.k} style={{ padding: '6px 10px', textAlign: c.r ? 'right' : 'left', color: c.color ? c.color(item) : '#333', fontWeight: c.bold ? 600 : 400, maxWidth: c.maxW || 'auto', overflow: c.maxW ? 'hidden' : 'visible', textOverflow: 'ellipsis', whiteSpace: c.maxW ? 'nowrap' : 'normal' }}>
                      {c.fmt ? c.fmt(item) : (item[c.k] || '—')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    const colsPrioridad = [
      { k: '_urgencia', label: 'Estado', fmt: i => <span style={{ color: i._urgencia.color, fontWeight: 700 }}>{i._urgencia.label}</span> },
      { k: 'codigo', label: 'Código', fmt: i => <span style={{ color: 'var(--orange)', fontFamily: 'monospace', fontSize: '0.7rem' }}>{i.codigo}</span> },
      { k: 'nombre', label: 'Nombre', maxW: 200 },
      { k: 'ultimo_proveedor', label: 'Proveedor', maxW: 140 },
      { k: '_mesesCobertura', label: 'Cobertura', r: true, fmt: i => fmtMeses(i._mesesCobertura), color: i => i._mesesCobertura < 1 ? '#E53E3E' : i._mesesCobertura < 2 ? '#DD6B20' : '#38A169' },
      { k: '_ventaMensualCRC', label: 'Venta/mes', r: true, fmt: i => fmtCRC(i._ventaMensualCRC), bold: true },
      { k: '_margen', label: 'Margen', r: true, fmt: i => i._margen > 0 ? i._margen.toFixed(1) + '%' : '—', color: i => i._margen >= 30 ? '#38A169' : '#DD6B20' },
      { k: '_scorePrioridad', label: 'Score', r: true, fmt: i => i._scorePrioridad?.toFixed(0), bold: true, color: () => '#5E2733' },
      { k: '_diasParaPedir', label: 'Días p/pedir', r: true, fmt: i => i._diasParaPedir !== null ? (i._diasParaPedir < 0 ? `VENCIDO ${Math.abs(i._diasParaPedir)}d` : `${i._diasParaPedir}d`) : '—', color: i => i._diasParaPedir < 0 ? '#E53E3E' : '#555' },
    ];
    const colsEstrellas = [
      { k: '_urgencia', label: 'Estado', fmt: i => <span style={{ color: i._urgencia.color, fontWeight: 700 }}>{i._urgencia.label}</span> },
      { k: 'codigo', label: 'Código', fmt: i => <span style={{ color: 'var(--orange)', fontFamily: 'monospace', fontSize: '0.7rem' }}>{i.codigo}</span> },
      { k: 'nombre', label: 'Nombre', maxW: 220 },
      { k: '_mesesCobertura', label: 'Cobertura', r: true, fmt: i => fmtMeses(i._mesesCobertura), color: i => '#E53E3E' },
      { k: '_margen', label: 'Margen %', r: true, fmt: i => i._margen.toFixed(1) + '%', bold: true, color: () => '#38A169' },
      { k: '_ventaMensualCRC', label: 'Venta/mes', r: true, fmt: i => fmtCRC(i._ventaMensualCRC), bold: true },
    ];
    const colsLiquidar = [
      { k: 'codigo', label: 'Código', fmt: i => <span style={{ color: 'var(--orange)', fontFamily: 'monospace', fontSize: '0.7rem' }}>{i.codigo}</span> },
      { k: 'nombre', label: 'Nombre', maxW: 220 },
      { k: 'existencias', label: 'Existencias', r: true, fmt: i => parseFloat(i.existencias) || 0 },
      { k: '_mesesCobertura', label: 'Cobertura', r: true, fmt: i => fmtMeses(i._mesesCobertura), color: () => '#9B59B6', bold: true },
      { k: '_margen', label: 'Margen', r: true, fmt: i => i._margen.toFixed(1) + '%', color: () => '#E53E3E' },
      { k: '_valorStock', label: 'Valor stock', r: true, fmt: i => fmtCRC(i._valorStock), bold: true, color: () => '#9B59B6' },
    ];
    const colsMuertos = [
      { k: 'codigo', label: 'Código', fmt: i => <span style={{ color: 'var(--orange)', fontFamily: 'monospace', fontSize: '0.7rem' }}>{i.codigo}</span> },
      { k: 'nombre', label: 'Nombre', maxW: 240 },
      { k: 'ultimo_proveedor', label: 'Proveedor', maxW: 140 },
      { k: 'existencias', label: 'Existencias', r: true, fmt: i => parseFloat(i.existencias) || 0, bold: true },
      { k: 'categoria', label: 'Categoría', maxW: 120 },
    ];

    return (
      <div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          {subTabs.map(t => (
            <button key={t.id} onClick={() => setSubTab(t.id)} style={{ padding: '7px 14px', borderRadius: 8, border: `1px solid ${subTab === t.id ? 'var(--orange)' : '#ddd'}`, background: subTab === t.id ? 'var(--orange)' : 'white', color: subTab === t.id ? 'white' : '#555', cursor: 'pointer', fontSize: '0.8rem', fontWeight: subTab === t.id ? 700 : 400 }}>
              {t.label}
            </button>
          ))}
        </div>

        {subTab === 'prioridad' && (
          <div>
            <div style={{ background: '#FFF8F0', border: '1px solid #FBD38D', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: '0.78rem', color: '#744210' }}>
              ⚡ <strong>Lista de compra inteligente:</strong> ordenada por score que combina urgencia + volumen de ventas + margen. Los primeros son los que más impacto tienen si se agotan.
            </div>
            <TablaIntel items={inteligencia.prioridad} cols={colsPrioridad} />
          </div>
        )}
        {subTab === 'estrellas' && (
          <div>
            <div style={{ background: '#F0FFF4', border: '1px solid #9AE6B4', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: '0.78rem', color: '#276749' }}>
              ⭐ <strong>Productos estrella en riesgo:</strong> alto margen (≥30%) + urgentes o críticos. Prioridad máxima — son los que más utilidad generan y están a punto de agotarse.
            </div>
            <TablaIntel items={inteligencia.estrellasEnRiesgo} cols={colsEstrellas} />
          </div>
        )}
        {subTab === 'liquidar' && (
          <div>
            <div style={{ background: '#FAF5FF', border: '1px solid #D6BCFA', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: '0.78rem', color: '#553C9A' }}>
              🏷️ <strong>Candidatos a liquidar:</strong> +4 meses de cobertura con margen bajo (&lt;15%). Capital inmovilizado que conviene mover con descuentos o promociones.
            </div>
            <TablaIntel items={inteligencia.liquidar} cols={colsLiquidar} />
          </div>
        )}
        {subTab === 'muertos' && (
          <div>
            <div style={{ background: '#FFF5F5', border: '1px solid #FEB2B2', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: '0.78rem', color: '#822727' }}>
              💀 <strong>Sin movimiento real:</strong> en inventario pero sin ventas registradas en el historial de facturas y promedio NEO = 0. Candidatos a revisión física y posible liquidación.
            </div>
            <TablaIntel items={inteligencia.muertos} cols={colsMuertos} />
          </div>
        )}
      </div>
    );
  }

  // ── Render principal ─────────────────────────────────────────────────────
  return (
    <div>
      {msg && (
        <div className={msg.tipo === 'ok' ? 'success-banner' : 'error-banner'} style={{ marginBottom: 12 }}>
          {msg.tipo === 'ok' ? '✅' : '❌'} {msg.t}
        </div>
      )}

      {/* KPIs — clic para filtrar */}
      <div className="kpi-grid kpi-grid-4" style={{ marginBottom: 16 }}>
        {[
          ['🔴 Pedir YA', stats.rojos, '#E53E3E', 'critico'],
          ['🟡 Urgente', stats.amarillos, '#D69E2E', 'urgente'],
          ['🟠 Pronto', stats.naranjas, '#DD6B20', 'pronto'],
          ['🟢 OK', stats.verdes, '#38A169', 'ok'],
        ].map(([l, v, c, key]) => (
          <div key={l} className="kpi-card" style={{ borderTop: `3px solid ${c}`, cursor: 'pointer', outline: filtroUrgencia === key ? `2px solid ${c}` : 'none' }}
            onClick={() => setFiltroUrgencia(filtroUrgencia === key ? 'todos' : key)}>
            <div className="kpi-label">{l}</div>
            <div className="kpi-value" style={{ color: c }}>{v}</div>
          </div>
        ))}
      </div>

      {/* Info historial */}
      <div style={{ background: '#f7f9fc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 14px', marginBottom: 14, fontSize: '0.77rem', color: '#555', display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {cargandoHistorial ? <span>⏳ Calculando consumo histórico...</span> : (
          <>
            <span>📊 <strong>{Object.keys(consumoHistorico).length}</strong> productos con consumo real</span>
            <span>📅 <strong>{periodos.length}</strong> períodos en historial</span>
            <span style={{ color: '#aaa' }}>Consumo real tiene prioridad sobre promedio NEO</span>
          </>
        )}
      </div>

      {/* Navegación de tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, borderBottom: '2px solid #e2e8f0', paddingBottom: 0, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTabActivo(t.id)} style={{
            padding: '9px 16px', border: 'none', borderBottom: `3px solid ${tabActivo === t.id ? '#5E2733' : 'transparent'}`,
            background: 'none', cursor: 'pointer', fontSize: '0.82rem',
            fontWeight: tabActivo === t.id ? 700 : 400,
            color: tabActivo === t.id ? '#5E2733' : '#666',
            borderRadius: '6px 6px 0 0', marginBottom: -2,
          }}>{t.label}</button>
        ))}
      </div>

      {/* Contenido por tab */}
      {tabActivo === 'proveedor' && (
        <div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            <input className="module-input" style={{ flex: 1, minWidth: 220 }} placeholder="🔍 Buscar por código, nombre, proveedor..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
            <select value={filtroUrgencia} onChange={e => setFiltroUrgencia(e.target.value)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: '0.82rem', cursor: 'pointer', background: 'white', color: '#333' }}>
              <option value="todos">📋 Todos los estados</option>
              <option value="critico">🔴 Críticos (Vencido + Pedí YA)</option>
              <option value="urgente">🟡 Hasta Urgentes</option>
              <option value="pronto">🟠 Hasta Pronto</option>
              <option value="ok">🟢 Incluir OK</option>
            </select>
            <span style={{ fontSize: '0.78rem', color: '#999' }}>{totalFiltrado} productos · {grupos.activos.length} proveedores</span>
            <button onClick={expandirTodos} style={{ padding: '6px 12px', borderRadius: 7, border: '1px solid #ddd', background: 'white', cursor: 'pointer', fontSize: '0.78rem', color: '#555' }}>▼ Expandir todo</button>
            <button onClick={colapsarTodos} style={{ padding: '6px 12px', borderRadius: 7, border: '1px solid #ddd', background: 'white', cursor: 'pointer', fontSize: '0.78rem', color: '#555' }}>▶ Colapsar todo</button>
          </div>
          {grupos.activos.length === 0 && grupos.pausados.length === 0 && <div style={{ textAlign: 'center', padding: 48, color: '#aaa' }}>No hay productos que mostrar.</div>}
          {grupos.activos.map(g => <CardProveedor key={g.prov} prov={g.prov} items={g.items} pausado={false} />)}
          {grupos.pausados.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <div style={{ fontSize: '0.78rem', color: '#aaa', fontWeight: 600, marginBottom: 8, borderTop: '1px dashed #ddd', paddingTop: 14 }}>
                ⏸ PROVEEDORES PAUSADOS ({grupos.pausados.length})
              </div>
              {grupos.pausados.map(g => <CardProveedor key={g.prov} prov={g.prov} items={g.items} pausado={true} />)}
            </div>
          )}
        </div>
      )}

      {tabActivo === 'productos' && TablaPlana()}
      {tabActivo === 'dashboard' && <BiDashboard />}
      {tabActivo === 'inteligencia' && <BiInteligencia />}

      <div style={{ marginTop: 14, fontSize: '0.7rem', color: '#aaa', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <span>● Verde = consumo real (historial facturas)</span>
        <span>○ Gris = promedio NEO (fallback)</span>
        <span>— Línea roja = quiebre stock · — Línea amarilla = fecha límite pedido</span>
      </div>
    </div>
  );
}
