'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

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

function AlertaBadge({ alerta }) {
  const map = {
    '🟢 Óptimo':           'alert-badge alert-optimo',
    '🔴 Bajo stock':       'alert-badge alert-bajo',
    '🔴 Bajo stock 🚢':   'alert-badge alert-transito-bajo',
    '🔵 Sobrestock':       'alert-badge alert-sobrestock',
    '🟡 Prestar atención': 'alert-badge alert-atencion',
    '🟠 En tránsito':      'alert-badge alert-transito',
  };
  return <span className={map[alerta]||'alert-badge'}>{alerta||'—'}</span>;
}

const fmtN = (v,d=2)=>{ const n=parseFloat(v); return isNaN(n)?'—':n.toLocaleString('es-CR',{minimumFractionDigits:d,maximumFractionDigits:d}); };
const fmtF = (v)=>v?String(v).slice(0,10):'—';

export default function Inventario() {
  const [tab, setTab]           = useState(0);
  const [datos, setDatos]       = useState([]);
  const [calc, setCalc]         = useState([]);
  const [transitoMap, setTransitoMap] = useState({});
  const [dias, setDias]         = useState(30);
  const [loading, setLoading]   = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [filtroAlerta, setFiltroAlerta] = useState('Todos');
  const [fechaCarga, setFechaCarga] = useState(null);
  const [msg, setMsg]           = useState(null);
  const [ordenItems, setOrdenItems]   = useState([]);
  const [seleccionados, setSeleccionados] = useState(new Set());
  const [nombreOrden, setNombreOrden] = useState('');
  const [proveedoresPausados, setProveedoresPausados] = useState(new Set());
  const [proveedoresSeleccionados, setProveedoresSeleccionados] = useState(new Set());
  const [expandProv, setExpandProv] = useState({});

  const mostrarMsg = (t,tipo='ok')=>{ setMsg({t,tipo}); setTimeout(()=>setMsg(null),5000); };

  useEffect(()=>{ cargarDatos(); },[]);
  useEffect(()=>{ if(datos.length) setCalc(calcularAlertas(datos,transitoMap,dias)); },[datos,transitoMap,dias]);

  async function cargarDatos() {
    setLoading(true);
    const {data:fd}=await supabase.from('neo_minimos_maximos').select('fecha_carga').order('fecha_carga',{ascending:false}).limit(1);
    if(!fd?.length){setLoading(false);return;}
    const fc=fd[0].fecha_carga; setFechaCarga(fc);
    let todos=[],offset=0;
    while(true){
      const {data}=await supabase.from('neo_minimos_maximos').select('*').eq('fecha_carga',fc).range(offset,offset+999);
      if(!data?.length) break; todos=todos.concat(data); if(data.length<1000) break; offset+=1000;
    }
    setDatos(todos);
    if (todos.length === 0) {
      console.warn('Saturno: 0 registros cargados. Verificá que Ezequiel haya subido el archivo correctamente.');
    } else {
      console.log(`Saturno: ${todos.length} registros cargados desde fecha_carga=${fc}`);
    }
    const {data:tData}=await supabase.from('ordenes_compra_items').select('codigo,cantidad_ordenada,cantidad_recibida,estado_item').in('estado_item',['pendiente','parcial']);
    const tMap={};
    (tData||[]).forEach(i=>{ const c=(i.codigo||'').trim(); const p=Math.max((parseFloat(i.cantidad_ordenada)||0)-(parseFloat(i.cantidad_recibida)||0),0); if(c&&p>0) tMap[c]=(tMap[c]||0)+p; });
    setTransitoMap(tMap);
    try{ const {data:pd}=await supabase.from('proveedores_pausados').select('proveedor'); setProveedoresPausados(new Set((pd||[]).map(r=>r.proveedor))); }catch(e){}
    setLoading(false);
  }

  const calcFiltrado = calc.filter(item=>{
    const txt=busqueda.toLowerCase();
    const ok=!txt||[item.codigo,item.nombre,item.ultimo_proveedor,item._alerta].some(v=>(v||'').toLowerCase().includes(txt));
    return ok && (filtroAlerta==='Todos'||item._alerta===filtroAlerta);
  });

  const stats=calc.reduce((a,i)=>{a[i._alerta]=(a[i._alerta]||0)+1;return a;},{});
  const totalTCods=Object.keys(transitoMap).length;
  const totalTUnids=Object.values(transitoMap).reduce((s,v)=>s+v,0);

  const calcAComprar=calc.filter(i=>i._cantComprar>0);
  const porProveedor={};
  calcAComprar.forEach(i=>{ const p=(i.ultimo_proveedor||'Sin proveedor').trim(); if(proveedoresPausados.has(p))return; if(!porProveedor[p])porProveedor[p]=[]; porProveedor[p].push(i); });
  const proveedoresList=Object.keys(porProveedor).sort();

  useEffect(()=>{ if(proveedoresList.length) setProveedoresSeleccionados(new Set(proveedoresList)); },[calcAComprar.length]);

  function agregarAOrden(items,prov){
    const nuevos=items.map(i=>({codigo:i.codigo,nombre:i.nombre,cantidad:i._cantComprar,costo:parseFloat(i.ultimo_costo)||0,descuento:0,proveedor:i.ultimo_proveedor||'',alerta:i._alerta}));
    setOrdenItems(prev=>{ const cs=new Set(prev.map(x=>x.codigo)); return [...prev,...nuevos.filter(x=>!cs.has(x.codigo))]; });
    mostrarMsg(`${nuevos.length} productos de ${prov} agregados a la orden.`);
  }
  function quitarDeOrden(c){ setOrdenItems(prev=>prev.filter(i=>i.codigo!==c)); }
  function actualizarCantidad(c,v){ setOrdenItems(prev=>prev.map(i=>i.codigo===c?{...i,cantidad:parseInt(v)||0}:i)); }
  async function pausarProveedor(p){ try{await supabase.from('proveedores_pausados').upsert({proveedor:p,motivo:''});setProveedoresPausados(prev=>new Set([...prev,p]));mostrarMsg(`${p} pausado.`);}catch(e){} }
  async function reactivarProveedor(p){ try{await supabase.from('proveedores_pausados').delete().eq('proveedor',p);setProveedoresPausados(prev=>{ const s=new Set(prev); s.delete(p); return s; });mostrarMsg(`${p} reactivado.`);}catch(e){} }

  async function exportarExcel(fuente,nombre){
    const XLSX=(await import('xlsx')).default||(await import('xlsx'));
    const headers=['Alerta','Código','Nombre','Promedio mensual','Existencias','🚢 En tránsito','Cantidad a comprar','Último costo','Fecha última compra','Último proveedor'];
    const porProv={};
    fuente.forEach(i=>{ const p=(i.ultimo_proveedor||'Sin proveedor').trim(); if(!porProv[p])porProv[p]=[]; porProv[p].push(i); });
    const rows=[headers];
    Object.keys(porProv).sort().forEach((prov,idx)=>{
      if(idx>0) for(let k=0;k<4;k++) rows.push(new Array(headers.length).fill(''));
      rows.push([`── ${prov} ──`,...new Array(headers.length-1).fill('')]);
      porProv[prov].forEach(i=>rows.push([i._alerta,i.codigo,i.nombre,parseFloat(i.promedio_mensual)||0,parseFloat(i.existencias)||0,i._transito>0?`🚢 ${i._transito}`:'–',i._cantComprar,parseFloat(i.ultimo_costo)||0,fmtF(i.ultima_compra),i.ultimo_proveedor||'']));
    });
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows),'Inventario por Proveedor');
    const rRows=[['Proveedor','Productos','A comprar']];
    Object.keys(porProv).sort().forEach(p=>rRows.push([p,porProv[p].length,porProv[p].reduce((s,i)=>s+i._cantComprar,0)]));
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rRows),'Resumen por Proveedor');
    XLSX.writeFile(wb,`${nombre||'Inventario'}_${new Date().toISOString().slice(0,10)}.xlsx`);
    mostrarMsg('Excel descargado.');
  }

  async function cerrarOrden(){
    if(!ordenItems.length){mostrarMsg('No hay productos en la orden.','err');return;}
    const nom=nombreOrden.trim()||new Date().toISOString().slice(0,16).replace('T','_');
    try{
      const ahora=new Date().toISOString();
      const {data:cab}=await supabase.from('ordenes_compra').insert([{fecha_orden:ahora,nombre_lote:nom,dias_tribucion:dias,total_productos:ordenItems.length,creado_en:ahora}]).select();
      if(cab?.length){ const oid=cab[0].id; await supabase.from('ordenes_compra_items').insert(ordenItems.map(i=>({orden_id:oid,codigo:i.codigo,nombre:i.nombre,proveedor:i.proveedor,cantidad_ordenada:i.cantidad,costo_unitario:i.costo,descuento:i.descuento,dias_tribucion:dias,cantidad_recibida:0,estado_item:'pendiente',creado_en:ahora}))); }
    }catch(e){}
    const XLSX=(await import('xlsx')).default||(await import('xlsx'));
    const rows=[['Código','Nombre','Cantidad a comprar','Último costo','Descuento']];
    ordenItems.forEach(i=>rows.push([i.codigo,i.nombre,i.cantidad,i.costo,i.descuento]));
    const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows),'Orden');
    XLSX.writeFile(wb,`Orden_${nom}_${new Date().toISOString().slice(0,10)}.xlsx`);
    mostrarMsg(`Orden "${nom}" cerrada y descargada.`);
    setOrdenItems([]); setNombreOrden(''); setTab(0);
  }

  const alertasUnicas=['Todos','🔴 Bajo stock','🔴 Bajo stock 🚢','🟠 En tránsito','🟡 Prestar atención','🟢 Óptimo','🔵 Sobrestock'];

  if(loading) return <div className="module-page"><div className="module-title">🪐 Saturno – Inventario</div><div style={{marginTop:40,textAlign:'center',color:'#999'}}>Cargando inventario...</div></div>;

  return (
    <div className="module-page">
      <div className="module-header" style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
        <div>
          <h1 className="module-title">🪐 Saturno – Inventario</h1>
          <p className="module-sub">El Análisis de Stock · Depósito Jiménez</p>
        </div>
        <button className="btn-outline" onClick={()=>{setDatos([]);setCalc([]);cargarDatos();}}>🔄 Reiniciar</button>
      </div>

      {msg && <div className={msg.tipo==='ok'?'success-banner':'error-banner'}>{msg.tipo==='ok'?'✅':'❌'} {msg.t}</div>}

      {!datos.length ? (
        <div className="card" style={{padding:40,textAlign:'center',color:'#999'}}>
          📭 No hay datos. Subí el reporte <strong style={{color:'var(--orange)'}}>Lista de mínimos y máximos</strong> en Reportes NEO.
        </div>
      ) : (
        <>
          {fechaCarga && (
            <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:10,flexWrap:'wrap'}}>
              <p style={{fontSize:'0.78rem',color:'#999',margin:0}}>☁️ Última carga: <strong style={{color:'var(--burgundy)'}}>{fechaCarga?.slice(0,16).replace('T',' ')}</strong></p>
              <span style={{fontSize:'0.78rem',background:datos.length>=4000?'#F0FFF4':datos.length>=1000?'#FFFBEB':'#FFF5F5',color:datos.length>=4000?'#276749':datos.length>=1000?'#7B341E':'#C53030',border:'1px solid',borderColor:datos.length>=4000?'#9AE6B4':datos.length>=1000?'#FAD776':'#FEB2B2',borderRadius:12,padding:'2px 10px',fontWeight:600}}>
                {datos.length.toLocaleString()} registros en BD
              </span>
              {datos.length < 1000 && <span style={{fontSize:'0.78rem',color:'#C53030',fontWeight:600}}>⚠️ Parece incompleto — volvé a subir el archivo en Ezequiel</span>}
            </div>
          )}
          {totalTCods>0 && <div className="info-banner">🚢 <strong>{totalTCods} productos en tránsito</strong> ({totalTUnids.toLocaleString()} unidades). La columna <strong>🚢 En tránsito</strong> ya descuenta automáticamente de <strong>Cantidad a comprar</strong>.</div>}
          {proveedoresPausados.size>0 && <div className="warn-banner">⚠️ Tenés <strong>{proveedoresPausados.size} proveedores pausados</strong> — no aparecerán en la sugerencia del día. Andá al tab <strong>📋 Sugerencia</strong> y bajá al final para reactivarlos, o usá <strong>🔓 Reactivar todos</strong>.</div>}

          {/* KPIs */}
          <div className="kpi-grid kpi-grid-6" style={{marginBottom:20}}>
            {[['Total',calc.length,'var(--teal)'],['🔴 Bajo stock',(stats['🔴 Bajo stock']||0)+(stats['🔴 Bajo stock 🚢']||0),'#E53E3E'],['🟠 Tránsito',stats['🟠 En tránsito']||0,'#DD6B20'],['🟡 Atención',stats['🟡 Prestar atención']||0,'#D69E2E'],['🟢 Óptimo',stats['🟢 Óptimo']||0,'#38A169'],['🔵 Sobrestock',stats['🔵 Sobrestock']||0,'#3182CE']].map(([l,v,c])=>(
              <div key={l} className="kpi-card" style={{borderTopColor:c,padding:'12px 16px'}}>
                <div className="kpi-label">{l}</div>
                <div className="kpi-value" style={{fontSize:'1.5rem',color:c}}>{v}</div>
              </div>
            ))}
          </div>

          {/* Controles */}
          <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap',marginBottom:16}}>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <label style={{fontSize:'0.82rem',color:'#666',whiteSpace:'nowrap'}}>⚔️ Días a cubrir:</label>
              <input type="number" min="1" max="90" value={dias} className="module-input" style={{width:70}} onChange={e=>setDias(parseInt(e.target.value)||30)}/>
            </div>
            <button className="btn-primary" onClick={()=>setCalc(calcularAlertas(datos,transitoMap,dias))}>⚡ Recalcular</button>
          </div>

          {/* Tabs */}
          <div className="module-tabs">
            {[`📋 Sugerencia de Compras (${calcAComprar.length})`,`🔍 Orden Manual (${ordenItems.length})`,`📊 Exportar Excel`].map((t,i)=>(
              <button key={i} className={`module-tab${tab===i?' active':''}`} onClick={()=>setTab(i)}>{t}</button>
            ))}
          </div>

          {/* ── TAB 0: SUGERENCIA ── */}
          {tab===0 && (
            <div>
              <p style={{fontSize:'0.82rem',color:'#666',marginBottom:16}}>Productos que deben reordenarse, agrupados por proveedor. Revisá y ajustá cantidades antes de exportar.</p>
              <div className="kpi-grid kpi-grid-4" style={{marginBottom:16}}>
                {[['Productos a ordenar',calcAComprar.filter(i=>!proveedoresPausados.has((i.ultimo_proveedor||'').trim())).length,'#E53E3E'],['Proveedores activos',proveedoresList.length,'var(--orange)'],['Proveedores pausados',proveedoresPausados.size,'#999'],['Seleccionados',proveedoresSeleccionados.size,'var(--teal)']].map(([l,v,c])=>(
                  <div key={l} className="kpi-card" style={{borderTopColor:c,padding:'12px 16px'}}>
                    <div className="kpi-label">{l}</div>
                    <div className="kpi-value" style={{fontSize:'1.4rem',color:c}}>{v}</div>
                  </div>
                ))}
              </div>
              <div style={{display:'flex',gap:8,marginBottom:16,flexWrap:'wrap'}}>
                <button className="btn-outline" onClick={()=>setProveedoresSeleccionados(new Set(proveedoresList))}>☑️ Seleccionar todos</button>
                <button className="btn-outline" onClick={()=>setProveedoresSeleccionados(new Set())}>⬜ Deseleccionar todos</button>
                <button className="btn-primary" onClick={()=>setCalc(calcularAlertas(datos,transitoMap,dias))}>🔄 Recalcular propuesta</button>
              </div>

              {proveedoresList.length===0 ? (
                <div className="success-banner">✅ No hay productos que necesiten reorden en este momento.</div>
              ) : proveedoresList.map(prov=>{
                const items=porProveedor[prov]||[];
                const valorProv=items.reduce((s,i)=>s+i._cantComprar*(parseFloat(i.ultimo_costo)||0),0);
                const selProv=proveedoresSeleccionados.has(prov);
                const exp=expandProv[prov];
                return (
                  <div key={prov} className="card" style={{marginBottom:8,borderLeft:`3px solid ${selProv?'var(--orange)':'var(--border)'}`,padding:'14px 18px'}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8}}>
                      <div style={{display:'flex',alignItems:'center',gap:10}}>
                        <input type="checkbox" checked={selProv} onChange={e=>{ const s=new Set(proveedoresSeleccionados); e.target.checked?s.add(prov):s.delete(prov); setProveedoresSeleccionados(s); }} style={{accentColor:'var(--orange)',width:15,height:15}}/>
                        <span style={{fontWeight:600,color:'var(--burgundy)'}}>{prov}</span>
                        <span style={{fontSize:'0.78rem',color:'#999'}}>{items.length} productos · ₡{valorProv.toLocaleString('es-CR',{maximumFractionDigits:0})}</span>
                      </div>
                      <div style={{display:'flex',gap:6}}>
                        <button className="btn-outline" style={{fontSize:'0.78rem',padding:'5px 10px'}} onClick={()=>setExpandProv(p=>({...p,[prov]:!p[prov]}))}>📋 {exp?'Cerrar':'Ver'}</button>
                        <button className="btn-primary" style={{fontSize:'0.78rem',padding:'5px 10px'}} onClick={()=>agregarAOrden(items,prov)}>📥 Agregar a orden</button>
                        <button className="btn-outline" style={{fontSize:'0.78rem',padding:'5px 10px',color:'#E53E3E',borderColor:'#E53E3E'}} onClick={()=>pausarProveedor(prov)}>⏸️ Pausar</button>
                      </div>
                    </div>
                    {exp && (
                      <div style={{marginTop:12,overflowX:'auto'}}>
                        <table className="module-table">
                          <thead><tr>{['Alerta','Código','Nombre','Existencias','🚢 Tránsito','Cant. pedir','Último costo'].map(h=><th key={h}>{h}</th>)}</tr></thead>
                          <tbody>{items.map((i,idx)=>(
                            <tr key={idx}>
                              <td><AlertaBadge alerta={i._alerta}/></td>
                              <td style={{fontFamily:'monospace',fontSize:'0.78em',color:'var(--orange)'}}>{i.codigo}</td>
                              <td style={{maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{i.nombre}</td>
                              <td style={{textAlign:'right'}}>{fmtN(i.existencias,0)}</td>
                              <td style={{textAlign:'center',color:'#3182CE'}}>{i._transito>0?`🚢 ${i._transito}`:'–'}</td>
                              <td style={{textAlign:'right',fontWeight:700,color:'#E53E3E'}}>{i._cantComprar}</td>
                              <td style={{textAlign:'right'}}>{fmtN(i.ultimo_costo)}</td>
                            </tr>
                          ))}</tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}

              {proveedoresPausados.size>0 && (
                <div style={{marginTop:16}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                    <p style={{fontSize:'0.78rem',color:'#999',margin:0}}>⏸️ Proveedores pausados ({proveedoresPausados.size})</p>
                    <button className="btn-primary" style={{fontSize:'0.75rem',padding:'5px 12px',background:'#E53E3E'}} onClick={async()=>{
                      if(!confirm(`¿Reactivar los ${proveedoresPausados.size} proveedores pausados?`)) return;
                      try{
                        await supabase.from('proveedores_pausados').delete().neq('proveedor','__never__');
                        setProveedoresPausados(new Set());
                        mostrarMsg(`✅ Todos los proveedores reactivados.`);
                      }catch(e){ mostrarMsg('Error al limpiar: '+e.message,'err'); }
                    }}>🔓 Reactivar todos</button>
                  </div>
                  {[...proveedoresPausados].sort().map(p=>(
                    <div key={p} className="card" style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 14px',marginBottom:6,fontSize:'0.84rem'}}>
                      <span style={{color:'#666'}}>{p}</span>
                      <button className="btn-outline" style={{fontSize:'0.75rem',padding:'4px 10px'}} onClick={()=>reactivarProveedor(p)}>▶️ Reactivar</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── TAB 1: ORDEN MANUAL ── */}
          {tab===1 && (
            <div>
              <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap',marginBottom:14}}>
                <input className="module-input" style={{flex:1,minWidth:240}} placeholder="🔍 Buscar por código, nombre, proveedor, alerta..." value={busqueda} onChange={e=>setBusqueda(e.target.value)}/>
                <select className="module-input" value={filtroAlerta} onChange={e=>setFiltroAlerta(e.target.value)}>
                  {alertasUnicas.map(a=><option key={a}>{a}</option>)}
                </select>
                <span style={{fontSize:'0.78rem',color:'#999',whiteSpace:'nowrap'}}>{calcFiltrado.length.toLocaleString()} productos</span>
              </div>

              <div style={{overflowX:'auto',borderRadius:10,border:'1px solid var(--border)',marginBottom:14}}>
                <table className="module-table">
                  <thead><tr>
                    <th>☑</th>
                    {['Alerta','Código','Nombre','Prom. mensual','Existencias','🚢 Tránsito','Cant. a comprar','Último costo','Proveedor'].map(h=><th key={h}>{h}</th>)}
                  </tr></thead>
                  <tbody>{calcFiltrado.slice(0,300).map((item,i)=>{
                    const sel=seleccionados.has(item.codigo);
                    return (
                      <tr key={i} style={{background:sel?'rgba(237,110,46,0.06)':undefined,cursor:'pointer'}} onClick={()=>{ const s=new Set(seleccionados); sel?s.delete(item.codigo):s.add(item.codigo); setSeleccionados(s); }}>
                        <td><input type="checkbox" checked={sel} readOnly style={{accentColor:'var(--orange)'}}/></td>
                        <td><AlertaBadge alerta={item._alerta}/></td>
                        <td style={{fontFamily:'monospace',fontSize:'0.78em',color:'var(--orange)'}}>{item.codigo}</td>
                        <td style={{maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.nombre}</td>
                        <td style={{textAlign:'right'}}>{fmtN(item.promedio_mensual,0)}</td>
                        <td style={{textAlign:'right',color:parseFloat(item.existencias)<=0?'#E53E3E':undefined}}>{fmtN(item.existencias,0)}</td>
                        <td style={{textAlign:'center',color:'#3182CE'}}>{item._transito>0?`🚢 ${item._transito}`:'–'}</td>
                        <td style={{textAlign:'right',fontWeight:item._cantComprar>0?700:400,color:item._cantComprar>0?'#E53E3E':'#ccc'}}>{item._cantComprar||'–'}</td>
                        <td style={{textAlign:'right'}}>{fmtN(item.ultimo_costo)}</td>
                        <td style={{maxWidth:130,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontSize:'0.78em'}}>{item.ultimo_proveedor||'—'}</td>
                      </tr>
                    );
                  })}</tbody>
                </table>
                {calcFiltrado.length>300 && <div style={{padding:10,textAlign:'center',color:'#999',fontSize:'0.8rem'}}>Mostrando primeros 300. Usá los filtros para acotar.</div>}
              </div>

              <div style={{display:'flex',gap:10,alignItems:'center',marginBottom:20,flexWrap:'wrap'}}>
                <button className="btn-primary" onClick={()=>{
                  const items=calc.filter(i=>seleccionados.has(i.codigo));
                  if(!items.length){mostrarMsg('Marcá productos con ☑','err');return;}
                  const nuevos=items.map(i=>({codigo:i.codigo,nombre:i.nombre,cantidad:i._cantComprar||1,costo:parseFloat(i.ultimo_costo)||0,descuento:0,proveedor:i.ultimo_proveedor||'',alerta:i._alerta}));
                  setOrdenItems(prev=>{const cs=new Set(prev.map(x=>x.codigo));return [...prev,...nuevos.filter(x=>!cs.has(x.codigo))];});
                  setSeleccionados(new Set()); mostrarMsg(`${items.length} productos agregados a la orden.`);
                }}>📥 Agregar a Orden ({seleccionados.size})</button>
                {seleccionados.size>0 && <button className="btn-outline" onClick={()=>setSeleccionados(new Set())}>✖ Limpiar selección</button>}
              </div>

              {ordenItems.length>0 && (
                <div className="card" style={{padding:20}}>
                  <div style={{fontWeight:600,color:'var(--burgundy)',marginBottom:14,fontSize:'1rem'}}>📯 Orden Activa — {ordenItems.length} productos</div>
                  <div style={{overflowX:'auto',marginBottom:14}}>
                    <table className="module-table">
                      <thead><tr>{['✕','Código','Nombre','Cant.','Costo','Descuento','Proveedor'].map(h=><th key={h}>{h}</th>)}</tr></thead>
                      <tbody>{ordenItems.map((i,idx)=>(
                        <tr key={idx}>
                          <td><button onClick={()=>quitarDeOrden(i.codigo)} style={{background:'none',border:'none',color:'#E53E3E',cursor:'pointer',fontSize:'1rem'}}>✕</button></td>
                          <td style={{fontFamily:'monospace',fontSize:'0.78em',color:'var(--orange)'}}>{i.codigo}</td>
                          <td style={{maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{i.nombre}</td>
                          <td><input type="number" min="0" value={i.cantidad} onChange={e=>actualizarCantidad(i.codigo,e.target.value)} className="module-input" style={{width:70,padding:'4px 8px'}}/></td>
                          <td style={{textAlign:'right'}}>{fmtN(i.costo)}</td>
                          <td style={{textAlign:'right'}}>{i.descuento}%</td>
                          <td style={{fontSize:'0.78em'}}>{i.proveedor||'—'}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                  <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
                    <input className="module-input" style={{flex:1,minWidth:200}} placeholder="📝 Nombre de la orden (ej: Gran Orden de Marzo)" value={nombreOrden} onChange={e=>setNombreOrden(e.target.value)}/>
                    <button className="btn-primary" onClick={cerrarOrden}>🔱 Cerrar Orden – Descargar Excel</button>
                    <button className="btn-outline" style={{color:'#E53E3E',borderColor:'#E53E3E'}} onClick={()=>{if(confirm('¿Limpiar la orden?'))setOrdenItems([]);}}>🗑 Limpiar</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── TAB 2: EXPORTAR ── */}
          {tab===2 && (
            <div className="card" style={{padding:24}}>
              <div style={{fontWeight:600,color:'var(--burgundy)',marginBottom:8,fontSize:'1rem'}}>📊 Exportar tabla agrupada por proveedor</div>
              <p style={{fontSize:'0.82rem',color:'#666',marginBottom:18}}>Exporta los productos filtrados con alertas, agrupados y ordenados por proveedor.</p>
              <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap',marginBottom:16}}>
                <input className="module-input" style={{flex:1,minWidth:200}} placeholder="🔍 Filtrar lo que se exporta..." value={busqueda} onChange={e=>setBusqueda(e.target.value)}/>
                <select className="module-input" value={filtroAlerta} onChange={e=>setFiltroAlerta(e.target.value)}>
                  {alertasUnicas.map(a=><option key={a}>{a}</option>)}
                </select>
              </div>
              <p style={{fontSize:'0.82rem',color:'#666',marginBottom:16}}>Se exportarán <strong>{calcFiltrado.length.toLocaleString()}</strong> productos de <strong>{new Set(calcFiltrado.map(i=>i.ultimo_proveedor||'Sin proveedor')).size}</strong> proveedores.</p>
              <button className="btn-primary" style={{fontSize:'0.9rem',padding:'10px 24px'}} onClick={()=>exportarExcel(calcFiltrado,'Inventario_Alertas')}>📄 Generar y Descargar Excel agrupado</button>
              <div className="info-banner" style={{marginTop:16}}>
                <strong>El Excel incluye:</strong> Hoja "Inventario por Proveedor" con alertas + columna 🚢 En tránsito, agrupado con 4 filas de separación entre proveedores. Hoja "Resumen por Proveedor" con conteo y cantidad a comprar.
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
