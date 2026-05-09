'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/useAuth'
import { S, GOLD, BG, TEXT, MUTED } from './_styles'
import TabSolicitudes, { TabCalendario } from './_solicitudes'
import TabEmpleados from './_empleados'
import TabCapacitaciones from './_capacitaciones'
import TabSeguimiento from './_seguimiento'
import FichaEmpleado from './_ficha'

const TABS = [
  { key: 'empleados', label: '👥 Empleados' },
  { key: 'solicitudes', label: '📅 Solicitudes' },
  { key: 'calendario', label: '🗓️ Calendario' },
  { key: 'capacitaciones', label: '🎓 Capacitaciones' },
  { key: 'seguimiento', label: '📋 Seguimiento' },
]

export default function RRHHPage() {
  const { perfil, loading: authLoad } = useAuth()
  const [tab, setTab] = useState('empleados')
  const [loading, setLoading] = useState(true)
  const [empleados, setEmpleados] = useState([])
  const [solicitudes, setSolicitudes] = useState([])
  const [capacitaciones, setCapacitaciones] = useState([])
  const [seguimiento, setSeguimiento] = useState([])
  const [fichaId, setFichaId] = useState(null)
  const [empleadoIdNuevo, setEmpleadoIdNuevo] = useState({ capacitaciones: null, seguimiento: null })

  const cargar = useCallback(async () => {
    setLoading(true)
    const [emp, sol, cap, seg] = await Promise.all([
      supabase.from('rrhh_empleados').select('*').order('nombre', { ascending: true }),
      supabase.from('rrhh_solicitudes').select('*').order('creado_en', { ascending: false }),
      supabase.from('rrhh_capacitaciones').select('*').order('creado_en', { ascending: false }),
      supabase.from('rrhh_seguimiento').select('*').order('creado_en', { ascending: false }),
    ])
    setEmpleados(emp.data || [])
    setSolicitudes(sol.data || [])
    setCapacitaciones(cap.data || [])
    setSeguimiento(seg.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const fichaEmp = useMemo(() => empleados.find(e => e.id === fichaId), [empleados, fichaId])

  function irA(destino, empleadoId) {
    setFichaId(null)
    setEmpleadoIdNuevo(prev => ({ ...prev, [destino]: empleadoId }))
    setTab(destino)
  }

  if (authLoad || loading) return (
    <div style={{ minHeight: '100vh', background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Rubik' }}>
      <div style={{ ...S.card, padding: 40, textAlign: 'center' }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>Cargando...</div>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: BG, fontFamily: 'Rubik', color: TEXT, padding: '24px 28px' }}>
      {/* HEADER */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 14 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.6em', fontWeight: 700, color: TEXT }}>Recursos Humanos</h1>
          <p style={{ margin: '4px 0 0', color: MUTED, fontSize: '0.88em' }}>Gestión integral del personal del Depósito</p>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              borderRadius: 14, padding: '8px 18px', fontSize: '0.85em',
              fontWeight: 600, fontFamily: 'Rubik', cursor: 'pointer',
              border: tab === t.key ? `1.5px solid ${GOLD}` : '1.5px solid rgba(0,0,0,0.08)',
              background: tab === t.key ? GOLD : 'rgba(255,255,255,0.5)',
              color: tab === t.key ? '#fff' : TEXT,
              transition: 'all .15s',
            }}>{t.label}</button>
          ))}
        </div>
      </div>

      {tab === 'empleados' && (
        <TabEmpleados empleados={empleados} capacitaciones={capacitaciones} seguimiento={seguimiento} solicitudes={solicitudes} perfil={perfil} recargar={cargar} onAbrirFicha={setFichaId} />
      )}
      {tab === 'solicitudes' && (
        <TabSolicitudes solicitudes={solicitudes} empleados={empleados} perfil={perfil} recargar={cargar} />
      )}
      {tab === 'calendario' && <TabCalendario solicitudes={solicitudes} />}
      {tab === 'capacitaciones' && (
        <TabCapacitaciones empleados={empleados} capacitaciones={capacitaciones} perfil={perfil} recargar={cargar}
          empleadoIdInicial={empleadoIdNuevo.capacitaciones}
          limpiarEmpleadoInicial={() => setEmpleadoIdNuevo(p => ({ ...p, capacitaciones: null }))} />
      )}
      {tab === 'seguimiento' && (
        <TabSeguimiento empleados={empleados} seguimiento={seguimiento} perfil={perfil} recargar={cargar}
          empleadoIdInicial={empleadoIdNuevo.seguimiento}
          limpiarEmpleadoInicial={() => setEmpleadoIdNuevo(p => ({ ...p, seguimiento: null }))} />
      )}

      {/* FICHA MODAL */}
      {fichaEmp && (
        <FichaEmpleado
          empleado={fichaEmp}
          capacitaciones={capacitaciones}
          seguimiento={seguimiento}
          solicitudes={solicitudes}
          onClose={() => setFichaId(null)}
          onIrA={irA}
        />
      )}
    </div>
  )
}
