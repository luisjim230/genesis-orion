'use client';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import * as XLSX from 'xlsx';

// ─── Estilos ───────────────────────────────────────────────────────────────
const S = {
  page:    { background:'#0f1115', minHeight:'100vh', padding:'28px', fontFamily:'DM Sans, sans-serif', color:'#c9d1e0' },
  title:   { fontSize:'1.5em', fontWeight:700, color:'#fff', margin:0 },
  sub:     { fontSize:'0.8em', color:'#5a6a80', marginTop:'4px', marginBottom:'20px' },
  card:    { background:'#161920', border:'1px solid #1e2330', borderRadius:'12px', padding:'20px', marginBottom:'16px' },
  tabBar:  { display:'flex', gap:'4px', marginBottom:'20px', borderBottom:'1px solid #1e2330' },
  tab:     (a) => ({ padding:'9px 16px', cursor:'pointer', border:'none', background:'none', color:a?'#c8a84b':'#5a6a80', fontWeight:a?700:400, borderBottom:a?'2px solid #c8a84b':'2px solid transparent', fontSize:'0.86em', fontFamily:'inherit' }),
  input:   { background:'#0f1115', border:'1px solid #1e2330', borderRadius:'8px', padding:'8px 12px', color:'#c9d1e0', fontSize:'0.87em', fontFamily:'inherit' },
  btn:     (c='#c8a84b') => ({ background:c, color:'#fff', border:'none', borderRadius:'8px', padding:'9px 18px', cursor:'pointer', fontSize:'0.85em', fontWeight:600, fontFamily:'inherit', whiteSpace:'nowrap' }),
  btnSm:   (c='#252a35') => ({ background:c, color:'#c9d1e0', border:'1px solid #1e2330', borderRadius:'6px', padding:'5px 12px', cursor:'pointer', fontSize:'0.78em', fontFamily:'inherit' }),
  kpi:     (c='#c8a84b') => ({ background:'#161920', border:'1px solid '+c+'33', borderTop:'3px solid '+c, borderRadius:'10px', padding:'12px 16px' }),
  divider: { border:'none', borderTop:'1px solid #1e2330', margin:'16px 0' },
  th:      { textAlign:'left', padding:'8px 10px', background:'#0d0f13', color:'#5a6a80', fontSize:'0.72em', textTransform:'uppercase', letterSpacing:'0.05em', borderBottom:'2px solid #1e2330', whiteSpace:'nowrap' },
  td:      { padding:'7px 10px', borderBottom:'1px solid #131720', fontSize:'0.82em', verticalAlign:'middle' },
};

// ─── Colores de alertas (igual al Streamlit) ─────────────────────────────
const ALERTAS = {
  '🟢 Óptimo':           { bg:'#1a2d1a', color:'#68d391', border:'#68d39133' },
  '🔴 Bajo stock':       { bg:'#2d1a1a', color:'#fc8181', border:'#fc818133' },
  '🔴 Bajo stock 🚢':   { bg:'#2d1a1a', color:'#fc8181', border:'#fc818133' },
  '🔵 Sobrestock':       { bg:'#1a1a2d', color:'#63b3ed', border:'#63b3ed33' },
  '🟡 Prestar atención': { bg:'#2d2a1a', color:'#f6e05e', border:'#f6e05e33' },
  '🟠 En tránsito':      { bg:'#2d1f1a', color:'#f6ad55', border:'#f6ad5533' },
};

function alertaBadge(alerta) {
  const s = ALERTAS[alerta] || { bg:'#1a1a1a', color:'#888', border:'#33333333' };
  return (
    <span style={{ background:s.bg, color:s.color, border:'1px solid '+s.border,
      borderRadius:'20px', padding:'2px 8px', fontSize:'0.75em', fontWeight:600, whiteSpace:'nowrap' }}>
      {alerta || '—'}
    </span>
  );
}

// ─── Lógica de alertas (copia exacta del Python) ─────────────────────────
function calcularAlertas(items, transitoMap, dias) {
  return items.map(item => {
    const existencias   = parseFloat(item.existencias || item.Existencias || 0) || 0;
    const promedioMens  = parseFloat(item.promedio_mensual || item['Promedio mensual'] || 0) || 0;
    const codigoRaw     = (item.codigo || item['Código'] || '').toString().trim();
    const transito      = transitoMap[codigoRaw] || 0;

    const sugerencia    = (promedioMens / 30) * dias;
    const aBruto        = Math.max(sugerencia - existencias, 0);
    const aNeto         = Math.max(aBruto - transito, 0);
    const cantComprar   = Math.ceil(aNeto);

    const existe        = existencias > 0;
    const promedio      = promedioMens > 0;
    const comprar       = cantComprar > 0;
    const sobre         = existencias > sugerencia;
    const enTransito    = transito > 0;
    const transitoCubre = aBruto > 0 && transito >= aBruto;

    let alerta = '🟢 Óptimo';
    if (!existe && !promedio)                             alerta = '🟡 Prestar atención';
    else if (!existe && promedio && transitoCubre)        alerta = '🟠 En tránsito';
    else if (!existe && promedio && enTransito && comprar) alerta = '🔴 Bajo stock 🚢';
    else if (!existe && promedio)                          alerta = '🔴 Bajo stock';
    else if (comprar && enTransito)                        alerta = '🔴 Bajo stock 🚢';
    else if (comprar)                                      alerta = '🔴 Bajo stock';
    else if (sobre)                                        alerta = '🔵 Sobrestock';

    return {
      ...item,
      _alerta:     alerta,
      _sugerencia: sugerencia,
      _cantComprar: cantComprar,
      _transito:   transito,
    };
  });
}

export default function Inventario() {
  const [tab, setTab]         = useState(0);
  const [datos, setDatos]     = useState([]);
  const [calc, setCalc]       = useState([]);
  const [transito, setTransito] = useState({});
  const [dias, setDias]       = useState(30);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [filtroAlerta, setFiltroAlerta] = useState('Todos');
  const [fechaCarga, setFechaCarga] = useState(null);
  const [seleccionados, setSeleccionados] = useState(new Set());
  const [msg, setMsg]         = useState(null);

  const mostrarMsg = (t, tipo='ok') => { setMsg({t,tipo}); setTimeout(()=>setMsg(null),4000); };

  // ─── Cargar datos ────────────────────────────────────────────────
  useEffect(() => { cargarDatos(); }, []);

  async function cargarDatos() {
    setLoading(true);
    // Obtener última fecha de carga
    const { data: fechaData } = await supabase
      .from('neo_minimos_maximos')
      .select('fecha_carga')
      .order('fecha_carga', { ascending: false })
      .limit(1);

    if (!fechaData?.length) { setLoading(false); return; }
    const fc = fechaData[0].fecha_carga;
    setFechaCarga(fc);

    // Cargar datos paginados
    let todos = [], offset = 0;
    while (true) {
      const { data } = await supabase
        .from('neo_minimos_maximos')
        .select('*')
        .eq('fecha_carga', fc)
        .range(offset, offset + 999);
      if (!data?.length) break;
      todos = todos.concat(data);
      if (data.length < 1000) break;
      offset += 1000;
    }
    setDatos(todos);

    // Cargar tránsito
    const { data: transitoData } = await supabase
      .from('ordenes_compra_items')
      .select('codigo, cantidad_ordenada, cantidad_recibida, estado_item')
      .in('estado_item', ['pendiente', 'parcial']);

    const tMap = {};
    (transitoData || []).forEach(item => {
      const cod = (item.codigo || '').toString().trim();
      const pen = Math.max((parseFloat(item.cantidad_ordenada)||0) - (parseFloat(item.cantidad_recibida)||0), 0);
      if (cod && pen > 0) tMap[cod] = (tMap[cod] || 0) + pen;
    });
    setTransito(tMap);
    setLoading(false);
  }

  // ─── Recalcular cuando cambian datos o días ───────────────────────
  useEffect(() => {
    if (datos.length) setCalc(calcularAlertas(datos, transito, dias));
  }, [datos, transito, dias]);

  // ─── Filtrar tabla ───────────────────────────────────────────────
  const calcFiltrado = calc.filter(item => {
    const txt = busqueda.toLowerCase();
    const matchTexto = !txt || [
      item.codigo, item.nombre, item.ultimo_proveedor, item._alerta
    ].some(v => (v||'').toLowerCase().includes(txt));
    const matchAlerta = filtroAlerta === 'Todos' || item._alerta === filtroAlerta;
    return matchTexto && matchAlerta;
  });

  // ─── Stats de alertas ────────────────────────────────────────────
  const stats = calc.reduce((acc, i) => {
    acc[i._alerta] = (acc[i._alerta] || 0) + 1; return acc;
  }, {});

  // ─── Exportar Excel agrupado por proveedor (con alertas) ─────────
  async function exportarExcel() {
    const XLSX_mod = await import('xlsx');
    const wb = XLSX_mod.utils.book_new();

    // Columnas en orden igual al Streamlit
    const cols = ['_alerta','codigo','nombre','promedio_mensual','existencias','_transito','_cantComprar','ultimo_costo','ultima_compra','ultimo_proveedor'];
    const headers = ['Alerta','Código','Nombre','Promedio mensual','Existencias','🚢 En tránsito','Cantidad a comprar','Último costo','Fecha última compra','Último proveedor'];

    // Agrupar por proveedor
    const porProveedor = {};
    calcFiltrado.forEach(item => {
      const prov = (item.ultimo_proveedor || 'Sin proveedor').trim();
      if (!porProveedor[prov]) porProveedor[prov] = [];
      porProveedor[prov].push(item);
    });

    const rows = [headers];
    Object.keys(porProveedor).sort().forEach((prov, idx) => {
      // Separador de proveedor
      if (idx > 0) { for (let i=0; i<4; i++) rows.push(new Array(headers.length).fill('')); }
      rows.push([`── ${prov} ──`, ...new Array(headers.length-1).fill('')]);
      porProveedor[prov].forEach(item => {
        rows.push(cols.map(c => {
          if (c === '_alerta') return item._alerta;
          if (c === '_transito') return item._transito > 0 ? `🚢 ${item._transito}` : '–';
          if (c === '_cantComprar') return item._cantComprar;
          return item[c] ?? '';
        }));
      });
    });

    const ws = XLSX_mod.utils.aoa_to_sheet(rows);
    XLSX_mod.utils.book_append_sheet(wb, ws, 'Inventario por Proveedor');

    // Hoja resumen
    const resumenRows = [['Proveedor','Productos','A comprar']];
    Object.keys(porProveedor).sort().forEach(prov => {
      const items = porProveedor[prov];
      resumenRows.push([prov, items.length, items.reduce((s,i)=>s+i._cantComprar,0)]);
    });
    const ws2 = XLSX_mod.utils.aoa_to_sheet(resumenRows);
    XLSX_mod.utils.book_append_sheet(wb, ws2, 'Resumen por Proveedor');

    const fecha = new Date().toISOString().slice(0,10);
    XLSX_mod.writeFile(wb, `Inventario_Alertas_${fecha}.xlsx`);
    mostrarMsg('Excel descargado con alertas y agrupado por proveedor.');
  }

  // ─── Formateo ────────────────────────────────────────────────────
  const num = (v) => {
    const n = parseFloat(v);
    return isNaN(n) ? '—' : n.toLocaleString('es-CR', {minimumFractionDigits:2, maximumFractionDigits:2});
  };
  const fmtFecha = (v) => v ? String(v).slice(0,10) : '—';

  // ─── Total tránsito banner ───────────────────────────────────────
  const totalCodTransito = Object.keys(transito).length;
  const totalUnidTransito = Object.values(transito).reduce((s,v)=>s+v,0);

  const alertasUnicas = ['Todos', ...Object.keys(ALERTAS)];

  return (
    <div style={S.page}>
      <div style={S.title}>🪐 Saturno – Inventario</div>
      <div style={S.sub}>El Análisis de Stock · Depósito Jiménez</div>

      {msg && (
        <div style={{background:msg.tipo==='ok'?'#68d39122':'#fc818122',border:'1px solid '+(msg.tipo==='ok'?'#68d391':'#fc8181')+'55',borderRadius:'8px',padding:'10px 16px',marginBottom:'16px',fontSize:'0.85em',color:msg.tipo==='ok'?'#68d391':'#fc8181'}}>
          {msg.tipo==='ok'?'✅':'❌'} {msg.t}
        </div>
      )}

      {loading ? (
        <div style={{textAlign:'center',padding:'60px',color:'#5a6a80'}}>Cargando inventario desde Supabase...</div>
      ) : !datos.length ? (
        <div style={{...S.card,textAlign:'center',color:'#5a6a80',padding:'40px'}}>
          📭 No hay datos de inventario. Subí el reporte <strong style={{color:'#c8a84b'}}>Lista de mínimos y máximos</strong> en Reportes NEO.
        </div>
      ) : (
        <>
          {/* Banner de última carga */}
          {fechaCarga && (
            <div style={{fontSize:'0.78em',color:'#5a6a80',marginBottom:'12px'}}>
              ☁️ Datos desde Reportes NEO · Última carga: <strong style={{color:'#c8a84b'}}>{fechaCarga?.slice(0,16).replace('T',' ')}</strong>
            </div>
          )}

          {/* Banner de tránsito */}
          {totalCodTransito > 0 && (
            <div style={{background:'#1a2030',border:'1px solid #2a3a55',borderRadius:'8px',padding:'10px 16px',marginBottom:'16px',fontSize:'0.83em',color:'#63b3ed'}}>
              🚢 <strong>{totalCodTransito} productos en tránsito</strong> ({totalUnidTransito.toLocaleString()} unidades en camino).
              La columna <strong>🚢 En tránsito</strong> muestra el pendiente — <strong>Cantidad a comprar</strong> ya lo descuenta automáticamente.
            </div>
          )}

          {/* KPIs de alertas */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:'8px',marginBottom:'20px'}}>
            {[
              ['Total', calc.length, '#5a6a80'],
              ['🔴 Bajo stock', (stats['🔴 Bajo stock']||0)+(stats['🔴 Bajo stock 🚢']||0), '#fc8181'],
              ['🟠 En tránsito', stats['🟠 En tránsito']||0, '#f6ad55'],
              ['🟡 Atención', stats['🟡 Prestar atención']||0, '#f6e05e'],
              ['🟢 Óptimo', stats['🟢 Óptimo']||0, '#68d391'],
              ['🔵 Sobrestock', stats['🔵 Sobrestock']||0, '#63b3ed'],
            ].map(([l,v,c])=>(
              <div key={l} style={S.kpi(c)}>
                <div style={{fontSize:'0.68em',color:c,textTransform:'uppercase'}}>{l}</div>
                <div style={{fontSize:'1.4em',fontWeight:700,color:'#fff',marginTop:'2px'}}>{v}</div>
              </div>
            ))}
          </div>

          {/* Controles */}
          <div style={{display:'flex',gap:'12px',alignItems:'center',flexWrap:'wrap',marginBottom:'16px'}}>
            <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
              <label style={{fontSize:'0.8em',color:'#5a6a80',whiteSpace:'nowrap'}}>⚔️ Días a cubrir:</label>
              <input type="number" min="1" max="90" value={dias}
                style={{...S.input,width:'70px'}}
                onChange={e=>{setDias(parseInt(e.target.value)||30);}}/>
            </div>
            <input style={{...S.input,width:'260px'}} placeholder="🔍 Buscar por código, nombre, proveedor, alerta..."
              value={busqueda} onChange={e=>setBusqueda(e.target.value)}/>
            <select style={{...S.input}} value={filtroAlerta} onChange={e=>setFiltroAlerta(e.target.value)}>
              {alertasUnicas.map(a=><option key={a}>{a}</option>)}
            </select>
            <button style={S.btn()} onClick={()=>setCalc(calcularAlertas(datos,transito,dias))}>⚡ Recalcular</button>
            <button style={S.btn('#2a5a3a')} onClick={exportarExcel}>📊 Exportar Excel</button>
          </div>

          <div style={{fontSize:'0.78em',color:'#5a6a80',marginBottom:'10px'}}>
            Mostrando <strong style={{color:'#fff'}}>{calcFiltrado.length.toLocaleString()}</strong> de {calc.length.toLocaleString()} productos
          </div>

          {/* Tabla */}
          <div style={{overflowX:'auto',borderRadius:'10px',border:'1px solid #1e2330'}}>
            <table style={{...S.table, width:'100%', borderCollapse:'collapse'}}>
              <thead>
                <tr>
                  {['Alerta','Código','Nombre','Prom. mensual','Existencias','🚢 Tránsito','Cant. a comprar','Último costo','Fecha compra','Proveedor'].map(h=>(
                    <th key={h} style={S.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {calcFiltrado.slice(0,500).map((item,i)=>(
                  <tr key={i} style={{background: i%2===0?'#161920':'#131720'}}>
                    <td style={S.td}>{alertaBadge(item._alerta)}</td>
                    <td style={{...S.td,fontFamily:'monospace',fontSize:'0.78em',color:'#c8a84b'}}>{item.codigo||'—'}</td>
                    <td style={{...S.td,maxWidth:'220px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.nombre||'—'}</td>
                    <td style={{...S.td,textAlign:'right'}}>{num(item.promedio_mensual)}</td>
                    <td style={{...S.td,textAlign:'right',color: parseFloat(item.existencias)<=0?'#fc8181':'#c9d1e0'}}>{num(item.existencias)}</td>
                    <td style={{...S.td,textAlign:'center',color:'#63b3ed'}}>{item._transito>0?`🚢 ${item._transito}`:'–'}</td>
                    <td style={{...S.td,textAlign:'right',fontWeight:item._cantComprar>0?700:400,color:item._cantComprar>0?'#fc8181':'#5a6a80'}}>{item._cantComprar||'–'}</td>
                    <td style={{...S.td,textAlign:'right'}}>{num(item.ultimo_costo)}</td>
                    <td style={{...S.td,fontSize:'0.76em'}}>{fmtFecha(item.ultima_compra)}</td>
                    <td style={{...S.td,maxWidth:'140px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontSize:'0.78em'}}>{item.ultimo_proveedor||'—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {calcFiltrado.length > 500 && (
              <div style={{padding:'12px',textAlign:'center',color:'#5a6a80',fontSize:'0.8em',background:'#0f1115'}}>
                Mostrando primeros 500 resultados. Usá los filtros para acotar la búsqueda.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
