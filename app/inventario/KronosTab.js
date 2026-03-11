'use client';
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';

// ── Semáforo de urgencia ──────────────────────────────────────────────────────
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

// ── Mini gráfico SVG de proyección ────────────────────────────────────────────
function MiniGrafico({ existencias, consumoMensual, leadTimeDias, diasQuiebre }) {
  if (!consumoMensual || consumoMensual <= 0) return <span style={{ color: '#ccc', fontSize: 11 }}>sin datos</span>;
  const W = 120, H = 36;
  const mesesTotal = Math.min((existencias / consumoMensual) + 1, 12);
  const puntos = [];
  for (let m = 0; m <= Math.ceil(mesesTotal); m++) {
    const inv = Math.max(existencias - consumoMensual * m, 0);
    const x = (m / Math.ceil(mesesTotal)) * W;
    const y = H - (inv / existencias) * (H - 4);
    puntos.push(`${x},${y}`);
    if (inv === 0) break;
  }
  const xQuiebre = diasQuiebre ? Math.min((diasQuiebre / 30 / Math.ceil(mesesTotal)) * W, W) : null;
  const xLead = leadTimeDias && diasQuiebre ? Math.max(xQuiebre - (leadTimeDias / 30 / Math.ceil(mesesTotal)) * W, 0) : null;

  return (
    <svg width={W} height={H} style={{ overflow: 'visible' }}>
      {xLead && <line x1={xLead} y1={0} x2={xLead} y2={H} stroke="#D69E2E" strokeWidth={1} strokeDasharray="3,2" />}
      {xQuiebre && <line x1={xQuiebre} y1={0} x2={xQuiebre} y2={H} stroke="#E53E3E" strokeWidth={1} strokeDasharray="3,2" />}
      <polyline points={puntos.join(' ')} fill="none" stroke="var(--teal, #2B6CB0)" strokeWidth={1.5} />
      <line x1={0} y1={H} x2={W} y2={H} stroke="#eee" strokeWidth={1} />
    </svg>
  );
}

export default function KronosTab({ calc, transitoMap }) {
  const [leadTimes, setLeadTimes] = useState({});      // { proveedor: { lead_time_dias, activo } }
  const [editando, setEditando] = useState(null);       // proveedor que se está editando
  const [editVal, setEditVal] = useState('');
  const [editNotas, setEditNotas] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [soloUrgentes, setSoloUrgentes] = useState(false);
  const [sortCol, setSortCol] = useState('urgencia');
  const [sortDir, setSortDir] = useState('asc');
  const [msg, setMsg] = useState(null);
  const [consumoHistorico, setConsumoHistorico] = useState({}); // { codigo: consumoMensualReal }
  const [cargandoHistorial, setCargandoHistorial] = useState(true);
  const [periodos, setPeriodos] = useState([]);

  // ── Cargar lead times y consumo histórico ────────────────────────────────
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
      // Traer períodos disponibles
      const { data: ps } = await supabase
        .from('neo_items_facturados')
        .select('periodo_reporte')
        .not('periodo_reporte', 'is', null)
        .limit(1000);
      const periodosUnicos = [...new Set((ps || []).map(r => r.periodo_reporte))].sort();
      setPeriodos(periodosUnicos);

      if (!periodosUnicos.length) { setCargandoHistorial(false); return; }

      // Traer todos los items: solo codigo_interno, cantidad_facturada, cantidad_devuelta, fecha
      let offset = 0;
      const BATCH = 1000;
      const acum = {}; // { codigo: { totalUnidades, mesesSet } }

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
          const mes = r.fecha ? r.fecha.slice(0, 7) : null; // YYYY-MM
          if (!acum[cod]) acum[cod] = { totalUnidades: 0, meses: new Set() };
          acum[cod].totalUnidades += qty;
          if (mes) acum[cod].meses.add(mes);
        });

        if (data.length < BATCH) break;
        offset += BATCH;
      }

      // Calcular promedio mensual real
      const consumo = {};
      Object.entries(acum).forEach(([cod, v]) => {
        const nMeses = v.meses.size || 1;
        consumo[cod] = v.totalUnidades / nMeses;
      });
      setConsumoHistorico(consumo);
    } catch (e) { console.error(e); }
    setCargandoHistorial(false);
  }

  // ── Guardar lead time ─────────────────────────────────────────────────────
  async function guardarLeadTime(proveedor) {
    const dias = parseInt(editVal) || 30;
    setGuardando(true);
    try {
      await supabase.from('proveedores_leadtime').upsert({
        proveedor,
        lead_time_dias: dias,
        activo: leadTimes[proveedor]?.activo ?? true,
        notas: editNotas,
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
        proveedor,
        lead_time_dias: actual?.lead_time_dias || 30,
        activo: nuevoActivo,
        notas: actual?.notas || '',
      }, { onConflict: 'proveedor' });
      setLeadTimes(prev => ({ ...prev, [proveedor]: { ...prev[proveedor], proveedor, activo: nuevoActivo } }));
    } catch (e) { mostrarMsg('Error al actualizar', 'err'); }
  }

  function mostrarMsg(t, tipo = 'ok') {
    setMsg({ t, tipo });
    setTimeout(() => setMsg(null), 3500);
  }

  // ── Calcular proyecciones ─────────────────────────────────────────────────
  const proyecciones = useMemo(() => {
    if (!calc || !calc.length) return [];
    const hoy = new Date();

    return calc.map(item => {
      const cod = (item.codigo || '').toString().trim();
      const prov = (item.ultimo_proveedor || '').trim();
      const existencias = parseFloat(item.existencias) || 0;
      const enTransito = transitoMap?.[cod] || 0;
      const stockTotal = existencias + enTransito;

      // Consumo: real si hay historial, fallback a promedio_mensual de NEO
      const consumoReal = consumoHistorico[cod];
      const consumoNeo = parseFloat(item.promedio_mensual) || 0;
      const consumoMensual = (consumoReal !== undefined && consumoReal > 0) ? consumoReal : consumoNeo;
      const fuenteConsumo = (consumoReal !== undefined && consumoReal > 0) ? 'real' : (consumoNeo > 0 ? 'neo' : null);

      if (!consumoMensual || consumoMensual <= 0) {
        return { ...item, _consumoMensual: 0, _fuenteConsumo: null, _mesesCobertura: null, _diasQuiebre: null, _fechaQuiebre: null, _fechaPedido: null, _urgencia: urgencia(null, 0), _leadTime: leadTimes[prov]?.lead_time_dias || 30 };
      }

      const lt = leadTimes[prov];
      const leadTimeDias = lt?.lead_time_dias || 30;
      const activo = lt?.activo ?? true;

      const mesesCobertura = stockTotal / consumoMensual;
      const diasQuiebre = Math.round(mesesCobertura * 30);
      const fechaQuiebre = new Date(hoy.getTime() + diasQuiebre * 86400000);
      const fechaPedido = new Date(fechaQuiebre.getTime() - leadTimeDias * 86400000);
      const diasParaPedir = Math.round((fechaPedido.getTime() - hoy.getTime()) / 86400000);
      const urg = urgencia(diasParaPedir, leadTimeDias);

      return {
        ...item,
        _consumoMensual: consumoMensual,
        _fuenteConsumo: fuenteConsumo,
        _mesesCobertura: mesesCobertura,
        _diasQuiebre: diasQuiebre,
        _fechaQuiebre: fechaQuiebre.toISOString().slice(0, 10),
        _fechaPedido: fechaPedido.toISOString().slice(0, 10),
        _diasParaPedir: diasParaPedir,
        _leadTime: leadTimeDias,
        _activo: activo,
        _urgencia: urg,
      };
    }).filter(i => i._activo !== false || !(leadTimes[(i.ultimo_proveedor || '').trim()]));
  }, [calc, consumoHistorico, leadTimes, transitoMap]);

  // ── Filtrar y ordenar ─────────────────────────────────────────────────────
  const filtrados = useMemo(() => {
    let res = proyecciones;
    if (soloUrgentes) res = res.filter(i => i._urgencia.orden <= 2);
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase();
      res = res.filter(i => [i.codigo, i.nombre, i.ultimo_proveedor, i.categoria].some(v => (v || '').toLowerCase().includes(q)));
    }
    res = [...res].sort((a, b) => {
      let va, vb;
      if (sortCol === 'urgencia') { va = a._urgencia.orden; vb = b._urgencia.orden; }
      else if (sortCol === 'cobertura') { va = a._mesesCobertura ?? 999; vb = b._mesesCobertura ?? 999; }
      else if (sortCol === 'quiebre') { va = a._diasQuiebre ?? 9999; vb = b._diasQuiebre ?? 9999; }
      else if (sortCol === 'pedido') { va = a._diasParaPedir ?? 9999; vb = b._diasParaPedir ?? 9999; }
      else if (sortCol === 'consumo') { va = a._consumoMensual; vb = b._consumoMensual; }
      else if (sortCol === 'nombre') { va = a.nombre || ''; vb = b.nombre || ''; }
      else if (sortCol === 'proveedor') { va = a.ultimo_proveedor || ''; vb = b.ultimo_proveedor || ''; }
      else { va = 0; vb = 0; }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return res;
  }, [proyecciones, soloUrgentes, busqueda, sortCol, sortDir]);

  // ── Stats ─────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total = proyecciones.filter(i => i._consumoMensual > 0).length;
    const rojos = proyecciones.filter(i => i._urgencia.orden <= 1).length;
    const amarillos = proyecciones.filter(i => i._urgencia.orden === 2).length;
    const naranjas = proyecciones.filter(i => i._urgencia.orden === 3).length;
    const verdes = proyecciones.filter(i => i._urgencia.orden === 4).length;
    const sinDatos = proyecciones.filter(i => !i._consumoMensual).length;
    return { total, rojos, amarillos, naranjas, verdes, sinDatos };
  }, [proyecciones]);

  function thBtn(col, label) {
    const activo = sortCol === col;
    return (
      <th
        onClick={() => { if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortCol(col); setSortDir('asc'); } }}
        style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', padding: '8px 10px', fontSize: '0.72rem', color: activo ? 'var(--teal)' : '#666', borderBottom: '2px solid #eee', background: activo ? '#f0f8ff' : 'transparent' }}
      >
        {label} {activo ? (sortDir === 'asc' ? '↑' : '↓') : ''}
      </th>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div>
      {msg && <div className={msg.tipo === 'ok' ? 'success-banner' : 'error-banner'} style={{ marginBottom: 12 }}>{msg.tipo === 'ok' ? '✅' : '❌'} {msg.t}</div>}

      {/* KPIs */}
      <div className="kpi-grid kpi-grid-4" style={{ marginBottom: 16 }}>
        {[
          ['🔴 Pedir YA', stats.rojos, '#E53E3E'],
          ['🟡 Urgente', stats.amarillos, '#D69E2E'],
          ['🟠 Pronto', stats.naranjas, '#DD6B20'],
          ['🟢 OK', stats.verdes, '#38A169'],
        ].map(([l, v, c]) => (
          <div key={l} className="kpi-card" style={{ borderTop: `3px solid ${c}` }}>
            <div className="kpi-label">{l}</div>
            <div className="kpi-value" style={{ color: c }}>{v}</div>
          </div>
        ))}
      </div>

      {/* Info historial */}
      <div style={{ background: '#f7f9fc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: '0.78rem', color: '#555', display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {cargandoHistorial ? (
          <span>⏳ Calculando consumo histórico...</span>
        ) : (
          <>
            <span>📊 <strong>{Object.keys(consumoHistorico).length}</strong> productos con consumo real</span>
            <span>📅 <strong>{periodos.length}</strong> períodos en historial</span>
            <span style={{ color: '#999' }}>Consumo real tiene prioridad sobre promedio NEO cuando hay historial</span>
          </>
        )}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          className="module-input"
          style={{ flex: 1, minWidth: 220 }}
          placeholder="🔍 Buscar por código, nombre, proveedor..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
        />
        <button
          onClick={() => setSoloUrgentes(v => !v)}
          style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, background: soloUrgentes ? '#E53E3E' : 'white', color: soloUrgentes ? 'white' : '#E53E3E', borderColor: '#E53E3E' }}
        >
          {soloUrgentes ? '✕ Solo urgentes' : '🔴 Solo urgentes'}
        </button>
        <span style={{ fontSize: '0.78rem', color: '#999' }}>{filtrados.length} productos</span>
      </div>

      {/* Tabla */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
          <thead>
            <tr style={{ background: '#f7f9fc' }}>
              {thBtn('urgencia', 'Estado')}
              <th style={{ padding: '8px 10px', fontSize: '0.72rem', color: '#666', borderBottom: '2px solid #eee' }}>Código</th>
              {thBtn('nombre', 'Nombre')}
              {thBtn('proveedor', 'Proveedor')}
              <th style={{ padding: '8px 10px', fontSize: '0.72rem', color: '#666', borderBottom: '2px solid #eee' }}>Exist.</th>
              <th style={{ padding: '8px 10px', fontSize: '0.72rem', color: '#666', borderBottom: '2px solid #eee' }}>Tránsito</th>
              {thBtn('consumo', 'Consumo/mes')}
              {thBtn('cobertura', 'Cobertura')}
              {thBtn('quiebre', 'Quiebre stock')}
              {thBtn('pedido', 'Pedir antes de')}
              <th style={{ padding: '8px 10px', fontSize: '0.72rem', color: '#666', borderBottom: '2px solid #eee' }}>Lead time</th>
              <th style={{ padding: '8px 10px', fontSize: '0.72rem', color: '#666', borderBottom: '2px solid #eee' }}>Proyección</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((item, idx) => {
              const cod = (item.codigo || '').toString().trim();
              const prov = (item.ultimo_proveedor || '').trim();
              const lt = leadTimes[prov];
              const estaEditando = editando === prov;
              const activo = lt?.activo ?? true;

              return (
                <tr key={cod + idx} style={{ borderBottom: '1px solid #f0f0f0', background: idx % 2 === 0 ? 'white' : '#fafafa', opacity: activo ? 1 : 0.45 }}>
                  {/* Estado */}
                  <td style={{ padding: '7px 10px' }}>
                    <span style={{ fontWeight: 700, color: item._urgencia.color, fontSize: '0.78rem', whiteSpace: 'nowrap' }}>{item._urgencia.label}</span>
                  </td>
                  {/* Código */}
                  <td style={{ padding: '7px 10px', color: 'var(--orange)', fontFamily: 'monospace', fontSize: '0.75rem' }}>{item.codigo}</td>
                  {/* Nombre */}
                  <td style={{ padding: '7px 10px', maxWidth: 220 }}>
                    <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.nombre}</div>
                    <div style={{ fontSize: '0.68rem', color: '#999' }}>{item.categoria}</div>
                  </td>
                  {/* Proveedor + lead time editable */}
                  <td style={{ padding: '7px 10px', minWidth: 160 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.75rem', color: '#444' }}>{prov || '—'}</span>
                      <button
                        onClick={() => toggleActivo(prov)}
                        title={activo ? 'Pausar proveedor' : 'Activar proveedor'}
                        style={{ fontSize: 10, padding: '1px 5px', borderRadius: 4, border: '1px solid #ddd', background: activo ? '#e8f5e9' : '#fff3e0', cursor: 'pointer', color: activo ? '#38A169' : '#DD6B20' }}
                      >
                        {activo ? 'Activo' : 'Pausado'}
                      </button>
                    </div>
                    {estaEditando ? (
                      <div style={{ display: 'flex', gap: 4, marginTop: 4, alignItems: 'center' }}>
                        <input type="number" min={1} value={editVal} onChange={e => setEditVal(e.target.value)}
                          style={{ width: 56, padding: '3px 6px', border: '1px solid var(--orange)', borderRadius: 4, fontSize: '0.75rem' }} />
                        <span style={{ fontSize: '0.7rem', color: '#888' }}>días</span>
                        <button onClick={() => guardarLeadTime(prov)} disabled={guardando}
                          style={{ padding: '3px 8px', background: 'var(--orange)', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.72rem' }}>
                          {guardando ? '...' : '✓'}
                        </button>
                        <button onClick={() => setEditando(null)}
                          style={{ padding: '3px 6px', background: '#eee', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.72rem' }}>✕</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setEditando(prov); setEditVal(lt?.lead_time_dias || 30); setEditNotas(lt?.notas || ''); }}
                        style={{ marginTop: 2, fontSize: '0.68rem', color: 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
                      >
                        ✏️ {lt?.lead_time_dias ? `${lt.lead_time_dias}d` : 'Definir lead time'}
                      </button>
                    )}
                  </td>
                  {/* Existencias */}
                  <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 600 }}>{parseFloat(item.existencias) || 0}</td>
                  {/* Tránsito */}
                  <td style={{ padding: '7px 10px', textAlign: 'right', color: '#DD6B20' }}>{(transitoMap?.[cod] || 0) > 0 ? transitoMap[cod] : '—'}</td>
                  {/* Consumo/mes */}
                  <td style={{ padding: '7px 10px', textAlign: 'right' }}>
                    {item._consumoMensual > 0 ? (
                      <span>
                        {item._consumoMensual.toFixed(1)}
                        <span style={{ fontSize: '0.65rem', color: item._fuenteConsumo === 'real' ? '#38A169' : '#999', marginLeft: 3 }}>
                          {item._fuenteConsumo === 'real' ? '●' : '○'}
                        </span>
                      </span>
                    ) : <span style={{ color: '#ccc' }}>—</span>}
                  </td>
                  {/* Cobertura */}
                  <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 600, color: item._mesesCobertura !== null ? (item._mesesCobertura < 1 ? '#E53E3E' : item._mesesCobertura < 2 ? '#D69E2E' : '#38A169') : '#ccc' }}>
                    {fmtMeses(item._mesesCobertura)}
                  </td>
                  {/* Fecha quiebre */}
                  <td style={{ padding: '7px 10px', textAlign: 'right', fontSize: '0.75rem', color: item._diasQuiebre !== null && item._diasQuiebre < 30 ? '#E53E3E' : '#555' }}>
                    {item._fechaQuiebre ? fmtFecha(item._fechaQuiebre) : '—'}
                    {item._diasQuiebre !== null && <div style={{ fontSize: '0.65rem', color: '#aaa' }}>en {item._diasQuiebre}d</div>}
                  </td>
                  {/* Fecha límite pedido */}
                  <td style={{ padding: '7px 10px', textAlign: 'right', fontSize: '0.75rem' }}>
                    <span style={{ fontWeight: 700, color: item._urgencia.color }}>{item._fechaPedido ? fmtFecha(item._fechaPedido) : '—'}</span>
                    {item._diasParaPedir !== null && item._diasParaPedir !== undefined && (
                      <div style={{ fontSize: '0.65rem', color: item._diasParaPedir < 0 ? '#E53E3E' : '#aaa' }}>
                        {item._diasParaPedir < 0 ? `hace ${Math.abs(item._diasParaPedir)}d` : `en ${item._diasParaPedir}d`}
                      </div>
                    )}
                  </td>
                  {/* Lead time */}
                  <td style={{ padding: '7px 10px', textAlign: 'right', color: '#888', fontSize: '0.75rem' }}>{item._leadTime}d</td>
                  {/* Mini gráfico */}
                  <td style={{ padding: '7px 10px' }}>
                    <MiniGrafico
                      existencias={parseFloat(item.existencias) || 0}
                      consumoMensual={item._consumoMensual}
                      leadTimeDias={item._leadTime}
                      diasQuiebre={item._diasQuiebre}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtrados.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>
            {soloUrgentes ? 'No hay productos urgentes 🎉' : 'No hay productos que mostrar.'}
          </div>
        )}
      </div>

      {/* Leyenda consumo */}
      <div style={{ marginTop: 12, fontSize: '0.7rem', color: '#aaa', display: 'flex', gap: 16 }}>
        <span>● Verde = consumo real (historial facturas)</span>
        <span>○ Gris = promedio NEO (fallback)</span>
        <span>— Línea roja en gráfico = quiebre stock</span>
        <span>— Línea amarilla = fecha límite pedido</span>
      </div>
    </div>
  );
}
