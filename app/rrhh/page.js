'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/useAuth'

const GOLD = '#c8a84b'
const BG = 'linear-gradient(135deg, #e8ecf4 0%, #d5dde8 30%, #e0e7f0 60%, #edf1f7 100%)'
const CARD_BG = 'rgba(255,255,255,0.55)'
const BLUR = 'blur(24px) saturate(1.8)'
const BORDER = '1px solid rgba(255,255,255,0.6)'
const SHADOW = '0 4px 30px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.8)'
const TEXT = 'rgba(0,0,0,0.85)'
const MUTED = 'rgba(0,0,0,0.5)'

const TIPO_MAP = {
  vacaciones: { label: 'Vacaciones', color: '#3b82f6' },
  permiso_sin_goce: { label: 'Permiso sin goce', color: '#8b5cf6' },
  cita_medica: { label: 'Cita médica', color: '#06b6d4' },
  permiso_urgente: { label: 'Permiso urgente', color: '#ef4444' },
}
const ESTADO_MAP = {
  pendiente: { label: 'Pendiente', color: '#f97316' },
  aprobado: { label: 'Aprobado', color: '#22c55e' },
  rechazado: { label: 'Rechazado', color: '#ef4444' },
  cancelado: { label: 'Cancelado', color: '#6b7280' },
}

const S = {
  card: { background: CARD_BG, backdropFilter: BLUR, WebkitBackdropFilter: BLUR, border: BORDER, borderRadius: 20, padding: '20px 24px', boxShadow: SHADOW, marginBottom: 14 },
  badge: (c) => ({ background: c + '18', color: c, border: `1px solid ${c}44`, borderRadius: 20, padding: '3px 12px', fontSize: '0.74em', fontWeight: 600, display: 'inline-block' }),
  btn: (c, outline) => ({ background: outline ? 'transparent' : c, color: outline ? c : '#fff', border: `1.5px solid ${c}`, borderRadius: 12, padding: '7px 18px', fontSize: '0.82em', fontWeight: 600, cursor: 'pointer', transition: 'all .2s' }),
  input: { width: '100%', padding: '10px 14px', borderRadius: 12, border: '1px solid rgba(0,0,0,0.12)', background: 'rgba(255,255,255,0.7)', fontSize: '0.9em', fontFamily: 'Rubik', color: TEXT, outline: 'none', boxSizing: 'border-box' },
}

function calcDias(ini, fin) {
  if (!ini || !fin) return 0
  let d = new Date(ini + 'T00:00:00'), end = new Date(fin + 'T00:00:00'), count = 0
  while (d <= end) { const dow = d.getDay(); if (dow >= 1 && dow <= 6) count++; d.setDate(d.getDate() + 1) }
  return count
}

function calcHoras(hi, hf) {
  if (!hi || !hf) return 0
  const [h1, m1] = hi.split(':').map(Number)
  const [h2, m2] = hf.split(':').map(Number)
  const diff = (h2 * 60 + m2) - (h1 * 60 + m1)
  return diff > 0 ? Math.round(diff / 60 * 10) / 10 : 0
}

const FORM_VACIO = { empleado_nombre: '', puesto: '', tipo: 'vacaciones', motivo: '', fecha_inicio: '', fecha_fin: '', observaciones: '', modalidad: 'dia_completo', hora_inicio: '', hora_fin: '' }

export default function RRHHPage() {
  const { perfil, loading: authLoad } = useAuth()
  const [sol, setSol] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('solicitudes')
  const [filtro, setFiltro] = useState('activas')
  const [busq, setBusq] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ ...FORM_VACIO })
  const [editandoId, setEditandoId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [calMes, setCalMes] = useState(() => { const n = new Date(); return { y: n.getFullYear(), m: n.getMonth() } })

  const cargar = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('rrhh_solicitudes').select('*').order('creado_en', { ascending: false })
    setSol(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const diasCalc = useMemo(() => calcDias(form.fecha_inicio, form.fecha_fin), [form.fecha_inicio, form.fecha_fin])
  const horasCalc = useMemo(() => calcHoras(form.hora_inicio, form.hora_fin), [form.hora_inicio, form.hora_fin])

  const ahora = new Date()
  const mesActual = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}`
  const kpis = useMemo(() => ({
    pendientes: sol.filter(s => s.estado === 'pendiente').length,
    aprobadas: sol.filter(s => s.estado === 'aprobado' && s.fecha_aprobacion?.startsWith(mesActual)).length,
    rechazadas: sol.filter(s => s.estado === 'rechazado').length,
    total: sol.length,
  }), [sol, mesActual])

  const filtered = useMemo(() => {
    let f = sol
    if (filtro === 'activas') f = f.filter(s => ['pendiente', 'aprobado'].includes(s.estado))
    else if (filtro === 'historial') f = f.filter(s => ['rechazado', 'cancelado'].includes(s.estado))
    if (busq) f = f.filter(s => s.empleado_nombre?.toLowerCase().includes(busq.toLowerCase()))
    return f
  }, [sol, filtro, busq])

  function iniciarEdicion(s) {
    setForm({
      empleado_nombre: s.empleado_nombre || '',
      puesto: s.puesto || '',
      tipo: s.tipo || 'vacaciones',
      motivo: s.motivo || '',
      fecha_inicio: s.fecha_inicio || '',
      fecha_fin: s.fecha_fin || '',
      observaciones: s.observaciones || '',
      modalidad: s.modalidad || 'dia_completo',
      hora_inicio: s.hora_inicio || '',
      hora_fin: s.hora_fin || '',
    })
    setEditandoId(s.id)
    setShowForm(true)
  }

  function cancelarForm() {
    setForm({ ...FORM_VACIO })
    setEditandoId(null)
    setShowForm(false)
  }

  async function guardar() {
    const esPorHoras = form.modalidad === 'por_horas'
    if (!form.empleado_nombre || !form.fecha_inicio) return
    if (!esPorHoras && !form.fecha_fin) return
    if (esPorHoras && (!form.hora_inicio || !form.hora_fin)) return
    setSaving(true)
    const now = new Date().toISOString()

    if (editandoId) {
      // Editar existente
      const sol_actual = sol.find(s => s.id === editandoId)
      const tl = [...(sol_actual?.timeline || []), { accion: 'Editada', fecha: now, usuario: perfil?.nombre || 'Sistema' }]
      const datos = {
        ...form,
        dias_totales: esPorHoras ? 0 : diasCalc,
        horas_totales: esPorHoras ? horasCalc : null,
        fecha_fin: esPorHoras ? form.fecha_inicio : form.fecha_fin,
        hora_inicio: esPorHoras ? form.hora_inicio : null,
        hora_fin: esPorHoras ? form.hora_fin : null,
        timeline: tl,
      }
      await supabase.from('rrhh_solicitudes').update(datos).eq('id', editandoId)
    } else {
      // Nueva solicitud
      const nuevo = {
        ...form,
        dias_totales: esPorHoras ? 0 : diasCalc,
        horas_totales: esPorHoras ? horasCalc : null,
        fecha_fin: esPorHoras ? form.fecha_inicio : form.fecha_fin,
        hora_inicio: esPorHoras ? form.hora_inicio : null,
        hora_fin: esPorHoras ? form.hora_fin : null,
        estado: 'pendiente',
        creado_por: perfil?.nombre || 'Sistema', creado_en: now,
        timeline: [{ accion: 'Solicitud creada', fecha: now, usuario: perfil?.nombre || 'Sistema' }],
      }
      await supabase.from('rrhh_solicitudes').insert([nuevo])
    }
    cancelarForm()
    setSaving(false)
    cargar()
  }

  async function eliminar(s) {
    if (!confirm(`¿Eliminar solicitud de ${s.empleado_nombre}?`)) return
    await supabase.from('rrhh_solicitudes').delete().eq('id', s.id)
    cargar()
  }

  async function cambiarEstado(s, nuevoEstado) {
    const now = new Date().toISOString()
    const tl = [...(s.timeline || []), { accion: nuevoEstado === 'aprobado' ? 'Aprobada' : 'Rechazada', fecha: now, usuario: perfil?.nombre || 'Admin' }]
    await supabase.from('rrhh_solicitudes').update({
      estado: nuevoEstado, aprobado_por: perfil?.nombre || 'Admin', fecha_aprobacion: now,
      timeline: tl,
    }).eq('id', s.id)
    cargar()
  }

  // --- CALENDAR HELPERS ---
  const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
  const diasSem = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
  const calDays = useMemo(() => {
    const first = new Date(calMes.y, calMes.m, 1)
    const lastDay = new Date(calMes.y, calMes.m + 1, 0).getDate()
    const startDow = first.getDay()
    const days = []
    for (let i = 0; i < startDow; i++) days.push(null)
    for (let d = 1; d <= lastDay; d++) days.push(d)
    return days
  }, [calMes])

  const calEvents = useMemo(() => {
    const events = {}
    sol.filter(s => ['aprobado', 'pendiente'].includes(s.estado)).forEach(s => {
      if (!s.fecha_inicio) return
      const fFin = s.fecha_fin || s.fecha_inicio
      let d = new Date(s.fecha_inicio + 'T00:00:00'), end = new Date(fFin + 'T00:00:00')
      while (d <= end) {
        if (d.getFullYear() === calMes.y && d.getMonth() === calMes.m) {
          const key = d.getDate()
          if (!events[key]) events[key] = []
          events[key].push({ nombre: s.empleado_nombre, estado: s.estado, tipo: s.tipo, modalidad: s.modalidad })
        }
        d.setDate(d.getDate() + 1)
      }
    })
    return events
  }, [sol, calMes])

  if (authLoad || loading) return (
    <div style={{ minHeight: '100vh', background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Rubik' }}>
      <div style={{ ...S.card, padding: 40, textAlign: 'center' }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>Cargando...</div>
      </div>
    </div>
  )

  const esPorHoras = form.modalidad === 'por_horas'

  return (
    <div style={{ minHeight: '100vh', background: BG, fontFamily: 'Rubik', color: TEXT, padding: '24px 28px' }}>
      {/* HEADER */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.6em', fontWeight: 700, color: TEXT }}>Recursos Humanos</h1>
          <p style={{ margin: '4px 0 0', color: MUTED, fontSize: '0.88em' }}>Gestión de solicitudes y ausencias</p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {['solicitudes', 'calendario'].map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              ...S.btn(tab === t ? GOLD : 'rgba(0,0,0,0.15)', tab !== t),
              background: tab === t ? GOLD : 'rgba(255,255,255,0.5)',
              color: tab === t ? '#fff' : TEXT,
              borderRadius: 14, padding: '8px 22px', fontSize: '0.88em',
            }}>{t === 'solicitudes' ? 'Solicitudes' : 'Calendario'}</button>
          ))}
        </div>
      </div>

      {/* TAB SOLICITUDES */}
      {tab === 'solicitudes' && (
        <>
          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 20 }}>
            {[
              { label: 'Pendientes', val: kpis.pendientes, color: '#f97316' },
              { label: 'Aprobadas este mes', val: kpis.aprobadas, color: '#22c55e' },
              { label: 'Rechazadas', val: kpis.rechazadas, color: '#ef4444' },
              { label: 'Total solicitudes', val: kpis.total, color: GOLD },
            ].map(k => (
              <div key={k.label} style={{ ...S.card, textAlign: 'center', padding: '18px 16px' }}>
                <div style={{ fontSize: '1.8em', fontWeight: 700, color: k.color }}>{k.val}</div>
                <div style={{ fontSize: '0.78em', color: MUTED, marginTop: 2 }}>{k.label}</div>
              </div>
            ))}
          </div>

          {/* TOOLBAR */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <button onClick={() => { if (showForm) cancelarForm(); else setShowForm(true) }} style={{ ...S.btn(GOLD, false), borderRadius: 14, padding: '9px 22px' }}>
              {showForm ? 'Cancelar' : '+ Nueva Solicitud'}
            </button>
            <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
              {[['activas', 'Activas'], ['historial', 'Historial'], ['todas', 'Todas']].map(([k, l]) => (
                <button key={k} onClick={() => setFiltro(k)} style={{
                  padding: '6px 16px', borderRadius: 12, border: 'none', cursor: 'pointer', fontSize: '0.82em', fontWeight: 600, fontFamily: 'Rubik',
                  background: filtro === k ? GOLD + '22' : 'transparent', color: filtro === k ? GOLD : MUTED,
                }}>{l}</button>
              ))}
            </div>
            <input placeholder="Buscar empleado..." value={busq} onChange={e => setBusq(e.target.value)}
              style={{ ...S.input, width: 200, padding: '8px 14px' }} />
          </div>

          {/* FORM */}
          {showForm && (
            <div style={{ ...S.card, marginBottom: 18, padding: '24px 28px' }}>
              <div style={{ fontSize: '1.05em', fontWeight: 700, marginBottom: 16, color: TEXT }}>
                {editandoId ? 'Editar Solicitud' : 'Nueva Solicitud'}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={{ fontSize: '0.78em', color: MUTED, marginBottom: 4, display: 'block' }}>Empleado</label>
                  <input style={S.input} value={form.empleado_nombre} onChange={e => setForm({ ...form, empleado_nombre: e.target.value })} placeholder="Nombre completo" />
                </div>
                <div>
                  <label style={{ fontSize: '0.78em', color: MUTED, marginBottom: 4, display: 'block' }}>Puesto</label>
                  <input style={S.input} value={form.puesto} onChange={e => setForm({ ...form, puesto: e.target.value })} placeholder="Cargo del empleado" />
                </div>
                <div>
                  <label style={{ fontSize: '0.78em', color: MUTED, marginBottom: 4, display: 'block' }}>Tipo</label>
                  <select style={{ ...S.input, cursor: 'pointer' }} value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })}>
                    {Object.entries(TIPO_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.78em', color: MUTED, marginBottom: 4, display: 'block' }}>Modalidad</label>
                  <select style={{ ...S.input, cursor: 'pointer' }} value={form.modalidad} onChange={e => setForm({ ...form, modalidad: e.target.value, hora_inicio: '', hora_fin: '', fecha_fin: '' })}>
                    <option value="dia_completo">Día completo</option>
                    <option value="por_horas">Por horas</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.78em', color: MUTED, marginBottom: 4, display: 'block' }}>Motivo</label>
                  <textarea style={{ ...S.input, minHeight: 60, resize: 'vertical' }} value={form.motivo} onChange={e => setForm({ ...form, motivo: e.target.value })} placeholder="Razón de la solicitud" />
                </div>
                <div>
                  <label style={{ fontSize: '0.78em', color: MUTED, marginBottom: 4, display: 'block' }}>
                    {esPorHoras ? 'Fecha' : 'Fecha inicio'}
                  </label>
                  <input type="date" style={S.input} value={form.fecha_inicio} onChange={e => setForm({ ...form, fecha_inicio: e.target.value })} />
                </div>
                {esPorHoras ? (
                  <>
                    <div>
                      <label style={{ fontSize: '0.78em', color: MUTED, marginBottom: 4, display: 'block' }}>Hora inicio</label>
                      <input type="time" style={S.input} value={form.hora_inicio} onChange={e => setForm({ ...form, hora_inicio: e.target.value })} />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.78em', color: MUTED, marginBottom: 4, display: 'block' }}>Hora fin</label>
                      <input type="time" style={S.input} value={form.hora_fin} onChange={e => setForm({ ...form, hora_fin: e.target.value })} />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.78em', color: MUTED, marginBottom: 4, display: 'block' }}>Horas de permiso</label>
                      <div style={{ ...S.input, background: 'rgba(0,0,0,0.04)', fontWeight: 700, color: GOLD }}>{horasCalc} hora{horasCalc !== 1 ? 's' : ''}</div>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label style={{ fontSize: '0.78em', color: MUTED, marginBottom: 4, display: 'block' }}>Fecha fin</label>
                      <input type="date" style={S.input} value={form.fecha_fin} onChange={e => setForm({ ...form, fecha_fin: e.target.value })} />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.78em', color: MUTED, marginBottom: 4, display: 'block' }}>Días hábiles</label>
                      <div style={{ ...S.input, background: 'rgba(0,0,0,0.04)', fontWeight: 700, color: GOLD }}>{diasCalc}</div>
                    </div>
                  </>
                )}
                <div>
                  <label style={{ fontSize: '0.78em', color: MUTED, marginBottom: 4, display: 'block' }}>Observaciones</label>
                  <textarea style={{ ...S.input, minHeight: 60, resize: 'vertical' }} value={form.observaciones} onChange={e => setForm({ ...form, observaciones: e.target.value })} placeholder="Notas adicionales (opcional)" />
                </div>
              </div>
              <div style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                {editandoId && (
                  <button onClick={cancelarForm} style={{ ...S.btn('#6b7280', true), padding: '10px 24px', fontSize: '0.9em' }}>Cancelar</button>
                )}
                <button onClick={guardar} disabled={saving || !form.empleado_nombre || !form.fecha_inicio || (!esPorHoras && !form.fecha_fin) || (esPorHoras && (!form.hora_inicio || !form.hora_fin))}
                  style={{ ...S.btn(GOLD, false), opacity: saving ? 0.6 : 1, padding: '10px 32px', fontSize: '0.9em' }}>
                  {saving ? 'Guardando...' : editandoId ? 'Guardar Cambios' : 'Guardar Solicitud'}
                </button>
              </div>
            </div>
          )}

          {/* LIST */}
          {filtered.length === 0 ? (
            <div style={{ ...S.card, textAlign: 'center', padding: 40, color: MUTED }}>No hay solicitudes</div>
          ) : filtered.map(s => {
            const tipo = TIPO_MAP[s.tipo] || { label: s.tipo, color: '#999' }
            const est = ESTADO_MAP[s.estado] || { label: s.estado, color: '#999' }
            const esHoras = s.modalidad === 'por_horas'
            return (
              <div key={s.id} style={{ ...S.card, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontWeight: 700, fontSize: '1em', color: TEXT }}>{s.empleado_nombre}</div>
                  <div style={{ fontSize: '0.78em', color: MUTED }}>{s.puesto}</div>
                </div>
                <div style={S.badge(tipo.color)}>{tipo.label}</div>
                <div style={{ fontSize: '0.82em', color: TEXT, minWidth: 140, textAlign: 'center' }}>
                  {esHoras ? (
                    <>
                      {s.fecha_inicio}
                      <div style={{ fontSize: '0.78em', color: MUTED }}>{s.hora_inicio} - {s.hora_fin} ({s.horas_totales} hr{s.horas_totales !== 1 ? 's' : ''})</div>
                    </>
                  ) : (
                    <>
                      {s.fecha_inicio} → {s.fecha_fin}
                      <div style={{ fontSize: '0.78em', color: MUTED }}>{s.dias_totales} día{s.dias_totales !== 1 ? 's' : ''}</div>
                    </>
                  )}
                </div>
                <div style={S.badge(est.color)}>{est.label}</div>
                {s.estado === 'pendiente' && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => iniciarEdicion(s)} style={S.btn('#3b82f6', true)} title="Editar">✏️</button>
                    <button onClick={() => eliminar(s)} style={S.btn('#ef4444', true)} title="Eliminar">🗑️</button>
                    <button onClick={() => cambiarEstado(s, 'aprobado')} style={S.btn('#22c55e', false)}>Aprobar</button>
                    <button onClick={() => cambiarEstado(s, 'rechazado')} style={S.btn('#ef4444', true)}>Rechazar</button>
                  </div>
                )}
                {s.motivo && <div style={{ width: '100%', fontSize: '0.8em', color: MUTED, marginTop: 2 }}>Motivo: {s.motivo}</div>}
              </div>
            )
          })}
        </>
      )}

      {/* TAB CALENDARIO */}
      {tab === 'calendario' && (
        <div style={S.card}>
          {/* NAV MES */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20, marginBottom: 20 }}>
            <button onClick={() => setCalMes(p => { let m = p.m - 1, y = p.y; if (m < 0) { m = 11; y-- } return { y, m } })}
              style={{ ...S.btn(GOLD, true), padding: '6px 16px', fontSize: '1.1em' }}>&lt;</button>
            <span style={{ fontSize: '1.15em', fontWeight: 700, color: TEXT }}>{meses[calMes.m]} {calMes.y}</span>
            <button onClick={() => setCalMes(p => { let m = p.m + 1, y = p.y; if (m > 11) { m = 0; y++ } return { y, m } })}
              style={{ ...S.btn(GOLD, true), padding: '6px 16px', fontSize: '1.1em' }}>&gt;</button>
          </div>

          {/* GRID */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, textAlign: 'center' }}>
            {diasSem.map(d => <div key={d} style={{ fontSize: '0.75em', fontWeight: 700, color: MUTED, padding: '6px 0' }}>{d}</div>)}
            {calDays.map((d, i) => (
              <div key={i} style={{
                minHeight: 72, borderRadius: 12, padding: 4,
                background: d ? 'rgba(255,255,255,0.5)' : 'transparent',
                border: d ? '1px solid rgba(0,0,0,0.06)' : 'none',
              }}>
                {d && <>
                  <div style={{ fontSize: '0.78em', fontWeight: 600, color: TEXT, marginBottom: 2 }}>{d}</div>
                  {(calEvents[d] || []).map((ev, j) => (
                    <div key={j} style={{
                      background: ev.estado === 'aprobado' ? '#22c55e' : '#f97316',
                      color: '#fff', borderRadius: 4, padding: '1px 4px', fontSize: '0.6em',
                      marginBottom: 1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                    }}>{ev.nombre?.split(' ')[0]}{ev.modalidad === 'por_horas' ? ' (hrs)' : ''}</div>
                  ))}
                </>}
              </div>
            ))}
          </div>

          {/* LEGEND */}
          <div style={{ display: 'flex', gap: 20, marginTop: 16, justifyContent: 'center' }}>
            {[['#22c55e', 'Aprobado'], ['#f97316', 'Pendiente']].map(([c, l]) => (
              <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8em', color: MUTED }}>
                <div style={{ width: 14, height: 14, borderRadius: 4, background: c }} />
                {l}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
