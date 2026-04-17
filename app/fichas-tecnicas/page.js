'use client'
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/useAuth'

const CATS_DEFAULT = ['Panel Sandwich','Gypsum','PVC','Ferretería','Pintura','Eléctricos','Plomería','General']

export default function FichasTecnicas() {
  const { perfil, puedeVer } = useAuth()
  const isAdmin = perfil?.rol === 'admin'
  const puedeSubir = isAdmin || puedeVer('fichas-tecnicas')
  const [fichas, setFichas] = useState([])
  const [busqueda, setBusqueda] = useState('')
  const [catFiltro, setCatFiltro] = useState('Todos')
  const [form, setForm] = useState({ nombre: '', categoria: 'General', descripcion: '', nuevaCat: '' })
  const [archivo, setArchivo] = useState(null)
  const [subiendo, setSubiendo] = useState(false)
  const [msg, setMsg] = useState('')
  const [editId, setEditId] = useState(null)
  const [showUpload, setShowUpload] = useState(false)
  const [toast, setToast] = useState(null)

  useEffect(() => { cargar() }, [])

  function mostrarToast(texto, tipo = 'exito') {
    setToast({ texto, tipo })
    setTimeout(() => setToast(null), 4500)
  }

  async function cargar() {
    const { data } = await supabase.from('fichas_tecnicas').select('*').order('creado_en', { ascending: false })
    if (data) setFichas(data)
  }

  const todasCategorias = useMemo(() => {
    const fromDB = fichas.map(f => f.categoria).filter(Boolean)
    return [...new Set([...CATS_DEFAULT, ...fromDB])].sort()
  }, [fichas])

  const filtradas = fichas.filter(f => {
    const txt = busqueda.toLowerCase()
    const coincide = f.nombre.toLowerCase().includes(txt) || (f.categoria || '').toLowerCase().includes(txt) || (f.descripcion || '').toLowerCase().includes(txt)
    const cat = catFiltro === 'Todos' || f.categoria === catFiltro
    return coincide && cat
  })

  const ultimaSubida = fichas.length > 0 ? new Date(fichas[0].creado_en).toLocaleDateString('es-CR') : '—'

  async function guardar() {
    const catFinal = form.nuevaCat.trim() || form.categoria
    if (!form.nombre.trim()) return setMsg('El nombre es requerido')
    if (!editId && !archivo) return setMsg('Seleccioná un archivo PDF')
    setSubiendo(true); setMsg('')

    let archivo_url = null, archivo_nombre = null
    if (archivo) {
      const fileName = `${Date.now()}_${archivo.name}`
      const { error } = await supabase.storage.from('fichas-tecnicas').upload(fileName, archivo)
      if (error) { setSubiendo(false); return setMsg('Error al subir: ' + error.message) }
      const { data: { publicUrl } } = supabase.storage.from('fichas-tecnicas').getPublicUrl(fileName)
      archivo_url = publicUrl
      archivo_nombre = archivo.name
    }

    if (editId) {
      const update = { nombre: form.nombre.trim(), categoria: catFinal, descripcion: form.descripcion.trim() || null }
      if (archivo_url) { update.archivo_url = archivo_url; update.archivo_nombre = archivo_nombre }
      const { error } = await supabase.from('fichas_tecnicas').update(update).eq('id', editId)
      if (error) { setSubiendo(false); return setMsg('Error: ' + error.message) }
      mostrarToast('Ficha actualizada correctamente')
    } else {
      const { error } = await supabase.from('fichas_tecnicas').insert([{
        nombre: form.nombre.trim(), categoria: catFinal, descripcion: form.descripcion.trim() || null,
        archivo_url, archivo_nombre, subido_por: perfil?.nombre || 'usuario', creado_en: new Date().toISOString()
      }])
      if (error) { setSubiendo(false); return setMsg('Error: ' + error.message) }
      mostrarToast('Ficha subida correctamente')
    }
    setForm({ nombre: '', categoria: 'General', descripcion: '', nuevaCat: '' }); setArchivo(null); setEditId(null); setShowUpload(false); setSubiendo(false); cargar()
  }

  function editar(f) {
    setEditId(f.id); setForm({ nombre: f.nombre, categoria: f.categoria || 'General', descripcion: f.descripcion || '', nuevaCat: '' }); setArchivo(null); setShowUpload(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function eliminar(id, archivoNombre) {
    if (!confirm('¿Eliminar esta ficha técnica?')) return
    if (archivoNombre) await supabase.storage.from('fichas-tecnicas').remove([archivoNombre])
    await supabase.from('fichas_tecnicas').delete().eq('id', id)
    cargar()
  }

  const s = {
    page: { minHeight: '100vh', background: 'linear-gradient(135deg, #e8ecf4 0%, #d5dde8 30%, #e0e7f0 60%, #edf1f7 100%)', fontFamily: 'Rubik, sans-serif', padding: '24px' },
    card: { background: 'rgba(255,255,255,0.55)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.6)', borderRadius: 20, padding: '20px' },
    gold: '#c8a84b', txt: 'rgba(0,0,0,0.85)', muted: 'rgba(0,0,0,0.4)',
    btn: { background: '#c8a84b', color: '#fff', border: 'none', borderRadius: 12, padding: '10px 20px', cursor: 'pointer', fontFamily: 'Rubik, sans-serif', fontWeight: 600, fontSize: 14 },
    btnSm: { background: '#c8a84b', color: '#fff', border: 'none', borderRadius: 10, padding: '7px 14px', cursor: 'pointer', fontFamily: 'Rubik, sans-serif', fontWeight: 600, fontSize: 13 },
    btnOut: { background: 'transparent', color: '#c8a84b', border: '1px solid #c8a84b', borderRadius: 10, padding: '7px 14px', cursor: 'pointer', fontFamily: 'Rubik, sans-serif', fontWeight: 600, fontSize: 13 },
    btnDel: { background: '#e74c3c', color: '#fff', border: 'none', borderRadius: 10, padding: '7px 14px', cursor: 'pointer', fontFamily: 'Rubik, sans-serif', fontWeight: 600, fontSize: 13 },
    input: { width: '100%', padding: '10px 14px', borderRadius: 12, border: '1px solid rgba(0,0,0,0.1)', fontFamily: 'Rubik, sans-serif', fontSize: 14, background: 'rgba(255,255,255,0.7)', outline: 'none', boxSizing: 'border-box' },
    badge: { display: 'inline-block', background: 'rgba(200,168,75,0.15)', color: '#c8a84b', borderRadius: 8, padding: '3px 10px', fontSize: 12, fontWeight: 600 },
  }

  return (
    <div style={s.page}>
      <style>{`
        @keyframes slideInToast {
          from { opacity: 0; transform: translateY(-16px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>

      {/* Toast de confirmación */}
      {toast && (
        <div style={{
          position: 'fixed', top: 24, right: 24, zIndex: 9999,
          background: toast.tipo === 'error' ? '#e74c3c' : '#27ae60',
          color: '#fff', borderRadius: 16, padding: '16px 24px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.2)', fontSize: 15, fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 10,
          animation: 'slideInToast 0.3s ease',
          maxWidth: 360,
        }}>
          <span style={{ fontSize: 20 }}>{toast.tipo === 'error' ? '❌' : '✅'}</span>
          {toast.texto}
        </div>
      )}

      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 700, color: s.txt, margin: 0 }}>📋 Fichas Técnicas</h1>
            <p style={{ color: s.muted, margin: '4px 0 0', fontSize: 15 }}>Documentación técnica de productos</p>
          </div>
          {puedeSubir && (
            <button style={s.btn} onClick={() => {
              setShowUpload(!showUpload); setEditId(null)
              setForm({ nombre: '', categoria: 'General', descripcion: '', nuevaCat: '' }); setArchivo(null)
            }}>
              {showUpload ? '✕ Cerrar' : '+ Nueva Ficha'}
            </button>
          )}
        </div>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
          {[{ label: 'Total Fichas', val: fichas.length }, { label: 'Categorías', val: todasCategorias.length }, { label: 'Última Subida', val: ultimaSubida }].map((k, i) => (
            <div key={i} style={{ ...s.card, textAlign: 'center' }}>
              <div style={{ fontSize: 26, fontWeight: 700, color: s.gold }}>{k.val}</div>
              <div style={{ color: s.muted, fontSize: 13, marginTop: 4 }}>{k.label}</div>
            </div>
          ))}
        </div>

        {/* Formulario de subida (admin o con permiso fichas-tecnicas) */}
        {puedeSubir && showUpload && (
          <div style={{ ...s.card, marginBottom: 24, borderLeft: editId ? '4px solid #3b82f6' : '4px solid #c8a84b' }}>
            <h3 style={{ margin: '0 0 16px', color: s.txt, fontSize: 18 }}>{editId ? '✏️ Editar Ficha' : '📤 Subir Nueva Ficha'}</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: s.muted, display: 'block', marginBottom: 4 }}>Nombre *</label>
                <input style={s.input} placeholder="Ej: Panel Sándwich 50mm" value={form.nombre} onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: s.muted, display: 'block', marginBottom: 4 }}>Categoría</label>
                <select style={s.input} value={form.categoria} onChange={e => setForm(p => ({ ...p, categoria: e.target.value, nuevaCat: '' }))}>
                  {todasCategorias.map(c => <option key={c} value={c}>{c}</option>)}
                  <option value="__nueva__">+ Agregar nueva categoría...</option>
                </select>
              </div>
              {form.categoria === '__nueva__' && (
                <div>
                  <label style={{ fontSize: 12, color: s.muted, display: 'block', marginBottom: 4 }}>Nueva categoría</label>
                  <input style={s.input} placeholder="Nombre de la nueva categoría" value={form.nuevaCat} onChange={e => setForm(p => ({ ...p, nuevaCat: e.target.value }))} />
                </div>
              )}
              <div>
                <label style={{ fontSize: 12, color: s.muted, display: 'block', marginBottom: 4 }}>{editId ? 'Reemplazar PDF (opcional)' : 'Archivo PDF *'}</label>
                <input style={s.input} type="file" accept=".pdf" onChange={e => { setArchivo(e.target.files[0] || null); setMsg('') }} />
                {archivo && (
                  <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(39,174,96,0.08)', border: '1px solid rgba(39,174,96,0.3)', borderRadius: 10, padding: '8px 12px' }}>
                    <span style={{ fontSize: 18 }}>📎</span>
                    <div>
                      <div style={{ fontSize: 13, color: '#27ae60', fontWeight: 600 }}>{archivo.name}</div>
                      <div style={{ fontSize: 11, color: s.muted }}>{(archivo.size / 1024).toFixed(0)} KB — listo para subir</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: s.muted, display: 'block', marginBottom: 4 }}>Descripción</label>
              <textarea style={{ ...s.input, minHeight: 60 }} placeholder="Descripción breve (opcional)" value={form.descripcion} onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <button style={{ ...s.btn, opacity: subiendo ? 0.7 : 1 }} onClick={guardar} disabled={subiendo}>
                {subiendo ? '⏳ Subiendo...' : editId ? 'Guardar Cambios' : 'Subir Ficha'}
              </button>
              <button style={s.btnOut} onClick={() => { setShowUpload(false); setEditId(null); setMsg('') }}>Cancelar</button>
              {msg && <span style={{ color: msg.includes('Error') ? '#e74c3c' : '#27ae60', fontSize: 13, fontWeight: 500 }}>{msg}</span>}
            </div>
          </div>
        )}

        {/* Búsqueda + Filtro */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
          <input style={{ ...s.input, flex: 1, minWidth: 200 }} placeholder="Buscar por nombre, categoría o descripción..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
          <select style={{ ...s.input, width: 'auto', minWidth: 160 }} value={catFiltro} onChange={e => setCatFiltro(e.target.value)}>
            <option value="Todos">Todas las categorías</option>
            {todasCategorias.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* Grid de fichas */}
        {filtradas.length === 0 ? (
          <div style={{ ...s.card, textAlign: 'center', padding: 40 }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>📄</div>
            <p style={{ color: s.muted, margin: 0 }}>No se encontraron fichas técnicas</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {filtradas.map(f => (
              <div key={f.id} style={s.card}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📄</div>
                <div style={{ fontWeight: 700, fontSize: 16, color: s.txt, marginBottom: 6 }}>{f.nombre}</div>
                <div style={{ marginBottom: 8 }}><span style={s.badge}>{f.categoria || 'General'}</span></div>
                {f.descripcion && <p style={{ color: s.muted, fontSize: 13, margin: '0 0 12px', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{f.descripcion}</p>}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                  <button style={s.btnSm} onClick={() => window.open(f.archivo_url, '_blank')}>Ver PDF</button>
                  <a href={f.archivo_url} download={f.archivo_nombre || 'ficha.pdf'} style={{ ...s.btnSm, textDecoration: 'none', display: 'inline-block' }}>Descargar</a>
                  {isAdmin && <button style={s.btnOut} onClick={() => editar(f)}>Editar</button>}
                  {isAdmin && <button style={s.btnDel} onClick={() => eliminar(f.id, f.archivo_nombre)}>Eliminar</button>}
                </div>
                <div style={{ color: s.muted, fontSize: 12 }}>{f.subido_por && <span>Subido por {f.subido_por} · </span>}{f.creado_en ? new Date(f.creado_en).toLocaleDateString('es-CR') : ''}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
