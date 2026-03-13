'use client'
import React, { useState, useEffect } from 'react'

const BG     = '#0f1115'
const SURF   = '#1c1f26'
const SURF2  = '#22262f'
const SURF3  = '#2a2f3a'
const BORDER = 'rgba(255,255,255,0.08)'
const TEXT   = 'rgba(253,244,244,0.88)'
const MUTED  = 'rgba(253,244,244,0.40)'
const GOLD   = '#ED6E2E'

const ROL_COLOR = {
  admin:'#ED6E2E', bodega:'#63b3ed', ventas:'#68d391',
  finanzas:'#c8a84b', logistica:'#b794f4'
}
const ROLES = ['admin','bodega','ventas','finanzas','logistica']

// Todos los módulos disponibles con etiqueta y emoji
const MODULOS = [
  { key:'dashboard',    label:'Dashboard',       emoji:'🏠' },
  { key:'inventario',   label:'Inventario',      emoji:'🪐' },
  { key:'trazabilidad', label:'Trazabilidad',    emoji:'🔬' },
  { key:'kronos',       label:'Kronos',          emoji:'⚡' },
  { key:'contenedores', label:'Contenedores',    emoji:'🚢' },
  { key:'mercado',      label:'Mercado',         emoji:'💱' },
  { key:'ponderacion',  label:'Ponderación',     emoji:'⚖️' },
  { key:'comercial',    label:'Comercial',       emoji:'📈' },
  { key:'reportes',     label:'Reportes',        emoji:'📊' },
  { key:'finanzas',     label:'Finanzas',        emoji:'💰' },
  { key:'cif',          label:'CIF',             emoji:'📦' },
  { key:'rotacion',     label:'Rotación',        emoji:'🔄' },
  { key:'tareas',       label:'Tareas',          emoji:'✅' },
  { key:'social',       label:'Redes Sociales',  emoji:'📱' },
  { key:'admin',        label:'Admin',           emoji:'🔐' },
]

// Permisos por defecto de cada rol
const PERMISOS_ROL = {
  admin:     MODULOS.map(m => m.key),
  bodega:    ['dashboard','inventario','trazabilidad','rotacion','kronos','contenedores'],
  ventas:    ['dashboard','trazabilidad','comercial','reportes'],
  finanzas:  ['dashboard','contenedores','mercado','ponderacion','finanzas'],
  logistica: ['dashboard','contenedores','cif','mercado','reportes'],
}

const S = {
  input: {
    background:SURF2, border:`1px solid ${BORDER}`, borderRadius:8,
    padding:'8px 12px', color:TEXT, fontSize:'0.85em',
    fontFamily:'DM Sans,sans-serif', outline:'none',
    width:'100%', boxSizing:'border-box'
  },
  btn: (c=GOLD) => ({
    background:c, color:'#fff', border:'none', borderRadius:8,
    padding:'8px 16px', cursor:'pointer', fontSize:'0.82em',
    fontWeight:600, fontFamily:'DM Sans,sans-serif'
  }),
  btnSm: (c=SURF2, tc=TEXT, bc=BORDER) => ({
    background:c, color:tc, border:`1px solid ${bc}`,
    borderRadius:6, padding:'5px 11px', cursor:'pointer',
    fontSize:'0.77em', fontFamily:'DM Sans,sans-serif'
  }),
  th: {
    textAlign:'left', padding:'9px 12px', background:SURF2,
    color:MUTED, fontSize:'0.68em', textTransform:'uppercase',
    letterSpacing:'0.06em', borderBottom:`1px solid ${BORDER}`,
    whiteSpace:'nowrap'
  },
  td: {
    padding:'10px 12px', borderBottom:`1px solid ${BORDER}`,
    color:TEXT, fontSize:'0.84em', verticalAlign:'middle'
  },
}

function Msg({ msg }) {
  if (!msg) return null
  return (
    <div style={{
      background:msg.ok?'#68d39122':'#fc818122',
      border:`1px solid ${msg.ok?'#68d391':'#fc8181'}55`,
      borderRadius:8, padding:'9px 14px', marginBottom:14,
      color:msg.ok?'#68d391':'#fc8181', fontSize:'0.84em'
    }}>
      {msg.t}
    </div>
  )
}

// Panel de permisos por módulo para un usuario
function PanelPermisos({ usuario, onGuardar, onCerrar }) {
  const rolBase = usuario.rol || 'bodega'
  const permisosExtra = usuario.permisos_extra || {}

  const [checks, setChecks] = useState(() => {
    const base = PERMISOS_ROL[rolBase] || []
    const result = {}
    MODULOS.forEach(m => {
      if (permisosExtra[m.key] !== undefined) {
        result[m.key] = permisosExtra[m.key]
      } else {
        result[m.key] = base.includes(m.key)
      }
    })
    return result
  })

  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)

  function showMsg(t, ok=true) { setMsg({t,ok}); setTimeout(()=>setMsg(null),3500) }

  function aplicarRol(rol) {
    const base = PERMISOS_ROL[rol] || []
    const next = {}
    MODULOS.forEach(m => { next[m.key] = base.includes(m.key) })
    setChecks(next)
  }

  const rolBaseModulos = PERMISOS_ROL[rolBase] || []
  const hayOverride = MODULOS.some(m => {
    const enRol = rolBaseModulos.includes(m.key)
    return checks[m.key] !== enRol
  })

  async function guardar() {
    setSaving(true)
    const nuevosExtra = {}
    MODULOS.forEach(m => {
      const enRol = rolBaseModulos.includes(m.key)
      if (checks[m.key] !== enRol) {
        nuevosExtra[m.key] = checks[m.key]
      }
    })
    const res = await fetch('/api/admin/usuarios', { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id: usuario.id, permisos_extra: Object.keys(nuevosExtra).length ? nuevosExtra : null }) })
    const result = await res.json()
    if (!res.ok || result.error) {
      showMsg('Error al guardar: ' + (result.error||'desconocido'), false)
    } else {
      showMsg('✅ Permisos guardados.')
      setTimeout(() => { onGuardar() }, 1000)
    }
    setSaving(false)
  }

  const totalActivos = Object.values(checks).filter(Boolean).length

  return (
    <div style={{
      background:SURF3, border:`1px solid ${BORDER}`,
      borderRadius:10, padding:'18px 20px', marginTop:8
    }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
        <div>
          <span style={{ fontWeight:700, color:TEXT, fontSize:'0.88em' }}>
            🔐 Módulos de {usuario.nombre || usuario.email}
          </span>
          {hayOverride && (
            <span style={{
              marginLeft:10, fontSize:'0.7em', background:'#ED6E2E18',
              color:GOLD, border:`1px solid ${GOLD}44`, borderRadius:20, padding:'2px 8px'
            }}>
              ✏️ Personalizado
            </span>
          )}
        </div>
        <button style={S.btnSm()} onClick={onCerrar}>✕ Cerrar</button>
      </div>

      <Msg msg={msg} />

      <div style={{ marginBottom:14 }}>
        <span style={{ fontSize:'0.72em', color:MUTED, textTransform:'uppercase', letterSpacing:'0.06em', marginRight:8 }}>
          Preset:
        </span>
        {ROLES.map(r => (
          <button key={r} onClick={() => aplicarRol(r)}
            style={{
              ...S.btnSm(r===rolBase?ROL_COLOR[r]+'33':SURF2, r===rolBase?ROL_COLOR[r]:MUTED, r===rolBase?ROL_COLOR[r]+'66':BORDER),
              marginRight:6, fontSize:'0.75em'
            }}>
            {r}
          </button>
        ))}
        <button onClick={() => { const all={}; MODULOS.forEach(m=>{all[m.key]=true}); setChecks(all) }}
          style={{ ...S.btnSm(), marginRight:6, fontSize:'0.75em' }}>☑ Todos</button>
        <button onClick={() => { const none={}; MODULOS.forEach(m=>{none[m.key]=false}); setChecks(none) }}
          style={{ ...S.btnSm(), fontSize:'0.75em' }}>☐ Ninguno</button>
      </div>

      <div style={{
        display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(160px, 1fr))',
        gap:8, marginBottom:16
      }}>
        {MODULOS.map(m => {
          const activo = checks[m.key]
          const enRol  = rolBaseModulos.includes(m.key)
          const override = activo !== enRol
          return (
            <label key={m.key} style={{
              display:'flex', alignItems:'center', gap:8, cursor:'pointer',
              background: activo ? (override?'#ED6E2E18':'#68d39112') : SURF2,
              border:`1px solid ${activo ? (override?GOLD+'55':'#68d39133') : BORDER}`,
              borderRadius:8, padding:'8px 12px',
              transition:'all 0.15s'
            }}>
              <input
                type="checkbox"
                checked={activo}
                onChange={() => setChecks(p => ({ ...p, [m.key]: !p[m.key] }))}
                style={{ accentColor:GOLD, width:14, height:14, cursor:'pointer' }}
              />
              <span style={{ fontSize:'0.82em', color: activo ? TEXT : MUTED }}>
                {m.emoji} {m.label}
              </span>
              {override && (
                <span style={{ fontSize:'0.6em', color:GOLD, marginLeft:'auto' }}>✏️</span>
              )}
            </label>
          )
        })}
      </div>

      <div style={{ display:'flex', alignItems:'center', gap:12 }}>
        <button
          style={S.btn(saving ? '#555' : GOLD)}
          onClick={guardar}
          disabled={saving}
        >
          {saving ? 'Guardando...' : '💾 Guardar permisos'}
        </button>
        <span style={{ fontSize:'0.78em', color:MUTED }}>
          {totalActivos} de {MODULOS.length} módulos activos
          {hayOverride ? ' · Personalizado' : ` · Rol "${rolBase}" estándar`}
        </span>
      </div>
    </div>
  )
}

export default function AdminPage() {
  const [usuarios, setUsuarios]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [form, setForm]           = useState({ email:'', password:'', nombre:'', rol:'bodega' })
  const [saving, setSaving]       = useState(false)
  const [msg, setMsg]             = useState(null)
  const [expandPermisos, setExpandPermisos] = useState({})

  function showMsg(t, ok=true) { setMsg({t,ok}); setTimeout(()=>setMsg(null),4000) }

  async function cargar() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/usuarios')
      const data = await res.json()
      setUsuarios(Array.isArray(data) ? data : [])
    } catch(e) { setUsuarios([]) }
    setLoading(false)
  }

  useEffect(() => { cargar() }, [])

  async function crearUsuario() {
    if (!form.email.trim() || !form.password.trim() || !form.nombre.trim())
      return showMsg('Completá todos los campos.', false)
    setSaving(true)
    try {
      const res = await fetch('/api/admin/crear-usuario', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify(form)
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al crear usuario')
      showMsg(`Usuario ${form.email} creado correctamente.`)
      setForm({ email:'', password:'', nombre:'', rol:'bodega' })
      cargar()
    } catch(e) {
      showMsg(e.message, false)
    }
    setSaving(false)
  }

  async function cambiarRol(uid, nuevoRol) {
    await fetch('/api/admin/usuarios', { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id: uid, rol: nuevoRol }) })
    showMsg('Rol actualizado.')
    cargar()
  }

  async function toggleActivo(u) {
    await fetch('/api/admin/usuarios', { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id: u.id, activo: !u.activo }) })
    showMsg(u.activo ? 'Usuario desactivado.' : 'Usuario activado.')
    cargar()
  }

  function toggleExpandPermisos(id) {
    setExpandPermisos(p => ({ ...p, [id]: !p[id] }))
  }

  return (
    <div style={{
      fontFamily:'DM Sans,sans-serif', color:TEXT,
      padding:'28px 32px', minHeight:'100vh', background:BG,
      margin:'-32px -36px', minWidth:'calc(100% + 72px)'
    }}>
      <div style={{ marginBottom:28 }}>
        <span style={{ fontSize:'0.68rem', fontWeight:700, letterSpacing:'0.10em', textTransform:'uppercase', color:GOLD, display:'block', marginBottom:4 }}>
          Admin · SOL
        </span>
        <h1 style={{ fontSize:'1.7rem', fontWeight:700, color:TEXT, letterSpacing:'-0.02em', margin:0 }}>
          👥 Gestión de Usuarios
        </h1>
        <p style={{ fontSize:'0.82rem', color:MUTED, marginTop:4 }}>Administración de accesos · Depósito Jiménez</p>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:28 }}>
        {[
          ['Total usuarios',  usuarios.length,                                            '#63b3ed'],
          ['Activos',         usuarios.filter(u=>u.activo!==false).length,                '#68d391'],
          ['Inactivos',       usuarios.filter(u=>u.activo===false).length,                '#fc8181'],
          ['Personalizados',  usuarios.filter(u=>u.permisos_extra&&Object.keys(u.permisos_extra||{}).length>0).length, GOLD],
        ].map(([l,v,c])=>(
          <div key={l} style={{ background:SURF, border:`1px solid ${c}33`, borderTop:`3px solid ${c}`, borderRadius:10, padding:'14px 16px' }}>
            <div style={{ fontSize:'0.7em', color:MUTED, textTransform:'uppercase', letterSpacing:'0.06em' }}>{l}</div>
            <div style={{ fontSize:'1.8em', fontWeight:700, color:c, marginTop:4 }}>{v}</div>
          </div>
        ))}
      </div>

      <div style={{ background:SURF, border:`1px solid ${BORDER}`, borderRadius:12, padding:'20px 22px', marginBottom:28 }}>
        <h2 style={{ color:TEXT, fontSize:'0.95em', fontWeight:700, marginBottom:16, marginTop:0 }}>➕ Crear nuevo usuario</h2>
        <Msg msg={msg}/>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:12, marginBottom:14 }}>
          <div>
            <label style={{ fontSize:'0.72em', color:MUTED, display:'block', marginBottom:4 }}>NOMBRE</label>
            <input style={S.input} value={form.nombre} onChange={e=>setForm({...form,nombre:e.target.value})} placeholder="Luis Jiménez"/>
          </div>
          <div>
            <label style={{ fontSize:'0.72em', color:MUTED, display:'block', marginBottom:4 }}>EMAIL</label>
            <input style={S.input} value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="usuario@rojimo.com"/>
          </div>
          <div>
            <label style={{ fontSize:'0.72em', color:MUTED, display:'block', marginBottom:4 }}>CONTRASEÑA INICIAL</label>
            <input type="password" style={S.input} value={form.password} onChange={e=>setForm({...form,password:e.target.value})} placeholder="••••••••"/>
          </div>
          <div>
            <label style={{ fontSize:'0.72em', color:MUTED, display:'block', marginBottom:4 }}>ROL BASE</label>
            <select value={form.rol} onChange={e=>setForm({...form,rol:e.target.value})} style={{ ...S.input, cursor:'pointer' }}>
              {ROLES.map(r=><option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </div>
        <button style={S.btn()} onClick={crearUsuario} disabled={saving}>
          {saving ? 'Creando...' : '💾 Crear usuario'}
        </button>
      </div>

      <div style={{ background:SURF, border:`1px solid ${BORDER}`, borderRadius:12, padding:0, overflow:'hidden' }}>
        <div style={{ padding:'12px 18px', borderBottom:`1px solid ${BORDER}`, fontWeight:600, color:TEXT, fontSize:'0.88em' }}>
          👥 Usuarios registrados
        </div>
        {loading
          ? <div style={{ textAlign:'center', padding:40, color:MUTED }}>Cargando...</div>
          : (
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead><tr>
                {['Nombre','Email','Rol','Módulos','Estado','Creado','Acciones'].map(h=>(
                  <th key={h} style={S.th}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {usuarios.map(u => {
                  const tieneOverride = u.permisos_extra && Object.keys(u.permisos_extra||{}).length > 0
                  const rolBase = u.rol || 'bodega'
                  const modulosEfectivos = MODULOS.filter(m => {
                    if (u.permisos_extra && u.permisos_extra[m.key] !== undefined)
                      return u.permisos_extra[m.key]
                    return (PERMISOS_ROL[rolBase]||[]).includes(m.key)
                  })
                  const expPerm = expandPermisos[u.id]
                  return (
                    <React.Fragment key={u.id}>
                      <tr style={{ background: expPerm ? SURF2 : undefined }}>
                        <td style={{ ...S.td, fontWeight:500 }}>{u.nombre||'—'}</td>
                        <td style={{ ...S.td, color:MUTED }}>{u.email}</td>
                        <td style={S.td}>
                          <select
                            value={u.rol}
                            onChange={e=>cambiarRol(u.id,e.target.value)}
                            style={{
                              background:(ROL_COLOR[u.rol]||'#666')+'22',
                              color:ROL_COLOR[u.rol]||TEXT,
                              border:`1px solid ${(ROL_COLOR[u.rol]||'#666')}44`,
                              borderRadius:20, padding:'3px 10px',
                              fontSize:'0.75em', fontWeight:600,
                              cursor:'pointer', outline:'none',
                              fontFamily:'DM Sans,sans-serif'
                            }}>
                            {ROLES.map(r=><option key={r} value={r}>{r}</option>)}
                          </select>
                        </td>
                        <td style={S.td}>
                          <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                            <span style={{ fontSize:'0.78em', color: tieneOverride?GOLD:MUTED }}>
                              {modulosEfectivos.length} módulos
                              {tieneOverride ? ' ✏️' : ''}
                            </span>
                            <button
                              onClick={()=>toggleExpandPermisos(u.id)}
                              style={{
                                ...S.btnSm(expPerm?GOLD+'22':SURF2, expPerm?GOLD:MUTED, expPerm?GOLD+'44':BORDER),
                                fontSize:'0.72em', padding:'3px 8px'
                              }}>
                              {expPerm ? '▲ Cerrar' : '⚙️ Editar'}
                            </button>
                          </div>
                        </td>
                        <td style={S.td}>
                          <span style={{
                            background:u.activo!==false?'#68d39122':'#fc818122',
                            color:u.activo!==false?'#68d391':'#fc8181',
                            border:`1px solid ${u.activo!==false?'#68d391':'#fc8181'}44`,
                            borderRadius:20, padding:'3px 10px',
                            fontSize:'0.75em', fontWeight:600
                          }}>
                            {u.activo!==false?'✅ Activo':'❌ Inactivo'}
                          </span>
                        </td>
                        <td style={{ ...S.td, color:MUTED, fontSize:'0.78em' }}>
                          {u.creado_en ? new Date(u.creado_en).toLocaleDateString('es-CR') : '—'}
                        </td>
                        <td style={S.td}>
                          <button
                            style={{
                              ...S.btnSm(u.activo!==false?'#7d1515':SURF2, u.activo!==false?'#fc8181':TEXT, u.activo!==false?'#fc818144':BORDER)
                            }}
                            onClick={()=>toggleActivo(u)}>
                            {u.activo!==false?'Desactivar':'Activar'}
                          </button>
                        </td>
                      </tr>
                      {expPerm && (
                        <tr>
                          <td colSpan={7} style={{ background:SURF2, padding:'0 16px 16px 16px', borderBottom:`1px solid ${BORDER}` }}>
                            <PanelPermisos
                              usuario={u}
                              onGuardar={() => { cargar(); setExpandPermisos(p=>({...p,[u.id]:false})) }}
                              onCerrar={() => setExpandPermisos(p=>({...p,[u.id]:false}))}
                            />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
