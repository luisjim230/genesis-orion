'use client'
import { useState, useEffect } from 'react'
const GOLD='#ED6E2E',SURF='#ffffff',BORDER='#EAE0E0',TEXT='#1a1a1a',MUTED='#8a7070'
const S={overlay:{position:'fixed',inset:0,background:'rgba(94,39,51,0.4)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:2000,padding:'16px'},modal:{background:SURF,borderRadius:14,padding:'24px 28px',width:'100%',maxWidth:520,border:`1px solid ${BORDER}`,boxShadow:'0 8px 32px rgba(94,39,51,0.18)',fontFamily:'DM Sans, sans-serif'},title:{fontSize:'1.05rem',fontWeight:700,color:TEXT,marginBottom:4},sub:{fontSize:'0.82rem',color:MUTED,marginBottom:20},label:{fontSize:'0.75rem',fontWeight:700,color:MUTED,display:'block',marginBottom:5,textTransform:'uppercase',letterSpacing:'0.05em'},input:{width:'100%',background:'#FDF4F4',border:`1px solid ${BORDER}`,borderRadius:8,padding:'9px 12px',fontSize:'0.9rem',color:TEXT,outline:'none',boxSizing:'border-box',fontFamily:'DM Sans, sans-serif'},hint:{fontSize:'0.75rem',color:MUTED,marginTop:4},preview:{background:'#f0f9f0',border:'1px solid #9AE6B4',borderRadius:10,padding:'12px 14px',marginTop:16,fontSize:'0.82rem',color:'#276749',whiteSpace:'pre-wrap',lineHeight:1.5,maxHeight:180,overflowY:'auto'},btnRow:{display:'flex',gap:10,marginTop:20,justifyContent:'flex-end'},btnPrimary:{background:'#25D366',color:'#fff',border:'none',borderRadius:8,padding:'10px 22px',fontWeight:700,cursor:'pointer',fontSize:'0.9rem',fontFamily:'DM Sans, sans-serif'},btnSecondary:{background:'transparent',color:MUTED,border:`1px solid ${BORDER}`,borderRadius:8,padding:'9px 18px',cursor:'pointer',fontSize:'0.88rem',fontFamily:'DM Sans, sans-serif'},itemList:{background:'#FDF4F4',borderRadius:8,padding:'10px 14px',marginTop:8,maxHeight:120,overflowY:'auto',fontSize:'0.82rem',color:TEXT}}
function fmt(proveedor,items){const hoy=new Date().toLocaleDateString('es-CR',{day:'2-digit',month:'2-digit',year:'numeric'});const lineas=items.map(i=>`• ${i.nombre||i.codigo} × ${i.cantidad} uds`).join('\n');return `📦 *Orden de Compra - Depósito Jiménez*\nProveedor: *${proveedor}*\nFecha: ${hoy}\n\n*Productos:*\n${lineas}\n\n_Total: ${items.length} producto(s)_\n_Enviado desde SOL · Sistema de Operaciones_`}
export default function ModalEnviarWhatsApp({proveedor,items,onClose,onEnviado}){
  const [telefono,setTelefono]=useState('')
  const [guardado,setGuardado]=useState(null)
  const [enviando,setEnviando]=useState(false)
  const [msg,setMsg]=useState(null)
  const [cargando,setCargando]=useState(true)
  const preview=fmt(proveedor,items)
  useEffect(()=>{
    fetch('/api/kommo/proveedores').then(r=>r.json()).then(lista=>{
      const p=lista.find(x=>x.nombre_proveedor.toLowerCase().trim()===proveedor.toLowerCase().trim())
      if(p?.whatsapp){setTelefono(p.whatsapp);setGuardado(p.whatsapp)}
      setCargando(false)
    }).catch(()=>setCargando(false))
  },[proveedor])
  async function enviar(){
    const tel=telefono.trim().replace(/\D/g,'')
    if(!tel||tel.length<8){setMsg({ok:false,t:'Ingresá un número válido. Ej: 50688887777'});return}
    setEnviando(true);setMsg(null)
    try{
      const res=await fetch('/api/kommo/enviar-oc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({proveedor,items,telefono:tel,fecha_oc:new Date().toISOString()})})
      const data=await res.json()
      if(!res.ok)throw new Error(data.error||'Error al enviar')
      setMsg({ok:true,t:'✅ OC registrada en Kommo correctamente'})
      if(onEnviado)onEnviado({proveedor,telefono:tel})
      if(tel!==guardado){await fetch('/api/kommo/proveedores',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nombre_proveedor:proveedor,whatsapp:tel})})}
      setTimeout(onClose,2000)
    }catch(e){setMsg({ok:false,t:e.message})}
    setEnviando(false)
  }
  return(
    <div style={S.overlay} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={S.modal}>
        <div style={S.title}>📱 Enviar Orden de Compra por WhatsApp</div>
        <div style={S.sub}>Proveedor: <strong style={{color:GOLD}}>{proveedor}</strong> &nbsp;·&nbsp; {items.length} producto(s)</div>
        <label style={S.label}>Productos incluidos</label>
        <div style={S.itemList}>{items.map((i,idx)=><div key={idx} style={{padding:'2px 0',borderBottom:idx<items.length-1?`1px solid ${BORDER}`:'none'}}>{i.nombre||i.codigo} <span style={{color:GOLD,fontWeight:600}}>× {i.cantidad}</span></div>)}</div>
        <div style={{marginTop:16}}>
          <label style={S.label}>Número WhatsApp {guardado&&<span style={{background:'#25D36622',color:'#25D366',border:'1px solid #25D36644',borderRadius:20,padding:'2px 8px',fontSize:'0.7rem',fontWeight:600,marginLeft:8}}>💾 Guardado</span>}</label>
          <input style={S.input} type="tel" placeholder="50688887777 (código país + número)" value={cargando?'Cargando...':telefono} onChange={e=>setTelefono(e.target.value)} disabled={cargando}/>
          <div style={S.hint}>{!guardado?'Se guardará automáticamente al enviar.':telefono!==guardado?'⚠️ Número diferente al guardado — se actualizará.':'Número cargado desde tu base de datos.'}</div>
        </div>
        <div style={{marginTop:16}}><label style={S.label}>Vista previa del mensaje</label><div style={S.preview}>{preview}</div></div>
        {msg&&<div style={{marginTop:14,padding:'10px 14px',borderRadius:8,fontSize:'0.84rem',background:msg.ok?'#f0fff4':'#fff5f5',color:msg.ok?'#276749':'#C53030',border:`1px solid ${msg.ok?'#9AE6B4':'#FEB2B2'}`}}>{msg.t}</div>}
        <div style={S.btnRow}>
          <button style={S.btnSecondary} onClick={onClose}>Cancelar</button>
          <button style={{...S.btnPrimary,opacity:enviando?0.7:1}} onClick={enviar} disabled={enviando}>{enviando?'Enviando...':'📱 Enviar por WhatsApp'}</button>
        </div>
      </div>
    </div>
  )
}
