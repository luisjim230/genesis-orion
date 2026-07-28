'use client'
import { useMemo } from 'react'
import { GOLD, TEXT, MUTED, S, fmtFecha, iniciales, colorAvatar } from './_styles'

const ESTADO_COLOR = { activo: '#22c55e', inactivo: '#6b7280', suspendido: '#ef4444', vacaciones: '#3b82f6' }

const TIPO_SEG = {
  reconocimiento: { label: 'Reconocimiento', color: '#22c55e' },
  observacion: { label: 'Observación', color: '#3b82f6' },
  llamada_atencion: { label: 'Llamada de atención', color: '#f59e0b' },
  suspension: { label: 'Suspensión', color: '#ef4444' },
  otro: { label: 'Otro', color: '#6b7280' },
}

export default function FichaEmpleado({ empleado, empleados = [], capacitaciones, seguimiento, solicitudes, historial = [], puedeSalario, onClose, onAbrirFicha, onIrA }) {
  const capsEmp = useMemo(() => capacitaciones.filter(c => c.empleado_id === empleado.id).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '')), [capacitaciones, empleado.id])
  const segEmp = useMemo(() => seguimiento.filter(s => s.empleado_id === empleado.id).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '')), [seguimiento, empleado.id])
  const lider = useMemo(() => empleados.find(e => e.id === empleado.lider_id), [empleados, empleado.lider_id])
  const aCargo = useMemo(() => empleados.filter(e => e.lider_id === empleado.id).sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '')), [empleados, empleado.id])
  const histEmp = useMemo(() => historial.filter(h => h.empleado_id === empleado.id).sort((a, b) => (b.creado_en || '').localeCompare(a.creado_en || '')), [historial, empleado.id])

  // Días de vacaciones usados en el año vigente
  const vacaciones = useMemo(() => {
    const year = new Date().getFullYear()
    const usados = solicitudes
      .filter(s => s.estado === 'aprobado' && s.tipo === 'vacaciones' && s.fecha_inicio?.startsWith(String(year)))
      .filter(s => (s.empleado_id === empleado.id) || (!s.empleado_id && s.empleado_nombre?.trim().toLowerCase() === empleado.nombre.trim().toLowerCase()))
      .reduce((acc, s) => acc + (s.dias_totales || 0), 0)
    const total = empleado.dias_vacaciones_anuales || 15
    return { usados, total, pct: Math.min(100, total > 0 ? (usados / total) * 100 : 0) }
  }, [solicitudes, empleado])

  const tieneProcesoLegal = segEmp.some(s => s.proceso_legal)
  const estColor = ESTADO_COLOR[empleado.estado] || '#6b7280'

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20,
    }}>
      <div onClick={ev => ev.stopPropagation()} style={{
        background: '#1f242c', color: 'rgba(255,255,255,0.92)', borderRadius: 18,
        padding: '28px 32px', width: '100%', maxWidth: 640, maxHeight: '90vh', overflowY: 'auto',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)', fontFamily: 'Rubik',
      }}>
        {/* HEADER */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, paddingBottom: 18, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', overflow: 'hidden', background: colorAvatar(empleado.nombre), color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '1.3em', flexShrink: 0 }}>
            {empleado.foto_url ? <img src={empleado.foto_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : iniciales(empleado.nombre)}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '1.3em', fontWeight: 700 }}>
              {empleado.nombre} {empleado.mesa_lideres && <span title="Mesa de Líderes" style={{ fontSize: '0.8em' }}>🏛️</span>}
            </div>
            <div style={{ fontSize: '0.85em', color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>
              {empleado.puesto || 'Sin puesto'}{empleado.departamento ? ` · ${empleado.departamento}` : ''}{empleado.sucursal ? ` · ${empleado.sucursal}` : ''}
            </div>
            {empleado.codigo_interno && <div style={{ fontSize: '0.74em', color: 'rgba(255,255,255,0.4)', marginTop: 2, fontFamily: 'monospace' }}>{empleado.codigo_interno}</div>}
          </div>
          <div style={{
            background: estColor + '22', color: estColor, border: `1px solid ${estColor}55`,
            borderRadius: 20, padding: '4px 14px', fontSize: '0.78em', fontWeight: 600,
          }}>{(empleado.estado || 'activo').replace(/_/g, ' ')}</div>
        </div>

        {/* PUESTO Y ORGANIZACIÓN */}
        <Section titulo="Puesto y organización">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <DataBox label="Puesto" value={empleado.puesto || '—'} />
            <DataBox label="Departamento" value={empleado.departamento || '—'} />
            <DataBox label="Sucursal / ubicación" value={empleado.sucursal || '—'} />
            <DataBox label="Líder directo" value={lider ? lider.nombre : '—'} onClick={lider && onAbrirFicha ? () => onAbrirFicha(lider.id) : null} />
            {empleado.jornada && <DataBox label="Horario / jornada" value={empleado.jornada} />}
            {empleado.fecha_puesto_actual && <DataBox label="Inicio en el puesto actual" value={fmtFecha(empleado.fecha_puesto_actual)} />}
            {empleado.mesa_lideres && <DataBox label="Mesa de Líderes" value="Sí 🏛️" />}
            {puedeSalario && <DataBox label="Salario" value={empleado.salario != null ? `₡${Number(empleado.salario).toLocaleString('es-CR')}` : '—'} />}
          </div>
          {empleado.descripcion_puesto && <div style={{ marginTop: 10 }}><DataBox label="Descripción del puesto" value={empleado.descripcion_puesto} /></div>}
          {(empleado.proxima_evaluacion || empleado.proxima_reunion) && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
              {empleado.proxima_evaluacion && <DataBox label="Próxima evaluación" value={fmtFecha(empleado.proxima_evaluacion)} />}
              {empleado.proxima_reunion && <DataBox label="Próxima reunión 1:1" value={fmtFecha(empleado.proxima_reunion)} />}
            </div>
          )}
        </Section>

        {/* PERSONAS A CARGO */}
        {aCargo.length > 0 && (
          <Section titulo={`Personas a cargo · ${aCargo.length}`}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {aCargo.map(p => (
                <div key={p.id} onClick={() => onAbrirFicha && onAbrirFicha(p.id)} style={{
                  display: 'flex', alignItems: 'center', gap: 8, cursor: onAbrirFicha ? 'pointer' : 'default',
                  background: 'rgba(255,255,255,0.05)', borderRadius: 20, padding: '5px 12px 5px 5px',
                }}>
                  <div style={{ width: 26, height: 26, borderRadius: '50%', overflow: 'hidden', background: colorAvatar(p.nombre), color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.7em' }}>
                    {p.foto_url ? <img src={p.foto_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : iniciales(p.nombre)}
                  </div>
                  <span style={{ fontSize: '0.82em' }}>{p.nombre}</span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* DATOS PERSONALES */}
        <Section titulo="Datos personales">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <DataBox label="Cédula" value={empleado.cedula || '—'} />
            <DataBox label="Teléfono" value={empleado.telefono || '—'} />
            <DataBox label="Correo" value={empleado.email || '—'} />
            {empleado.fecha_nacimiento && <DataBox label="Fecha de nacimiento" value={fmtFecha(empleado.fecha_nacimiento)} />}
            <DataBox label="Fecha de ingreso" value={fmtFecha(empleado.fecha_ingreso)} />
            {empleado.tipo_contrato && <DataBox label="Contrato" value={empleado.tipo_contrato.replace(/_/g, ' ')} />}
            {empleado.fecha_salida && <DataBox label="Fecha de salida" value={fmtFecha(empleado.fecha_salida)} />}
          </div>
          {(empleado.contacto_emergencia_nombre || empleado.contacto_emergencia_telefono) && (
            <div style={{ marginTop: 10 }}>
              <DataBox label="Contacto de emergencia" value={`${empleado.contacto_emergencia_nombre || '—'}${empleado.contacto_emergencia_telefono ? ' · ' + empleado.contacto_emergencia_telefono : ''}`} />
            </div>
          )}
          {empleado.direccion && <div style={{ marginTop: 10 }}><DataBox label="Dirección" value={empleado.direccion} /></div>}
        </Section>

        {/* VACACIONES */}
        <Section titulo="Vacaciones">
          <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: '14px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: '0.88em' }}>
              <span style={{ color: 'rgba(255,255,255,0.6)' }}>Días usados</span>
              <span style={{ fontWeight: 700 }}>{vacaciones.usados} de {vacaciones.total} días</span>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 6, height: 8, overflow: 'hidden' }}>
              <div style={{
                width: `${vacaciones.pct}%`, height: '100%',
                background: vacaciones.pct > 80 ? '#ef4444' : vacaciones.pct > 50 ? '#f59e0b' : '#22c55e',
              }} />
            </div>
          </div>
        </Section>

        {/* CAPACITACIONES */}
        <Section titulo={`Capacitaciones recibidas`}>
          <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: '14px 16px' }}>
            <div style={{ fontWeight: 700, marginBottom: capsEmp.length ? 10 : 0 }}>
              {capsEmp.filter(c => c.estado === 'completada').length} capacitaci{capsEmp.filter(c => c.estado === 'completada').length === 1 ? 'ón completada' : 'ones completadas'}
            </div>
            {capsEmp.slice(0, 5).map(c => (
              <div key={c.id} style={{ padding: '8px 0', borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: '0.86em' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontWeight: 600 }}>{c.titulo}</span>
                  <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.86em', flexShrink: 0 }}>{fmtFecha(c.fecha)}</span>
                </div>
                {c.institucion && <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.85em', marginTop: 2 }}>{c.institucion}</div>}
              </div>
            ))}
            {capsEmp.length > 5 && <div style={{ marginTop: 8, fontSize: '0.82em', color: 'rgba(255,255,255,0.5)' }}>+{capsEmp.length - 5} más...</div>}
          </div>
        </Section>

        {/* SEGUIMIENTO */}
        <Section titulo="Seguimiento">
          {segEmp.length === 0 ? (
            <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: '14px 16px', color: 'rgba(255,255,255,0.5)', fontSize: '0.88em' }}>
              Sin registros de seguimiento.
            </div>
          ) : segEmp.slice(0, 6).map(s => {
            const t = TIPO_SEG[s.tipo] || TIPO_SEG.otro
            return (
              <div key={s.id} style={{
                background: t.color + '15', borderLeft: `3px solid ${t.color}`,
                borderRadius: 8, padding: '10px 14px', marginBottom: 8,
              }}>
                <div style={{ fontSize: '0.78em', color: 'rgba(255,255,255,0.6)' }}>{fmtFecha(s.fecha)}</div>
                <div style={{ fontWeight: 700, color: t.color, marginTop: 2 }}>{t.label}</div>
                <div style={{ fontSize: '0.88em', color: 'rgba(255,255,255,0.85)', marginTop: 4 }}>{s.motivo}</div>
                {s.descripcion && <div style={{ fontSize: '0.82em', color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>{s.descripcion}</div>}
              </div>
            )
          })}
          {segEmp.length > 6 && <div style={{ fontSize: '0.82em', color: 'rgba(255,255,255,0.5)' }}>+{segEmp.length - 6} más...</div>}
        </Section>

        {/* HISTORIAL DE CAMBIOS */}
        <Section titulo="Historial de cambios">
          {histEmp.length === 0 ? (
            <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: '14px 16px', color: 'rgba(255,255,255,0.5)', fontSize: '0.88em' }}>
              Sin cambios registrados de puesto, departamento, líder o sucursal.
            </div>
          ) : histEmp.slice(0, 12).map(h => (
            <div key={h.id} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: '10px 14px', marginBottom: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: '0.82em', fontWeight: 700, textTransform: 'capitalize' }}>{h.campo}</span>
                <span style={{ fontSize: '0.76em', color: 'rgba(255,255,255,0.5)' }}>{h.creado_en ? new Date(h.creado_en).toLocaleDateString('es-CR') : ''}</span>
              </div>
              <div style={{ fontSize: '0.84em', color: 'rgba(255,255,255,0.8)', marginTop: 2 }}>
                <span style={{ color: 'rgba(255,255,255,0.5)' }}>{h.valor_anterior || '—'}</span>
                {' → '}
                <span style={{ fontWeight: 600 }}>{h.valor_nuevo || '—'}</span>
              </div>
              {h.usuario && <div style={{ fontSize: '0.74em', color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>por {h.usuario}</div>}
            </div>
          ))}
        </Section>

        {/* BOTONES */}
        <div style={{ display: 'flex', gap: 10, marginTop: 24, flexWrap: 'wrap' }}>
          <button onClick={onClose} style={{
            background: 'transparent', color: 'rgba(255,255,255,0.85)',
            border: '1px solid rgba(255,255,255,0.2)', borderRadius: 12,
            padding: '9px 22px', fontSize: '0.88em', cursor: 'pointer', fontFamily: 'Rubik', fontWeight: 600,
          }}>Cerrar</button>
          {tieneProcesoLegal && (
            <button onClick={() => onIrA('seguimiento', empleado.id)} style={{
              background: 'transparent', color: '#f59e0b',
              border: '1px solid #f59e0b88', borderRadius: 12,
              padding: '9px 22px', fontSize: '0.88em', cursor: 'pointer', fontFamily: 'Rubik', fontWeight: 600,
            }}>Consultar proceso legal</button>
          )}
          <button onClick={() => onIrA('capacitaciones', empleado.id)} style={{
            background: 'transparent', color: '#a78bfa',
            border: '1px solid #a78bfa88', borderRadius: 12,
            padding: '9px 22px', fontSize: '0.88em', cursor: 'pointer', fontFamily: 'Rubik', fontWeight: 600,
          }}>+ Capacitación</button>
          <button onClick={() => onIrA('seguimiento', empleado.id)} style={{
            background: 'transparent', color: '#fbbf24',
            border: '1px solid #fbbf2488', borderRadius: 12,
            padding: '9px 22px', fontSize: '0.88em', cursor: 'pointer', fontFamily: 'Rubik', fontWeight: 600,
          }}>+ Seguimiento</button>
        </div>
      </div>
    </div>
  )
}

function Section({ titulo, children }) {
  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ fontSize: '0.72em', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', marginBottom: 10 }}>{titulo}</div>
      {children}
    </div>
  )
}

function DataBox({ label, value, onClick }) {
  return (
    <div onClick={onClick || undefined} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: '10px 14px', cursor: onClick ? 'pointer' : 'default' }}>
      <div style={{ fontSize: '0.72em', color: 'rgba(255,255,255,0.5)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: '0.92em', fontWeight: 600, color: onClick ? '#c8a84b' : undefined }}>{value}</div>
    </div>
  )
}
