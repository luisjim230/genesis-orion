'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { S, GOLD, TEXT, MUTED, calcDias, calcHoras } from './_styles'

const TIPO_MAP = {
  vacaciones: { label: 'Vacaciones', color: '#3b82f6' },
  permiso_sin_goce: { label: 'Permiso sin goce', color: '#8b5cf6' },
  cita_medica: { label: 'Cita médica', color: '#06b6d4' },
  permiso_urgente: { label: 'Permiso urgente', color: '#ef4444' },
  incapacidad: { label: 'Incapacidad', color: '#ec4899' },
}

const TIPO_FALLBACK = { label: 'Otro', color: '#94a3b8' }

const ESTADO_MAP = {
  pendiente: { label: 'Pendiente', color: '#f97316' },
  aprobado: { label: 'Aprobado', color: '#22c55e' },
  rechazado: { label: 'Rechazado', color: '#ef4444' },
  cancelado: { label: 'Cancelado', color: '#6b7280' },
}

const FORM_VACIO = { empleado_id: '', empleado_nombre: '', puesto: '', tipo: 'vacaciones', motivo: '', fecha_inicio: '', fecha_fin: '', observaciones: '', modalidad: 'dia_completo', hora_inicio: '', hora_fin: '' }

export default function TabSolicitudes({ solicitudes, empleados, perfil, recargar }) {
  const [filtro, setFiltro] = useState('activas')
  const [busq, setBusq] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ ...FORM_VACIO })
  const [editandoId, setEditandoId] = useState(null)
  const [saving, setSaving] = useState(false)

  const ahora = new Date()
  const mesActual = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}`

  const empleadosMap = useMemo(() => Object.fromEntries(empleados.map(e => [e.id, e])), [empleados])

  const kpis = useMemo(() => ({
    pendientes: solicitudes.filter(s => s.estado === 'pendiente').length,
    aprobadas: solicitudes.filter(s => s.estado === 'aprobado' && s.fecha_aprobacion?.startsWith(mesActual)).length,
    rechazadas: solicitudes.filter(s => s.estado === 'rechazado').length,
    total: solicitudes.length,
  }), [solicitudes, mesActual])

  const filtered = useMemo(() => {
    let f = solicitudes
    if (filtro === 'activas') f = f.filter(s => ['pendiente', 'aprobado'].includes(s.estado))
    else if (filtro === 'historial') f = f.filter(s => ['rechazado', 'cancelado'].includes(s.estado))
    if (busq) f = f.filter(s => s.empleado_nombre?.toLowerCase().includes(busq.toLowerCase()))
    return f
  }, [solicitudes, filtro, busq])

  const diasCalc = useMemo(() => calcDias(form.fecha_inicio, form.fecha_fin), [form.fecha_inicio, form.fecha_fin])
  const horasCalc = useMemo(() => calcHoras(form.hora_inicio, form.hora_fin), [form.hora_inicio, form.hora_fin])
  const esPorHoras = form.modalidad === 'por_horas'

  function iniciarEdicion(s) {
    setForm({
      empleado_id: s.empleado_id || '',
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

  function seleccionarEmpleado(id) {
    const emp = empleadosMap[id]
    if (emp) setForm(f => ({ ...f, empleado_id: id, empleado_nombre: emp.nombre, puesto: emp.puesto || f.puesto }))
    else setForm(f => ({ ...f, empleado_id: '' }))
  }

  async function guardar() {
    if (!form.empleado_nombre || !form.fecha_inicio) return
    if (!esPorHoras && !form.fecha_fin) return
    if (esPorHoras && (!form.hora_inicio || !form.hora_fin)) return
    setSaving(true)
    const now = new Date().toISOString()

    if (editandoId) {
      const sol_actual = solicitudes.find(s => s.id === editandoId)
      const tl = [...(sol_actual?.timeline || []), { accion: 'Editada', fecha: now, usuario: perfil?.nombre || 'Sistema' }]
      const datos = {
        ...form,
        empleado_id: form.empleado_id || null,
        dias_totales: esPorHoras ? 0 : diasCalc,
        horas_totales: esPorHoras ? horasCalc : null,
        fecha_fin: esPorHoras ? form.fecha_inicio : form.fecha_fin,
        hora_inicio: esPorHoras ? form.hora_inicio : null,
        hora_fin: esPorHoras ? form.hora_fin : null,
        timeline: tl,
      }
      await supabase.from('rrhh_solicitudes').update(datos).eq('id', editandoId)
    } else {
      const nuevo = {
        ...form,
        empleado_id: form.empleado_id || null,
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
    recargar()
  }

  async function eliminar(s) {
    if (!confirm(`¿Eliminar solicitud de ${s.empleado_nombre}?`)) return
    await supabase.from('rrhh_solicitudes').delete().eq('id', s.id)
    recargar()
  }

  async function cambiarEstado(s, nuevoEstado) {
    const now = new Date().toISOString()
    const tl = [...(s.timeline || []), { accion: nuevoEstado === 'aprobado' ? 'Aprobada' : 'Rechazada', fecha: now, usuario: perfil?.nombre || 'Admin' }]
    await supabase.from('rrhh_solicitudes').update({
      estado: nuevoEstado, aprobado_por: perfil?.nombre || 'Admin', fecha_aprobacion: now,
      timeline: tl,
    }).eq('id', s.id)
    recargar()
  }

  return (
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
              <label style={S.label}>Empleado</label>
              <select style={{ ...S.input, cursor: 'pointer' }} value={form.empleado_id} onChange={e => seleccionarEmpleado(e.target.value)}>
                <option value="">— Escribir manualmente o seleccionar —</option>
                {empleados.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
              </select>
              <input style={{ ...S.input, marginTop: 6 }} value={form.empleado_nombre} onChange={e => setForm({ ...form, empleado_nombre: e.target.value })} placeholder="Nombre completo" />
            </div>
            <div>
              <label style={S.label}>Puesto</label>
              <input style={S.input} value={form.puesto} onChange={e => setForm({ ...form, puesto: e.target.value })} placeholder="Cargo del empleado" />
            </div>
            <div>
              <label style={S.label}>Tipo</label>
              <select style={{ ...S.input, cursor: 'pointer' }} value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })}>
                {Object.entries(TIPO_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label style={S.label}>Modalidad</label>
              <select style={{ ...S.input, cursor: 'pointer' }} value={form.modalidad} onChange={e => setForm({ ...form, modalidad: e.target.value, hora_inicio: '', hora_fin: '', fecha_fin: '' })}>
                <option value="dia_completo">Día completo</option>
                <option value="por_horas">Por horas</option>
              </select>
            </div>
            <div>
              <label style={S.label}>Motivo</label>
              <textarea style={{ ...S.input, minHeight: 60, resize: 'vertical' }} value={form.motivo} onChange={e => setForm({ ...form, motivo: e.target.value })} placeholder="Razón de la solicitud" />
            </div>
            <div>
              <label style={S.label}>{esPorHoras ? 'Fecha' : 'Fecha inicio'}</label>
              <input type="date" style={S.input} value={form.fecha_inicio} onChange={e => setForm({ ...form, fecha_inicio: e.target.value })} />
            </div>
            {esPorHoras ? (
              <>
                <div><label style={S.label}>Hora inicio</label><input type="time" style={S.input} value={form.hora_inicio} onChange={e => setForm({ ...form, hora_inicio: e.target.value })} /></div>
                <div><label style={S.label}>Hora fin</label><input type="time" style={S.input} value={form.hora_fin} onChange={e => setForm({ ...form, hora_fin: e.target.value })} /></div>
                <div><label style={S.label}>Horas de permiso</label><div style={{ ...S.input, background: 'rgba(0,0,0,0.04)', fontWeight: 700, color: GOLD }}>{horasCalc} hora{horasCalc !== 1 ? 's' : ''}</div></div>
              </>
            ) : (
              <>
                <div><label style={S.label}>Fecha fin</label><input type="date" style={S.input} value={form.fecha_fin} onChange={e => setForm({ ...form, fecha_fin: e.target.value })} /></div>
                <div><label style={S.label}>Días hábiles</label><div style={{ ...S.input, background: 'rgba(0,0,0,0.04)', fontWeight: 700, color: GOLD }}>{diasCalc}</div></div>
              </>
            )}
            <div>
              <label style={S.label}>Observaciones</label>
              <textarea style={{ ...S.input, minHeight: 60, resize: 'vertical' }} value={form.observaciones} onChange={e => setForm({ ...form, observaciones: e.target.value })} placeholder="Notas adicionales (opcional)" />
            </div>
          </div>
          <div style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            {editandoId && <button onClick={cancelarForm} style={{ ...S.btn('#6b7280', true), padding: '10px 24px', fontSize: '0.9em' }}>Cancelar</button>}
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
                <>{s.fecha_inicio}<div style={{ fontSize: '0.78em', color: MUTED }}>{s.hora_inicio} - {s.hora_fin} ({s.horas_totales} hr{s.horas_totales !== 1 ? 's' : ''})</div></>
              ) : (
                <>{s.fecha_inicio} → {s.fecha_fin}<div style={{ fontSize: '0.78em', color: MUTED }}>{s.dias_totales} día{s.dias_totales !== 1 ? 's' : ''}</div></>
              )}
            </div>
            <div style={S.badge(est.color)}>{est.label}</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {s.estado === 'pendiente' && (
                <>
                  <button onClick={() => iniciarEdicion(s)} style={S.btn('#3b82f6', true)} title="Editar">✏️</button>
                  <button onClick={() => cambiarEstado(s, 'aprobado')} style={S.btn('#22c55e', false)}>Aprobar</button>
                  <button onClick={() => cambiarEstado(s, 'rechazado')} style={S.btn('#ef4444', true)}>Rechazar</button>
                </>
              )}
              <button onClick={() => eliminar(s)} style={S.btn('#ef4444', true)} title="Eliminar">🗑️</button>
            </div>
            {s.motivo && <div style={{ width: '100%', fontSize: '0.8em', color: MUTED, marginTop: 2 }}>Motivo: {s.motivo}</div>}
          </div>
        )
      })}
    </>
  )
}

export function TabCalendario({ solicitudes }) {
  const [calMes, setCalMes] = useState(() => { const n = new Date(); return { y: n.getFullYear(), m: n.getMonth() } })
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
    solicitudes.filter(s => ['aprobado', 'pendiente'].includes(s.estado)).forEach(s => {
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
  }, [solicitudes, calMes])

  return (
    <div style={S.card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20, marginBottom: 20 }}>
        <button onClick={() => setCalMes(p => { let m = p.m - 1, y = p.y; if (m < 0) { m = 11; y-- } return { y, m } })}
          style={{ ...S.btn(GOLD, true), padding: '6px 16px', fontSize: '1.1em' }}>&lt;</button>
        <span style={{ fontSize: '1.15em', fontWeight: 700, color: TEXT }}>{meses[calMes.m]} {calMes.y}</span>
        <button onClick={() => setCalMes(p => { let m = p.m + 1, y = p.y; if (m > 11) { m = 0; y++ } return { y, m } })}
          style={{ ...S.btn(GOLD, true), padding: '6px 16px', fontSize: '1.1em' }}>&gt;</button>
      </div>
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
              {(calEvents[d] || []).map((ev, j) => {
                const t = TIPO_MAP[ev.tipo] || TIPO_FALLBACK
                const aprobado = ev.estado === 'aprobado'
                return (
                  <div key={j}
                    title={`${ev.nombre} · ${t.label} · ${aprobado ? 'Aprobado' : 'Pendiente'}`}
                    style={{
                      background: aprobado ? t.color : t.color + '26',
                      color: aprobado ? '#fff' : t.color,
                      border: aprobado ? `1px solid ${t.color}` : `1px dashed ${t.color}`,
                      borderRadius: 4, padding: '1px 4px', fontSize: '0.6em', fontWeight: 700,
                      marginBottom: 1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                    }}>{ev.nombre?.split(' ')[0]}{ev.modalidad === 'por_horas' ? ' (hrs)' : ''}</div>
                )
              })}
            </>}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
        {/* Leyenda de tipos: cada tipo de solicitud tiene su propio color */}
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' }}>
          <span style={{ fontSize: '0.72em', fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tipo</span>
          {Object.values(TIPO_MAP).map(t => (
            <div key={t.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8em', color: MUTED }}>
              <div style={{ width: 14, height: 14, borderRadius: 4, background: t.color }} />
              {t.label}
            </div>
          ))}
        </div>
        {/* Leyenda de estado: relleno = aprobado, borde punteado = pendiente */}
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' }}>
          <span style={{ fontSize: '0.72em', fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Estado</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8em', color: MUTED }}>
            <div style={{ width: 14, height: 14, borderRadius: 4, background: '#64748b', border: '1px solid #64748b' }} />
            Aprobado (relleno)
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8em', color: MUTED }}>
            <div style={{ width: 14, height: 14, borderRadius: 4, background: '#64748b26', border: '1px dashed #64748b' }} />
            Pendiente (punteado)
          </div>
        </div>
      </div>
    </div>
  )
}
