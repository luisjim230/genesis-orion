'use client'
import { useState, useEffect } from 'react'

const GOLD='#ED6E2E',SURF='#ffffff',BORDER='#EAE0E0',TEXT='#1a1a1a',MUTED='#8a7070'
const S={
  overlay:{position:'fixed',inset:0,background:'rgba(94,39,51,0.4)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:99999,padding:'16px'},
  modal:{background:SURF,borderRadius:14,padding:'24px 28px',width:'100%',maxWidth:520,border:`1px solid ${BORDER}`,boxShadow:'0 8px 32px rgba(94,39,51,0.18)',fontFamily:'DM Sans, sans-serif'},
  title:{fontSize:'1.05rem',fontWeight:700,color:TEXT,marginBottom:4},
  sub:{fontSize:'0.82rem',color:MUTED,marginBottom:20},
  label:{fontSize:'0.75rem',fontWeight:700,color:MUTED,display:'block',marginBottom:5,textTransform:'uppercase',letterSpacing:'0.05em'},
  input:{width:'100%',background:'#FDF4F4',border:`1px solid ${BORDER}`,borderRadius:8,padding:'9px 12px',fontSize:'0.9rem',color:TEXT,outline:'none',boxSizing:'border-box',fontFamily:'DM Sans, sans-serif'},
  hint:{fontSize:'0.75rem',color:MUTED,marginTop:4},
  preview:{background:'#f0f9f0',border:'1px solid #9AE6B4',borderRadius:10,padding:'12px 14px',marginTop:8,fontSize:'0.82rem',color:'#276749',whiteSpace:'pre-wrap',lineHeight:1.5,maxHeight:160,overflowY:'auto'},
  btnRow:{display:'flex',gap:10,marginTop:20,justifyContent:'flex-end'},
  btnPrimary:{background:'#25D366',color:'#fff',border:'none',borderRadius:8,padding:'10px 22px',fontWeight:700,cursor:'pointer',fontSize:'0.9rem',fontFamily:'DM Sans, sans-serif'},
  btnPrimaryDisabled:{background:'#a0c4ae',color:'#fff',border:'none',borderRadius:8,padding:'10px 22px',fontWeight:700,cursor:'not-allowed',fontSize:'0.9rem',fontFamily:'DM Sans, sans-serif'},
  btnSecondary:{background:'transparent',color:MUTED,border:`1px solid ${BORDER}`,borderRadius:8,padding:'9px 18px',cursor:'pointer',fontSize:'0.88rem',fontFamily:'DM Sans, sans-serif'},
  itemList:{background:'#FDF4F4',borderRadius:8,padding:'10px 14px',marginTop:8,maxHeight:120,overflowY:'auto',fontSize:'0.82rem',color:TEXT},
  neoStatus:{marginTop:12,padding:'8px 12px',borderRadius:8,fontSize:'0.8rem',display:'flex',alignItems:'center',gap:6}
}

function fmt(proveedor,items){
  const hoy=new Date().toLocaleDateString('es-CR',{day:'2-digit',month:'2-digit',year:'numeric'})
  const lineas=items.map(i=>`• ${i.nombre||i.codigo} × ${i.cantidad} uds`).join('\n')
  return `📦 *Orden de Compra - Depósito Jiménez*\nProveedor: *${proveedor||'(seleccionar)'}*\nFecha: ${hoy}\n\n*Productos:*\n${lineas}\n\n_Total: ${items.length} producto(s)_\n_Enviado desde SOL · Sistema de Operaciones_`
}

export default function ModalEnviarWhatsApp({proveedor,items,onClose,onEnviado}){
  const [telefono,setTelefono]=useState('')
  const [guardado,setGuardado]=useState(null)
  const [cargando,setCargando]=useState(true)
  const [enviando,setEnviando]=useState(false)
  const [msg,setMsg]=useState(null)
  const [neoOk,setNeoOk]=useState(null)
  const preview=fmt(proveedor,items)

  useEffect(()=>{
    fetch('/api/kommo/proveedores').then(r=>r.json()).then(lista=>{
      const p=lista.find(x=>x.nombre_proveedor?.toLowerCase().trim()===(proveedor||'').toLowerCase().trim())
      if(p?.whatsapp){setTelefono(p.whatsapp);setGuardado(p.whatsapp)}
      setCargando(false)
    }).catch(()=>setCargando(false))
  },[proveedor])

  async function enviar(){
    const tel=telefono.trim().replace(/\D/g,'')
    if(!tel||tel.length<8){setMsg('Ingresá un número válido. Ej: 50688887777');return}
    setEnviando(true)
    setMsg(null)
    setNeoOk(null)
    if(tel!==guardado){
      try{await fetch('/api/kommo/proveedores',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nombre_proveedor:proveedor||'Sin nombre',whatsapp:tel})})}catch(e){}
    }
    // Guardar orden en historial de SOL (ordenes_compra + ordenes_compra_items)
    try{
      const fecha=new Date().toISOString().slice(0,10)
      const nombreLote='OC ' + (proveedor||'Sin nombre') + ' ' + fecha
      await fetch('/api/guardar-orden',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        items:items.map(i=>({codigo:i.codigo,nombre:i.nombre||i.codigo,proveedor:proveedor||'Sin nombre',cantidad:i.cantidad,costo_unitario:i.costo_unitario||i.precio||0,descuento:i.descuento||0})),
        nombreLote:nombreLote,
        diasTribucion:0
      })})
    }catch(e){console.error('guardar-orden error:',e)}

    // Encolar en NEO
    try{
      const res=await fetch('/api/neo/encolar-oc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({proveedor:proveedor||'Sin nombre',items:items.map(i=>({codigo:i.codigo,cantidad:i.cantidad,costo_unitario:i.costo_unitario||i.precio||0,descuento:i.descuento||0})),creadoPor:'whatsapp-modal'})})
      const data=await res.json()
      setNeoOk(data.ok?'ok':'error')
    }catch(e){setNeoOk('error')}
    const url=`https://wa.me/${tel}?text=${encodeURIComponent(preview)}`
    window.open(url,'_blank')
    if(onEnviado)onEnviado({proveedor,telefono:tel})
    setEnviando(false)
    onClose()
  }

  return(
    <div style={S.overlay} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={S.modal}>
        <div style={S.title}>📱 Enviar Orden de Compra por WhatsApp</div>
        <div style={S.sub}>{proveedor?<>Proveedor: <strong style={{color:GOLD}}>{proveedor}</strong> &nbsp;·&nbsp; </>:''}{items.length} producto(s)</div>
        <label style={S.label}>Productos incluidos</label>
        <div style={S.itemList}>{items.map((i,idx)=><div key={idx} style={{padding:'2px 0',borderBottom:idx<items.length-1?`1px solid ${BORDER}`:'none'}}>{i.nombre||i.codigo} <span style={{color:GOLD,fontWeight:600}}>× {i.cantidad}</span></div>)}</div>
        <div style={{marginTop:16}}>
          <label style={S.label}>Número WhatsApp del proveedor {guardado&&<span style={{background:'#25D36622',color:'#25D366',border:'1px solid #25D36644',borderRadius:20,padding:'2px 8px',fontSize:'0.7rem',fontWeight:600,marginLeft:8}}>💾 Guardado</span>}</label>
          <input style={S.input} type="tel" placeholder="50688887777 (código país + número)" value={cargando?'Cargando...':telefono} onChange={e=>setTelefono(e.target.value)} disabled={cargando||enviando} autoFocus/>
          <div style={S.hint}>{cargando?'':!guardado?'Se guardará automáticamente al abrir WhatsApp.':telefono!==guardado?'⚠️ Número diferente al guardado — se actualizará.':'✅ Número cargado desde tu base de datos.'}</div>
        </div>
        <div style={{...S.neoStatus,background:neoOk==='ok'?'#f0fff4':neoOk==='error'?'#fff5f5':'#FDF4F4',border:neoOk==='ok'?'1px solid #9AE6B4':neoOk==='error'?'1px solid #FEB2B2':'1px solid #EAE0E0',color:neoOk==='ok'?'#276749':neoOk==='error'?'#C53030':MUTED}}>
          {enviando?<>⏳ Encolando en NEO...</>:neoOk==='ok'?<>✅ OC encolada — se subirá a NEO automáticamente</>:neoOk==='error'?<>⚠️ No se pudo encolar en NEO (WhatsApp enviado igual)</>:<>🤖 Al enviar, la OC se subirá automáticamente a NEO</>}
        </div>
        <label style={{...S.label,marginTop:16}}>Vista previa del mensaje</label>
        <div style={S.preview}>{preview}</div>
        {msg&&<div style={{marginTop:12,padding:'8px 12px',borderRadius:8,fontSize:'0.83rem',background:'#fff5f5',color:'#C53030',border:'1px solid #FEB2B2'}}>{msg}</div>}
        <div style={S.btnRow}>
          <button style={S.btnSecondary} onClick={onClose} disabled={enviando}>Cancelar</button>
          <button style={enviando?S.btnPrimaryDisabled:S.btnPrimary} onClick={enviar} disabled={enviando||cargando}>{enviando?'⏳ Enviando...':'📱 Abrir WhatsApp'}</button>
        </div>
      </div>
    </div>
  )
}
