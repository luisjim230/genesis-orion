'use client'
import { useState, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { S, GOLD, TEXT, MUTED, fmtFecha, iniciales, colorAvatar } from './_styles'

const ESTADO_COLOR = {
  activo: '#22c55e',
  inactivo: '#6b7280',
  suspendido: '#ef4444',
  vacaciones: '#3b82f6',
}

const FORM_VACIO = {
  nombre: '', cedula: '', telefono: '', email: '',
  puesto: '', departamento: '', fecha_ingreso: '', fecha_salida: '',
  estado: 'activo', tipo_contrato: '', salario: '', dias_vacaciones_anuales: 15,
  direccion: '', contacto_emergencia_nombre: '', contacto_emergencia_telefono: '',
  observaciones: '',
}

export default function TabEmpleados({ empleados, capacitaciones, seguimiento, solicitudes, perfil, recargar, onAbrirFicha }) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ ...FORM_VACIO })
  const [editandoId, setEditandoId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [busq, setBusq] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('activo')

  const filtrados = useMemo(() => {
    let f = empleados
    if (filtroEstado !== 'todos') f = f.filter(e => e.estado === filtroEstado)
    if (busq) {
      const q = busq.toLowerCase()
      f = f.filter(e => (e.nombre || '').toLowerCase().includes(q) || (e.puesto || '').toLowerCase().includes(q) || (e.cedula || '').toLowerCase().includes(q))
    }
    return f
  }, [empleados, filtroEstado, busq])

  const kpis = useMemo(() => ({
    activos: empleados.filter(e => e.estado === 'activo').length,
    total: empleados.length,
    departamentos: new Set(empleados.map(e => e.departamento).filter(Boolean)).size,
    capacitaciones: capacitaciones.length,
  }), [empleados, capacitaciones])

  function iniciarEdicion(e) {
    setForm({
      nombre: e.nombre || '', cedula: e.cedula || '', telefono: e.telefono || '', email: e.email || '',
      puesto: e.puesto || '', departamento: e.departamento || '',
      fecha_ingreso: e.fecha_ingreso || '', fecha_salida: e.fecha_salida || '',
      estado: e.estado || 'activo', tipo_contrato: e.tipo_contrato || '',
      salario: e.salario ?? '', dias_vacaciones_anuales: e.dias_vacaciones_anuales ?? 15,
      direccion: e.direccion || '',
      contacto_emergencia_nombre: e.contacto_emergencia_nombre || '',
      contacto_emergencia_telefono: e.contacto_emergencia_telefono || '',
      observaciones: e.observaciones || '',
    })
    setEditandoId(e.id)
    setShowForm(true)
  }

  function cancelarForm() {
    setForm({ ...FORM_VACIO })
    setEditandoId(null)
    setShowForm(false)
  }

  async function guardar() {
    if (!form.nombre.trim()) return
    setSaving(true)
    const datos = {
      ...form,
      salario: form.salario === '' ? null : Number(form.salario),
      dias_vacaciones_anuales: form.dias_vacaciones_anuales === '' ? null : Number(form.dias_vacaciones_anuales),
      fecha_ingreso: form.fecha_ingreso || null,
      fecha_salida: form.fecha_salida || null,
      actualizado_en: new Date().toISOString(),
    }
    if (editandoId) {
      await supabase.from('rrhh_empleados').update(datos).eq('id', editandoId)
    } else {
      await supabase.from('rrhh_empleados').insert([{ ...datos, creado_por: perfil?.nombre || 'Sistema' }])
    }
    cancelarForm()
    setSaving(false)
    recargar()
  }

  async function eliminar(e) {
    if (!confirm(`¿Eliminar a ${e.nombre}? Se borrarán también sus capacitaciones y seguimientos.`)) return
    await supabase.from('rrhh_empleados').delete().eq('id', e.id)
    recargar()
  }

  return (
    <>
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 20 }}>
        {[
          { label: 'Empleados activos', val: kpis.activos, color: '#22c55e' },
          { label: 'Total registrados', val: kpis.total, color: GOLD },
          { label: 'Departamentos', val: kpis.departamentos, color: '#3b82f6' },
          { label: 'Capacitaciones', val: kpis.capacitaciones, color: '#8b5cf6' },
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
          {showForm ? 'Cancelar' : '+ Nuevo Empleado'}
        </button>
        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
          {[['activo', 'Activos'], ['inactivo', 'Inactivos'], ['todos', 'Todos']].map(([k, l]) => (
            <button key={k} onClick={() => setFiltroEstado(k)} style={{
              padding: '6px 16px', borderRadius: 12, border: 'none', cursor: 'pointer', fontSize: '0.82em', fontWeight: 600, fontFamily: 'Rubik',
              background: filtroEstado === k ? GOLD + '22' : 'transparent', color: filtroEstado === k ? GOLD : MUTED,
            }}>{l}</button>
          ))}
        </div>
        <input placeholder="Buscar nombre, puesto, cédula..." value={busq} onChange={e => setBusq(e.target.value)}
          style={{ ...S.input, width: 240, padding: '8px 14px' }} />
      </div>

      {/* FORM */}
      {showForm && (
        <div style={{ ...S.card, marginBottom: 18, padding: '24px 28px' }}>
          <div style={{ fontSize: '1.05em', fontWeight: 700, marginBottom: 16, color: TEXT }}>
            {editandoId ? 'Editar Empleado' : 'Nuevo Empleado'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
            <Field label="Nombre completo *" value={form.nombre} onChange={v => setForm({ ...form, nombre: v })} placeholder="Ej. Ana Mora Rodríguez" />
            <Field label="Cédula" value={form.cedula} onChange={v => setForm({ ...form, cedula: v })} placeholder="1-2345-6789" />
            <Field label="Teléfono" value={form.telefono} onChange={v => setForm({ ...form, telefono: v })} placeholder="+506 8888-8888" />
            <Field label="Correo" value={form.email} onChange={v => setForm({ ...form, email: v })} placeholder="ana@deposito.com" />
            <Field label="Puesto" value={form.puesto} onChange={v => setForm({ ...form, puesto: v })} placeholder="Bodeguero" />
            <Field label="Departamento" value={form.departamento} onChange={v => setForm({ ...form, departamento: v })} placeholder="Bodega" />
            <Field label="Fecha de ingreso" type="date" value={form.fecha_ingreso} onChange={v => setForm({ ...form, fecha_ingreso: v })} />
            <Field label="Fecha de salida" type="date" value={form.fecha_salida} onChange={v => setForm({ ...form, fecha_salida: v })} />
            <div>
              <label style={S.label}>Estado</label>
              <select style={{ ...S.input, cursor: 'pointer' }} value={form.estado} onChange={e => setForm({ ...form, estado: e.target.value })}>
                <option value="activo">Activo</option>
                <option value="inactivo">Inactivo</option>
                <option value="suspendido">Suspendido</option>
                <option value="vacaciones">En vacaciones</option>
              </select>
            </div>
            <div>
              <label style={S.label}>Tipo de contrato</label>
              <select style={{ ...S.input, cursor: 'pointer' }} value={form.tipo_contrato} onChange={e => setForm({ ...form, tipo_contrato: e.target.value })}>
                <option value="">—</option>
                <option value="fijo">Fijo</option>
                <option value="temporal">Temporal</option>
                <option value="prueba">Periodo de prueba</option>
                <option value="servicios_profesionales">Servicios profesionales</option>
              </select>
            </div>
            <Field label="Salario (₡)" type="number" value={form.salario} onChange={v => setForm({ ...form, salario: v })} placeholder="0" />
            <Field label="Días de vacaciones anuales" type="number" value={form.dias_vacaciones_anuales} onChange={v => setForm({ ...form, dias_vacaciones_anuales: v })} placeholder="15" />
            <Field label="Dirección" value={form.direccion} onChange={v => setForm({ ...form, direccion: v })} placeholder="Cantón, provincia" full />
            <Field label="Contacto de emergencia · nombre" value={form.contacto_emergencia_nombre} onChange={v => setForm({ ...form, contacto_emergencia_nombre: v })} />
            <Field label="Contacto de emergencia · teléfono" value={form.contacto_emergencia_telefono} onChange={v => setForm({ ...form, contacto_emergencia_telefono: v })} />
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={S.label}>Observaciones</label>
              <textarea style={{ ...S.input, minHeight: 60, resize: 'vertical' }} value={form.observaciones} onChange={e => setForm({ ...form, observaciones: e.target.value })} />
            </div>
          </div>
          <div style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button onClick={cancelarForm} style={{ ...S.btn('#6b7280', true), padding: '10px 24px', fontSize: '0.9em' }}>Cancelar</button>
            <button onClick={guardar} disabled={saving || !form.nombre.trim()}
              style={{ ...S.btn(GOLD, false), opacity: saving ? 0.6 : 1, padding: '10px 32px', fontSize: '0.9em' }}>
              {saving ? 'Guardando...' : editandoId ? 'Guardar Cambios' : 'Crear Empleado'}
            </button>
          </div>
        </div>
      )}

      {/* GRID DE TARJETAS */}
      {filtrados.length === 0 ? (
        <div style={{ ...S.card, textAlign: 'center', padding: 40, color: MUTED }}>
          {empleados.length === 0 ? 'Aún no hay empleados registrados. Hacé clic en "+ Nuevo Empleado" para empezar.' : 'No se encontraron resultados.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
          {filtrados.map(e => {
            const numCap = capacitaciones.filter(c => c.empleado_id === e.id && c.estado === 'completada').length
            const numSeg = seguimiento.filter(s => s.empleado_id === e.id).length
            const estColor = ESTADO_COLOR[e.estado] || '#6b7280'
            return (
              <div key={e.id} style={{ ...S.card, padding: 18, cursor: 'pointer', transition: 'transform .15s' }}
                onClick={() => onAbrirFicha(e.id)}
                onMouseEnter={ev => ev.currentTarget.style.transform = 'translateY(-2px)'}
                onMouseLeave={ev => ev.currentTarget.style.transform = 'translateY(0)'}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                  <div style={{ width: 48, height: 48, borderRadius: '50%', background: colorAvatar(e.nombre), color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '1.1em', flexShrink: 0 }}>
                    {iniciales(e.nombre)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.98em', color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.nombre}</div>
                    <div style={{ fontSize: '0.78em', color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {e.puesto || 'Sin puesto'}{e.departamento ? ` · ${e.departamento}` : ''}
                    </div>
                  </div>
                  <div style={S.badge(estColor)}>{(e.estado || 'activo').replace(/_/g, ' ')}</div>
                </div>
                <div style={{ display: 'flex', gap: 16, fontSize: '0.78em', color: MUTED, marginBottom: 8 }}>
                  <div>📅 Ingreso: {fmtFecha(e.fecha_ingreso)}</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <span style={S.badge('#8b5cf6')}>{numCap} capacitación{numCap !== 1 ? 'es' : ''}</span>
                  {numSeg > 0 && <span style={S.badge('#f59e0b')}>{numSeg} seguimiento{numSeg !== 1 ? 's' : ''}</span>}
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 12, justifyContent: 'flex-end' }} onClick={ev => ev.stopPropagation()}>
                  <button onClick={() => iniciarEdicion(e)} style={S.btn('#3b82f6', true)}>Editar</button>
                  <button onClick={() => eliminar(e)} style={S.btn('#ef4444', true)}>Eliminar</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

function Field({ label, value, onChange, placeholder, type = 'text', full }) {
  return (
    <div style={full ? { gridColumn: '1 / -1' } : {}}>
      <label style={S.label}>{label}</label>
      <input type={type} style={S.input} value={value ?? ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  )
}
