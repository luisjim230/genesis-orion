'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { C, fmtCRC, fmtFecha, fmtFechaHora, api, ESTADO_META } from './lib'

export default function EnviadosTab({ email, esAdmin }) {
  const [rows, setRows] = useState([])
  const [conciliacionActiva, setConciliacionActiva] = useState(true)
  const [loading, setLoading] = useState(true)
  const [estado, setEstado] = useState('todos')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [proveedor, setProveedor] = useState('')
  const [incluirPrueba, setIncluirPrueba] = useState(true)
  const [busy, setBusy] = useState(null)

  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      const q = new URLSearchParams({ estado, incluir_prueba: String(incluirPrueba) })
      if (desde) q.set('desde', desde)
      if (hasta) q.set('hasta', hasta)
      if (proveedor) q.set('proveedor', proveedor)
      const data = await api('/enviados?' + q.toString())
      setRows(data.rows || [])
      setConciliacionActiva(!!data.conciliacion_activa)
    } catch { /* */ }
    finally { setLoading(false) }
  }, [estado, desde, hasta, proveedor, incluirPrueba])

  useEffect(() => { cargar() }, [cargar])

  // Panel de atención (fuente: estado + diagnóstico de la vista)
  const atencion = useMemo(() => {
    const err = rows.filter((r) => r.estado === 'error')
    const rech = rows.filter((r) => r.estado === 'rechazado')
    const sin48 = rows.filter((r) => r.estado === 'sincronizado' && (r.horas_desde_envio ?? 0) > 48)
    // Solo alarmar por "no aparece en NEO" cuando la conciliación está activa
    const noAparece = conciliacionActiva ? rows.filter((r) => r.diagnostico === 'no_aparece_en_neo') : []
    return { err, rech, sin48, noAparece, total: err.length + rech.length + sin48.length + noAparece.length }
  }, [rows, conciliacionActiva])

  const reintentar = useCallback(async (id) => {
    setBusy(id)
    try {
      await api(`/asientos/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accion: 'reintentar', actor: email }) })
      await cargar()
    } catch (e) { alert(e.message) }
    finally { setBusy(null) }
  }, [email, cargar])

  async function descartarPruebas() {
    if (!confirm('¿Descartar TODOS los asientos de prueba? Esto los marca como descartados y no se puede deshacer.')) return
    setBusy('prueba')
    try {
      const r = await api('/enviados', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accion: 'descartar_prueba', actor: email }) })
      alert(`Se descartaron ${r.descartados} asiento(s) de prueba.`)
      await cargar()
    } catch (e) { alert(e.message) }
    finally { setBusy(null) }
  }

  function exportar() {
    const q = new URLSearchParams({ estado, incluir_prueba: String(incluirPrueba) })
    if (desde) q.set('desde', desde)
    if (hasta) q.set('hasta', hasta)
    if (proveedor) q.set('proveedor', proveedor)
    window.open('/api/contabilidad/exportar?' + q.toString(), '_blank')
  }

  return (
    <div>
      {!conciliacionActiva && (
        <div style={{ background: C.crema, border: `1px solid ${C.borde}`, borderRadius: 8, padding: '8px 12px', fontSize: 12.5, color: C.gris, marginBottom: 12 }}>
          ℹ️ La conciliación con NEO aún no está activa (falta el descargador de estados). Los estados se muestran según lo que registró el panel.
        </div>
      )}

      {/* Panel de atención */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.vino, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Panel de atención</div>
        {atencion.total === 0 ? (
          <div style={{ background: '#dcfce7', color: C.verde, borderRadius: 10, padding: '12px 16px', fontSize: 14, fontWeight: 600 }}>✅ Todo al día</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px,1fr))', gap: 10 }}>
            <AtencionCard titulo="En error" items={atencion.err} color={C.ambar} onReintentar={reintentar} busy={busy} />
            <AtencionCard titulo="Rechazados en NEO" items={atencion.rech} color={C.rojo} />
            <AtencionCard titulo="Sin revisar +48h" items={atencion.sin48} color={C.petroleo} />
            <AtencionCard titulo="No aparece en NEO" items={atencion.noAparece} color={C.rojo} />
          </div>
        )}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12, background: 'white', border: `1px solid ${C.borde}`, borderRadius: 10, padding: '10px 14px' }}>
        <Campo label="Estado">
          <select value={estado} onChange={(e) => setEstado(e.target.value)} style={inp}>
            <option value="todos">Todos</option>
            {['aprobado', 'enviando', 'sincronizado', 'conciliado', 'rechazado', 'error'].map((s) => <option key={s} value={s}>{ESTADO_META[s].label}</option>)}
          </select>
        </Campo>
        <Campo label="Desde"><input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} style={inp} /></Campo>
        <Campo label="Hasta"><input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} style={inp} /></Campo>
        <Campo label="Proveedor"><input value={proveedor} onChange={(e) => setProveedor(e.target.value)} placeholder="Buscar…" style={inp} /></Campo>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, paddingBottom: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={incluirPrueba} onChange={(e) => setIncluirPrueba(e.target.checked)} /> Incluir pruebas
        </label>
        <button onClick={cargar} style={btn(C.petroleo)}>Filtrar</button>
        <button onClick={exportar} style={btn(C.verde)}>⬇ Exportar Excel</button>
        {esAdmin && <button onClick={descartarPruebas} disabled={busy === 'prueba'} style={btn(C.ambar)}>🧪 Descartar pruebas</button>}
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
                    <tr key={r.id} style={{ borderBottom: `1px solid ${C.borde}`, background: r.es_prueba ? C.ambarBg + '55' : 'white' }}>
                      <td style={td}>
                        <span style={{ color: m.color, fontWeight: 600, whiteSpace: 'nowrap' }}>{m.icon} {m.label}</span>
                        {r.es_prueba && <span style={{ marginLeft: 6, fontSize: 9.5, fontWeight: 700, color: C.ambar, background: C.ambarBg, border: `1px solid ${C.ambar}55`, borderRadius: 5, padding: '1px 5px' }}>PRUEBA</span>}
                        {r.estado_neo && <div style={{ fontSize: 11, color: C.gris }}>NEO: {r.estado_neo}</div>}
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
