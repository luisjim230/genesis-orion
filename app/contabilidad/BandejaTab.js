'use client'
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import AsientoEditor from './AsientoEditor'
import Combobox from './Combobox'
import { C, MOD, fmtCRC, fmtFecha, api, norm, buildItemsProveedores } from './lib'

export default function BandejaTab({ cat, email, onMontarManual, recargarCat }) {
  const [lista, setLista] = useState([])
  const [loading, setLoading] = useState(true)
  const [selId, setSelId] = useState(null)
  const [detalle, setDetalle] = useState(null)
  const [subiendo, setSubiendo] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [ignoradas, setIgnoradas] = useState([])
  const [verIgnoradas, setVerIgnoradas] = useState(false)
  const [convirtiendo, setConvirtiendo] = useState(null)
  const [revisadas, setRevisadas] = useState([])
  const [verRevisadas, setVerRevisadas] = useState(false)
  const [marcando, setMarcando] = useState(null)
  const [descartar, setDescartar] = useState(null) // { id }
  const [modoSel, setModoSel] = useState(false)           // selección múltiple (SOLO para descartar)
  const [seleccion, setSeleccion] = useState([])          // ids marcados
  const [descartarLote, setDescartarLote] = useState(false)
  const [sincronizando, setSincronizando] = useState(false)
  const [syncMsg, setSyncMsg] = useState(null)
  const [resumenColapsado, setResumenColapsado] = useState(!!cat?.ui_prefs?.resumen_colapsado)
  const [listaColapsada, setListaColapsada] = useState(!!cat?.ui_prefs?.lista_colapsada)
  const fileRef = useRef(null)
  const ultimoTocado = useRef(null) // para marcar rangos con Shift

  // Guardar preferencias de UI por usuario (en la base, no en el navegador)
  const guardarPref = useCallback((patch) => {
    api('/config', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ actor: email, ui_prefs: patch }) }).catch(() => {})
  }, [email])
  const toggleResumen = () => { setResumenColapsado((v) => { guardarPref({ resumen_colapsado: !v }); return !v }) }
  const toggleLista = () => { setListaColapsada((v) => { guardarPref({ lista_colapsada: !v }); return !v }) }

  const cargarIgnoradas = useCallback(async () => {
    try { setIgnoradas(await api('/facturas?vista=ignoradas')) } catch { /* */ }
    try { setRevisadas(await api('/facturas?vista=revisadas')) } catch { /* */ }
  }, [])

  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api('/asientos?vista=bandeja')
      setLista(data)
      if (data.length && !data.find((a) => a.id === selId)) setSelId(data[0].id)
      else if (!data.length) { setSelId(null); setDetalle(null) }
    } catch { /* */ }
    finally { setLoading(false) }
  }, [selId])

  useEffect(() => { cargar(); cargarIgnoradas() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Cargar detalle del seleccionado
  useEffect(() => {
    if (!selId) { setDetalle(null); return }
    let cancel = false
    api(`/asientos/${selId}`).then((d) => { if (!cancel) setDetalle(d) }).catch(() => {})
    return () => { cancel = true }
  }, [selId])

  // Navegación ⌘↓ / ⌘↑ entre facturas de la bandeja
  useEffect(() => {
    const h = (e) => {
      if (!(e.metaKey || e.ctrlKey)) return
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      e.preventDefault()
      const idx = lista.findIndex((a) => a.id === selId)
      if (idx < 0) return
      const next = e.key === 'ArrowDown' ? Math.min(idx + 1, lista.length - 1) : Math.max(idx - 1, 0)
      setSelId(lista[next].id)
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [lista, selId])

  const procesarArchivos = useCallback(async (files) => {
    if (!files || !files.length) return
    setSubiendo(true); setResultado(null)
    try {
      const fd = new FormData()
      for (const f of files) fd.append('files', f)
      if (email) fd.append('creado_por', email)
      const res = await api('/procesar', { method: 'POST', body: fd })
      setResultado(res)
      await cargar(); await cargarIgnoradas()
      if ((res.ignorados || []).length) setVerIgnoradas(true)
      recargarCat?.()
    } catch (e) { setResultado({ error: e.message }) }
    finally { setSubiendo(false) }
  }, [email, cargar, cargarIgnoradas, recargarCat])

  const convertir = useCallback(async (clave) => {
    setConvirtiendo(clave)
    try {
      const r = await api('/facturas', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accion: 'convertir', clave, creado_por: email }) })
      await cargar(); await cargarIgnoradas()
      if (r.asiento_id) setSelId(r.asiento_id)
    } catch (e) { alert(e.message) }
    finally { setConvirtiendo(null) }
  }, [email, cargar, cargarIgnoradas])

  const marcarNoRequiere = useCallback(async (clave) => {
    setMarcando(clave)
    try {
      await api('/facturas', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accion: 'no_requiere', clave, creado_por: email }) })
      await cargarIgnoradas()
    } catch (e) { alert(e.message) }
    finally { setMarcando(null) }
  }, [email, cargarIgnoradas])

  const recuperarFactura = useCallback(async (clave) => {
    setMarcando(clave)
    try {
      await api('/facturas', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accion: 'recuperar', clave }) })
      await cargarIgnoradas()
      setVerIgnoradas(true)
    } catch (e) { alert(e.message) }
    finally { setMarcando(null) }
  }, [cargarIgnoradas])

  const confirmarDescarte = useCallback(async (id, motivo) => {
    try {
      await api(`/asientos/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accion: 'descartar', motivo, actor: email }) })
      setDescartar(null)
      if (selId === id) setSelId(null)
      await cargar(); await cargarIgnoradas()
    } catch (e) { alert(e.message) }
  }, [email, selId, cargar, cargarIgnoradas])

  // ── Selección múltiple: EXISTE SOLO PARA DESCARTAR ─────────────────────────
  // A propósito no hay ninguna acción en lote que cree, edite ni apruebe
  // asientos: mientras el modo está activo, el editor de la derecha se esconde.
  const salirSeleccion = useCallback(() => {
    setModoSel(false); setSeleccion([]); ultimoTocado.current = null
  }, [])

  const toggleSel = useCallback((id, shift) => {
    setSeleccion((prev) => {
      const set = new Set(prev)
      const idx = lista.findIndex((a) => a.id === id)
      const prevIdx = ultimoTocado.current == null ? -1 : lista.findIndex((a) => a.id === ultimoTocado.current)
      if (shift && idx >= 0 && prevIdx >= 0) {
        const [ini, fin] = idx < prevIdx ? [idx, prevIdx] : [prevIdx, idx]
        const marcar = !set.has(id)
        for (let i = ini; i <= fin; i++) { if (marcar) set.add(lista[i].id); else set.delete(lista[i].id) }
      } else if (set.has(id)) set.delete(id)
      else set.add(id)
      ultimoTocado.current = id
      return [...set]
    })
  }, [lista])

  const confirmarDescarteLote = useCallback(async (motivo) => {
    try {
      const r = await api('/asientos/descartar-lote', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ids: seleccion, motivo, actor: email }),
      })
      setDescartarLote(false)
      salirSeleccion()
      setSyncMsg(`🗑️ ${r.descartados} borrador${r.descartados === 1 ? '' : 'es'} descartado${r.descartados === 1 ? '' : 's'}.`)
      setTimeout(() => setSyncMsg(null), 6000)
      await cargar(); await cargarIgnoradas()
    } catch (e) { alert(e.message) }
  }, [seleccion, email, salirSeleccion, cargar, cargarIgnoradas])

  const recargarDetalle = useCallback(async () => {
    if (selId) { try { setDetalle(await api(`/asientos/${selId}`)) } catch { /* */ } }
  }, [selId])

  // Forzar la lectura del correo ahora (encola una corrida del robot en la M1).
  // El daemon la levanta en ~1 min; se hace polling y se refresca la bandeja.
  const sincronizarCorreo = useCallback(async () => {
    setSincronizando(true); setSyncMsg('📧 Buscando facturas en el correo… (puede tardar ~1 min)')
    try {
      const r = await api('/sync-correo', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ actor: email }) })
      const solId = r.solicitud?.id
      let listo = false
      for (let i = 0; i < 30 && !listo; i++) {          // hasta ~2.5 min
        await new Promise((res) => setTimeout(res, 5000))
        try {
          const est = await api('/sync-correo')
          const done = est.solicitud && (!solId || est.solicitud.id === solId) &&
            ['completed', 'error', 'timeout', 'no_disponible'].includes(est.solicitud.status)
          if (done || !est.en_curso) listo = true
        } catch { /* reintenta */ }
      }
      await cargar(); await cargarIgnoradas(); recargarCat?.()
      setSyncMsg(listo ? '✅ Correo sincronizado. Revisá los borradores nuevos.'
        : '⏳ Sigue en cola; la lista se actualiza sola en un rato.')
    } catch (e) {
      setSyncMsg('⚠️ ' + e.message)
    } finally {
      setSincronizando(false)
      setTimeout(() => setSyncMsg(null), 8000)
    }
  }, [email, cargar, cargarIgnoradas, recargarCat])

  // ¿El emisor de la factura abierta está amarrado a un proveedor por cédula?
  const proveedorAmarrado = useMemo(() => {
    const ced = detalle?.factura?.cedula_emisor
    if (!ced) return true // sin cédula (manual) → no aplica amarre
    return (cat?.proveedores || []).some((p) => p.cedula === ced)
  }, [detalle, cat])

  return (
    <div>
      {/* Dropzone + puertas de entrada */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); procesarArchivos([...e.dataTransfer.files]) }}
        style={{
          border: `2px dashed ${dragOver ? C.naranja : C.bordeFuerte}`, borderRadius: 12, padding: '16px 18px',
          background: dragOver ? C.naranja + '11' : 'white', marginBottom: 14,
          display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
        }}>
        <div style={{ fontSize: 30 }}>📥</div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontWeight: 700, color: C.vino, fontSize: 14 }}>Soltá acá los XML o PDF de las facturas</div>
          <div style={{ fontSize: 12, color: C.gris }}>Podés soltar varios a la vez. El XML manda sobre el PDF.</div>
        </div>
        <input ref={fileRef} type="file" accept=".xml,.pdf,application/pdf,text/xml" multiple hidden
          onChange={(e) => procesarArchivos([...e.target.files])} />
        <button onClick={() => fileRef.current?.click()} disabled={subiendo} style={btn(C.petroleo)}>
          {subiendo ? 'Procesando…' : 'Elegir archivos'}
        </button>
        <button onClick={sincronizarCorreo} disabled={sincronizando} style={btn(C.naranja)}
          title="Leer el correo de facturación ahora mismo, sin esperar al horario automático">
          {sincronizando ? 'Sincronizando…' : '📧 Sincronizar correo ahora'}
        </button>
        <button onClick={onMontarManual} style={btn(C.vino)}>Montar manual</button>
      </div>

      {syncMsg && (
        <div style={{ background: 'white', border: `1px solid ${C.borde}`, borderRadius: 10, padding: '9px 14px', marginBottom: 12, fontSize: 13, color: C.vino }}>{syncMsg}</div>
      )}

      {resultado && <ResultadoCarga r={resultado} onClose={() => setResultado(null)} />}

      {/* Ignoradas (plegable) */}
      {ignoradas.length > 0 && (
        <div style={{ border: `1px solid ${C.ambar}55`, background: C.ambarBg + '66', borderRadius: 10, marginBottom: 14, overflow: 'hidden' }}>
          <button onClick={() => setVerIgnoradas((v) => !v)}
            style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: '10px 14px', fontSize: 13, fontWeight: 700, color: C.ambar, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: 'inherit' }}>
            <span>⏭️ Ignoradas ({ignoradas.length}) — leídas pero no contabilizadas</span>
            <span>{verIgnoradas ? '▲' : '▼'}</span>
          </button>
          {verIgnoradas && (
            <div style={{ borderTop: `1px solid ${C.ambar}33`, maxHeight: 320, overflowY: 'auto' }}>
              {ignoradas.map((f) => (
                <div key={f.clave} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderBottom: `1px solid ${C.ambar}22`, fontSize: 12.5 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.nombre_emisor || f.cedula_emisor || 'Proveedor'}</div>
                    <div style={{ color: C.gris, fontSize: 11.5 }}>
                      {fmtFecha(f.fecha_emision)} · {fmtCRC(f.total_comprobante, f.moneda)}{f.num_oc ? ` · ${f.num_oc}` : ''}
                    </div>
                  </div>
                  <button disabled={convirtiendo === f.clave || marcando === f.clave} onClick={() => convertir(f.clave)} style={btn(C.petroleo)}>
                    {convirtiendo === f.clave ? 'Convirtiendo…' : 'Convertir en gasto'}
                  </button>
                  <button disabled={convirtiendo === f.clave || marcando === f.clave} onClick={() => marcarNoRequiere(f.clave)} style={btn(C.gris)} title="Ya la revisé, no hay que hacerle asiento">
                    {marcando === f.clave ? 'Guardando…' : 'No requiere asiento'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Revisadas (no requieren asiento) — plegable, con deshacer */}
      {revisadas.length > 0 && (
        <div style={{ border: `1px solid ${C.borde}`, background: 'white', borderRadius: 10, marginBottom: 14, overflow: 'hidden' }}>
          <button onClick={() => setVerRevisadas((v) => !v)}
            style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: '10px 14px', fontSize: 13, fontWeight: 700, color: C.gris, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: 'inherit' }}>
            <span>✅ Revisadas ({revisadas.length}) — marcadas como que no requieren asiento</span>
            <span>{verRevisadas ? '▲' : '▼'}</span>
          </button>
          {verRevisadas && (
            <div style={{ borderTop: `1px solid ${C.borde}`, maxHeight: 320, overflowY: 'auto' }}>
              {revisadas.map((f) => (
                <div key={f.clave} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderBottom: `1px solid ${C.borde}`, fontSize: 12.5 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.nombre_emisor || f.cedula_emisor || 'Proveedor'}</div>
                    <div style={{ color: C.gris, fontSize: 11.5 }}>
                      {fmtFecha(f.fecha_emision)} · {fmtCRC(f.total_comprobante, f.moneda)}{f.revisada_por ? ` · ${f.revisada_por}` : ''}
                    </div>
                  </div>
                  <button disabled={marcando === f.clave} onClick={() => recuperarFactura(f.clave)} style={btn(C.ambar)} title="Traerla de nuevo a pendientes">
                    {marcando === f.clave ? 'Guardando…' : '↩︎ Traer de nuevo'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Split: lista | detalle */}
      <div style={{ display: 'grid', gridTemplateColumns: `${listaColapsada ? '44px' : 'minmax(260px, 340px)'} 1fr`, gap: 14, alignItems: 'start' }}>
        {/* Lista (colapsable a franja angosta) */}
        {listaColapsada ? (
          <button onClick={toggleLista} title="Mostrar borradores"
            style={{ background: 'white', border: `1px solid ${C.borde}`, borderRadius: 12, padding: '10px 0', cursor: 'pointer', writingMode: 'vertical-rl', fontSize: 12, fontWeight: 700, color: C.vino, height: 200, fontFamily: 'inherit' }}>
            ▸ Borradores ({lista.length})
          </button>
        ) : (
          <div style={{ background: 'white', border: `1px solid ${C.borde}`, borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '8px 12px', background: C.crema, fontSize: 12, fontWeight: 700, color: C.vino, borderBottom: `1px solid ${C.borde}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Borradores ({lista.length})</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {lista.length > 0 && (
                  <button onClick={() => (modoSel ? salirSeleccion() : setModoSel(true))}
                    title="Marcar varios borradores y descartarlos todos juntos"
                    style={{ background: modoSel ? C.naranja + '18' : 'white', border: `1px solid ${modoSel ? C.naranja : C.bordeFuerte}`, borderRadius: 7, padding: '3px 8px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', color: C.vino, fontFamily: 'inherit' }}>
                    {modoSel ? 'Salir' : '☑ Seleccionar'}
                  </button>
                )}
                <button onClick={toggleLista} title="Colapsar la lista" style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.gris, fontSize: 14 }}>◂</button>
              </span>
            </div>
            {modoSel && (
              <div style={{ padding: '8px 12px', background: 'white', borderBottom: `1px solid ${C.borde}`, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: C.vino, flex: 1, minWidth: 84 }}>
                  {seleccion.length} marcada{seleccion.length === 1 ? '' : 's'}
                </span>
                <button onClick={() => setSeleccion(lista.map((a) => a.id))} style={miniBtn}>Todas</button>
                <button onClick={() => setSeleccion([])} style={miniBtn}>Ninguna</button>
                <button onClick={() => setDescartarLote(true)} disabled={!seleccion.length}
                  style={{ ...btn(C.rojo), padding: '6px 11px', fontSize: 12, opacity: seleccion.length ? 1 : 0.45, cursor: seleccion.length ? 'pointer' : 'not-allowed' }}>
                  🗑️ Descartar {seleccion.length || ''}
                </button>
                <div style={{ width: '100%', fontSize: 11, color: C.grisClaro, lineHeight: 1.45 }}>
                  Esta selección <b>solo descarta</b> (no crea ni aprueba asientos). Shift+clic marca un rango.
                </div>
              </div>
            )}
            {loading ? <div style={{ padding: 20, color: C.gris, fontSize: 13 }}>Cargando…</div>
              : lista.length === 0 ? <div style={{ padding: 20, color: C.gris, fontSize: 13 }}>No hay borradores. Soltá una factura arriba.</div>
              : (
                <div style={{ maxHeight: 620, overflowY: 'auto' }}>
                  {lista.map((a) => {
                    const esNC = a.factura?.tipo_documento === 'NotaCreditoElectronica'
                    const morado = '#7c3aed'
                    const marcado = modoSel && seleccion.includes(a.id)
                    return (
                    <div key={a.id}
                      onClick={(e) => (modoSel ? toggleSel(a.id, e.shiftKey) : setSelId(a.id))}
                      style={{
                        padding: '9px 10px 9px 12px', borderBottom: `1px solid ${C.borde}`, cursor: 'pointer',
                        userSelect: modoSel ? 'none' : 'auto',
                        background: marcado ? C.rojo + '14'
                          : (!modoSel && a.id === selId) ? (esNC ? morado + '22' : C.naranja + '18')
                          : (esNC ? morado + '0d' : 'white'),
                        borderLeft: `4px solid ${marcado ? C.rojo : esNC ? morado : (!modoSel && a.id === selId) ? C.naranja : 'transparent'}`,
                        display: 'flex', gap: 6, alignItems: 'flex-start',
                      }}>
                      {modoSel && (
                        <input type="checkbox" checked={marcado} readOnly tabIndex={-1} aria-label="Marcar para descartar"
                          style={{ marginTop: 3, width: 15, height: 15, flexShrink: 0, accentColor: C.rojo, cursor: 'pointer' }} />
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {esNC && (
                          <div style={{ fontSize: 10, fontWeight: 800, color: 'white', background: morado, borderRadius: 5, padding: '2px 7px', display: 'inline-block', letterSpacing: 0.4, marginBottom: 4 }}>
                            🔁 NOTA DE CRÉDITO · RESTA
                          </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                          <span style={{ fontWeight: 600, fontSize: 13, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {a.proveedor_nombre || a.descripcion || 'Sin proveedor'}
                          </span>
                          <span style={{ display: 'flex', gap: 4 }}>
                            {/rechaz/i.test(a.factura?.estado_hacienda || '') && (
                              <span style={{ fontSize: 9, fontWeight: 700, color: 'white', background: C.rojo, borderRadius: 5, padding: '1px 5px', whiteSpace: 'nowrap' }}>HACIENDA ✕</span>
                            )}
                            {a.es_prueba && <PruebaChip />}
                            <OrigenChip origen={a.tipo_origen} />
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
                          <span style={{ fontSize: 11.5, color: C.gris }}>{fmtFecha(a.fecha)}</span>
                          <span style={{ fontSize: 13, fontWeight: 600, color: esNC ? morado : C.vino, fontVariantNumeric: 'tabular-nums' }}>{esNC ? '− ' : ''}{fmtCRC(a.total_debe, a.moneda)}</span>
                        </div>
                      </div>
                      {!modoSel && (
                        <button onClick={(e) => { e.stopPropagation(); setDescartar({ id: a.id }) }} title="Descartar este borrador"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.grisClaro, fontSize: 14, padding: '0 2px' }} aria-label="Descartar borrador">✕</button>
                      )}
                    </div>
                    )
                  })}
                </div>
              )}
          </div>
        )}

        {/* Detalle: visor + editor. En modo selección se esconde a propósito:
            la selección múltiple es solo para descartar, nunca para aprobar. */}
        <div>
          {modoSel ? (
            <div style={{ padding: '34px 24px', textAlign: 'center', background: 'white', borderRadius: 12, border: `1px dashed ${C.bordeFuerte}` }}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>☑️</div>
              <div style={{ fontWeight: 700, color: C.vino, fontSize: 15 }}>Modo selección</div>
              <div style={{ fontSize: 12.5, color: C.gris, marginTop: 6, lineHeight: 1.6 }}>
                Marcá en la lista los borradores que no son gasto y descartalos todos de una.<br />
                Acá <b>no se aprueba ni se crea nada</b>: para revisar o montar un asiento, salí del modo.
              </div>
              <button onClick={salirSeleccion} style={{ ...btn(C.petroleo), marginTop: 14 }}>Salir del modo selección</button>
            </div>
          ) : !detalle ? (
            <div style={{ padding: 40, textAlign: 'center', color: C.gris, background: 'white', borderRadius: 12, border: `1px solid ${C.borde}` }}>
              Elegí un borrador de la lista.
            </div>
          ) : (
            <>
              {!proveedorAmarrado && (
                <AmarrePanel detalle={detalle} cat={cat} email={email}
                  onListo={async () => { await cargar(); await recargarDetalle(); recargarCat?.() }} />
              )}
              {detalle.factura?.tipo_documento === 'NotaCreditoElectronica' && (
                <NotaCreditoInfo detalle={detalle} />
              )}
              <div style={{ display: 'grid', gridTemplateColumns: resumenColapsado ? '1fr' : 'minmax(0,0.85fr) minmax(0,1.15fr)', gap: 14, alignItems: 'start' }}>
                {!resumenColapsado && (
                  <Visor key={detalle.id} factura={detalle.factura} asiento={detalle} onColapsar={toggleResumen} />
                )}
                <div style={{ background: 'white', border: `1px solid ${C.borde}`, borderRadius: 12, padding: 16 }}>
                  {resumenColapsado && (
                    <button onClick={toggleResumen} style={{ background: 'white', border: `1px solid ${C.bordeFuerte}`, borderRadius: 8, padding: '5px 10px', fontSize: 12, cursor: 'pointer', color: C.vino, marginBottom: 10 }}>
                      ▸ Ver resumen de la factura
                    </button>
                  )}
                  <AsientoEditor
                    key={detalle.id}
                    asiento={detalle} cat={cat} email={email}
                    emisorCedula={detalle.factura?.cedula_emisor}
                    avisos={avisosDe(detalle)}
                    bloqueoExtra={rechazadaHacienda(detalle) ? 'Hacienda rechazó este comprobante.' : null}
                    onSaved={cargar}
                    onApproved={() => { cargar() }}
                    onDescartar={(id) => setDescartar({ id })}
                    autoFocusPrimera
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {descartar && (
        <DescartarModal onClose={() => setDescartar(null)} onConfirmar={(motivo) => confirmarDescarte(descartar.id, motivo)} />
      )}

      {descartarLote && (
        <DescartarModal cantidad={seleccion.length} onClose={() => setDescartarLote(false)} onConfirmar={confirmarDescarteLote} />
      )}
    </div>
  )
}

function avisosDe(detalle) {
  const a = []
  const f = detalle.factura
  if (f?.estado_hacienda && /rechaz/i.test(f.estado_hacienda)) a.push('⛔ Hacienda RECHAZÓ este comprobante. No debería contabilizarse.')
  if (detalle.tipo_origen === 'pdf') a.push('Se leyó de un PDF. Revisá que los montos estén bien antes de aprobar.')
  if (f?.clasificacion === 'preguntar') a.push('Este proveedor a veces vende mercadería. Confirmá que esto es un gasto.')
  if (f?.clasificacion === 'por_clasificar') a.push('Este proveedor es nuevo. Amarralo a uno existente o elegí sus cuentas.')
  return a
}
function rechazadaHacienda(detalle) {
  return /rechaz/i.test(detalle?.factura?.estado_hacienda || '')
}

// ── Visor: PDF embebido o resumen legible del XML ────────────────────────────
function Visor({ factura, asiento, onColapsar }) {
  const [url, setUrl] = useState(null)
  const path = factura?.pdf_path || asiento?.pdf_url
  useEffect(() => {
    let cancel = false
    if (path) api(`/archivo?path=${encodeURIComponent(path)}`).then((d) => { if (!cancel) setUrl(d.url) }).catch(() => {})
    return () => { cancel = true }
  }, [path])

  return (
    <div style={{ background: 'white', border: `1px solid ${C.borde}`, borderRadius: 12, overflow: 'hidden', position: 'sticky', top: 12 }}>
      <div style={{ padding: '9px 12px', background: C.crema, fontSize: 12, fontWeight: 700, color: C.vino, borderBottom: `1px solid ${C.borde}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>{url ? 'Factura (PDF)' : 'Resumen de la factura'}</span>
        <button onClick={onColapsar} title="Ocultar el resumen para tener más espacio" style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.gris, fontSize: 13, fontFamily: 'inherit' }}>◂ Ocultar</button>
      </div>
      {url ? (
        <iframe title="factura" src={url} style={{ width: '100%', height: 620, border: 'none' }} />
      ) : (
        <ResumenXML factura={factura} />
      )}
    </div>
  )
}

function ResumenXML({ factura }) {
  if (!factura) return <div style={{ padding: 16, color: C.gris, fontSize: 13 }}>Asiento manual (sin factura asociada).</div>
  const dl = { display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: `1px solid ${C.borde}`, fontSize: 12.5 }
  return (
    <div style={{ padding: '12px 14px', maxHeight: 620, overflowY: 'auto' }}>
      <Fila k="Emisor" v={factura.nombre_emisor} />
      <Fila k="Cédula" v={factura.cedula_emisor} />
      <Fila k="Consecutivo" v={factura.consecutivo} />
      <Fila k="Fecha" v={fmtFecha(factura.fecha_emision)} />
      <Fila k="Condición" v={factura.condicion_venta} />
      <Fila k="Moneda" v={factura.moneda} />
      <Fila k="Gravado" v={fmtCRC(factura.total_gravado, factura.moneda)} />
      <Fila k="Exento" v={fmtCRC(factura.total_exento, factura.moneda)} />
      {Number(factura.total_no_sujeto) > 0 && <Fila k="No sujeto" v={fmtCRC(factura.total_no_sujeto, factura.moneda)} />}
      {Number(factura.total_exonerado) > 0 && <Fila k="Exonerado" v={fmtCRC(factura.total_exonerado, factura.moneda)} />}
      <Fila k="Descuentos" v={fmtCRC(factura.total_descuentos, factura.moneda)} />
      <Fila k="Impuesto" v={fmtCRC(factura.total_impuesto, factura.moneda)} />
      <Fila k="Total" v={fmtCRC(factura.total_comprobante, factura.moneda)} bold />
      {Array.isArray(factura.desglose_impuesto) && factura.desglose_impuesto.length > 0 && (
        <>
          <div style={{ marginTop: 10, fontWeight: 700, fontSize: 11, color: C.petroleo, textTransform: 'uppercase' }}>Desglose de IVA</div>
          {factura.desglose_impuesto.map((d, i) => (
            <div key={i} style={dl}><span>{d.tarifa}%</span><span>{fmtCRC(d.monto, factura.moneda)}</span></div>
          ))}
        </>
      )}
      {Array.isArray(factura.lineas) && factura.lineas.length > 0 && (
        <>
          <div style={{ marginTop: 10, fontWeight: 700, fontSize: 11, color: C.petroleo, textTransform: 'uppercase' }}>Líneas ({factura.lineas.length})</div>
          {factura.lineas.slice(0, 40).map((l, i) => (
            <div key={i} style={{ padding: '5px 0', borderBottom: `1px solid ${C.borde}`, fontSize: 12 }}>
              <div style={{ color: '#111827' }}>{l.detalle || '—'}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: C.gris, fontSize: 11 }}>
                <span>CABYS {l.cabys || '—'}</span>
                <span>{fmtCRC(l.base_imponible ?? l.subtotal, factura.moneda)}</span>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
function Fila({ k, v, bold }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: `1px solid ${C.borde}`, fontSize: 12.5 }}>
      <span style={{ color: C.gris }}>{k}</span>
      <span style={{ fontWeight: bold ? 700 : 500, color: bold ? C.vino : '#111827', textAlign: 'right' }}>{v || '—'}</span>
    </div>
  )
}

function PruebaChip() {
  return <span style={{ fontSize: 9.5, fontWeight: 700, color: C.ambar, background: C.ambarBg, border: `1px solid ${C.ambar}55`, borderRadius: 5, padding: '1px 6px', whiteSpace: 'nowrap' }}>PRUEBA</span>
}
function NotaCreditoChip() {
  return <span style={{ fontSize: 9.5, fontWeight: 700, color: '#7c3aed', background: '#7c3aed18', border: '1px solid #7c3aed55', borderRadius: 5, padding: '1px 6px', whiteSpace: 'nowrap' }} title="Nota de crédito: rebaja una compra anterior">NC</span>
}

// Panel de nota de crédito: muestra el proveedor, qué factura original rebaja y
// si ya está registrada, para que el revisor confirme antes de aprobar la reversa.
function NotaCreditoInfo({ detalle }) {
  const ref = detalle?.referencia
  const f = detalle?.factura || {}
  const morado = '#7c3aed'
  // El campo Razon del XML a veces trae basura interna del proveedor
  // (ej. "Codigo Cliente:..."). Solo se muestra si parece un motivo real.
  const razonUtil = ref?.razon && ref.razon.length <= 70 && !/codigo\s*cliente|transporte|^\s*$/i.test(ref.razon) ? ref.razon : null
  return (
    <div style={{ background: '#faf5ff', border: `2px solid ${morado}`, borderRadius: 12, marginBottom: 14, overflow: 'hidden' }}>
      <div style={{ background: morado, color: 'white', padding: '8px 16px', fontWeight: 800, fontSize: 14, letterSpacing: 0.3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span>🔁 NOTA DE CRÉDITO — RESTA UN GASTO (tratamiento distinto a una factura)</span>
        <span style={{ fontSize: 15, fontWeight: 800, whiteSpace: 'nowrap' }}>− {fmtCRC(f.total_comprobante ?? detalle.total_debe, f.moneda || detalle.moneda)}</span>
      </div>
      <div style={{ padding: '11px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700, color: '#111827', fontSize: 15 }}>{f.nombre_emisor || 'Proveedor'}</span>
        {f.cedula_emisor && <span style={{ fontSize: 12, color: C.gris }}>· céd. {f.cedula_emisor}</span>}
        {f.consecutivo && <span style={{ fontSize: 12, color: C.gris }}>· {f.consecutivo}</span>}
      </div>
      <div style={{ fontSize: 12.5, color: C.gris, margin: '4px 0 8px' }}>
        <b>Resta</b> un gasto anterior de este proveedor (el débito y el IVA van al haber). Revisá la cuenta y aprobala igual que una factura, con el botón de abajo.
      </div>
      {razonUtil && (
        <div style={{ fontSize: 12.5, color: '#111827', marginBottom: 6 }}>Motivo: <b>{razonUtil}</b></div>
      )}
      {!ref?.clave ? (
        <div style={{ fontSize: 12.5, color: C.ambar }}>La NC no declara a cuál factura corrige.</div>
      ) : ref.asiento ? (
        <div style={{ fontSize: 12.5, color: C.verde }}>
          ✅ La factura original ya está registrada — asiento <b>#{ref.asiento.id}</b> ({ref.asiento.estado}
          {ref.asiento.asiento_neo ? `, NEO ${ref.asiento.asiento_neo}` : ''}).
          {ref.factura ? <span style={{ color: C.gris }}> {`· ${ref.factura.nombre_emisor || ''}${ref.factura.consecutivo ? ' · ' + ref.factura.consecutivo : ''} · ${fmtCRC(ref.factura.total_comprobante, ref.factura.moneda)}`}</span> : null}
        </div>
      ) : ref.factura ? (
        <div style={{ fontSize: 12.5, color: C.ambar }}>
          ⚠️ La factura original está leída pero <b>sin asiento activo</b> ({ref.factura.nombre_emisor || ''}{ref.factura.consecutivo ? ' · ' + ref.factura.consecutivo : ''} · {fmtCRC(ref.factura.total_comprobante, ref.factura.moneda)}). Verificá antes de restar.
        </div>
      ) : (
        <div style={{ fontSize: 12.5, color: C.ambar }}>
          ⚠️ No encontramos la factura original en el sistema (puede ser anterior al corte o cargada a mano). Confirmá manualmente que corresponde.
        </div>
      )}
      </div>
    </div>
  )
}
function OrigenChip({ origen }) {
  const map = { xml: ['XML', C.petroleo], pdf: ['PDF', C.naranja], manual: ['Manual', C.gris], plantilla: ['Plantilla', C.vino] }
  const [txt, col] = map[origen] || ['—', C.gris]
  return <span style={{ fontSize: 9.5, fontWeight: 700, color: col, background: col + '18', borderRadius: 5, padding: '1px 6px', whiteSpace: 'nowrap' }}>{txt}</span>
}

function ResultadoCarga({ r, onClose }) {
  if (r.error) return (
    <div style={{ background: '#fee2e2', color: C.rojo, borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 13 }}>
      ⚠️ {r.error} <button onClick={onClose} style={xBtn}>✕</button>
    </div>
  )
  const { creados = [], ignorados = [], rechazados = [], acuses = [] } = r
  return (
    <div style={{ background: 'white', border: `1px solid ${C.borde}`, borderRadius: 10, padding: '12px 14px', marginBottom: 12, fontSize: 13 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <b style={{ color: C.vino }}>Resultado de la carga</b>
        <button onClick={onClose} style={xBtn}>✕</button>
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <span style={{ color: C.verde }}>✅ {creados.length} borrador(es)</span>
        <span style={{ color: C.ambar }}>⏭️ {ignorados.length} ignorado(s)</span>
        {acuses.length > 0 && <span style={{ color: C.petroleo }}>📩 {acuses.length} acuse(s) de Hacienda (ignorados)</span>}
        <span style={{ color: C.rojo }}>⛔ {rechazados.length} rechazado(s)</span>
      </div>
      {acuses.some((a) => /rechaz/i.test(a.estado || '')) && (
        <div style={{ marginTop: 8, color: C.rojo, fontSize: 12.5 }}>
          ⚠️ Hacienda RECHAZÓ {acuses.filter((a) => /rechaz/i.test(a.estado || '')).length} comprobante(s). Revisá esas facturas: no deberían contabilizarse.
        </div>
      )}
      {[...ignorados, ...rechazados].length > 0 && (
        <ul style={{ margin: '8px 0 0', paddingLeft: 18, color: C.gris }}>
          {ignorados.map((x, i) => <li key={'i' + i}>{x.archivo}: {x.motivo}</li>)}
          {rechazados.map((x, i) => <li key={'r' + i} style={{ color: C.rojo }}>{x.archivo}: {x.motivo}</li>)}
        </ul>
      )}
    </div>
  )
}

// ── Amarre de proveedor por cédula ───────────────────────────────────────────
function AmarrePanel({ detalle, cat, email, onListo }) {
  const f = useMemo(() => detalle.factura || {}, [detalle])
  const [sel, setSel] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  // Sugerencias: tokens del nombre y correo del emisor contra los nombres
  const sugeridos = useMemo(() => {
    const base = norm((f.nombre_emisor || '') + ' ' + (f.correo_emisor || ''))
    const tokens = [...new Set(base.split(/[^a-z0-9]+/).filter((t) => t.length >= 3 && !/^\d+$/.test(t)))]
    if (!tokens.length) return []
    const scored = (cat?.proveedores || []).map((p) => {
      const np = norm(p.nombre)
      const score = tokens.reduce((s, t) => s + (np.includes(t) ? 1 : 0), 0)
      return { p, score }
    }).filter((x) => x.score > 0)
    scored.sort((a, b) => b.score - a.score || (b.p.veces_visto || 0) - (a.p.veces_visto || 0))
    return scored.slice(0, 3).map((x) => x.p.id)
  }, [f, cat])

  const items = useMemo(() => buildItemsProveedores(cat?.proveedores, sugeridos), [cat, sugeridos])

  async function amarrar() {
    if (!sel) return
    setBusy(true); setMsg(null)
    try {
      await api('/proveedores', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accion: 'amarrar', asiento_id: detalle.id, proveedor_id: sel, actor: email }) })
      await onListo?.()
    } catch (e) { setMsg(e.message) } finally { setBusy(false) }
  }
  async function esNuevo() {
    setBusy(true); setMsg(null)
    try {
      await api('/proveedores', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accion: 'nuevo', asiento_id: detalle.id, actor: email }) })
      await onListo?.()
    } catch (e) { setMsg(e.message) } finally { setBusy(false) }
  }

  return (
    <div style={{ background: '#fff7ed', border: `1px solid ${C.naranja}55`, borderRadius: 12, padding: '13px 16px', marginBottom: 14 }}>
      <div style={{ fontWeight: 700, color: C.vino, fontSize: 14 }}>¿Este proveedor ya existe con otro nombre?</div>
      <div style={{ fontSize: 12.5, color: C.gris, margin: '2px 0 10px' }}>
        Llegó <b>{f.nombre_emisor || 'un emisor'}</b> (cédula {f.cedula_emisor}). Amarralo a un proveedor existente para no volver a preguntar, o marcalo como nuevo.
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <Combobox items={items} value={sel} onChange={setSel} placeholder="Buscar el proveedor existente…" ariaLabel="Proveedor existente" />
        </div>
        <button onClick={amarrar} disabled={!sel || busy} style={{ ...btn(C.naranja), opacity: sel && !busy ? 1 : 0.5 }}>
          {busy ? 'Amarrando…' : 'Amarrar a este proveedor'}
        </button>
        <button onClick={esNuevo} disabled={busy} style={{ background: 'white', color: C.vino, border: `1px solid ${C.bordeFuerte}`, borderRadius: 9, padding: '9px 15px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          Es nuevo de verdad
        </button>
      </div>
      {msg && <div style={{ marginTop: 8, color: C.rojo, fontSize: 12.5 }}>⚠️ {msg}</div>}
    </div>
  )
}

// ── Modal de descarte con motivo ─────────────────────────────────────────────
function DescartarModal({ onClose, onConfirmar, cantidad = 0 }) {
  const RAPIDOS = ['No es gasto', 'Estaba probando', 'Factura equivocada', 'Duplicada']
  const varios = cantidad > 1
  const [motivo, setMotivo] = useState(varios ? 'No es gasto' : '')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [onClose])
  async function confirmar() { setBusy(true); await onConfirmar(motivo.trim() || 'Sin motivo'); setBusy(false) }
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1000, padding: '60px 16px' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'white', borderRadius: 14, padding: '20px 22px', width: '100%', maxWidth: 440 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.vino, marginBottom: 4 }}>
          {varios ? `Descartar ${cantidad} borradores` : 'Descartar el borrador'}
        </div>
        <div style={{ fontSize: 12.5, color: C.gris, marginBottom: 12 }}>
          No se borra{varios ? 'n' : ''}: queda{varios ? 'n' : ''} consultable{varios ? 's' : ''} y podés recuperarlo{varios ? 's' : ''} desde Enviados. ¿Por qué {varios ? 'los' : 'lo'} descartás?
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {RAPIDOS.map((r) => (
            <button key={r} onClick={() => setMotivo(r)}
              style={{ padding: '5px 11px', borderRadius: 20, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit',
                border: `1px solid ${motivo === r ? C.naranja : C.bordeFuerte}`, background: motivo === r ? C.naranja + '18' : 'white', color: motivo === r ? C.vino : C.gris }}>{r}</button>
          ))}
        </div>
        <input autoFocus value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo (podés escribir el tuyo)"
          style={{ width: '100%', boxSizing: 'border-box', padding: '8px 11px', borderRadius: 8, border: `1px solid ${C.bordeFuerte}`, fontSize: 13, outline: 'none' }} />
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button onClick={confirmar} disabled={busy} style={btn(C.vino)}>
            {busy ? 'Descartando…' : varios ? `Descartar ${cantidad}` : 'Descartar'}
          </button>
          <button onClick={onClose} style={{ background: 'white', color: C.gris, border: `1px solid ${C.bordeFuerte}`, borderRadius: 9, padding: '9px 15px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
        </div>
      </div>
    </div>
  )
}

const xBtn = { background: 'none', border: 'none', cursor: 'pointer', color: C.gris, fontSize: 14 }
const miniBtn = { background: 'white', border: `1px solid ${C.bordeFuerte}`, borderRadius: 7, padding: '5px 9px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', color: C.gris, fontFamily: 'inherit' }
function btn(bg) { return { background: bg, color: 'white', border: 'none', borderRadius: 9, padding: '9px 15px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' } }
