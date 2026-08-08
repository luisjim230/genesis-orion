'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { C, fmtCRC, fmtFecha, fmtFechaHora, api, ESTADO_META } from './lib'

export default function EnviadosTab({ email }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [estado, setEstado] = useState('todos')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [proveedor, setProveedor] = useState('')
  const [busy, setBusy] = useState(null)

  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      const q = new URLSearchParams({ vista: 'enviados', estado })
      if (desde) q.set('desde', desde)
      if (hasta) q.set('hasta', hasta)
      if (proveedor) q.set('proveedor', proveedor)
      const data = await api('/asientos?' + q.toString())
      setRows(data)
    } catch { /* */ }
    finally { setLoading(false) }
  }, [estado, desde, hasta, proveedor])

  useEffect(() => { cargar() }, [cargar])

  const atencion = useMemo(() => {
    const ahora = Date.now()
    const err = rows.filter((r) => r.estado === 'error')
    const sinConciliar = rows.filter((r) => r.estado === 'sincronizado' && !r.conciliado_en &&
      (ahora - new Date(r.actualizado_en || r.enviado_en || r.aprobado_en || 0).getTime()) > 24 * 3600 * 1000)
    const muchosIntentos = rows.filter((r) => (r.intentos || 0) >= 3)
    return { err, sinConciliar, muchosIntentos, total: err.length + sinConciliar.length + muchosIntentos.length }
  }, [rows])

  const reintentar = useCallback(async (id) => {
    setBusy(id)
    try {
      await api(`/asientos/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accion: 'reintentar', actor: email }) })
      await cargar()
    } catch (e) { alert(e.message) }
    finally { setBusy(null) }
  }, [email, cargar])

  function exportar() {
    const q = new URLSearchParams({ estado })
    if (desde) q.set('desde', desde)
    if (hasta) q.set('hasta', hasta)
    if (proveedor) q.set('proveedor', proveedor)
    window.open('/api/contabilidad/exportar?' + q.toString(), '_blank')
  }

  return (
    <div>
      {/* Panel de atención */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.vino, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Panel de atención</div>
        {atencion.total === 0 ? (
          <div style={{ background: '#dcfce7', color: C.verde, borderRadius: 10, padding: '12px 16px', fontSize: 14, fontWeight: 600 }}>✅ Todo al día</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px,1fr))', gap: 10 }}>
            <AtencionCard titulo="En error" items={atencion.err} color={C.rojo} onReintentar={reintentar} busy={busy} />
            <AtencionCard titulo="Sin conciliar +24h" items={atencion.sinConciliar} color={C.ambar} />
            <AtencionCard titulo="3+ intentos" items={atencion.muchosIntentos} color={C.naranja} onReintentar={reintentar} busy={busy} />
          </div>
        )}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12, background: 'white', border: `1px solid ${C.borde}`, borderRadius: 10, padding: '10px 14px' }}>
        <Campo label="Estado">
          <select value={estado} onChange={(e) => setEstado(e.target.value)} style={inp}>
            <option value="todos">Todos</option>
            {['aprobado', 'enviando', 'sincronizado', 'conciliado', 'error'].map((s) => <option key={s} value={s}>{ESTADO_META[s].label}</option>)}
          </select>
        </Campo>
        <Campo label="Desde"><input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} style={inp} /></Campo>
        <Campo label="Hasta"><input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} style={inp} /></Campo>
        <Campo label="Proveedor"><input value={proveedor} onChange={(e) => setProveedor(e.target.value)} placeholder="Buscar…" style={inp} /></Campo>
        <button onClick={cargar} style={btn(C.petroleo)}>Filtrar</button>
        <button onClick={exportar} style={btn(C.verde)}>⬇ Exportar Excel</button>
      </div>

      {/* Tabla */}
      <div style={{ background: 'white', border: `1px solid ${C.borde}`, borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: C.petroleo, color: 'white' }}>
                <th style={th}>Estado</th><th style={th}>Fecha</th><th style={th}>Proveedor</th>
                <th style={th}>Descripción</th><th style={{ ...th, textAlign: 'right' }}>Total</th>
                <th style={th}>Asiento NEO</th><th style={th}>Aprobó</th><th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={8} style={{ padding: 24, color: C.gris, textAlign: 'center' }}>Cargando…</td></tr>
                : rows.length === 0 ? <tr><td colSpan={8} style={{ padding: 24, color: C.gris, textAlign: 'center' }}>Nada por acá.</td></tr>
                : rows.map((r) => {
                  const m = ESTADO_META[r.estado] || {}
                  return (
                    <tr key={r.id} style={{ borderBottom: `1px solid ${C.borde}` }}>
                      <td style={td}><span style={{ color: m.color, fontWeight: 600, whiteSpace: 'nowrap' }}>{m.icon} {m.label}</span>
                        {r.estado === 'error' && r.detalle_error && <div style={{ fontSize: 11, color: C.rojo, maxWidth: 260 }}>{r.detalle_error}</div>}
                      </td>
                      <td style={td}>{fmtFecha(r.fecha)}</td>
                      <td style={td}>{r.proveedor_nombre || '—'}</td>
                      <td style={{ ...td, maxWidth: 280 }}>{r.descripcion}</td>
                      <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmtCRC(r.total_debe, r.moneda)}</td>
                      <td style={td}>{r.asiento_neo || '—'}</td>
                      <td style={{ ...td, fontSize: 11.5 }}>{r.aprobado_por || '—'}<br /><span style={{ color: C.gris }}>{fmtFechaHora(r.aprobado_en)}</span></td>
                      <td style={td}>{r.estado === 'error' && <button disabled={busy === r.id} onClick={() => reintentar(r.id)} style={btnSm(C.naranja)}>{busy === r.id ? '…' : 'Reintentar'}</button>}</td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function AtencionCard({ titulo, items, color, onReintentar, busy }) {
  if (!items.length) return null
  return (
    <div style={{ background: 'white', border: `1px solid ${color}44`, borderLeft: `4px solid ${color}`, borderRadius: 10, padding: '10px 13px' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color, marginBottom: 6 }}>{titulo} ({items.length})</div>
      {items.slice(0, 5).map((r) => (
        <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 12, padding: '3px 0', borderBottom: `1px solid ${C.borde}` }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>#{r.id} {r.proveedor_nombre || r.descripcion}</span>
          {onReintentar && <button disabled={busy === r.id} onClick={() => onReintentar(r.id)} style={btnSm(color)}>↻</button>}
        </div>
      ))}
    </div>
  )
}

function Campo({ label, children }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
    <label style={{ fontSize: 10, fontWeight: 700, color: C.petroleo, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</label>{children}
  </div>
}
const inp = { padding: '6px 9px', borderRadius: 7, border: `1px solid ${C.bordeFuerte}`, fontSize: 13, outline: 'none', fontFamily: 'inherit' }
const th = { textAlign: 'left', padding: '9px 10px', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.5, whiteSpace: 'nowrap' }
const td = { padding: '9px 10px', color: '#111827', verticalAlign: 'top' }
function btn(bg) { return { background: bg, color: 'white', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' } }
function btnSm(bg) { return { background: bg, color: 'white', border: 'none', borderRadius: 6, padding: '3px 9px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' } }
