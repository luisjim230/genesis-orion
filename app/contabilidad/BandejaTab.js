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
  const [descartar, setDescartar] = useState(null) // { id }
  const [resumenColapsado, setResumenColapsado] = useState(!!cat?.ui_prefs?.resumen_colapsado)
  const [listaColapsada, setListaColapsada] = useState(!!cat?.ui_prefs?.lista_colapsada)
  const fileRef = useRef(null)

  // Guardar preferencias de UI por usuario (en la base, no en el navegador)
  const guardarPref = useCallback((patch) => {
    api('/config', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ actor: email, ui_prefs: patch }) }).catch(() => {})
  }, [email])
  const toggleResumen = () => { setResumenColapsado((v) => { guardarPref({ resumen_colapsado: !v }); return !v }) }
  const toggleLista = () => { setListaColapsada((v) => { guardarPref({ lista_colapsada: !v }); return !v }) }

  const cargarIgnoradas = useCallback(async () => {
    try { setIgnoradas(await api('/facturas?vista=ignoradas')) } catch { /* */ }
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

  const confirmarDescarte = useCallback(async (id, motivo) => {
    try {
      await api(`/asientos/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accion: 'descartar', motivo, actor: email }) })
      setDescartar(null)
      if (selId === id) setSelId(null)
      await cargar(); await cargarIgnoradas()
    } catch (e) { alert(e.message) }
  }, [email, selId, cargar, cargarIgnoradas])

  const recargarDetalle = useCallback(async () => {
    if (selId) { try { setDetalle(await api(`/asientos/${selId}`)) } catch { /* */ } }
  }, [selId])

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
        <button onClick={onMontarManual} style={btn(C.vino)}>Montar manual</button>
      </div>

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
                  <button disabled={convirtiendo === f.clave} onClick={() => convertir(f.clave)} style={btn(C.petroleo)}>
                    {convirtiendo === f.clave ? 'Convirtiendo…' : 'Convertir en gasto'}
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
              <button onClick={toggleLista} title="Colapsar la lista" style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.gris, fontSize: 14 }}>◂</button>
            </div>
            {loading ? <div style={{ padding: 20, color: C.gris, fontSize: 13 }}>Cargando…</div>
              : lista.length === 0 ? <div style={{ padding: 20, color: C.gris, fontSize: 13 }}>No hay borradores. Soltá una factura arriba.</div>
              : (
                <div style={{ maxHeight: 620, overflowY: 'auto' }}>
                  {lista.map((a) => (
                    <div key={a.id} onClick={() => setSelId(a.id)}
                      style={{
                        padding: '9px 10px 9px 12px', borderBottom: `1px solid ${C.borde}`, cursor: 'pointer',
                        background: a.id === selId ? C.naranja + '18' : 'white',
                        borderLeft: `3px solid ${a.id === selId ? C.naranja : 'transparent'}`,
                        display: 'flex', gap: 6, alignItems: 'flex-start',
                      }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
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
                          <span style={{ fontSize: 13, fontWeight: 600, color: C.vino, fontVariantNumeric: 'tabular-nums' }}>{fmtCRC(a.total_debe, a.moneda)}</span>
                        </div>
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); setDescartar({ id: a.id }) }} title="Descartar este borrador"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.grisClaro, fontSize: 14, padding: '0 2px' }} aria-label="Descartar borrador">✕</button>
                    </div>
                  ))}
                </div>
              )}
          </div>
        )}

        {/* Detalle: visor + editor */}
        <div>
          {!detalle ? (
            <div style={{ padding: 40, textAlign: 'center', color: C.gris, background: 'white', borderRadius: 12, border: `1px solid ${C.borde}` }}>
              Elegí un borrador de la lista.
            </div>
          ) : (
            <>
              {!proveedorAmarrado && (
                <AmarrePanel detalle={detalle} cat={cat} email={email}
                  onListo={async () => { await cargar(); await recargarDetalle(); recargarCat?.() }} />
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
function DescartarModal({ onClose, onConfirmar }) {
  const RAPIDOS = ['Estaba probando', 'Factura equivocada', 'Duplicada', 'No es gasto']
  const [motivo, setMotivo] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [onClose])
  async function confirmar() { setBusy(true); await onConfirmar(motivo.trim() || 'Sin motivo'); setBusy(false) }
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1000, padding: '60px 16px' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'white', borderRadius: 14, padding: '20px 22px', width: '100%', maxWidth: 440 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.vino, marginBottom: 4 }}>Descartar el borrador</div>
        <div style={{ fontSize: 12.5, color: C.gris, marginBottom: 12 }}>No se borra: queda consultable y podés recuperarlo desde Enviados. ¿Por qué lo descartás?</div>
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
          <button onClick={confirmar} disabled={busy} style={btn(C.vino)}>{busy ? 'Descartando…' : 'Descartar'}</button>
          <button onClick={onClose} style={{ background: 'white', color: C.gris, border: `1px solid ${C.bordeFuerte}`, borderRadius: 9, padding: '9px 15px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
        </div>
      </div>
    </div>
  )
}

const xBtn = { background: 'none', border: 'none', cursor: 'pointer', color: C.gris, fontSize: 14 }
function btn(bg) { return { background: bg, color: 'white', border: 'none', borderRadius: 9, padding: '9px 15px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' } }
