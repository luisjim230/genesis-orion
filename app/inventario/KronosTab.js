'use client';
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';

// ── Semáforo de urgencia ──────────────────────────────────────────────────────
function urgencia(diasRestantes, leadTime) {
  if (diasRestantes === null) return { color: '#999', label: '—', orden: 99 };
  if (diasRestantes <= 0)               return { color: '#E53E3E', label: '🔴 Vencido',  orden: 0 };
  if (diasRestantes <= leadTime)        return { color: '#E53E3E', label: '🔴 Pedí YA',  orden: 1 };
  if (diasRestantes <= leadTime * 1.5)  return { color: '#D69E2E', label: '🟡 Urgente',  orden: 2 };
  if (diasRestantes <= leadTime * 2.5)  return { color: '#DD6B20', label: '🟠 Pronto',   orden: 3 };
  return                                       { color: '#38A169', label: '🟢 OK',        orden: 4 };
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

// ── Mini gráfico SVG ──────────────────────────────────────────────────────────
function MiniGrafico({ existencias, consumoMensual, leadTimeDias, diasQuiebre }) {
  if (!consumoMensual || consumoMensual <= 0) return <span style={{ color: '#ccc', fontSize: 11 }}>sin datos</span>;
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

// ── Color del card según urgencia más alta del grupo ─────────────────────────
function colorGrupo(items) {
  const minOrden = Math.min(...items.map(i => i._urgencia.orden));
  if (minOrden <= 1) return { bg: '#FFF5F5', border: '#FC8181' };
  if (minOrden === 2) return { bg: '#FFFFF0', border: '#F6E05E' };
  if (minOrden === 3) return { bg: '#FFFAF0', border: '#FBD38D' };
  return { bg: '#F0FFF4', border: '#9AE6B4' };
}

export default function KronosTab({ calc, transitoMap }) {
  const [leadTimes, setLeadTimes]           = useState({});
  const [editando, setEditando]             = useState(null);
  const [editVal, setEditVal]               = useState('');
  const [editNotas, setEditNotas]           = useState('');
  const [guardando, setGuardando]           = useState(false);
  const [busqueda, setBusqueda]             = useState('');
  const [filtroUrgencia, setFiltroUrgencia] = useState('todos');
  const [expandidos, setExpandidos]         = useState({});
  const [msg, setMsg]                       = useState(null);
  const [consumoHistorico, setConsumoHistorico] = useState({});
  const [cargandoHistorial, setCargandoHistorial] = useState(true);
  const [periodos, setPeriodos]             = useState([]);

  useEffect(() => {
    cargarLeadTimes();
    cargarConsumoHistorico();
  }, []);

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
      while (true) {
        const { data, error } = await supabase
          .from('neo_items_facturados')
          .select('codigo_interno,cantidad_facturada,cantidad_devuelta,fecha')
          .range(offset, offset + BATCH - 1);
        if (error || !data || !data.length) break;
        data.forEach(r => {
          const cod = (r.codigo_interno || '').toString().trim();
          if (!cod) return;
          const qty = (parseFloat(r.cantidad_facturada) || 0) - (parseFloat(r.cantidad_devuelta) || 0);
          const mes = r.fecha ? r.fecha.slice(0, 7) : null;
          if (!acum[cod]) acum[cod] = { totalUnidades: 0, meses: new Set() };
          acum[cod].totalUnidades += qty;
          if (mes) acum[cod].meses.add(mes);
        });
        if (data.length < BATCH) break;
        offset += BATCH;
      }
      const consumo = {};
      Object.entries(acum).forEach(([cod, v]) => {
        consumo[cod] = v.totalUnidades / (v.meses.size || 1);
      });
      setConsumoHistorico(consumo);
    } catch (e) { console.error(e); }
    setCargandoHistorial(false);
  }

  async function guardarLeadTime(proveedor) {
    const dias = parseInt(editVal) || 30;
    setGuardando(true);
    try {
      await supabase.from('proveedores_leadtime').upsert({
        proveedor, lead_time_dias: dias,
        activo: leadTimes[proveedor]?.activo ?? true,
        notas: editNotas,
      }, { onConflict: 'proveedor' });
      setLeadTimes(prev => ({ ...prev, [proveedor]: {
        ...prev[proveedor], proveedor, lead_time_dias: dias,
        activo: prev[proveedor]?.activo ?? true, notas: editNotas
      }}));
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

  // ── Proyecciones ────────────────────────────────────────────────────────────
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

      if (!consumoMensual || consumoMensual <= 0) {
        return { ...item, _consumoMensual: 0, _fuenteConsumo: null, _mesesCobertura: null,
          _diasQuiebre: null, _fechaQuiebre: null, _fechaPedido: null, _diasParaPedir: null,
          _urgencia: urgencia(null, 0), _leadTime: leadTimeDias, _activo: activo };
      }
      const mesesCobertura = stockTotal / consumoMensual;
      const diasQuiebre = Math.round(mesesCobertura * 30);
      const fechaQuiebre = new Date(hoy.getTime() + diasQuiebre * 86400000);
      const fechaPedido  = new Date(fechaQuiebre.getTime() - leadTimeDias * 86400000);
      const diasParaPedir = Math.round((fechaPedido.getTime() - hoy.getTime()) / 86400000);
      return {
        ...item, _consumoMensual: consumoMensual, _fuenteConsumo: fuenteConsumo,
        _mesesCobertura: mesesCobertura, _diasQuiebre: diasQuiebre,
        _fechaQuiebre: fechaQuiebre.toISOString().slice(0, 10),
        _fechaPedido: fechaPedido.toISOString().slice(0, 10),
        _diasParaPedir: diasParaPedir, _leadTime: leadTimeDias, _activo: activo,
        _urgencia: urgencia(diasParaPedir, leadTimeDias),
      };
    });
  }, [calc, consumoHistorico, leadTimes, transitoMap]);

  const stats = useMemo(() => ({
    rojos:     proyecciones.filter(i => i._urgencia.orden <= 1).length,
    amarillos: proyecciones.filter(i => i._urgencia.orden === 2).length,
    naranjas:  proyecciones.filter(i => i._urgencia.orden === 3).length,
    verdes:    proyecciones.filter(i => i._urgencia.orden === 4).length,
  }), [proyecciones]);

  // ── Agrupar por proveedor ───────────────────────────────────────────────────
  const grupos = useMemo(() => {
    let items = proyecciones;
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase();
      items = items.filter(i => [i.codigo, i.nombre, i.ultimo_proveedor, i.categoria]
        .some(v => (v || '').toLowerCase().includes(q)));
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
      .map(([prov, items]) => ({
        prov, items: [...items].sort((a, b) => a._urgencia.orden - b._urgencia.orden),
        minOrden: Math.min(...items.map(i => i._urgencia.orden)),
      }))
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

  const totalFiltrado = grupos.activos.reduce((s, g) => s + g.items.length, 0)
                      + grupos.pausados.reduce((s, g) => s + g.items.length, 0);

  // ── Fila de producto ────────────────────────────────────────────────────────
  function FilaProducto({ item, idx }) {
    const cod = (item.codigo || '').toString().trim();
    return (
      <tr style={{ borderBottom: '1px solid #f0f0f0', background: idx % 2 === 0 ? 'white' : '#fafafa' }}>
        <td style={{ padding: '6px 10px' }}>
          <span style={{ fontWeight: 700, color: item._urgencia.color, fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
            {item._urgencia.label}
          </span>
        </td>
        <td style={{ padding: '6px 10px', color: 'var(--orange)', fontFamily: 'monospace', fontSize: '0.73rem' }}>
          {item.codigo}
        </td>
        <td style={{ padding: '6px 10px', maxWidth: 240 }}>
          <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.78rem' }}>
            {item.nombre}
          </div>
          <div style={{ fontSize: '0.67rem', color: '#999' }}>{item.categoria}</div>
        </td>
        <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 600, fontSize: '0.78rem' }}>
          {parseFloat(item.existencias) || 0}
        </td>
        <td style={{ padding: '6px 10px', textAlign: 'right', color: '#DD6B20', fontSize: '0.78rem' }}>
          {(transitoMap?.[cod] || 0) > 0 ? transitoMap[cod] : '—'}
        </td>
        <td style={{ padding: '6px 10px', textAlign: 'right', fontSize: '0.78rem' }}>
          {item._consumoMensual > 0 ? (
            <span>
              {item._consumoMensual.toFixed(1)}
              <span style={{ fontSize: '0.65rem', color: item._fuenteConsumo === 'real' ? '#38A169' : '#bbb', marginLeft: 3 }}>
                {item._fuenteConsumo === 'real' ? '●' : '○'}
              </span>
            </span>
          ) : <span style={{ color: '#ccc' }}>—</span>}
        </td>
        <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 600, fontSize: '0.78rem',
          color: item._mesesCobertura !== null
            ? (item._mesesCobertura < 1 ? '#E53E3E' : item._mesesCobertura < 2 ? '#D69E2E' : '#38A169') : '#ccc' }}>
          {fmtMeses(item._mesesCobertura)}
        </td>
        <td style={{ padding: '6px 10px', textAlign: 'right', fontSize: '0.73rem',
          color: item._diasQuiebre !== null && item._diasQuiebre < 30 ? '#E53E3E' : '#555' }}>
          {item._fechaQuiebre ? fmtFecha(item._fechaQuiebre) : '—'}
          {item._diasQuiebre !== null && <div style={{ fontSize: '0.63rem', color: '#aaa' }}>en {item._diasQuiebre}d</div>}
        </td>
        <td style={{ padding: '6px 10px', textAlign: 'right', fontSize: '0.73rem' }}>
          <span style={{ fontWeight: 700, color: item._urgencia.color }}>
            {item._fechaPedido ? fmtFecha(item._fechaPedido) : '—'}
          </span>
          {item._diasParaPedir !== null && item._diasParaPedir !== undefined && (
            <div style={{ fontSize: '0.63rem', color: item._diasParaPedir < 0 ? '#E53E3E' : '#aaa' }}>
              {item._diasParaPedir < 0 ? `hace ${Math.abs(item._diasParaPedir)}d` : `en ${item._diasParaPedir}d`}
            </div>
          )}
        </td>
        <td style={{ padding: '6px 10px' }}>
          <MiniGrafico existencias={parseFloat(item.existencias) || 0}
            consumoMensual={item._consumoMensual} leadTimeDias={item._leadTime} diasQuiebre={item._diasQuiebre} />
        </td>
      </tr>
    );
  }

  // ── Card de proveedor ───────────────────────────────────────────────────────
  function CardProveedor({ prov, items, pausado }) {
    const abierto = expandidos[prov] ?? false;
    const { bg, border } = colorGrupo(items);
    const lt = leadTimes[prov];
    const estaEditando = editando === prov;
    const criticos = items.filter(i => i._urgencia.orden <= 1).length;
    const urgentes = items.filter(i => i._urgencia.orden === 2).length;

    return (
      <div style={{ marginBottom: 10, border: `1px solid ${border}`, borderRadius: 10, overflow: 'hidden', opacity: pausado ? 0.65 : 1 }}>
        <div onClick={() => toggleExpand(prov)}
          style={{ background: bg, padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: '0.88rem', color: '#2a3a50', flex: 1 }}>
            {abierto ? '▼' : '▶'} {prov}
          </span>
          {criticos > 0 && (
            <span style={{ background: '#FED7D7', color: '#C53030', borderRadius: 12, padding: '2px 8px', fontSize: '0.72rem', fontWeight: 700 }}>
              🔴 {criticos}
            </span>
          )}
          {urgentes > 0 && (
            <span style={{ background: '#FEFCBF', color: '#744210', borderRadius: 12, padding: '2px 8px', fontSize: '0.72rem', fontWeight: 700 }}>
              🟡 {urgentes}
            </span>
          )}
          <span style={{ fontSize: '0.72rem', color: '#888' }}>{items.length} prods.</span>

          {/* Lead time editable */}
          <div onClick={e => e.stopPropagation()}>
            {estaEditando ? (
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <input type="number" min={1} value={editVal} onChange={e => setEditVal(e.target.value)}
                  style={{ width: 52, padding: '3px 6px', border: '1px solid var(--orange)', borderRadius: 4, fontSize: '0.75rem' }} />
                <span style={{ fontSize: '0.7rem', color: '#888' }}>días</span>
                <button onClick={() => guardarLeadTime(prov)} disabled={guardando}
                  style={{ padding: '3px 8px', background: 'var(--orange)', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.72rem' }}>
                  {guardando ? '...' : '✓'}
                </button>
                <button onClick={() => setEditando(null)}
                  style={{ padding: '3px 6px', background: '#eee', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.72rem' }}>✕</button>
              </div>
            ) : (
              <button onClick={() => { setEditando(prov); setEditVal(lt?.lead_time_dias || 8); setEditNotas(lt?.notas || ''); }}
                style={{ fontSize: '0.72rem', color: 'var(--teal)', background: 'none', border: '1px solid var(--teal)',
                  borderRadius: 6, cursor: 'pointer', padding: '3px 8px', whiteSpace: 'nowrap' }}>
                ⏱ {lt?.lead_time_dias ? `${lt.lead_time_dias}d` : 'Lead time'}
              </button>
            )}
          </div>

          {/* Pausar/activar */}
          <div onClick={e => e.stopPropagation()}>
            <button onClick={() => toggleActivo(prov)}
              style={{ fontSize: '0.7rem', padding: '3px 8px', borderRadius: 6, border: '1px solid #ddd',
                background: pausado ? '#fff3e0' : '#f7f7f7', cursor: 'pointer',
                color: pausado ? '#DD6B20' : '#888', whiteSpace: 'nowrap' }}>
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
                    <th key={h} style={{ padding: '6px 10px', fontSize: '0.7rem', color: '#666',
                      borderBottom: '1px solid #eee', whiteSpace: 'nowrap',
                      textAlign: ['Estado','Código','Nombre'].includes(h) ? 'left' : 'right' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => <FilaProducto key={item.codigo + idx} item={item} idx={idx} />)}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────
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
          ['🔴 Pedir YA', stats.rojos,    '#E53E3E', 'critico'],
          ['🟡 Urgente',  stats.amarillos,'#D69E2E', 'urgente'],
          ['🟠 Pronto',   stats.naranjas, '#DD6B20', 'pronto'],
          ['🟢 OK',       stats.verdes,   '#38A169', 'ok'],
        ].map(([l, v, c, key]) => (
          <div key={l} className="kpi-card"
            style={{ borderTop: `3px solid ${c}`, cursor: 'pointer',
              outline: filtroUrgencia === key ? `2px solid ${c}` : 'none' }}
            onClick={() => setFiltroUrgencia(filtroUrgencia === key ? 'todos' : key)}>
            <div className="kpi-label">{l}</div>
            <div className="kpi-value" style={{ color: c }}>{v}</div>
          </div>
        ))}
      </div>

      {/* Info historial */}
      <div style={{ background: '#f7f9fc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 14px',
        marginBottom: 14, fontSize: '0.77rem', color: '#555', display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {cargandoHistorial ? <span>⏳ Calculando consumo histórico...</span> : (
          <>
            <span>📊 <strong>{Object.keys(consumoHistorico).length}</strong> productos con consumo real</span>
            <span>📅 <strong>{periodos.length}</strong> períodos en historial</span>
            <span style={{ color: '#aaa' }}>Consumo real tiene prioridad sobre promedio NEO</span>
          </>
        )}
      </div>

      {/* Barra de filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <input className="module-input" style={{ flex: 1, minWidth: 220 }}
          placeholder="🔍 Buscar por código, nombre, proveedor..."
          value={busqueda} onChange={e => setBusqueda(e.target.value)} />

        <select value={filtroUrgencia} onChange={e => setFiltroUrgencia(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: '0.82rem',
            cursor: 'pointer', background: 'white', color: '#333' }}>
          <option value="todos">📋 Todos los estados</option>
          <option value="critico">🔴 Críticos (Vencido + Pedí YA)</option>
          <option value="urgente">🟡 Hasta Urgentes</option>
          <option value="pronto">🟠 Hasta Pronto</option>
          <option value="ok">🟢 Incluir OK</option>
        </select>

        <span style={{ fontSize: '0.78rem', color: '#999' }}>{totalFiltrado} productos · {grupos.activos.length} proveedores</span>

        <button onClick={expandirTodos}
          style={{ padding: '6px 12px', borderRadius: 7, border: '1px solid #ddd', background: 'white', cursor: 'pointer', fontSize: '0.78rem', color: '#555' }}>
          ▼ Expandir todo
        </button>
        <button onClick={colapsarTodos}
          style={{ padding: '6px 12px', borderRadius: 7, border: '1px solid #ddd', background: 'white', cursor: 'pointer', fontSize: '0.78rem', color: '#555' }}>
          ▶ Colapsar todo
        </button>
      </div>

      {/* Grupos activos */}
      {grupos.activos.length === 0 && grupos.pausados.length === 0 && (
        <div style={{ textAlign: 'center', padding: 48, color: '#aaa' }}>No hay productos que mostrar.</div>
      )}
      {grupos.activos.map(g => <CardProveedor key={g.prov} prov={g.prov} items={g.items} pausado={false} />)}

      {/* Grupos pausados */}
      {grupos.pausados.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: '0.78rem', color: '#aaa', fontWeight: 600, marginBottom: 8,
            borderTop: '1px dashed #ddd', paddingTop: 14 }}>
            ⏸ PROVEEDORES PAUSADOS ({grupos.pausados.length})
          </div>
          {grupos.pausados.map(g => <CardProveedor key={g.prov} prov={g.prov} items={g.items} pausado={true} />)}
        </div>
      )}

      <div style={{ marginTop: 14, fontSize: '0.7rem', color: '#aaa', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <span>● Verde = consumo real (historial facturas)</span>
        <span>○ Gris = promedio NEO (fallback)</span>
        <span>— Línea roja = quiebre stock · — Línea amarilla = fecha límite pedido</span>
      </div>
    </div>
  );
}
