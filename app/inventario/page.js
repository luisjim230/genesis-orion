'use client';
import { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import SyncBadge from '../components/SyncBadge';
import KronosTab from './KronosTab'
import ModalEnviarWhatsApp from '../components/ModalEnviarWhatsApp';

// ── Lógica de alertas ────────────────────────────────────────────────────────
function calcularAlertas(items, transitoMap, dias) {
  return items.map(item => {
    const existencias = parseFloat(item.existencias || 0) || 0;
    const promMensual = parseFloat(item.promedio_mensual || 0) || 0;
    const codigo = (item.codigo || '').toString().trim();
    const transito = transitoMap[codigo] || 0;
    const sugerencia = (promMensual / 30) * dias;
    const aBruto = Math.max(sugerencia - existencias, 0);
    const aNeto = Math.max(aBruto - transito, 0);
    const cantComprar = Math.ceil(aNeto);
    const existe = existencias > 0;
    const promedio = promMensual > 0;
    const comprar = cantComprar > 0;
    const sobre = existencias > sugerencia;
    const enTransito = transito > 0;
    const transitoCubre = aBruto > 0 && transito >= aBruto;
    let alerta = '🟢 Óptimo';
    if (!existe && !promedio) alerta = '🟡 Prestar atención';
    else if (!existe && promedio && transitoCubre) alerta = '🟠 En tránsito';
    else if (!existe && promedio && enTransito && comprar) alerta = '🔴 Bajo stock 🚢';
    else if (!existe && promedio) alerta = '🔴 Bajo stock';
    else if (comprar && enTransito) alerta = '🔴 Bajo stock 🚢';
    else if (comprar) alerta = '🔴 Bajo stock';
    else if (sobre) alerta = '🔵 Sobrestock';
    return { ...item, _alerta: alerta, _sugerencia: sugerencia, _cantComprar: cantComprar, _transito: transito };
  });
}


// Semaforo dias transito
function transitoSemaforo(dias) {
  if (dias === null || dias === undefined) return null
  if (dias <= 5)  return { color: '#68d391', emoji: '🟢', label: dias + 'd' }
  if (dias <= 10) return { color: '#f6ad55', emoji: '🟡', label: dias + 'd' }
  return { color: '#fc8181', emoji: '🔴', label: dias + 'd' }
}

function AlertaBadge({ alerta }) {
  const map = {
    '🟢 Óptimo': 'alert-badge alert-optimo',
    '🔴 Bajo stock': 'alert-badge alert-bajo',
    '🔴 Bajo stock 🚢': 'alert-badge alert-transito-bajo',
    '🔵 Sobrestock': 'alert-badge alert-sobrestock',
    '🟡 Prestar atención': 'alert-badge alert-atencion',
    '🟠 En tránsito': 'alert-badge alert-transito',
  };
  return <span className={map[alerta] || 'alert-badge'}>{alerta || '—'}</span>;
}

const fmtN = (v, d = 2) => { const n = parseFloat(v); return isNaN(n) ? '—' : n.toLocaleString('es-CR', { minimumFractionDigits: d, maximumFractionDigits: d }); };
const fmtF = (v) => v ? String(v).slice(0, 10) : '—';

// ── Dropdown filtro tipo Excel ────────────────────────────────────────────────
function ColFilter({ label, values, selected, onSelect, onSort, activeSort }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef(null);
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  const isFiltered = selected.size < values.length;
  const isActive = isFiltered || activeSort;
  const visibleValues = values.filter(v => String(v).toLowerCase().includes(search.toLowerCase()));
  const toggleAll = () => { if (selected.size === values.length) onSelect(new Set()); else onSelect(new Set(values)); };
  const toggle = (v) => { const next = new Set(selected); if (next.has(v)) next.delete(v); else next.add(v); onSelect(next); };
  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span style={{ fontWeight: 700, fontSize: 12, letterSpacing: 0.3 }}>{label}</span>
      <button onClick={() => setOpen(o => !o)} style={{ background: isActive ? 'var(--orange, #f97316)' : '#e5e7eb', border: 'none', borderRadius: 4, width: 20, height: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: isActive ? 'white' : '#6b7280', flexShrink: 0 }} title="Filtrar / Ordenar">{isActive ? '▼' : '▾'}</button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 9999, background: 'white', border: '1.5px solid #e5e7eb', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.14)', minWidth: 200, padding: 8 }}>
          <div style={{ borderBottom: '1px solid #f3f4f6', paddingBottom: 6, marginBottom: 6 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', letterSpacing: 0.5, marginBottom: 4, paddingLeft: 4 }}>ORDENAR</div>
            {[{ dir: 'asc', icon: '↑', text: 'Ascendente' }, { dir: 'desc', icon: '↓', text: 'Descendente' }].map(({ dir, icon, text }) => (
              <button key={dir} onClick={() => { onSort(dir); setOpen(false); }} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '5px 8px', borderRadius: 6, border: 'none', cursor: 'pointer', background: activeSort === dir ? '#fff7ed' : 'transparent', color: activeSort === dir ? 'var(--orange,#f97316)' : '#374151', fontWeight: activeSort === dir ? 700 : 400, fontSize: 13 }}><span style={{ fontSize: 14 }}>{icon}</span>{text}</button>
            ))}
          </div>
          <div style={{ borderBottom: '1px solid #f3f4f6', paddingBottom: 6, marginBottom: 6 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', letterSpacing: 0.5, marginBottom: 4, paddingLeft: 4 }}>FILTRAR</div>
            <input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: '5px 8px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12, outline: 'none' }} onClick={e => e.stopPropagation()} />
          </div>
          <div style={{ maxHeight: 180, overflowY: 'auto' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#374151' }}>
              <input type="checkbox" checked={selected.size === values.length} onChange={toggleAll} style={{ cursor: 'pointer' }} />(Seleccionar todo)
            </label>
            {visibleValues.map(v => (
              <label key={String(v)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 6px', cursor: 'pointer', fontSize: 12, color: '#4b5563' }}>
                <input type="checkbox" checked={selected.has(v)} onChange={() => toggle(v)} style={{ cursor: 'pointer' }} />{String(v) || '(vacío)'}
              </label>
            ))}
          </div>
          <button onClick={() => setOpen(false)} style={{ marginTop: 8, width: '100%', padding: '7px 0', background: 'var(--orange,#f97316)', color: 'white', border: 'none', borderRadius: 6, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Aplicar</button>
        </div>
      )}
    </div>
  );
}

// ── Componente principal ─────────────────────────────────────────────────────
export default function Inventario() {
  const [tab, setTab] = useState(0);
  const [datos, setDatos] = useState([]);
  const [calc, setCalc] = useState([]);
  const [transitoMap, setTransitoMap] = useState({});
  const [transitoDiasMap, setTransitoDiasMap] = useState({});
  const [dias, setDias] = useState(30);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [filtroAlerta, setFiltroAlerta] = useState('Todos');
  const [fechaCarga, setFechaCarga] = useState(null);
  const [msg, setMsg] = useState(null);
  const [ordenItems, setOrdenItems] = useState([]);
  const [seleccionados, setSeleccionados] = useState(new Set());
  const [nombreOrden, setNombreOrden] = useState('');
  const [proveedoresPausados, setProveedoresPausados] = useState(new Set());
  const [proveedoresSeleccionados, setProveedoresSeleccionados] = useState(new Set());
  const [expandProv, setExpandProv] = useState({});

  // ── NUEVO: cantidades editadas manualmente por proveedor ──────────────────
  // { [proveedor]: { [codigo]: cantidad } }
  const [cantidadesEditadas, setCantidadesEditadas] = useState({});
  const [sortProveedores, setSortProveedores] = useState({});

  // ── Ítems ocultos de sugerencia de compras ──────────────────────────────
  const [itemsOcultos, setItemsOcultos] = useState(new Set());
  const [mostrarOcultos, setMostrarOcultos] = useState(false);
  useEffect(() => {
    supabase.from('items_ocultos_compras').select('codigo,proveedor').then(({ data }) => {
      if (data) setItemsOcultos(new Set(data.map(d => `${d.codigo}__${d.proveedor || ''}`)));
    });
  }, []);
  async function ocultarItem(codigo, proveedor) {
    const key = `${codigo}__${proveedor || ''}`;
    await supabase.from('items_ocultos_compras').upsert({ codigo, proveedor, oculto_por: 'admin', fecha_oculto: new Date().toISOString() }, { onConflict: 'codigo,proveedor' });
    setItemsOcultos(prev => new Set([...prev, key]));
  }
  async function mostrarItem(codigo, proveedor) {
    const key = `${codigo}__${proveedor || ''}`;
    await supabase.from('items_ocultos_compras').delete().eq('codigo', codigo).eq('proveedor', proveedor);
    setItemsOcultos(prev => { const s = new Set(prev); s.delete(key); return s; });
  }

  // ── NUEVO: estado de generación de ZIP ────────────────────────────────────
  const [zipGenerando, setZipGenerando] = useState(false)
  const [modalWhatsApp, setModalWhatsApp] = useState(null) // { proveedor, items };
  const [proveedoresKommo, setProveedoresKommo] = useState([]);
  useEffect(() => {
    fetch('/api/kommo/proveedores').then(r=>r.json()).then(lista => {
      if(Array.isArray(lista)) setProveedoresKommo(lista);
    }).catch(()=>{});
  }, []);
  const [proveedorOrdenSeleccionado, setProveedorOrdenSeleccionado] = useState('');
  const [proveedorInputText, setProveedorInputText] = useState('');
  const [mostrarSugerencias, setMostrarSugerencias] = useState(false);

  const PROVEEDORES_HISTORICOS = [
    "ACEROS ABONOS AGRO SA","ARAUMO DIGITAL","AUDIO ACCESORIOS SA",
    "CENTURY METALS AND SUPPLIES","CONSORCIO FERRETERO DE SAN JOSE",
    "CORPORACION DE SUMINISTROS Y MATERIALES DE CONSTRUCCION SA COSMAC",
    "DIFULUZ DE COSTA RICA S.A","DISOL","DISTRIBUIDORA ARGUEDAS Y SALAS",
    "DISTRIBUIDORA HERMANOS FUENTES","DM DOS MIL VEINTICUADTRO",
    "EBISA GLOBAL BRAND SA","GERDAU METALDOM SA","GERMAN ALEJANDRO CHAVES ACUNA",
    "GRUPO SAWA SAWA SRL","GRUPO SOLIDO","GRUPO VYCSA MAYOREO",
    "HOGGAN INTERNATIONAL SA","HOLCIM COSTA RICA","IMPERSA SA",
    "IMPORTACIONES EL AMIGO FERRETERO","IMPORTACIONES INDUSTRIALES MASACA",
    "IMPORTACIONES VEGA SA","INSTALACIONES Y SERVICIOS MACOPA",
    "LANCO Y HARRIS SA","MAYOREO DEL ISTMO","MEGALINEAS SA",
    "METALES FLIX SA","MFA MAYOREO FERRETERIA Y ACABADOS",
    "MUEBLE INDUSTRIA DEL PLASTICO MIPSA","POLYACRIL DE CENTROAMERICA SA",
    "RANDALL FRANCISCO CHACON QUIROS","SUR QUIMICA SA",
    "TECHOS GE SA GRUPO ELEFANTE","TERNIUM INTERNACIONAL COSTA RICA","THERMO SOLUTIONS GROUP SA",
    "TORNICENTRO INVERSIONES INDUSTRIALES GANA GANA","UNIDOS MAYOREO","ZOROLLO SA"
  ];

  const sugerenciasProveedor = proveedorInputText.length > 0
    ? PROVEEDORES_HISTORICOS.filter(p => p.toLowerCase().includes(proveedorInputText.toLowerCase()))
    : PROVEEDORES_HISTORICOS;
  const [showProvSuggestions, setShowProvSuggestions] = useState(false);

  // ── Estado filtros tipo Excel ─────────────────────────────────────────────
  const [colSort, setColSort] = useState({ col: '_alerta', dir: 'asc' });
  const [colFilters, setColFilters] = useState(null);

  const mostrarMsg = (t, tipo = 'ok') => { setMsg({ t, tipo }); setTimeout(() => setMsg(null), 5000); };

  useEffect(() => { cargarDatos(); }, []);
  useEffect(() => { if (datos.length) setCalc(calcularAlertas(datos, transitoMap, dias)); }, [datos, transitoMap, dias]);
  useEffect(() => {
    if (calc.length > 0) {
      setColFilters({
        _alerta: new Set(calc.map(p => p._alerta)),
        codigo: new Set(calc.map(p => p.codigo || '')),
        nombre: new Set(calc.map(p => p.nombre || '')),
        ultimo_proveedor: new Set(calc.map(p => p.ultimo_proveedor || 'Sin proveedor')),
      });
    }
  }, [calc]);

  async function cargarDatos() {
    setLoading(true);
    // Una sola query RPC que trae inventario + consumo real precalculado
    const { data: todos, error: rpcErr } = await supabase.rpc('saturno_inventario_completo');
    if (rpcErr || !todos?.length) { setLoading(false); return; }
    setFechaCarga(todos[0]?.fecha_carga);
    setDatos(todos);
    const { data: tData } = await supabase.from('ordenes_compra_items').select('codigo,cantidad_ordenada,cantidad_recibida,estado_item').in('estado_item', ['pendiente', 'parcial']);
    const tMap = {};
    (tData || []).forEach(i => {
      const c = (i.codigo || '').trim();
      const p = Math.max((parseFloat(i.cantidad_ordenada) || 0) - (parseFloat(i.cantidad_recibida) || 0), 0);
      if (c && p > 0) tMap[c] = (tMap[c] || 0) + p;
    });
    setTransitoMap(tMap);
    try {
      const codsEnTransito = Object.keys(tMap);
      if (codsEnTransito.length > 0) {
        const { data: ordenesItems } = await supabase
          .from('ordenes_compra_items')
          .select('codigo, ordenes_compra(fecha_orden)')
          .in('codigo', codsEnTransito.slice(0, 100))
          .in('estado_item', ['pendiente', 'parcial'])
          .order('creado_en', { ascending: false });
        const diasMap = {};
        for (const item of (ordenesItems || [])) {
          const cod = (item.codigo || '').trim().toUpperCase();
          if (diasMap[cod] !== undefined) continue;
          const fo = item.ordenes_compra?.fecha_orden;
          if (fo) diasMap[cod] = Math.floor((new Date() - new Date(fo)) / 86400000);
        }
        setTransitoDiasMap(diasMap);
      }
    } catch(e) { console.warn('[transitoDiasMap]', e.message); }
    try {
      const { data: pd } = await supabase.from('proveedores_pausados').select('proveedor');
      setProveedoresPausados(new Set((pd || []).map(r => r.proveedor)));
    } catch (e) { }
    setLoading(false);
  }

  // ── Valores únicos para filtros de columna ────────────────────────────────
  const allColValues = useMemo(() => {
    if (!calc.length) return {};
    const alertaOrder = { '🔴 Bajo stock': 1, '🔴 Bajo stock 🚢': 2, '🟠 En tránsito': 3, '🟡 Prestar atención': 4, '🟢 Óptimo': 5, '🔵 Sobrestock': 6 };
    return {
      _alerta: [...new Set(calc.map(p => p._alerta))].sort((a, b) => (alertaOrder[a] || 9) - (alertaOrder[b] || 9)),
      codigo: [...new Set(calc.map(p => p.codigo || ''))].sort(),
      nombre: [...new Set(calc.map(p => p.nombre || ''))].sort(),
      ultimo_proveedor: [...new Set(calc.map(p => p.ultimo_proveedor || 'Sin proveedor'))].sort(),
    };
  }, [calc]);

  const setFilter = (col, val) => setColFilters(f => ({ ...f, [col]: val }));
  const setSort = (col, dir) => setColSort({ col, dir });

  const calcFiltrado = useMemo(() => {
    let result = [...calc];
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase();
      result = result.filter(item => [item.codigo, item.nombre, item.ultimo_proveedor, item._alerta].some(v => (v || '').toLowerCase().includes(q)));
    }
    if (filtroAlerta !== 'Todos') result = result.filter(item => item._alerta === filtroAlerta);
    if (colFilters) {
      result = result.filter(item =>
        colFilters._alerta.has(item._alerta) &&
        colFilters.codigo.has(item.codigo || '') &&
        colFilters.nombre.has(item.nombre || '') &&
        colFilters.ultimo_proveedor.has(item.ultimo_proveedor || 'Sin proveedor')
      );
    }
    result.sort((a, b) => {
      const alertaOrder = { '🔴 Bajo stock': 1, '🔴 Bajo stock 🚢': 2, '🟠 En tránsito': 3, '🟡 Prestar atención': 4, '🟢 Óptimo': 5, '🔵 Sobrestock': 6 };
      let va = a[colSort.col], vb = b[colSort.col];
      if (colSort.col === '_alerta') { va = alertaOrder[va] || 9; vb = alertaOrder[vb] || 9; }
      if (typeof va === 'string') return colSort.dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      return colSort.dir === 'asc' ? (va || 0) - (vb || 0) : (vb || 0) - (va || 0);
    });
    return result;
  }, [calc, busqueda, filtroAlerta, colFilters, colSort]);

  const hasColFilter = colFilters && allColValues._alerta && Object.keys(colFilters).some(k => allColValues[k] && colFilters[k].size < allColValues[k].length);
  const resetColFilters = () => {
    if (!allColValues._alerta) return;
    setColFilters({ _alerta: new Set(allColValues._alerta), codigo: new Set(allColValues.codigo), nombre: new Set(allColValues.nombre), ultimo_proveedor: new Set(allColValues.ultimo_proveedor) });
    setColSort({ col: '_alerta', dir: 'asc' });
    setBusqueda('');
    setFiltroAlerta('Todos');
  };

  const stats = calc.reduce((a, i) => { a[i._alerta] = (a[i._alerta] || 0) + 1; return a; }, {});
  const totalTCods = Object.keys(transitoMap).length;
  const totalTUnids = Object.values(transitoMap).reduce((s, v) => s + v, 0);
  const calcAComprar = calc.filter(i => i._cantComprar > 0 || i._alerta === '🟡 Prestar atención');

  const porProveedor = {};
  let totalOcultosCount = 0;
  calcAComprar.forEach(i => {
    const p = (i.ultimo_proveedor || 'Sin proveedor').trim();
    if (proveedoresPausados.has(p)) return;
    const key = `${i.codigo}__${p}`;
    if (itemsOcultos.has(key)) { totalOcultosCount++; if (!mostrarOcultos) return; }
    if (!porProveedor[p]) porProveedor[p] = [];
    porProveedor[p].push(i);
  });
  const proveedoresList = Object.keys(porProveedor).sort();

  useEffect(() => {
    if (proveedoresList.length) setProveedoresSeleccionados(new Set(proveedoresList));
  }, [calcAComprar.length]);

  // ── NUEVO: helper para obtener la cantidad de un item (editada o calculada) ─
  function getSortedItems(prov, items) {
    const s = sortProveedores[prov];
    if (!s) return items;
    return [...items].sort((a, b) => {
      let va, vb;
      if (s.col === '_cantComprar') { va = a._cantComprar; vb = b._cantComprar; }
      else if (s.col === 'existencias') { va = parseFloat(a.existencias) || 0; vb = parseFloat(b.existencias) || 0; }
      else if (s.col === '_transito') { va = a._transito || 0; vb = b._transito || 0; }
      else if (s.col === 'ultimo_costo') { va = parseFloat(a.ultimo_costo) || 0; vb = parseFloat(b.ultimo_costo) || 0; }
      else if (s.col === '_sugerencia') { va = a._sugerencia || 0; vb = b._sugerencia || 0; }
      else { va = a[s.col] || 0; vb = b[s.col] || 0; }
      return s.dir === 'asc' ? va - vb : vb - va;
    });
  }

  function toggleSortProv(prov, col) {
    setSortProveedores(prev => {
      const cur = prev[prov];
      const dir = cur?.col === col && cur?.dir === 'desc' ? 'asc' : 'desc';
      return { ...prev, [prov]: { col, dir } };
    });
  }

  function getCantidad(proveedor, codigo, cantCalculada) {
    return cantidadesEditadas[proveedor]?.[codigo] ?? cantCalculada;
  }

  // ── NUEVO: editar cantidad de un item en la sugerencia de compras ──────────
  function editarCantidad(proveedor, codigo, valor) {
    const num = parseInt(valor) || 0;
    setCantidadesEditadas(prev => ({
      ...prev,
      [proveedor]: { ...(prev[proveedor] || {}), [codigo]: num }
    }));
  }

  function agregarAOrden(items, prov) {
    const nuevos = items.map(i => ({
      codigo: i.codigo,
      nombre: i.nombre,
      // ── NUEVO: usa la cantidad editada si existe ──
      cantidad: getCantidad(prov, i.codigo, i._cantComprar),
      costo: parseFloat(i.ultimo_costo) || 0,
      descuento: 0,
      proveedor: i.ultimo_proveedor || '',
      alerta: i._alerta
    })).filter(i => i.cantidad > 0);
    if (nuevos.length === 0) { mostrarMsg('Ningún producto tiene cantidad mayor a 0. Revisá las cantidades antes de agregar.', 'err'); return; }
    setOrdenItems(prev => {
      const cs = new Set(prev.map(x => x.codigo));
      return [...prev, ...nuevos.filter(x => !cs.has(x.codigo))];
    });
    mostrarMsg(`${nuevos.length} productos de ${prov} agregados a la orden.`);
  }

  function quitarDeOrden(c) { setOrdenItems(prev => prev.filter(i => i.codigo !== c)); }
  function actualizarCantidad(c, v) { setOrdenItems(prev => prev.map(i => i.codigo === c ? { ...i, cantidad: parseInt(v) || 0 } : i)); }

  async function pausarProveedor(p) {
    try { await supabase.from('proveedores_pausados').upsert({ proveedor: p, motivo: '' }); setProveedoresPausados(prev => new Set([...prev, p])); mostrarMsg(`${p} pausado.`); } catch (e) { }
  }
  async function reactivarProveedor(p) {
    try {
      await supabase.from('proveedores_pausados').delete().eq('proveedor', p);
      setProveedoresPausados(prev => { const s = new Set(prev); s.delete(p); return s; });
      mostrarMsg(`${p} reactivado.`);
    } catch (e) { }
  }

  async function exportarExcel() {
    mostrarMsg('Generando Excel, un momento...');
    try {
      const res = await fetch('/api/exportar-inventario', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dias }) });
      if (!res.ok) { const e = await res.json(); mostrarMsg(e.error || 'Error al generar Excel', 'err'); return; }
      const blob = await res.blob();
      const ts = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `filtrado_por_proveedor_${ts}.xlsx`; a.click();
      URL.revokeObjectURL(url);
      mostrarMsg('Excel descargado.');
    } catch (e) { mostrarMsg('Error: ' + e.message, 'err'); }
  }

  // ── NUEVO: exportar ZIP con un Excel por proveedor seleccionado ────────────
  async function exportarZip() {
    if (proveedoresSeleccionados.size === 0) { mostrarMsg('Seleccioná al menos un proveedor.', 'err'); return; }
    setZipGenerando(true);
    mostrarMsg(`Generando ZIP con ${proveedoresSeleccionados.size} órdenes...`);
    try {
      // Construir payload: { proveedores: { [nombre]: [ {codigo, cantidad, costo, descuento} ] } }
      const payload = {};
      for (const prov of proveedoresSeleccionados) {
        const items = porProveedor[prov] || [];
        if (!items.length) continue;
        const itemsFiltrados = items
          .map(i => ({
            codigo: i.codigo,
            cantidad: getCantidad(prov, i.codigo, i._cantComprar),
            costo: parseFloat(i.ultimo_costo) || 0,
            descuento: 0,
          }))
          .filter(i => i.cantidad > 0);
        if (!itemsFiltrados.length) continue;
        payload[prov] = itemsFiltrados;
      }

      // ── Dividir cada proveedor en lotes de máx 20 líneas ──────────────────
      const MAX_LINEAS = 20;
      const payloadLotes = {};
      for (const [prov, items] of Object.entries(payload)) {
        if (!items.length) continue;
        const totalLotes = Math.ceil(items.length / MAX_LINEAS);
        for (let l = 0; l < totalLotes; l++) {
          const loteItems = items.slice(l * MAX_LINEAS, (l + 1) * MAX_LINEAS);
          const loteName = totalLotes > 1 ? `${prov} (${l+1}/${totalLotes})` : prov;
          payloadLotes[loteName] = loteItems;
        }
      }

      // DEBUG: mostrar cuántos lotes se van a generar
      console.log('[ZIP] Lotes a generar:', Object.keys(payloadLotes).length, Object.keys(payloadLotes))
      console.log('[ZIP] Proveedores seleccionados:', [...proveedoresSeleccionados])

      const res = await fetch('/api/exportar-zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proveedores: payloadLotes }),
      });

      if (!res.ok) { const e = await res.json(); mostrarMsg(e.error || 'Error al generar ZIP', 'err'); setZipGenerando(false); return; }

      const blob = await res.blob();
      const fecha = new Date().toISOString().slice(0, 10);
      const url = URL.createObjectURL(blob);
      const totalArchivos = Object.keys(payloadLotes).length;
      const a = document.createElement('a'); a.href = url; a.download = `Ordenes_Compra_${fecha}.zip`; a.click();
      URL.revokeObjectURL(url);

      // ── Guardar historial en Supabase: un registro por lote ──────────────
      try {
        const ahora = new Date().toISOString();
        for (const [loteName, items] of Object.entries(payloadLotes)) {
          if (!items.length) continue;
          // Extraer proveedor base (sin sufijo de lote)
          const provBase = loteName.replace(/ \(\d+\/\d+\)$/, '');
          const nombreLote = `OC_${loteName}_${fecha}`;
          const { data: cab, error: errCab } = await supabase
            .from('ordenes_compra')
            .insert([{ fecha_orden: ahora, nombre_lote: nombreLote, dias_tribucion: dias, total_productos: items.length, creado_en: ahora }])
            .select();
          if (errCab || !cab?.length) continue;
          const oid = cab[0].id;
          const rows = items.map(i => {
            const prodInfo = (porProveedor[provBase] || []).find(p => String(p.codigo) === String(i.codigo)) || {};
            return {
              orden_id: oid,
              codigo: String(i.codigo || '').trim(),
              nombre: String(prodInfo.nombre || i.nombre || ''),
              proveedor: provBase,
              cantidad_ordenada: parseFloat(i.cantidad) || 0,
              costo_unitario: parseFloat(i.costo) || 0,
              descuento: parseFloat(i.descuento) || 0,
              dias_tribucion: dias,
              cantidad_recibida: 0,
              estado_item: 'pendiente',
              creado_en: ahora,
            };
          });
          await supabase.from('ordenes_compra_items').insert(rows);
        }
      } catch (eSupa) { console.error('Error guardando historial masivo:', eSupa); }

      mostrarMsg(`✅ ZIP con ${totalArchivos} archivo(s) descargado y guardado en historial.`);
    } catch (e) { mostrarMsg('Error: ' + e.message, 'err'); }
    setZipGenerando(false);
  }

  async function cerrarOrden() {
    if (!ordenItems.length) { mostrarMsg('No hay productos en la orden.', 'err'); return; }
    const nom = nombreOrden.trim() || new Date().toISOString().slice(0, 16).replace('T', '_');
    const MAX_LINEAS = 20;
    const totalLotes = Math.ceil(ordenItems.length / MAX_LINEAS);
    const ahora = new Date().toISOString();
    const fecha = ahora.slice(0, 10);
    const ts = ahora.slice(0, 19).replace('T', '_').replace(/:/g, '-');

    // ── Dividir en lotes de máx 20 líneas ──
    const lotes = [];
    for (let l = 0; l < totalLotes; l++) {
      const loteItems = ordenItems.slice(l * MAX_LINEAS, (l + 1) * MAX_LINEAS);
      const loteName = totalLotes > 1 ? `${nom}_lote${l+1}de${totalLotes}` : nom;
      lotes.push({ nombre: loteName, items: loteItems });
    }

    // ── Guardar cada lote en Supabase ──
    try {
      for (const lote of lotes) {
        const { data: cab } = await supabase.from('ordenes_compra').insert([{ fecha_orden: ahora, nombre_lote: lote.nombre, dias_tribucion: dias, total_productos: lote.items.length, creado_en: ahora }]).select();
        if (cab?.length) {
          const oid = cab[0].id;
          const itemsValidos = lote.items.filter(i => (parseFloat(i.cantidad) || 0) > 0); if (itemsValidos.length > 0) await supabase.from('ordenes_compra_items').insert(itemsValidos.map(i => ({ orden_id: oid, codigo: i.codigo, nombre: i.nombre, proveedor: i.proveedor, cantidad_ordenada: i.cantidad, costo_unitario: i.costo, descuento: i.descuento, dias_tribucion: dias, cantidad_recibida: 0, estado_item: 'pendiente', creado_en: ahora })));
        }
      }
    } catch (e) { console.error('Error guardando lotes:', e); }

    // ── Generar archivos Excel: 1 Excel si es 1 lote, ZIP si son varios ──
    try {
      if (totalLotes === 1) {
        // Un solo Excel igual que antes
        const res = await fetch('/api/exportar-excel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: ordenItems.map(i => ({ codigo: i.codigo, cantidad: i.cantidad, ultimo_costo: i.costo, descuento: i.descuento })), proveedor: nom }) });
        if (!res.ok) { const e = await res.json(); mostrarMsg(e.error || 'Error al generar Excel', 'err'); return; }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `Orden_${nom}_${ts}.xlsx`; a.click();
        URL.revokeObjectURL(url);
      } else {
        // Varios lotes → ZIP con un Excel por lote
        const proveedoresLotes = {};
        for (const lote of lotes) {
          proveedoresLotes[lote.nombre] = lote.items.map(i => ({ codigo: i.codigo, cantidad: i.cantidad, costo: i.costo, descuento: i.descuento || 0 }));
        }
        const res = await fetch('/api/exportar-zip', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ proveedores: proveedoresLotes }) });
        if (!res.ok) { const e = await res.json(); mostrarMsg(e.error || 'Error al generar ZIP', 'err'); return; }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `Orden_${nom}_${totalLotes}lotes_${ts}.zip`; a.click();
        URL.revokeObjectURL(url);
      }
    } catch (e) { mostrarMsg('Error generando archivo: ' + e.message, 'err'); return; }

    mostrarMsg(`✅ Orden "${nom}" cerrada en ${totalLotes} lote(s) de máx 20 líneas.`);
    setOrdenItems([]);
    setNombreOrden('');
    setTab(0);
  }

  const alertasUnicas = ['Todos', '🔴 Bajo stock', '🔴 Bajo stock 🚢', '🟠 En tránsito', '🟡 Prestar atención', '🟢 Óptimo', '🔵 Sobrestock'];

  if (loading) return <div className="module-page glass-module"><div className="module-title">🪐 Saturno – Inventario</div><div style={{ marginTop: 40, textAlign: 'center', color: '#999' }}>Cargando inventario...</div></div>;

  return (
    <div className="module-page glass-module">
      <div className="module-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="module-title">🪐 Saturno – Inventario</h1>
          <p className="module-sub">El Análisis de Stock · Corporación Rojimo</p>
        </div>
        <button className="btn-outline" onClick={() => { setDatos([]); setCalc([]); cargarDatos(); }}>🔄 Reiniciar</button>
      </div>

      {msg && <div className={msg.tipo === 'ok' ? 'success-banner' : 'error-banner'}>{msg.tipo === 'ok' ? '✅' : '❌'} {msg.t}</div>}

      {!datos.length ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: '#999' }}>
          📭 No hay datos. Subí el reporte <strong style={{ color: 'var(--orange)' }}>Lista de mínimos y máximos</strong> en Reportes NEO.
        </div>
      ) : (
        <>
          {fechaCarga && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
              <p style={{ fontSize: '0.78rem', color: '#999', margin: 0 }}>☁️ Última carga: <strong style={{ color: 'var(--burgundy)' }}>{fechaCarga ? new Date(fechaCarga).toLocaleString('es-CR', { timeZone: 'America/Costa_Rica', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}</strong></p>
              <span style={{ fontSize: '0.78rem', background: datos.length >= 4000 ? '#F0FFF4' : datos.length >= 1000 ? '#FFFBEB' : '#FFF5F5', color: datos.length >= 4000 ? '#276749' : datos.length >= 1000 ? '#7B341E' : '#C53030', border: '1px solid', borderColor: datos.length >= 4000 ? '#9AE6B4' : datos.length >= 1000 ? '#FAD776' : '#FEB2B2', borderRadius: 12, padding: '2px 10px', fontWeight: 600 }}>
                {datos.length.toLocaleString()} registros en BD
              </span>
              <SyncBadge reporteIds={["minimos_maximos", "items_lista_general", "items_comprados"]} label="Datos inventario" />
            </div>
          )}

          {totalTCods > 0 && <div className="info-banner">🚢 <strong>{totalTCods} productos en tránsito</strong> ({totalTUnids.toLocaleString()} unidades). La columna <strong>🚢 En tránsito</strong> ya descuenta automáticamente de <strong>Cantidad a comprar</strong>.</div>}
          {proveedoresPausados.size > 0 && <div className="warn-banner">⚠️ Tenés <strong>{proveedoresPausados.size} proveedores pausados</strong>.</div>}

          {/* KPIs */}
          <div className="kpi-grid kpi-grid-6" style={{ marginBottom: 20 }}>
            {[['Total', calc.length, 'var(--teal)'], ['🔴 Bajo stock', (stats['🔴 Bajo stock'] || 0) + (stats['🔴 Bajo stock 🚢'] || 0), '#E53E3E'], ['🟠 Tránsito', stats['🟠 En tránsito'] || 0, '#DD6B20'], ['🟡 Atención', stats['🟡 Prestar atención'] || 0, '#D69E2E'], ['🟢 Óptimo', stats['🟢 Óptimo'] || 0, '#38A169'], ['🔵 Sobrestock', stats['🔵 Sobrestock'] || 0, '#3182CE']].map(([l, v, c]) => (
              <div key={l} className="kpi-card" style={{ borderTopColor: c, padding: '12px 16px' }}>
                <div className="kpi-label">{l}</div>
                <div className="kpi-value" style={{ fontSize: '1.5rem', color: c }}>{v}</div>
              </div>
            ))}
          </div>

          {/* Controles días */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ fontSize: '0.82rem', color: '#666', whiteSpace: 'nowrap' }}>⚔️ Días a cubrir:</label>
              <input type="number" min="1" max="90" value={dias} className="module-input" style={{ width: 70 }} onChange={e => setDias(parseInt(e.target.value) || 30)} />
            </div>
            <button className="btn-primary" onClick={() => setCalc(calcularAlertas(datos, transitoMap, dias))}>⚡ Recalcular</button>
          </div>

          {/* Tabs */}
          <div className="module-tabs">
            {[`📋 Sugerencia de Compras (${calcAComprar.length})`, `🔍 Orden Manual (${ordenItems.length})`, `📊 Exportar Excel`].map((t, i) => (
              <button key={i} className={`module-tab${tab === i ? ' active' : ''}`} onClick={() => setTab(i)}>{t}</button>
            ))}
          </div>

          {/* ── TAB 0: SUGERENCIA DE COMPRAS ── */}
          {tab === 0 && (
            <div>
              <p style={{ fontSize: '0.82rem', color: '#666', marginBottom: 16 }}>Productos que deben reordenarse, agrupados por proveedor. Podés <strong>editar la cantidad</strong> antes de exportar.</p>

              <div className="kpi-grid kpi-grid-4" style={{ marginBottom: 16 }}>
                {[
                  ['Productos a ordenar', calcAComprar.filter(i => !proveedoresPausados.has((i.ultimo_proveedor || '').trim())).length, '#E53E3E'],
                  ['Proveedores activos', proveedoresList.length, 'var(--orange)'],
                  ['Proveedores pausados', proveedoresPausados.size, '#999'],
                  ['Seleccionados', proveedoresSeleccionados.size, 'var(--teal)']
                ].map(([l, v, c]) => (
                  <div key={l} className="kpi-card" style={{ borderTopColor: c, padding: '12px 16px' }}>
                    <div className="kpi-label">{l}</div>
                    <div className="kpi-value" style={{ fontSize: '1.4rem', color: c }}>{v}</div>
                  </div>
                ))}
              </div>

              {/* ── NUEVO: Botones de acción masiva arriba y siempre visibles ── */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                <button className="btn-outline" onClick={() => setProveedoresSeleccionados(new Set(proveedoresList))}>☑️ Seleccionar todos</button>
                <button className="btn-outline" onClick={() => setProveedoresSeleccionados(new Set())}>⬜ Deseleccionar todos</button>
                <button className="btn-primary" onClick={() => { setCalc(calcularAlertas(datos, transitoMap, dias)); setCantidadesEditadas({}); }}>🔄 Recalcular propuesta</button>
                {totalOcultosCount > 0 && (
                  <button className="btn-outline" style={{ fontSize: '0.78rem', color: mostrarOcultos ? 'var(--orange)' : '#999' }} onClick={() => setMostrarOcultos(!mostrarOcultos)}>
                    {mostrarOcultos ? `👁️ Ocultar desactivados (${totalOcultosCount})` : `👁️‍🗨️ Mostrar desactivados (${totalOcultosCount})`}
                  </button>
                )}
                <div style={{ flex: 1 }} />
                {/* ── NUEVO: Botón exportar ZIP masivo ── */}
                <button
                  className="btn-primary"
                  style={{
                    background: proveedoresSeleccionados.size === 0 ? '#ccc' : 'var(--teal, #0d9488)',
                    fontSize: '0.88rem',
                    padding: '8px 18px',
                    opacity: zipGenerando ? 0.7 : 1,
                  }}
                  disabled={proveedoresSeleccionados.size === 0 || zipGenerando}
                  onClick={exportarZip}
                >
                  {zipGenerando ? '⏳ Generando...' : `📦 Exportar ZIP (${proveedoresSeleccionados.size} OC)`}
                </button>

              </div>

              {proveedoresList.length === 0 ? (
                <div className="success-banner">✅ No hay productos que necesiten reorden en este momento.</div>
              ) : proveedoresList.map(prov => {
                const items = porProveedor[prov] || [];
                const valorProv = items.reduce((s, i) => s + getCantidad(prov, i.codigo, i._cantComprar) * (parseFloat(i.ultimo_costo) || 0), 0);
                const selProv = proveedoresSeleccionados.has(prov);
                const exp = expandProv[prov];
                return (
                  <div key={prov} className="card" style={{ marginBottom: 8, borderLeft: `3px solid ${selProv ? 'var(--orange)' : 'var(--border)'}`, padding: '14px 18px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {/* ── Checkbox visible sin abrir el panel ── */}
                        <input
                          type="checkbox"
                          checked={selProv}
                          onChange={e => {
                            const s = new Set(proveedoresSeleccionados);
                            e.target.checked ? s.add(prov) : s.delete(prov);
                            setProveedoresSeleccionados(s);
                          }}
                          style={{ accentColor: 'var(--orange)', width: 15, height: 15 }}
                        />
                        <span style={{ fontWeight: 600, color: 'var(--burgundy)' }}>{prov}</span>
                        <span style={{ fontSize: '0.78rem', color: '#999' }}>{items.length} productos · ₡{valorProv.toLocaleString('es-CR', { maximumFractionDigits: 0 })}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn-outline" style={{ fontSize: '0.78rem', padding: '5px 10px' }} onClick={() => setExpandProv(p => ({ ...p, [prov]: !p[prov] }))}>📋 {exp ? 'Cerrar' : 'Ver'}</button>
                        <button className="btn-primary" style={{ fontSize: '0.78rem', padding: '5px 10px' }} onClick={() => agregarAOrden(items, prov)}>📥 Agregar a orden</button>
                        <button className="btn-outline" style={{ fontSize: '0.78rem', padding: '5px 10px', color: '#E53E3E', borderColor: '#E53E3E' }} onClick={() => pausarProveedor(prov)}>⏸️ Pausar</button>
                        <button
                          className="btn-primary"
                          style={{ fontSize: '0.78rem', padding: '5px 10px', background: '#25D366', border: 'none' }}
                          onClick={() => {
                            const ocItems = items.map(i => ({
                              codigo: i.codigo,
                              nombre: i.nombre,
                              cantidad: getCantidad(prov, i.codigo, i._cantComprar),
                              costo: parseFloat(i.ultimo_costo || i.costo_unitario || i.precio || 0)
                            })).filter(i => i.cantidad > 0)
                            setModalWhatsApp({ proveedor: prov, items: ocItems })
                          }}
                        >📱 WhatsApp</button>
                      </div>
                    </div>

                    {/* ── Panel expandido con tabla editable de cantidades ── */}
                    {exp && (
                      <div style={{ marginTop: 12, overflowX: 'auto' }}>
                        <table className="module-table">
                          <thead>
                            <tr>
                              <th>Alerta</th>
                              <th>Código</th>
                              <th>Nombre</th>
                              {[
                                { key: 'existencias', label: 'Existencias' },
                                { key: '_transito', label: '🚢 Tránsito' },
                                { key: '_sugerencia', label: 'Cant. sugerida' },
                                { key: '_cantComprar', label: 'Cant. a pedir ✏️' },
                                { key: 'ultimo_costo', label: 'Último costo' },
                                { key: '_ocultar', label: '' },
                              ].map(col => {
                                if (col.key === '_ocultar') return <th key="_ocultar" style={{ width: 70 }}></th>;
                                const active = sortProveedores[prov]?.col === col.key;
                                const dir = sortProveedores[prov]?.dir;
                                return (
                                  <th key={col.key} onClick={() => toggleSortProv(prov, col.key)} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
                                    {col.label}{' '}
                                    <span style={{ fontSize: 10, color: active ? 'var(--orange,#f97316)' : '#aaa' }}>
                                      {active ? (dir === 'desc' ? '↓' : '↑') : '↕'}
                                    </span>
                                  </th>
                                );
                              })}
                            </tr>
                          </thead>
                          <tbody>
                            {getSortedItems(prov, items).map((item, idx) => {
                              const cantEditada = cantidadesEditadas[prov]?.[item.codigo];
                              const cantFinal = cantEditada ?? item._cantComprar;
                              const modificada = cantEditada !== undefined && cantEditada !== item._cantComprar;
                              return (
                                <tr key={idx}>
                                  <td><AlertaBadge alerta={item._alerta} /></td>
                                  <td style={{ fontFamily: 'monospace', fontSize: '0.78em', color: 'var(--orange)' }}>{item.codigo}</td>
                                  <td style={{ minWidth: 280 }}>{item.nombre}</td>
                                  <td style={{ textAlign: 'right' }}>{fmtN(item.existencias, 0)}</td>
                                  <td style={{ textAlign: 'center', padding: '4px 8px' }}>
                                    {item._transito > 0 ? (
                                      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2 }}>
                                        <span style={{ color:'#3182CE', fontWeight:600 }}>{'🚢 ' + item._transito}</span>
                                        {transitoSemaforo(transitoDiasMap[(item.codigo||'').trim().toUpperCase()]) ? (
                                          <span style={{ fontSize:'0.72em', fontWeight:700, color: transitoSemaforo(transitoDiasMap[(item.codigo||'').trim().toUpperCase()]).color }}>
                                            {transitoSemaforo(transitoDiasMap[(item.codigo||'').trim().toUpperCase()]).emoji + ' ' + transitoSemaforo(transitoDiasMap[(item.codigo||'').trim().toUpperCase()]).label}
                                          </span>
                                        ) : null}
                                      </div>
                                    ) : <span style={{ color:'#ccc' }}>{'–'}</span>}
                                  </td>
                                  <td style={{ textAlign: 'right', color: '#999' }}>{item._cantComprar}</td>
                                  {/* ── NUEVO: input editable para la cantidad ── */}
                                  <td>
                                    <input
                                      type="number"
                                      min="0"
                                      value={cantFinal}
                                      onChange={e => editarCantidad(prov, item.codigo, e.target.value)}
                                      style={{
                                        width: 72,
                                        padding: '3px 6px',
                                        borderRadius: 6,
                                        border: modificada ? '2px solid var(--orange, #f97316)' : '1px solid #d1d5db',
                                        fontWeight: modificada ? 700 : 400,
                                        color: modificada ? 'var(--orange, #f97316)' : '#1a1a2e',
                                        textAlign: 'right',
                                        fontSize: '0.85rem',
                                        outline: 'none',
                                      }}
                                    />
                                  </td>
                                  <td style={{ textAlign: 'right' }}><input type='number' value={parseFloat(item.ultimo_costo)||0} onChange={e => { e.stopPropagation(); const v=parseFloat(e.target.value)||0; setCalc(prev=>prev.map(x=>x.codigo===item.codigo?{...x,ultimo_costo:v}:x)); }} onClick={e=>e.stopPropagation()} style={{width:90,textAlign:'right',border:'1px solid #EAE0E0',borderRadius:4,padding:'2px 4px',fontSize:'0.82em',background:'#FDF4F4'}} /></td>
                                  <td style={{ textAlign: 'center' }}>
                                    {itemsOcultos.has(`${item.codigo}__${prov}`) ? (
                                      <button onClick={() => mostrarItem(item.codigo, prov)} style={{ background: '#F0FFF4', color: '#276749', border: '1px solid #9AE6B4', borderRadius: 6, padding: '2px 8px', fontSize: '0.72rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>✅ Activar</button>
                                    ) : (
                                      <button onClick={() => ocultarItem(item.codigo, prov)} style={{ background: '#FFF5F5', color: '#C53030', border: '1px solid #FEB2B2', borderRadius: 6, padding: '2px 8px', fontSize: '0.72rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>🚫 Ocultar</button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Proveedores pausados */}
              {proveedoresPausados.size > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <p style={{ fontSize: '0.78rem', color: '#999', margin: 0 }}>⏸️ Proveedores pausados ({proveedoresPausados.size})</p>
                    <button className="btn-primary" style={{ fontSize: '0.75rem', padding: '5px 12px', background: '#E53E3E' }} onClick={async () => {
                      if (!confirm(`¿Reactivar los ${proveedoresPausados.size} proveedores pausados?`)) return;
                      try { await supabase.from('proveedores_pausados').delete().neq('proveedor', '__never__'); setProveedoresPausados(new Set()); mostrarMsg('✅ Todos los proveedores reactivados.'); } catch (e) { mostrarMsg('Error: ' + e.message, 'err'); }
                    }}>🔓 Reactivar todos</button>
                  </div>
                  {[...proveedoresPausados].sort().map(p => (
                    <div key={p} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 14px', marginBottom: 6, fontSize: '0.84rem' }}>
                      <span style={{ color: '#666' }}>{p}</span>
                      <button className="btn-outline" style={{ fontSize: '0.75rem', padding: '4px 10px' }} onClick={() => reactivarProveedor(p)}>▶️ Reactivar</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── TAB 1: ORDEN MANUAL ── */}
          {tab === 1 && (
            <div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
                <input className="module-input" style={{ flex: 1, minWidth: 240 }} placeholder="🔍 Buscar por código, nombre, proveedor, alerta..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
                <select className="module-input" value={filtroAlerta} onChange={e => setFiltroAlerta(e.target.value)}>
                  {alertasUnicas.map(a => <option key={a}>{a}</option>)}
                </select>
                {(hasColFilter || busqueda || filtroAlerta !== 'Todos') && (
                  <button onClick={resetColFilters} style={{ padding: '8px 14px', borderRadius: 8, border: '1.5px solid #E53E3E', background: '#FFF5F5', color: '#E53E3E', fontWeight: 600, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>✕ Limpiar filtros</button>
                )}
                <span style={{ fontSize: '0.78rem', color: '#999', whiteSpace: 'nowrap' }}><strong style={{ color: '#1a1a2e' }}>{calcFiltrado.length.toLocaleString()}</strong> de {calc.length.toLocaleString()} productos</span>
              </div>

              <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 520, borderRadius: 10, border: '1px solid var(--border)', marginBottom: 14 }}>
                <table className="module-table">
                  <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                    <tr>
                      <th style={{ padding: '10px 12px' }}>☑</th>
                      {[{ key: '_alerta', label: 'Alerta' }, { key: 'codigo', label: 'Código' }, { key: 'nombre', label: 'Nombre' }, { key: 'ultimo_proveedor', label: 'Proveedor' }].map(col => (
                        <th key={col.key} style={{ padding: '10px 12px' }}>
                          {colFilters && allColValues[col.key] ? (
                            <ColFilter label={col.label} values={allColValues[col.key]} selected={colFilters[col.key]} onSelect={(v) => setFilter(col.key, v)} onSort={(dir) => setSort(col.key, dir)} activeSort={colSort.col === col.key ? colSort.dir : null} />
                          ) : col.label}
                        </th>
                      ))}
                      {[{ key: 'promedio_mensual', label: 'Prom. mensual' }, { key: 'existencias', label: 'Existencias' }, { key: '_transito', label: '🚢 Tránsito' }, { key: '_cantComprar', label: 'Cant. a comprar' }, { key: 'ultimo_costo', label: 'Último costo' }].map(col => (
                        <th key={col.key} style={{ padding: '10px 12px', cursor: 'pointer', userSelect: 'none' }} onClick={() => setSort(col.key, colSort.col === col.key && colSort.dir === 'asc' ? 'desc' : 'asc')}>
                          <span style={{ fontWeight: 700, fontSize: 12, letterSpacing: 0.3 }}>{col.label} {colSort.col === col.key ? (colSort.dir === 'asc' ? ' ↑' : ' ↓') : ' ↕'}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {calcFiltrado.map((item, i) => {
                      const sel = seleccionados.has(item.codigo);
                      return (
                        <tr key={i} style={{ background: sel ? 'rgba(237,110,46,0.06)' : undefined, cursor: 'pointer' }} onClick={() => { const s = new Set(seleccionados); sel ? s.delete(item.codigo) : s.add(item.codigo); setSeleccionados(s); }}>
                          <td><input type="checkbox" checked={sel} readOnly style={{ accentColor: 'var(--orange)' }} /></td>
                          <td><AlertaBadge alerta={item._alerta} /></td>
                          <td style={{ fontFamily: 'monospace', fontSize: '0.78em', color: 'var(--orange)' }}>{item.codigo}</td>
                          <td style={{ minWidth: 280 }}>{item.nombre}</td>
                          <td style={{ maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.78em' }}>{item.ultimo_proveedor || '—'}</td>
                          <td style={{ textAlign: 'right' }}>{fmtN(item.promedio_mensual, 0)}</td>
                          <td style={{ textAlign: 'right', color: parseFloat(item.existencias) <= 0 ? '#E53E3E' : undefined }}>{fmtN(item.existencias, 0)}</td>
                          <td style={{ textAlign: 'center' }}>
                                    {item._transito > 0 ? (
                                      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2 }}>
                                        <span style={{ color:'#3182CE', fontWeight:600 }}>{'🚢 ' + item._transito}</span>
                                        {transitoSemaforo(transitoDiasMap[(item.codigo||'').trim().toUpperCase()]) ? (
                                          <span style={{ fontSize:'0.72em', fontWeight:700, color: transitoSemaforo(transitoDiasMap[(item.codigo||'').trim().toUpperCase()]).color }}>
                                            {transitoSemaforo(transitoDiasMap[(item.codigo||'').trim().toUpperCase()]).emoji + ' ' + transitoSemaforo(transitoDiasMap[(item.codigo||'').trim().toUpperCase()]).label}
                                          </span>
                                        ) : null}
                                      </div>
                                    ) : <span style={{ color:'#ccc' }}>{'–'}</span>}
                                  </td>
                          <td style={{ textAlign: 'right', fontWeight: item._cantComprar > 0 ? 700 : 400, color: item._cantComprar > 0 ? '#E53E3E' : item._alerta === '🟡 Prestar atención' ? '#D69E2E' : '#ccc' }}>{item._cantComprar > 0 ? item._cantComprar : item._alerta === '🟡 Prestar atención' ? 0 : '–'}</td>
                          <td style={{ textAlign: 'right' }}><input type='number' value={parseFloat(item.ultimo_costo)||0} onChange={e => { e.stopPropagation(); const v=parseFloat(e.target.value)||0; setCalc(prev=>prev.map(x=>x.codigo===item.codigo?{...x,ultimo_costo:v}:x)); }} onClick={e=>e.stopPropagation()} style={{width:90,textAlign:'right',border:'1px solid #EAE0E0',borderRadius:4,padding:'2px 4px',fontSize:'0.82em',background:'#FDF4F4'}} /></td>
                        </tr>
                      );
                    })}
                    {calcFiltrado.length === 0 && <tr><td colSpan={11} style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>😕 No hay productos con esos filtros</td></tr>}
                  </tbody>
                </table>

              </div>

              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
                <button className="btn-primary" onClick={() => {
                  const items = calc.filter(i => seleccionados.has(i.codigo));
                  if (!items.length) { mostrarMsg('Marcá productos con ☑', 'err'); return; }
                  const nuevos = items.map(i => ({ codigo: i.codigo, nombre: i.nombre, cantidad: i._cantComprar || 1, costo: parseFloat(i.ultimo_costo) || 0, descuento: 0, proveedor: i.ultimo_proveedor || '', alerta: i._alerta }));
                  setOrdenItems(prev => { const cs = new Set(prev.map(x => x.codigo)); return [...prev, ...nuevos.filter(x => !cs.has(x.codigo))]; });
                  setSeleccionados(new Set());
                  mostrarMsg(`${items.length} productos agregados a la orden.`);
                }}>📥 Agregar a Orden ({seleccionados.size})</button>
                {seleccionados.size > 0 && <button className="btn-outline" onClick={() => setSeleccionados(new Set())}>✖ Limpiar selección</button>}
              </div>

              {ordenItems.length > 0 && (
                <div className="card" style={{ padding: 20 }}>
                  <div style={{ fontWeight: 600, color: 'var(--burgundy)', marginBottom: 14, fontSize: '1rem' }}>📯 Orden Activa — {ordenItems.length} productos</div>
                  <div style={{ overflowX: 'auto', marginBottom: 14 }}>
                    <table className="module-table">
                      <thead><tr>{['✕', 'Código', 'Nombre', 'Cant.', 'Costo', 'Descuento', 'Proveedor'].map(h => <th key={h}>{h}</th>)}</tr></thead>
                      <tbody>{ordenItems.map((i, idx) => (
                        <tr key={idx}>
                          <td><button onClick={() => quitarDeOrden(i.codigo)} style={{ background: 'none', border: 'none', color: '#E53E3E', cursor: 'pointer', fontSize: '1rem' }}>✕</button></td>
                          <td style={{ fontFamily: 'monospace', fontSize: '0.78em', color: 'var(--orange)' }}>{i.codigo}</td>
                          <td style={{ minWidth: 280 }}>{i.nombre}</td>
                          <td><input type="number" min="0" value={i.cantidad} onChange={e => actualizarCantidad(i.codigo, e.target.value)} className="module-input" style={{ width: 70, padding: '4px 8px' }} /></td>
                          <td style={{ textAlign: 'right' }}><input type='number' value={i.costo} onChange={e => setOrdenItems(prev => prev.map((x,xi) => xi===idx ? {...x, costo: parseFloat(e.target.value)||0} : x))} style={{width:90,textAlign:'right',border:'1px solid #EAE0E0',borderRadius:4,padding:'2px 4px',fontSize:'0.82em',background:'#FDF4F4'}} /></td>
                          <td style={{ textAlign: 'right' }}>{i.descuento}%</td>
                          <td style={{ fontSize: '0.78em' }}>{i.proveedor || '—'}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
                      <input className="module-input" style={{ width: '100%', boxSizing: 'border-box' }} placeholder="📝 Proveedor de la orden (escribí para buscar)" value={nombreOrden} onChange={e => { setNombreOrden(e.target.value); setProveedorOrdenSeleccionado(''); setShowProvSuggestions(true); }} onFocus={() => setShowProvSuggestions(true)} onBlur={() => setTimeout(() => setShowProvSuggestions(false), 180)} autoComplete="off" />
                      {showProvSuggestions && nombreOrden.length >= 1 && (() => { const q = nombreOrden.toLowerCase(); const kommoNombres = proveedoresKommo.map(p => p.nombre_proveedor); const provDeItems = ordenItems.map(i => i.proveedor || i.ultimo_proveedor || '').filter(Boolean); const todos = [...new Set([...PROVEEDORES_HISTORICOS, ...kommoNombres, ...provDeItems])].sort(); return todos.filter(p => p.toLowerCase().includes(q)); })().length > 0 && (
                        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #EAE0E0', borderRadius: 8, zIndex: 999, boxShadow: '0 4px 16px rgba(0,0,0,0.10)', maxHeight: 200, overflowY: 'auto' }}>
                          {[...new Set([...PROVEEDORES_HISTORICOS, ...proveedoresKommo.map(p => p.nombre_proveedor), ...ordenItems.map(i => i.proveedor || i.ultimo_proveedor || '').filter(Boolean)])].sort().filter(p => p.toLowerCase().includes(nombreOrden.toLowerCase())).map((p, i) => (
                            <div key={i} onMouseDown={() => { setNombreOrden(p); setProveedorOrdenSeleccionado(p); setShowProvSuggestions(false); }} style={{ padding: '8px 14px', cursor: 'pointer', fontSize: '0.87rem', borderBottom: '1px solid #F5EAEA' }} onMouseEnter={e => e.currentTarget.style.background='#FDF4F4'} onMouseLeave={e => e.currentTarget.style.background='#fff'}>
                              {p}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <button className="btn-primary" onClick={cerrarOrden}>🔱 Cerrar Orden – Descargar Excel</button>
                    <button
                      className="btn-primary"
                      style={{ background: '#25D366', border: 'none' }}
                      disabled={ordenItems.length === 0}
                      onClick={() => setModalWhatsApp({
                        proveedor: proveedorOrdenSeleccionado || nombreOrden,
                        items: ordenItems.map(i => ({ codigo: i.codigo, nombre: i.nombre, cantidad: i.cantidad, costo: parseFloat(i.costo)||0 }))
                      })}
                    >📱 Enviar por WhatsApp</button>
                    <button className="btn-outline" style={{ color: '#E53E3E', borderColor: '#E53E3E' }} onClick={() => { if (confirm('¿Limpiar la orden?')) setOrdenItems([]); }}>🗑 Limpiar</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── TAB 2: EXPORTAR ── */}
          {tab === 2 && (
            <div className="card" style={{ padding: 24 }}>
              <div style={{ fontWeight: 600, color: 'var(--burgundy)', marginBottom: 8, fontSize: '1rem' }}>📊 Exportar tabla agrupada por proveedor</div>
              <p style={{ fontSize: '0.82rem', color: '#666', marginBottom: 18 }}>Exporta <strong>todos</strong> los productos con sus alertas, agrupados por proveedor — igual que antes.</p>
              <p style={{ fontSize: '0.82rem', color: '#666', marginBottom: 16 }}>Se exportarán <strong>{calc.length.toLocaleString()}</strong> productos de <strong>{new Set(calc.map(i => i.ultimo_proveedor || 'Sin proveedor')).size}</strong> proveedores.</p>
              <button className="btn-primary" style={{ fontSize: '0.9rem', padding: '10px 24px' }} onClick={() => exportarExcel()}>📄 Generar y Descargar Excel agrupado</button>
              <div className="info-banner" style={{ marginTop: 16 }}>
                <strong>El Excel incluye:</strong> Hoja "Filtrado agrupado" con alertas + columna 🚢 En tránsito, agrupado por proveedor. Hoja "Resumen por Proveedor".
              </div>
            </div>
          )}
        </>
      )}
    {modalWhatsApp && (
      <ModalEnviarWhatsApp
        proveedor={modalWhatsApp.proveedor}
        items={modalWhatsApp.items}
        onClose={() => setModalWhatsApp(null)}
        onEnviado={() => setModalWhatsApp(null)}
      />
    )}
    </div>
  );
}
