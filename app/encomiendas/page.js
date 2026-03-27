'use client'
import { useAuth } from '../../lib/useAuth'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'

const ESTADOS_ENVIO = [
  { val: 'pendiente', label: 'Pendiente', color: '#e8a030', bg: 'rgba(232,160,48,0.12)' },
  { val: 'en_transito', label: 'En tránsito', color: '#5b9bd5', bg: 'rgba(91,155,213,0.12)' },
  { val: 'entregado', label: 'Entregado', color: '#4caf7d', bg: 'rgba(76,175,125,0.12)' },
  { val: 'problema', label: 'Problema', color: '#e05252', bg: 'rgba(224,82,82,0.12)' },
]

const FILTROS_ENVIO = [
  { val: 'activos', label: 'Activos' },
  { val: 'entregados', label: 'Entregados' },
  { val: 'todos', label: 'Todos' },
]

const estadoInfo = (val) => ESTADOS_ENVIO.find(e => e.val === val) || ESTADOS_ENVIO[0]
const today = () => new Date().toISOString().split('T')[0]

const EMPTY_ENVIO = {
  factura: '',
  cliente: '',
  fecha_factura: today(),
  vendedor: '',
  encomienda: '',
  numero_guia: '',
  recibio_guia: false,
  estado: 'pendiente',
  observaciones: '',
}

const EMPTY_EMPRESA = { nombre: '', telefono: '', direccion: '' }
const EMPTY_ZONA = { nombre: '', localidades: '', empresa_id: '' }

/* ─── Styles ─── */
const S = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #e8ecf4 0%, #d5dde8 30%, #e0e7f0 60%, #edf1f7 100%)',
    fontFamily: 'Rubik, sans-serif',
    padding: '24px 16px 60px',
  },
  container: { maxWidth: 1200, margin: '0 auto' },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    flexWrap: 'wrap', gap: 12, marginBottom: 24,
  },
  title: { fontSize: 26, fontWeight: 700, color: 'rgba(0,0,0,0.85)', margin: 0 },
  subtitle: { fontSize: 13, color: 'rgba(0,0,0,0.4)', marginTop: 2 },
  card: {
    background: 'rgba(255,255,255,0.55)',
    backdropFilter: 'blur(24px) saturate(1.8)',
    WebkitBackdropFilter: 'blur(24px) saturate(1.8)',
    border: '1px solid rgba(255,255,255,0.6)',
    borderRadius: 20,
    boxShadow: '0 4px 30px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.8)',
    padding: 20,
    marginBottom: 16,
  },
  kpiRow: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
    gap: 14, marginBottom: 20,
  },
  kpiCard: (color) => ({
    background: 'rgba(255,255,255,0.55)',
    backdropFilter: 'blur(24px) saturate(1.8)',
    WebkitBackdropFilter: 'blur(24px) saturate(1.8)',
    border: '1px solid rgba(255,255,255,0.6)',
    borderRadius: 16,
    boxShadow: '0 4px 30px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.8)',
    padding: '16px 18px',
    textAlign: 'center',
    borderBottom: `3px solid ${color}`,
  }),
  kpiNum: (color) => ({ fontSize: 28, fontWeight: 700, color, margin: 0 }),
  kpiLabel: { fontSize: 12, color: 'rgba(0,0,0,0.4)', marginTop: 4 },
  tabs: { display: 'flex', gap: 8, marginBottom: 20 },
  tab: (active) => ({
    padding: '10px 22px', borderRadius: 12, border: 'none', cursor: 'pointer',
    fontSize: 14, fontWeight: 600, fontFamily: 'Rubik, sans-serif',
    background: active ? '#c8a84b' : 'rgba(255,255,255,0.5)',
    color: active ? '#fff' : 'rgba(0,0,0,0.55)',
    backdropFilter: active ? 'none' : 'blur(12px)',
    transition: 'all 0.2s',
  }),
  searchBar: {
    width: '100%', padding: '12px 16px', borderRadius: 14,
    border: '1px solid rgba(255,255,255,0.6)', fontSize: 14,
    fontFamily: 'Rubik, sans-serif',
    background: 'rgba(255,255,255,0.45)', backdropFilter: 'blur(12px)',
    outline: 'none', color: 'rgba(0,0,0,0.85)', marginBottom: 16, boxSizing: 'border-box',
  },
  input: {
    width: '100%', padding: '10px 14px', borderRadius: 12,
    border: '1px solid rgba(0,0,0,0.1)', fontSize: 14,
    fontFamily: 'Rubik, sans-serif',
    background: 'rgba(255,255,255,0.6)', outline: 'none',
    color: 'rgba(0,0,0,0.85)', boxSizing: 'border-box',
  },
  select: {
    width: '100%', padding: '10px 14px', borderRadius: 12,
    border: '1px solid rgba(0,0,0,0.1)', fontSize: 14,
    fontFamily: 'Rubik, sans-serif',
    background: 'rgba(255,255,255,0.6)', outline: 'none',
    color: 'rgba(0,0,0,0.85)', boxSizing: 'border-box',
    appearance: 'auto',
  },
  label: { fontSize: 12, fontWeight: 600, color: 'rgba(0,0,0,0.5)', marginBottom: 4, display: 'block' },
  formGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 16 },
  btnPrimary: {
    padding: '10px 24px', borderRadius: 12, border: 'none', cursor: 'pointer',
    fontSize: 14, fontWeight: 600, fontFamily: 'Rubik, sans-serif',
    background: '#c8a84b', color: '#fff', transition: 'all 0.2s',
  },
  btnSecondary: {
    padding: '10px 24px', borderRadius: 12, border: '1px solid rgba(0,0,0,0.1)',
    cursor: 'pointer', fontSize: 14, fontWeight: 600, fontFamily: 'Rubik, sans-serif',
    background: 'rgba(255,255,255,0.5)', color: 'rgba(0,0,0,0.6)', transition: 'all 0.2s',
  },
  btnSmall: (bg, color) => ({
    padding: '6px 14px', borderRadius: 10, border: 'none', cursor: 'pointer',
    fontSize: 12, fontWeight: 600, fontFamily: 'Rubik, sans-serif',
    background: bg || 'rgba(0,0,0,0.06)', color: color || 'rgba(0,0,0,0.6)',
    transition: 'all 0.2s',
  }),
  table: {
    width: '100%', borderCollapse: 'separate', borderSpacing: '0 6px',
  },
  th: {
    padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700,
    color: 'rgba(0,0,0,0.4)', textTransform: 'uppercase', letterSpacing: 0.5,
  },
  td: {
    padding: '12px 12px', fontSize: 13, color: 'rgba(0,0,0,0.85)',
    background: 'rgba(255,255,255,0.4)', verticalAlign: 'middle',
  },
  tdFirst: { borderRadius: '12px 0 0 12px' },
  tdLast: { borderRadius: '0 12px 12px 0' },
  badge: (bg, color) => ({
    display: 'inline-block', padding: '4px 12px', borderRadius: 20,
    fontSize: 11, fontWeight: 600, background: bg, color,
  }),
  toggle: (active) => ({
    width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
    background: active ? '#4caf7d' : 'rgba(0,0,0,0.12)',
    position: 'relative', transition: 'background 0.2s', padding: 0,
    display: 'inline-flex', alignItems: 'center',
  }),
  toggleKnob: (active) => ({
    width: 18, height: 18, borderRadius: '50%', background: '#fff',
    position: 'absolute', top: 3,
    left: active ? 23 : 3,
    transition: 'left 0.2s',
    boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
  }),
  empresaHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    cursor: 'pointer', gap: 12,
  },
  zonaChip: {
    display: 'inline-block', padding: '6px 14px', borderRadius: 12,
    background: 'rgba(200,168,75,0.1)', color: '#c8a84b',
    fontSize: 12, fontWeight: 600, margin: '4px 4px 4px 0',
  },
  localidad: {
    display: 'inline-block', padding: '4px 10px', borderRadius: 8,
    background: 'rgba(0,0,0,0.04)', color: 'rgba(0,0,0,0.6)',
    fontSize: 11, margin: '3px 3px 3px 0',
  },
  localidadHighlight: {
    display: 'inline-block', padding: '4px 10px', borderRadius: 8,
    background: 'rgba(200,168,75,0.25)', color: '#8a7030',
    fontSize: 11, margin: '3px 3px 3px 0', fontWeight: 600,
  },
  msg: (type) => ({
    padding: '12px 18px', borderRadius: 14, marginBottom: 16,
    fontSize: 13, fontWeight: 500,
    background: type === 'ok' ? 'rgba(76,175,125,0.12)' : 'rgba(224,82,82,0.12)',
    color: type === 'ok' ? '#2e7d50' : '#c0392b',
  }),
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)',
    backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center',
    justifyContent: 'center', zIndex: 1000,
  },
  modal: {
    background: 'rgba(255,255,255,0.85)',
    backdropFilter: 'blur(30px) saturate(1.8)',
    WebkitBackdropFilter: 'blur(30px) saturate(1.8)',
    border: '1px solid rgba(255,255,255,0.7)',
    borderRadius: 24, padding: 28, width: '90%', maxWidth: 560,
    boxShadow: '0 8px 40px rgba(0,0,0,0.12)',
  },
  emptyState: {
    textAlign: 'center', padding: 40, color: 'rgba(0,0,0,0.3)', fontSize: 14,
  },
}

export default function EncomiendasPage() {
  const { perfil } = useAuth()
  const isAdmin = perfil?.rol === 'admin'

  /* ─── Tab principal ─── */
  const [tabActivo, setTabActivo] = useState('rutas')

  /* ─── Estado Tab Rutas ─── */
  const [empresas, setEmpresas] = useState([])
  const [zonas, setZonas] = useState([])
  const [expandedEmpresa, setExpandedEmpresa] = useState(null)
  const [busqRutas, setBusqRutas] = useState('')
  const [showFormEmpresa, setShowFormEmpresa] = useState(false)
  const [formEmpresa, setFormEmpresa] = useState(EMPTY_EMPRESA)
  const [showFormZona, setShowFormZona] = useState(null) // empresa_id or null
  const [formZona, setFormZona] = useState(EMPTY_ZONA)

  /* ─── Estado Tab Envios ─── */
  const [envios, setEnvios] = useState([])
  const [filtroEnvio, setFiltroEnvio] = useState('activos')
  const [busqEnvio, setBusqEnvio] = useState('')
  const [showFormEnvio, setShowFormEnvio] = useState(false)
  const [formEnvio, setFormEnvio] = useState(EMPTY_ENVIO)
  const [editEnvioId, setEditEnvioId] = useState(null)
  const [empresasMap, setEmpresasMap] = useState({})

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)

  /* ─── Fetch empresas + zonas ─── */
  const fetchRutas = useCallback(async () => {
    const { data: emp } = await supabase.from('encomiendas_empresas').select('*').order('nombre')
    const { data: zon } = await supabase.from('encomiendas_zonas').select('*').order('zona')
    setEmpresas(emp || [])
    setZonas(zon || [])
    const map = {}
    ;(emp || []).forEach(e => { map[e.id] = e.nombre })
    setEmpresasMap(map)
  }, [])

  /* ─── Fetch envios ─── */
  const fetchEnvios = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('encomiendas_envios')
      .select('*')
      .order('created_at', { ascending: false })
    if (!error) setEnvios(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchRutas() }, [fetchRutas])
  useEffect(() => { fetchEnvios() }, [fetchEnvios])

  /* ─── Auto-fill vendedor ─── */
  useEffect(() => {
    if (perfil?.nombre && !editEnvioId) {
      setFormEnvio(f => ({ ...f, vendedor: f.vendedor || perfil.nombre }))
    }
  }, [perfil, editEnvioId])

  /* ─── KPIs ─── */
  const now = new Date()
  const mesActual = now.getMonth()
  const anioActual = now.getFullYear()
  const kpiPendientes = envios.filter(e => e.estado === 'pendiente').length
  const kpiTransito = envios.filter(e => e.estado === 'en_transito').length
  const kpiEntregados = envios.filter(e => {
    if (e.estado !== 'entregado') return false
    const d = new Date(e.cerrado_en || e.created_at)
    return d.getMonth() === mesActual && d.getFullYear() === anioActual
  }).length
  const kpiProblema = envios.filter(e => e.estado === 'problema').length

  /* ─── Filtro envios ─── */
  const enviosFiltrados = envios.filter(e => {
    if (filtroEnvio === 'activos' && !['pendiente', 'en_transito'].includes(e.estado)) return false
    if (filtroEnvio === 'entregados' && e.estado !== 'entregado') return false
    const q = busqEnvio.toLowerCase()
    if (q) {
      const match = (e.cliente || '').toLowerCase().includes(q) ||
        (e.factura || '').toLowerCase().includes(q) ||
        (e.numero_guia || '').toLowerCase().includes(q)
      if (!match) return false
    }
    return true
  })

  /* ─── Guardar empresa ─── */
  const guardarEmpresa = async () => {
    if (!formEmpresa.nombre.trim()) return
    setSaving(true)
    const { error } = await supabase.from('encomiendas_empresas').insert([formEmpresa])
    if (error) setMsg({ type: 'err', text: 'Error al guardar empresa: ' + error.message })
    else { setMsg({ type: 'ok', text: 'Empresa agregada' }); setFormEmpresa(EMPTY_EMPRESA); setShowFormEmpresa(false); fetchRutas() }
    setSaving(false)
  }

  /* ─── Guardar zona ─── */
  const guardarZona = async (empresaId) => {
    if (!formZona.nombre.trim()) return
    setSaving(true)
    const payload = { nombre: formZona.nombre, localidades: formZona.localidades, empresa_id: empresaId }
    const { error } = await supabase.from('encomiendas_zonas').insert([payload])
    if (error) setMsg({ type: 'err', text: 'Error al guardar zona: ' + error.message })
    else { setMsg({ type: 'ok', text: 'Zona agregada' }); setFormZona(EMPTY_ZONA); setShowFormZona(null); fetchRutas() }
    setSaving(false)
  }

  /* ─── Guardar envio ─── */
  const guardarEnvio = async () => {
    if (!formEnvio.factura.trim() || !formEnvio.cliente.trim()) {
      setMsg({ type: 'err', text: 'Factura y Cliente son obligatorios' }); return
    }
    setSaving(true)
    if (editEnvioId) {
      const { error } = await supabase.from('encomiendas_envios').update(formEnvio).eq('id', editEnvioId)
      if (error) setMsg({ type: 'err', text: 'Error: ' + error.message })
      else { setMsg({ type: 'ok', text: 'Envío actualizado' }); cerrarFormEnvio(); fetchEnvios() }
    } else {
      const payload = { ...formEnvio, creado_por: perfil?.nombre || '', user_id: perfil?.auth_id || perfil?.user_id || '' }
      const { error } = await supabase.from('encomiendas_envios').insert([payload])
      if (error) setMsg({ type: 'err', text: 'Error: ' + error.message })
      else { setMsg({ type: 'ok', text: 'Envío registrado' }); cerrarFormEnvio(); fetchEnvios() }
    }
    setSaving(false)
  }

  /* ─── Marcar entregado ─── */
  const marcarEntregado = async (id) => {
    const { error } = await supabase.from('encomiendas_envios')
      .update({ estado: 'entregado', cerrado_en: new Date().toISOString() })
      .eq('id', id)
    if (!error) { setMsg({ type: 'ok', text: 'Marcado como entregado' }); fetchEnvios() }
  }

  /* ─── Toggle recibio guia ─── */
  const toggleGuia = async (envio) => {
    const { error } = await supabase.from('encomiendas_envios')
      .update({ recibio_guia: !envio.recibio_guia })
      .eq('id', envio.id)
    if (!error) fetchEnvios()
  }

  /* ─── Editar envio ─── */
  const iniciarEdicion = (envio) => {
    const puedeEditar = isAdmin || (perfil?.nombre === envio.creado_por) || (perfil?.auth_id === envio.user_id) || (perfil?.user_id === envio.user_id)
    if (!puedeEditar) { setMsg({ type: 'err', text: 'No tenés permisos para editar este envío' }); return }
    setFormEnvio({
      factura: envio.factura || '',
      cliente: envio.cliente || '',
      fecha_factura: envio.fecha_factura || today(),
      vendedor: envio.vendedor || '',
      encomienda: envio.encomienda || '',
      numero_guia: envio.numero_guia || '',
      recibio_guia: envio.recibio_guia || false,
      estado: envio.estado || 'pendiente',
      observaciones: envio.observaciones || '',
    })
    setEditEnvioId(envio.id)
    setShowFormEnvio(true)
  }

  const cerrarFormEnvio = () => {
    setShowFormEnvio(false)
    setEditEnvioId(null)
    setFormEnvio({ ...EMPTY_ENVIO, vendedor: perfil?.nombre || '' })
  }

  /* ─── Búsqueda rutas ─── */
  const busqLower = busqRutas.toLowerCase().trim()

  const renderLocalidad = (loc) => {
    if (!busqLower) return loc
    const idx = loc.toLowerCase().indexOf(busqLower)
    if (idx === -1) return loc
    return loc
  }
  const locMatches = (loc) => busqLower && loc.toLowerCase().includes(busqLower)

  /* ─── Limpiar msg ─── */
  useEffect(() => { if (msg) { const t = setTimeout(() => setMsg(null), 4000); return () => clearTimeout(t) } }, [msg])

  /* ═══════════════════════════════════════════ RENDER ═══════════════════════════════════════════ */
  return (
    <div style={S.page}>
      <div style={S.container}>
        {/* Header */}
        <div style={S.header}>
          <div>
            <h1 style={S.title}>Encomiendas</h1>
            <p style={S.subtitle}>Gestión de envíos y rutas de encomienda</p>
          </div>
        </div>

        {msg && <div style={S.msg(msg.type)}>{msg.text}</div>}

        {/* Tabs principales */}
        <div style={S.tabs}>
          <button style={S.tab(tabActivo === 'rutas')} onClick={() => setTabActivo('rutas')}>
            Consulta de Rutas
          </button>
          <button style={S.tab(tabActivo === 'envios')} onClick={() => setTabActivo('envios')}>
            Seguimiento de Envíos
          </button>
        </div>

        {/* ═══════════ TAB RUTAS ═══════════ */}
        {tabActivo === 'rutas' && (
          <div>
            <input
              style={S.searchBar}
              placeholder="Buscar localidad (ej: Liberia, San Carlos, Pérez Zeledón...)"
              value={busqRutas}
              onChange={e => setBusqRutas(e.target.value)}
            />

            {isAdmin && (
              <div style={{ marginBottom: 16 }}>
                {!showFormEmpresa ? (
                  <button style={S.btnPrimary} onClick={() => setShowFormEmpresa(true)}>
                    + Agregar Empresa
                  </button>
                ) : (
                  <div style={S.card}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: 'rgba(0,0,0,0.85)', marginBottom: 14 }}>
                      Nueva Empresa de Encomienda
                    </div>
                    <div style={S.formGrid}>
                      <div>
                        <label style={S.label}>Nombre *</label>
                        <input style={S.input} value={formEmpresa.nombre}
                          onChange={e => setFormEmpresa({ ...formEmpresa, nombre: e.target.value })} />
                      </div>
                      <div>
                        <label style={S.label}>Teléfono</label>
                        <input style={S.input} value={formEmpresa.telefono}
                          onChange={e => setFormEmpresa({ ...formEmpresa, telefono: e.target.value })} />
                      </div>
                      <div>
                        <label style={S.label}>Dirección</label>
                        <input style={S.input} value={formEmpresa.direccion}
                          onChange={e => setFormEmpresa({ ...formEmpresa, direccion: e.target.value })} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button style={S.btnPrimary} onClick={guardarEmpresa} disabled={saving}>
                        {saving ? 'Guardando...' : 'Guardar'}
                      </button>
                      <button style={S.btnSecondary} onClick={() => { setShowFormEmpresa(false); setFormEmpresa(EMPTY_EMPRESA) }}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Lista de empresas */}
            {empresas.length === 0 && (
              <div style={S.emptyState}>No hay empresas de encomienda registradas</div>
            )}
            {empresas.map(emp => {
              const zonasEmp = zonas.filter(z => z.empresa_id === emp.id)
              const isExpanded = expandedEmpresa === emp.id

              // Si hay búsqueda, verificar si alguna localidad coincide
              const tieneMatch = busqLower && zonasEmp.some(z => {
                const locs = (z.localidades || '').split(',').map(l => l.trim())
                return locs.some(l => l.toLowerCase().includes(busqLower))
              })

              // Si hay búsqueda y esta empresa no tiene match, opacar
              const opacidad = busqLower && !tieneMatch ? 0.35 : 1

              return (
                <div key={emp.id} style={{ ...S.card, opacity: opacidad, transition: 'opacity 0.3s' }}>
                  <div style={S.empresaHeader} onClick={() => setExpandedEmpresa(isExpanded ? null : emp.id)}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 16, fontWeight: 600, color: 'rgba(0,0,0,0.85)' }}>
                        {tieneMatch && <span style={{ color: '#c8a84b', marginRight: 6 }}>&#9733;</span>}
                        {emp.nombre}
                      </div>
                      <div style={{ display: 'flex', gap: 16, marginTop: 4, flexWrap: 'wrap' }}>
                        {emp.telefono && (
                          <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.4)' }}>
                            Tel: {emp.telefono}
                          </span>
                        )}
                        {emp.direccion && (
                          <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.4)' }}>
                            {emp.direccion}
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.3)', transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                      &#9660;
                    </div>
                  </div>

                  {isExpanded && (
                    <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                      {zonasEmp.length === 0 && (
                        <div style={{ fontSize: 13, color: 'rgba(0,0,0,0.3)', marginBottom: 10 }}>
                          No hay zonas registradas
                        </div>
                      )}
                      {zonasEmp.map(z => {
                        const locs = (z.localidades || '').split(',').map(l => l.trim()).filter(Boolean)
                        return (
                          <div key={z.id} style={{ marginBottom: 12 }}>
                            <div style={S.zonaChip}>{z.zona}</div>
                            <div style={{ marginTop: 6, marginLeft: 4 }}>
                              {locs.map((l, i) => (
                                <span key={i} style={locMatches(l) ? S.localidadHighlight : S.localidad}>
                                  {l}
                                </span>
                              ))}
                            </div>
                          </div>
                        )
                      })}

                      {/* Agregar zona - solo admin */}
                      {isAdmin && (
                        <div style={{ marginTop: 14 }}>
                          {showFormZona === emp.id ? (
                            <div style={{ padding: 14, background: 'rgba(0,0,0,0.02)', borderRadius: 14 }}>
                              <div style={S.formGrid}>
                                <div>
                                  <label style={S.label}>Nombre de zona *</label>
                                  <input style={S.input} value={formZona.nombre}
                                    onChange={e => setFormZona({ ...formZona, nombre: e.target.value })}
                                    placeholder="Ej: Zona Norte" />
                                </div>
                                <div>
                                  <label style={S.label}>Localidades (separadas por coma)</label>
                                  <input style={S.input} value={formZona.localidades}
                                    onChange={e => setFormZona({ ...formZona, localidades: e.target.value })}
                                    placeholder="Ej: Ciudad Quesada, Aguas Zarcas, Florencia" />
                                </div>
                              </div>
                              <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                                <button style={S.btnSmall('#c8a84b', '#fff')} onClick={() => guardarZona(emp.id)} disabled={saving}>
                                  {saving ? 'Guardando...' : 'Guardar Zona'}
                                </button>
                                <button style={S.btnSmall()} onClick={() => { setShowFormZona(null); setFormZona(EMPTY_ZONA) }}>
                                  Cancelar
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button style={S.btnSmall('rgba(200,168,75,0.12)', '#c8a84b')} onClick={() => setShowFormZona(emp.id)}>
                              + Agregar Zona
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* ═══════════ TAB ENVIOS ═══════════ */}
        {tabActivo === 'envios' && (
          <div>
            {/* KPI Cards */}
            <div style={S.kpiRow}>
              <div style={S.kpiCard('#e8a030')}>
                <p style={S.kpiNum('#e8a030')}>{kpiPendientes}</p>
                <p style={S.kpiLabel}>Pendientes</p>
              </div>
              <div style={S.kpiCard('#5b9bd5')}>
                <p style={S.kpiNum('#5b9bd5')}>{kpiTransito}</p>
                <p style={S.kpiLabel}>En tránsito</p>
              </div>
              <div style={S.kpiCard('#4caf7d')}>
                <p style={S.kpiNum('#4caf7d')}>{kpiEntregados}</p>
                <p style={S.kpiLabel}>Entregados (este mes)</p>
              </div>
              <div style={S.kpiCard('#e05252')}>
                <p style={S.kpiNum('#e05252')}>{kpiProblema}</p>
                <p style={S.kpiLabel}>Con problema</p>
              </div>
            </div>

            {/* Filtros envios */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              {FILTROS_ENVIO.map(f => (
                <button key={f.val} style={S.tab(filtroEnvio === f.val)} onClick={() => setFiltroEnvio(f.val)}>
                  {f.label}
                </button>
              ))}
              <div style={{ flex: 1 }} />
              <button style={S.btnPrimary} onClick={() => { setFormEnvio({ ...EMPTY_ENVIO, vendedor: perfil?.nombre || '' }); setEditEnvioId(null); setShowFormEnvio(true) }}>
                + Nuevo Envío
              </button>
            </div>

            <input
              style={S.searchBar}
              placeholder="Buscar por cliente, factura o N° guía..."
              value={busqEnvio}
              onChange={e => setBusqEnvio(e.target.value)}
            />

            {/* Modal formulario envio */}
            {showFormEnvio && (
              <div style={S.overlay} onClick={cerrarFormEnvio}>
                <div style={S.modal} onClick={e => e.stopPropagation()}>
                  <div style={{ fontSize: 17, fontWeight: 600, color: 'rgba(0,0,0,0.85)', marginBottom: 18 }}>
                    {editEnvioId ? 'Editar Envío' : 'Nuevo Envío'}
                  </div>
                  <div style={S.formGrid}>
                    <div>
                      <label style={S.label}>Factura *</label>
                      <input style={S.input} value={formEnvio.factura}
                        onChange={e => setFormEnvio({ ...formEnvio, factura: e.target.value })} />
                    </div>
                    <div>
                      <label style={S.label}>Cliente *</label>
                      <input style={S.input} value={formEnvio.cliente}
                        onChange={e => setFormEnvio({ ...formEnvio, cliente: e.target.value })} />
                    </div>
                    <div>
                      <label style={S.label}>Fecha Factura</label>
                      <input style={S.input} type="date" value={formEnvio.fecha_factura}
                        onChange={e => setFormEnvio({ ...formEnvio, fecha_factura: e.target.value })} />
                    </div>
                    <div>
                      <label style={S.label}>Vendedor</label>
                      <input style={S.input} value={formEnvio.vendedor}
                        onChange={e => setFormEnvio({ ...formEnvio, vendedor: e.target.value })} />
                    </div>
                    <div>
                      <label style={S.label}>Encomienda</label>
                      <input style={S.input} list="enc-empresas-list"
                        placeholder="Escribir o seleccionar encomienda..."
                        value={formEnvio.encomienda}
                        onChange={e => setFormEnvio({ ...formEnvio, encomienda: e.target.value })} />
                      <datalist id="enc-empresas-list">
                        {empresas.map(emp => (
                          <option key={emp.id} value={emp.nombre} />
                        ))}
                      </datalist>
                    </div>
                    <div>
                      <label style={S.label}>N° Guía</label>
                      <input style={S.input} value={formEnvio.numero_guia}
                        onChange={e => setFormEnvio({ ...formEnvio, numero_guia: e.target.value })} />
                    </div>
                    <div>
                      <label style={S.label}>Estado</label>
                      <select style={S.select} value={formEnvio.estado}
                        onChange={e => setFormEnvio({ ...formEnvio, estado: e.target.value })}>
                        {ESTADOS_ENVIO.map(est => (
                          <option key={est.val} value={est.val}>{est.label}</option>
                        ))}
                      </select>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 20 }}>
                      <label style={{ ...S.label, margin: 0 }}>¿Recibió guía?</label>
                      <button style={S.toggle(formEnvio.recibio_guia)}
                        onClick={() => setFormEnvio({ ...formEnvio, recibio_guia: !formEnvio.recibio_guia })}>
                        <span style={S.toggleKnob(formEnvio.recibio_guia)} />
                      </button>
                    </div>
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <label style={S.label}>Observaciones</label>
                    <textarea
                      style={{ ...S.input, minHeight: 70, resize: 'vertical' }}
                      value={formEnvio.observaciones}
                      onChange={e => setFormEnvio({ ...formEnvio, observaciones: e.target.value })}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button style={S.btnPrimary} onClick={guardarEnvio} disabled={saving}>
                      {saving ? 'Guardando...' : editEnvioId ? 'Actualizar' : 'Registrar Envío'}
                    </button>
                    <button style={S.btnSecondary} onClick={cerrarFormEnvio}>Cancelar</button>
                  </div>
                </div>
              </div>
            )}

            {/* Tabla de envios */}
            {loading ? (
              <div style={S.emptyState}>Cargando envíos...</div>
            ) : enviosFiltrados.length === 0 ? (
              <div style={S.emptyState}>No hay envíos para mostrar</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={S.table}>
                  <thead>
                    <tr>
                      <th style={S.th}>Factura</th>
                      <th style={S.th}>Cliente</th>
                      <th style={S.th}>Fecha</th>
                      <th style={S.th}>Vendedor</th>
                      <th style={S.th}>Encomienda</th>
                      <th style={S.th}>N° Guía</th>
                      <th style={S.th}>Guía</th>
                      <th style={S.th}>Estado</th>
                      <th style={S.th}>Observaciones</th>
                      <th style={S.th}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {enviosFiltrados.map(envio => {
                      const est = estadoInfo(envio.estado)
                      return (
                        <tr key={envio.id}>
                          <td style={{ ...S.td, ...S.tdFirst, fontWeight: 600 }}>{envio.factura}</td>
                          <td style={S.td}>{envio.cliente}</td>
                          <td style={S.td}>{envio.fecha_factura}</td>
                          <td style={S.td}>{envio.vendedor}</td>
                          <td style={S.td}>{envio.encomienda || '—'}</td>
                          <td style={S.td}>{envio.numero_guia || '—'}</td>
                          <td style={S.td}>
                            <button style={S.toggle(envio.recibio_guia)} onClick={() => toggleGuia(envio)}>
                              <span style={S.toggleKnob(envio.recibio_guia)} />
                            </button>
                          </td>
                          <td style={S.td}>
                            <span style={S.badge(est.bg, est.color)}>{est.label}</span>
                          </td>
                          <td style={S.td}>
                            <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.5)', maxWidth: 150, display: 'inline-block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {envio.observaciones || '—'}
                            </span>
                          </td>
                          <td style={{ ...S.td, ...S.tdLast }}>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              <button style={S.btnSmall()} onClick={() => iniciarEdicion(envio)}>
                                Editar
                              </button>
                              {envio.estado !== 'entregado' && (
                                <button style={S.btnSmall('rgba(76,175,125,0.15)', '#2e7d50')} onClick={() => marcarEntregado(envio.id)}>
                                  Entregado
                                </button>
                              )}
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
        )}
      </div>
    </div>
  )
}
