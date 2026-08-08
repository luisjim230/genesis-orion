'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { C, fmtCRC, fmtFecha, fmtFechaHora, api, ESTADO_META } from './lib'

export default function EnviadosTab({ email, rol }) {
  const esAdmin = rol === 'admin'
  const puedeRecuperar = rol === 'admin' || rol === 'aprobador'
  const [rows, setRows] = useState([])
  const [conciliacionActiva, setConciliacionActiva] = useState(true)
  const [loading, setLoading] = useState(true)
  const [estado, setEstado] = useState('todos')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [proveedor, setProveedor] = useState('')
  const [incluirPrueba, setIncluirPrueba] = useState(true)
  const [busy, setBusy] = useState(null)
  const [descarga, setDescarga] = useState(null) // { ultima_carga, total_asientos, en_curso }

  const cargarDescarga = useCallback(async () => {
    try { setDescarga(await api('/estado-descarga')) } catch { /* */ }
  }, [])
  useEffect(() => { cargarDescarga() }, [cargarDescarga])
  // Mientras hay una descarga en curso, refrescar cada 15s
  useEffect(() => {
    if (!descarga?.en_curso) return
    const t = setInterval(cargarDescarga, 15000)
    return () => clearInterval(t)
  }, [descarga?.en_curso, cargarDescarga])

  async function actualizarEstados() {
    setBusy('descarga')
    try {
      const r = await api('/estado-descarga', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ actor: email }) })
      await cargarDescarga()
      if (r.ya_en_curso) alert('Ya hay una actualización en curso.')
      else alert('Actualización encolada. La M1 la corre en aproximadamente un minuto.')
    } catch (e) { alert(e.message) }
    finally { setBusy(null) }
  }

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

  // Panel de atención. En NEO todo asiento subido queda Aplicado (=conciliado) o
  // Anulado (=rechazado); no existe estado intermedio "esperando a Marcela". Por
  // eso solo importan: error de envío, anulados en NEO y los que el robot dice
  // haber subido pero no aparecen.
  const atencion = useMemo(() => {
    const err = rows.filter((r) => r.estado === 'error')
    const rech = rows.filter((r) => r.estado === 'rechazado' || r.diagnostico === 'anulado_en_neo')
    // Solo alarmar por "no aparece en NEO" cuando la conciliación está activa
    const noAparece = conciliacionActiva ? rows.filter((r) => r.diagnostico === 'no_aparece_en_neo') : []
    return { err, rech, noAparece, total: err.length + rech.length + noAparece.length }
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
    if (!confirm('¿Descartar todos los asientos de prueba? Quedan consultables como descartados.')) return
    setBusy('prueba')
    try {
      const r = await api('/enviados', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accion: 'descartar_prueba', actor: email }) })
      alert(`Se descartaron ${r.descartados} asiento(s) de prueba.`)
      await cargar()
    } catch (e) { alert(e.message) }
    finally { setBusy(null) }
  }

  const recuperar = useCallback(async (id) => {
    setBusy(id)
    try {
      await api(`/asientos/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accion: 'recuperar', actor: email }) })
      await cargar()
    } catch (e) { alert(e.message) }
    finally { setBusy(null) }
  }, [email, cargar])

  async function vaciarDescartados() {
    if (prompt('Esto elimina definitivamente los descartados con más de 90 días. Escribí VACIAR para confirmar:') !== 'VACIAR') return
    setBusy('vaciar')
    try {
      const r = await api('/enviados', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accion: 'vaciar_descartados_90', actor: email }) })
      alert(`Se eliminaron ${r.eliminados} descartado(s) viejo(s).`)
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
      {/* Indicador de última carga de estados de NEO + botón de actualizar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: 'white', border: `1px solid ${C.borde}`, borderRadius: 10, padding: '9px 14px', marginBottom: 12 }}>
        <span style={{ fontSize: 18 }}>🔄</span>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: C.vino }}>
            Estados NEO {descarga?.ultima_carga ? `actualizados: ${fmtFechaHora(descarga.ultima_carga)}` : 'sin cargar todavía'}
          </div>
          <div style={{ fontSize: 11.5, color: C.gris }}>
            {descarga?.total_asientos ? `${descarga.total_asientos.toLocaleString('es-CR')} asientos en base` : '—'}
            {descarga?.en_curso && <span style={{ color: C.naranja, fontWeight: 600 }}> · actualizando ahora…</span>}
          </div>
        </div>
        <button onClick={actualizarEstados} disabled={busy === 'descarga' || descarga?.en_curso}
          style={{ ...btn(C.petroleo), opacity: descarga?.en_curso ? 0.5 : 1 }}>
          {descarga?.en_curso ? 'Actualizando…' : 'Actualizar ahora'}
        </button>
      </div>

      {!conciliacionActiva && (
        <div style={{ background: C.crema, border: `1px solid ${C.borde}`, borderRadius: 8, padding: '8px 12px', fontSize: 12.5, color: C.gris, marginBottom: 12 }}>
          ℹ️ La conciliación con NEO aún no está activa (falta la primera carga de estados). Tocá “Actualizar ahora” o esperá la corrida de las 9pm.
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
            <AtencionCard titulo="Anulados en NEO" items={atencion.rech} color={C.rojo} />
            <AtencionCard titulo="No aparece en NEO" items={atencion.noAparece} color={C.rojo} />
          </div>
        )}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12, background: 'white', border: `1px solid ${C.borde}`, borderRadius: 10, padding: '10px 14px' }}>
        <Campo label="Estado">
          <select value={estado} onChange={(e) => setEstado(e.target.value)} style={inp}>
            <option value="todos">Todos</option>
            {['aprobado', 'enviando', 'sincronizado', 'conciliado', 'rechazado', 'error', 'descartado'].map((s) => <option key={s} value={s}>{ESTADO_META[s].label}</option>)}
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
        {esAdmin && estado === 'descartado' && <button onClick={descartarPruebas} disabled={busy === 'prueba'} style={btn(C.ambar)}>🧪 Descartar pruebas</button>}
        {esAdmin && estado === 'descartado' && <button onClick={vaciarDescartados} disabled={busy === 'vaciar'} style={btn(C.rojo)}>🗑️ Vaciar +90 días</button>}
        {esAdmin && estado !== 'descartado' && <button onClick={descartarPruebas} disabled={busy === 'prueba'} style={btn(C.ambar)}>🧪 Descartar pruebas</button>}
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
                      <td style={td}>
                        {r.estado === 'error' && <button disabled={busy === r.id} onClick={() => reintentar(r.id)} style={btnSm(C.naranja)}>{busy === r.id ? '…' : 'Reintentar'}</button>}
                        {r.estado === 'descartado' && puedeRecuperar && <button disabled={busy === r.id} onClick={() => recuperar(r.id)} style={btnSm(C.petroleo)}>{busy === r.id ? '…' : 'Recuperar'}</button>}
                      </td>
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
