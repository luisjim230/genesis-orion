'use client'
import { useState, useMemo, useEffect } from 'react'
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
  puesto: '', departamento: '', sucursal: '', lider_id: '',
  fecha_ingreso: '', fecha_salida: '', fecha_nacimiento: '', fecha_puesto_actual: '',
  estado: 'activo', tipo_contrato: '', salario: '', dias_vacaciones_anuales: 15,
  jornada: '', descripcion_puesto: '', mesa_lideres: false,
  proxima_evaluacion: '', proxima_reunion: '',
  direccion: '', contacto_emergencia_nombre: '', contacto_emergencia_telefono: '',
  observaciones: '', foto_url: '',
}

// Campos cuyos cambios se registran en el historial.
const CAMPOS_HIST = [
  { key: 'puesto', label: 'puesto' },
  { key: 'departamento', label: 'departamento' },
  { key: 'sucursal', label: 'sucursal' },
  { key: 'lider_id', label: 'lider' },
]

export default function TabEmpleados({ empleados, capacitaciones, seguimiento, solicitudes, perfil, catalogos, puedeSalario, recargar, onAbrirFicha, filtroLiderInicial, limpiarFiltroLider }) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ ...FORM_VACIO })
  const [editandoId, setEditandoId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [subiendoFoto, setSubiendoFoto] = useState(false)
  const [busq, setBusq] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('activo')
  const [filtroDepto, setFiltroDepto] = useState('todos')
  const [filtroSucursal, setFiltroSucursal] = useState('todos')
  const [filtroPuesto, setFiltroPuesto] = useState('todos')
  const [filtroLider, setFiltroLider] = useState(filtroLiderInicial || 'todos')

  useEffect(() => {
    if (filtroLiderInicial) { setFiltroLider(filtroLiderInicial); setFiltroEstado('todos') }
  }, [filtroLiderInicial])

  const nombrePorId = useMemo(() => {
    const m = {}
    empleados.forEach(e => { m[e.id] = e.nombre })
    return m
  }, [empleados])

  const filtrados = useMemo(() => {
    let f = empleados
    if (filtroEstado !== 'todos') f = f.filter(e => e.estado === filtroEstado)
    if (filtroDepto !== 'todos') f = f.filter(e => e.departamento === filtroDepto)
    if (filtroSucursal !== 'todos') f = f.filter(e => e.sucursal === filtroSucursal)
    if (filtroPuesto !== 'todos') f = f.filter(e => e.puesto === filtroPuesto)
    if (filtroLider !== 'todos') f = f.filter(e => e.lider_id === filtroLider)
    if (busq) {
      const q = busq.toLowerCase()
      f = f.filter(e => (e.nombre || '').toLowerCase().includes(q) || (e.puesto || '').toLowerCase().includes(q) || (e.cedula || '').toLowerCase().includes(q) || (e.codigo_interno || '').toLowerCase().includes(q))
    }
    return f
  }, [empleados, filtroEstado, filtroDepto, filtroSucursal, filtroPuesto, filtroLider, busq])

  const kpis = useMemo(() => ({
    activos: empleados.filter(e => e.estado === 'activo').length,
    total: empleados.length,
    lideres: empleados.filter(e => e.mesa_lideres).length,
    departamentos: new Set(empleados.map(e => e.departamento).filter(Boolean)).size,
  }), [empleados])

  function iniciarEdicion(e) {
    setForm({
      nombre: e.nombre || '', cedula: e.cedula || '', telefono: e.telefono || '', email: e.email || '',
      puesto: e.puesto || '', departamento: e.departamento || '', sucursal: e.sucursal || '', lider_id: e.lider_id || '',
      fecha_ingreso: e.fecha_ingreso || '', fecha_salida: e.fecha_salida || '',
      fecha_nacimiento: e.fecha_nacimiento || '', fecha_puesto_actual: e.fecha_puesto_actual || '',
      estado: e.estado || 'activo', tipo_contrato: e.tipo_contrato || '',
      salario: e.salario ?? '', dias_vacaciones_anuales: e.dias_vacaciones_anuales ?? 15,
      jornada: e.jornada || '', descripcion_puesto: e.descripcion_puesto || '', mesa_lideres: !!e.mesa_lideres,
      proxima_evaluacion: e.proxima_evaluacion || '', proxima_reunion: e.proxima_reunion || '',
      direccion: e.direccion || '',
      contacto_emergencia_nombre: e.contacto_emergencia_nombre || '',
      contacto_emergencia_telefono: e.contacto_emergencia_telefono || '',
      observaciones: e.observaciones || '', foto_url: e.foto_url || '',
    })
    setEditandoId(e.id)
    setShowForm(true)
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelarForm() {
    setForm({ ...FORM_VACIO })
    setEditandoId(null)
    setShowForm(false)
  }

  async function subirFoto(file) {
    if (!file) return
    if (!file.type.startsWith('image/')) { alert('La foto debe ser una imagen.'); return }
    if (file.size > 5 * 1024 * 1024) { alert('La foto supera los 5 MB.'); return }
    setSubiendoFoto(true)
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
      const path = `emp-${Date.now()}-${Math.floor(Math.random() * 1e6)}.${ext}`
      const { error } = await supabase.storage.from('rrhh-fotos').upload(path, file, { upsert: true, contentType: file.type })
      if (error) throw error
      const { data } = supabase.storage.from('rrhh-fotos').getPublicUrl(path)
      setForm(f => ({ ...f, foto_url: data.publicUrl }))
    } catch (ex) {
      alert('No se pudo subir la foto: ' + (ex.message || ex))
    }
    setSubiendoFoto(false)
  }

  // Inserta un valor nuevo en un catálogo (departamento/sucursal/puesto) y lo selecciona.
  async function agregarCatalogo(tabla, campoForm) {
    const nombre = (typeof window !== 'undefined' ? window.prompt('Nombre del nuevo valor:') : '')?.trim()
    if (!nombre) return
    const { error } = await supabase.from(tabla).insert([{ nombre }])
    if (error && !String(error.message).includes('duplicate')) { alert('No se pudo agregar: ' + error.message); return }
    setForm(f => ({ ...f, [campoForm]: nombre }))
    recargar()
  }

  async function guardar() {
    if (!form.nombre.trim()) return
    setSaving(true)
    const original = editandoId ? empleados.find(e => e.id === editandoId) : null

    const datos = {
      nombre: form.nombre, cedula: form.cedula || null, telefono: form.telefono || null, email: form.email || null,
      puesto: form.puesto || null, departamento: form.departamento || null, sucursal: form.sucursal || null,
      lider_id: form.lider_id || null,
      fecha_ingreso: form.fecha_ingreso || null,
      fecha_nacimiento: form.fecha_nacimiento || null, fecha_puesto_actual: form.fecha_puesto_actual || null,
      estado: form.estado, tipo_contrato: form.tipo_contrato || null,
      dias_vacaciones_anuales: form.dias_vacaciones_anuales === '' ? null : Number(form.dias_vacaciones_anuales),
      jornada: form.jornada || null, descripcion_puesto: form.descripcion_puesto || null, mesa_lideres: !!form.mesa_lideres,
      proxima_evaluacion: form.proxima_evaluacion || null, proxima_reunion: form.proxima_reunion || null,
      direccion: form.direccion || null,
      contacto_emergencia_nombre: form.contacto_emergencia_nombre || null,
      contacto_emergencia_telefono: form.contacto_emergencia_telefono || null,
      observaciones: form.observaciones || null, foto_url: form.foto_url || null,
      actualizado_en: new Date().toISOString(),
    }
    // La fecha de salida queda vacía mientras el colaborador esté activo.
    datos.fecha_salida = form.estado === 'activo' ? null : (form.fecha_salida || null)
    // El salario solo se escribe si el usuario tiene permiso (evita borrarlo sin querer).
    if (puedeSalario) datos.salario = form.salario === '' ? null : Number(form.salario)

    let empId = editandoId
    if (editandoId) {
      await supabase.from('rrhh_empleados').update(datos).eq('id', editandoId)
    } else {
      const { data: ins } = await supabase.from('rrhh_empleados').insert([{ ...datos, creado_por: perfil?.nombre || 'Sistema' }]).select('id').single()
      empId = ins?.id
    }

    // Registrar en el historial los cambios de puesto/departamento/líder/sucursal.
    if (editandoId && original && empId) {
      const filas = []
      for (const c of CAMPOS_HIST) {
        const antes = original[c.key] || null
        const ahora = datos[c.key] || null
        if (antes !== ahora) {
          filas.push({
            empleado_id: empId, campo: c.label,
            valor_anterior: c.key === 'lider_id' ? (nombrePorId[antes] || null) : antes,
            valor_nuevo: c.key === 'lider_id' ? (nombrePorId[ahora] || null) : ahora,
            usuario: perfil?.nombre || 'Sistema',
          })
        }
      }
      if (filas.length) await supabase.from('rrhh_empleados_historial').insert(filas)
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

  const deptos = catalogos?.departamentos || []
  const sucursales = catalogos?.sucursales || []
  const puestos = catalogos?.puestos || []
  const posiblesLideres = empleados.filter(e => e.id !== editandoId)

  return (
    <>
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 20 }}>
        {[
          { label: 'Colaboradores activos', val: kpis.activos, color: '#22c55e' },
          { label: 'Total registrados', val: kpis.total, color: GOLD },
          { label: 'Mesa de Líderes', val: kpis.lideres, color: '#8b5cf6' },
          { label: 'Departamentos', val: kpis.departamentos, color: '#3b82f6' },
        ].map(k => (
          <div key={k.label} style={{ ...S.card, textAlign: 'center', padding: '18px 16px' }}>
            <div style={{ fontSize: '1.8em', fontWeight: 700, color: k.color }}>{k.val}</div>
            <div style={{ fontSize: '0.78em', color: MUTED, marginTop: 2 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* TOOLBAR */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <button onClick={() => { if (showForm) cancelarForm(); else setShowForm(true) }} style={{ ...S.btn(GOLD, false), borderRadius: 14, padding: '9px 22px' }}>
          {showForm ? 'Cancelar' : '+ Nuevo Colaborador'}
        </button>
        <input placeholder="Buscar nombre, puesto, cédula, código..." value={busq} onChange={e => setBusq(e.target.value)}
          style={{ ...S.input, width: 260, padding: '8px 14px', marginLeft: 'auto' }} />
      </div>

      {/* FILTROS */}
      <div style={{ ...S.card, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 16 }}>
        <FiltroSelect label="Departamento" value={filtroDepto} onChange={setFiltroDepto} opts={deptos.map(d => d.nombre)} />
        <FiltroSelect label="Sucursal" value={filtroSucursal} onChange={setFiltroSucursal} opts={sucursales.map(s => s.nombre)} />
        <FiltroSelect label="Puesto" value={filtroPuesto} onChange={setFiltroPuesto} opts={puestos.map(p => p.nombre)} />
        <FiltroSelect label="Líder directo" value={filtroLider} onChange={setFiltroLider}
          opts={empleados.filter(e => empleados.some(x => x.lider_id === e.id)).map(e => ({ v: e.id, l: e.nombre }))} />
        <div style={{ flex: '1 1 150px', minWidth: 130 }}>
          <label style={S.label}>Estado</label>
          <select style={{ ...S.input, cursor: 'pointer' }} value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}>
            <option value="todos">Todos</option>
            <option value="activo">Activos</option>
            <option value="inactivo">Inactivos</option>
            <option value="suspendido">Suspendidos</option>
            <option value="vacaciones">En vacaciones</option>
          </select>
        </div>
        {(filtroDepto !== 'todos' || filtroSucursal !== 'todos' || filtroPuesto !== 'todos' || filtroLider !== 'todos' || filtroEstado !== 'activo') && (
          <button onClick={() => { setFiltroDepto('todos'); setFiltroSucursal('todos'); setFiltroPuesto('todos'); setFiltroLider('todos'); setFiltroEstado('activo'); limpiarFiltroLider?.() }}
            style={{ ...S.btn('#6b7280', true), padding: '8px 14px' }}>Limpiar filtros</button>
        )}
      </div>

      {filtroLider !== 'todos' && nombrePorId[filtroLider] && (
        <div style={{ marginBottom: 12, fontSize: '0.88em', color: TEXT }}>
          Mostrando el equipo de <b>{nombrePorId[filtroLider]}</b> · {filtrados.length} persona{filtrados.length !== 1 ? 's' : ''}
        </div>
      )}

      {/* FORM */}
      {showForm && (
        <div style={{ ...S.card, marginBottom: 18, padding: '24px 28px' }}>
          <div style={{ fontSize: '1.05em', fontWeight: 700, marginBottom: 16, color: TEXT }}>
            {editandoId ? 'Editar Colaborador' : 'Nuevo Colaborador'}
          </div>

          {/* FOTO */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 18 }}>
            <div style={{ width: 72, height: 72, borderRadius: '50%', overflow: 'hidden', background: colorAvatar(form.nombre || '?'), color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '1.4em', flexShrink: 0 }}>
              {form.foto_url ? <img src={form.foto_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : iniciales(form.nombre || '?')}
            </div>
            <div>
              <label style={S.label}>Foto</label>
              <input id="foto-input" type="file" accept="image/*" style={{ display: 'none' }} onChange={e => subirFoto(e.target.files?.[0])} />
              <div style={{ display: 'flex', gap: 8 }}>
                <label htmlFor="foto-input" style={{ ...S.btn('#3b82f6', true), cursor: 'pointer', display: 'inline-block' }}>
                  {subiendoFoto ? 'Subiendo…' : (form.foto_url ? 'Cambiar foto' : '📷 Subir foto')}
                </label>
                {form.foto_url && <button onClick={() => setForm(f => ({ ...f, foto_url: '' }))} style={{ ...S.btn('#ef4444', true) }}>Quitar</button>}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
            <Field label="Nombre completo *" value={form.nombre} onChange={v => setForm({ ...form, nombre: v })} placeholder="Ej. Ana Mora Rodríguez" />
            <Field label="Cédula" value={form.cedula} onChange={v => setForm({ ...form, cedula: v })} placeholder="1-2345-6789" />
            <Field label="Teléfono" value={form.telefono} onChange={v => setForm({ ...form, telefono: v })} placeholder="+506 8888-8888" />
            <Field label="Correo" value={form.email} onChange={v => setForm({ ...form, email: v })} placeholder="ana@deposito.com" />

            <SelectCatalogo label="Puesto" value={form.puesto} onChange={v => setForm({ ...form, puesto: v })}
              opts={puestos.map(p => p.nombre)} onAgregar={() => agregarCatalogo('rrhh_puestos', 'puesto')} />
            <SelectCatalogo label="Departamento" value={form.departamento} onChange={v => setForm({ ...form, departamento: v })}
              opts={deptos.map(d => d.nombre)} onAgregar={() => agregarCatalogo('rrhh_departamentos', 'departamento')} />
            <SelectCatalogo label="Sucursal / ubicación" value={form.sucursal} onChange={v => setForm({ ...form, sucursal: v })}
              opts={sucursales.map(s => s.nombre)} onAgregar={() => agregarCatalogo('rrhh_sucursales', 'sucursal')} />
            <div>
              <label style={S.label}>Líder directo</label>
              <select style={{ ...S.input, cursor: 'pointer' }} value={form.lider_id} onChange={e => setForm({ ...form, lider_id: e.target.value })}>
                <option value="">— Sin líder —</option>
                {posiblesLideres.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
              </select>
            </div>

            <Field label="Fecha de nacimiento" type="date" value={form.fecha_nacimiento} onChange={v => setForm({ ...form, fecha_nacimiento: v })} />
            <Field label="Fecha de ingreso" type="date" value={form.fecha_ingreso} onChange={v => setForm({ ...form, fecha_ingreso: v })} />
            <Field label="Inicio en el puesto actual" type="date" value={form.fecha_puesto_actual} onChange={v => setForm({ ...form, fecha_puesto_actual: v })} />
            <Field label="Horario / jornada" value={form.jornada} onChange={v => setForm({ ...form, jornada: v })} placeholder="Ej. L-V 8am-5pm" />

            <div>
              <label style={S.label}>Estado</label>
              <select style={{ ...S.input, cursor: 'pointer' }} value={form.estado} onChange={e => setForm({ ...form, estado: e.target.value })}>
                <option value="activo">Activo</option>
                <option value="inactivo">Inactivo</option>
                <option value="suspendido">Suspendido</option>
                <option value="vacaciones">En vacaciones</option>
              </select>
            </div>
            {form.estado !== 'activo'
              ? <Field label="Fecha de salida" type="date" value={form.fecha_salida} onChange={v => setForm({ ...form, fecha_salida: v })} />
              : <div style={{ display: 'flex', alignItems: 'flex-end', fontSize: '0.78em', color: MUTED, paddingBottom: 10 }}>La fecha de salida se habilita al marcar el estado como inactivo o suspendido.</div>}

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
            {puedeSalario
              ? <Field label="Salario (₡)" type="number" value={form.salario} onChange={v => setForm({ ...form, salario: v })} placeholder="0" />
              : <div style={{ display: 'flex', alignItems: 'flex-end', fontSize: '0.78em', color: MUTED, paddingBottom: 10 }}>🔒 Salario restringido (no tenés permiso para verlo ni editarlo).</div>}
            <Field label="Días de vacaciones anuales" type="number" value={form.dias_vacaciones_anuales} onChange={v => setForm({ ...form, dias_vacaciones_anuales: v })} placeholder="15" />

            <Field label="Próxima evaluación" type="date" value={form.proxima_evaluacion} onChange={v => setForm({ ...form, proxima_evaluacion: v })} />
            <Field label="Próxima reunión individual" type="date" value={form.proxima_reunion} onChange={v => setForm({ ...form, proxima_reunion: v })} />

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={S.label}>Descripción del puesto</label>
              <textarea style={{ ...S.input, minHeight: 60, resize: 'vertical' }} value={form.descripcion_puesto} onChange={e => setForm({ ...form, descripcion_puesto: e.target.value })} placeholder="Responsabilidades principales del puesto" />
            </div>

            <label style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', background: form.mesa_lideres ? '#8b5cf618' : 'rgba(0,0,0,0.03)', border: `1px solid ${form.mesa_lideres ? '#8b5cf655' : 'rgba(0,0,0,0.1)'}`, borderRadius: 12, padding: '12px 16px' }}>
              <input type="checkbox" checked={form.mesa_lideres} onChange={e => setForm({ ...form, mesa_lideres: e.target.checked })} style={{ accentColor: '#8b5cf6', width: 16, height: 16 }} />
              <span style={{ fontSize: '0.9em', fontWeight: 600, color: TEXT }}>🏛️ Pertenece a la Mesa de Líderes</span>
            </label>

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
            <button onClick={guardar} disabled={saving || subiendoFoto || !form.nombre.trim()}
              style={{ ...S.btn(GOLD, false), opacity: saving ? 0.6 : 1, padding: '10px 32px', fontSize: '0.9em' }}>
              {saving ? 'Guardando...' : editandoId ? 'Guardar Cambios' : 'Crear Colaborador'}
            </button>
          </div>
        </div>
      )}

      {/* GRID DE TARJETAS */}
      {filtrados.length === 0 ? (
        <div style={{ ...S.card, textAlign: 'center', padding: 40, color: MUTED }}>
          {empleados.length === 0 ? 'Aún no hay colaboradores registrados. Hacé clic en "+ Nuevo Colaborador" para empezar.' : 'No se encontraron resultados con estos filtros.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
          {filtrados.map(e => {
            const numCap = capacitaciones.filter(c => c.empleado_id === e.id && c.estado === 'completada').length
            const numSeg = seguimiento.filter(s => s.empleado_id === e.id).length
            const aCargo = empleados.filter(x => x.lider_id === e.id).length
            const estColor = ESTADO_COLOR[e.estado] || '#6b7280'
            return (
              <div key={e.id} style={{ ...S.card, padding: 18, cursor: 'pointer', transition: 'transform .15s' }}
                onClick={() => onAbrirFicha(e.id)}
                onMouseEnter={ev => ev.currentTarget.style.transform = 'translateY(-2px)'}
                onMouseLeave={ev => ev.currentTarget.style.transform = 'translateY(0)'}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                  <div style={{ width: 48, height: 48, borderRadius: '50%', overflow: 'hidden', background: colorAvatar(e.nombre), color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '1.1em', flexShrink: 0 }}>
                    {e.foto_url ? <img src={e.foto_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : iniciales(e.nombre)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.98em', color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {e.nombre} {e.mesa_lideres && <span title="Mesa de Líderes">🏛️</span>}
                    </div>
                    <div style={{ fontSize: '0.78em', color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {e.puesto || 'Sin puesto'}{e.departamento ? ` · ${e.departamento}` : ''}
                    </div>
                    {e.codigo_interno && <div style={{ fontSize: '0.7em', color: MUTED, fontFamily: 'monospace' }}>{e.codigo_interno}</div>}
                  </div>
                  <div style={S.badge(estColor)}>{(e.estado || 'activo').replace(/_/g, ' ')}</div>
                </div>
                <div style={{ display: 'flex', gap: 12, fontSize: '0.76em', color: MUTED, marginBottom: 8, flexWrap: 'wrap' }}>
                  {e.sucursal && <div>📍 {e.sucursal}</div>}
                  {e.lider_id && <div>👤 Líder: {empleados.find(x => x.id === e.lider_id)?.nombre || '—'}</div>}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {aCargo > 0 && <span style={S.badge('#8b5cf6')}>{aCargo} a cargo</span>}
                  <span style={S.badge('#3b82f6')}>{numCap} capacitación{numCap !== 1 ? 'es' : ''}</span>
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

function SelectCatalogo({ label, value, onChange, opts, onAgregar }) {
  return (
    <div>
      <label style={S.label}>{label}</label>
      <div style={{ display: 'flex', gap: 6 }}>
        <select style={{ ...S.input, cursor: 'pointer' }} value={value} onChange={e => onChange(e.target.value)}>
          <option value="">—</option>
          {opts.map(o => <option key={o} value={o}>{o}</option>)}
          {value && !opts.includes(value) && <option value={value}>{value}</option>}
        </select>
        <button type="button" onClick={onAgregar} title="Agregar nuevo" style={{ ...S.btn(GOLD, true), padding: '0 12px', flexShrink: 0 }}>＋</button>
      </div>
    </div>
  )
}

function FiltroSelect({ label, value, onChange, opts }) {
  // opts puede ser array de strings o de { v, l }
  const items = opts.map(o => (typeof o === 'string' ? { v: o, l: o } : o))
  return (
    <div style={{ flex: '1 1 150px', minWidth: 130 }}>
      <label style={S.label}>{label}</label>
      <select style={{ ...S.input, cursor: 'pointer' }} value={value} onChange={e => onChange(e.target.value)}>
        <option value="todos">Todos</option>
        {items.map(it => <option key={it.v} value={it.v}>{it.l}</option>)}
      </select>
    </div>
  )
}
