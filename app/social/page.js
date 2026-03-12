'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

// ─── DESIGN TOKENS ───────────────────────────────────────────────────────────
const GOLD   = '#ED6E2E'
const BG     = '#0f1115'
const SURF   = '#1c1f26'
const SURF2  = '#22262f'
const BORDER = 'rgba(255,255,255,0.08)'
const TEXT   = 'rgba(253,244,244,0.88)'
const MUTED  = 'rgba(253,244,244,0.40)'
const PLAT = {
  tiktok:    { label:'TikTok',    color:'#69C9D0', icon:'🎵' },
  instagram: { label:'Instagram', color:'#E1306C', icon:'📸' },
  facebook:  { label:'Facebook',  color:'#4267B2', icon:'👍' },
  youtube:   { label:'YouTube',   color:'#FF0000', icon:'▶️' },
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const S = {
  card: { background:SURF, border:`1px solid ${BORDER}`, borderRadius:12, padding:'16px 18px', marginBottom:14 },
  th:   { textAlign:'left', padding:'9px 12px', background:SURF2, color:MUTED, fontSize:'0.68em',
          textTransform:'uppercase', letterSpacing:'0.06em', borderBottom:`1px solid ${BORDER}`, whiteSpace:'nowrap' },
  td:   { padding:'9px 12px', borderBottom:`1px solid ${BORDER}`, color:TEXT, verticalAlign:'middle', fontSize:'0.84em' },
  input:{ background:SURF2, border:`1px solid ${BORDER}`, borderRadius:8, padding:'8px 12px',
          color:TEXT, fontSize:'0.85em', fontFamily:'DM Sans,sans-serif', outline:'none', width:'100%', boxSizing:'border-box' },
  btn:  (c=GOLD)=>({ background:c, color:'#fff', border:'none', borderRadius:8, padding:'8px 16px',
          cursor:'pointer', fontSize:'0.82em', fontWeight:600, fontFamily:'DM Sans,sans-serif' }),
  btnSm:(c=SURF2)=>({ background:c, color:TEXT, border:`1px solid ${BORDER}`, borderRadius:6,
          padding:'5px 11px', cursor:'pointer', fontSize:'0.77em', fontFamily:'DM Sans,sans-serif' }),
  badge:(c)=>({ background:c+'22', color:c, border:`1px solid ${c}44`, borderRadius:20,
          padding:'3px 10px', fontSize:'0.72em', fontWeight:600, whiteSpace:'nowrap', display:'inline-block' }),
  textarea:{ background:SURF2, border:`1px solid ${BORDER}`, borderRadius:8, padding:'8px 12px',
             color:TEXT, fontSize:'0.84em', fontFamily:'DM Sans,sans-serif', outline:'none',
             width:'100%', boxSizing:'border-box', resize:'vertical', minHeight:72 },
}

function PlatBadge({ plat }) {
  if (!plat || !PLAT[plat]) return null
  const p = PLAT[plat]
  return <span style={S.badge(p.color)}>{p.icon} {p.label}</span>
}

function Sel({ value, onChange, options, style={} }) {
  return (
    <select value={value} onChange={e=>onChange(e.target.value)}
      style={{ ...S.input, cursor:'pointer', ...style }}>
      {options.map(([v,l])=><option key={v} value={v}>{l}</option>)}
    </select>
  )
}

function Msg({ msg }) {
  if (!msg) return null
  return (
    <div style={{ background:msg.ok?'#68d39122':'#fc818122', border:`1px solid ${msg.ok?'#68d391':'#fc8181'}55`,
      borderRadius:8, padding:'9px 14px', marginBottom:12, color:msg.ok?'#68d391':'#fc8181', fontSize:'0.84em' }}>
      {msg.t}
    </div>
  )
}

// ─── TAB: LISTO PARA PUBLICAR ─────────────────────────────────────────────────
function TabListoPublicar() {
  const EMPTY = { titulo:'', plataforma:'tiktok', link_archivo:'', fecha_sugerida:'',
                  hora_sugerida:'12:00', caption:'', hashtags:'', notas:'' }
  const [items, setItems]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [form, setForm]         = useState(null)
  const [detalle, setDetalle]   = useState(null)
  const [saving, setSaving]     = useState(false)
  const [filtroPlat, setFiltroP]= useState('todas')
  const [msg, setMsg]           = useState(null)

  function showMsg(t, ok=true) { setMsg({t,ok}); setTimeout(()=>setMsg(null),3500) }

  async function cargar() {
    setLoading(true)
    const { data } = await supabase.from('social_listos')
      .select('*').order('fecha_sugerida', { ascending:true })
    setItems(data || [])
    setLoading(false)
  }
  useEffect(()=>{ cargar() },[])

  async function guardar() {
    if (!form.titulo.trim()) return showMsg('El título es requerido.', false)
    setSaving(true)
    const payload = { ...form, estado:'listo' }
    if (form.id) {
      await supabase.from('social_listos').update(payload).eq('id', form.id)
      showMsg('Actualizado.')
    } else {
      await supabase.from('social_listos').insert({...payload, creado_en: new Date().toISOString()})
      showMsg('Agregado a la cola.')
    }
    setSaving(false); setForm(null); cargar()
  }

  async function marcarPublicado(item) {
    await supabase.from('social_listos').update({
      estado:'publicado', fecha_publicacion: new Date().toISOString()
    }).eq('id', item.id)
    showMsg('¡Publicado! Movido al historial.')
    setDetalle(null); cargar()
  }

  async function eliminar(id) {
    if (!confirm('¿Eliminar este contenido?')) return
    await supabase.from('social_listos').delete().eq('id', id)
    setDetalle(null); cargar()
  }

  const listos     = items.filter(x=>x.estado==='listo')
  const publicados = items.filter(x=>x.estado==='publicado')
  const filtrados  = filtroPlat==='todas' ? listos : listos.filter(x=>x.plataforma===filtroPlat)

  const proximaSemana = listos.filter(x=>{
    if (!x.fecha_sugerida) return false
    const d = new Date(x.fecha_sugerida), hoy = new Date()
    const diff = (d - hoy) / 86400000
    return diff >= 0 && diff <= 7
  }).length

  if (form) return (
    <div>
      <button style={{...S.btnSm(), marginBottom:16}} onClick={()=>setForm(null)}>← Volver</button>
      <h2 style={{color:TEXT, fontSize:'1.05em', fontWeight:700, marginBottom:18}}>
        {form.id ? '✏️ Editar contenido' : '➕ Nuevo contenido listo'}
      </h2>
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12}}>
        <div>
          <label style={{fontSize:'0.72em', color:MUTED, display:'block', marginBottom:4}}>TÍTULO *</label>
          <input style={S.input} value={form.titulo} onChange={e=>setForm({...form,titulo:e.target.value})} placeholder="Nombre del video/post"/>
        </div>
        <div>
          <label style={{fontSize:'0.72em', color:MUTED, display:'block', marginBottom:4}}>PLATAFORMA</label>
          <Sel value={form.plataforma} onChange={v=>setForm({...form,plataforma:v})}
            options={Object.entries(PLAT).map(([k,p])=>[k,`${p.icon} ${p.label}`])}/>
        </div>
        <div>
          <label style={{fontSize:'0.72em', color:MUTED, display:'block', marginBottom:4}}>FECHA SUGERIDA</label>
          <input type="date" style={S.input} value={form.fecha_sugerida} onChange={e=>setForm({...form,fecha_sugerida:e.target.value})}/>
        </div>
        <div>
          <label style={{fontSize:'0.72em', color:MUTED, display:'block', marginBottom:4}}>HORA SUGERIDA</label>
          <input type="time" style={S.input} value={form.hora_sugerida} onChange={e=>setForm({...form,hora_sugerida:e.target.value})}/>
        </div>
        <div style={{gridColumn:'1/-1'}}>
          <label style={{fontSize:'0.72em', color:MUTED, display:'block', marginBottom:4}}>LINK AL ARCHIVO EDITADO (Drive / Dropbox)</label>
          <input style={S.input} value={form.link_archivo} onChange={e=>setForm({...form,link_archivo:e.target.value})} placeholder="https://drive.google.com/..."/>
        </div>
        <div style={{gridColumn:'1/-1'}}>
          <label style={{fontSize:'0.72em', color:MUTED, display:'block', marginBottom:4}}>CAPTION</label>
          <textarea style={S.textarea} value={form.caption} onChange={e=>setForm({...form,caption:e.target.value})} placeholder="Texto que va a acompañar la publicación..."/>
        </div>
        <div style={{gridColumn:'1/-1'}}>
          <label style={{fontSize:'0.72em', color:MUTED, display:'block', marginBottom:4}}>HASHTAGS</label>
          <input style={S.input} value={form.hashtags} onChange={e=>setForm({...form,hashtags:e.target.value})} placeholder="#construccion #costarica #depositojimenez"/>
        </div>
        <div style={{gridColumn:'1/-1'}}>
          <label style={{fontSize:'0.72em', color:MUTED, display:'block', marginBottom:4}}>NOTAS INTERNAS</label>
          <textarea style={{...S.textarea, minHeight:56}} value={form.notas} onChange={e=>setForm({...form,notas:e.target.value})} placeholder="Detalles para quien va a publicar..."/>
        </div>
      </div>
      <Msg msg={msg}/>
      <div style={{display:'flex', gap:10}}>
        <button style={S.btn()} onClick={guardar} disabled={saving}>{saving?'Guardando...':'💾 Guardar'}</button>
        <button style={S.btnSm()} onClick={()=>setForm(null)}>Cancelar</button>
      </div>
    </div>
  )

  if (detalle) {
    return (
      <div>
        <button style={{...S.btnSm(), marginBottom:16}} onClick={()=>setDetalle(null)}>← Volver</button>
        <div style={S.card}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:10, marginBottom:16}}>
            <div>
              <div style={{fontWeight:700, color:TEXT, fontSize:'1.1em', marginBottom:6}}>{detalle.titulo}</div>
              <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
                <PlatBadge plat={detalle.plataforma}/>
                <span style={S.badge(detalle.estado==='publicado'?'#68d391':'#63b3ed')}>
                  {detalle.estado==='publicado'?'✅ Publicado':'🟢 Listo para publicar'}
                </span>
              </div>
            </div>
            {detalle.estado==='listo' && (
              <div style={{display:'flex', gap:8}}>
                <button style={S.btnSm()} onClick={()=>{ setDetalle(null); setForm({...detalle}) }}>✏️ Editar</button>
                <button style={S.btn('#68d391')} onClick={()=>marcarPublicado(detalle)}>✅ Marcar como publicado</button>
              </div>
            )}
          </div>
          {detalle.fecha_sugerida && (
            <div style={{marginBottom:12, fontSize:'0.84em', color:MUTED}}>
              📅 {detalle.fecha_sugerida} {detalle.hora_sugerida && `· ${detalle.hora_sugerida}`}
              {detalle.fecha_publicacion && <span style={{marginLeft:16}}>📤 Publicado: {new Date(detalle.fecha_publicacion).toLocaleDateString('es-CR')}</span>}
            </div>
          )}
          {detalle.link_archivo && (
            <div style={{marginBottom:14}}>
              <div style={{fontSize:'0.72em', color:MUTED, marginBottom:4}}>ARCHIVO EDITADO</div>
              <a href={detalle.link_archivo} target="_blank" rel="noreferrer" style={{color:GOLD, fontSize:'0.84em', wordBreak:'break-all'}}>{detalle.link_archivo}</a>
            </div>
          )}
          {detalle.caption && (
            <div style={{marginBottom:14}}>
              <div style={{fontSize:'0.72em', color:MUTED, marginBottom:4}}>CAPTION</div>
              <div style={{background:SURF2, borderRadius:8, padding:'10px 14px', fontSize:'0.85em', color:TEXT, lineHeight:1.5, whiteSpace:'pre-wrap'}}>{detalle.caption}</div>
            </div>
          )}
          {detalle.hashtags && (
            <div style={{marginBottom:14}}>
              <div style={{fontSize:'0.72em', color:MUTED, marginBottom:4}}>HASHTAGS</div>
              <div style={{fontSize:'0.85em', color:'#63b3ed'}}>{detalle.hashtags}</div>
            </div>
          )}
          {detalle.notas && (
            <div style={{marginBottom:14}}>
              <div style={{fontSize:'0.72em', color:MUTED, marginBottom:4}}>NOTAS</div>
              <div style={{background:SURF2, borderRadius:8, padding:'10px 14px', fontSize:'0.83em', color:MUTED, lineHeight:1.5}}>{detalle.notas}</div>
            </div>
          )}
          <hr style={{border:'none', borderTop:`1px solid ${BORDER}`, margin:'16px 0'}}/>
          <button style={S.btn('#7d1515')} onClick={()=>eliminar(detalle.id)}>🗑️ Eliminar</button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <Msg msg={msg}/>
      <div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20}}>
        {[
          ['🟢 En cola', listos.length, '#63b3ed'],
          ['✅ Publicados', publicados.length, '#68d391'],
          ['📅 Esta semana', proximaSemana, GOLD],
          ['⏰ Sin fecha', listos.filter(x=>!x.fecha_sugerida).length, '#f6ad55'],
        ].map(([l,v,c])=>(
          <div key={l} style={{background:SURF, border:`1px solid ${c}33`, borderTop:`3px solid ${c}`, borderRadius:10, padding:'14px 16px'}}>
            <div style={{fontSize:'0.7em', color:MUTED, textTransform:'uppercase', letterSpacing:'0.06em'}}>{l}</div>
            <div style={{fontSize:'1.8em', fontWeight:700, color:c, marginTop:4}}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:10, marginBottom:16}}>
        <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
          {[['todas','🎬 Todas'],['tiktok','🎵 TikTok'],['instagram','📸 Instagram'],['facebook','👍 Facebook'],['youtube','▶️ YouTube']].map(([v,l])=>(
            <button key={v} onClick={()=>setFiltroP(v)} style={{
              padding:'6px 14px', borderRadius:20, border:`1px solid ${BORDER}`,
              background: filtroPlat===v ? GOLD : SURF2, color: filtroPlat===v ? '#fff' : MUTED,
              cursor:'pointer', fontSize:'0.8em', fontFamily:'DM Sans,sans-serif'
            }}>{l}</button>
          ))}
        </div>
        <button style={S.btn()} onClick={()=>setForm({...EMPTY})}>+ Agregar contenido</button>
      </div>
      <div style={{...S.card, padding:0, overflow:'hidden', marginBottom:24}}>
        <div style={{padding:'12px 18px', borderBottom:`1px solid ${BORDER}`, fontWeight:600, color:TEXT, fontSize:'0.88em'}}>
          🟢 Cola — {filtrados.length} ítem(s)
        </div>
        {loading ? <div style={{textAlign:'center', padding:40, color:MUTED}}>Cargando...</div>
        : filtrados.length===0 ? <div style={{textAlign:'center', padding:40, color:MUTED}}>No hay contenido listo aún.</div>
        : (
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%', borderCollapse:'collapse'}}>
              <thead><tr>
                {['Plataforma','Título','Fecha sugerida','Hora','Archivo',''].map(h=><th key={h} style={S.th}>{h}</th>)}
              </tr></thead>
              <tbody>
                {filtrados.map(item=>{
                  const d = item.fecha_sugerida ? new Date(item.fecha_sugerida) : null
                  const diff = d ? (d - new Date()) / 86400000 : null
                  const fColor = diff===null ? MUTED : diff<0 ? '#fc8181' : diff<=3 ? '#f6ad55' : '#68d391'
                  return (
                    <tr key={item.id} style={{cursor:'pointer'}} onClick={()=>setDetalle(item)}>
                      <td style={S.td}><PlatBadge plat={item.plataforma}/></td>
                      <td style={{...S.td, fontWeight:500, maxWidth:240, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{item.titulo}</td>
                      <td style={{...S.td, whiteSpace:'nowrap', color:fColor}}>
                        {item.fecha_sugerida ? `📅 ${item.fecha_sugerida}` : <span style={{color:MUTED}}>Sin fecha</span>}
                      </td>
                      <td style={{...S.td, color:MUTED}}>{item.hora_sugerida||'—'}</td>
                      <td style={S.td}>
                        {item.link_archivo
                          ? <a href={item.link_archivo} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()} style={{color:GOLD, fontSize:'0.82em'}}>🔗 Ver</a>
                          : <span style={{color:MUTED}}>—</span>}
                      </td>
                      <td style={S.td} onClick={e=>e.stopPropagation()}>
                        <div style={{display:'flex', gap:6}}>
                          <button style={S.btnSm()} onClick={()=>setDetalle(item)}>Ver</button>
                          <button style={S.btn('#68d391')} onClick={()=>marcarPublicado(item)}>✅ Publicado</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {publicados.length > 0 && (
        <div style={{...S.card, padding:0, overflow:'hidden'}}>
          <div style={{padding:'12px 18px', borderBottom:`1px solid ${BORDER}`, fontWeight:600, color:MUTED, fontSize:'0.85em'}}>
            ✅ Historial publicados — {publicados.length}
          </div>
          <div style={{overflowX:'auto', maxHeight:300, overflowY:'auto'}}>
            <table style={{width:'100%', borderCollapse:'collapse'}}>
              <thead><tr>{['Plataforma','Título','Publicado',''].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
              <tbody>
                {publicados.map(item=>(
                  <tr key={item.id} onClick={()=>setDetalle(item)} style={{cursor:'pointer'}}>
                    <td style={S.td}><PlatBadge plat={item.plataforma}/></td>
                    <td style={{...S.td, fontWeight:500}}>{item.titulo}</td>
                    <td style={{...S.td, color:MUTED}}>{item.fecha_publicacion ? new Date(item.fecha_publicacion).toLocaleDateString('es-CR') : '—'}</td>
                    <td style={S.td}><button style={S.btnSm()}>Ver</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── TAB: POR GRABAR ──────────────────────────────────────────────────────────
function TabPendientes() {
  const EMPTY = { titulo:'', plataforma:'tiktok', prioridad:'media', descripcion:'', fecha_limite:'' }
  const [items, setItems]     = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm]       = useState(null)
  const [saving, setSaving]   = useState(false)
  const [msg, setMsg]         = useState(null)

  function showMsg(t, ok=true) { setMsg({t,ok}); setTimeout(()=>setMsg(null),3000) }

  async function cargar() {
    setLoading(true)
    const { data } = await supabase.from('social_pendientes').select('*').order('creado_en', {ascending:false})
    setItems(data||[])
    setLoading(false)
  }
  useEffect(()=>{ cargar() },[])

  async function guardar() {
    if (!form.titulo.trim()) return showMsg('Título requerido.', false)
    setSaving(true)
    const payload = { ...form, estado: form.estado||'pendiente' }
    if (form.id) await supabase.from('social_pendientes').update(payload).eq('id', form.id)
    else await supabase.from('social_pendientes').insert({...payload, creado_en: new Date().toISOString()})
    setSaving(false); setForm(null); showMsg('Guardado.'); cargar()
  }

  async function marcarGrabado(item) {
    await supabase.from('social_pendientes').update({ estado:'grabado', fecha_grabado: new Date().toISOString() }).eq('id', item.id)
    showMsg('¡Grabado!'); cargar()
  }

  async function eliminar(id) {
    if (!confirm('¿Eliminar?')) return
    await supabase.from('social_pendientes').delete().eq('id', id)
    cargar()
  }

  const PRIOR_COLOR = { alta:'#fc8181', media:'#f6ad55', baja:'#68d391' }
  const porGrabar   = items.filter(x=>x.estado==='pendiente')
  const grabados    = items.filter(x=>x.estado==='grabado')

  if (form) return (
    <div>
      <button style={{...S.btnSm(), marginBottom:16}} onClick={()=>setForm(null)}>← Volver</button>
      <h2 style={{color:TEXT, fontSize:'1.05em', fontWeight:700, marginBottom:18}}>{form.id?'✏️ Editar':'➕ Nuevo video por grabar'}</h2>
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12}}>
        <div style={{gridColumn:'1/-1'}}>
          <label style={{fontSize:'0.72em', color:MUTED, display:'block', marginBottom:4}}>TÍTULO / IDEA *</label>
          <input style={S.input} value={form.titulo} onChange={e=>setForm({...form,titulo:e.target.value})} placeholder="Descripción del video"/>
        </div>
        <div>
          <label style={{fontSize:'0.72em', color:MUTED, display:'block', marginBottom:4}}>PLATAFORMA</label>
          <Sel value={form.plataforma} onChange={v=>setForm({...form,plataforma:v})}
            options={Object.entries(PLAT).map(([k,p])=>[k,`${p.icon} ${p.label}`])}/>
        </div>
        <div>
          <label style={{fontSize:'0.72em', color:MUTED, display:'block', marginBottom:4}}>PRIORIDAD</label>
          <Sel value={form.prioridad} onChange={v=>setForm({...form,prioridad:v})}
            options={[['alta','🔴 Alta'],['media','🟡 Media'],['baja','🟢 Baja']]}/>
        </div>
        <div>
          <label style={{fontSize:'0.72em', color:MUTED, display:'block', marginBottom:4}}>FECHA LÍMITE</label>
          <input type="date" style={S.input} value={form.fecha_limite} onChange={e=>setForm({...form,fecha_limite:e.target.value})}/>
        </div>
        <div style={{gridColumn:'1/-1'}}>
          <label style={{fontSize:'0.72em', color:MUTED, display:'block', marginBottom:4}}>DESCRIPCIÓN / GUIÓN</label>
          <textarea style={S.textarea} value={form.descripcion} onChange={e=>setForm({...form,descripcion:e.target.value})} placeholder="Qué debe mostrar el video, puntos clave..."/>
        </div>
      </div>
      <Msg msg={msg}/>
      <div style={{display:'flex', gap:10}}>
        <button style={S.btn()} onClick={guardar} disabled={saving}>{saving?'Guardando...':'💾 Guardar'}</button>
        <button style={S.btnSm()} onClick={()=>setForm(null)}>Cancelar</button>
      </div>
    </div>
  )

  return (
    <div>
      <Msg msg={msg}/>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16}}>
        <div style={{fontSize:'0.84em', color:MUTED}}>{porGrabar.length} video(s) pendientes</div>
        <button style={S.btn()} onClick={()=>setForm({...EMPTY})}>+ Agregar video</button>
      </div>
      <div style={{...S.card, padding:0, overflow:'hidden', marginBottom:20}}>
        <div style={{padding:'12px 18px', borderBottom:`1px solid ${BORDER}`, fontWeight:600, color:TEXT, fontSize:'0.88em'}}>🎬 Por grabar</div>
        {loading ? <div style={{textAlign:'center', padding:32, color:MUTED}}>Cargando...</div>
        : porGrabar.length===0 ? <div style={{textAlign:'center', padding:32, color:'#68d391'}}>¡Todo grabado! ✅</div>
        : <div style={{overflowX:'auto'}}>
            <table style={{width:'100%', borderCollapse:'collapse'}}>
              <thead><tr>{['Prioridad','Plataforma','Título','Fecha límite','Descripción',''].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
              <tbody>
                {[...porGrabar].sort((a,b)=>({alta:0,media:1,baja:2}[a.prioridad]-{alta:0,media:1,baja:2}[b.prioridad])).map(item=>(
                  <tr key={item.id}>
                    <td style={S.td}><span style={S.badge(PRIOR_COLOR[item.prioridad]||MUTED)}>{item.prioridad}</span></td>
                    <td style={S.td}><PlatBadge plat={item.plataforma}/></td>
                    <td style={{...S.td, fontWeight:500}}>{item.titulo}</td>
                    <td style={{...S.td, color: item.fecha_limite && new Date(item.fecha_limite)<new Date() ? '#fc8181' : MUTED}}>
                      {item.fecha_limite||'—'}
                    </td>
                    <td style={{...S.td, color:MUTED, maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{item.descripcion||'—'}</td>
                    <td style={S.td}>
                      <div style={{display:'flex', gap:6}}>
                        <button style={S.btnSm()} onClick={()=>setForm({...item})}>✏️</button>
                        <button style={S.btn('#63b3ed')} onClick={()=>marcarGrabado(item)}>🎬 Grabado</button>
                        <button style={{...S.btnSm(), color:'#fc8181', borderColor:'#fc818144'}} onClick={()=>eliminar(item.id)}>✕</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}
      </div>
      {grabados.length > 0 && (
        <div style={{...S.card, padding:0, overflow:'hidden'}}>
          <div style={{padding:'12px 18px', borderBottom:`1px solid ${BORDER}`, fontWeight:600, color:MUTED, fontSize:'0.85em'}}>✅ Grabados — {grabados.length}</div>
          <div style={{overflowX:'auto', maxHeight:260, overflowY:'auto'}}>
            <table style={{width:'100%', borderCollapse:'collapse'}}>
              <thead><tr>{['Plataforma','Título','Fecha grabado',''].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
              <tbody>
                {grabados.map(item=>(
                  <tr key={item.id}>
                    <td style={S.td}><PlatBadge plat={item.plataforma}/></td>
                    <td style={{...S.td, fontWeight:500}}>{item.titulo}</td>
                    <td style={{...S.td, color:MUTED}}>{item.fecha_grabado ? new Date(item.fecha_grabado).toLocaleDateString('es-CR') : '—'}</td>
                    <td style={S.td}><button style={{...S.btnSm(), color:'#fc8181', borderColor:'#fc818144'}} onClick={()=>eliminar(item.id)}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── TAB: REVISIÓN ────────────────────────────────────────────────────────────
function TabRevision() {
  const EMPTY = { titulo:'', plataforma:'tiktok', link_video:'', descripcion:'' }
  const [items, setItems]     = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm]       = useState(null)
  const [detalle, setDetalle] = useState(null)
  const [saving, setSaving]   = useState(false)
  const [nuevoComentario, setNuevoComentario] = useState('')
  const [msg, setMsg]         = useState(null)

  function showMsg(t, ok=true) { setMsg({t,ok}); setTimeout(()=>setMsg(null),3500) }

  async function cargar() {
    setLoading(true)
    const { data } = await supabase.from('social_revision').select('*').order('creado_en', {ascending:false})
    setItems(data||[])
    setLoading(false)
  }
  useEffect(()=>{ cargar() },[])

  async function guardar() {
    if (!form.titulo.trim()) return showMsg('Título requerido.', false)
    setSaving(true)
    const payload = { ...form, estado: form.estado||'pendiente_revision' }
    if (form.id) await supabase.from('social_revision').update(payload).eq('id', form.id)
    else await supabase.from('social_revision').insert({...payload, comentarios:[], creado_en: new Date().toISOString()})
    setSaving(false); setForm(null); showMsg('Guardado.'); cargar()
  }

  async function cambiarEstado(item, nuevoEstado) {
    await supabase.from('social_revision').update({ estado: nuevoEstado }).eq('id', item.id)
    const actualizado = {...item, estado: nuevoEstado}
    if (detalle && detalle.id === item.id) setDetalle(actualizado)
    if (nuevoEstado === 'aprobado') {
      await supabase.from('social_listos').insert({
        titulo: item.titulo, plataforma: item.plataforma,
        link_archivo: item.link_video, estado:'listo',
        creado_en: new Date().toISOString()
      })
      showMsg('¡Aprobado! Movido a "Listo para publicar" automáticamente. 🎉')
    }
    cargar()
  }

  async function agregarComentario(item) {
    if (!nuevoComentario.trim()) return
    const comentarios = [...(item.comentarios||[]), { texto: nuevoComentario.trim(), fecha: new Date().toISOString() }]
    await supabase.from('social_revision').update({ comentarios }).eq('id', item.id)
    setNuevoComentario('')
    if (detalle && detalle.id === item.id) setDetalle({...detalle, comentarios})
    cargar()
  }

  const ESTADOS = {
    pendiente_revision: { label:'Pendiente revisión', color:'#f6ad55' },
    en_revision:        { label:'En revisión',         color:'#63b3ed' },
    con_cambios:        { label:'Necesita cambios',    color:'#fc8181' },
    aprobado:           { label:'Aprobado',            color:'#68d391' },
  }

  if (form) return (
    <div>
      <button style={{...S.btnSm(), marginBottom:16}} onClick={()=>setForm(null)}>← Volver</button>
      <h2 style={{color:TEXT, fontSize:'1.05em', fontWeight:700, marginBottom:18}}>{form.id?'✏️ Editar':'➕ Subir video a revisión'}</h2>
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12}}>
        <div style={{gridColumn:'1/-1'}}>
          <label style={{fontSize:'0.72em', color:MUTED, display:'block', marginBottom:4}}>TÍTULO *</label>
          <input style={S.input} value={form.titulo} onChange={e=>setForm({...form,titulo:e.target.value})}/>
        </div>
        <div>
          <label style={{fontSize:'0.72em', color:MUTED, display:'block', marginBottom:4}}>PLATAFORMA</label>
          <Sel value={form.plataforma} onChange={v=>setForm({...form,plataforma:v})}
            options={Object.entries(PLAT).map(([k,p])=>[k,`${p.icon} ${p.label}`])}/>
        </div>
        <div style={{gridColumn:'1/-1'}}>
          <label style={{fontSize:'0.72em', color:MUTED, display:'block', marginBottom:4}}>LINK AL VIDEO (Drive / Dropbox)</label>
          <input style={S.input} value={form.link_video} onChange={e=>setForm({...form,link_video:e.target.value})} placeholder="https://..."/>
        </div>
        <div style={{gridColumn:'1/-1'}}>
          <label style={{fontSize:'0.72em', color:MUTED, display:'block', marginBottom:4}}>DESCRIPCIÓN</label>
          <textarea style={S.textarea} value={form.descripcion} onChange={e=>setForm({...form,descripcion:e.target.value})}/>
        </div>
      </div>
      <Msg msg={msg}/>
      <div style={{display:'flex', gap:10}}>
        <button style={S.btn()} onClick={guardar} disabled={saving}>{saving?'Guardando...':'💾 Guardar'}</button>
        <button style={S.btnSm()} onClick={()=>setForm(null)}>Cancelar</button>
      </div>
    </div>
  )

  if (detalle) return (
    <div>
      <button style={{...S.btnSm(), marginBottom:16}} onClick={()=>{ setDetalle(null); cargar() }}>← Volver</button>
      <Msg msg={msg}/>
      <div style={S.card}>
        <div style={{display:'flex', justifyContent:'space-between', flexWrap:'wrap', gap:10, marginBottom:14}}>
          <div>
            <div style={{fontWeight:700, color:TEXT, fontSize:'1.05em', marginBottom:6}}>{detalle.titulo}</div>
            <div style={{display:'flex', gap:8}}>
              <PlatBadge plat={detalle.plataforma}/>
              <span style={S.badge((ESTADOS[detalle.estado]||{}).color||MUTED)}>{(ESTADOS[detalle.estado]||{}).label||detalle.estado}</span>
            </div>
          </div>
          <button style={S.btnSm()} onClick={()=>{ setDetalle(null); setForm({...detalle}) }}>✏️ Editar</button>
        </div>
        {detalle.link_video && <div style={{marginBottom:14}}><a href={detalle.link_video} target="_blank" rel="noreferrer" style={{color:GOLD, fontSize:'0.84em'}}>🔗 Ver video</a></div>}
        {detalle.descripcion && <div style={{background:SURF2, borderRadius:8, padding:'10px 14px', fontSize:'0.84em', color:MUTED, marginBottom:16}}>{detalle.descripcion}</div>}
        <div style={{marginBottom:18}}>
          <div style={{fontSize:'0.72em', color:MUTED, marginBottom:8}}>CAMBIAR ESTADO</div>
          <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
            {Object.entries(ESTADOS).map(([k,v])=>(
              <button key={k} onClick={()=>cambiarEstado(detalle,k)} style={{
                ...S.btnSm(),
                background: detalle.estado===k ? v.color+'33' : SURF2,
                color: detalle.estado===k ? v.color : MUTED,
                border: `1px solid ${detalle.estado===k ? v.color+'66' : BORDER}`
              }}>{v.label}</button>
            ))}
          </div>
        </div>
        <div>
          <div style={{fontSize:'0.72em', color:MUTED, marginBottom:8}}>COMENTARIOS ({(detalle.comentarios||[]).length})</div>
          <div style={{maxHeight:200, overflowY:'auto', marginBottom:10}}>
            {(detalle.comentarios||[]).length === 0
              ? <div style={{color:MUTED, fontSize:'0.83em'}}>Sin comentarios.</div>
              : (detalle.comentarios||[]).map((c,i)=>(
                <div key={i} style={{background:SURF2, borderRadius:8, padding:'9px 12px', marginBottom:6}}>
                  <div style={{fontSize:'0.83em', color:TEXT}}>{c.texto}</div>
                  <div style={{fontSize:'0.7em', color:MUTED, marginTop:4}}>{new Date(c.fecha).toLocaleString('es-CR')}</div>
                </div>
              ))
            }
          </div>
          <div style={{display:'flex', gap:8}}>
            <input style={{...S.input, flex:1}} value={nuevoComentario} onChange={e=>setNuevoComentario(e.target.value)}
              placeholder="Agregar comentario..." onKeyDown={e=>e.key==='Enter'&&agregarComentario(detalle)}/>
            <button style={S.btn()} onClick={()=>agregarComentario(detalle)}>Enviar</button>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div>
      <Msg msg={msg}/>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16}}>
        <div style={{fontSize:'0.84em', color:MUTED}}>{items.length} video(s) en revisión</div>
        <button style={S.btn()} onClick={()=>setForm({...EMPTY})}>+ Subir video</button>
      </div>
      {loading ? <div style={{textAlign:'center', padding:40, color:MUTED}}>Cargando...</div>
      : items.length===0 ? <div style={{...S.card, textAlign:'center', padding:40, color:MUTED}}>Sin videos en revisión.</div>
      : (
        <div style={{display:'grid', gap:10}}>
          {items.map(item=>{
            const est = ESTADOS[item.estado]||{}
            return (
              <div key={item.id} style={{...S.card, cursor:'pointer', marginBottom:0}} onClick={()=>setDetalle(item)}>
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:8}}>
                  <div>
                    <div style={{fontWeight:600, color:TEXT, fontSize:'0.9em', marginBottom:4}}>{item.titulo}</div>
                    <div style={{display:'flex', gap:8, alignItems:'center'}}>
                      <PlatBadge plat={item.plataforma}/>
                      <span style={S.badge(est.color||MUTED)}>{est.label||item.estado}</span>
                      {(item.comentarios||[]).length>0 && <span style={{fontSize:'0.75em', color:MUTED}}>💬 {item.comentarios.length}</span>}
                    </div>
                  </div>
                  <div style={{display:'flex', gap:6}} onClick={e=>e.stopPropagation()}>
                    {item.link_video && <a href={item.link_video} target="_blank" rel="noreferrer" style={{...S.btnSm(), textDecoration:'none', color:GOLD}}>🔗 Ver</a>}
                    {item.estado !== 'aprobado' && (
                      <button style={S.btn('#68d391')} onClick={()=>cambiarEstado(item,'aprobado')}>✅ Aprobar</button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── TAB: IDEAS ───────────────────────────────────────────────────────────────
function TabIdeas() {
  const EMPTY = { titulo:'', plataforma:'todas', descripcion:'', estado_idea:'nueva' }
  const [items, setItems]     = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm]       = useState(null)
  const [saving, setSaving]   = useState(false)
  const [msg, setMsg]         = useState(null)
  const [filtro, setFiltro]   = useState('nueva')

  function showMsg(t, ok=true) { setMsg({t,ok}); setTimeout(()=>setMsg(null),3000) }

  async function cargar() {
    setLoading(true)
    const { data } = await supabase.from('social_ideas').select('*').order('creado_en', {ascending:false})
    setItems(data||[])
    setLoading(false)
  }
  useEffect(()=>{ cargar() },[])

  async function guardar() {
    if (!form.titulo.trim()) return showMsg('Título requerido.', false)
    setSaving(true)
    if (form.id) await supabase.from('social_ideas').update(form).eq('id', form.id)
    else await supabase.from('social_ideas').insert({...form, creado_en: new Date().toISOString()})
    setSaving(false); setForm(null); showMsg('Guardado.'); cargar()
  }

  async function eliminar(id) {
    if (!confirm('¿Eliminar?')) return
    await supabase.from('social_ideas').delete().eq('id', id); cargar()
  }

  const ESTADOS_IDEA = {
    nueva:      { label:'Nueva',      color:'#63b3ed' },
    en_proceso: { label:'En proceso', color:'#f6ad55' },
    ejecutada:  { label:'Ejecutada',  color:'#68d391' },
    descartada: { label:'Descartada', color:MUTED },
  }
  const filtrados = filtro==='todas' ? items : items.filter(x=>x.estado_idea===filtro)

  if (form) return (
    <div>
      <button style={{...S.btnSm(), marginBottom:16}} onClick={()=>setForm(null)}>← Volver</button>
      <h2 style={{color:TEXT, fontSize:'1.05em', fontWeight:700, marginBottom:18}}>{form.id?'✏️ Editar idea':'💡 Nueva idea'}</h2>
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12}}>
        <div style={{gridColumn:'1/-1'}}>
          <label style={{fontSize:'0.72em', color:MUTED, display:'block', marginBottom:4}}>IDEA *</label>
          <input style={S.input} value={form.titulo} onChange={e=>setForm({...form,titulo:e.target.value})} placeholder="Describí la idea..."/>
        </div>
        <div>
          <label style={{fontSize:'0.72em', color:MUTED, display:'block', marginBottom:4}}>PLATAFORMA</label>
          <Sel value={form.plataforma} onChange={v=>setForm({...form,plataforma:v})}
            options={[['todas','🎬 Todas'],...Object.entries(PLAT).map(([k,p])=>[k,`${p.icon} ${p.label}`])]}/>
        </div>
        <div>
          <label style={{fontSize:'0.72em', color:MUTED, display:'block', marginBottom:4}}>ESTADO</label>
          <Sel value={form.estado_idea} onChange={v=>setForm({...form,estado_idea:v})}
            options={Object.entries(ESTADOS_IDEA).map(([k,v])=>[k,v.label])}/>
        </div>
        <div style={{gridColumn:'1/-1'}}>
          <label style={{fontSize:'0.72em', color:MUTED, display:'block', marginBottom:4}}>DETALLE</label>
          <textarea style={S.textarea} value={form.descripcion} onChange={e=>setForm({...form,descripcion:e.target.value})}/>
        </div>
      </div>
      <Msg msg={msg}/>
      <div style={{display:'flex', gap:10}}>
        <button style={S.btn()} onClick={guardar} disabled={saving}>{saving?'Guardando...':'💾 Guardar'}</button>
        <button style={S.btnSm()} onClick={()=>setForm(null)}>Cancelar</button>
      </div>
    </div>
  )

  return (
    <div>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:10, marginBottom:16}}>
        <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
          {[['todas','Todas'],...Object.entries(ESTADOS_IDEA).map(([k,v])=>[k,v.label])].map(([v,l])=>(
            <button key={v} onClick={()=>setFiltro(v)} style={{
              padding:'5px 12px', borderRadius:20, border:`1px solid ${BORDER}`,
              background: filtro===v ? GOLD : SURF2, color: filtro===v ? '#fff' : MUTED,
              cursor:'pointer', fontSize:'0.78em', fontFamily:'DM Sans,sans-serif'
            }}>{l}</button>
          ))}
        </div>
        <button style={S.btn()} onClick={()=>setForm({...EMPTY})}>+ Nueva idea</button>
      </div>
      {loading ? <div style={{textAlign:'center', padding:40, color:MUTED}}>Cargando...</div>
      : filtrados.length===0 ? <div style={{...S.card, textAlign:'center', padding:40, color:MUTED}}>Sin ideas aquí.</div>
      : (
        <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:10}}>
          {filtrados.map(item=>{
            const est = ESTADOS_IDEA[item.estado_idea]||{}
            return (
              <div key={item.id} style={{...S.card, marginBottom:0}}>
                <div style={{display:'flex', justifyContent:'space-between', marginBottom:8}}>
                  <span style={S.badge(est.color||MUTED)}>{est.label||item.estado_idea}</span>
                  {item.plataforma&&item.plataforma!=='todas' && <PlatBadge plat={item.plataforma}/>}
                </div>
                <div style={{fontWeight:600, color:TEXT, fontSize:'0.88em', marginBottom:6}}>{item.titulo}</div>
                {item.descripcion && <div style={{fontSize:'0.8em', color:MUTED, lineHeight:1.4, marginBottom:10}}>{item.descripcion}</div>}
                <div style={{display:'flex', gap:6}}>
                  <button style={S.btnSm()} onClick={()=>setForm({...item})}>✏️</button>
                  <button style={{...S.btnSm(), color:'#fc8181', borderColor:'#fc818144'}} onClick={()=>eliminar(item.id)}>✕</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── TAB: ESTADÍSTICAS ────────────────────────────────────────────────────────
function TabEstadisticas() {
  const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
  const EMPTY = { mes:'', anio: new Date().getFullYear(), plataforma:'tiktok', seguidores:0, alcance:0, interacciones:0, videos_publicados:0, notas:'' }
  const [registros, setRegistros] = useState([])
  const [loading, setLoading]     = useState(true)
  const [form, setForm]           = useState(null)
  const [saving, setSaving]       = useState(false)
  const [msg, setMsg]             = useState(null)

  function showMsg(t, ok=true) { setMsg({t,ok}); setTimeout(()=>setMsg(null),3000) }

  async function cargar() {
    setLoading(true)
    const { data } = await supabase.from('social_estadisticas').select('*').order('anio',{ascending:false}).order('mes',{ascending:false})
    setRegistros(data||[])
    setLoading(false)
  }
  useEffect(()=>{ cargar() },[])

  async function guardar() {
    if (!form.mes||!form.plataforma) return showMsg('Mes y plataforma requeridos.', false)
    setSaving(true)
    if (form.id) await supabase.from('social_estadisticas').update(form).eq('id', form.id)
    else await supabase.from('social_estadisticas').insert({...form, creado_en: new Date().toISOString()})
    setSaving(false); setForm(null); showMsg('Guardado.'); cargar()
  }

  async function eliminar(id) {
    if (!confirm('¿Eliminar?')) return
    await supabase.from('social_estadisticas').delete().eq('id', id); cargar()
  }

  if (form) return (
    <div>
      <button style={{...S.btnSm(), marginBottom:16}} onClick={()=>setForm(null)}>← Volver</button>
      <h2 style={{color:TEXT, fontSize:'1.05em', fontWeight:700, marginBottom:18}}>📊 {form.id?'Editar métricas':'Registrar métricas del mes'}</h2>
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:12}}>
        <div>
          <label style={{fontSize:'0.72em', color:MUTED, display:'block', marginBottom:4}}>MES *</label>
          <Sel value={form.mes} onChange={v=>setForm({...form,mes:v})}
            options={[['','Seleccioná'],...MESES.map((m,i)=>[String(i+1).padStart(2,'0'),m])]}/>
        </div>
        <div>
          <label style={{fontSize:'0.72em', color:MUTED, display:'block', marginBottom:4}}>AÑO</label>
          <input type="number" style={S.input} value={form.anio} onChange={e=>setForm({...form,anio:parseInt(e.target.value)})}/>
        </div>
        <div>
          <label style={{fontSize:'0.72em', color:MUTED, display:'block', marginBottom:4}}>PLATAFORMA *</label>
          <Sel value={form.plataforma} onChange={v=>setForm({...form,plataforma:v})}
            options={Object.entries(PLAT).map(([k,p])=>[k,`${p.icon} ${p.label}`])}/>
        </div>
        {[['seguidores','SEGUIDORES'],['alcance','ALCANCE'],['interacciones','INTERACCIONES'],['videos_publicados','VIDEOS']].map(([k,l])=>(
          <div key={k}>
            <label style={{fontSize:'0.72em', color:MUTED, display:'block', marginBottom:4}}>{l}</label>
            <input type="number" style={S.input} value={form[k]} onChange={e=>setForm({...form,[k]:parseInt(e.target.value)||0})}/>
          </div>
        ))}
        <div style={{gridColumn:'1/-1'}}>
          <label style={{fontSize:'0.72em', color:MUTED, display:'block', marginBottom:4}}>NOTAS</label>
          <textarea style={{...S.textarea, minHeight:56}} value={form.notas} onChange={e=>setForm({...form,notas:e.target.value})}/>
        </div>
      </div>
      <Msg msg={msg}/>
      <div style={{display:'flex', gap:10}}>
        <button style={S.btn()} onClick={guardar} disabled={saving}>{saving?'Guardando...':'💾 Guardar'}</button>
        <button style={S.btnSm()} onClick={()=>setForm(null)}>Cancelar</button>
      </div>
    </div>
  )

  return (
    <div>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16}}>
        <div style={{fontSize:'0.84em', color:MUTED}}>Métricas manuales por mes y plataforma</div>
        <button style={S.btn()} onClick={()=>setForm({...EMPTY})}>+ Registrar métricas</button>
      </div>
      {loading ? <div style={{textAlign:'center', padding:40, color:MUTED}}>Cargando...</div>
      : registros.length===0 ? <div style={{...S.card, textAlign:'center', padding:40, color:MUTED}}>Aún no hay métricas.</div>
      : (
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%', borderCollapse:'collapse'}}>
            <thead><tr>{['Mes','Plataforma','Seguidores','Alcance','Interacciones','Videos','Notas',''].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
            <tbody>
              {registros.map(r=>(
                <tr key={r.id}>
                  <td style={{...S.td, fontWeight:600}}>{MESES[(parseInt(r.mes)||1)-1]} {r.anio}</td>
                  <td style={S.td}><PlatBadge plat={r.plataforma}/></td>
                  <td style={{...S.td, textAlign:'right', color:'#63b3ed', fontWeight:600}}>{(r.seguidores||0).toLocaleString()}</td>
                  <td style={{...S.td, textAlign:'right'}}>{(r.alcance||0).toLocaleString()}</td>
                  <td style={{...S.td, textAlign:'right'}}>{(r.interacciones||0).toLocaleString()}</td>
                  <td style={{...S.td, textAlign:'right'}}>{r.videos_publicados||0}</td>
                  <td style={{...S.td, color:MUTED, maxWidth:160, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{r.notas||'—'}</td>
                  <td style={S.td}>
                    <div style={{display:'flex', gap:6}}>
                      <button style={S.btnSm()} onClick={()=>setForm({...r})}>✏️</button>
                      <button style={{...S.btnSm(), color:'#fc8181', borderColor:'#fc818144'}} onClick={()=>eliminar(r.id)}>✕</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── PÁGINA PRINCIPAL ─────────────────────────────────────────────────────────
const TABS = [
  { id:'listos',       icon:'✅', label:'Listo para publicar' },
  { id:'pendientes',   icon:'🎬', label:'Por grabar' },
  { id:'revision',     icon:'👀', label:'En revisión' },
  { id:'ideas',        icon:'💡', label:'Ideas' },
  { id:'estadisticas', icon:'📊', label:'Estadísticas' },
]

export default function SocialPage() {
  const [tab, setTab] = useState('listos')

  return (
    <div style={{ fontFamily:'DM Sans,sans-serif', color:TEXT, padding:'28px 32px', minHeight:'100vh', background:BG, margin:'-32px -36px', minWidth:'calc(100% + 72px)' }}>
      <div style={{ marginBottom:24 }}>
        <span style={{ fontSize:'0.68rem', fontWeight:700, letterSpacing:'0.10em', textTransform:'uppercase', color:GOLD, display:'block', marginBottom:4 }}>
          Redes Sociales · SOL
        </span>
        <h1 style={{ fontSize:'1.7rem', fontWeight:700, color:TEXT, letterSpacing:'-0.02em', lineHeight:1.2, margin:0 }}>
          📱 Redes Sociales
        </h1>
        <p style={{ fontSize:'0.82rem', color:MUTED, marginTop:4 }}>Gestión de contenido · Depósito Jiménez</p>
      </div>
      <div style={{ display:'flex', gap:0, borderBottom:`1px solid ${BORDER}`, marginBottom:24, overflowX:'auto' }}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{
            padding:'10px 18px', border:'none', background:'none', cursor:'pointer',
            fontSize:'0.85em', fontWeight: tab===t.id ? 700 : 400,
            color: tab===t.id ? GOLD : MUTED,
            borderBottom: tab===t.id ? `2px solid ${GOLD}` : '2px solid transparent',
            marginBottom:-1, whiteSpace:'nowrap', fontFamily:'DM Sans,sans-serif', transition:'color 0.12s'
          }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>
      {tab==='listos'        && <TabListoPublicar/>}
      {tab==='pendientes'    && <TabPendientes/>}
      {tab==='revision'      && <TabRevision/>}
      {tab==='ideas'         && <TabIdeas/>}
      {tab==='estadisticas'  && <TabEstadisticas/>}
    </div>
  )
}
