'use client'
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'

const GOLD='#c8a84b'
const BG='#0f1115'
const SURF='#161920'
const BORDER='#1e2330'
const TEXT='#c9d1e0'
const MUTED='#5a6a80'

const S={
  badge:(c)=>({background:c+'22',color:c,border:`1px solid ${c}55`,borderRadius:20,padding:'3px 10px',fontSize:'0.72em',fontWeight:600,whiteSpace:'nowrap',display:'inline-block'}),
  th:{textAlign:'left',padding:'9px 12px',background:BG,color:MUTED,fontSize:'0.72em',textTransform:'uppercase',letterSpacing:'0.05em',borderBottom:`2px solid ${BORDER}`,whiteSpace:'nowrap'},
  td:{padding:'9px 12px',borderBottom:`1px solid ${BORDER}`,color:TEXT,verticalAlign:'middle',fontSize:'0.84em'},
  card:{background:SURF,border:`1px solid ${BORDER}`,borderRadius:12,padding:'18px 20px',marginBottom:16},
  input:{background:BG,border:`1px solid ${BORDER}`,borderRadius:8,padding:'8px 12px',color:TEXT,fontSize:'0.85em',fontFamily:'DM Sans,sans-serif'},
  btn:(c=GOLD)=>({background:c,color:'#fff',border:'none',borderRadius:8,padding:'8px 16px',cursor:'pointer',fontSize:'0.83em',fontWeight:600,fontFamily:'DM Sans,sans-serif'}),
  btnSm:(c=SURF)=>({background:c,color:TEXT,border:`1px solid ${BORDER}`,borderRadius:6,padding:'5px 11px',cursor:'pointer',fontSize:'0.78em',fontFamily:'DM Sans,sans-serif'}),
}

function diasDesde(fecha){
  if(!fecha)return null
  return Math.floor((new Date()-new Date(fecha))/86400000)
}
function colorDias(d,limA,limR){
  if(d===null)return MUTED
  if(d<=limA)return'#68d391'
  if(d<=limR)return'#f6ad55'
  return'#fc8181'
}

function TabAlertas({ordenes,items,loading}){
  const[limA,setLimA]=useState(10)
  const[limR,setLimR]=useState(20)
  const[filtroProv,setFiltroProv]=useState('')
  const[filtroEstado,setFiltroEstado]=useState('Todos')
  const[busqueda,setBusqueda]=useState('')
  const proveedores=useMemo(()=>[...new Set(ordenes.map(o=>o.proveedor).filter(Boolean))].sort(),[ordenes])
  const pendientes=useMemo(()=>{
    return items.filter(it=>!it.recibido).map(it=>{
      const orden=ordenes.find(o=>o.id===it.orden_id)
      const dias=diasDesde(orden?.fecha_orden)
      const pendiente=(parseFloat(it.cantidad_pedida)||0)-(parseFloat(it.cantidad_recibida)||0)
      let estado='Pendiente'
      if((parseFloat(it.cantidad_recibida)||0)>0&&pendiente>0)estado='Parcial'
      return{...it,orden,dias,pendiente,estado}
    }).filter(it=>{
      if(filtroProv&&!(it.orden?.proveedor||'').toLowerCase().includes(filtroProv.toLowerCase()))return false
      if(filtroEstado!=='Todos'&&it.estado!==filtroEstado)return false
      if(busqueda.trim()){const q=busqueda.toLowerCase();if(!(it.nombre_producto||'').toLowerCase().includes(q)&&!(it.codigo_producto||'').toLowerCase().includes(q))return false}
      return true
    }).sort((a,b)=>(b.dias||0)-(a.dias||0))
  },[items,ordenes,filtroProv,filtroEstado,busqueda])
  const totPend=pendientes.length
  const totParcial=pendientes.filter(x=>x.estado==='Parcial').length
  const totCritico=pendientes.filter(x=>(x.dias||0)>limR).length
  return(
    <div>
      <p style={{fontSize:'0.84em',color:MUTED,marginBottom:16}}>Productos ordenados que aún no han llegado completamente. El semáforo indica urgencia según los días desde la orden.</p>
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,marginBottom:20}}>
        {[['🔴 Pendientes Totales',totPend,'#fc8181'],['🟡 Parcialmente Recibidos',totParcial,'#f6ad55'],['🚨 Críticos (superan días)',totCritico,'#f43f5e']].map(([l,v,c])=>(
          <div key={l} style={{background:SURF,border:`1px solid ${c}33`,borderTop:`3px solid ${c}`,borderRadius:10,padding:'14px 16px'}}>
            <div style={{fontSize:'0.72em',color:MUTED,textTransform:'uppercase',letterSpacing:'0.06em'}}>{l}</div>
            <div style={{fontSize:'1.8em',fontWeight:700,color:'#fff',marginTop:4}}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{...S.card,marginBottom:16}}>
        <div style={{fontWeight:600,color:GOLD,fontSize:'0.8em',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:12}}>⚙️ Configuración de semáforo</div>
        <div style={{display:'flex',gap:20,flexWrap:'wrap',alignItems:'center'}}>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <span style={{fontSize:'0.82em',color:TEXT}}>🟡 Días para En riesgo</span>
            <button onClick={()=>setLimA(v=>Math.max(1,v-1))} style={{...S.btnSm(),padding:'3px 9px',fontSize:'1em'}}>−</button>
            <span style={{fontWeight:700,color:TEXT,minWidth:28,textAlign:'center'}}>{limA}</span>
            <button onClick={()=>setLimA(v=>v+1)} style={{...S.btnSm(),padding:'3px 9px',fontSize:'1em'}}>+</button>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <span style={{fontSize:'0.82em',color:TEXT}}>🔴 Días para Crítico</span>
            <button onClick={()=>setLimR(v=>Math.max(limA+1,v-1))} style={{...S.btnSm(),padding:'3px 9px',fontSize:'1em'}}>−</button>
            <span style={{fontWeight:700,color:TEXT,minWidth:28,textAlign:'center'}}>{limR}</span>
            <button onClick={()=>setLimR(v=>v+1)} style={{...S.btnSm(),padding:'3px 9px',fontSize:'1em'}}>+</button>
          </div>
        </div>
      </div>
      <div style={{display:'flex',gap:10,flexWrap:'wrap',marginBottom:14}}>
        <select style={{...S.input,cursor:'pointer'}} value={filtroProv} onChange={e=>setFiltroProv(e.target.value)}>
          <option value="">🏭 Todos los proveedores</option>
          {proveedores.map(p=><option key={p}>{p}</option>)}
        </select>
        <select style={{...S.input,cursor:'pointer'}} value={filtroEstado} onChange={e=>setFiltroEstado(e.target.value)}>
          {['Todos','Pendiente','Parcial'].map(e=><option key={e}>{e}</option>)}
        </select>
        <input style={{...S.input,flex:'1 1 200px'}} placeholder="🔍 Buscar por código o nombre..." value={busqueda} onChange={e=>setBusqueda(e.target.value)}/>
      </div>
      {loading?<div style={{textAlign:'center',padding:40,color:MUTED}}>Cargando...</div>
      :pendientes.length===0?<div style={{...S.card,textAlign:'center',color:'#68d391',padding:40}}>✅ Sin ítems pendientes.</div>
      :(
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.83em'}}>
            <thead><tr>
              {['Estado','● Días','Código','Nombre del producto','Proveedor','Orden / Lote','Cant. ordenada','Cant. recibida','Pendiente'].map(h=>(
                <th key={h} style={S.th}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {pendientes.map(it=>{
                const c=colorDias(it.dias,limA,limR)
                const lote=it.orden?.nombre_lote||it.orden?.id?.substring(0,10)||'—'
                return(
                  <tr key={it.id}>
                    <td style={S.td}><span style={S.badge(it.estado==='Parcial'?'#f6ad55':'#fc8181')}>🔴 {it.estado}</span></td>
                    <td style={S.td}><span style={{...S.badge(c),minWidth:42,textAlign:'center'}}>●{it.dias??'?'}d</span></td>
                    <td style={{...S.td,fontFamily:'monospace',fontSize:'0.77em',color:MUTED}}>{it.codigo_producto||'—'}</td>
                    <td style={{...S.td,maxWidth:260,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontWeight:500}}>{it.nombre_producto||'—'}</td>
                    <td style={S.td}>{it.orden?.proveedor||'—'}</td>
                    <td style={{...S.td,fontFamily:'monospace',fontSize:'0.77em'}}>{lote}</td>
                    <td style={{...S.td,textAlign:'right'}}>{it.cantidad_pedida||0}</td>
                    <td style={{...S.td,textAlign:'right',color:'#68d391'}}>{it.cantidad_recibida||0}</td>
                    <td style={{...S.td,textAlign:'right',fontWeight:700,color:'#f6ad55'}}>{it.pendiente}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div style={{fontSize:'0.75em',color:MUTED,marginTop:8,textAlign:'right'}}>{pendientes.length} ítem(s) pendientes</div>
        </div>
      )}
    </div>
  )
}

function TabHistorial({ordenes,items,loading,recargar}){
  const[detalle,setDetalle]=useState(null)
  const[msg,setMsg]=useState(null)
  const[busq,setBusq]=useState('')
  function mostrarMsg(t,tipo='ok'){setMsg({t,tipo});setTimeout(()=>setMsg(null),4000)}
  async function eliminarOrden(id){
    if(!confirm('¿Eliminar esta orden y todos sus ítems?'))return
    await supabase.from('ordenes_compra_items').delete().eq('orden_id',id)
    await supabase.from('ordenes_compra').delete().eq('id',id)
    setDetalle(null);mostrarMsg('Orden eliminada.');recargar()
  }
  async function marcarItemRecibido(itemId){
    await supabase.from('ordenes_compra_items').update({recibido:true,fecha_recibido:new Date().toISOString().split('T')[0]}).eq('id',itemId)
    mostrarMsg('Ítem marcado como recibido.');recargar()
  }
  const ordenesFilt=useMemo(()=>{
    if(!busq.trim())return ordenes
    const q=busq.toLowerCase()
    return ordenes.filter(o=>(o.proveedor||'').toLowerCase().includes(q)||(o.nombre_lote||'').toLowerCase().includes(q))
  },[ordenes,busq])
  if(detalle){
    const itsOrden=items.filter(it=>it.orden_id===detalle.id)
    const pendientes=itsOrden.filter(it=>!it.recibido).length
    return(
      <div>
        <button style={{...S.btnSm(),marginBottom:16}} onClick={()=>setDetalle(null)}>← Volver al historial</button>
        {msg&&<div style={{background:msg.tipo==='ok'?'#68d39122':'#fc818122',border:`1px solid ${msg.tipo==='ok'?'#68d391':'#fc8181'}55`,borderRadius:8,padding:'9px 14px',marginBottom:12,color:msg.tipo==='ok'?'#68d391':'#fc8181',fontSize:'0.84em'}}>{msg.tipo==='ok'?'✅':'❌'} {msg.t}</div>}
        <div style={S.card}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:10,marginBottom:16}}>
            <div>
              <div style={{fontWeight:700,color:'#fff',fontSize:'1.05em'}}>{detalle.proveedor||'Sin proveedor'}</div>
              <div style={{fontSize:'0.82em',color:MUTED,marginTop:3}}>Lote: {detalle.nombre_lote||detalle.id?.substring(0,12)} · Fecha: {detalle.fecha_orden?.substring(0,10)||'—'}</div>
            </div>
            <span style={S.badge(pendientes>0?'#f6ad55':'#68d391')}>{pendientes>0?`${pendientes} pendientes`:'✅ Completa'}</span>
          </div>
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.83em'}}>
              <thead><tr>{['Estado','Código','Producto','Cant. pedida','Cant. recibida','Pendiente','Fecha recibido','Acción'].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
              <tbody>
                {itsOrden.map(it=>{
                  const pend=(parseFloat(it.cantidad_pedida)||0)-(parseFloat(it.cantidad_recibida)||0)
                  return(
                    <tr key={it.id}>
                      <td style={S.td}><span style={S.badge(it.recibido?'#68d391':'#f6ad55')}>{it.recibido?'✅ Recibido':'⏳ Pendiente'}</span></td>
                      <td style={{...S.td,fontFamily:'monospace',fontSize:'0.77em',color:MUTED}}>{it.codigo_producto||'—'}</td>
                      <td style={{...S.td,maxWidth:240,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{it.nombre_producto||'—'}</td>
                      <td style={{...S.td,textAlign:'right'}}>{it.cantidad_pedida||0}</td>
                      <td style={{...S.td,textAlign:'right',color:'#68d391'}}>{it.cantidad_recibida||0}</td>
                      <td style={{...S.td,textAlign:'right',fontWeight:700,color:pend>0?'#f6ad55':'#68d391'}}>{pend}</td>
                      <td style={S.td}>{it.fecha_recibido||'—'}</td>
                      <td style={S.td}>{!it.recibido&&<button style={S.btnSm('#1a3a1a')} onClick={()=>marcarItemRecibido(it.id)}>✅ Recibido</button>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <hr style={{border:'none',borderTop:`1px solid ${BORDER}`,margin:'18px 0'}}/>
          <div style={{background:'#1a0a0a',border:'1px solid #fc818133',borderRadius:8,padding:'12px 16px'}}>
            <div style={{color:'#fc8181',fontWeight:600,fontSize:'0.82em',marginBottom:8}}>⚠️ Zona de peligro</div>
            <button style={S.btn('#7d1515')} onClick={()=>eliminarOrden(detalle.id)}>🗑️ Eliminar esta orden</button>
          </div>
        </div>
      </div>
    )
  }
  return(
    <div>
      <div style={{display:'flex',gap:10,alignItems:'center',marginBottom:14,flexWrap:'wrap'}}>
        <span style={{fontSize:'0.84em',color:MUTED}}>{ordenes.length} órdenes registradas</span>
        <input style={{...S.input,flex:'1 1 220px'}} placeholder="🔍 Buscar por proveedor o lote..." value={busq} onChange={e=>setBusq(e.target.value)}/>
      </div>
      {loading?<div style={{textAlign:'center',padding:40,color:MUTED}}>Cargando...</div>
      :ordenesFilt.length===0?<div style={{...S.card,textAlign:'center',color:MUTED,padding:40}}>Sin órdenes registradas. Creá órdenes desde Saturno.</div>
      :(
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.83em'}}>
            <thead><tr>{['Fecha','Lote / Nombre','Proveedor','Productos','Días cob.','Estado','Acción'].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
            <tbody>
              {ordenesFilt.map(o=>{
                const its=items.filter(it=>it.orden_id===o.id)
                const pend=its.filter(it=>!it.recibido).length
                const dias=o.dias_cobertura||o.dias_tribucion||'—'
                return(
                  <tr key={o.id} style={{cursor:'pointer'}} onClick={()=>setDetalle(o)}>
                    <td style={S.td}>{o.fecha_orden?.substring(0,10)||'—'}</td>
                    <td style={{...S.td,fontFamily:'monospace',fontSize:'0.8em',color:GOLD}}>{o.nombre_lote||o.id?.substring(0,14)||'—'}</td>
                    <td style={{...S.td,fontWeight:500}}>{o.proveedor||'—'}</td>
                    <td style={{...S.td,textAlign:'right'}}>{its.length}</td>
                    <td style={{...S.td,textAlign:'right'}}>{dias}</td>
                    <td style={S.td}><span style={S.badge(pend>0?'#f6ad55':'#68d391')}>{pend>0?`${pend} pend.`:'✅ Completa'}</span></td>
                    <td style={S.td}><button style={S.btnSm()} onClick={e=>{e.stopPropagation();setDetalle(o)}}>🔍 Ver</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function TabProcesar({ordenes,items,loading,recargar}){
  const[msg,setMsg]=useState(null)
  function mostrarMsg(t,tipo='ok'){setMsg({t,tipo});setTimeout(()=>setMsg(null),4000)}
  const pendientes=useMemo(()=>{
    return items.filter(it=>!it.recibido).map(it=>{
      const orden=ordenes.find(o=>o.id===it.orden_id)
      const dias=diasDesde(orden?.fecha_orden)
      const pendiente=(parseFloat(it.cantidad_pedida)||0)-(parseFloat(it.cantidad_recibida)||0)
      return{...it,orden,dias,pendiente}
    }).sort((a,b)=>(b.dias||0)-(a.dias||0))
  },[items,ordenes])
  const ordenesActivas=ordenes.filter(o=>items.filter(it=>it.orden_id===o.id&&!it.recibido).length>0).length
  const recibidos=items.filter(it=>it.recibido).length
  async function marcarRecibido(itemId){
    await supabase.from('ordenes_compra_items').update({recibido:true,fecha_recibido:new Date().toISOString().split('T')[0]}).eq('id',itemId)
    mostrarMsg('Ítem confirmado como recibido.');recargar()
  }
  return(
    <div>
      {msg&&<div style={{background:msg.tipo==='ok'?'#68d39122':'#fc818122',border:`1px solid ${msg.tipo==='ok'?'#68d391':'#fc8181'}55`,borderRadius:8,padding:'9px 14px',marginBottom:12,color:msg.tipo==='ok'?'#68d391':'#fc8181',fontSize:'0.84em'}}>{msg.tipo==='ok'?'✅':'❌'} {msg.t}</div>}
      <div style={{...S.card,marginBottom:16}}>
        <div style={{fontWeight:600,color:'#fff',marginBottom:8}}>📥 Procesar ítems recibidos</div>
        <div style={{fontSize:'0.84em',color:MUTED,marginBottom:16}}>Marcá los ítems como recibidos para cerrar el ciclo de trazabilidad.</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12}}>
          {[['📋 Órdenes activas',ordenesActivas,'#63b3ed'],['📦 Ítems pendientes',pendientes.length,'#f6ad55'],['✅ Ítems recibidos',recibidos,'#68d391']].map(([l,v,c])=>(
            <div key={l} style={{background:BG,border:`1px solid ${c}33`,borderRadius:8,padding:'12px',textAlign:'center'}}>
              <div style={{fontSize:'0.7em',color:MUTED}}>{l}</div>
              <div style={{fontSize:'1.5em',fontWeight:700,color:c}}>{v}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={S.card}>
        <div style={{fontWeight:600,color:GOLD,fontSize:'0.85em',marginBottom:12}}>📦 Ítems pendientes de confirmar recepción</div>
        {loading?<div style={{textAlign:'center',padding:30,color:MUTED}}>Cargando...</div>
        :pendientes.length===0?<div style={{textAlign:'center',color:'#68d391',padding:30}}>✅ Todos los ítems han sido recibidos.</div>
        :(
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.83em'}}>
              <thead><tr>{['Producto','Código','Proveedor','Cant. pedida','Cant. recibida','Pendiente','Días en espera','Acción'].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
              <tbody>
                {pendientes.map(it=>(
                  <tr key={it.id}>
                    <td style={{...S.td,maxWidth:220,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontWeight:500}}>{it.nombre_producto||'—'}</td>
                    <td style={{...S.td,fontFamily:'monospace',fontSize:'0.77em',color:MUTED}}>{it.codigo_producto||'—'}</td>
                    <td style={S.td}>{it.orden?.proveedor||'—'}</td>
                    <td style={{...S.td,textAlign:'right'}}>{it.cantidad_pedida||0}</td>
                    <td style={{...S.td,textAlign:'right',color:'#68d391'}}>{it.cantidad_recibida||0}</td>
                    <td style={{...S.td,textAlign:'right',fontWeight:700,color:'#f6ad55'}}>{it.pendiente}</td>
                    <td style={S.td}><span style={S.badge(colorDias(it.dias,10,20))}>{it.dias??'?'}d</span></td>
                    <td style={S.td}><button style={S.btn('#1a5a1a')} onClick={()=>marcarRecibido(it.id)}>✅ Confirmar recepción</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

export default function NehemiasPage(){
  const[tab,setTab]=useState(0)
  const[ordenes,setOrdenes]=useState([])
  const[items,setItems]=useState([])
  const[loading,setLoading]=useState(true)
  async function cargar(){
    setLoading(true)
    const[{data:ords},{data:its}]=await Promise.all([
      supabase.from('ordenes_compra').select('*').order('fecha_orden',{ascending:false}),
      supabase.from('ordenes_compra_items').select('*'),
    ])
    setOrdenes(ords||[]);setItems(its||[]);setLoading(false)
  }
  useEffect(()=>{cargar()},[])
  const tabs=[['🚨 Alertas de Pendientes',0],['📋 Historial de Órdenes',1],['🔄 Procesar Compras Recibidas',2]]
  return(
    <div style={{fontFamily:'DM Sans,sans-serif',color:TEXT}}>
      <div style={{marginBottom:6}}>
        <span style={{fontSize:'0.7rem',fontWeight:700,letterSpacing:'0.1em',textTransform:'uppercase',color:GOLD,display:'block',marginBottom:4}}>Trazabilidad · Órdenes</span>
        <h1 style={{fontSize:'1.7rem',fontWeight:700,color:'#fff',letterSpacing:'-0.03em',lineHeight:1.2,marginBottom:4}}>🔴 Nehemías – Trazabilidad</h1>
        <p style={{fontSize:'0.875rem',color:MUTED}}>Los muros reconstruidos · Registro permanente de lo que se ordenó y lo que llegó</p>
      </div>
      <div style={{fontSize:'0.78em',color:MUTED,marginBottom:20}}>⬤ Sesión activa · {new Date().toLocaleDateString('es-CR')} · Los datos se actualizan al generar nuevas órdenes desde Saturno</div>
      <div style={{display:'flex',gap:4,marginBottom:24,borderBottom:`1px solid ${BORDER}`,overflowX:'auto'}}>
        {tabs.map(([label,idx])=>(
          <button key={idx} onClick={()=>setTab(idx)} style={{padding:'10px 18px',border:'none',background:'none',cursor:'pointer',fontSize:'0.87em',fontWeight:tab===idx?700:400,color:tab===idx?GOLD:MUTED,borderBottom:tab===idx?`2px solid ${GOLD}`:'2px solid transparent',marginBottom:-1,whiteSpace:'nowrap',fontFamily:'DM Sans,sans-serif'}}>
            {label}
          </button>
        ))}
      </div>
      {tab===0&&<TabAlertas ordenes={ordenes} items={items} loading={loading}/>}
      {tab===1&&<TabHistorial ordenes={ordenes} items={items} loading={loading} recargar={cargar}/>}
      {tab===2&&<TabProcesar ordenes={ordenes} items={items} loading={loading} recargar={cargar}/>}
      <div style={{marginTop:24,fontSize:'0.7rem',color:'#3a4150',textAlign:'right'}}>Actualizado: {new Date().toLocaleString('es-CR')}</div>
    </div>
  )
}
