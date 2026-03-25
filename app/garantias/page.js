'use client'
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/useAuth'

const GOLD = '#c8a84b'
const BG_GRADIENT = 'linear-gradient(135deg, #e8ecf4, #d5dde8, #e0e7f0, #edf1f7)'
const CARD_BG = 'rgba(255,255,255,0.55)'
const CARD_BLUR = 'blur(24px)'
const BORDER = 'rgba(255,255,255,0.35)'
const TEXT = '#1a1a2e'
const MUTED = '#6b7280'
const WHITE = '#ffffff'

const ESTADO_COLORS = {
  pendiente: '#f97316',
  en_proceso: '#3b82f6',
  esperando_proveedor: '#8b5cf6',
  resuelto: '#22c55e',
  cerrado: '#6b7280',
  cancelado: '#ef4444',
}

const ESTADO_LABELS = {
  pendiente: 'Pendiente',
  en_proceso: 'En Proceso',
  esperando_proveedor: 'Esperando Proveedor',
  resuelto: 'Resuelto',
  cerrado: 'Cerrado',
  cancelado: 'Cancelado',
}

const TIPO_CONFIG = {
  garantia: { color: '#3b82f6', label: '🔧 Garantía' },
  reparacion: { color: '#8b5cf6', label: '🔨 Reparación' },
  cambio: { color: '#f97316', label: '🔄 Cambio' },
}

const PRIORIDAD_COLORS = { alta: '#ef4444', media: '#f97316', baja: '#22c55e' }

const S = {
  card: {
    background: CARD_BG,
    backdropFilter: CARD_BLUR,
    WebkitBackdropFilter: CARD_BLUR,
    border: `1px solid ${BORDER}`,
    borderRadius: 16,
    padding: '20px 24px',
    marginBottom: 16,
  },
  badge: (c) => ({
    background: c + '18',
    color: c,
    border: `1px solid ${c}44`,
    borderRadius: 20,
    padding: '3px 12px',
    fontSize: '0.74em',
    fontWeight: 600,
    whiteSpace: 'nowrap',
    display: 'inline-block',
  }),
  th: {
    textAlign: 'left',
    padding: '10px 14px',
    background: 'rgba(255,255,255,0.3)',
    color: MUTED,
    fontSize: '0.7em',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    borderBottom: '2px solid rgba(0,0,0,0.06)',
    whiteSpace: 'nowrap',
    fontFamily: 'Rubik, sans-serif',
  },
  td: {
    padding: '10px 14px',
    borderBottom: '1px solid rgba(0,0,0,0.04)',
    color: TEXT,
    verticalAlign: 'middle',
    fontSize: '0.84em',
    fontFamily: 'Rubik, sans-serif',
  },
  input: {
    background: 'rgba(255,255,255,0.6)',
    border: '1px solid rgba(0,0,0,0.1)',
    borderRadius: 10,
    padding: '9px 14px',
    color: TEXT,
    fontSize: '0.85em',
    fontFamily: 'Rubik, sans-serif',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  },
  textarea: {
    background: 'rgba(255,255,255,0.6)',
    border: '1px solid rgba(0,0,0,0.1)',
    borderRadius: 10,
    padding: '9px 14px',
    color: TEXT,
    fontSize: '0.85em',
    fontFamily: 'Rubik, sans-serif',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
    minHeight: 80,
    resize: 'vertical',
  },
  select: {
    background: 'rgba(255,255,255,0.6)',
    border: '1px solid rgba(0,0,0,0.1)',
    borderRadius: 10,
    padding: '9px 14px',
    color: TEXT,
    fontSize: '0.85em',
    fontFamily: 'Rubik, sans-serif',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  },
  btn: (c = GOLD) => ({
    background: c,
    color: WHITE,
    border: 'none',
    borderRadius: 10,
    padding: '9px 20px',
    cursor: 'pointer',
    fontSize: '0.84em',
    fontWeight: 600,
    fontFamily: 'Rubik, sans-serif',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
  }),
  btnOutline: {
    background: 'rgba(255,255,255,0.5)',
    color: TEXT,
    border: '1px solid rgba(0,0,0,0.12)',
    borderRadius: 10,
    padding: '8px 16px',
    cursor: 'pointer',
    fontSize: '0.82em',
    fontWeight: 500,
    fontFamily: 'Rubik, sans-serif',
  },
  label: {
    fontSize: '0.78em',
    fontWeight: 600,
    color: MUTED,
    marginBottom: 4,
    display: 'block',
    fontFamily: 'Rubik, sans-serif',
  },
}

function fmtFecha(f) {
  if (!f) return '—'
  return new Date(f).toLocaleDateString('es-CR', { day: '2-digit', month: 'short', year: 'numeric' })
}

function diasAbierto(fecha) {
  if (!fecha) return 0
  return Math.max(0, Math.floor((new Date() - new Date(fecha)) / 86400000))
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function GarantiasPage() {
  const { perfil, loading: authLoading } = useAuth()
  const [vista, setVista] = useState('lista')
  const [casos, setCasos] = useState([])
  const [vendedores, setVendedores] = useState([])
  const [loading, setLoading] = useState(true)
  const [casoSeleccionado, setCasoSeleccionado] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [tabActivo, setTabActivo] = useState('activos')

  useEffect(() => { cargarDatos() }, [])

  async function cargarDatos() {
    setLoading(true)
    const [casosRes, vendedoresRes] = await Promise.all([
      supabase.from('garantias_casos').select('*').order('created_at', { ascending: false }),
      supabase.from('perfiles').select('id, nombre'),
    ])
    if (casosRes.data) setCasos(casosRes.data)
    if (vendedoresRes.data) setVendedores(vendedoresRes.data)
    setLoading(false)
  }

  function abrirDetalle(caso) {
    setCasoSeleccionado(caso)
    setVista('detalle')
  }

  function volverALista() {
    setVista('lista')
    setCasoSeleccionado(null)
    cargarDatos()
  }

  if (authLoading || loading) {
    return (
      <div style={{ background: BG_GRADIENT, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Rubik, sans-serif' }}>
        <div style={{ ...S.card, padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: '1.5em', marginBottom: 8 }}>&#9203;</div>
          <div style={{ color: MUTED, fontSize: '0.9em' }}>Cargando...</div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ background: BG_GRADIENT, minHeight: '100vh', fontFamily: 'Rubik, sans-serif', color: TEXT }}>
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '24px 28px' }}>
        {vista === 'lista' && (
          <VistaLista
            casos={casos}
            busqueda={busqueda}
            setBusqueda={setBusqueda}
            tabActivo={tabActivo}
            setTabActivo={setTabActivo}
            onNuevo={() => setVista('nuevo')}
            onDetalle={abrirDetalle}
          />
        )}
        {vista === 'nuevo' && (
          <VistaNuevo
            vendedores={vendedores}
            perfil={perfil}
            onVolver={volverALista}
            onGuardado={volverALista}
          />
        )}
        {vista === 'detalle' && casoSeleccionado && (
          <VistaDetalle
            caso={casoSeleccionado}
            setCaso={setCasoSeleccionado}
            vendedores={vendedores}
            perfil={perfil}
            onVolver={volverALista}
          />
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// VISTA LISTA
// ═══════════════════════════════════════════════════════════════════════════════

function VistaLista({ casos, busqueda, setBusqueda, tabActivo, setTabActivo, onNuevo, onDetalle }) {
  const activos = casos.filter(c => ['pendiente', 'en_proceso', 'esperando_proveedor'].includes(c.estado))
  const cerrados = casos.filter(c => ['cerrado', 'resuelto'].includes(c.estado))

  const casosFiltrados = useMemo(() => {
    let lista = casos
    if (tabActivo === 'activos') lista = activos
    else if (tabActivo === 'cerrados') lista = cerrados

    if (busqueda.trim()) {
      const q = busqueda.toLowerCase()
      lista = lista.filter(c =>
        (c.numero_caso || '').toLowerCase().includes(q) ||
        (c.cliente_nombre || '').toLowerCase().includes(q) ||
        (c.producto_nombre || '').toLowerCase().includes(q) ||
        (c.vendedor_encargado || '').toLowerCase().includes(q)
      )
    }
    return lista
  }, [casos, tabActivo, busqueda])

  const ahora = new Date()
  const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1)
  const resueltosEsteMes = casos.filter(c => c.estado === 'resuelto' && new Date(c.updated_at || c.created_at) >= inicioMes).length

  const kpis = [
    { label: 'Pendientes', valor: casos.filter(c => c.estado === 'pendiente').length, color: ESTADO_COLORS.pendiente, emoji: '⏳' },
    { label: 'En Proceso', valor: casos.filter(c => c.estado === 'en_proceso').length, color: ESTADO_COLORS.en_proceso, emoji: '⚙' },
    { label: 'Esp. Proveedor', valor: casos.filter(c => c.estado === 'esperando_proveedor').length, color: ESTADO_COLORS.esperando_proveedor, emoji: '📦' },
    { label: 'Resueltos (mes)', valor: resueltosEsteMes, color: ESTADO_COLORS.resuelto, emoji: '✅' },
  ]

  const tabs = [
    { key: 'activos', label: `Casos Activos (${activos.length})` },
    { key: 'cerrados', label: `Historial Cerrados (${cerrados.length})` },
    { key: 'todos', label: `Todos (${casos.length})` },
  ]

  return (
    <>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: '1.5em', fontWeight: 700, margin: 0, fontFamily: 'Rubik, sans-serif' }}>
          🔄 Devoluciones y Garantías
        </h1>
        <button style={S.btn(GOLD)} onClick={onNuevo}>+ Nuevo Caso</button>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
        {kpis.map(k => (
          <div key={k.label} style={{ ...S.card, textAlign: 'center', borderLeft: `4px solid ${k.color}` }}>
            <div style={{ fontSize: '1.6em', marginBottom: 2 }}>{k.emoji}</div>
            <div style={{ fontSize: '1.8em', fontWeight: 700, color: k.color }}>{k.valor}</div>
            <div style={{ fontSize: '0.76em', color: MUTED, marginTop: 2 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTabActivo(t.key)}
            style={{
              background: tabActivo === t.key ? GOLD : 'rgba(255,255,255,0.4)',
              color: tabActivo === t.key ? WHITE : TEXT,
              border: tabActivo === t.key ? 'none' : '1px solid rgba(0,0,0,0.08)',
              borderRadius: 10,
              padding: '7px 18px',
              cursor: 'pointer',
              fontSize: '0.82em',
              fontWeight: 600,
              fontFamily: 'Rubik, sans-serif',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div style={{ marginBottom: 16 }}>
        <input
          style={{ ...S.input, maxWidth: 380 }}
          placeholder="Buscar por caso, cliente, producto..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
        />
      </div>

      {/* Table */}
      <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={S.th}>Caso</th>
                <th style={S.th}>Cliente</th>
                <th style={S.th}>Producto</th>
                <th style={S.th}>Tipo</th>
                <th style={S.th}>Estado</th>
                <th style={S.th}>Vendedor</th>
                <th style={S.th}>Fecha</th>
                <th style={S.th}></th>
              </tr>
            </thead>
            <tbody>
              {casosFiltrados.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ ...S.td, textAlign: 'center', color: MUTED, padding: 40 }}>
                    No se encontraron casos
                  </td>
                </tr>
              )}
              {casosFiltrados.map(c => {
                const tipo = TIPO_CONFIG[c.tipo_proceso] || { color: MUTED, label: c.tipo_proceso }
                const estadoColor = ESTADO_COLORS[c.estado] || MUTED
                return (
                  <tr
                    key={c.id}
                    onClick={() => onDetalle(c)}
                    style={{ cursor: 'pointer', transition: 'background 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(200,168,75,0.06)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ ...S.td, fontWeight: 700, color: GOLD }}>#{c.numero_caso}</td>
                    <td style={S.td}>{c.cliente_nombre || '—'}</td>
                    <td style={S.td}>{c.producto_nombre || '—'}</td>
                    <td style={S.td}><span style={S.badge(tipo.color)}>{tipo.label}</span></td>
                    <td style={S.td}><span style={S.badge(estadoColor)}>{ESTADO_LABELS[c.estado] || c.estado}</span></td>
                    <td style={S.td}>{c.vendedor_encargado || '—'}</td>
                    <td style={S.td}>{fmtFecha(c.created_at)}</td>
                    <td style={S.td}>
                      <button style={S.btnOutline} onClick={e => { e.stopPropagation(); onDetalle(c) }}>Ver</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// VISTA NUEVO
// ═══════════════════════════════════════════════════════════════════════════════

function VistaNuevo({ vendedores, perfil, onVolver, onGuardado }) {
  const [guardando, setGuardando] = useState(false)
  const [form, setForm] = useState({
    cliente_nombre: '',
    cliente_factura: '',
    cliente_telefono: '',
    producto_codigo: '',
    producto_nombre: '',
    fecha_recepcion: '',
    motivo_dano: '',
    tipo_proceso: 'garantia',
    vendedor_encargado: '',
    proveedor: '',
    prioridad: 'media',
    observaciones: '',
  })

  function set(field, val) { setForm(prev => ({ ...prev, [field]: val })) }

  async function guardar() {
    if (!form.cliente_nombre || !form.producto_nombre || !form.fecha_recepcion || !form.motivo_dano) {
      alert('Completa los campos obligatorios: nombre del cliente, producto, fecha de recepción y motivo del daño.')
      return
    }

    setGuardando(true)
    try {
      // Generate numero_caso
      const { count } = await supabase.from('garantias_casos').select('*', { count: 'exact', head: true })
      const seq = (count || 0) + 1
      const numero_caso = 'DG-' + String(seq).padStart(3, '0')

      const creador = perfil?.nombre || 'Sistema'
      const timeline = [{
        fecha: new Date().toISOString(),
        texto: `Caso creado por ${creador}`,
        tipo: 'creacion',
      }]

      const registro = {
        numero_caso,
        cliente_nombre: form.cliente_nombre,
        cliente_factura: form.cliente_factura || null,
        cliente_telefono: form.cliente_telefono || null,
        producto_codigo: form.producto_codigo || null,
        producto_nombre: form.producto_nombre,
        fecha_recepcion: form.fecha_recepcion,
        motivo_dano: form.motivo_dano,
        tipo_proceso: form.tipo_proceso,
        vendedor_encargado: form.vendedor_encargado || null,
        proveedor: form.proveedor || null,
        prioridad: form.prioridad,
        observaciones: form.observaciones || null,
        estado: 'pendiente',
        creado_por: perfil?.nombre || 'Sistema',
        creado_en: new Date().toISOString(),
        timeline,
      }

      const { error } = await supabase.from('garantias_casos').insert(registro)
      if (error) {
        console.error(error)
        alert('Error al guardar: ' + error.message)
      } else {
        onGuardado()
      }
    } catch (e) {
      console.error(e)
      alert('Error inesperado')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <>
      <button style={{ ...S.btnOutline, marginBottom: 16 }} onClick={onVolver}>
        ← Volver a lista
      </button>
      <h2 style={{ fontSize: '1.3em', fontWeight: 700, marginBottom: 20, fontFamily: 'Rubik, sans-serif' }}>
        Nuevo Caso de Garantía / Devolución
      </h2>

      {/* Datos del Cliente */}
      <div style={S.card}>
        <h3 style={{ fontSize: '0.95em', fontWeight: 700, marginBottom: 14, color: GOLD, fontFamily: 'Rubik, sans-serif' }}>
          Datos del Cliente
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
          <div>
            <label style={S.label}>Nombre del cliente *</label>
            <input style={S.input} value={form.cliente_nombre} onChange={e => set('cliente_nombre', e.target.value)} placeholder="Nombre completo" />
          </div>
          <div>
            <label style={S.label}>Número de factura</label>
            <input style={S.input} value={form.cliente_factura} onChange={e => set('cliente_factura', e.target.value)} placeholder="Factura" />
          </div>
          <div>
            <label style={S.label}>Teléfono</label>
            <input style={S.input} value={form.cliente_telefono} onChange={e => set('cliente_telefono', e.target.value)} placeholder="Teléfono" />
          </div>
        </div>
      </div>

      {/* Producto y Daño */}
      <div style={S.card}>
        <h3 style={{ fontSize: '0.95em', fontWeight: 700, marginBottom: 14, color: GOLD, fontFamily: 'Rubik, sans-serif' }}>
          Producto y Daño
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <div>
            <label style={S.label}>Código de producto</label>
            <input style={S.input} value={form.producto_codigo} onChange={e => set('producto_codigo', e.target.value)} placeholder="Código" />
          </div>
          <div>
            <label style={S.label}>Nombre del producto *</label>
            <input style={S.input} value={form.producto_nombre} onChange={e => set('producto_nombre', e.target.value)} placeholder="Producto" />
          </div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={S.label}>Fecha de recepción *</label>
          <input style={{ ...S.input, maxWidth: 220 }} type="date" value={form.fecha_recepcion} onChange={e => set('fecha_recepcion', e.target.value)} />
        </div>
        <div>
          <label style={S.label}>Motivo del daño *</label>
          <textarea style={S.textarea} value={form.motivo_dano} onChange={e => set('motivo_dano', e.target.value)} placeholder="Descripción del daño o motivo de devolución..." />
        </div>
      </div>

      {/* Proceso */}
      <div style={S.card}>
        <h3 style={{ fontSize: '0.95em', fontWeight: 700, marginBottom: 14, color: GOLD, fontFamily: 'Rubik, sans-serif' }}>
          Proceso
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 14 }}>
          {/* Tipo */}
          <div>
            <label style={S.label}>Tipo de proceso</label>
            <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
              {[
                { val: 'garantia', label: 'Garantía' },
                { val: 'reparacion', label: 'Reparación' },
                { val: 'cambio', label: 'Cambio' },
              ].map(t => (
                <label key={t.val} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.84em', cursor: 'pointer', fontFamily: 'Rubik, sans-serif' }}>
                  <input type="radio" name="tipo_proceso" value={t.val} checked={form.tipo_proceso === t.val} onChange={() => set('tipo_proceso', t.val)} />
                  {t.label}
                </label>
              ))}
            </div>
          </div>
          {/* Vendedor */}
          <div>
            <label style={S.label}>Vendedor encargado</label>
            <input style={S.input} value={form.vendedor_encargado} onChange={e => set('vendedor_encargado', e.target.value)} placeholder="Nombre del vendedor" />
          </div>
          {/* Proveedor */}
          <div>
            <label style={S.label}>Proveedor</label>
            <input style={S.input} value={form.proveedor} onChange={e => set('proveedor', e.target.value)} placeholder="Proveedor" />
          </div>
        </div>
        {/* Prioridad */}
        <div style={{ marginBottom: 14 }}>
          <label style={S.label}>Prioridad</label>
          <div style={{ display: 'flex', gap: 14, marginTop: 6 }}>
            {[
              { val: 'alta', label: 'Alta', color: '#ef4444' },
              { val: 'media', label: 'Media', color: '#f97316' },
              { val: 'baja', label: 'Baja', color: '#22c55e' },
            ].map(p => (
              <label key={p.val} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.84em', cursor: 'pointer', fontFamily: 'Rubik, sans-serif' }}>
                <input type="radio" name="prioridad" value={p.val} checked={form.prioridad === p.val} onChange={() => set('prioridad', p.val)} />
                <span style={{ color: p.color, fontWeight: 600 }}>{p.label}</span>
              </label>
            ))}
          </div>
        </div>
        {/* Observaciones */}
        <div>
          <label style={S.label}>Observaciones</label>
          <textarea style={S.textarea} value={form.observaciones} onChange={e => set('observaciones', e.target.value)} placeholder="Notas adicionales..." />
        </div>
      </div>

      {/* Save */}
      <div style={{ display: 'flex', gap: 12 }}>
        <button style={S.btn(GOLD)} onClick={guardar} disabled={guardando}>
          {guardando ? 'Guardando...' : '💾 Guardar Caso'}
        </button>
        <button style={S.btnOutline} onClick={onVolver}>Cancelar</button>
      </div>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// VISTA DETALLE
// ═══════════════════════════════════════════════════════════════════════════════

function VistaDetalle({ caso, setCaso, vendedores, perfil, onVolver }) {
  const [editando, setEditando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [nuevaActualizacion, setNuevaActualizacion] = useState('')
  const [nuevoEstado, setNuevoEstado] = useState(caso.estado)

  // Editable proveedor fields
  const [respuestaProveedor, setRespuestaProveedor] = useState(caso.respuesta_proveedor || '')
  const [boletaDevolucion, setBoletaDevolucion] = useState(caso.boleta_devolucion || '')
  const [fechaRetiroProveedor, setFechaRetiroProveedor] = useState(caso.fecha_retiro_proveedor || '')
  const [fechaRecibeMaterial, setFechaRecibeMaterial] = useState(caso.fecha_recibe_material || '')
  const [fechaClienteRetira, setFechaClienteRetira] = useState(caso.fecha_cliente_retira || '')

  const dias = diasAbierto(caso.created_at)
  const tipo = TIPO_CONFIG[caso.tipo_proceso] || { color: MUTED, label: caso.tipo_proceso }
  const estadoColor = ESTADO_COLORS[caso.estado] || MUTED
  const timeline = Array.isArray(caso.timeline) ? caso.timeline : []
  const prioridadColor = PRIORIDAD_COLORS[caso.prioridad] || MUTED

  async function guardarCampoProveedor(campo, valor, labelTexto) {
    setGuardando(true)
    const update = { [campo]: valor || null }
    const nuevoTimeline = [
      ...timeline,
      { fecha: new Date().toISOString(), texto: `${labelTexto} actualizado por ${perfil?.nombre || 'Sistema'}`, tipo: 'actualizacion' },
    ]
    update.timeline = nuevoTimeline
    const { data, error } = await supabase.from('garantias_casos').update(update).eq('id', caso.id).select().single()
    if (!error && data) setCaso(data)
    else if (error) alert('Error: ' + error.message)
    setGuardando(false)
  }

  async function agregarActualizacion() {
    if (!nuevaActualizacion.trim()) return
    setGuardando(true)
    const nuevoTimeline = [
      ...timeline,
      { fecha: new Date().toISOString(), texto: nuevaActualizacion, tipo: 'actualizacion' },
    ]
    const update = { timeline: nuevoTimeline }
    if (nuevoEstado !== caso.estado) {
      update.estado = nuevoEstado
      nuevoTimeline.push({
        fecha: new Date().toISOString(),
        texto: `Estado cambiado a "${ESTADO_LABELS[nuevoEstado]}" por ${perfil?.nombre || 'Sistema'}`,
        tipo: 'cambio_estado',
      })
      update.timeline = nuevoTimeline
    }
    const { data, error } = await supabase.from('garantias_casos').update(update).eq('id', caso.id).select().single()
    if (!error && data) {
      setCaso(data)
      setNuevaActualizacion('')
      setNuevoEstado(data.estado)
    } else if (error) alert('Error: ' + error.message)
    setGuardando(false)
  }

  async function cerrarCaso() {
    if (!confirm('¿Seguro que deseas cerrar este caso?')) return
    setGuardando(true)
    const nuevoTimeline = [
      ...timeline,
      { fecha: new Date().toISOString(), texto: `Caso cerrado por ${perfil?.nombre || 'Sistema'}`, tipo: 'cierre' },
    ]
    const { data, error } = await supabase.from('garantias_casos').update({
      estado: 'cerrado',
      cerrado_en: new Date().toISOString(),
      timeline: nuevoTimeline,
    }).eq('id', caso.id).select().single()
    if (!error && data) setCaso(data)
    else if (error) alert('Error: ' + error.message)
    setGuardando(false)
  }

  async function cancelarCaso() {
    if (!confirm('¿Seguro que deseas cancelar este caso? Esta acción no se puede deshacer.')) return
    setGuardando(true)
    const nuevoTimeline = [
      ...timeline,
      { fecha: new Date().toISOString(), texto: `Caso cancelado por ${perfil?.nombre || 'Sistema'}`, tipo: 'cancelacion' },
    ]
    const { data, error } = await supabase.from('garantias_casos').update({
      estado: 'cancelado',
      timeline: nuevoTimeline,
    }).eq('id', caso.id).select().single()
    if (!error && data) setCaso(data)
    else if (error) alert('Error: ' + error.message)
    setGuardando(false)
  }

  // Editable inline fields for detalle
  const [editForm, setEditForm] = useState({
    cliente_nombre: caso.cliente_nombre || '',
    cliente_factura: caso.cliente_factura || '',
    cliente_telefono: caso.cliente_telefono || '',
    producto_nombre: caso.producto_nombre || '',
    producto_codigo: caso.producto_codigo || '',
    proveedor: caso.proveedor || '',
    motivo_dano: caso.motivo_dano || '',
    vendedor_encargado: caso.vendedor_encargado || '',
    prioridad: caso.prioridad || 'media',
    observaciones: caso.observaciones || '',
  })

  async function guardarEdicion() {
    setGuardando(true)
    const nuevoTimeline = [
      ...timeline,
      { fecha: new Date().toISOString(), texto: `Caso editado por ${perfil?.nombre || 'Sistema'}`, tipo: 'edicion' },
    ]
    const { data, error } = await supabase.from('garantias_casos').update({
      ...editForm,
      timeline: nuevoTimeline,
    }).eq('id', caso.id).select().single()
    if (!error && data) {
      setCaso(data)
      setEditando(false)
    } else if (error) alert('Error: ' + error.message)
    setGuardando(false)
  }

  return (
    <>
      <button style={{ ...S.btnOutline, marginBottom: 16 }} onClick={onVolver}>
        ← Volver a lista
      </button>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h2 style={{ fontSize: '1.35em', fontWeight: 700, margin: 0, color: GOLD, fontFamily: 'Rubik, sans-serif' }}>
            #{caso.numero_caso}
          </h2>
          <span style={S.badge(estadoColor)}>{ESTADO_LABELS[caso.estado] || caso.estado}</span>
          <span style={S.badge(tipo.color)}>{tipo.label}</span>
          {caso.prioridad && (
            <span style={S.badge(prioridadColor)}>{caso.prioridad.charAt(0).toUpperCase() + caso.prioridad.slice(1)}</span>
          )}
          <span style={{ fontSize: '0.82em', color: MUTED }}>{dias} días abierto</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {!editando && (
            <button style={S.btn('#3b82f6')} onClick={() => setEditando(true)}>
              ✏ Editar
            </button>
          )}
          {caso.estado !== 'cerrado' && caso.estado !== 'cancelado' && (
            <button style={S.btn('#22c55e')} onClick={cerrarCaso} disabled={guardando}>
              ✅ Cerrar Caso
            </button>
          )}
        </div>
      </div>

      {/* Edit mode */}
      {editando && (
        <div style={{ ...S.card, borderLeft: `4px solid #3b82f6`, marginBottom: 20 }}>
          <h3 style={{ fontSize: '0.95em', fontWeight: 700, marginBottom: 14, color: '#3b82f6', fontFamily: 'Rubik, sans-serif' }}>
            Editando caso
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div>
              <label style={S.label}>Cliente</label>
              <input style={S.input} value={editForm.cliente_nombre} onChange={e => setEditForm(p => ({ ...p, cliente_nombre: e.target.value }))} />
            </div>
            <div>
              <label style={S.label}>Factura</label>
              <input style={S.input} value={editForm.cliente_factura} onChange={e => setEditForm(p => ({ ...p, cliente_factura: e.target.value }))} />
            </div>
            <div>
              <label style={S.label}>Teléfono</label>
              <input style={S.input} value={editForm.cliente_telefono} onChange={e => setEditForm(p => ({ ...p, cliente_telefono: e.target.value }))} />
            </div>
            <div>
              <label style={S.label}>Producto</label>
              <input style={S.input} value={editForm.producto_nombre} onChange={e => setEditForm(p => ({ ...p, producto_nombre: e.target.value }))} />
            </div>
            <div>
              <label style={S.label}>Código</label>
              <input style={S.input} value={editForm.producto_codigo} onChange={e => setEditForm(p => ({ ...p, producto_codigo: e.target.value }))} />
            </div>
            <div>
              <label style={S.label}>Proveedor</label>
              <input style={S.input} value={editForm.proveedor} onChange={e => setEditForm(p => ({ ...p, proveedor: e.target.value }))} />
            </div>
            <div>
              <label style={S.label}>Vendedor</label>
              <input style={S.input} value={editForm.vendedor_encargado} onChange={e => setEditForm(p => ({ ...p, vendedor_encargado: e.target.value }))} placeholder="Nombre del vendedor" />
            </div>
            <div>
              <label style={S.label}>Prioridad</label>
              <select style={S.select} value={editForm.prioridad} onChange={e => setEditForm(p => ({ ...p, prioridad: e.target.value }))}>
                <option value="alta">Alta</option>
                <option value="media">Media</option>
                <option value="baja">Baja</option>
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={S.label}>Motivo del daño</label>
            <textarea style={S.textarea} value={editForm.motivo_dano} onChange={e => setEditForm(p => ({ ...p, motivo_dano: e.target.value }))} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={S.label}>Observaciones</label>
            <textarea style={S.textarea} value={editForm.observaciones} onChange={e => setEditForm(p => ({ ...p, observaciones: e.target.value }))} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={S.btn('#3b82f6')} onClick={guardarEdicion} disabled={guardando}>
              {guardando ? 'Guardando...' : 'Guardar cambios'}
            </button>
            <button style={S.btnOutline} onClick={() => setEditando(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Two column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>
        {/* LEFT column */}
        <div>
          {/* Datos del Cliente */}
          <div style={S.card}>
            <h3 style={{ fontSize: '0.9em', fontWeight: 700, marginBottom: 12, color: GOLD, fontFamily: 'Rubik, sans-serif' }}>
              Datos del Cliente
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div><span style={S.label}>Nombre</span><div style={{ fontSize: '0.88em' }}>{caso.cliente_nombre || '—'}</div></div>
              <div><span style={S.label}>Teléfono</span><div style={{ fontSize: '0.88em' }}>{caso.cliente_telefono || '—'}</div></div>
              <div><span style={S.label}>Factura</span><div style={{ fontSize: '0.88em' }}>{caso.cliente_factura || '—'}</div></div>
              <div><span style={S.label}>Fecha recepción</span><div style={{ fontSize: '0.88em' }}>{fmtFecha(caso.fecha_recepcion)}</div></div>
            </div>
          </div>

          {/* Producto */}
          <div style={S.card}>
            <h3 style={{ fontSize: '0.9em', fontWeight: 700, marginBottom: 12, color: GOLD, fontFamily: 'Rubik, sans-serif' }}>
              Producto
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div><span style={S.label}>Nombre</span><div style={{ fontSize: '0.88em' }}>{caso.producto_nombre || '—'}</div></div>
              <div><span style={S.label}>Código</span><div style={{ fontSize: '0.88em' }}>{caso.producto_codigo || '—'}</div></div>
              <div><span style={S.label}>Proveedor</span><div style={{ fontSize: '0.88em' }}>{caso.proveedor || '—'}</div></div>
            </div>
          </div>

          {/* Motivo de Daño */}
          <div style={S.card}>
            <h3 style={{ fontSize: '0.9em', fontWeight: 700, marginBottom: 12, color: GOLD, fontFamily: 'Rubik, sans-serif' }}>
              Motivo del Daño
            </h3>
            <p style={{ fontSize: '0.88em', lineHeight: 1.5, margin: 0 }}>{caso.motivo_dano || '—'}</p>
            <div style={{ marginTop: 12, padding: '16px', background: 'rgba(0,0,0,0.03)', borderRadius: 10, textAlign: 'center', color: MUTED, fontSize: '0.8em' }}>
              📷 Fotos del daño (próximamente)
            </div>
          </div>

          {/* Respuesta del Proveedor */}
          <div style={S.card}>
            <h3 style={{ fontSize: '0.9em', fontWeight: 700, marginBottom: 12, color: GOLD, fontFamily: 'Rubik, sans-serif' }}>
              Respuesta del Proveedor
            </h3>
            {[
              { campo: 'respuesta_proveedor', label: 'Respuesta del proveedor', val: respuestaProveedor, setVal: setRespuestaProveedor, type: 'text' },
              { campo: 'boleta_devolucion', label: 'Boleta de devolución', val: boletaDevolucion, setVal: setBoletaDevolucion, type: 'text' },
              { campo: 'fecha_retiro_proveedor', label: 'Fecha retiro proveedor', val: fechaRetiroProveedor, setVal: setFechaRetiroProveedor, type: 'date' },
              { campo: 'fecha_recibe_material', label: 'Fecha recibe material', val: fechaRecibeMaterial, setVal: setFechaRecibeMaterial, type: 'date' },
              { campo: 'fecha_cliente_retira', label: 'Fecha cliente retira', val: fechaClienteRetira, setVal: setFechaClienteRetira, type: 'date' },
            ].map(f => (
              <div key={f.campo} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={S.label}>{f.label}</label>
                  <input
                    style={S.input}
                    type={f.type}
                    value={f.val}
                    onChange={e => f.setVal(e.target.value)}
                  />
                </div>
                <button
                  style={{ ...S.btn(GOLD), marginTop: 18, padding: '8px 12px', fontSize: '0.78em' }}
                  onClick={() => guardarCampoProveedor(f.campo, f.val, f.label)}
                  disabled={guardando}
                >
                  💾
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT column */}
        <div>
          {/* Línea de Tiempo */}
          <div style={S.card}>
            <h3 style={{ fontSize: '0.9em', fontWeight: 700, marginBottom: 16, color: GOLD, fontFamily: 'Rubik, sans-serif' }}>
              Línea de Tiempo
            </h3>
            {timeline.length === 0 && (
              <div style={{ color: MUTED, fontSize: '0.84em', textAlign: 'center', padding: 20 }}>
                Sin actividad registrada
              </div>
            )}
            <div style={{ position: 'relative', paddingLeft: 28 }}>
              {/* Vertical line */}
              {timeline.length > 0 && (
                <div style={{
                  position: 'absolute',
                  left: 8,
                  top: 4,
                  bottom: 4,
                  width: 2,
                  background: `linear-gradient(to bottom, ${GOLD}, ${GOLD}44)`,
                  borderRadius: 2,
                }} />
              )}
              {[...timeline].reverse().map((entry, i) => {
                const isPending = entry.tipo === 'pendiente'
                return (
                  <div key={i} style={{ marginBottom: 18, position: 'relative', opacity: isPending ? 0.4 : 1 }}>
                    {/* Dot */}
                    <div style={{
                      position: 'absolute',
                      left: -24,
                      top: 3,
                      width: 12,
                      height: 12,
                      borderRadius: '50%',
                      background: isPending ? MUTED : GOLD,
                      border: `2px solid ${isPending ? '#d1d5db' : GOLD}`,
                      boxShadow: isPending ? 'none' : `0 0 6px ${GOLD}44`,
                    }} />
                    <div style={{ fontSize: '0.72em', color: MUTED, marginBottom: 2 }}>
                      {fmtFecha(entry.fecha)}
                      {entry.fecha && (
                        <span style={{ marginLeft: 6 }}>
                          {new Date(entry.fecha).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.84em', lineHeight: 1.4 }}>{entry.texto}</div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Agregar Actualización */}
          {caso.estado !== 'cerrado' && caso.estado !== 'cancelado' && (
            <div style={S.card}>
              <h3 style={{ fontSize: '0.9em', fontWeight: 700, marginBottom: 12, color: GOLD, fontFamily: 'Rubik, sans-serif' }}>
                Agregar Actualización
              </h3>
              <textarea
                style={{ ...S.textarea, marginBottom: 10 }}
                value={nuevaActualizacion}
                onChange={e => setNuevaActualizacion(e.target.value)}
                placeholder="Escribe una actualización..."
              />
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <select style={{ ...S.select, flex: 1 }} value={nuevoEstado} onChange={e => setNuevoEstado(e.target.value)}>
                  {Object.entries(ESTADO_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
                <button style={S.btn(GOLD)} onClick={agregarActualizacion} disabled={guardando}>
                  {guardando ? '...' : 'Agregar'}
                </button>
              </div>
            </div>
          )}

          {/* Acciones */}
          {caso.estado !== 'cancelado' && caso.estado !== 'cerrado' && (
            <div style={S.card}>
              <h3 style={{ fontSize: '0.9em', fontWeight: 700, marginBottom: 12, color: GOLD, fontFamily: 'Rubik, sans-serif' }}>
                Acciones
              </h3>
              <button
                style={S.btn('#ef4444')}
                onClick={cancelarCaso}
                disabled={guardando}
              >
                ❌ Cancelar Caso
              </button>
            </div>
          )}

          {/* Observaciones */}
          {caso.observaciones && (
            <div style={S.card}>
              <h3 style={{ fontSize: '0.9em', fontWeight: 700, marginBottom: 8, color: GOLD, fontFamily: 'Rubik, sans-serif' }}>
                Observaciones
              </h3>
              <p style={{ fontSize: '0.86em', color: MUTED, margin: 0, lineHeight: 1.5 }}>{caso.observaciones}</p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
