'use client'
import { useState, useMemo, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { S, GOLD, TEXT, MUTED, fmtFecha } from './_styles'

const TIPO_MAP = {
  reconocimiento: { label: 'Reconocimiento', color: '#22c55e', icon: '👏' },
  observacion: { label: 'Observación', color: '#3b82f6', icon: '👁️' },
  llamada_atencion: { label: 'Llamada de atención', color: '#f59e0b', icon: '⚠️' },
  suspension: { label: 'Suspensión', color: '#ef4444', icon: '⏸️' },
  otro: { label: 'Otro', color: '#6b7280', icon: '📋' },
}

const GRAVEDAD_MAP = {
  leve: { label: 'Leve', color: '#22c55e' },
  moderada: { label: 'Moderada', color: '#f59e0b' },
  grave: { label: 'Grave', color: '#ef4444' },
}

const FORM_VACIO = {
  empleado_id: '', tipo: 'observacion', fecha: new Date().toISOString().slice(0, 10),
  motivo: '', descripcion: '', accion_tomada: '', gravedad: '',
  proceso_legal: false, notas_legales: '', documentos_url: '',
}

export default function TabSeguimiento({ empleados, seguimiento, perfil, recargar, empleadoIdInicial, limpiarEmpleadoInicial }) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ ...FORM_VACIO })
  const [editandoId, setEditandoId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [busq, setBusq] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('todos')
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

  const filtrados = useMemo(() => {
    let f = seguimiento
    if (filtroTipo !== 'todos') f = f.filter(s => s.tipo === filtroTipo)
    if (filtroEmpleado) f = f.filter(s => s.empleado_id === filtroEmpleado)
    if (busq) {
      const q = busq.toLowerCase()
      f = f.filter(s => (s.motivo || '').toLowerCase().includes(q) || (empleadosMap[s.empleado_id]?.nombre || '').toLowerCase().includes(q))
    }
    return [...f].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))
  }, [seguimiento, filtroTipo, filtroEmpleado, busq, empleadosMap])

  const kpis = useMemo(() => ({
    reconocimientos: seguimiento.filter(s => s.tipo === 'reconocimiento').length,
    llamadas: seguimiento.filter(s => s.tipo === 'llamada_atencion').length,
    suspensiones: seguimiento.filter(s => s.tipo === 'suspension').length,
    procesos_legales: seguimiento.filter(s => s.proceso_legal).length,
  }), [seguimiento])

  function iniciarEdicion(s) {
    setForm({
      empleado_id: s.empleado_id || '', tipo: s.tipo || 'observacion',
      fecha: s.fecha || '', motivo: s.motivo || '', descripcion: s.descripcion || '',
      accion_tomada: s.accion_tomada || '', gravedad: s.gravedad || '',
      proceso_legal: !!s.proceso_legal, notas_legales: s.notas_legales || '',
      documentos_url: s.documentos_url || '',
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
    if (!form.motivo.trim() || !form.empleado_id) return
    setSaving(true)
    const datos = { ...form, fecha: form.fecha || new Date().toISOString().slice(0, 10) }
    if (editandoId) {
      await supabase.from('rrhh_seguimiento').update(datos).eq('id', editandoId)
    } else {
      await supabase.from('rrhh_seguimiento').insert([{ ...datos, creado_por: perfil?.nombre || 'Sistema' }])
    }
    cancelarForm()
    setSaving(false)
    recargar()
  }

  async function eliminar(s) {
    if (!confirm('¿Eliminar este registro de seguimiento?')) return
    await supabase.from('rrhh_seguimiento').delete().eq('id', s.id)
    recargar()
  }

  const esTipoFormal = ['llamada_atencion', 'suspension'].includes(form.tipo)

  return (
    <>
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 20 }}>
        {[
          { label: 'Reconocimientos', val: kpis.reconocimientos, color: '#22c55e' },
          { label: 'Llamadas de atención', val: kpis.llamadas, color: '#f59e0b' },
          { label: 'Suspensiones', val: kpis.suspensiones, color: '#ef4444' },
          { label: 'En proceso legal', val: kpis.procesos_legales, color: '#8b5cf6' },
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
          {showForm ? 'Cancelar' : '+ Nuevo Registro'}
        </button>
        <select style={{ ...S.input, width: 'auto', padding: '8px 14px', cursor: 'pointer' }} value={filtroEmpleado} onChange={e => setFiltroEmpleado(e.target.value)}>
          <option value="">Todos los empleados</option>
          {empleados.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto', flexWrap: 'wrap' }}>
          {[['todos', 'Todos'], ['reconocimiento', 'Recon.'], ['observacion', 'Observ.'], ['llamada_atencion', 'Llamadas'], ['suspension', 'Suspens.']].map(([k, l]) => (
            <button key={k} onClick={() => setFiltroTipo(k)} style={{
              padding: '6px 14px', borderRadius: 12, border: 'none', cursor: 'pointer', fontSize: '0.78em', fontWeight: 600, fontFamily: 'Rubik',
              background: filtroTipo === k ? GOLD + '22' : 'transparent', color: filtroTipo === k ? GOLD : MUTED,
            }}>{l}</button>
          ))}
        </div>
        <input placeholder="Buscar motivo o empleado..." value={busq} onChange={e => setBusq(e.target.value)}
          style={{ ...S.input, width: 220, padding: '8px 14px' }} />
      </div>

      {/* FORM */}
      {showForm && (
        <div style={{ ...S.card, marginBottom: 18, padding: '24px 28px' }}>
          <div style={{ fontSize: '1.05em', fontWeight: 700, marginBottom: 16, color: TEXT }}>
            {editandoId ? 'Editar Registro' : 'Nuevo Registro de Seguimiento'}
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
              <label style={S.label}>Tipo *</label>
              <select style={{ ...S.input, cursor: 'pointer' }} value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })}>
                {Object.entries(TIPO_MAP).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
              </select>
            </div>
            <div>
              <label style={S.label}>Fecha</label>
              <input type="date" style={S.input} value={form.fecha} onChange={e => setForm({ ...form, fecha: e.target.value })} />
            </div>
            <div>
              <label style={S.label}>Gravedad</label>
              <select style={{ ...S.input, cursor: 'pointer' }} value={form.gravedad} onChange={e => setForm({ ...form, gravedad: e.target.value })}>
                <option value="">—</option>
                {Object.entries(GRAVEDAD_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={S.label}>Motivo *</label>
              <input style={S.input} value={form.motivo} onChange={e => setForm({ ...form, motivo: e.target.value })} placeholder="Resumen breve (ej. Tardías reiteradas)" />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={S.label}>Descripción detallada</label>
              <textarea style={{ ...S.input, minHeight: 70, resize: 'vertical' }} value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })} placeholder="Qué pasó, contexto, hechos concretos..." />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={S.label}>Acción tomada</label>
              <textarea style={{ ...S.input, minHeight: 60, resize: 'vertical' }} value={form.accion_tomada} onChange={e => setForm({ ...form, accion_tomada: e.target.value })} placeholder="Compromiso del empleado, plan de mejora, días de suspensión, etc." />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ ...S.label, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.proceso_legal} onChange={e => setForm({ ...form, proceso_legal: e.target.checked })} />
                <span>Tiene proceso legal asociado</span>
              </label>
            </div>
            {form.proceso_legal && (
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={S.label}>Notas legales</label>
                <textarea style={{ ...S.input, minHeight: 60, resize: 'vertical' }} value={form.notas_legales} onChange={e => setForm({ ...form, notas_legales: e.target.value })} placeholder="Estado del proceso, abogado, fechas clave..." />
              </div>
            )}
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={S.label}>Link a documentos (opcional)</label>
              <input style={S.input} value={form.documentos_url} onChange={e => setForm({ ...form, documentos_url: e.target.value })} placeholder="https://drive.google.com/..." />
            </div>
          </div>
          {esTipoFormal && (
            <div style={{ marginTop: 14, padding: '10px 14px', background: '#f59e0b15', border: '1px solid #f59e0b44', borderRadius: 10, fontSize: '0.82em', color: '#92400e' }}>
              ℹ️ Recordá que los registros formales (llamadas de atención y suspensiones) deben firmarse por el empleado y archivarse en su expediente físico.
            </div>
          )}
          <div style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button onClick={cancelarForm} style={{ ...S.btn('#6b7280', true), padding: '10px 24px', fontSize: '0.9em' }}>Cancelar</button>
            <button onClick={guardar} disabled={saving || !form.motivo.trim() || !form.empleado_id}
              style={{ ...S.btn(GOLD, false), opacity: saving ? 0.6 : 1, padding: '10px 32px', fontSize: '0.9em' }}>
              {saving ? 'Guardando...' : editandoId ? 'Guardar Cambios' : 'Registrar'}
            </button>
          </div>
        </div>
      )}

      {/* LIST */}
      {filtrados.length === 0 ? (
        <div style={{ ...S.card, textAlign: 'center', padding: 40, color: MUTED }}>
          {seguimiento.length === 0 ? 'Aún no hay registros de seguimiento.' : 'No se encontraron resultados.'}
        </div>
      ) : filtrados.map(s => {
        const tipo = TIPO_MAP[s.tipo] || TIPO_MAP.otro
        const grav = GRAVEDAD_MAP[s.gravedad]
        const emp = empleadosMap[s.empleado_id]
        return (
          <div key={s.id} style={{
            ...S.card,
            borderLeft: `4px solid ${tipo.color}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 240 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                  <span style={{ fontSize: '1.2em' }}>{tipo.icon}</span>
                  <span style={{ ...S.badge(tipo.color) }}>{tipo.label}</span>
                  {grav && <span style={S.badge(grav.color)}>{grav.label}</span>}
                  {s.proceso_legal && <span style={S.badge('#8b5cf6')}>⚖️ Proceso legal</span>}
                  <span style={{ fontSize: '0.78em', color: MUTED, marginLeft: 'auto' }}>{fmtFecha(s.fecha)}</span>
                </div>
                <div style={{ fontWeight: 700, fontSize: '0.98em', color: TEXT, marginTop: 6 }}>{emp?.nombre || 'Empleado eliminado'}</div>
                <div style={{ fontSize: '0.92em', color: TEXT, marginTop: 6 }}>{s.motivo}</div>
                {s.descripcion && <div style={{ fontSize: '0.85em', color: MUTED, marginTop: 4 }}>{s.descripcion}</div>}
                {s.accion_tomada && (
                  <div style={{ marginTop: 8, padding: '8px 12px', background: 'rgba(0,0,0,0.04)', borderRadius: 8, fontSize: '0.85em', color: TEXT }}>
                    <strong>Acción:</strong> {s.accion_tomada}
                  </div>
                )}
                {s.proceso_legal && s.notas_legales && (
                  <div style={{ marginTop: 8, padding: '8px 12px', background: '#8b5cf618', borderRadius: 8, fontSize: '0.85em', color: '#5b21b6' }}>
                    <strong>Proceso legal:</strong> {s.notas_legales}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                {s.documentos_url && <a href={s.documentos_url} target="_blank" rel="noreferrer" style={{ ...S.btn('#06b6d4', true), textDecoration: 'none', display: 'inline-block' }}>📄</a>}
                <button onClick={() => iniciarEdicion(s)} style={S.btn('#3b82f6', true)}>Editar</button>
                <button onClick={() => eliminar(s)} style={S.btn('#ef4444', true)}>🗑️</button>
              </div>
            </div>
          </div>
        )
      })}
    </>
  )
}
