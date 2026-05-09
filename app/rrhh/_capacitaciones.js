'use client'
import { useState, useMemo, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { S, GOLD, TEXT, MUTED, fmtFecha } from './_styles'

const ESTADO_MAP = {
  programada: { label: 'Programada', color: '#3b82f6' },
  en_curso: { label: 'En curso', color: '#f59e0b' },
  completada: { label: 'Completada', color: '#22c55e' },
  cancelada: { label: 'Cancelada', color: '#6b7280' },
}

const TIPO_MAP = {
  interna: { label: 'Interna', color: '#8b5cf6' },
  externa: { label: 'Externa', color: '#06b6d4' },
}

const FORM_VACIO = {
  empleado_id: '', titulo: '', descripcion: '', tipo: 'interna', modalidad: 'presencial',
  instructor: '', institucion: '', fecha: '', duracion_horas: '',
  estado: 'completada', certificado_url: '', observaciones: '',
}

export default function TabCapacitaciones({ empleados, capacitaciones, perfil, recargar, empleadoIdInicial, limpiarEmpleadoInicial }) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ ...FORM_VACIO })
  const [editandoId, setEditandoId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [busq, setBusq] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('todas')
  const [filtroEmpleado, setFiltroEmpleado] = useState('')

  useEffect(() => {
    if (empleadoIdInicial) {
      setFiltroEmpleado(empleadoIdInicial)
      setForm(f => ({ ...f, empleado_id: empleadoIdInicial }))
      setShowForm(true)
      limpiarEmpleadoInicial?.()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empleadoIdInicial])

  const empleadosMap = useMemo(() => Object.fromEntries(empleados.map(e => [e.id, e])), [empleados])

  const filtradas = useMemo(() => {
    let f = capacitaciones
    if (filtroEstado !== 'todas') f = f.filter(c => c.estado === filtroEstado)
    if (filtroEmpleado) f = f.filter(c => c.empleado_id === filtroEmpleado)
    if (busq) {
      const q = busq.toLowerCase()
      f = f.filter(c => (c.titulo || '').toLowerCase().includes(q) || (c.institucion || '').toLowerCase().includes(q) || (empleadosMap[c.empleado_id]?.nombre || '').toLowerCase().includes(q))
    }
    return [...f].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))
  }, [capacitaciones, filtroEstado, filtroEmpleado, busq, empleadosMap])

  const kpis = useMemo(() => {
    const año = new Date().getFullYear()
    return {
      completadas: capacitaciones.filter(c => c.estado === 'completada').length,
      programadas: capacitaciones.filter(c => c.estado === 'programada').length,
      esteAño: capacitaciones.filter(c => c.estado === 'completada' && c.fecha?.startsWith(String(año))).length,
      horas: capacitaciones.filter(c => c.estado === 'completada').reduce((a, c) => a + Number(c.duracion_horas || 0), 0),
    }
  }, [capacitaciones])

  function iniciarEdicion(c) {
    setForm({
      empleado_id: c.empleado_id || '', titulo: c.titulo || '', descripcion: c.descripcion || '',
      tipo: c.tipo || 'interna', modalidad: c.modalidad || 'presencial',
      instructor: c.instructor || '', institucion: c.institucion || '',
      fecha: c.fecha || '', duracion_horas: c.duracion_horas ?? '',
      estado: c.estado || 'completada', certificado_url: c.certificado_url || '',
      observaciones: c.observaciones || '',
    })
    setEditandoId(c.id)
    setShowForm(true)
  }

  function cancelarForm() {
    setForm({ ...FORM_VACIO })
    setEditandoId(null)
    setShowForm(false)
  }

  async function guardar() {
    if (!form.titulo.trim() || !form.empleado_id) return
    setSaving(true)
    const datos = {
      ...form,
      duracion_horas: form.duracion_horas === '' ? null : Number(form.duracion_horas),
      fecha: form.fecha || null,
    }
    if (editandoId) {
      await supabase.from('rrhh_capacitaciones').update(datos).eq('id', editandoId)
    } else {
      await supabase.from('rrhh_capacitaciones').insert([{ ...datos, creado_por: perfil?.nombre || 'Sistema' }])
    }
    cancelarForm()
    setSaving(false)
    recargar()
  }

  async function eliminar(c) {
    if (!confirm(`¿Eliminar capacitación "${c.titulo}"?`)) return
    await supabase.from('rrhh_capacitaciones').delete().eq('id', c.id)
    recargar()
  }

  return (
    <>
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 20 }}>
        {[
          { label: 'Completadas', val: kpis.completadas, color: '#22c55e' },
          { label: 'Programadas', val: kpis.programadas, color: '#3b82f6' },
          { label: `Completadas ${new Date().getFullYear()}`, val: kpis.esteAño, color: GOLD },
          { label: 'Horas totales', val: kpis.horas, color: '#8b5cf6' },
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
          {showForm ? 'Cancelar' : '+ Nueva Capacitación'}
        </button>
        <select style={{ ...S.input, width: 'auto', padding: '8px 14px', cursor: 'pointer' }} value={filtroEmpleado} onChange={e => setFiltroEmpleado(e.target.value)}>
          <option value="">Todos los empleados</option>
          {empleados.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
          {[['todas', 'Todas'], ['completada', 'Completadas'], ['programada', 'Programadas']].map(([k, l]) => (
            <button key={k} onClick={() => setFiltroEstado(k)} style={{
              padding: '6px 16px', borderRadius: 12, border: 'none', cursor: 'pointer', fontSize: '0.82em', fontWeight: 600, fontFamily: 'Rubik',
              background: filtroEstado === k ? GOLD + '22' : 'transparent', color: filtroEstado === k ? GOLD : MUTED,
            }}>{l}</button>
          ))}
        </div>
        <input placeholder="Buscar título o empleado..." value={busq} onChange={e => setBusq(e.target.value)}
          style={{ ...S.input, width: 220, padding: '8px 14px' }} />
      </div>

      {/* FORM */}
      {showForm && (
        <div style={{ ...S.card, marginBottom: 18, padding: '24px 28px' }}>
          <div style={{ fontSize: '1.05em', fontWeight: 700, marginBottom: 16, color: TEXT }}>
            {editandoId ? 'Editar Capacitación' : 'Nueva Capacitación'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
            <div>
              <label style={S.label}>Empleado *</label>
              <select style={{ ...S.input, cursor: 'pointer' }} value={form.empleado_id} onChange={e => setForm({ ...form, empleado_id: e.target.value })}>
                <option value="">— Seleccionar —</option>
                {empleados.map(e => <option key={e.id} value={e.id}>{e.nombre}{e.puesto ? ` · ${e.puesto}` : ''}</option>)}
              </select>
            </div>
            <div>
              <label style={S.label}>Título *</label>
              <input style={S.input} value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })} placeholder="Ej. Manejo seguro de montacargas" />
            </div>
            <div>
              <label style={S.label}>Tipo</label>
              <select style={{ ...S.input, cursor: 'pointer' }} value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })}>
                <option value="interna">Interna</option>
                <option value="externa">Externa</option>
              </select>
            </div>
            <div>
              <label style={S.label}>Modalidad</label>
              <select style={{ ...S.input, cursor: 'pointer' }} value={form.modalidad} onChange={e => setForm({ ...form, modalidad: e.target.value })}>
                <option value="presencial">Presencial</option>
                <option value="virtual">Virtual</option>
                <option value="hibrida">Híbrida</option>
              </select>
            </div>
            <div>
              <label style={S.label}>Instructor</label>
              <input style={S.input} value={form.instructor} onChange={e => setForm({ ...form, instructor: e.target.value })} placeholder="Nombre del instructor" />
            </div>
            <div>
              <label style={S.label}>Institución / proveedor</label>
              <input style={S.input} value={form.institucion} onChange={e => setForm({ ...form, institucion: e.target.value })} placeholder="INA, Universidad, empresa..." />
            </div>
            <div>
              <label style={S.label}>Fecha</label>
              <input type="date" style={S.input} value={form.fecha} onChange={e => setForm({ ...form, fecha: e.target.value })} />
            </div>
            <div>
              <label style={S.label}>Duración (horas)</label>
              <input type="number" step="0.5" style={S.input} value={form.duracion_horas} onChange={e => setForm({ ...form, duracion_horas: e.target.value })} placeholder="0" />
            </div>
            <div>
              <label style={S.label}>Estado</label>
              <select style={{ ...S.input, cursor: 'pointer' }} value={form.estado} onChange={e => setForm({ ...form, estado: e.target.value })}>
                {Object.entries(ESTADO_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label style={S.label}>Link al certificado (opcional)</label>
              <input style={S.input} value={form.certificado_url} onChange={e => setForm({ ...form, certificado_url: e.target.value })} placeholder="https://..." />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={S.label}>Descripción</label>
              <textarea style={{ ...S.input, minHeight: 60, resize: 'vertical' }} value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })} placeholder="Contenido y objetivos" />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={S.label}>Observaciones</label>
              <textarea style={{ ...S.input, minHeight: 50, resize: 'vertical' }} value={form.observaciones} onChange={e => setForm({ ...form, observaciones: e.target.value })} />
            </div>
          </div>
          <div style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button onClick={cancelarForm} style={{ ...S.btn('#6b7280', true), padding: '10px 24px', fontSize: '0.9em' }}>Cancelar</button>
            <button onClick={guardar} disabled={saving || !form.titulo.trim() || !form.empleado_id}
              style={{ ...S.btn(GOLD, false), opacity: saving ? 0.6 : 1, padding: '10px 32px', fontSize: '0.9em' }}>
              {saving ? 'Guardando...' : editandoId ? 'Guardar Cambios' : 'Registrar'}
            </button>
          </div>
        </div>
      )}

      {/* LIST */}
      {filtradas.length === 0 ? (
        <div style={{ ...S.card, textAlign: 'center', padding: 40, color: MUTED }}>
          {capacitaciones.length === 0 ? 'Aún no hay capacitaciones registradas.' : 'No se encontraron resultados.'}
        </div>
      ) : filtradas.map(c => {
        const tipo = TIPO_MAP[c.tipo] || TIPO_MAP.interna
        const est = ESTADO_MAP[c.estado] || ESTADO_MAP.completada
        const emp = empleadosMap[c.empleado_id]
        return (
          <div key={c.id} style={{ ...S.card, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontWeight: 700, fontSize: '1em', color: TEXT }}>{c.titulo}</div>
              <div style={{ fontSize: '0.82em', color: MUTED }}>
                {emp?.nombre || 'Empleado eliminado'}{c.institucion ? ` · ${c.institucion}` : ''}{c.instructor ? ` · ${c.instructor}` : ''}
              </div>
            </div>
            <div style={S.badge(tipo.color)}>{tipo.label}</div>
            <div style={{ fontSize: '0.85em', color: TEXT, minWidth: 110, textAlign: 'center' }}>
              {fmtFecha(c.fecha)}
              {c.duracion_horas != null && <div style={{ fontSize: '0.78em', color: MUTED }}>{c.duracion_horas} hr{Number(c.duracion_horas) !== 1 ? 's' : ''}</div>}
            </div>
            <div style={S.badge(est.color)}>{est.label}</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {c.certificado_url && <a href={c.certificado_url} target="_blank" rel="noreferrer" style={{ ...S.btn('#06b6d4', true), textDecoration: 'none', display: 'inline-block' }}>📄 Cert.</a>}
              <button onClick={() => iniciarEdicion(c)} style={S.btn('#3b82f6', true)}>Editar</button>
              <button onClick={() => eliminar(c)} style={S.btn('#ef4444', true)}>🗑️</button>
            </div>
          </div>
        )
      })}
    </>
  )
}
