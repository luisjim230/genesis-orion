'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/useAuth'

const CATEGORIAS = ['Todos','Panel Sandwich','Gypsum','PVC','Ferreteria','Pintura','Electricos','Plomeria','General']

export default function FichasTecnicas() {
  const { perfil } = useAuth()
  const role = perfil?.rol
  const user = perfil
  const [fichas, setFichas] = useState([])
  const [busqueda, setBusqueda] = useState('')
  const [catFiltro, setCatFiltro] = useState('Todos')
  const [nombre, setNombre] = useState('')
  const [categoria, setCategoria] = useState('General')
  const [descripcion, setDescripcion] = useState('')
  const [archivo, setArchivo] = useState(null)
  const [subiendo, setSubiendo] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => { cargar() }, [])

  async function cargar() {
    const { data } = await supabase.from('fichas_tecnicas').select('*').order('creado_en', { ascending: false })
    if (data) setFichas(data)
  }

  const filtradas = fichas.filter(f => {
    const coincide = f.nombre.toLowerCase().includes(busqueda.toLowerCase()) || (f.categoria || '').toLowerCase().includes(busqueda.toLowerCase())
    const cat = catFiltro === 'Todos' || f.categoria === catFiltro
    return coincide && cat
  })

  const categoriasUnicas = [...new Set(fichas.map(f => f.categoria).filter(Boolean))].length
  const ultimaSubida = fichas.length > 0 ? new Date(fichas[0].creado_en).toLocaleDateString('es-HN') : '-'

  async function subir() {
    if (!nombre || !archivo) return setMsg('Nombre y archivo son requeridos')
    setSubiendo(true); setMsg('')
    const fileName = `${Date.now()}_${archivo.name}`
    const { data, error } = await supabase.storage.from('fichas-tecnicas').upload(fileName, archivo)
    if (error) { setSubiendo(false); return setMsg('Error al subir: ' + error.message) }
    const { data: { publicUrl } } = supabase.storage.from('fichas-tecnicas').getPublicUrl(fileName)
    const { error: e2 } = await supabase.from('fichas_tecnicas').insert([{ nombre, categoria, descripcion, archivo_url: publicUrl, archivo_nombre: archivo.name, subido_por: user?.email || 'admin', creado_en: new Date().toISOString() }])
    if (e2) { setSubiendo(false); return setMsg('Error al guardar: ' + e2.message) }
    setMsg('Ficha subida correctamente'); setNombre(''); setDescripcion(''); setArchivo(null); setSubiendo(false); cargar()
  }

  async function eliminar(id, archivoNombre) {
    if (!confirm('Eliminar esta ficha?')) return
    await supabase.storage.from('fichas-tecnicas').remove([archivoNombre])
    await supabase.from('fichas_tecnicas').delete().eq('id', id)
    cargar()
  }

  const isAdmin = role === 'admin'
  const s = {
    page: { minHeight: '100vh', background: 'linear-gradient(135deg, #e8ecf4 0%, #d5dde8 30%, #e0e7f0 60%, #edf1f7 100%)', fontFamily: 'Rubik, sans-serif', padding: '24px' },
    card: { background: 'rgba(255,255,255,0.55)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.6)', borderRadius: 20, padding: '20px' },
    gold: '#c8a84b',
    txt: 'rgba(0,0,0,0.85)',
    muted: 'rgba(0,0,0,0.4)',
    btn: { background: '#c8a84b', color: '#fff', border: 'none', borderRadius: 12, padding: '10px 20px', cursor: 'pointer', fontFamily: 'Rubik, sans-serif', fontWeight: 600, fontSize: 14 },
    btnSm: { background: '#c8a84b', color: '#fff', border: 'none', borderRadius: 10, padding: '7px 14px', cursor: 'pointer', fontFamily: 'Rubik, sans-serif', fontWeight: 600, fontSize: 13 },
    btnDel: { background: '#e74c3c', color: '#fff', border: 'none', borderRadius: 10, padding: '7px 14px', cursor: 'pointer', fontFamily: 'Rubik, sans-serif', fontWeight: 600, fontSize: 13 },
    input: { width: '100%', padding: '10px 14px', borderRadius: 12, border: '1px solid rgba(0,0,0,0.1)', fontFamily: 'Rubik, sans-serif', fontSize: 14, background: 'rgba(255,255,255,0.7)', outline: 'none', boxSizing: 'border-box' },
    badge: (c) => ({ display: 'inline-block', background: 'rgba(200,168,75,0.15)', color: '#c8a84b', borderRadius: 8, padding: '3px 10px', fontSize: 12, fontWeight: 600 }),
  }

  return (
    <div style={s.page}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: s.txt, margin: 0 }}>📋 Fichas Tecnicas</h1>
          <p style={{ color: s.muted, margin: '4px 0 0', fontSize: 15 }}>Documentacion tecnica de productos</p>
        </div>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
          {[{ label: 'Total Fichas', val: fichas.length }, { label: 'Categorias', val: categoriasUnicas }, { label: 'Ultima Subida', val: ultimaSubida }].map((k, i) => (
            <div key={i} style={{ ...s.card, textAlign: 'center' }}>
              <div style={{ fontSize: 26, fontWeight: 700, color: s.gold }}>{k.val}</div>
              <div style={{ color: s.muted, fontSize: 13, marginTop: 4 }}>{k.label}</div>
            </div>
          ))}
        </div>

        {/* Search + Filter */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
          <input style={{ ...s.input, flex: 1, minWidth: 200 }} placeholder="Buscar por nombre o categoria..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
          <select style={{ ...s.input, width: 'auto', minWidth: 160 }} value={catFiltro} onChange={e => setCatFiltro(e.target.value)}>
            {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* Upload (admin) */}
        {isAdmin && (
          <div style={{ ...s.card, marginBottom: 24 }}>
            <h3 style={{ margin: '0 0 16px', color: s.txt, fontSize: 18 }}>Subir Nueva Ficha</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 12 }}>
              <input style={s.input} placeholder="Nombre *" value={nombre} onChange={e => setNombre(e.target.value)} />
              <select style={s.input} value={categoria} onChange={e => setCategoria(e.target.value)}>
                {CATEGORIAS.filter(c => c !== 'Todos').map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <input style={s.input} type="file" accept=".pdf" onChange={e => setArchivo(e.target.files[0])} />
            </div>
            <textarea style={{ ...s.input, marginBottom: 12, minHeight: 60 }} placeholder="Descripcion (opcional)" value={descripcion} onChange={e => setDescripcion(e.target.value)} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button style={s.btn} onClick={subir} disabled={subiendo}>{subiendo ? 'Subiendo...' : 'Subir Ficha'}</button>
              {msg && <span style={{ color: msg.includes('Error') ? '#e74c3c' : '#27ae60', fontSize: 14 }}>{msg}</span>}
            </div>
          </div>
        )}

        {/* Grid */}
        {filtradas.length === 0 ? (
          <div style={{ ...s.card, textAlign: 'center', padding: 40 }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>📄</div>
            <p style={{ color: s.muted, margin: 0 }}>No se encontraron fichas tecnicas</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {filtradas.map(f => (
              <div key={f.id} style={s.card}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📄</div>
                <div style={{ fontWeight: 700, fontSize: 16, color: s.txt, marginBottom: 6 }}>{f.nombre}</div>
                <div style={{ marginBottom: 8 }}><span style={s.badge()}>{f.categoria || 'General'}</span></div>
                {f.descripcion && <p style={{ color: s.muted, fontSize: 13, margin: '0 0 12px', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{f.descripcion}</p>}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                  <button style={s.btnSm} onClick={() => window.open(f.archivo_url, '_blank')}>Ver PDF</button>
                  <a href={f.archivo_url} download={f.archivo_nombre || 'ficha.pdf'} style={{ ...s.btnSm, textDecoration: 'none', display: 'inline-block' }}>Descargar</a>
                  {isAdmin && <button style={s.btnDel} onClick={() => eliminar(f.id, f.archivo_nombre)}>Eliminar</button>}
                </div>
                <div style={{ color: s.muted, fontSize: 12 }}>{f.creado_en ? new Date(f.creado_en).toLocaleDateString('es-HN') : ''}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
