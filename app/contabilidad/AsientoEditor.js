'use client'
import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import Combobox from './Combobox'
import {
  C, MOD, fmtCRC, r2, api, indexCuentas,
  buildItemsCuentas, buildItemsCentros,
} from './lib'

// Editor de asiento línea por línea. Reutilizado en Bandeja y Montar.
// props:
//   asiento (con lineas), cat (catálogos), email, onSaved, onApproved,
//   avisos [], emisorCedula (para gasto inusual), compact
export default function AsientoEditor({ asiento, cat, email, onSaved, onApproved, onCreated, avisos = [], emisorCedula, autoFocusPrimera, mode = 'editar' }) {
  const esCrear = mode === 'crear' || !asiento.id
  const puedeAprobar = ['aprobador', 'admin'].includes(cat?.yo?.rol)
  const montoMax = cat?.yo?.monto_maximo != null ? Number(cat.yo.monto_maximo) : null
  const porCodigo = useMemo(() => indexCuentas(cat?.cuentas), [cat])

  const [fecha, setFecha] = useState(asiento.fecha)
  const [descripcion, setDescripcion] = useState(asiento.descripcion || '')
  const [moneda, setMoneda] = useState(asiento.moneda || 'CRC')
  const [tipoCambio, setTipoCambio] = useState(asiento.tipo_cambio || '')
  const [deducible, setDeducible] = useState(asiento.deducible !== false)
  const [lineas, setLineas] = useState(() => normalizarLineas(asiento.lineas))
  const [activeLine, setActiveLine] = useState(0)
  const [msg, setMsg] = useState(null)
  const [saving, setSaving] = useState(false)
  const [historico, setHistorico] = useState({ por_cuenta: {}, proveedor_stats: null })

  const cuentaItems = useMemo(() => buildItemsCuentas(cat?.cuentas, [descripcion && null].filter(Boolean)), [cat, descripcion])
  const centroItems = useMemo(() => buildItemsCentros(cat?.centros), [cat])

  useEffect(() => {
    setFecha(asiento.fecha); setDescripcion(asiento.descripcion || '')
    setMoneda(asiento.moneda || 'CRC'); setTipoCambio(asiento.tipo_cambio || '')
    setDeducible(asiento.deducible !== false); setLineas(normalizarLineas(asiento.lineas))
    setMsg(null)
  }, [asiento])

  // ── Control de gasto inusual: totales por cuenta + stats del proveedor ──────
  const cuentasDebito = useMemo(() => [...new Set(lineas.filter((l) => Number(l.debe) > 0 && l.cuenta).map((l) => l.cuenta))], [lineas])
  const cuentasKey = cuentasDebito.join(',')
  useEffect(() => {
    let cancel = false
    if (!cuentasKey && !emisorCedula) { setHistorico({ por_cuenta: {}, proveedor_stats: null }); return }
    const t = setTimeout(async () => {
      try {
        const q = new URLSearchParams()
        if (cuentasKey) q.set('cuentas', cuentasKey)
        if (emisorCedula) q.set('emisor', emisorCedula)
        const data = await api('/gasto-historico?' + q.toString())
        if (!cancel) setHistorico(data)
      } catch { /* no crítico */ }
    }, 400)
    return () => { cancel = true; clearTimeout(t) }
  }, [cuentasKey, emisorCedula])

  const totalDebe = useMemo(() => r2(lineas.reduce((s, l) => s + (Number(l.debe) || 0), 0)), [lineas])
  const totalHaber = useMemo(() => r2(lineas.reduce((s, l) => s + (Number(l.haber) || 0), 0)), [lineas])
  const diferencia = r2(totalDebe - totalHaber)

  // Aviso de monto inusual del proveedor (>3σ)
  const montoInusual = useMemo(() => {
    const st = historico.proveedor_stats
    if (!st || !st.desviacion) return false
    return totalDebe > st.promedio + 3 * st.desviacion
  }, [historico, totalDebe])

  // ── Gating de aprobación (espejo de la validación del backend) ──────────────
  const cuentasNoImputables = useMemo(() => lineas
    .filter((l) => l.cuenta)
    .filter((l) => { const c = porCodigo.get(l.cuenta); return !c || !c.imputable || !c.activa })
    .map((l) => l.cuenta), [lineas, porCodigo])

  const razonBloqueo = useMemo(() => {
    if (lineas.filter((l) => Number(l.debe) || Number(l.haber)).length < 2) return 'Necesita al menos dos líneas con monto.'
    if (diferencia !== 0) return `No cuadra: diferencia de ${fmtCRC(Math.abs(diferencia), moneda)}.`
    if (lineas.some((l) => !l.cuenta)) return 'Hay líneas sin cuenta.'
    if (cuentasNoImputables.length) return `Cuenta no imputable: ${cuentasNoImputables[0]}.`
    if (!puedeAprobar) return 'Tu rol no puede aprobar (solo aprobador o admin).'
    if (montoMax != null && totalDebe > montoMax) return `Supera tu monto máximo (${fmtCRC(montoMax, moneda)}).`
    return null
  }, [lineas, diferencia, cuentasNoImputables, puedeAprobar, montoMax, totalDebe, moneda])

  // ── Manipulación de líneas ──────────────────────────────────────────────────
  const setLinea = useCallback((idx, patch) => {
    setLineas((ls) => ls.map((l, i) => i === idx ? { ...l, ...patch } : l))
  }, [])
  const agregarLinea = useCallback((afterIdx) => {
    setLineas((ls) => {
      const nueva = { cuenta: '', centro_costo_id: null, debe: '', haber: '', observacion: '' }
      const pos = afterIdx == null ? ls.length : afterIdx + 1
      const copy = [...ls]; copy.splice(pos, 0, nueva)
      return copy
    })
    setActiveLine((afterIdx == null ? lineas.length : afterIdx + 1))
  }, [lineas.length])
  const borrarLinea = useCallback((idx) => {
    setLineas((ls) => ls.length <= 1 ? ls : ls.filter((_, i) => i !== idx))
    setActiveLine((a) => Math.max(0, a > idx ? a - 1 : a))
  }, [])

  // ── Guardar / Aprobar ───────────────────────────────────────────────────────
  const guardar = useCallback(async () => {
    if (!fecha) { setMsg({ ok: false, t: 'Falta la fecha.' }); return null }
    if (!descripcion.trim()) { setMsg({ ok: false, t: 'Falta la descripción.' }); return null }
    setSaving(true); setMsg(null)
    try {
      const lineasPayload = lineas.map((l, i) => ({
        orden: i + 1, cuenta: l.cuenta, centro_costo_id: l.centro_costo_id || null,
        debe: Number(l.debe) || 0, haber: Number(l.haber) || 0, observacion: l.observacion || null,
      }))
      const base = {
        fecha, descripcion, moneda,
        tipo_cambio: moneda === 'USD' ? Number(tipoCambio) || null : null,
        deducible, lineas: lineasPayload,
      }
      if (esCrear) {
        const creado = await api('/asientos', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ...base, tipo_origen: asiento.tipo_origen || 'manual', plantilla_id: asiento.plantilla_id || null, creado_por: email }),
        })
        setMsg({ ok: true, t: 'Borrador creado. Ya aparece en la Bandeja.' })
        onCreated?.(creado)
        return creado
      }
      await api(`/asientos/${asiento.id}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...base, actor: email }),
      })
      setMsg({ ok: true, t: 'Borrador guardado.' })
      onSaved?.()
      return { id: asiento.id }
    } catch (e) { setMsg({ ok: false, t: e.message }); return null }
    finally { setSaving(false) }
  }, [esCrear, asiento.id, asiento.tipo_origen, asiento.plantilla_id, email, fecha, descripcion, moneda, tipoCambio, deducible, lineas, onSaved, onCreated])

  const aprobar = useCallback(async () => {
    if (esCrear) { setMsg({ ok: false, t: 'Primero guardá el borrador; aprobalo desde la Bandeja.' }); return }
    if (razonBloqueo) { setMsg({ ok: false, t: razonBloqueo }); return }
    setSaving(true); setMsg(null)
    try {
      await guardar()
      await api(`/asientos/${asiento.id}/aprobar`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ actor: email }) })
      setMsg({ ok: true, t: '✅ Aprobado y enviado a la cola de NEO.' })
      onApproved?.()
    } catch (e) { setMsg({ ok: false, t: e.message }) }
    finally { setSaving(false) }
  }, [esCrear, asiento.id, email, razonBloqueo, guardar, onApproved])

  // ── Atajos globales mientras el editor está montado ─────────────────────────
  useEffect(() => {
    const h = (e) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); guardar() }
      else if (mod && e.key === 'Enter') { e.preventDefault(); if (!esCrear) aprobar() }
      else if (mod && (e.key === 'Backspace' || e.key === 'Delete')) { e.preventDefault(); borrarLinea(activeLine) }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [guardar, aprobar, borrarLinea, activeLine, esCrear])

  const cell = { padding: '4px 6px', borderBottom: `1px solid ${C.borde}`, verticalAlign: 'top' }
  const numInput = {
    width: '100%', boxSizing: 'border-box', padding: '6px 8px', border: `1px solid ${C.bordeFuerte}`,
    borderRadius: 6, fontSize: 13, textAlign: 'right', fontVariantNumeric: 'tabular-nums', outline: 'none',
    fontFamily: 'Rubik, sans-serif',
  }

  return (
    <div>
      {/* Cabecera */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 10, alignItems: 'flex-end' }}>
        <Campo label="Fecha">
          <input type="date" value={fecha || ''} onChange={(e) => setFecha(e.target.value)} style={inp} />
        </Campo>
        <Campo label="Descripción" grow>
          <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} style={inp} />
        </Campo>
        <Campo label="Moneda">
          <select value={moneda} onChange={(e) => setMoneda(e.target.value)} style={inp}>
            <option value="CRC">CRC ₡</option><option value="USD">USD $</option>
          </select>
        </Campo>
        {moneda === 'USD' && (
          <Campo label="Tipo cambio">
            <input type="number" step="0.01" value={tipoCambio} onChange={(e) => setTipoCambio(e.target.value)} style={{ ...inp, width: 90 }} />
          </Campo>
        )}
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', paddingBottom: 6 }}>
          <input type="checkbox" checked={deducible} onChange={(e) => setDeducible(e.target.checked)} /> Deducible
        </label>
      </div>

      {avisos.map((a, i) => (
        <div key={i} style={{ background: C.ambarBg, color: C.ambar, borderRadius: 8, padding: '7px 11px', fontSize: 12.5, marginBottom: 8, border: `1px solid ${C.ambar}44` }}>⚠️ {a}</div>
      ))}
      {montoInusual && (
        <div style={{ background: C.ambarBg, color: C.ambar, borderRadius: 8, padding: '7px 11px', fontSize: 12.5, marginBottom: 8, border: `1px solid ${C.ambar}44` }}>
          ⚠️ Este monto es inusual para este proveedor (promedio ~{fmtCRC(historico.proveedor_stats?.promedio, moneda)}).
        </div>
      )}

      {/* Tabla de líneas */}
      <div style={{ overflowX: 'auto', border: `1px solid ${C.borde}`, borderRadius: 10 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: C.petroleo, color: 'white' }}>
              <th style={th}>Cuenta</th>
              <th style={th}>Centro de costo</th>
              <th style={{ ...th, textAlign: 'right', width: 130 }}>Debe</th>
              <th style={{ ...th, textAlign: 'right', width: 130 }}>Haber</th>
              <th style={th}>Observación</th>
              <th style={{ ...th, width: 34 }}></th>
            </tr>
          </thead>
          <tbody>
            {lineas.map((l, idx) => {
              const h = historico.por_cuenta?.[l.cuenta]
              const noImput = l.cuenta && (() => { const c = porCodigo.get(l.cuenta); return !c || !c.imputable })()
              return (
                <tr key={idx} onFocusCapture={() => setActiveLine(idx)}
                  style={{ background: idx === activeLine ? C.crema : 'white' }}>
                  <td style={{ ...cell, minWidth: 200 }}>
                    <Combobox
                      items={cuentaItems} value={l.cuenta} grouped
                      onChange={(v) => setLinea(idx, { cuenta: v })}
                      placeholder="Elegir cuenta…" ariaLabel="Cuenta contable"
                      autoFocus={autoFocusPrimera && idx === 0 && !l.cuenta}
                    />
                    {noImput && <div style={{ fontSize: 10.5, color: C.rojo, marginTop: 2 }}>No imputable</div>}
                    {Number(l.debe) > 0 && h && (
                      <div style={{ fontSize: 10.5, color: C.gris, marginTop: 2 }}>
                        Mes: {fmtCRC(h.mes_actual, moneda)} · Anterior: {fmtCRC(h.mes_anterior, moneda)}
                      </div>
                    )}
                  </td>
                  <td style={{ ...cell, minWidth: 180 }}>
                    <Combobox
                      items={centroItems} value={l.centro_costo_id}
                      onChange={(v) => setLinea(idx, { centro_costo_id: v })}
                      placeholder="—" ariaLabel="Centro de costo"
                    />
                  </td>
                  <td style={cell}>
                    <input type="number" step="0.01" value={l.debe} style={numInput}
                      onChange={(e) => setLinea(idx, { debe: e.target.value, haber: e.target.value ? '' : l.haber })}
                      onKeyDown={(e) => onLineaKey(e, idx)} aria-label="Debe" />
                  </td>
                  <td style={cell}>
                    <input type="number" step="0.01" value={l.haber} style={numInput}
                      onChange={(e) => setLinea(idx, { haber: e.target.value, debe: e.target.value ? '' : l.debe })}
                      onKeyDown={(e) => onLineaKey(e, idx)} aria-label="Haber" />
                  </td>
                  <td style={cell}>
                    <input value={l.observacion || ''} style={{ ...inp, minWidth: 120 }}
                      onChange={(e) => setLinea(idx, { observacion: e.target.value })}
                      onKeyDown={(e) => onLineaKey(e, idx)} aria-label="Observación" />
                  </td>
                  <td style={{ ...cell, textAlign: 'center' }}>
                    <button onClick={() => borrarLinea(idx)} title="Borrar línea (⌘⌫)"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.rojo, fontSize: 15 }}>✕</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <button onClick={() => agregarLinea(null)}
        style={{ marginTop: 8, background: 'white', border: `1px dashed ${C.bordeFuerte}`, borderRadius: 8, padding: '6px 12px', fontSize: 12.5, cursor: 'pointer', color: C.vino }}>
        + Agregar línea <kbd style={kbd}>Enter</kbd>
      </button>

      {/* Totales */}
      <div style={{ display: 'flex', gap: 18, justifyContent: 'flex-end', alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
        <Total label="Debe" value={fmtCRC(totalDebe, moneda)} />
        <Total label="Haber" value={fmtCRC(totalHaber, moneda)} />
        <Total label="Diferencia" value={fmtCRC(diferencia, moneda)} color={diferencia === 0 ? C.verde : C.rojo} />
      </div>

      {msg && (
        <div style={{ marginTop: 10, padding: '9px 13px', borderRadius: 8, fontSize: 13,
          background: msg.ok ? '#dcfce7' : '#fee2e2', color: msg.ok ? C.verde : C.rojo }}>{msg.t}</div>
      )}

      {/* Acciones */}
      <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
        <button onClick={guardar} disabled={saving} style={btn(C.petroleo)}>
          {esCrear ? 'Crear borrador' : 'Guardar borrador'} <kbd style={kbdLight}>{MOD}S</kbd>
        </button>
        {!esCrear && (
          <button onClick={aprobar} disabled={saving || !!razonBloqueo}
            title={razonBloqueo || 'Aprobar y mandar a NEO'}
            style={{ ...btn(C.naranja), opacity: razonBloqueo ? 0.5 : 1, cursor: razonBloqueo ? 'not-allowed' : 'pointer' }}>
            Aprobar y mandar a NEO <kbd style={kbdLight}>{MOD}↵</kbd>
          </button>
        )}
        {!esCrear && razonBloqueo && <span style={{ fontSize: 12, color: C.rojo, alignSelf: 'center' }}>🔒 {razonBloqueo}</span>}
      </div>
    </div>
  )

  function onLineaKey(e, idx) {
    if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); agregarLinea(idx) }
  }
}

function normalizarLineas(lineas) {
  const ls = (lineas || []).map((l) => ({
    cuenta: l.cuenta || '', centro_costo_id: l.centro_costo_id || null,
    debe: Number(l.debe) ? String(l.debe) : '', haber: Number(l.haber) ? String(l.haber) : '',
    observacion: l.observacion || '',
  }))
  return ls.length ? ls : [{ cuenta: '', centro_costo_id: null, debe: '', haber: '', observacion: '' }]
}

const inp = { padding: '6px 9px', borderRadius: 7, border: `1px solid ${C.bordeFuerte}`, fontSize: 13, outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }
const th = { textAlign: 'left', padding: '8px 8px', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.5, whiteSpace: 'nowrap' }
const kbd = { fontSize: 10, background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 4, padding: '1px 5px', marginLeft: 4, fontFamily: 'inherit' }
const kbdLight = { fontSize: 10, background: 'rgba(255,255,255,0.25)', borderRadius: 4, padding: '1px 5px', marginLeft: 6 }
function btn(bg) { return { background: bg, color: 'white', border: 'none', borderRadius: 9, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', fontFamily: 'inherit' } }

function Campo({ label, children, grow }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: grow ? 1 : 'none', minWidth: grow ? 200 : 'auto' }}>
      <label style={{ fontSize: 10.5, fontWeight: 700, color: C.petroleo, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</label>
      {children}
    </div>
  )
}
function Total({ label, value, color }) {
  return (
    <div style={{ textAlign: 'right' }}>
      <div style={{ fontSize: 10, color: C.gris, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 700, color: color || C.vino, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  )
}
