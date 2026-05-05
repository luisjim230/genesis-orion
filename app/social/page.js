'use client'
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'

// ─── DESIGN TOKENS (Liquid Glass Light) ──────────────────────────────────────
const GOLD   = '#c8a84b'
const BG     = 'transparent'
const SURF   = 'rgba(255,255,255,0.55)'
const SURF2  = 'rgba(255,255,255,0.4)'
const BORDER = 'rgba(0,0,0,0.08)'
const TEXT   = 'rgba(0,0,0,0.8)'
const MUTED  = 'rgba(0,0,0,0.4)'

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

const PLAT = {
  tiktok:    { label:'TikTok',    color:'#69C9D0', icon:'🎵' },
  instagram: { label:'Instagram', color:'#E1306C', icon:'📸' },
  facebook:  { label:'Facebook',  color:'#4267B2', icon:'👍' },
  youtube:   { label:'YouTube',   color:'#FF0000', icon:'▶️' },
}

// Estado unificado del flujo
const ESTADOS = {
  idea:               { label:'Idea',                     color:'#a78bfa', icon:'💡', next:'por_grabar' },
  por_grabar:         { label:'Por grabar',               color:'#f6ad55', icon:'🎬', next:'grabado_no_editado' },
  grabado_no_editado: { label:'Grabado, sin editar',      color:'#f687b3', icon:'🎞️', next:'en_revision' },
  en_revision:        { label:'En revisión',              color:'#63b3ed', icon:'👀', next:'listo' },
  listo:              { label:'Listo',                    color:'#68d391', icon:'✅', next:'programado' },
  programado:         { label:'Programado',               color:GOLD,      icon:'📅', next:'publicado' },
  publicado:          { label:'Publicado',                color:'#718096', icon:'✔️', next:null },
}

// ─── STYLES ──────────────────────────────────────────────────────────────────
const S = {
  card: { background:SURF, border:`1px solid ${BORDER}`, borderRadius:12, padding:'16px 18px', marginBottom:12 },
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

// ─── HELPERS ─────────────────────────────────────────────────────────────────

// plat puede ser string (legacy) o array
function normPlat(plat) {
  if (!plat) return []
  if (Array.isArray(plat)) return plat
  return [plat]
}

function PlatBadge({ plat }) {
  const plats = normPlat(plat).filter(k => PLAT[k])
  if (plats.length === 0) return null
  return (
    <span style={{display:'inline-flex', gap:4, flexWrap:'wrap'}}>
      {plats.map(k => {
        const p = PLAT[k]
        return <span key={k} style={S.badge(p.color)}>{p.icon} {p.label}</span>
      })}
    </span>
  )
}

// Selector multi-plataforma con checkboxes
function PlatSelector({ value, onChange }) {
  const selected = normPlat(value)
  function toggle(k) {
    const next = selected.includes(k) ? selected.filter(x=>x!==k) : [...selected, k]
    onChange(next)
  }
  return (
    <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
      {Object.entries(PLAT).map(([k,p])=>{
        const on = selected.includes(k)
        return (
          <div key={k} onClick={()=>toggle(k)} style={{
            display:'flex', alignItems:'center', gap:6,
            padding:'7px 14px', borderRadius:8, cursor:'pointer',
            background: on ? p.color+'22' : SURF2,
            border: `1px solid ${on ? p.color+'88' : BORDER}`,
            color: on ? p.color : MUTED,
            fontSize:'0.84em', fontWeight: on?600:400,
            transition:'all 0.12s', userSelect:'none',
          }}>
            <span style={{
              width:14, height:14, borderRadius:3, border:`2px solid ${on?p.color:BORDER}`,
              background: on ? p.color : 'transparent',
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:'0.7em', color:'#fff', flexShrink:0,
            }}>{on?'✓':''}</span>
            {p.icon} {p.label}
          </div>
        )
      })}
    </div>
  )
}

function EstadoBadge({ estado }) {
  const e = ESTADOS[estado]
  if (!e) return null
  return <span style={S.badge(e.color)}>{e.icon} {e.label}</span>
}

function Sel({ value, onChange, options, style={} }) {
  return (
    <select value={value} onChange={ev=>onChange(ev.target.value)}
      style={{ ...S.input, cursor:'pointer', ...style }}>
      {options.map(([v,l])=><option key={v} value={v}>{l}</option>)}
    </select>
  )
}

function FiltroPlat({ value, onChange }) {
  return (
    <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
      {[['todas','🎬 Todas'],['tiktok','🎵 TikTok'],['instagram','📸 Instagram'],['facebook','👍 Facebook'],['youtube','▶️ YouTube']].map(([v,l])=>(
        <button key={v} onClick={()=>onChange(v)} style={{
          padding:'6px 14px', borderRadius:20, border:`1px solid ${BORDER}`,
          background: value===v ? GOLD : SURF2, color: value===v ? '#fff' : MUTED,
          cursor:'pointer', fontSize:'0.8em', fontFamily:'DM Sans,sans-serif'
        }}>{l}</button>
      ))}
    </div>
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

// ─── FORM CONTENIDO ──────────────────────────────────────────────────────────
function FormContenido({ item, onClose, onSaved }) {
  const EMPTY = {
    titulo:'', plataforma:['tiktok'], estado:'idea',
    descripcion:'', link_archivo:'', caption:'', hashtags:'', notas:'',
    fecha_programada:'', hora_programada:'12:00', prioridad:'media',
  }
  const [form, setForm] = useState(item ? {...item} : {...EMPTY})
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)

  function showMsg(t, ok=true) { setMsg({t,ok}); setTimeout(()=>setMsg(null),3500) }

  async function guardar() {
    if (!form.titulo.trim()) return showMsg('El título es requerido.', false)
    if (form.estado === 'publicado' && !form.fecha_programada)
      return showMsg('⚠️ La fecha es obligatoria para estado "Publicado".', false)
    setSaving(true)
    const payload = { ...form }
    if (!payload.fecha_programada) payload.fecha_programada = null
    if (!payload.hora_programada) payload.hora_programada = null
    if (form.id) {
      await supabase.from('social_contenido').update(payload).eq('id', form.id)
    } else {
      await supabase.from('social_contenido').insert({...payload, creado_en: new Date().toISOString()})
    }
    setSaving(false)
    showMsg('Guardado.')
    setTimeout(()=>{ onSaved() }, 800)
  }

  const esProgramado = form.estado === 'programado' || form.estado === 'publicado'

  return (
    <div>
      <button style={{...S.btnSm(), marginBottom:16}} onClick={onClose}>← Volver</button>
      <h2 style={{color:TEXT, fontSize:'1.05em', fontWeight:700, marginBottom:18}}>
        {form.id ? '✏️ Editar contenido' : '➕ Nuevo contenido'}
      </h2>
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12}}>
        <div style={{gridColumn:'1/-1'}}>
          <label style={{fontSize:'0.72em', color:MUTED, display:'block', marginBottom:4}}>TÍTULO *</label>
          <input style={S.input} value={form.titulo} onChange={e=>setForm({...form,titulo:e.target.value})} placeholder="Nombre del video/post"/>
        </div>
        <div style={{gridColumn:'1/-1'}}>
          <label style={{fontSize:'0.72em', color:MUTED, display:'block', marginBottom:8}}>PLATAFORMA <span style={{color:MUTED, fontWeight:400}}>(podés seleccionar varias)</span></label>
          <PlatSelector value={form.plataforma} onChange={v=>setForm({...form,plataforma:v})}/>
        </div>
        <div>
          <label style={{fontSize:'0.72em', color:MUTED, display:'block', marginBottom:4}}>ESTADO EN EL FLUJO</label>
          <Sel value={form.estado} onChange={v=>setForm({...form,estado:v})}
            options={Object.entries(ESTADOS).map(([k,e])=>[k,`${e.icon} ${e.label}`])}/>
        </div>
        <div>
          <label style={{fontSize:'0.72em', color:MUTED, display:'block', marginBottom:4}}>PRIORIDAD</label>
          <Sel value={form.prioridad} onChange={v=>setForm({...form,prioridad:v})}
            options={[['alta','🔴 Alta'],['media','🟡 Media'],['baja','🟢 Baja']]}/>
        </div>
        <div>
          <label style={{fontSize:'0.72em', color: (esProgramado && !form.fecha_programada) ? '#fc8181' : MUTED, display:'block', marginBottom:4}}>
            {esProgramado ? 'FECHA PROGRAMADA *' : 'FECHA SUGERIDA'}
            {!esProgramado && !form.fecha_programada && <span style={{marginLeft:6, color:'#f6ad55', fontWeight:400}}>(sin fecha no aparece en calendario)</span>}
          </label>
          <input type="date" style={{...S.input, borderColor: (esProgramado && !form.fecha_programada) ? '#fc818188' : undefined}} value={form.fecha_programada} onChange={e=>setForm({...form,fecha_programada:e.target.value})}/>
          {!form.fecha_programada && <div style={{marginTop:6, fontSize:'0.72em', color:'#f59e0b', fontWeight:600}}>⏰ Sin fecha — el contenido seguirá visible con badge "Sin fecha"</div>}
          {form.fecha_programada && <button style={{marginTop:4, background:'none', border:'none', color:MUTED, fontSize:'0.72em', cursor:'pointer', padding:0, textDecoration:'underline'}} onClick={()=>setForm({...form,fecha_programada:''})}>Quitar fecha</button>}
        </div>
        {(form.fecha_programada || esProgramado) && (
          <div>
            <label style={{fontSize:'0.72em', color:MUTED, display:'block', marginBottom:4}}>HORA</label>
            <input type="time" style={S.input} value={form.hora_programada} onChange={e=>setForm({...form,hora_programada:e.target.value})}/>
          </div>
        )}
        <div style={{gridColumn:'1/-1'}}>
          <label style={{fontSize:'0.72em', color:MUTED, display:'block', marginBottom:4}}>LINK AL ARCHIVO (Drive / Dropbox)</label>
          <input style={S.input} value={form.link_archivo} onChange={e=>setForm({...form,link_archivo:e.target.value})} placeholder="https://drive.google.com/..."/>
        </div>
        <div style={{gridColumn:'1/-1'}}>
          <label style={{fontSize:'0.72em', color:MUTED, display:'block', marginBottom:4}}>DESCRIPCIÓN / GUIÓN</label>
          <textarea style={S.textarea} value={form.descripcion} onChange={e=>setForm({...form,descripcion:e.target.value})} placeholder="Qué debe mostrar, puntos clave, guión..."/>
        </div>
        <div style={{gridColumn:'1/-1'}}>
          <label style={{fontSize:'0.72em', color:MUTED, display:'block', marginBottom:4}}>CAPTION</label>
          <textarea style={{...S.textarea, minHeight:56}} value={form.caption} onChange={e=>setForm({...form,caption:e.target.value})} placeholder="Texto que va con la publicación..."/>
        </div>
        <div style={{gridColumn:'1/-1'}}>
          <label style={{fontSize:'0.72em', color:MUTED, display:'block', marginBottom:4}}>HASHTAGS</label>
          <input style={S.input} value={form.hashtags} onChange={e=>setForm({...form,hashtags:e.target.value})} placeholder="#construccion #costarica"/>
        </div>
        <div style={{gridColumn:'1/-1'}}>
          <label style={{fontSize:'0.72em', color:MUTED, display:'block', marginBottom:4}}>NOTAS INTERNAS</label>
          <textarea style={{...S.textarea, minHeight:52}} value={form.notas} onChange={e=>setForm({...form,notas:e.target.value})} placeholder="Detalles para el equipo..."/>
        </div>
      </div>
      <Msg msg={msg}/>
      <div style={{display:'flex', gap:10}}>
        <button style={S.btn()} onClick={guardar} disabled={saving}>{saving?'Guardando...':'💾 Guardar'}</button>
        <button style={S.btnSm()} onClick={onClose}>Cancelar</button>
      </div>
    </div>
  )
}

// ─── DETALLE CONTENIDO ────────────────────────────────────────────────────────
function DetalleContenido({ item, onClose, onEdit, onRefresh }) {
  const [msg, setMsg] = useState(null)
  const [saving, setSaving] = useState(false)
  const [nuevoComentario, setNuevoComentario] = useState('')

  function showMsg(t, ok=true) { setMsg({t,ok}); setTimeout(()=>setMsg(null),3500) }

  async function avanzarEstado() {
    const siguiente = ESTADOS[item.estado]?.next
    if (!siguiente) return
    setSaving(true)
    const extra = {}
    if (siguiente === 'publicado') extra.fecha_publicacion = new Date().toISOString()
    await supabase.from('social_contenido').update({ estado: siguiente, ...extra }).eq('id', item.id)
    setSaving(false)
    showMsg(`Movido a: ${ESTADOS[siguiente].label} ✓`)
    setTimeout(()=>{ onRefresh() }, 800)
  }

  async function cambiarEstado(nuevoEstado) {
    setSaving(true)
    const extra = {}
    if (nuevoEstado === 'publicado') extra.fecha_publicacion = new Date().toISOString()
    await supabase.from('social_contenido').update({ estado: nuevoEstado, ...extra }).eq('id', item.id)
    setSaving(false)
    showMsg(`Estado: ${ESTADOS[nuevoEstado].label}`)
    setTimeout(()=>{ onRefresh() }, 600)
  }

  async function agregarComentario() {
    if (!nuevoComentario.trim()) return
    const comentarios = [...(item.comentarios||[]), { texto: nuevoComentario.trim(), fecha: new Date().toISOString() }]
    await supabase.from('social_contenido').update({ comentarios }).eq('id', item.id)
    setNuevoComentario('')
    showMsg('Comentario agregado.')
    onRefresh()
  }

  async function eliminar() {
    if (!confirm('¿Eliminar este contenido?')) return
    await supabase.from('social_contenido').delete().eq('id', item.id)
    onClose()
    onRefresh()
  }

  const sig = ESTADOS[item.estado]?.next
  const PRIOR_COLOR = { alta:'#fc8181', media:'#f6ad55', baja:'#68d391' }

  return (
    <div>
      <button style={{...S.btnSm(), marginBottom:16}} onClick={onClose}>← Volver</button>
      <Msg msg={msg}/>

      {/* Header */}
      <div style={S.card}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:10, marginBottom:16}}>
          <div>
            <div style={{fontWeight:700, color:TEXT, fontSize:'1.1em', marginBottom:8}}>{item.titulo}</div>
            <div style={{display:'flex', gap:8, flexWrap:'wrap', alignItems:'center'}}>
              <PlatBadge plat={item.plataforma}/>
              <EstadoBadge estado={item.estado}/>
              {item.prioridad && <span style={S.badge(PRIOR_COLOR[item.prioridad]||MUTED)}>{item.prioridad}</span>}
            </div>
          </div>
          <button style={S.btnSm()} onClick={onEdit}>✏️ Editar</button>
        </div>

        {/* Flujo visual */}
        <div style={{marginBottom:16}}>
          <div style={{fontSize:'0.7em', color:MUTED, marginBottom:10, textTransform:'uppercase', letterSpacing:'0.06em'}}>Flujo del contenido</div>
          <div style={{display:'flex', alignItems:'center', gap:4, flexWrap:'wrap'}}>
            {Object.entries(ESTADOS).map(([k, e], i, arr)=>{
              const isActive = k === item.estado
              const isPast = Object.keys(ESTADOS).indexOf(k) < Object.keys(ESTADOS).indexOf(item.estado)
              return (
                <div key={k} style={{display:'flex', alignItems:'center', gap:4}}>
                  <button
                    onClick={()=> k !== item.estado && cambiarEstado(k)}
                    style={{
                      padding:'4px 10px', borderRadius:20, border:`1px solid ${isActive ? e.color : isPast ? e.color+'44' : BORDER}`,
                      background: isActive ? e.color+'33' : isPast ? e.color+'11' : 'transparent',
                      color: isActive ? e.color : isPast ? e.color+'88' : MUTED,
                      cursor: k !== item.estado ? 'pointer' : 'default',
                      fontSize:'0.72em', fontWeight: isActive ? 700 : 400, fontFamily:'DM Sans,sans-serif',
                      transition:'all 0.15s'
                    }}
                  >{e.icon} {e.label}</button>
                  {i < arr.length-1 && <span style={{color:BORDER, fontSize:'0.8em'}}>›</span>}
                </div>
              )
            })}
          </div>
        </div>

        {/* Botón avanzar */}
        {sig && (
          <button style={{...S.btn(ESTADOS[sig].color), marginBottom:4}} onClick={avanzarEstado} disabled={saving}>
            {saving ? 'Guardando...' : `→ Pasar a ${ESTADOS[sig].label}`}
          </button>
        )}
      </div>

      {/* Datos */}
      <div style={S.card}>
        {item.fecha_programada && (
          <div style={{marginBottom:12, fontSize:'0.84em', color:MUTED}}>
            📅 {item.fecha_programada} {item.hora_programada && `· ${item.hora_programada}`}
            {item.fecha_publicacion && <span style={{marginLeft:16, color:'#68d391'}}>✔️ Publicado: {new Date(item.fecha_publicacion).toLocaleDateString('es-CR')}</span>}
          </div>
        )}
        {item.link_archivo && (
          <div style={{marginBottom:12}}>
            <div style={{fontSize:'0.7em', color:MUTED, marginBottom:4}}>ARCHIVO</div>
            <a href={item.link_archivo} target="_blank" rel="noreferrer" style={{color:GOLD, fontSize:'0.84em', wordBreak:'break-all'}}>🔗 {item.link_archivo}</a>
          </div>
        )}
        {item.descripcion && (
          <div style={{marginBottom:12}}>
            <div style={{fontSize:'0.7em', color:MUTED, marginBottom:4}}>DESCRIPCIÓN / GUIÓN</div>
            <div style={{background:SURF2, borderRadius:8, padding:'10px 14px', fontSize:'0.84em', color:TEXT, lineHeight:1.5, whiteSpace:'pre-wrap'}}>{item.descripcion}</div>
          </div>
        )}
        {item.caption && (
          <div style={{marginBottom:12}}>
            <div style={{fontSize:'0.7em', color:MUTED, marginBottom:4}}>CAPTION</div>
            <div style={{background:SURF2, borderRadius:8, padding:'10px 14px', fontSize:'0.84em', color:TEXT, lineHeight:1.5, whiteSpace:'pre-wrap'}}>{item.caption}</div>
          </div>
        )}
        {item.hashtags && (
          <div style={{marginBottom:12}}>
            <div style={{fontSize:'0.7em', color:MUTED, marginBottom:4}}>HASHTAGS</div>
            <div style={{fontSize:'0.84em', color:'#63b3ed'}}>{item.hashtags}</div>
          </div>
        )}
        {item.notas && (
          <div>
            <div style={{fontSize:'0.7em', color:MUTED, marginBottom:4}}>NOTAS</div>
            <div style={{background:SURF2, borderRadius:8, padding:'10px 14px', fontSize:'0.83em', color:MUTED, lineHeight:1.5}}>{item.notas}</div>
          </div>
        )}
      </div>

      {/* Comentarios */}
      <div style={S.card}>
        <div style={{fontSize:'0.7em', color:MUTED, marginBottom:10, textTransform:'uppercase', letterSpacing:'0.06em'}}>
          Comentarios ({(item.comentarios||[]).length})
        </div>
        <div style={{maxHeight:200, overflowY:'auto', marginBottom:10}}>
          {(item.comentarios||[]).length === 0
            ? <div style={{color:MUTED, fontSize:'0.83em'}}>Sin comentarios aún.</div>
            : (item.comentarios||[]).map((c,i)=>(
              <div key={i} style={{background:SURF2, borderRadius:8, padding:'9px 12px', marginBottom:6}}>
                <div style={{fontSize:'0.84em', color:TEXT}}>{c.texto}</div>
                <div style={{fontSize:'0.7em', color:MUTED, marginTop:4}}>{new Date(c.fecha).toLocaleString('es-CR')}</div>
              </div>
            ))
          }
        </div>
        <div style={{display:'flex', gap:8}}>
          <input style={{...S.input, flex:1}} value={nuevoComentario}
            onChange={e=>setNuevoComentario(e.target.value)}
            placeholder="Agregar comentario..." onKeyDown={e=>e.key==='Enter'&&agregarComentario()}/>
          <button style={S.btn()} onClick={agregarComentario}>Enviar</button>
        </div>
      </div>

      <hr style={{border:'none', borderTop:`1px solid ${BORDER}`, margin:'4px 0 12px'}}/>
      <button style={S.btn('#7d1515')} onClick={eliminar}>🗑️ Eliminar</button>
    </div>
  )
}

// ─── TAB: LISTA (filtro por estado) ──────────────────────────────────────────
function TabLista({ items, loading, onNuevo, onDetalle, estadoFiltro }) {
  const [filtroPlat, setFiltroPlat] = useState('todas')

  let filtrados = estadoFiltro === 'todos'
    ? items.filter(x => x.estado !== 'publicado')
    : items.filter(x => x.estado === estadoFiltro)

  if (filtroPlat !== 'todas') filtrados = filtrados.filter(x => normPlat(x.plataforma).includes(filtroPlat))

  const PRIOR_COLOR = { alta:'#fc8181', media:'#f6ad55', baja:'#68d391' }

  // Stats para "listo"
  const listos = items.filter(x=>x.estado==='listo')
  const publicados = items.filter(x=>x.estado==='publicado')
  const proxSemana = items.filter(x=>{
    if (!x.fecha_programada || (x.estado!=='programado'&&x.estado!=='listo')) return false
    const d = new Date(x.fecha_programada), hoy = new Date()
    const diff = (d - hoy) / 86400000
    return diff >= 0 && diff <= 7
  }).length
  const sinFecha = items.filter(x=>x.estado==='listo'&&!x.fecha_programada).length

  return (
    <div>
      {estadoFiltro === 'listo' && (
        <div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20}}>
          {[
            ['🟢 En cola', listos.length, '#63b3ed'],
            ['✅ Publicados', publicados.length, '#68d391'],
            ['📅 Esta semana', proxSemana, GOLD],
            ['⏰ Sin fecha', sinFecha, '#f6ad55'],
          ].map(([l,v,c])=>(
            <div key={l} style={{background:SURF, border:`1px solid ${c}33`, borderTop:`3px solid ${c}`, borderRadius:10, padding:'14px 16px'}}>
              <div style={{fontSize:'0.7em', color:MUTED, textTransform:'uppercase', letterSpacing:'0.06em'}}>{l}</div>
              <div style={{fontSize:'1.8em', fontWeight:700, color:c, marginTop:4}}>{v}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:10, marginBottom:16}}>
        <FiltroPlat value={filtroPlat} onChange={setFiltroPlat}/>
        <button style={S.btn()} onClick={onNuevo}>+ Agregar contenido</button>
      </div>

      {loading ? <div style={{textAlign:'center', padding:40, color:MUTED}}>Cargando...</div>
      : filtrados.length===0
        ? <div style={{...S.card, textAlign:'center', padding:40, color:MUTED}}>No hay contenido aquí aún.</div>
        : (
          <div style={{display:'grid', gap:8}}>
            {filtrados.map(item=>{
              const e = ESTADOS[item.estado]||{}
              const sig = e.next
              const d = item.fecha_programada ? new Date(item.fecha_programada) : null
              const diff = d ? (d - new Date()) / 86400000 : null
              const fColor = diff===null ? MUTED : diff<0 ? '#fc8181' : diff<=3 ? '#f6ad55' : '#68d391'
              return (
                <div key={item.id} style={{...S.card, marginBottom:0, cursor:'pointer', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:12}}
                  onClick={()=>onDetalle(item)}>
                  <div style={{flex:1, minWidth:0}}>
                    <div style={{fontWeight:600, color:TEXT, fontSize:'0.9em', marginBottom:6, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{item.titulo}</div>
                    <div style={{display:'flex', gap:8, alignItems:'center', flexWrap:'wrap'}}>
                      <PlatBadge plat={item.plataforma}/>
                      <EstadoBadge estado={item.estado}/>
                      {item.prioridad && item.prioridad!=='media' && <span style={S.badge(PRIOR_COLOR[item.prioridad])}>{item.prioridad}</span>}
                      {item.fecha_programada
                        ? <span style={{fontSize:'0.75em', color:fColor}}>📅 {item.fecha_programada}</span>
                        : <span style={{...S.badge('#f59e0b'), fontSize:'0.7em'}}>⏰ Sin fecha</span>
                      }
                      {(item.comentarios||[]).length>0 && <span style={{fontSize:'0.75em', color:MUTED}}>💬 {item.comentarios.length}</span>}
                    </div>
                  </div>
                  <div style={{display:'flex', gap:6}} onClick={ev=>ev.stopPropagation()}>
                    {item.link_archivo && <a href={item.link_archivo} target="_blank" rel="noreferrer" style={{...S.btnSm(), textDecoration:'none', color:GOLD}}>🔗</a>}
                    {sig && (
                      <button style={{...S.btn(ESTADOS[sig]?.color||GOLD), fontSize:'0.76em', padding:'5px 12px'}}
                        onClick={async ev=>{ ev.stopPropagation(); await supabase.from('social_contenido').update({estado:sig}).eq('id',item.id); onDetalle(null); window.location.reload() }}>
                        → {ESTADOS[sig]?.label}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )
      }

      {/* Historial publicados (solo en tab listo) */}
      {estadoFiltro === 'listo' && publicados.length > 0 && (
        <div style={{...S.card, padding:0, overflow:'hidden', marginTop:20}}>
          <div style={{padding:'12px 18px', borderBottom:`1px solid ${BORDER}`, fontWeight:600, color:MUTED, fontSize:'0.85em'}}>
            ✔️ Historial publicados — {publicados.length}
          </div>
          <div style={{overflowX:'auto', maxHeight:280, overflowY:'auto'}}>
            <table style={{width:'100%', borderCollapse:'collapse'}}>
              <thead><tr>{['Plataforma','Título','Publicado',''].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
              <tbody>
                {publicados.map(item=>(
                  <tr key={item.id} onClick={()=>onDetalle(item)} style={{cursor:'pointer'}}>
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

// ─── VISTA CALENDARIO MES ────────────────────────────────────────────────────
function CalendarioMes({ items, onDetalle }) {
  const hoy = new Date()
  const [ano, setAno] = useState(hoy.getFullYear())
  const [mes, setMes] = useState(hoy.getMonth())

  const MESES_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
  const DIAS_ES  = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']

  const primerDia = new Date(ano, mes, 1).getDay()
  const diasEnMes = new Date(ano, mes+1, 0).getDate()

  // Items con fecha en este mes
  const itemsDelMes = useMemo(()=>{
    return items.filter(x => {
      if (!x.fecha_programada) return false
      const d = new Date(x.fecha_programada)
      return d.getFullYear()===ano && d.getMonth()===mes
    })
  }, [items, ano, mes])

  function itemsDelDia(dia) {
    return itemsDelMes.filter(x => {
      const d = new Date(x.fecha_programada)
      return d.getDate() === dia
    })
  }

  const celdas = []
  for (let i=0; i<primerDia; i++) celdas.push(null)
  for (let d=1; d<=diasEnMes; d++) celdas.push(d)

  const esHoy = (dia) => dia && hoy.getFullYear()===ano && hoy.getMonth()===mes && hoy.getDate()===dia

  return (
    <div>
      {/* Nav mes */}
      <div style={{display:'flex', alignItems:'center', gap:16, marginBottom:20}}>
        <button style={S.btnSm()} onClick={()=>{ if(mes===0){setMes(11);setAno(a=>a-1)}else setMes(m=>m-1) }}>‹</button>
        <div style={{fontWeight:700, color:TEXT, fontSize:'1em', minWidth:180, textAlign:'center'}}>
          {MESES_ES[mes]} {ano}
        </div>
        <button style={S.btnSm()} onClick={()=>{ if(mes===11){setMes(0);setAno(a=>a+1)}else setMes(m=>m+1) }}>›</button>
        <button style={{...S.btnSm(), marginLeft:8}} onClick={()=>{setMes(hoy.getMonth());setAno(hoy.getFullYear())}}>Hoy</button>
      </div>

      {/* Grid */}
      <div style={{display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:1, background:BORDER, borderRadius:10, overflow:'hidden'}}>
        {DIAS_ES.map(d=>(
          <div key={d} style={{background:SURF2, padding:'8px 0', textAlign:'center', fontSize:'0.72em', color:MUTED, textTransform:'uppercase', letterSpacing:'0.05em', fontWeight:600}}>
            {d}
          </div>
        ))}
        {celdas.map((dia, i)=>{
          const its = dia ? itemsDelDia(dia) : []
          return (
            <div key={i} style={{
              background: esHoy(dia) ? '#ED6E2E11' : SURF,
              minHeight:90,
              padding:'6px 5px',
              border: esHoy(dia) ? `1px solid ${GOLD}44` : 'none',
              position:'relative',
            }}>
              {dia && (
                <>
                  <div style={{
                    fontSize:'0.8em', fontWeight: esHoy(dia)?700:400,
                    color: esHoy(dia) ? GOLD : MUTED,
                    marginBottom:4,
                    width:22, height:22, borderRadius:'50%',
                    background: esHoy(dia) ? GOLD+'22' : 'transparent',
                    display:'flex', alignItems:'center', justifyContent:'center',
                  }}>{dia}</div>
                  {its.slice(0,3).map((item,j)=>{
                    const plats = normPlat(item.plataforma)
                    const p = PLAT[plats[0]] // color del primero para el calendario
                    return (
                      <div key={j} onClick={()=>onDetalle(item)} style={{
                        background: (p?.color||GOLD)+'22',
                        border:`1px solid ${p?.color||GOLD}44`,
                        borderLeft:`3px solid ${p?.color||GOLD}`,
                        borderRadius:4,
                        padding:'2px 5px',
                        marginBottom:2,
                        cursor:'pointer',
                        fontSize:'0.68em',
                        color:TEXT,
                        overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                      }}>
                        {plats.map(k=>PLAT[k]?.icon).join('')} {item.titulo}
                      </div>
                    )
                  })}
                  {its.length>3 && <div style={{fontSize:'0.65em', color:MUTED, marginTop:2}}>+{its.length-3} más</div>}
                </>
              )}
            </div>
          )
        })}
      </div>

      {/* Leyenda */}
      <div style={{display:'flex', gap:16, marginTop:16, flexWrap:'wrap'}}>
        {Object.entries(PLAT).map(([k,p])=>(
          <div key={k} style={{display:'flex', alignItems:'center', gap:6, fontSize:'0.78em', color:MUTED}}>
            <div style={{width:10, height:10, borderRadius:2, background:p.color, flexShrink:0}}/>
            {p.label}
          </div>
        ))}
        <div style={{display:'flex', alignItems:'center', gap:6, fontSize:'0.78em', color:MUTED, marginLeft:'auto'}}>
          {Object.entries(ESTADOS).filter(([k])=>k!=='publicado').map(([k,e])=>(
            <span key={k} style={{...S.badge(e.color), fontSize:'0.7em'}}>{e.icon} {e.label}</span>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── VISTA CALENDARIO SEMANA ─────────────────────────────────────────────────
function CalendarioSemana({ items, onDetalle }) {
  const hoy = new Date()
  const [baseDate, setBaseDate] = useState(()=>{
    const d = new Date()
    d.setDate(d.getDate() - d.getDay())
    return d
  })

  const DIAS_ES = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']
  const DIAS_FULL = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado']

  function semanaActual() {
    const d = new Date()
    d.setDate(d.getDate() - d.getDay())
    setBaseDate(d)
  }

  function navSemana(dir) {
    const d = new Date(baseDate)
    d.setDate(d.getDate() + dir*7)
    setBaseDate(d)
  }

  const diasSemana = Array.from({length:7}, (_,i)=>{
    const d = new Date(baseDate)
    d.setDate(d.getDate() + i)
    return d
  })

  function toKey(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }

  function itemsDia(dia) {
    const key = toKey(dia)
    return items.filter(x => x.fecha_programada && x.fecha_programada.startsWith(key))
  }

  const esHoy = (d) => toKey(d) === toKey(hoy)

  const inicio = diasSemana[0]
  const fin = diasSemana[6]
  const fmt = (d) => d.toLocaleDateString('es-CR', {day:'numeric', month:'short'})

  return (
    <div>
      {/* Nav semana */}
      <div style={{display:'flex', alignItems:'center', gap:16, marginBottom:20}}>
        <button style={S.btnSm()} onClick={()=>navSemana(-1)}>‹ Anterior</button>
        <div style={{fontWeight:700, color:TEXT, fontSize:'0.95em', minWidth:200, textAlign:'center'}}>
          {fmt(inicio)} — {fmt(fin)}
        </div>
        <button style={S.btnSm()} onClick={()=>navSemana(1)}>Siguiente ›</button>
        <button style={{...S.btnSm(), marginLeft:8}} onClick={semanaActual}>Esta semana</button>
      </div>

      {/* Grid semana */}
      <div style={{display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:8}}>
        {diasSemana.map((dia, i)=>{
          const its = itemsDia(dia)
          return (
            <div key={i} style={{
              background: esHoy(dia) ? '#ED6E2E0d' : SURF,
              border: esHoy(dia) ? `1px solid ${GOLD}55` : `1px solid ${BORDER}`,
              borderRadius:10,
              padding:'10px 8px',
              minHeight:160,
            }}>
              <div style={{textAlign:'center', marginBottom:10}}>
                <div style={{fontSize:'0.68em', color:MUTED, textTransform:'uppercase', letterSpacing:'0.05em'}}>{DIAS_ES[i]}</div>
                <div style={{
                  fontSize:'1.1em', fontWeight:700,
                  color: esHoy(dia) ? GOLD : TEXT,
                  width:32, height:32, borderRadius:'50%',
                  background: esHoy(dia) ? GOLD+'22' : 'transparent',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  margin:'4px auto 0',
                }}>{dia.getDate()}</div>
              </div>
              {its.length === 0
                ? <div style={{fontSize:'0.7em', color:BORDER, textAlign:'center', marginTop:8}}>—</div>
                : its.map((item,j)=>{
                    const plats = normPlat(item.plataforma)
                    const p = PLAT[plats[0]]
                    const e = ESTADOS[item.estado]
                    return (
                      <div key={j} onClick={()=>onDetalle(item)} style={{
                        background: (p?.color||GOLD)+'22',
                        border:`1px solid ${p?.color||GOLD}44`,
                        borderLeft:`3px solid ${p?.color||GOLD}`,
                        borderRadius:6,
                        padding:'5px 7px',
                        marginBottom:5,
                        cursor:'pointer',
                      }}>
                        <div style={{fontSize:'0.72em', color:TEXT, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{plats.map(k=>PLAT[k]?.icon).join('')} {item.titulo}</div>
                        <div style={{fontSize:'0.65em', color:MUTED, marginTop:2}}>{e?.icon} {e?.label}</div>
                        {item.hora_programada && <div style={{fontSize:'0.65em', color:p?.color||GOLD}}>🕐 {item.hora_programada}</div>}
                      </div>
                    )
                  })
              }
            </div>
          )
        })}
      </div>

      {/* Total semana */}
      <div style={{marginTop:14, fontSize:'0.8em', color:MUTED, textAlign:'right'}}>
        {diasSemana.reduce((acc,d)=>acc+itemsDia(d).length,0)} publicación(es) esta semana
      </div>
    </div>
  )
}

// ─── TAB: ESTADÍSTICAS ────────────────────────────────────────────────────────
function TabDashboard() {
  const [metricas, setMetricas] = useState([])
  const [historial, setHistorial] = useState([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [formData, setFormData] = useState(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)
  const [platFiltro, setPlatFiltro] = useState('todas')

  function showMsg(t, ok=true) { setMsg({t,ok}); setTimeout(()=>setMsg(null),3000) }

  async function cargar() {
    setLoading(true)
    const { data } = await supabase.from('social_metricas').select('*').order('fecha',{ascending:false}).limit(200)
    setMetricas(data||[])
    // Also load monthly stats (legacy)
    const { data:d2 } = await supabase.from('social_estadisticas').select('*').order('anio',{ascending:false}).order('mes',{ascending:false})
    setHistorial(d2||[])
    setLoading(false)
  }
  useEffect(()=>{ cargar() },[])

  // Últimas métricas por plataforma
  const ultimasPorPlat = useMemo(()=>{
    const map = {}
    for (const p of ['tiktok','instagram','facebook','youtube']) {
      const recs = metricas.filter(m=>m.plataforma===p)
      map[p] = recs[0] || null
    }
    return map
  },[metricas])

  // Métricas previas (para comparar delta)
  const previasPorPlat = useMemo(()=>{
    const map = {}
    for (const p of ['tiktok','instagram','facebook','youtube']) {
      const recs = metricas.filter(m=>m.plataforma===p)
      map[p] = recs[1] || null
    }
    return map
  },[metricas])

  // Totales
  const totalSeg = Object.values(ultimasPorPlat).reduce((s,m)=>s+(m?.seguidores||0),0)
  const totalViews = Object.values(ultimasPorPlat).reduce((s,m)=>s+(m?.views||0),0)
  const totalLikes = Object.values(ultimasPorPlat).reduce((s,m)=>s+(m?.likes||0),0)
  const totalComents = Object.values(ultimasPorPlat).reduce((s,m)=>s+(m?.comentarios||0),0)

  function delta(curr, prev) {
    if (!curr || !prev || prev === 0) return null
    return ((curr - prev) / prev * 100).toFixed(1)
  }
  function deltaTag(val) {
    if (val === null) return null
    const n = parseFloat(val)
    const color = n >= 0 ? '#22c55e' : '#ef4444'
    const arrow = n >= 0 ? '▲' : '▼'
    return <span style={{fontSize:'0.72em', fontWeight:600, color, marginLeft:6}}>{arrow} {Math.abs(n)}%</span>
  }

  function fmtNum(n) {
    if (!n && n!==0) return '—'
    if (n >= 1000000) return (n/1000000).toFixed(1)+'M'
    if (n >= 1000) return (n/1000).toFixed(1)+'K'
    return n.toLocaleString()
  }

  // Form
  const EMPTY_FORM = {
    mes: new Date().getMonth() + 1, anio: new Date().getFullYear(),
    plataforma: 'tiktok',
    // Métricas automáticas (plataforma)
    seguidores: 0, views: 0, likes: 0, comentarios: 0, compartidos: 0,
    // Métricas manuales (editoriales)
    nuevos_seguidores: 0, engagement_rate: 0, mejor_post: '', notas: ''
  }

  function abrirForm(data) {
    if (data) {
      const d = new Date((data.fecha || new Date().toISOString().slice(0,10)) + 'T12:00:00')
      setFormData({ ...data, mes: d.getMonth() + 1, anio: d.getFullYear() })
    } else {
      setFormData({ ...EMPTY_FORM })
    }
    setFormOpen(true)
  }

  // Auto-calcula engagement cuando cambian métricas automáticas
  function handleAutoMetrica(key, val) {
    const updated = { ...formData, [key]: parseInt(val) || 0 }
    const seg = updated.seguidores || 0
    if (seg > 0) {
      updated.engagement_rate = parseFloat(
        ((updated.likes + updated.comentarios + updated.compartidos) / seg * 100).toFixed(2)
      )
    }
    setFormData(updated)
  }

  async function guardarForm() {
    if (!formData.mes || !formData.anio || !formData.plataforma) return showMsg('Mes, año y plataforma requeridos.', false)
    setSaving(true)
    const payload = { ...formData }
    payload.fecha = `${formData.anio}-${String(formData.mes).padStart(2,'0')}-01`
    delete payload.mes; delete payload.anio
    delete payload.id; delete payload.creado_en
    if (formData.id) {
      await supabase.from('social_metricas').update(payload).eq('id', formData.id)
    } else {
      await supabase.from('social_metricas').upsert(payload, { onConflict: 'fecha,plataforma' })
    }
    setSaving(false); setFormOpen(false); showMsg('Métricas guardadas.'); cargar()
  }
  async function eliminarMetrica(id) {
    if (!confirm('¿Eliminar registro?')) return
    await supabase.from('social_metricas').delete().eq('id',id); cargar()
  }

  // Historial filtrado
  const histFiltrado = platFiltro==='todas' ? metricas : metricas.filter(m=>m.plataforma===platFiltro)

  // Mini bar chart (últimos 7 registros por plataforma)
  function MiniChart({ plat, campo }) {
    const datos = metricas.filter(m=>m.plataforma===plat).slice(0,7).reverse()
    if (datos.length < 2) return <span style={{fontSize:'0.7em',color:MUTED}}>Sin datos</span>
    const vals = datos.map(d=>d[campo]||0)
    const max = Math.max(...vals, 1)
    return (
      <div style={{display:'flex', gap:2, alignItems:'flex-end', height:32}}>
        {vals.map((v,i)=>(
          <div key={i} style={{
            width:8, borderRadius:2, background: i===vals.length-1 ? PLAT[plat].color : PLAT[plat].color+'66',
            height: `${Math.max(4, (v/max)*100)}%`, transition:'height 0.3s'
          }}/>
        ))}
      </div>
    )
  }

  if (formOpen) return (
    <div>
      <button style={{...S.btnSm(), marginBottom:16}} onClick={()=>setFormOpen(false)}>← Volver</button>
      <h2 style={{color:TEXT, fontSize:'1.05em', fontWeight:700, marginBottom:18}}>
        📊 {formData.id ? 'Editar métricas' : 'Registrar métricas del mes'}
      </h2>

      {/* Período + plataforma */}
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:20}}>
        <div>
          <label style={{fontSize:'0.72em', color:MUTED, display:'block', marginBottom:4}}>MES *</label>
          <select style={S.input} value={formData.mes} onChange={e=>setFormData({...formData, mes:parseInt(e.target.value)})}>
            {MESES.map((m,i)=><option key={i} value={i+1}>{m}</option>)}
          </select>
        </div>
        <div>
          <label style={{fontSize:'0.72em', color:MUTED, display:'block', marginBottom:4}}>AÑO *</label>
          <select style={S.input} value={formData.anio} onChange={e=>setFormData({...formData, anio:parseInt(e.target.value)})}>
            {[2024,2025,2026,2027].map(y=><option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <label style={{fontSize:'0.72em', color:MUTED, display:'block', marginBottom:4}}>PLATAFORMA *</label>
          <Sel value={formData.plataforma} onChange={v=>setFormData({...formData,plataforma:v})}
            options={Object.entries(PLAT).map(([k,p])=>[k,`${p.icon} ${p.label}`])}/>
        </div>
      </div>

      {/* Métricas automáticas */}
      <div style={{background:'rgba(99,179,237,0.07)', border:'1px solid rgba(99,179,237,0.2)', borderRadius:12, padding:'14px 16px', marginBottom:16}}>
        <div style={{fontSize:'0.72em', fontWeight:700, color:'#63b3ed', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:12}}>
          Métricas de la plataforma · automáticas
        </div>
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12}}>
          <div>
            <label style={{fontSize:'0.72em', color:MUTED, display:'block', marginBottom:4}}>SEGUIDORES TOTALES</label>
            <input type="number" style={S.input} value={formData.seguidores} onChange={e=>handleAutoMetrica('seguidores', e.target.value)}/>
          </div>
          {[['views','VIEWS / ALCANCE'],['likes','LIKES'],['comentarios','COMENTARIOS'],['compartidos','COMPARTIDOS']].map(([k,l])=>(
            <div key={k}>
              <label style={{fontSize:'0.72em', color:MUTED, display:'block', marginBottom:4}}>{l}</label>
              <input type="number" style={S.input} value={formData[k]} onChange={e=>handleAutoMetrica(k, e.target.value)}/>
            </div>
          ))}
        </div>
      </div>

      {/* Métricas manuales */}
      <div style={{background:'rgba(200,168,75,0.07)', border:'1px solid rgba(200,168,75,0.2)', borderRadius:12, padding:'14px 16px', marginBottom:16}}>
        <div style={{fontSize:'0.72em', fontWeight:700, color:GOLD, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:12}}>
          Métricas editoriales · manuales
        </div>
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12}}>
          <div>
            <label style={{fontSize:'0.72em', color:MUTED, display:'block', marginBottom:4}}>NUEVOS SEGUIDORES</label>
            <input type="number" style={S.input} value={formData.nuevos_seguidores} onChange={e=>setFormData({...formData,nuevos_seguidores:parseInt(e.target.value)||0})}/>
          </div>
          <div>
            <label style={{fontSize:'0.72em', color:MUTED, display:'block', marginBottom:4}}>ENGAGEMENT RATE % <span style={{color:'rgba(0,0,0,0.3)', fontWeight:400}}>(auto)</span></label>
            <input type="number" step="0.01" style={S.input} value={formData.engagement_rate} onChange={e=>setFormData({...formData,engagement_rate:parseFloat(e.target.value)||0})}/>
          </div>
          <div style={{gridColumn:'1/-1'}}>
            <label style={{fontSize:'0.72em', color:MUTED, display:'block', marginBottom:4}}>MEJOR POST DEL MES</label>
            <input style={S.input} value={formData.mejor_post} onChange={e=>setFormData({...formData,mejor_post:e.target.value})} placeholder="Link o descripción"/>
          </div>
          <div style={{gridColumn:'1/-1'}}>
            <label style={{fontSize:'0.72em', color:MUTED, display:'block', marginBottom:4}}>NOTAS</label>
            <textarea style={{...S.textarea, minHeight:56}} value={formData.notas} onChange={e=>setFormData({...formData,notas:e.target.value})}/>
          </div>
        </div>
      </div>

      <Msg msg={msg}/>
      <div style={{display:'flex', gap:10}}>
        <button style={S.btn()} onClick={guardarForm} disabled={saving}>{saving?'Guardando...':'💾 Guardar métricas'}</button>
        <button style={S.btnSm()} onClick={()=>setFormOpen(false)}>Cancelar</button>
      </div>
    </div>
  )

  return (
    <div>
      {/* Header con total */}
      <div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:24}}>
        {[
          ['👥','Seguidores totales', totalSeg, GOLD],
          ['👁️','Views totales', totalViews, '#63b3ed'],
          ['❤️','Likes totales', totalLikes, '#f43f5e'],
          ['💬','Comentarios totales', totalComents, '#a78bfa'],
        ].map(([icon,label,val,color])=>(
          <div key={label} style={{...S.card, textAlign:'center', borderTop:`3px solid ${color}`, padding:'18px 14px'}}>
            <div style={{fontSize:'1.5rem', marginBottom:4}}>{icon}</div>
            <div style={{fontSize:'1.4rem', fontWeight:700, color}}>{fmtNum(val)}</div>
            <div style={{fontSize:'0.7em', color:MUTED, marginTop:4, textTransform:'uppercase', letterSpacing:'0.06em'}}>{label}</div>
          </div>
        ))}
      </div>

      {/* Cards por plataforma */}
      <div style={{display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:14, marginBottom:24}}>
        {Object.entries(PLAT).map(([key, p])=>{
          const m = ultimasPorPlat[key]
          const prev = previasPorPlat[key]
          return (
            <div key={key} style={{...S.card, padding:'20px', borderLeft:`4px solid ${p.color}`}}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14}}>
                <div style={{display:'flex', alignItems:'center', gap:8}}>
                  <span style={{fontSize:'1.3rem'}}>{p.icon}</span>
                  <span style={{fontWeight:700, color:TEXT, fontSize:'1rem'}}>{p.label}</span>
                </div>
                {m && <span style={{fontSize:'0.68em', color:MUTED}}>{m.fecha ? `${MESES[parseInt(m.fecha.slice(5,7))-1]} ${m.fecha.slice(0,4)}` : ''}</span>}
              </div>
              {!m ? (
                <div style={{color:MUTED, fontSize:'0.84em', padding:'12px 0'}}>Sin datos aún. Registrá las métricas del mes.</div>
              ) : (
                <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10}}>
                  <div>
                    <div style={{fontSize:'0.65em', color:MUTED, textTransform:'uppercase', letterSpacing:'0.05em'}}>Seguidores</div>
                    <div style={{fontSize:'1.15rem', fontWeight:700, color:p.color}}>
                      {fmtNum(m.seguidores)}{deltaTag(delta(m.seguidores, prev?.seguidores))}
                    </div>
                  </div>
                  <div>
                    <div style={{fontSize:'0.65em', color:MUTED, textTransform:'uppercase', letterSpacing:'0.05em'}}>{key==='instagram' ? 'Interacciones' : 'Views'}</div>
                    <div style={{fontSize:'1.15rem', fontWeight:700, color:TEXT}}>
                      {key==='instagram' ? fmtNum((m.likes||0)+(m.comentarios||0)) : fmtNum(m.views)}{deltaTag(delta(m.views, prev?.views))}
                    </div>
                  </div>
                  <div>
                    <div style={{fontSize:'0.65em', color:MUTED, textTransform:'uppercase', letterSpacing:'0.05em'}}>Engagement</div>
                    <div style={{fontSize:'1.15rem', fontWeight:700, color:TEXT}}>{m.engagement_rate||0}%</div>
                  </div>
                  <div>
                    <div style={{fontSize:'0.65em', color:MUTED, textTransform:'uppercase', letterSpacing:'0.05em'}}>Likes</div>
                    <div style={{fontWeight:600, color:TEXT}}>{fmtNum(m.likes)}</div>
                  </div>
                  <div>
                    <div style={{fontSize:'0.65em', color:MUTED, textTransform:'uppercase', letterSpacing:'0.05em'}}>Comentarios</div>
                    <div style={{fontWeight:600, color:TEXT}}>{fmtNum(m.comentarios)}</div>
                  </div>
                  <div>
                    <div style={{fontSize:'0.65em', color:MUTED, textTransform:'uppercase', letterSpacing:'0.05em'}}>Tendencia</div>
                    <MiniChart plat={key} campo={key==='instagram' ? 'likes' : 'views'}/>
                  </div>
                </div>
              )}
              {m?.mejor_post && (
                <div style={{marginTop:10, padding:'8px 10px', background:SURF2, borderRadius:8, fontSize:'0.78em', color:MUTED}}>
                  🏆 {m.mejor_post}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Botón registrar + filtro */}
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, flexWrap:'wrap', gap:10}}>
        <FiltroPlat value={platFiltro} onChange={setPlatFiltro}/>
        <button style={S.btn()} onClick={()=>abrirForm(null)}>+ Registrar métricas</button>
      </div>

      {/* Historial de registros */}
      {loading ? <div style={{textAlign:'center', padding:40, color:MUTED}}>Cargando...</div>
      : histFiltrado.length===0 ? <div style={{...S.card, textAlign:'center', padding:40, color:MUTED}}>No hay registros de métricas aún.</div>
      : (
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%', borderCollapse:'collapse'}}>
            <thead><tr>{['Período','Plataforma','Seguidores','Views','Likes','Comentarios','Compartidos','Eng.%',''].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
            <tbody>
              {histFiltrado.slice(0,50).map(r=>(
                <tr key={r.id}>
                  <td style={{...S.td, fontWeight:600}}>{r.fecha ? `${MESES[parseInt(r.fecha.slice(5,7))-1]} ${r.fecha.slice(0,4)}` : '—'}</td>
                  <td style={S.td}><PlatBadge plat={r.plataforma}/></td>
                  <td style={{...S.td, textAlign:'right', fontWeight:600, color:PLAT[r.plataforma]?.color||TEXT}}>{(r.seguidores||0).toLocaleString()}</td>
                  <td style={{...S.td, textAlign:'right'}}>{(r.views||0).toLocaleString()}</td>
                  <td style={{...S.td, textAlign:'right'}}>{(r.likes||0).toLocaleString()}</td>
                  <td style={{...S.td, textAlign:'right'}}>{(r.comentarios||0).toLocaleString()}</td>
                  <td style={{...S.td, textAlign:'right'}}>{(r.compartidos||0).toLocaleString()}</td>
                  <td style={{...S.td, textAlign:'right', fontWeight:600}}>{r.engagement_rate||0}%</td>
                  <td style={S.td}>
                    <div style={{display:'flex', gap:6}}>
                      <button style={S.btnSm()} onClick={()=>abrirForm({...r})}>✏️</button>
                      <button style={{...S.btnSm(), color:'#fc8181', borderColor:'#fc818144'}} onClick={()=>eliminarMetrica(r.id)}>✕</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Msg msg={msg}/>
    </div>
  )
}

// Legacy tab wrapper
function TabEstadisticas() { return <TabDashboard/> }

// ─── PÁGINA PRINCIPAL ─────────────────────────────────────────────────────────
const TABS = [
  { id:'dashboard',           icon:'📊', label:'Dashboard',             estadoFiltro:null },
  { id:'listo',               icon:'✅', label:'Listo para publicar',   estadoFiltro:'listo' },
  { id:'por_grabar',          icon:'🎬', label:'Por grabar',            estadoFiltro:'por_grabar' },
  { id:'grabado_no_editado',  icon:'🎞️', label:'Grabado pero no editado', estadoFiltro:'grabado_no_editado' },
  { id:'en_revision',         icon:'👀', label:'En revisión',           estadoFiltro:'en_revision' },
  { id:'ideas',               icon:'💡', label:'Ideas',                 estadoFiltro:'idea' },
  { id:'calendario',          icon:'📅', label:'Calendario',            estadoFiltro:null },
]

export default function SocialPage() {
  const [tab, setTab]           = useState('dashboard')
  const [items, setItems]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [vista, setVista]       = useState(null) // null | 'form' | 'detalle'
  const [selItem, setSelItem]   = useState(null)
  const [calVista, setCalVista] = useState('semana') // 'mes' | 'semana'

  async function cargar() {
    setLoading(true)
    const { data } = await supabase.from('social_contenido')
      .select('*').order('creado_en', { ascending:false })
    setItems(data || [])
    setLoading(false)
  }

  useEffect(()=>{ cargar() }, [])

  function abrirNuevo() { setSelItem(null); setVista('form') }
  function abrirDetalle(item) { if (!item) return; setSelItem(item); setVista('detalle') }
  function cerrar() { setVista(null); setSelItem(null) }
  function onSaved() { cerrar(); cargar() }
  function onRefresh() { cargar() }

  const tabActual = TABS.find(t=>t.id===tab)

  return (
    <div style={{ fontFamily:'DM Sans,sans-serif', color:TEXT, padding:'28px 32px', minHeight:'100vh', background:BG, margin:'-32px -36px', minWidth:'calc(100% + 72px)' }}>
      <div style={{ marginBottom:24 }}>
        <span style={{ fontSize:'0.68rem', fontWeight:700, letterSpacing:'0.10em', textTransform:'uppercase', color:GOLD, display:'block', marginBottom:4 }}>
          Gestión de contenido · Depósito Jiménez
        </span>
        <h1 style={{ fontSize:'1.7rem', fontWeight:700, color:TEXT, letterSpacing:'-0.02em', lineHeight:1.2, margin:0 }}>
          📱 Redes Sociales
        </h1>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:0, borderBottom:`1px solid ${BORDER}`, marginBottom:24, overflowX:'auto' }}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>{ setTab(t.id); cerrar() }} style={{
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

      {/* Contenido */}
      {vista === 'form' && (
        <FormContenido
          item={selItem}
          onClose={cerrar}
          onSaved={onSaved}
        />
      )}

      {vista === 'detalle' && selItem && (
        <DetalleContenido
          item={selItem}
          onClose={cerrar}
          onEdit={()=>setVista('form')}
          onRefresh={()=>{ cargar(); cerrar() }}
        />
      )}

      {!vista && tab === 'dashboard' && <TabDashboard/>}

      {!vista && tab !== 'calendario' && tab !== 'dashboard' && (
        <TabLista
          items={items}
          loading={loading}
          onNuevo={abrirNuevo}
          onDetalle={abrirDetalle}
          estadoFiltro={tabActual?.estadoFiltro || 'listo'}
        />
      )}

      {!vista && tab === 'calendario' && (
        <div>
          {/* Toggle vista cal */}
          <div style={{display:'flex', gap:8, marginBottom:20}}>
            {[['semana','📅 Semana'],['mes','🗓️ Mes']].map(([v,l])=>(
              <button key={v} onClick={()=>setCalVista(v)} style={{
                padding:'7px 18px', borderRadius:20, border:`1px solid ${BORDER}`,
                background: calVista===v ? GOLD : SURF2,
                color: calVista===v ? '#fff' : MUTED,
                cursor:'pointer', fontSize:'0.82em', fontWeight: calVista===v?700:400,
                fontFamily:'DM Sans,sans-serif'
              }}>{l}</button>
            ))}
            <button style={{...S.btn(), marginLeft:'auto'}} onClick={abrirNuevo}>+ Agregar contenido</button>
          </div>
          {calVista === 'semana'
            ? <CalendarioSemana items={items} onDetalle={abrirDetalle}/>
            : <CalendarioMes    items={items} onDetalle={abrirDetalle}/>
          }
        </div>
      )}

    </div>
  )
}
