'use client'
import { useEffect, useState, useMemo, useCallback } from 'react'
import { supabase } from '../../lib/supabase'

const GOLD='#c8a84b'
const fmtCRC=v=>{if(!v&&v!==0)return'—';const n=parseFloat(v);if(isNaN(n))return'—';return`₡${n.toLocaleString('es-CR',{minimumFractionDigits:0,maximumFractionDigits:0})}`}
const EC={'Sin existencias':{c:'#f43f5e',b:'#fff1f2'},'Solicitar':{c:'#f59e0b',b:'#fffbeb'},'Óptimo':{c:'#10b981',b:'#f0fdf4'},'Sobre stock':{c:'#0284c7',b:'#f0f9ff'}}
const AC={'🔴 Bajo stock':'#f43f5e','🔴 Bajo stock 🚢':'#f43f5e','🟠 En tránsito':'#f97316','🟡 Prestar atención':'#f59e0b','🟢 Óptimo':'#10b981'}
const IS={border:'1px solid #e0e3ea',borderRadius:8,padding:'7px 12px',fontSize:'0.82rem',background:'#fff',color:'#1a1d24',outline:'none'}
const btnO=(c='#1a1d24')=>({padding:'7px 16px',borderRadius:8,border:`1.5px solid ${c}`,background:'#fff',cursor:'pointer',color:c,fontSize:'0.82rem',fontWeight:600})
const btnA={padding:'7px 18px',borderRadius:8,border:'none',background:GOLD,cursor:'pointer',color:'#fff',fontSize:'0.82rem',fontWeight:700}
const btnV={padding:'7px 18px',borderRadius:8,border:'none',background:'#10b981',cursor:'pointer',color:'#fff',fontSize:'0.82rem',fontWeight:700}
const btnB={padding:'7px 18px',borderRadius:8,border:'none',background:'#0284c7',cursor:'pointer',color:'#fff',fontSize:'0.82rem',fontWeight:700}

function Badge({t}){const c=EC[t]||{c:'#888',b:'#f5f5f5'};return<span style={{background:c.b,color:c.c,fontSize:'0.68rem',fontWeight:700,padding:'2px 8px',borderRadius:20,whiteSpace:'nowrap'}}>{t}</span>}
function AB({t}){return<span style={{fontSize:'0.68rem',fontWeight:700,color:AC[t]||'#888'}}>{t}</span>}
function SBar({e,mn,mx}){const ev=parseFloat(e)||0,minv=parseFloat(mn)||0,maxv=parseFloat(mx)||0;if(maxv<=0)return<span style={{fontSize:'0.78rem',color:'#3a4150'}}>{ev}</span>;const pct=Math.min((ev/maxv)*100,100),color=ev<minv?'#f43f5e':ev<minv*1.5?'#f59e0b':'#10b981';return<div style={{display:'flex',alignItems:'center',gap:6}}><div style={{width:48,height:5,background:'#e8eaed',borderRadius:3,overflow:'hidden',flexShrink:0}}><div style={{width:`${pct}%`,height:'100%',background:color,borderRadius:3}}/></div><span style={{fontSize:'0.78rem',color:'#3a4150'}}>{ev}</span></div>}

const TH=({children,style})=><span style={{fontSize:'0.63rem',fontWeight:700,letterSpacing:'0.07em',textTransform:'uppercase',color:'#9ba3b5',...style}}>{children}</span>

// ═══════════════════════════════════════════════════
// TAB 1: INVENTARIO
// ═══════════════════════════════════════════════════
function TabInventario(){
  const[loading,setLoading]=useState(true),[data,setData]=useState([]),[search,setSearch]=useState(''),[fE,setFE]=useState('Todos'),[fC,setFC]=useState('Todas'),[periodo,setPeriodo]=useState(''),[pg,setPg]=useState(0)
  const PER=50
  useEffect(()=>{
    async function go(){
      setLoading(true)
      const{data:lat}=await supabase.from('neo_minimos_maximos').select('fecha_carga,periodo_reporte').order('fecha_carga',{ascending:false}).limit(1)
      if(!lat?.length){setLoading(false);return}
      const fc=lat[0].fecha_carga;setPeriodo(lat[0].periodo_reporte||fc?.slice(0,10)||'')
      let all=[],off=0
      while(true){
        const{data:c}=await supabase.from('neo_minimos_maximos').select('codigo,nombre,categoria,minimo,existencias,maximo,ultimo_proveedor,ultimo_costo,promedio_mensual,estatus').eq('fecha_carga',fc).range(off,off+999)
        if(!c?.length)break;all=all.concat(c);if(c.length<1000)break;off+=1000
      }
      setData(all);setLoading(false)
    }
    go()
  },[])
  const cats=useMemo(()=>['Todas',...Array.from(new Set(data.map(r=>r.categoria).filter(Boolean))).sort()],[data])
  const filt=useMemo(()=>{let d=data;if(fE!=='Todos')d=d.filter(r=>r.estatus===fE);if(fC!=='Todas')d=d.filter(r=>r.categoria===fC);if(search.trim()){const q=search.toLowerCase();d=d.filter(r=>(r.nombre||'').toLowerCase().includes(q)||(r.codigo||'').toLowerCase().includes(q)||(r.ultimo_proveedor||'').toLowerCase().includes(q))}return d},[data,fE,fC,search])
  const paged=filt.slice(pg*PER,(pg+1)*PER),tPg=Math.ceil(filt.length/PER)
  const cnt=useMemo(()=>{const c={'Sin existencias':0,'Solicitar':0,'Óptimo':0,'Sobre stock':0};data.forEach(r=>{if(c[r.estatus]!==undefined)c[r.estatus]++});return c},[data])
  return(
    <div>
      <p style={{fontSize:'0.82rem',color:'#6a7288',marginBottom:16}}>{loading?'Cargando...':`${data.length.toLocaleString()} productos · Período: ${periodo}`}</p>
      {!loading&&<div style={{display:'flex',gap:10,flexWrap:'wrap',marginBottom:20}}>
        {[['Sin existencias','#f43f5e'],['Solicitar','#f59e0b'],['Óptimo','#10b981'],['Sobre stock','#0284c7']].map(([l,c])=>(
          <button key={l} onClick={()=>{setFE(fE===l?'Todos':l);setPg(0)}} style={{display:'flex',alignItems:'center',gap:7,background:fE===l?c+'18':'#fff',border:`1.5px solid ${fE===l?c:'#e0e3ea'}`,borderRadius:20,padding:'5px 13px',cursor:'pointer',fontSize:'0.78rem',fontWeight:600,color:fE===l?c:'#5a6573'}}>
            <span style={{width:7,height:7,borderRadius:'50%',background:c,display:'inline-block'}}/>{l} <strong>{cnt[l]}</strong>
          </button>
        ))}
      </div>}
      <div style={{display:'flex',gap:10,flexWrap:'wrap',marginBottom:12}}>
        <input style={{...IS,flex:'1 1 200px'}} placeholder="🔍  Buscar por nombre, código o proveedor..." value={search} onChange={e=>{setSearch(e.target.value);setPg(0)}}/>
        <select style={{...IS,cursor:'pointer'}} value={fC} onChange={e=>{setFC(e.target.value);setPg(0)}}>{cats.map(c=><option key={c}>{c}</option>)}</select>
      </div>
      {!loading&&<p style={{fontSize:'0.72rem',color:'#9ba3b5',marginBottom:8}}>{filt.length.toLocaleString()} productos · página {pg+1} de {tPg||1}</p>}
      <div style={{background:'#fff',border:'1px solid #e8eaed',borderRadius:14,overflow:'hidden',boxShadow:'0 1px 4px rgba(0,0,0,0.04)'}}>
        <div style={{display:'grid',gridTemplateColumns:'110px 1fr 130px 90px 145px 100px',background:'#f7f8fa',borderBottom:'1px solid #e8eaed',padding:'10px 16px',gap:8}}>
          {['Código','Nombre','Categoría','Stock','Proveedor','Estatus'].map(h=><TH key={h}>{h}</TH>)}
        </div>
        {loading?<div style={{padding:40,textAlign:'center',color:'#b0b8cc'}}>Cargando inventario...</div>
          :filt.length===0?<div style={{padding:40,textAlign:'center',color:'#b0b8cc'}}>Sin resultados</div>
          :paged.map((r,i)=>(
          <div key={i} style={{display:'grid',gridTemplateColumns:'110px 1fr 130px 90px 145px 100px',padding:'9px 16px',alignItems:'center',borderBottom:i<paged.length-1?'1px solid #f0f2f5':'none',background:i%2===0?'#fff':'#fafbfc',gap:8}}>
            <span style={{fontSize:'0.72rem',color:'#8a91a5',fontFamily:'monospace'}}>{r.codigo}</span>
            <span style={{fontSize:'0.82rem',color:'#1a1d24',fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.nombre}</span>
            <span style={{fontSize:'0.72rem',color:'#6a7288',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.categoria||'—'}</span>
            <SBar e={r.existencias} mn={r.minimo} mx={r.maximo}/>
            <span style={{fontSize:'0.70rem',color:'#6a7288',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.ultimo_proveedor||'—'}</span>
            <Badge t={r.estatus||'—'}/>
          </div>
        ))}
      </div>
      {!loading&&tPg>1&&<div style={{display:'flex',justifyContent:'center',gap:8,marginTop:16}}>
        <button onClick={()=>setPg(p=>Math.max(0,p-1))} disabled={pg===0} style={{...btnO(),opacity:pg===0?0.4:1}}>← Anterior</button>
        <span style={{padding:'6px 12px',fontSize:'0.82rem',color:'#6a7288'}}>{pg+1} / {tPg}</span>
        <button onClick={()=>setPg(p=>Math.min(tPg-1,p+1))} disabled={pg>=tPg-1} style={{...btnO(),opacity:pg>=tPg-1?0.4:1}}>Siguiente →</button>
      </div>}
    </div>
  )
}

// ═══════════════════════════════════════════════════
// TAB 2: SUGERENCIA DE COMPRAS
// ═══════════════════════════════════════════════════
function TabCompras(){
  const[dias,setDias]=useState(30),[loading,setLoading]=useState(false),[datos,setDatos]=useState(null)
  const[pausados,setPausados]=useState(new Set()),[sel,setSel]=useState(new Set()),[cants,setCants]=useState({})
  const[exp,setExp]=useState(null),[guardadas,setGuardadas]=useState(new Set()),[expandidos,setExpandidos]=useState(new Set())
  const[pausando,setPausando]=useState(null),[motivo,setMotivo]=useState('')

  const calcular=useCallback(async()=>{
    setLoading(true);setDatos(null);setSel(new Set());setCants({});setGuardadas(new Set())
    try{
      const r=await fetch('/api/sugerencias',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({dias})})
      const j=await r.json();if(j.error){alert('Error: '+j.error);return}
      setDatos(j);setPausados(new Set(j.pausados||[]))
      const ci={};for(const i of j.resultados){if(!ci[i.proveedor])ci[i.proveedor]={};ci[i.proveedor][i.codigo]=i.cantidad}
      setCants(ci);setSel(new Set([...new Set(j.resultados.map(r=>r.proveedor).filter(p=>!(j.pausados||[]).includes(p)))]))
    }catch(e){alert(e.message)}finally{setLoading(false)}
  },[dias])

  const pItems=useMemo(()=>{if(!datos)return{};const g={};for(const i of datos.resultados){if(!g[i.proveedor])g[i.proveedor]=[];g[i.proveedor].push(i)}return g},[datos])
  const pAct=useMemo(()=>Object.keys(pItems).filter(p=>!pausados.has(p)).sort(),[pItems,pausados])
  const pPaus=useMemo(()=>Object.keys(pItems).filter(p=>pausados.has(p)).sort(),[pItems,pausados])
  const totProd=useMemo(()=>pAct.reduce((s,p)=>s+(pItems[p]?.length||0),0),[pAct,pItems])
  const valEst=useMemo(()=>{if(!datos)return 0;return datos.resultados.filter(r=>!pausados.has(r.proveedor)).reduce((s,r)=>s+(cants[r.proveedor]?.[r.codigo]??r.cantidad)*(r.ultimo_costo||0),0)},[datos,pausados,cants])

  const dlExcel=async(prov)=>{
    const items=(pItems[prov]||[]).map(i=>({...i,cantidad:cants[prov]?.[i.codigo]??i.cantidad})).filter(i=>(i.cantidad||0)>0)
    if(!items.length)return;setExp(prov)
    try{const r=await fetch('/api/exportar-excel',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items,proveedor:prov})});const b=await r.blob();const u=URL.createObjectURL(b);const a=document.createElement('a');a.href=u;a.download=`OC_${prov.substring(0,30)}_${new Date().toISOString().slice(0,10)}.xlsx`;a.click();URL.revokeObjectURL(u)}
    finally{setExp(null)}
  }
  const dlZip=async()=>{
    const pl=pAct.filter(p=>sel.has(p)).map(p=>({nombre:p,items:(pItems[p]||[]).map(i=>({...i,cantidad:cants[p]?.[i.codigo]??i.cantidad})).filter(i=>(i.cantidad||0)>0)})).filter(p=>p.items.length>0)
    if(!pl.length)return;setExp('zip')
    try{const r=await fetch('/api/exportar-zip',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({proveedores:pl})});const b=await r.blob();const u=URL.createObjectURL(b);const a=document.createElement('a');a.href=u;a.download=`Ordenes_${new Date().toISOString().slice(0,10)}.zip`;a.click();URL.revokeObjectURL(u)}
    finally{setExp(null)}
  }
  const dlPropuesta=async()=>{
    if(!datos)return;setExp('propuesta')
    try{
      const activos=datos.resultados.filter(r=>!pausados.has(r.proveedor))
      const r=await fetch('/api/exportar-propuesta',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({resultados:activos})})
      const b=await r.blob();const u=URL.createObjectURL(b);const a=document.createElement('a');a.href=u;a.download=`Sugerencia_Compras_${new Date().toISOString().slice(0,10)}.xlsx`;a.click();URL.revokeObjectURL(u)
    }finally{setExp(null)}
  }
  const guardar=async(prov)=>{
    const items=(pItems[prov]||[]).map(i=>({...i,cantidad:cants[prov]?.[i.codigo]??i.cantidad})).filter(i=>(i.cantidad||0)>0)
    if(!items.length)return
    const r=await fetch('/api/guardar-orden',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items,nombreLote:`OC_${prov.substring(0,30)}_${new Date().toISOString().slice(0,10)}`,diasTribucion:dias})})
    const j=await r.json();if(j.ok)setGuardadas(p=>new Set([...p,prov]));else alert('Error: '+j.error)
  }
  const pausar=async(p)=>{
    await fetch('/api/proveedores-pausados',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({accion:'pausar',proveedor:p,motivo})})
    setPausados(prev=>new Set([...prev,p]));setSel(prev=>{const s=new Set(prev);s.delete(p);return s});setPausando(null);setMotivo('')
  }
  const reactivar=async(p)=>{
    await fetch('/api/proveedores-pausados',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({accion:'reactivar',proveedor:p})})
    setPausados(prev=>{const s=new Set(prev);s.delete(p);return s})
  }

  if(!datos) return(
    <div>
      <p style={{fontSize:'0.84rem',color:'#6a7288',marginBottom:20}}>Calculá los productos que necesitás ordenar según días de cobertura.</p>
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:24,flexWrap:'wrap'}}>
        <span style={{fontSize:'0.85rem',fontWeight:600,color:'#3a4150'}}>Días a cubrir</span>
        <button onClick={()=>setDias(d=>Math.max(7,d-1))} style={{...btnO(),padding:'5px 12px',fontSize:'1rem'}}>−</button>
        <span style={{fontSize:'1.3rem',fontWeight:700,color:'#1a1d24',minWidth:40,textAlign:'center'}}>{dias}</span>
        <button onClick={()=>setDias(d=>d+1)} style={{...btnO(),padding:'5px 12px',fontSize:'1rem'}}>+</button>
        <button onClick={calcular} disabled={loading} style={{...btnA,opacity:loading?0.6:1}}>{loading?'Calculando...':'⚡ Calcular propuesta'}</button>
      </div>
      {loading&&<div style={{padding:40,textAlign:'center',color:'#b0b8cc'}}>Calculando sugerencias...</div>}
    </div>
  )

  const nSel=pAct.filter(p=>sel.has(p)).length
  return(
    <div>
      {/* controles superiores */}
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14,flexWrap:'wrap'}}>
        <span style={{fontSize:'0.85rem',fontWeight:600,color:'#3a4150'}}>Días a cubrir</span>
        <button onClick={()=>setDias(d=>Math.max(7,d-1))} style={{...btnO(),padding:'4px 10px',fontSize:'1rem'}}>−</button>
        <span style={{fontSize:'1.2rem',fontWeight:700,color:'#1a1d24',minWidth:36,textAlign:'center'}}>{dias}</span>
        <button onClick={()=>setDias(d=>d+1)} style={{...btnO(),padding:'4px 10px',fontSize:'1rem'}}>+</button>
        <button onClick={calcular} style={btnA}>⚡ Recalcular</button>
        <button onClick={dlPropuesta} disabled={exp==='propuesta'} style={{...btnB,opacity:exp==='propuesta'?0.5:1}}>{exp==='propuesta'?'⏳ Generando...':'📊 Descargar propuesta completa Excel'}</button>
      </div>

      {/* banner tránsito */}
      {datos.transitoProductos>0&&(
        <div style={{background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:10,padding:'10px 16px',marginBottom:16,fontSize:'0.82rem',color:'#1e40af'}}>
          🚢 <strong>{datos.transitoProductos} productos en tránsito</strong> ({(datos.transitoUnidades||0).toLocaleString()} unidades en camino). La columna <strong>"En tránsito"</strong> muestra el pendiente por código — <strong>"Cantidad a comprar"</strong> ya lo descuenta automáticamente.
        </div>
      )}

      {/* KPIs */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))',gap:12,marginBottom:20}}>
        {[['Productos a ordenar',totProd],['Proveedores activos',pAct.length],['Pausados',pPaus.length],['Valor estimado',fmtCRC(valEst)]].map(([l,v])=>(
          <div key={l} style={{background:'#fff',border:'1px solid #e8eaed',borderRadius:12,padding:'13px 15px'}}>
            <div style={{fontSize:'0.62rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.07em',color:'#9ba3b5',marginBottom:4}}>{l}</div>
            <div style={{fontSize:'1.25rem',fontWeight:700,color:'#1a1d24'}}>{v}</div>
          </div>
        ))}
      </div>

      {/* selección masiva */}
      <div style={{display:'flex',gap:10,flexWrap:'wrap',marginBottom:14}}>
        <button onClick={()=>setSel(new Set(pAct))} style={btnO()}>☑️ Seleccionar todos</button>
        <button onClick={()=>setSel(new Set())} style={btnO()}>⬜ Deseleccionar todos</button>
      </div>

      <p style={{fontSize:'0.85rem',fontWeight:700,color:'#3a4150',marginBottom:2}}>Proveedores con productos a ordenar</p>
      <p style={{fontSize:'0.75rem',color:'#9ba3b5',marginBottom:12}}>Abrí cada proveedor para revisar y ajustar cantidades. Marcá los que querés exportar.</p>

      {pAct.map(prov=>{
        const items=pItems[prov]||[], vp=items.reduce((s,r)=>s+(cants[prov]?.[r.codigo]??r.cantidad)*(r.ultimo_costo||0),0)
        const isSel=sel.has(prov), isExp=expandidos.has(prov), isG=guardadas.has(prov)
        return(
          <div key={prov} style={{border:'1px solid #e8eaed',borderRadius:12,marginBottom:8,overflow:'hidden',background:'#fff'}}>
            <div style={{display:'flex',alignItems:'center',gap:12,padding:'11px 16px',cursor:'pointer',background:isSel?'#f0fdf4':'#fff'}}
              onClick={()=>setExpandidos(p=>{const s=new Set(p);s.has(prov)?s.delete(prov):s.add(prov);return s})}>
              <input type="checkbox" checked={isSel} onChange={e=>{e.stopPropagation();setSel(p=>{const s=new Set(p);e.target.checked?s.add(prov):s.delete(prov);return s})}} style={{width:16,height:16,accentColor:GOLD,cursor:'pointer'}}/>
              <span style={{flex:1,fontSize:'0.88rem',fontWeight:700,color:'#1a1d24'}}>{isSel?'✅':'⬜'} {prov}</span>
              <span style={{fontSize:'0.77rem',color:'#6a7288'}}>{items.length} productos · {fmtCRC(vp)}</span>
              <span style={{fontSize:'0.8rem',color:'#9ba3b5'}}>{isExp?'▲':'▼'}</span>
            </div>
            {isExp&&(
              <div style={{borderTop:'1px solid #f0f2f5',padding:'12px 16px'}}>
                <div style={{overflowX:'auto',marginBottom:12}}>
                  <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.81rem'}}>
                    <thead><tr style={{background:'#f7f8fa'}}>
                      {['Código','Nombre','Exist.','Tránsito','Cantidad','Costo','Alerta'].map(h=><th key={h} style={{padding:'7px 10px',textAlign:'left',fontSize:'0.62rem',fontWeight:700,letterSpacing:'0.07em',textTransform:'uppercase',color:'#9ba3b5',whiteSpace:'nowrap'}}>{h}</th>)}
                    </tr></thead>
                    <tbody>{items.map((item,i)=>(
                      <tr key={item.codigo} style={{borderTop:'1px solid #f0f2f5',background:i%2===0?'#fff':'#fafbfc'}}>
                        <td style={{padding:'6px 10px',fontFamily:'monospace',fontSize:'0.70rem',color:'#8a91a5'}}>{item.codigo}</td>
                        <td style={{padding:'6px 10px',color:'#1a1d24',maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.nombre}</td>
                        <td style={{padding:'6px 10px',color:'#6a7288',textAlign:'center'}}>{item.existencias}</td>
                        <td style={{padding:'6px 10px',color:'#0284c7',textAlign:'center'}}>{item.transito>0?`🚢 ${item.transito}`:'–'}</td>
                        <td style={{padding:'6px 10px'}}>
                          <input type="number" min="0" value={cants[prov]?.[item.codigo]??item.cantidad}
                            onChange={e=>setCants(p=>({...p,[prov]:{...(p[prov]||{}),[item.codigo]:parseInt(e.target.value)||0}}))}
                            style={{width:70,...IS,padding:'4px 8px',textAlign:'center'}}/>
                        </td>
                        <td style={{padding:'6px 10px',color:'#6a7288'}}>{fmtCRC(item.ultimo_costo)}</td>
                        <td style={{padding:'6px 10px'}}><AB t={item.alerta}/></td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
                <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
                  <button onClick={()=>dlExcel(prov)} disabled={exp===prov} style={{...btnA,opacity:exp===prov?0.6:1}}>{exp===prov?'Generando...':'📄 Descargar OC Excel'}</button>
                  {!isG?<button onClick={()=>guardar(prov)} style={btnV}>✅ Registrar en trazabilidad</button>:<span style={{fontSize:'0.82rem',color:'#10b981',fontWeight:600}}>✅ Registrada</span>}
                  {pausando===prov?(
                    <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
                      <input placeholder="Motivo (opcional)" value={motivo} onChange={e=>setMotivo(e.target.value)} style={{...IS,width:180}}/>
                      <button onClick={()=>pausar(prov)} style={btnO('#f43f5e')}>✅ Confirmar pausa</button>
                      <button onClick={()=>setPausando(null)} style={btnO()}>❌ Cancelar</button>
                    </div>
                  ):<button onClick={()=>setPausando(prov)} style={btnO('#f59e0b')}>⏸️ Pausar</button>}
                </div>
              </div>
            )}
          </div>
        )
      })}

      {pAct.length>0&&(
        <div style={{background:'#fff',border:'1px solid #e8eaed',borderRadius:12,padding:'16px',marginTop:16}}>
          <p style={{fontSize:'0.88rem',fontWeight:700,color:'#1a1d24',marginBottom:12}}>Acciones masivas — {nSel} proveedor(es) seleccionado(s)</p>
          <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
            <button onClick={dlZip} disabled={nSel===0||exp==='zip'} style={{...btnA,opacity:nSel===0||exp==='zip'?0.5:1}}>{exp==='zip'?'⏳ Generando ZIP...':`📦 Exportar órdenes ZIP (${nSel} proveedores)`}</button>
            <button onClick={dlPropuesta} disabled={exp==='propuesta'} style={{...btnB,opacity:exp==='propuesta'?0.5:1}}>📊 Descargar propuesta completa Excel</button>
          </div>
        </div>
      )}

      {pPaus.length>0&&(
        <div style={{marginTop:16}}>
          <p style={{fontSize:'0.82rem',fontWeight:700,color:'#9ba3b5',marginBottom:8}}>⏸️ Proveedores pausados ({pPaus.length})</p>
          {pPaus.map(p=>(
            <div key={p} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 14px',background:'#fff',border:'1px solid #e8eaed',borderRadius:9,marginBottom:6}}>
              <span style={{flex:1,fontSize:'0.84rem',color:'#6a7288'}}>{p}</span>
              <button onClick={()=>reactivar(p)} style={btnO('#10b981')}>▶️ Reactivar</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════
// TAB 3: ORDEN MANUAL
// ═══════════════════════════════════════════════════
function TabManual(){
  const[loading,setLoading]=useState(true),[todos,setTodos]=useState([]),[search,setSearch]=useState('')
  const[orden,setOrden]=useState([]),[selCods,setSelCods]=useState(new Set())
  const[nombreOrden,setNombreOrden]=useState(''),[dividir,setDividir]=useState(true),[maxLote,setMaxLote]=useState(20)
  const[exporting,setExporting]=useState(false),[descarga,setDescarga]=useState(null),[guardada,setGuardada]=useState(false)
  const dias=30

  useEffect(()=>{
    async function go(){
      const{data:lat}=await supabase.from('neo_minimos_maximos').select('fecha_carga').order('fecha_carga',{ascending:false}).limit(1)
      if(!lat?.length){setLoading(false);return}
      const fc=lat[0].fecha_carga;let all=[],off=0
      while(true){const{data:c}=await supabase.from('neo_minimos_maximos').select('codigo,nombre,categoria,existencias,minimo,maximo,ultimo_proveedor,ultimo_costo,promedio_mensual,estatus').eq('fecha_carga',fc).range(off,off+999);if(!c?.length)break;all=all.concat(c);if(c.length<1000)break;off+=1000}
      setTodos(all);setLoading(false)
    }
    go()
  },[])

  const filt=useMemo(()=>{if(!search.trim())return todos;const q=search.toLowerCase();return todos.filter(r=>(r.nombre||'').toLowerCase().includes(q)||(r.codigo||'').toLowerCase().includes(q)||(r.ultimo_proveedor||'').toLowerCase().includes(q))},[todos,search])

  const toggleCod=useCallback((cod)=>setSelCods(p=>{const s=new Set(p);s.has(cod)?s.delete(cod):s.add(cod);return s}),[])

  const agregar=()=>{
    const exist=new Set(orden.map(o=>String(o.codigo)))
    const nuevos=todos.filter(r=>selCods.has(String(r.codigo))&&!exist.has(String(r.codigo))).map(r=>({codigo:r.codigo,nombre:r.nombre,proveedor:r.ultimo_proveedor||'',cantidad:1,costo:parseFloat(r.ultimo_costo)||0,descuento:0}))
    setOrden(p=>[...p,...nuevos]);setSelCods(new Set());setDescarga(null);setGuardada(false)
  }

  const cerrar=async()=>{
    if(!orden.length)return;setExporting(true);setDescarga(null)
    try{
      const nombre=nombreOrden.trim()||new Date().toISOString().slice(0,10)
      const items=orden.map(o=>({codigo:o.codigo,nombre:o.nombre,proveedor:o.proveedor,cantidad:o.cantidad,ultimo_costo:o.costo,descuento:o.descuento||0}))
      let url,fname
      if(!dividir||items.length<=maxLote){
        const r=await fetch('/api/exportar-excel',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items,proveedor:nombre})})
        const b=await r.blob();url=URL.createObjectURL(b);fname=`Orden_${nombre}_${new Date().toISOString().slice(0,10)}.xlsx`
        setDescarga({tipo:'single',url,nombre:fname})
      }else{
        const lotes=[];for(let i=0;i<items.length;i+=maxLote)lotes.push(items.slice(i,i+maxLote))
        const lotesData=lotes.map((l,i)=>({nombre:`Orden_${nombre}_lote${i+1}de${lotes.length}_${new Date().toISOString().slice(0,10)}.xlsx`,items:l}))
        const r=await fetch('/api/exportar-zip',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({lotes:lotesData,nombre:`Orden_${nombre}_TODOS_LOS_LOTES.zip`})})
        const b=await r.blob();url=URL.createObjectURL(b);fname=`Orden_${nombre}_TODOS_LOS_LOTES.zip`
        setDescarga({tipo:'zip',url,nombre:fname,lotes:lotes.length,maxLote})
      }
      // registrar en Supabase
      const r2=await fetch('/api/guardar-orden',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items,nombreLote:nombre,diasTribucion:dias})})
      const j=await r2.json();if(j.ok)setGuardada(true)
    }catch(e){alert(e.message)}finally{setExporting(false)}
  }

  return(
    <div>
      {/* buscador */}
      <input style={{...IS,width:'100%',marginBottom:12}} placeholder="🔍 Buscar por código, nombre o proveedor..." value={search} onChange={e=>setSearch(e.target.value)}/>

      {/* tabla selección */}
      <div style={{background:'#fff',border:'1px solid #e8eaed',borderRadius:14,overflow:'hidden',marginBottom:10}}>
        <div style={{display:'grid',gridTemplateColumns:'32px 110px 1fr 120px 88px',background:'#f7f8fa',borderBottom:'1px solid #e8eaed',padding:'9px 14px',gap:8}}>
          <TH></TH>{['Código','Nombre','Proveedor','Stock'].map(h=><TH key={h}>{h}</TH>)}
        </div>
        <div style={{maxHeight:340,overflowY:'auto'}}>
          {loading?<div style={{padding:40,textAlign:'center',color:'#b0b8cc'}}>Cargando...</div>
            :filt.slice(0,200).map((r,i)=>{
              const cod=String(r.codigo),chk=selCods.has(cod)
              return(
                <div key={i} onClick={()=>toggleCod(cod)} style={{display:'grid',gridTemplateColumns:'32px 110px 1fr 120px 88px',padding:'7px 14px',alignItems:'center',borderBottom:'1px solid #f0f2f5',background:chk?'#f0fdf4':i%2===0?'#fff':'#fafbfc',cursor:'pointer',gap:8}}>
                  <input type="checkbox" checked={chk} onChange={()=>{}} style={{width:14,height:14,accentColor:GOLD}}/>
                  <span style={{fontSize:'0.70rem',color:'#8a91a5',fontFamily:'monospace'}}>{r.codigo}</span>
                  <span style={{fontSize:'0.81rem',color:'#1a1d24',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.nombre}</span>
                  <span style={{fontSize:'0.70rem',color:'#6a7288',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.ultimo_proveedor||'—'}</span>
                  <SBar e={r.existencias} mn={r.minimo} mx={r.maximo}/>
                </div>
              )
          })}
          {!loading&&filt.length>200&&<div style={{padding:'8px 14px',fontSize:'0.72rem',color:'#9ba3b5',textAlign:'center'}}>Mostrando 200 de {filt.length.toLocaleString()} — refiná la búsqueda</div>}
        </div>
      </div>

      <div style={{display:'flex',gap:8,marginBottom:22,flexWrap:'wrap'}}>
        <button onClick={agregar} disabled={selCods.size===0} style={{...btnA,opacity:selCods.size===0?0.4:1}}>📥 Agregar {selCods.size>0?`(${selCods.size} seleccionados)`:'a la orden'}</button>
        {selCods.size>0&&<button onClick={()=>setSelCods(new Set())} style={btnO()}>✖ Limpiar selección</button>}
      </div>

      {/* orden en curso */}
      {orden.length>0&&(
        <div>
          <p style={{fontSize:'0.88rem',fontWeight:700,color:'#1a1d24',marginBottom:10}}>📯 Orden activa — {orden.length} producto(s)</p>
          <p style={{fontSize:'0.78rem',color:'#6a7288',marginBottom:10}}>✏️ Podés modificar cantidades y costos antes de cerrar.</p>
          <div style={{background:'#fff',border:'1px solid #e8eaed',borderRadius:14,overflow:'hidden',marginBottom:16}}>
            <div style={{display:'grid',gridTemplateColumns:'110px 1fr 80px 90px 70px 34px',background:'#f7f8fa',borderBottom:'1px solid #e8eaed',padding:'9px 14px',gap:8}}>
              {['Código','Nombre','Cant.','Costo','Desc. %',''].map(h=><TH key={h}>{h}</TH>)}
            </div>
            {orden.map((o,i)=>(
              <div key={o.codigo} style={{display:'grid',gridTemplateColumns:'110px 1fr 80px 90px 70px 34px',padding:'7px 14px',alignItems:'center',borderBottom:i<orden.length-1?'1px solid #f0f2f5':'none',background:i%2===0?'#fff':'#fafbfc',gap:8}}>
                <span style={{fontSize:'0.70rem',color:'#8a91a5',fontFamily:'monospace'}}>{o.codigo}</span>
                <span style={{fontSize:'0.81rem',color:'#1a1d24',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{o.nombre}</span>
                <input type="number" min="0" value={o.cantidad} onChange={e=>setOrden(p=>p.map(x=>String(x.codigo)===String(o.codigo)?{...x,cantidad:parseInt(e.target.value)||0}:x))} style={{...IS,padding:'4px 6px',textAlign:'center'}}/>
                <input type="number" min="0" step="0.01" value={o.costo} onChange={e=>setOrden(p=>p.map(x=>String(x.codigo)===String(o.codigo)?{...x,costo:parseFloat(e.target.value)||0}:x))} style={{...IS,padding:'4px 6px',textAlign:'center'}}/>
                <input type="number" min="0" max="100" value={o.descuento||0} onChange={e=>setOrden(p=>p.map(x=>String(x.codigo)===String(o.codigo)?{...x,descuento:parseFloat(e.target.value)||0}:x))} style={{...IS,padding:'4px 6px',textAlign:'center'}}/>
                <button onClick={()=>setOrden(p=>p.filter(x=>String(x.codigo)!==String(o.codigo)))} style={{...btnO('#f43f5e'),padding:'4px 6px',fontSize:'0.8rem'}}>🗑️</button>
              </div>
            ))}
          </div>

          {/* config lotes */}
          <div style={{background:'#f7f8fa',border:'1px solid #e8eaed',borderRadius:12,padding:'14px 16px',marginBottom:14}}>
            <p style={{fontSize:'0.82rem',fontWeight:700,color:'#3a4150',marginBottom:10}}>⚙️ Configuración de lotes (división por factura)</p>
            <p style={{fontSize:'0.75rem',color:'#9ba3b5',marginBottom:10}}>Si el proveedor te factura en lotes pequeños, activá la división automática. Vas a recibir un ZIP con un archivo Excel por cada lote.</p>
            <div style={{display:'flex',gap:16,flexWrap:'wrap',alignItems:'center',marginBottom:12}}>
              <label style={{display:'flex',alignItems:'center',gap:8,fontSize:'0.82rem',color:'#3a4150',cursor:'pointer'}}>
                <input type="checkbox" checked={dividir} onChange={e=>setDividir(e.target.checked)} style={{width:15,height:15,accentColor:GOLD}}/>
                📦 Dividir orden en lotes
              </label>
              {dividir&&(
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <span style={{fontSize:'0.82rem',color:'#6a7288'}}>Máx. ítems por lote:</span>
                  <input type="number" min="5" max="200" step="5" value={maxLote} onChange={e=>setMaxLote(parseInt(e.target.value)||20)} style={{...IS,width:75,padding:'4px 8px',textAlign:'center'}}/>
                </div>
              )}
            </div>
            <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'center'}}>
              <input placeholder="📝 Nombre de la orden (ej: Gran Orden de Marzo)" value={nombreOrden} onChange={e=>setNombreOrden(e.target.value)} style={{...IS,flex:'1 1 200px'}}/>
              <button onClick={cerrar} disabled={exporting||orden.length===0} style={{...btnA,opacity:exporting?0.6:1}}>{exporting?'⏳ Generando...':'🔱 Cerrar Orden – Confirmar Orden'}</button>
            </div>
          </div>

          {/* descarga */}
          {descarga&&(
            <div style={{background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:12,padding:'14px 16px',marginBottom:16}}>
              {descarga.tipo==='single'
                ?<p style={{fontSize:'0.85rem',color:'#15803d',fontWeight:600,marginBottom:8}}>✅ ¡Orden cerrada y sellada!</p>
                :<p style={{fontSize:'0.85rem',color:'#15803d',fontWeight:600,marginBottom:8}}>✅ ¡Orden cerrada! Se generaron <strong>{descarga.lotes} lotes</strong> de máximo <strong>{descarga.maxLote} ítems</strong> cada uno.</p>
              }
              {guardada&&<p style={{fontSize:'0.78rem',color:'#10b981',marginBottom:10}}>✅ Guardada en trazabilidad (Nehemías)</p>}
              <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
                <a href={descarga.url} download={descarga.nombre} style={{...btnA,display:'inline-block',textDecoration:'none'}}>
                  {descarga.tipo==='zip'?'📦 Descargar ZIP':'📜 Descargar Archivo Final'}
                </a>
                <button onClick={()=>{setDescarga(null);setOrden([]);setNombreOrden('');setGuardada(false)}} style={btnO()}>🗑️ Limpiar – Preparar nueva orden</button>
              </div>
            </div>
          )}
        </div>
      )}
      {!loading&&orden.length===0&&(
        <div style={{padding:32,textAlign:'center',color:'#b0b8cc',fontSize:'0.85rem'}}>
          📭 No hay orden activa. Buscá y marcá productos arriba para agregarlos, o usá la Sugerencia de Compras del Día.
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════
// TAB 4: EXPORTAR EXCEL
// ═══════════════════════════════════════════════════
function TabExportar(){
  const[loading,setLoading]=useState(true),[datos,setDatos]=useState([]),[busq,setBusq]=useState(''),[fCat,setFC]=useState('Todas')
  const[nombreArch,setNombreArch]=useState(`filtrado_por_proveedor_${new Date().toISOString().slice(0,10)}.xlsx`),[exporting,setExporting]=useState(false)

  useEffect(()=>{
    async function go(){
      const{data:lat}=await supabase.from('neo_minimos_maximos').select('fecha_carga').order('fecha_carga',{ascending:false}).limit(1)
      if(!lat?.length){setLoading(false);return}
      const fc=lat[0].fecha_carga;let all=[],off=0
      while(true){const{data:c}=await supabase.from('neo_minimos_maximos').select('codigo,nombre,categoria,existencias,minimo,maximo,ultimo_proveedor,ultimo_costo,promedio_mensual,estatus').eq('fecha_carga',fc).range(off,off+999);if(!c?.length)break;all=all.concat(c);if(c.length<1000)break;off+=1000}
      setDatos(all);setLoading(false)
    }
    go()
  },[])

  const cats=useMemo(()=>['Todas',...Array.from(new Set(datos.map(r=>r.categoria).filter(Boolean))).sort()],[datos])
  const filt=useMemo(()=>{let d=datos;if(fCat!=='Todas')d=d.filter(r=>r.categoria===fCat);if(busq.trim()){const q=busq.toLowerCase();d=d.filter(r=>(r.nombre||'').toLowerCase().includes(q)||(r.codigo||'').toLowerCase().includes(q)||(r.ultimo_proveedor||'').toLowerCase().includes(q))}return d},[datos,fCat,busq])

  const exportar=async()=>{
    if(!filt.length)return;setExporting(true)
    try{
      const resultados=filt.map(r=>({proveedor:r.ultimo_proveedor||'Sin proveedor',codigo:r.codigo,nombre:r.nombre,alerta:r.estatus||'—',existencias:r.existencias,promedio_mensual:r.promedio_mensual,cantidad:0,ultimo_costo:r.ultimo_costo}))
      const r=await fetch('/api/exportar-propuesta',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({resultados})})
      const b=await r.blob();const u=URL.createObjectURL(b);const a=document.createElement('a');a.href=u;a.download=nombreArch||`filtrado_${new Date().toISOString().slice(0,10)}.xlsx`;a.click();URL.revokeObjectURL(u)
    }catch(e){alert(e.message)}finally{setExporting(false)}
  }

  return(
    <div>
      <p style={{fontSize:'0.88rem',fontWeight:700,color:'#1a1d24',marginBottom:6}}>📊 Exportar tabla filtrada agrupada por proveedor</p>
      <p style={{fontSize:'0.78rem',color:'#9ba3b5',marginBottom:16}}>Exporta los productos visibles en la tabla, agrupados y ordenados por proveedor.</p>
      <div style={{display:'flex',gap:10,flexWrap:'wrap',marginBottom:14}}>
        <input style={{...IS,flex:'1 1 200px'}} placeholder="🔍 Buscar..." value={busq} onChange={e=>setBusq(e.target.value)}/>
        <select style={{...IS,cursor:'pointer'}} value={fCat} onChange={e=>setFC(e.target.value)}>{cats.map(c=><option key={c}>{c}</option>)}</select>
      </div>
      <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'center',marginBottom:14}}>
        <input style={{...IS,flex:'1 1 300px'}} value={nombreArch} onChange={e=>setNombreArch(e.target.value)} placeholder="Nombre del archivo"/>
        <button onClick={exportar} disabled={exporting||filt.length===0} style={{...btnA,opacity:exporting?0.6:1}}>{exporting?'⏳ Generando...':'📄 Generar Excel agrupado'}</button>
      </div>
      {!loading&&<p style={{fontSize:'0.75rem',color:'#9ba3b5'}}>{filt.length.toLocaleString()} productos seleccionados para exportar</p>}
    </div>
  )
}

// ═══════════════════════════════════════════════════
// PÁGINA PRINCIPAL
// ═══════════════════════════════════════════════════
export default function SaturnoPage(){
  const[tab,setTab]=useState('inventario')
  const tabs=[['inventario','📋 Inventario'],['compras','🛒 Sugerencia de Compras'],['manual','🔍 Orden Manual'],['exportar','📊 Exportar Excel']]
  return(
    <div>
      <div style={{marginBottom:20}}>
        <span style={{fontSize:'0.7rem',fontWeight:700,letterSpacing:'0.1em',textTransform:'uppercase',color:GOLD,display:'block',marginBottom:4}}>Inventario · NEO</span>
        <h1 style={{fontSize:'1.7rem',fontWeight:700,color:'#1a1d24',letterSpacing:'-0.03em',lineHeight:1.2,marginBottom:4}}>🪐 Saturno – Inventario</h1>
        <p style={{fontSize:'0.875rem',color:'#6a7288'}}>Stock, alertas y generación de órdenes de compra por proveedor.</p>
      </div>
      <div style={{display:'flex',gap:2,marginBottom:24,borderBottom:'2px solid #e8eaed',overflowX:'auto'}}>
        {tabs.map(([id,label])=>(
          <button key={id} onClick={()=>setTab(id)} style={{padding:'9px 16px',border:'none',background:'none',cursor:'pointer',fontSize:'0.84rem',fontWeight:tab===id?700:500,color:tab===id?GOLD:'#6a7288',borderBottom:tab===id?`2px solid ${GOLD}`:'2px solid transparent',marginBottom:-2,whiteSpace:'nowrap'}}>
            {label}
          </button>
        ))}
      </div>
      {tab==='inventario'&&<TabInventario/>}
      {tab==='compras'&&<TabCompras/>}
      {tab==='manual'&&<TabManual/>}
      {tab==='exportar'&&<TabExportar/>}
      <div style={{marginTop:24,fontSize:'0.7rem',color:'#b0b8cc',textAlign:'right'}}>Actualizado: {new Date().toLocaleString('es-CR')}</div>
    </div>
  )
}
