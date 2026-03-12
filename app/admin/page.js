'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

const BG     = '#0f1115'
const SURF   = '#1c1f26'
const SURF2  = '#22262f'
const BORDER = 'rgba(255,255,255,0.08)'
const TEXT   = 'rgba(253,244,244,0.88)'
const MUTED  = 'rgba(253,244,244,0.40)'
const GOLD   = '#ED6E2E'

const ROL_COLOR = { admin:'#ED6E2E', bodega:'#63b3ed', ventas:'#68d391', finanzas:'#c8a84b', logistica:'#b794f4' }
const ROLES = ['admin','bodega','ventas','finanzas','logistica']

const S = {
  input: { background:SURF2, border:`1px solid ${BORDER}`, borderRadius:8, padding:'8px 12px',
           color:TEXT, fontSize:'0.85em', fontFamily:'DM Sans,sans-serif', outline:'none', width:'100%', boxSizing:'border-box' },
  btn:   (c=GOLD)=>({ background:c, color:'#fff', border:'none', borderRadius:8, padding:'8px 16px',
           cursor:'pointer', fontSize:'0.82em', fontWeight:600, fontFamily:'DM Sans,sans-serif' }),
  btnSm: (c=SURF2)=>({ background:c, color:TEXT, border:`1px solid ${BORDER}`, borderRadius:6,
           padding:'5px 11px', cursor:'pointer', fontSize:'0.77em', fontFamily:'DM Sans,sans-serif' }),
  th:    { textAlign:'left', padding:'9px 12px', background:SURF2, color:MUTED, fontSize:'0.68em',
           textTransform:'uppercase', letterSpacing:'0.06em', borderBottom:`1px solid ${BORDER}`, whiteSpace:'nowrap' },
  td:    { padding:'10px 12px', borderBottom:`1px solid ${BORDER}`, color:TEXT, fontSize:'0.84em', verticalAlign:'middle' },
}

function Msg({ msg }) {
  if (!msg) return null
  return (
    <div style={{ background:msg.ok?'#68d39122':'#fc818122', border:`1px solid ${msg.ok?'#68d391':'#fc8181'}55`,
      borderRadius:8, padding:'9px 14px', marginBottom:14, color:msg.ok?'#68d391':'#fc8181', fontSize:'0.84em' }}>
      {msg.t}
    </div>
  )
}

export default function AdminPage() {
  const [usuarios, setUsuarios]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [form, setForm]           = useState({ email:'', password:'', nombre:'', rol:'bodega' })
  const [saving, setSaving]       = useState(false)
  const [msg, setMsg]             = useState(null)
  const [editando, setEditando]   = useState(null)

  function showMsg(t, ok=true) { setMsg({t,ok}); setTimeout(()=>setMsg(null),4000) }

  async function cargar() {
    setLoading(true)
    const { data } = await supabase.from('genesis_usuarios').select('*').order('creado_en', { ascending:false })
    setUsuarios(data||[])
    setLoading(false)
  }
  useEffect(()=>{ cargar() },[])

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
    await supabase.from('genesis_usuarios').update({ rol: nuevoRol }).eq('id', uid)
    showMsg('Rol actualizado.')
    cargar()
  }

  async function toggleActivo(u) {
    await supabase.from('genesis_usuarios').update({ activo: !u.activo }).eq('id', u.id)
    showMsg(u.activo ? 'Usuario desactivado.' : 'Usuario activado.')
    cargar()
  }

  return (
    <div style={{ fontFamily:'DM Sans,sans-serif', color:TEXT, padding:'28px 32px', minHeight:'100vh',
      background:BG, margin:'-32px -36px', minWidth:'calc(100% + 72px)' }}>
      <div style={{ marginBottom:28 }}>
        <span style={{ fontSize:'0.68rem', fontWeight:700, letterSpacing:'0.10em', textTransform:'uppercase', color:GOLD, display:'block', marginBottom:4 }}>
          Admin · SOL
        </span>
        <h1 style={{ fontSize:'1.7rem', fontWeight:700, color:TEXT, letterSpacing:'-0.02em', margin:0 }}>
          👥 Gestión de Usuarios
        </h1>
        <p style={{ fontSize:'0.82rem', color:MUTED, marginTop:4 }}>Administración de accesos · Depósito Jiménez</p>
      </div>

      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:28 }}>
        {[
          ['Total usuarios', usuarios.length, '#63b3ed'],
          ['Activos', usuarios.filter(u=>u.activo!==false).length, '#68d391'],
          ['Inactivos', usuarios.filter(u=>u.activo===false).length, '#fc8181'],
          ['Admins', usuarios.filter(u=>u.rol==='admin').length, GOLD],
        ].map(([l,v,c])=>(
          <div key={l} style={{ background:SURF, border:`1px solid ${c}33`, borderTop:`3px solid ${c}`, borderRadius:10, padding:'14px 16px' }}>
            <div style={{ fontSize:'0.7em', color:MUTED, textTransform:'uppercase', letterSpacing:'0.06em' }}>{l}</div>
            <div style={{ fontSize:'1.8em', fontWeight:700, color:c, marginTop:4 }}>{v}</div>
          </div>
        ))}
      </div>

      {/* Formulario nuevo usuario */}
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
            <label style={{ fontSize:'0.72em', color:MUTED, display:'block', marginBottom:4 }}>ROL</label>
            <select value={form.rol} onChange={e=>setForm({...form,rol:e.target.value})}
              style={{ ...S.input, cursor:'pointer' }}>
              {ROLES.map(r=><option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </div>
        <button style={S.btn()} onClick={crearUsuario} disabled={saving}>
          {saving ? 'Creando...' : '💾 Crear usuario'}
        </button>
      </div>

      {/* Tabla usuarios */}
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
                {['Nombre','Email','Rol','Estado','Creado','Acciones'].map(h=><th key={h} style={S.th}>{h}</th>)}
              </tr></thead>
              <tbody>
                {usuarios.map(u=>(
                  <tr key={u.id}>
                    <td style={{ ...S.td, fontWeight:500 }}>{u.nombre||'—'}</td>
                    <td style={{ ...S.td, color:MUTED }}>{u.email}</td>
                    <td style={S.td}>
                      <select value={u.rol} onChange={e=>cambiarRol(u.id,e.target.value)}
                        style={{ background:(ROL_COLOR[u.rol]||'#666')+'22', color:ROL_COLOR[u.rol]||TEXT,
                          border:`1px solid ${(ROL_COLOR[u.rol]||'#666')}44`, borderRadius:20,
                          padding:'3px 10px', fontSize:'0.75em', fontWeight:600, cursor:'pointer',
                          outline:'none', fontFamily:'DM Sans,sans-serif' }}>
                        {ROLES.map(r=><option key={r} value={r}>{r}</option>)}
                      </select>
                    </td>
                    <td style={S.td}>
                      <span style={{ background:u.activo!==false?'#68d39122':'#fc818122',
                        color:u.activo!==false?'#68d391':'#fc8181',
                        border:`1px solid ${u.activo!==false?'#68d391':'#fc8181'}44`,
                        borderRadius:20, padding:'3px 10px', fontSize:'0.75em', fontWeight:600 }}>
                        {u.activo!==false?'✅ Activo':'❌ Inactivo'}
                      </span>
                    </td>
                    <td style={{ ...S.td, color:MUTED, fontSize:'0.78em' }}>
                      {u.creado_en ? new Date(u.creado_en).toLocaleDateString('es-CR') : '—'}
                    </td>
                    <td style={S.td}>
                      <button style={{ ...S.btnSm(u.activo!==false?'#7d1515':SURF2),
                        color:u.activo!==false?'#fc8181':TEXT,
                        borderColor:u.activo!==false?'#fc818144':BORDER }}
                        onClick={()=>toggleActivo(u)}>
                        {u.activo!==false?'Desactivar':'Activar'}
                      </button>
                    </td>
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
