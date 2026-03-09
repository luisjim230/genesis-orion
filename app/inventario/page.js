'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

const S = {
  page:    { background:'#0f1115', minHeight:'100vh', padding:'28px', fontFamily:'DM Sans, sans-serif', color:'#c9d1e0' },
  title:   { fontSize:'1.5em', fontWeight:700, color:'#fff', margin:0 },
  sub:     { fontSize:'0.8em', color:'#5a6a80', marginTop:'4px', marginBottom:'20px' },
  card:    { background:'#161920', border:'1px solid #1e2330', borderRadius:'12px', padding:'20px', marginBottom:'16px' },
  tabBar:  { display:'flex', gap:'4px', marginBottom:'20px', borderBottom:'1px solid #1e2330', flexWrap:'wrap' },
  tab:     (a) => ({ padding:'9px 16px', cursor:'pointer', border:'none', background:'none', color:a?'#c8a84b':'#5a6a80', fontWeight:a?700:400, borderBottom:a?'2px solid #c8a84b':'2px solid transparent', fontSize:'0.86em', fontFamily:'inherit', whiteSpace:'nowrap' }),
  input:   { background:'#0f1115', border:'1px solid #1e2330', borderRadius:'8px', padding:'8px 12px', color:'#c9d1e0', fontSize:'0.87em', fontFamily:'inherit' },
  btn:     (c='#c8a84b') => ({ background:c, color:'#fff', border:'none', borderRadius:'8px', padding:'8px 16px', cursor:'pointer', fontSize:'0.84em', fontWeight:600, fontFamily:'inherit', whiteSpace:'nowrap' }),
  btnSm:   (c='#252a35') => ({ background:c, color:'#c9d1e0', border:'1px solid #1e2330', borderRadius:'6px', padding:'5px 12px', cursor:'pointer', fontSize:'0.78em', fontFamily:'inherit' }),
  kpi:     (c='#c8a84b') => ({ background:'#161920', border:'1px solid '+c+'33', borderTop:'3px solid '+c, borderRadius:'10px', padding:'12px 16px' }),
  divider: { border:'none', borderTop:'1px solid #1e2330', margin:'16px 0' },
  th:      { textAlign:'left', padding:'8px 10px', background:'#0d0f13', color:'#5a6a80', fontSize:'0.72em', textTransform:'uppercase', letterSpacing:'0.05em', borderBottom:'2px solid #1e2330', whiteSpace:'nowrap' },
  td:      { padding:'7px 10px', borderBottom:'1px solid #131720', fontSize:'0.82em', verticalAlign:'middle' },
};

const ALERTAS_STYLE = {
  '🟢 Óptimo':           { bg:'#1a2d1a', color:'#68d391' },
  '🔴 Bajo stock':       { bg:'#2d1a1a', color:'#fc8181' },
  '🔴 Bajo stock 🚢':   { bg:'#2d1a1a', color:'#fc8181' },
  '🔵 Sobrestock':       { bg:'#1a1a2d', color:'#63b3ed' },
  '🟡 Prestar atención': { bg:'#2d2a1a', color:'#f6e05e' },
  '🟠 En tránsito':      { bg:'#2d1f1a', color:'#f6ad55' },
};

function AlertaBadge({ alerta }) {
  const s = ALERTAS_STYLE[alerta] || { bg:'#1e2330', color:'#888' };
  return <span style={{ background:s.bg, color:s.color, borderRadius:'20px', padding:'2px 8px', fontSize:'0.75em', fontWeight:600, whiteSpace:'nowrap' }}>{alerta||'—'}</span>;
}

function calcularAlertas(items, transitoMap, dias) {
  return items.map(item => {
    const existencias  = parseFloat(item.existencias||0)||0;
    const promMensual  = parseFloat(item.promedio_mensual||0)||0;
    const codigo       = (item.codigo||'').toString().trim();
    const transito     = transitoMap[codigo]||0;
    const sugerencia   = (promMensual/30)*dias;
    const aBruto       = Math.max(sugerencia - existencias, 0);
    const aNeto        = Math.max(aBruto - transito, 0);
    const cantComprar  = Math.ceil(aNeto);
    const existe       = existencias > 0;
    const promedio     = promMensual > 0;
    const comprar      = cantComprar > 0;
    const sobre        = existencias > sugerencia;
    const enTransito   = transito > 0;
    const transitoCubre = aBruto > 0 && transito >= aBruto;
    let alerta = '🟢 Óptimo';
    if (!existe && !promedio)                              alerta = '🟡 Prestar atención';
    else if (!existe && promedio && transitoCubre)         alerta = '🟠 En tránsito';
    else if (!existe && promedio && enTransito && comprar) alerta = '🔴 Bajo stock 🚢';
    else if (!existe && promedio)                          alerta = '🔴 Bajo stock';
    else if (comprar && enTransito)                        alerta = '🔴 Bajo stock 🚢';
    else if (comprar)                                      alerta = '🔴 Bajo stock';
    else if (sobre)                                        alerta = '🔵 Sobrestock';
    return { ...item, _alerta:alerta, _sugerencia:sugerencia, _cantComprar:cantComprar, _transito:transito };
  });
}

const fmtN = (v,dec=2) => { const n=parseFloat(v); return isNaN(n)?'—':n.toLocaleString('es-CR',{minimumFractionDigits:dec,maximumFractionDigits:dec}); };
const fmtF = (v) => v?String(v).slice(0,10):'—';

export default function Inventario() {
  const [tab, setTab]         = useState(0);
  const [datos, setDatos]     = useState([]);
  const [calc, setCalc]       = useState([]);
  const [transitoMap, setTransitoMap] = useState({});
  const [dias, setDias]       = useState(30);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [filtroAlerta, setFiltroAlerta] = useState('Todos');
  const [fechaCarga, setFechaCarga] = useState(null);
  const [msg, setMsg]         = useState(null);

  // Orden en curso
  const [ordenItems, setOrdenItems] = useState([]); // [{codigo, nombre, cantidad, costo, descuento, proveedor, alerta}]
  const [seleccionados, setSeleccionados] = useState(new Set());
  const [nombreOrden, setNombreOrden] = useState('');
  const [proveedoresPausados, setProveedoresPausados] = useState(new Set());
  const [proveedoresSeleccionados, setProveedoresSeleccionados] = useState(new Set());

  const mostrarMsg = (t, tipo='ok') => { setMsg({t,tipo}); setTimeout(()=>setMsg(null),5000); };

  useEffect(() => { cargarDatos(); }, []);
  useEffect(() => { if (datos.length) setCalc(calcularAlertas(datos, transitoMap, dias)); }, [datos, transitoMap, dias]);

  async function cargarDatos() {
    setLoading(true);
    const { data: fechaData } = await supabase.from('neo_minimos_maximos').select('fecha_carga').order('fecha_carga',{ascending:false}).limit(1);
    if (!fechaData?.length) { setLoading(false); return; }
    const fc = fechaData[0].fecha_carga;
    setFechaCarga(fc);
    let todos=[], offset=0;
    while(true) {
      const {data} = await supabase.from('neo_minimos_maximos').select('*').eq('fecha_carga',fc).range(offset,offset+999);
      if (!data?.length) break;
      todos=todos.concat(data);
      if (data.length<1000) break;
      offset+=1000;
    }
    setDatos(todos);
    const {data:tData} = await supabase.from('ordenes_compra_items').select('codigo,cantidad_ordenada,cantidad_recibida,estado_item').in('estado_item',['pendiente','parcial']);
    const tMap={};
    (tData||[]).forEach(i=>{ const c=(i.codigo||'').trim(); const p=Math.max((parseFloat(i.cantidad_ordenada)||0)-(parseFloat(i.cantidad_recibida)||0),0); if(c&&p>0) tMap[c]=(tMap[c]||0)+p; });
    setTransitoMap(tMap);
    try {
      const {data:pausData} = await supabase.from('proveedores_pausados').select('proveedor');
      setProveedoresPausados(new Set((pausData||[]).map(r=>r.proveedor)));
    } catch(e) {}
    setLoading(false);
  }

  const calcFiltrado = calc.filter(item => {
    const txt = busqueda.toLowerCase();
    const matchTxt = !txt || [item.codigo,item.nombre,item.ultimo_proveedor,item._alerta].some(v=>(v||'').toLowerCase().includes(txt));
    const matchA = filtroAlerta==='Todos' || item._alerta===filtroAlerta;
    return matchTxt && matchA;
  });

  const stats = calc.reduce((acc,i)=>{ acc[i._alerta]=(acc[i._alerta]||0)+1; return acc; },{});
  const totalTransitoCods = Object.keys(transitoMap).length;
  const totalTransitoUnids = Object.values(transitoMap).reduce((s,v)=>s+v,0);

  // ─── Exportar Excel agrupado por proveedor ─────────────────────
  async function exportarExcel() {
    const XLSX = (await import('xlsx')).default || (await import('xlsx'));
    const fuente = calcFiltrado;
    const headers = ['Alerta','Código','Nombre','Promedio mensual','Existencias','🚢 En tránsito','Cantidad a comprar','Último costo','Fecha última compra','Último proveedor'];
    const porProv = {};
    fuente.forEach(i=>{ const p=(i.ultimo_proveedor||'Sin proveedor').trim(); if(!porProv[p])porProv[p]=[]; porProv[p].push(i); });
    const rows=[headers];
    Object.keys(porProv).sort().forEach((prov,idx)=>{
      if(idx>0) for(let k=0;k<4;k++) rows.push(new Array(headers.length).fill(''));
      rows.push([`── ${prov} ──`,...new Array(headers.length-1).fill('')]);
      porProv[prov].forEach(i=>rows.push([i._alerta,i.codigo,i.nombre,parseFloat(i.promedio_mensual)||0,parseFloat(i.existencias)||0,i._transito>0?`🚢 ${i._transito}`:'–',i._cantComprar,parseFloat(i.ultimo_costo)||0,fmtF(i.ultima_compra),i.ultimo_proveedor||'']));
    });
    const wb=XLSX.utils.book_new();
    const ws=XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb,ws,'Inventario por Proveedor');
    const rRows=[['Proveedor','Productos','A comprar']];
    Object.keys(porProv).sort().forEach(p=>rRows.push([p,porProv[p].length,porProv[p].reduce((s,i)=>s+i._cantComprar,0)]));
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rRows),'Resumen por Proveedor');
    XLSX.writeFile(wb,`Inventario_Alertas_${new Date().toISOString().slice(0,10)}.xlsx`);
    mostrarMsg('Excel descargado con alertas, agrupado por proveedor.');
  }

  // ─── Sugerencia de compras: solo los que hay que pedir ───────────
  const calcAComprar = calc.filter(i => i._cantComprar > 0);
  const porProveedor = {};
  calcAComprar.forEach(i=>{
    const p=(i.ultimo_proveedor||'Sin proveedor').trim();
    if(proveedoresPausados.has(p)) return;
    if(!porProveedor[p]) porProveedor[p]=[];
    porProveedor[p].push(i);
  });
  const proveedoresList = Object.keys(porProveedor).sort();

  useEffect(()=>{ if(proveedoresList.length) setProveedoresSeleccionados(new Set(proveedoresList)); },[calcAComprar.length]);

  function agregarAOrden(items, proveedor) {
    const nuevos = items.map(i=>({ codigo:i.codigo, nombre:i.nombre, cantidad:i._cantComprar, costo:parseFloat(i.ultimo_costo)||0, descuento:0, proveedor:i.ultimo_proveedor||'', alerta:i._alerta }));
    setOrdenItems(prev=>{ const codigos=new Set(prev.map(x=>x.codigo)); return [...prev, ...nuevos.filter(x=>!codigos.has(x.codigo))]; });
    mostrarMsg(`${nuevos.length} productos de ${proveedor} agregados a la orden.`);
  }

  function quitarDeOrden(codigo) { setOrdenItems(prev=>prev.filter(i=>i.codigo!==codigo)); }
  function actualizarCantidad(codigo,val) { setOrdenItems(prev=>prev.map(i=>i.codigo===codigo?{...i,cantidad:parseInt(val)||0}:i)); }

  async function pausarProveedor(proveedor) {
    try { await supabase.from('proveedores_pausados').upsert({proveedor, motivo:''}); setProveedoresPausados(prev=>new Set([...prev,proveedor])); mostrarMsg(`${proveedor} pausado.`); } catch(e) { mostrarMsg('Error pausando proveedor','err'); }
  }
  async function reactivarProveedor(proveedor) {
    try { await supabase.from('proveedores_pausados').delete().eq('proveedor',proveedor); setProveedoresPausados(prev=>{ const s=new Set(prev); s.delete(proveedor); return s; }); mostrarMsg(`${proveedor} reactivado.`); } catch(e) {}
  }

  async function exportarOrdenExcel(items, nombre) {
    const XLSX = (await import('xlsx')).default || (await import('xlsx'));
    const rows=[['Código','Nombre','Cantidad a comprar','Último costo','Descuento']];
    items.forEach(i=>rows.push([i.codigo,i.nombre,i.cantidad,i.costo,i.descuento]));
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows),'Orden');
    XLSX.writeFile(wb,`Orden_${nombre||'compras'}_${new Date().toISOString().slice(0,10)}.xlsx`);
  }

  async function cerrarOrden() {
    if (!ordenItems.length) { mostrarMsg('No hay productos en la orden.','err'); return; }
    const nom = nombreOrden.trim() || new Date().toISOString().slice(0,16).replace('T','_');
    // Guardar en Supabase (trazabilidad)
    try {
      const ahora = new Date().toISOString();
      const {data:cab} = await supabase.from('ordenes_compra').insert([{fecha_orden:ahora,nombre_lote:nom,dias_tribucion:dias,total_productos:ordenItems.length,creado_en:ahora}]).select();
      if (cab?.length) {
        const orden_id = cab[0].id;
        await supabase.from('ordenes_compra_items').insert(ordenItems.map(i=>({orden_id,codigo:i.codigo,nombre:i.nombre,proveedor:i.proveedor,cantidad_ordenada:i.cantidad,costo_unitario:i.costo,descuento:i.descuento,dias_tribucion:dias,cantidad_recibida:0,estado_item:'pendiente',creado_en:ahora})));
      }
    } catch(e) { mostrarMsg('Orden generada (sin guardar en trazabilidad: '+e.message+')','err'); }
    await exportarOrdenExcel(ordenItems, nom);
    mostrarMsg(`Orden "${nom}" cerrada y descargada. Registrada en trazabilidad.`);
    setOrdenItems([]); setNombreOrden(''); setTab(0);
  }

  const alertasUnicas = ['Todos','🔴 Bajo stock','🔴 Bajo stock 🚢','🟠 En tránsito','🟡 Prestar atención','🟢 Óptimo','🔵 Sobrestock'];
  const [expandProv, setExpandProv] = useState({});

  if (loading) return <div style={S.page}><div style={S.title}>🪐 Saturno – Inventario</div><div style={{marginTop:'40px',textAlign:'center',color:'#5a6a80'}}>Cargando inventario desde Supabase...</div></div>;

  return (
    <div style={S.page}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'4px'}}>
        <div style={S.title}>🪐 Saturno – Inventario</div>
        <button style={S.btnSm()} onClick={()=>{setDatos([]);setCalc([]);cargarDatos();}}>🔄 Reiniciar</button>
      </div>
      <div style={S.sub}>El Análisis de Stock · Depósito Jiménez</div>

      {msg && <div style={{background:msg.tipo==='ok'?'#68d39122':'#fc818122',border:'1px solid '+(msg.tipo==='ok'?'#68d391':'#fc8181')+'55',borderRadius:'8px',padding:'10px 16px',marginBottom:'14px',fontSize:'0.84em',color:msg.tipo==='ok'?'#68d391':'#fc8181'}}>{msg.tipo==='ok'?'✅':'❌'} {msg.t}</div>}

      {!datos.length ? (
        <div style={{...S.card,textAlign:'center',color:'#5a6a80',padding:'40px'}}>📭 No hay datos. Subí el reporte <strong style={{color:'#c8a84b'}}>Lista de mínimos y máximos</strong> en Reportes NEO.</div>
      ) : (
        <>
          {fechaCarga && <div style={{fontSize:'0.78em',color:'#5a6a80',marginBottom:'10px'}}>☁️ Datos desde Reportes NEO · Última carga: <strong style={{color:'#c8a84b'}}>{fechaCarga?.slice(0,16).replace('T',' ')}</strong></div>}
          {totalTransitoCods>0 && <div style={{background:'#1a2030',border:'1px solid #2a3a55',borderRadius:'8px',padding:'10px 16px',marginBottom:'14px',fontSize:'0.83em',color:'#63b3ed'}}>🚢 <strong>{totalTransitoCods} productos en tránsito</strong> ({totalTransitoUnids.toLocaleString()} unidades en camino). La columna <strong>🚢 En tránsito</strong> muestra el pendiente — <strong>Cantidad a comprar</strong> ya lo descuenta automáticamente.</div>}

          {/* KPIs */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:'8px',marginBottom:'18px'}}>
            {[['Total',calc.length,'#5a6a80'],['🔴 Bajo stock',(stats['🔴 Bajo stock']||0)+(stats['🔴 Bajo stock 🚢']||0),'#fc8181'],['🟠 Tránsito',stats['🟠 En tránsito']||0,'#f6ad55'],['🟡 Atención',stats['🟡 Prestar atención']||0,'#f6e05e'],['🟢 Óptimo',stats['🟢 Óptimo']||0,'#68d391'],['🔵 Sobrestock',stats['🔵 Sobrestock']||0,'#63b3ed']].map(([l,v,c])=>(
              <div key={l} style={S.kpi(c)}><div style={{fontSize:'0.68em',color:c,textTransform:'uppercase'}}>{l}</div><div style={{fontSize:'1.4em',fontWeight:700,color:'#fff',marginTop:'2px'}}>{v}</div></div>
            ))}
          </div>

          {/* Controles globales */}
          <div style={{display:'flex',gap:'10px',alignItems:'center',flexWrap:'wrap',marginBottom:'14px'}}>
            <div style={{display:'flex',alignItems:'center',gap:'6px'}}>
              <label style={{fontSize:'0.8em',color:'#5a6a80',whiteSpace:'nowrap'}}>⚔️ Días a cubrir:</label>
              <input type="number" min="1" max="90" value={dias} style={{...S.input,width:'70px'}} onChange={e=>setDias(parseInt(e.target.value)||30)}/>
            </div>
            <button style={S.btn()} onClick={()=>setCalc(calcularAlertas(datos,transitoMap,dias))}>⚡ Recalcular</button>
          </div>

          {/* TABS */}
          <div style={S.tabBar}>
            {[`📋 Sugerencia de Compras (${calcAComprar.length})`,`🔍 Orden Manual (${ordenItems.length})`,`📊 Exportar Excel`].map((t,i)=>(
              <button key={i} style={S.tab(tab===i)} onClick={()=>setTab(i)}>{t}</button>
            ))}
          </div>

          {/* ── TAB 0: SUGERENCIA DE COMPRAS ── */}
          {tab===0 && (
            <div>
              <div style={{fontSize:'0.82em',color:'#5a6a80',marginBottom:'16px'}}>Productos que deben reordenarse, agrupados por proveedor. Revisá y ajustá cantidades antes de exportar.</div>

              {/* KPIs propuesta */}
              <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'10px',marginBottom:'18px'}}>
                {[['Productos a ordenar',calcAComprar.filter(i=>!proveedoresPausados.has((i.ultimo_proveedor||'').trim())).length,'#fc8181'],['Proveedores activos',proveedoresList.length,'#c8a84b'],['Proveedores pausados',proveedoresPausados.size,'#5a6a80'],['Seleccionados',proveedoresSeleccionados.size,'#63b3ed']].map(([l,v,c])=>(
                  <div key={l} style={S.kpi(c)}><div style={{fontSize:'0.68em',color:c,textTransform:'uppercase'}}>{l}</div><div style={{fontSize:'1.5em',fontWeight:700,color:'#fff',marginTop:'2px'}}>{v}</div></div>
                ))}
              </div>

              <div style={{display:'flex',gap:'8px',marginBottom:'14px'}}>
                <button style={S.btn('#2a3a5a')} onClick={()=>setProveedoresSeleccionados(new Set(proveedoresList))}>☑️ Seleccionar todos</button>
                <button style={S.btn('#2a3a5a')} onClick={()=>setProveedoresSeleccionados(new Set())}>⬜ Deseleccionar todos</button>
                <button style={S.btn()} onClick={()=>setCalc(calcularAlertas(datos,transitoMap,dias))}>🔄 Recalcular propuesta</button>
              </div>

              {proveedoresList.length===0 ? (
                <div style={{...S.card,textAlign:'center',color:'#68d391',padding:'30px'}}>✅ No hay productos que necesiten reorden en este momento.</div>
              ) : proveedoresList.map(prov=>{
                const items = porProveedor[prov]||[];
                const valorProv = items.reduce((s,i)=>s+i._cantComprar*(parseFloat(i.ultimo_costo)||0),0);
                const selProv = proveedoresSeleccionados.has(prov);
                const exp = expandProv[prov];
                return (
                  <div key={prov} style={{...S.card,marginBottom:'10px',borderLeft:`3px solid ${selProv?'#c8a84b':'#1e2330'}`}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:'8px'}}>
                      <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
                        <input type="checkbox" checked={selProv} onChange={e=>{ const s=new Set(proveedoresSeleccionados); e.target.checked?s.add(prov):s.delete(prov); setProveedoresSeleccionados(s); }} style={{accentColor:'#c8a84b',width:'16px',height:'16px'}}/>
                        <span style={{fontWeight:700,color:'#fff'}}>{prov}</span>
                        <span style={{fontSize:'0.8em',color:'#5a6a80'}}>{items.length} productos · ₡{valorProv.toLocaleString('es-CR',{maximumFractionDigits:0})}</span>
                      </div>
                      <div style={{display:'flex',gap:'6px'}}>
                        <button style={S.btnSm()} onClick={()=>setExpandProv(p=>({...p,[prov]:!p[prov]}))}>📋 {exp?'Cerrar':'Ver productos'}</button>
                        <button style={S.btnSm('#1a2a3a')} onClick={()=>agregarAOrden(items,prov)}>📥 Agregar a orden</button>
                        <button style={S.btnSm('#3a2020')} onClick={()=>pausarProveedor(prov)}>⏸️ Pausar</button>
                      </div>
                    </div>
                    {exp && (
                      <div style={{marginTop:'12px',overflowX:'auto'}}>
                        <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.81em'}}>
                          <thead><tr>{['Alerta','Código','Nombre','Existencias','🚢 Tránsito','Cant. pedir','Último costo'].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
                          <tbody>{items.map((i,idx)=>(
                            <tr key={idx} style={{background:idx%2===0?'#0f1115':'#131720'}}>
                              <td style={S.td}><AlertaBadge alerta={i._alerta}/></td>
                              <td style={{...S.td,fontFamily:'monospace',color:'#c8a84b',fontSize:'0.78em'}}>{i.codigo}</td>
                              <td style={{...S.td,maxWidth:'200px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{i.nombre}</td>
                              <td style={{...S.td,textAlign:'right'}}>{fmtN(i.existencias,0)}</td>
                              <td style={{...S.td,textAlign:'center',color:'#63b3ed'}}>{i._transito>0?`🚢 ${i._transito}`:'–'}</td>
                              <td style={{...S.td,textAlign:'right',fontWeight:700,color:'#fc8181'}}>{i._cantComprar}</td>
                              <td style={{...S.td,textAlign:'right'}}>{fmtN(i.ultimo_costo)}</td>
                            </tr>
                          ))}</tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Proveedores pausados */}
              {proveedoresPausados.size>0 && (
                <div style={{marginTop:'16px'}}>
                  <div style={{fontSize:'0.8em',color:'#5a6a80',marginBottom:'8px'}}>⏸️ Proveedores pausados ({proveedoresPausados.size})</div>
                  {[...proveedoresPausados].sort().map(p=>(
                    <div key={p} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 14px',background:'#161920',border:'1px solid #1e2330',borderRadius:'8px',marginBottom:'6px',fontSize:'0.84em'}}>
                      <span style={{color:'#5a6a80'}}>{p}</span>
                      <button style={S.btnSm('#1a2a1a')} onClick={()=>reactivarProveedor(p)}>▶️ Reactivar</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── TAB 1: ORDEN MANUAL ── */}
          {tab===1 && (
            <div>
              <div style={{display:'flex',gap:'10px',alignItems:'center',flexWrap:'wrap',marginBottom:'14px'}}>
                <input style={{...S.input,flex:1,minWidth:'240px'}} placeholder="🔍 Buscar por código, nombre, proveedor, alerta..." value={busqueda} onChange={e=>setBusqueda(e.target.value)}/>
                <select style={S.input} value={filtroAlerta} onChange={e=>setFiltroAlerta(e.target.value)}>
                  {alertasUnicas.map(a=><option key={a}>{a}</option>)}
                </select>
                <span style={{fontSize:'0.8em',color:'#5a6a80',whiteSpace:'nowrap'}}>{calcFiltrado.length.toLocaleString()} productos</span>
              </div>

              {/* Tabla principal con checkboxes */}
              <div style={{overflowX:'auto',borderRadius:'10px',border:'1px solid #1e2330',marginBottom:'16px'}}>
                <table style={{width:'100%',borderCollapse:'collapse'}}>
                  <thead>
                    <tr>
                      <th style={S.th}>☑</th>
                      {['Alerta','Código','Nombre','Prom. mensual','Existencias','🚢 Tránsito','Cant. a comprar','Último costo','Proveedor'].map(h=><th key={h} style={S.th}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {calcFiltrado.slice(0,300).map((item,i)=>{
                      const sel = seleccionados.has(item.codigo);
                      return (
                        <tr key={i} style={{background:sel?'#1a2030':i%2===0?'#161920':'#131720',cursor:'pointer'}} onClick={()=>{ const s=new Set(seleccionados); sel?s.delete(item.codigo):s.add(item.codigo); setSeleccionados(s); }}>
                          <td style={{...S.td,textAlign:'center'}}><input type="checkbox" checked={sel} readOnly style={{accentColor:'#c8a84b'}}/></td>
                          <td style={S.td}><AlertaBadge alerta={item._alerta}/></td>
                          <td style={{...S.td,fontFamily:'monospace',fontSize:'0.78em',color:'#c8a84b'}}>{item.codigo}</td>
                          <td style={{...S.td,maxWidth:'200px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.nombre}</td>
                          <td style={{...S.td,textAlign:'right'}}>{fmtN(item.promedio_mensual,0)}</td>
                          <td style={{...S.td,textAlign:'right',color:parseFloat(item.existencias)<=0?'#fc8181':'inherit'}}>{fmtN(item.existencias,0)}</td>
                          <td style={{...S.td,textAlign:'center',color:'#63b3ed'}}>{item._transito>0?`🚢 ${item._transito}`:'–'}</td>
                          <td style={{...S.td,textAlign:'right',fontWeight:item._cantComprar>0?700:400,color:item._cantComprar>0?'#fc8181':'#5a6a80'}}>{item._cantComprar||'–'}</td>
                          <td style={{...S.td,textAlign:'right'}}>{fmtN(item.ultimo_costo)}</td>
                          <td style={{...S.td,maxWidth:'130px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontSize:'0.78em'}}>{item.ultimo_proveedor||'—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {calcFiltrado.length>300 && <div style={{padding:'10px',textAlign:'center',color:'#5a6a80',fontSize:'0.8em',background:'#0f1115'}}>Mostrando primeros 300. Usá los filtros.</div>}
              </div>

              <div style={{display:'flex',gap:'10px',alignItems:'center',marginBottom:'20px',flexWrap:'wrap'}}>
                <button style={S.btn()} onClick={()=>{
                  const items = calc.filter(i=>seleccionados.has(i.codigo));
                  if(!items.length){mostrarMsg('Marcá productos con ☑','err');return;}
                  const nuevos=items.map(i=>({codigo:i.codigo,nombre:i.nombre,cantidad:i._cantComprar||1,costo:parseFloat(i.ultimo_costo)||0,descuento:0,proveedor:i.ultimo_proveedor||'',alerta:i._alerta}));
                  setOrdenItems(prev=>{const codigos=new Set(prev.map(x=>x.codigo));return [...prev,...nuevos.filter(x=>!codigos.has(x.codigo))];});
                  setSeleccionados(new Set());
                  mostrarMsg(`${items.length} productos agregados a la orden.`);
                }}>📥 Agregar a Orden ({seleccionados.size})</button>
                {seleccionados.size>0&&<button style={S.btnSm()} onClick={()=>setSeleccionados(new Set())}>✖ Limpiar selección</button>}
              </div>

              {/* Orden en curso */}
              {ordenItems.length>0 && (
                <div style={S.card}>
                  <div style={{fontWeight:700,color:'#fff',marginBottom:'14px',fontSize:'1.05em'}}>📯 Orden Activa — {ordenItems.length} productos</div>
                  <div style={{overflowX:'auto',marginBottom:'14px'}}>
                    <table style={{width:'100%',borderCollapse:'collapse'}}>
                      <thead><tr>{['🗑','Código','Nombre','Cant.','Costo','Descuento','Proveedor'].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
                      <tbody>{ordenItems.map((i,idx)=>(
                        <tr key={idx} style={{background:idx%2===0?'#0f1115':'#131720'}}>
                          <td style={{...S.td,textAlign:'center'}}><button onClick={()=>quitarDeOrden(i.codigo)} style={{background:'none',border:'none',color:'#fc8181',cursor:'pointer',fontSize:'1em'}}>✕</button></td>
                          <td style={{...S.td,fontFamily:'monospace',fontSize:'0.78em',color:'#c8a84b'}}>{i.codigo}</td>
                          <td style={{...S.td,maxWidth:'180px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{i.nombre}</td>
                          <td style={S.td}><input type="number" min="0" value={i.cantidad} onChange={e=>actualizarCantidad(i.codigo,e.target.value)} style={{...S.input,width:'70px',padding:'4px 8px'}}/></td>
                          <td style={{...S.td,textAlign:'right'}}>{fmtN(i.costo)}</td>
                          <td style={{...S.td,textAlign:'right'}}>{i.descuento}%</td>
                          <td style={{...S.td,fontSize:'0.78em'}}>{i.proveedor||'—'}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                  <div style={{display:'flex',gap:'10px',alignItems:'center',flexWrap:'wrap'}}>
                    <input style={{...S.input,flex:1,minWidth:'200px'}} placeholder="📝 Nombre de la orden (ej: Gran Orden de Marzo)" value={nombreOrden} onChange={e=>setNombreOrden(e.target.value)}/>
                    <button style={S.btn()} onClick={cerrarOrden}>🔱 Cerrar Orden – Descargar Excel</button>
                    <button style={S.btnSm('#3d1515')} onClick={()=>{if(confirm('¿Limpiar la orden?')){setOrdenItems([]);}}}>🗑 Limpiar</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── TAB 2: EXPORTAR EXCEL ── */}
          {tab===2 && (
            <div style={S.card}>
              <div style={{fontWeight:700,color:'#fff',marginBottom:'8px',fontSize:'1.05em'}}>📊 Exportar tabla filtrada agrupada por proveedor</div>
              <div style={{fontSize:'0.82em',color:'#5a6a80',marginBottom:'18px'}}>Exporta los productos visibles en la tabla, con alertas, agrupados y ordenados por proveedor.</div>

              <div style={{display:'flex',gap:'10px',alignItems:'center',flexWrap:'wrap',marginBottom:'16px'}}>
                <input style={{...S.input,flex:1,minWidth:'200px'}} placeholder="🔍 Buscar (filtra lo que se exporta)..." value={busqueda} onChange={e=>setBusqueda(e.target.value)}/>
                <select style={S.input} value={filtroAlerta} onChange={e=>setFiltroAlerta(e.target.value)}>
                  {alertasUnicas.map(a=><option key={a}>{a}</option>)}
                </select>
              </div>

              <div style={{fontSize:'0.82em',color:'#5a6a80',marginBottom:'16px'}}>
                Se exportarán <strong style={{color:'#fff'}}>{calcFiltrado.length.toLocaleString()}</strong> productos de <strong style={{color:'#fff'}}>{new Set(calcFiltrado.map(i=>i.ultimo_proveedor||'Sin proveedor')).size}</strong> proveedores.
              </div>

              <button style={{...S.btn(),fontSize:'0.9em',padding:'10px 24px'}} onClick={exportarExcel}>
                📄 Generar y Descargar Excel agrupado
              </button>

              <div style={{marginTop:'20px',background:'#0f1115',borderRadius:'8px',padding:'14px',fontSize:'0.82em',color:'#5a6a80'}}>
                <div style={{color:'#c8a84b',fontWeight:600,marginBottom:'6px'}}>El Excel incluye:</div>
                <div>• Hoja "Inventario por Proveedor": todos los productos con columna Alerta, agrupados por proveedor con 4 filas de separación</div>
                <div>• Hoja "Resumen por Proveedor": conteo de productos y cantidad a comprar por proveedor</div>
                <div>• Columna 🚢 En tránsito incluida</div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
