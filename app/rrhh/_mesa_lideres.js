'use client'
import { useMemo } from 'react'
import { S, GOLD, TEXT, MUTED, fmtFecha, iniciales, colorAvatar } from './_styles'

const ESTADO_COLOR = { activo: '#22c55e', inactivo: '#6b7280', suspendido: '#ef4444', vacaciones: '#3b82f6' }

// Cuenta recursivamente todas las personas bajo un líder (directas + indirectas).
function contarEquipo(id, hijosPorLider, visitados = new Set()) {
  if (visitados.has(id)) return 0
  visitados.add(id)
  const directos = hijosPorLider[id] || []
  let total = directos.length
  for (const h of directos) total += contarEquipo(h.id, hijosPorLider, visitados)
  return total
}

export default function TabMesaLideres({ empleados, onAbrirFicha, onIrDirectorio }) {
  const hijosPorLider = useMemo(() => {
    const m = {}
    empleados.forEach(e => {
      if (e.lider_id) { (m[e.lider_id] = m[e.lider_id] || []).push(e) }
    })
    return m
  }, [empleados])

  const lideres = useMemo(() => empleados.filter(e => e.mesa_lideres)
    .sort((a, b) => (a.lider_id ? 1 : 0) - (b.lider_id ? 1 : 0) || (a.nombre || '').localeCompare(b.nombre || '')), [empleados])

  // Raíces del organigrama: sin líder, o cuyo líder no está registrado.
  const idsSet = useMemo(() => new Set(empleados.map(e => e.id)), [empleados])
  const raices = useMemo(() => empleados.filter(e => !e.lider_id || !idsSet.has(e.lider_id))
    .sort((a, b) => (b.mesa_lideres ? 1 : 0) - (a.mesa_lideres ? 1 : 0) || (a.nombre || '').localeCompare(b.nombre || '')), [empleados, idsSet])

  if (empleados.length === 0) {
    return <div style={{ ...S.card, textAlign: 'center', padding: 40, color: MUTED }}>Todavía no hay colaboradores registrados.</div>
  }

  return (
    <>
      {/* TARJETAS DE LÍDERES */}
      <div style={{ fontSize: '0.72em', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: MUTED, marginBottom: 12 }}>
        🏛️ Mesa de Líderes · {lideres.length} integrante{lideres.length !== 1 ? 's' : ''}
      </div>
      {lideres.length === 0 ? (
        <div style={{ ...S.card, textAlign: 'center', padding: 30, color: MUTED, marginBottom: 24 }}>
          Ningún colaborador está marcado como parte de la Mesa de Líderes todavía. Editá una ficha y activá “Pertenece a la Mesa de Líderes”.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14, marginBottom: 28 }}>
          {lideres.map(l => {
            const directos = (hijosPorLider[l.id] || []).length
            const totalEquipo = contarEquipo(l.id, hijosPorLider)
            const estColor = ESTADO_COLOR[l.estado] || '#6b7280'
            return (
              <div key={l.id} style={{ ...S.card, padding: 18, borderLeft: `4px solid #8b5cf6` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                  <div style={{ width: 54, height: 54, borderRadius: '50%', overflow: 'hidden', background: colorAvatar(l.nombre), color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '1.2em', flexShrink: 0 }}>
                    {l.foto_url ? <img src={l.foto_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : iniciales(l.nombre)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '1em', color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.nombre}</div>
                    <div style={{ fontSize: '0.78em', color: MUTED }}>{l.puesto || '—'}</div>
                    <div style={{ fontSize: '0.76em', color: MUTED }}>{l.departamento || ''}{l.sucursal ? ` · ${l.sucursal}` : ''}</div>
                  </div>
                  <div style={S.badge(estColor)}>{(l.estado || 'activo').replace(/_/g, ' ')}</div>
                </div>
                {l.descripcion_puesto && <div style={{ fontSize: '0.8em', color: MUTED, marginBottom: 10, fontStyle: 'italic' }}>{l.descripcion_puesto}</div>}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                  <span style={S.badge('#8b5cf6')}>{directos} directo{directos !== 1 ? 's' : ''}</span>
                  {totalEquipo !== directos && <span style={S.badge('#6366f1')}>{totalEquipo} en total</span>}
                  {l.proxima_reunion && <span style={S.badge('#0ea5e9')}>1:1 {fmtFecha(l.proxima_reunion)}</span>}
                  {l.proxima_evaluacion && <span style={S.badge('#f59e0b')}>Eval {fmtFecha(l.proxima_evaluacion)}</span>}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => onAbrirFicha(l.id)} style={S.btn(GOLD, true)}>Ver ficha</button>
                  {directos > 0 && <button onClick={() => onIrDirectorio(l.id)} style={S.btn('#8b5cf6', true)}>Ver equipo ({directos})</button>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ORGANIGRAMA */}
      <div style={{ fontSize: '0.72em', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: MUTED, marginBottom: 12 }}>
        🗺️ Organigrama
      </div>
      <div style={{ ...S.card, padding: '20px 22px', overflowX: 'auto' }}>
        {raices.map(r => <NodoOrg key={r.id} nodo={r} hijosPorLider={hijosPorLider} onAbrirFicha={onAbrirFicha} nivel={0} />)}
      </div>
    </>
  )
}

function NodoOrg({ nodo, hijosPorLider, onAbrirFicha, nivel, visitados }) {
  const seen = visitados || new Set()
  if (seen.has(nodo.id)) return null
  const nextSeen = new Set(seen); nextSeen.add(nodo.id)
  const hijos = (hijosPorLider[nodo.id] || []).slice().sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''))
  const estColor = ESTADO_COLOR[nodo.estado] || '#6b7280'

  return (
    <div style={{ marginLeft: nivel > 0 ? 22 : 0, borderLeft: nivel > 0 ? '2px solid rgba(0,0,0,0.1)' : 'none', paddingLeft: nivel > 0 ? 16 : 0, marginTop: 8 }}>
      <div onClick={() => onAbrirFicha(nodo.id)} style={{
        display: 'inline-flex', alignItems: 'center', gap: 10, cursor: 'pointer',
        background: nodo.mesa_lideres ? '#8b5cf610' : 'rgba(255,255,255,0.6)',
        border: `1px solid ${nodo.mesa_lideres ? '#8b5cf655' : 'rgba(0,0,0,0.1)'}`,
        borderRadius: 12, padding: '8px 14px', marginBottom: 4,
      }}>
        <div style={{ width: 34, height: 34, borderRadius: '50%', overflow: 'hidden', background: colorAvatar(nodo.nombre), color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.82em', flexShrink: 0 }}>
          {nodo.foto_url ? <img src={nodo.foto_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : iniciales(nodo.nombre)}
        </div>
        <div>
          <div style={{ fontSize: '0.86em', fontWeight: 700, color: TEXT }}>
            {nodo.nombre} {nodo.mesa_lideres && '🏛️'}
          </div>
          <div style={{ fontSize: '0.74em', color: MUTED }}>
            {nodo.puesto || '—'}{nodo.departamento ? ` · ${nodo.departamento}` : ''}{nodo.sucursal ? ` · ${nodo.sucursal}` : ''}
          </div>
        </div>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: estColor, flexShrink: 0 }} />
      </div>
      {hijos.map(h => <NodoOrg key={h.id} nodo={h} hijosPorLider={hijosPorLider} onAbrirFicha={onAbrirFicha} nivel={nivel + 1} visitados={nextSeen} />)}
    </div>
  )
}
