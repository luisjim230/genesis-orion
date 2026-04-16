'use client'
import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import ModalEnviarWhatsApp from '../components/ModalEnviarWhatsApp'
import SyncBadge from '../components/SyncBadge';

const GOLD   = 'var(--orange)'
const BG     = 'var(--cream)'
const SURF   = '#ffffff'
const BORDER = 'var(--border-soft)'
const TEXT   = 'var(--text-primary)'
const MUTED  = 'var(--text-muted)'

const S = {
  badge: (c) => ({ background: c+'22', color: c, border: `1px solid ${c}55`, borderRadius: 20, padding: '3px 10px', fontSize: '0.72em', fontWeight: 600, whiteSpace: 'nowrap', display: 'inline-block' }),
  th: { textAlign: 'left', padding: '9px 12px', background: 'var(--cream)', color: 'var(--text-muted)', fontSize: '0.7em', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '2px solid var(--border)', whiteSpace: 'nowrap' },
  td: { padding: '9px 12px', borderBottom: '1px solid var(--border-soft)', color: 'var(--text-primary)', verticalAlign: 'middle', fontSize: '0.84em' },
  card: { background: SURF, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '18px 20px', marginBottom: 16 },
  input: { background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 12px', color: TEXT, fontSize: '0.85em', fontFamily: 'DM Sans,sans-serif', outline: 'none' },
  btn: (c = GOLD) => ({ background: c, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontSize: '0.83em', fontWeight: 600, fontFamily: 'DM Sans,sans-serif' }),
  btnSm: (c = SURF) => ({ background: c, color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '5px 11px', cursor: 'pointer', fontSize: '0.78em', fontFamily: 'DM Sans,sans-serif' }),
}

function diasDesde(fechaStr) {
  if (!fechaStr) return null
  return Math.floor((new Date() - new Date(fechaStr)) / 86400000)
}

function colorDias(d, limA, limR) {
  if (d === null) return MUTED
  if (d <= limA) return '#68d391'
  if (d <= limR) return '#f6ad55'
  return '#fc8181'
}

function badgeDias(d, limA, limR) {
  if (d === null) return { label: '–', color: MUTED }
  const c = colorDias(d, limA, limR)
  const emoji = d <= limA ? '🟢' : d <= limR ? '🟡' : '🔴'
  return { label: `${emoji} ${d}d`, color: c }
}

// ─── TAB 1: ALERTAS ──────────────────────────────────────────────────────────
function TabAlertas({ ordenes, items, setItems, loading }) {
  const [limA, setLimA] = useState(5)
  const [limR, setLimR] = useState(10)
  const [filtroProv, setFiltroProv] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('Todos')
  const [busqueda, setBusqueda] = useState('')
  const [confirmandoCancelar, setConfirmandoCancelar] = useState(null)
  const [cancelando, setCancelando] = useState(false)

  const proveedores = useMemo(() => [...new Set(items.map(it => it.proveedor).filter(Boolean))].sort(), [items])

  async function cancelarItem(item) {
    setCancelando(true)
    try {
      const { error } = await supabase.from('ordenes_compra_items').update({ estado_item: 'cancelado' }).eq('id', item.id)
      if (!error) {
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, estado_item: 'cancelado' } : i))
      } else {
        console.error('Error cancelando:', error)
      }
    } catch(e) {
      console.error(e)
    } finally {
      setConfirmandoCancelar(null)
      setCancelando(false)
    }
  }

  const pendientes = useMemo(() => {
    return items
      .filter(it => it.estado_item === 'pendiente' || it.estado_item === 'parcial')
      .map(it => {
        const orden = ordenes.find(o => o.id === it.orden_id)
        const dias = diasDesde(orden?.fecha_orden)
        const pendiente = Math.max(0, (parseFloat(it.cantidad_ordenada) || 0) - (parseFloat(it.cantidad_recibida) || 0))
        const estadoLabel = it.estado_item === 'parcial' ? 'Parcial' : 'Pendiente'
        return { ...it, orden, dias, pendiente, estadoLabel }
      })
      .filter(it => {
        if (filtroProv && !(it.proveedor || '').toLowerCase().includes(filtroProv.toLowerCase())) return false
        if (filtroEstado !== 'Todos' && it.estado_item !== filtroEstado) return false
        if (busqueda.trim()) {
          const q = busqueda.toLowerCase()
          if (!(it.nombre || '').toLowerCase().includes(q) && !(it.codigo || '').toLowerCase().includes(q)) return false
        }
        return true
      })
      .sort((a, b) => (b.dias || 0) - (a.dias || 0))
  }, [items, ordenes, filtroProv, filtroEstado, busqueda])

  const totPend    = pendientes.filter(x => x.estado_item === 'pendiente').length
  const totParcial = pendientes.filter(x => x.estado_item === 'parcial').length
  const totCritico = pendientes.filter(x => (x.dias || 0) > limR).length

  return (
    <div>
      <p style={{ fontSize: '0.84em', color: MUTED, marginBottom: 16 }}>
        Productos ordenados que aún no han llegado completamente. El semáforo indica urgencia según los días desde la orden.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 20 }}>
        {[
          ['🔴 Pendientes Totales',     totPend,    '#fc8181'],
          ['🟡 Parcialmente Recibidos', totParcial, '#f6ad55'],
          ['🚨 Críticos (superan días)',totCritico, '#f43f5e'],
        ].map(([l, v, c]) => (
          <div key={l} style={{ background: SURF, border: `1px solid ${c}33`, borderTop: `3px solid ${c}`, borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ marginBottom:12 }}>
        <SyncBadge reporteIds={["items_comprados", "items_facturados"]} label="Datos trazabilidad" />
      </div>
            <div style={{ fontSize: '0.72em', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{l}</div>
            <div style={{ fontSize: '1.8em', fontWeight: 700, color: c, marginTop: 4 }}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{ ...S.card, marginBottom: 16 }}>
        <div style={{ fontWeight: 600, color: GOLD, fontSize: '0.8em', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>⚙️ Configuración de semáforo</div>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '0.82em', color: TEXT }}>🟡 Días para En riesgo</span>
            <button onClick={() => setLimA(v => Math.max(1, v - 1))} style={{ ...S.btnSm(), padding: '3px 9px', fontSize: '1em' }}>−</button>
            <span style={{ fontWeight: 700, color: TEXT, minWidth: 28, textAlign: 'center' }}>{limA}</span>
            <button onClick={() => setLimA(v => Math.min(limR - 1, v + 1))} style={{ ...S.btnSm(), padding: '3px 9px', fontSize: '1em' }}>+</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '0.82em', color: TEXT }}>🔴 Días para Crítico</span>
            <button onClick={() => setLimR(v => Math.max(limA + 1, v - 1))} style={{ ...S.btnSm(), padding: '3px 9px', fontSize: '1em' }}>−</button>
            <span style={{ fontWeight: 700, color: TEXT, minWidth: 28, textAlign: 'center' }}>{limR}</span>
            <button onClick={() => setLimR(v => v + 1)} style={{ ...S.btnSm(), padding: '3px 9px', fontSize: '1em' }}>+</button>
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>

        <select style={{ ...S.input, cursor: 'pointer' }} value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}>
          <option value="Todos">📋 Todos</option>
          <option value="pendiente">🔴 Pendientes</option>
          <option value="parcial">🟡 Parciales</option>
        </select>
        <input style={{ ...S.input, flex: '1 1 160px' }} placeholder="🏭 Buscar proveedor..." value={filtroProv} onChange={e => setFiltroProv(e.target.value)} />
        <input style={{ ...S.input, flex: '1 1 200px' }} placeholder="🔍 Buscar por código o nombre..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
      </div>
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: MUTED }}>Cargando...</div>
      ) : pendientes.length === 0 ? (
        <div style={{ ...S.card, textAlign: 'center', color: '#68d391', padding: 40 }}>✅ Sin ítems pendientes.</div>
      ) : (
        <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 480, border: '1px solid var(--border-soft)', borderRadius: 10 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83em' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}><tr>
              {['Estado', '⏱️ Días', 'Código', 'Nombre del producto', 'Proveedor', 'Orden / Lote', 'Cant. ordenada', 'Cant. recibida', 'Pendiente', ''].map(h => (
                <th key={h} style={S.th}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {pendientes.map(it => {
                const { label: dLabel, color: dColor } = badgeDias(it.dias, limA, limR)
                const lote = it.orden?.nombre_lote || it.orden?.id?.substring(0, 10) || '—'
                return (
                  <tr key={it.id}>
                    <td style={S.td}>
                      <span style={S.badge(it.estado_item === 'parcial' ? '#f6ad55' : '#fc8181')}>
                        {it.estado_item === 'parcial' ? '🟡' : '🔴'} {it.estadoLabel}
                      </span>
                    </td>
                    <td style={S.td}><span style={S.badge(dColor)}>{dLabel}</span></td>
                    <td style={{ ...S.td, fontFamily: 'monospace', fontSize: '0.77em', color: MUTED }}>{it.codigo || '—'}</td>
                    <td style={{ ...S.td, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>{it.nombre || '—'}</td>
                    <td style={S.td}>{it.proveedor || '—'}</td>
                    <td style={{ ...S.td, fontFamily: 'monospace', fontSize: '0.77em' }}>{lote}</td>
                    <td style={{ ...S.td, textAlign: 'right' }}>{it.cantidad_ordenada || 0}</td>
                    <td style={{ ...S.td, textAlign: 'right', color: '#68d391' }}>{it.cantidad_recibida || 0}</td>
                    <td style={{ ...S.td, textAlign: 'right', fontWeight: 700, color: '#f6ad55' }}>{it.pendiente}</td>
                    <td style={S.td}><button onClick={() => setConfirmandoCancelar(it)} style={{ padding: '4px 10px', background: 'transparent', border: '1px solid #fc818166', borderRadius: 6, color: '#fc8181', cursor: 'pointer', fontSize: '0.78em', whiteSpace: 'nowrap' }}>✕ Cancelar</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div style={{ fontSize: '0.75em', color: MUTED, marginTop: 8, textAlign: 'right' }}>{pendientes.length} ítem(s) pendientes</div>
        </div>
      )}

      {confirmandoCancelar && (
        <div style={{ position: 'fixed', inset: 0, background: '#00000066', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', border: '1px solid #fc818155', borderRadius: 12, padding: 24, maxWidth: 420, width: '90%', boxShadow: '0 8px 32px #0003' }}>
            <div style={{ fontSize: '1.1em', fontWeight: 700, color: '#fc8181', marginBottom: 10 }}>⚠️ Cancelar ítem</div>
            <p style={{ color: '#555', fontSize: '0.88em', marginBottom: 8 }}>¿Confirmás que este ítem <strong>nunca va a llegar</strong>?</p>
            <div style={{ background: '#f7f9fc', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: '0.85em' }}>
              <div style={{ fontWeight: 600, color: '#2a3a50' }}>{confirmandoCancelar.nombre}</div>
              <div style={{ color: '#888', marginTop: 2 }}>{confirmandoCancelar.proveedor} · {confirmandoCancelar.dias} días esperando</div>
            </div>
            <p style={{ color: '#aaa', fontSize: '0.78em', marginBottom: 16 }}>El ítem se marcará como <strong style={{ color: '#fc8181' }}>cancelado</strong>. Dejará de aparecer en tránsito y en alertas, pero quedará en el historial de la orden.</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmandoCancelar(null)} style={{ ...S.btnSm(), padding: '8px 16px' }}>Mantener en tránsito</button>
              <button onClick={() => cancelarItem(confirmandoCancelar)} disabled={cancelando} style={{ ...S.btn('#fc8181'), opacity: cancelando ? 0.6 : 1 }}>{cancelando ? 'Cancelando...' : 'Sí, cancelar ítem'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── TAB 2: HISTORIAL DE ÓRDENES ─────────────────────────────────────────────
function TabHistorial({ ordenes, items, loading, recargar }) {
  const [detalle, setDetalle] = useState(null)
  const [msg, setMsg] = useState(null)
  const [modalWA, setModalWA] = useState(null)
  const [busq, setBusq] = useState('')

  function mostrarMsg(t, tipo = 'ok') { setMsg({ t, tipo }); setTimeout(() => setMsg(null), 4000) }

  async function descargarOC(orden, itsOrden) {
    try {
      // Construir items en formato NEO (mismo que exportar-excel)
      const items = itsOrden.map(it => ({
        codigo: it.codigo || '',
        cantidad: it.cantidad_ordenada || 0,
        ultimo_costo: it.costo_unitario || 0,
        descuento: it.descuento || 0,
      }))
      const res = await fetch('/api/exportar-excel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, proveedor: orden.nombre_lote || 'Orden' }),
      })
      if (!res.ok) { mostrarMsg('Error al generar Excel', 'err'); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = (orden.nombre_lote || 'OC') + '.xlsx'
      a.click()
      URL.revokeObjectURL(url)
    } catch(e) {
      mostrarMsg('Error: ' + e.message, 'err')
    }
  }

    async function eliminarOrden(id) {
    if (!confirm('¿Eliminar esta orden y todos sus ítems? Esta acción no se puede deshacer.')) return
    await supabase.from('ordenes_compra_items').delete().eq('orden_id', id)
    await supabase.from('ordenes_compra').delete().eq('id', id)
    setDetalle(null)
    mostrarMsg('Orden eliminada.')
    recargar()
  }

  const ordenesFilt = useMemo(() => {
    if (!busq.trim()) return ordenes
    const q = busq.toLowerCase()
    return ordenes.filter(o =>
      (o.nombre_lote || '').toLowerCase().includes(q)
    )
  }, [ordenes, busq])

  if (detalle) {
    const itsOrden = items.filter(it => it.orden_id === detalle.id)
    const nPend = itsOrden.filter(it => it.estado_item === 'pendiente' || it.estado_item === 'parcial').length
    return (
      <div>
        <div style={{ display:'flex', gap:8, marginBottom:16, alignItems:'center' }}>
        <button style={S.btnSm()} onClick={() => setDetalle(null)}>← Volver al historial</button>
        <button
          style={{ ...S.btn(), fontSize:'0.82em', padding:'7px 16px', background:'#225F74' }}
          onClick={() => descargarOC(detalle, itsOrden)}
        >⬇️ Descargar OC Excel (NEO)</button>
      </div>
        {msg && (
          <div style={{ background: msg.tipo === 'ok' ? '#68d39122' : '#fc818122', border: `1px solid ${msg.tipo === 'ok' ? '#68d391' : '#fc8181'}55`, borderRadius: 8, padding: '9px 14px', marginBottom: 12, color: msg.tipo === 'ok' ? '#68d391' : '#fc8181', fontSize: '0.84em' }}>
            {msg.tipo === 'ok' ? '✅' : '❌'} {msg.t}
          </div>
        )}
        <div style={S.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
            <div>
              <div style={{ fontWeight: 700, color: '#fff', fontSize: '1.05em' }}>{detalle.nombre_lote || 'Sin nombre de lote'}</div>
              <div style={{ fontSize: '0.82em', color: MUTED, marginTop: 3 }}>
                Fecha: {detalle.fecha_orden?.substring(0, 10) || '—'} · {detalle.total_productos || itsOrden.length} producto(s)
                {detalle.dias_tribucion ? ` · ${detalle.dias_tribucion} días cobertura` : ''}
              </div>
            </div>
            <span style={S.badge(nPend > 0 ? '#f6ad55' : '#68d391')}>{nPend > 0 ? `${nPend} pendientes` : '✅ Completa'}</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83em' }}>
              <thead><tr>
                {['Estado', 'Código', 'Nombre', 'Proveedor', 'Cant. ordenada', 'Cant. recibida', 'Pendiente', 'Costo unitario', 'Descuento', 'Fecha recepción'].map(h => <th key={h} style={S.th}>{h}</th>)}
              </tr></thead>
              <tbody>
                {itsOrden.map(it => {
                  const pend = Math.max(0, (parseFloat(it.cantidad_ordenada) || 0) - (parseFloat(it.cantidad_recibida) || 0))
                  const esCompleto = it.estado_item === 'completo'
                  return (
                    <tr key={it.id}>
                      <td style={S.td}>
                        <span style={S.badge(esCompleto ? '#68d391' : it.estado_item === 'parcial' ? '#f6ad55' : '#fc8181')}>
                          {esCompleto ? '✅ Completo' : it.estado_item === 'parcial' ? '🟡 Parcial' : '🔴 Pendiente'}
                        </span>
                      </td>
                      <td style={{ ...S.td, fontFamily: 'monospace', fontSize: '0.77em', color: MUTED }}>{it.codigo || '—'}</td>
                      <td style={{ ...S.td, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.nombre || '—'}</td>
                      <td style={S.td}>{it.proveedor || '—'}</td>
                      <td style={{ ...S.td, textAlign: 'right' }}>{it.cantidad_ordenada || 0}</td>
                      <td style={{ ...S.td, textAlign: 'right', color: '#68d391' }}>{it.cantidad_recibida || 0}</td>
                      <td style={{ ...S.td, textAlign: 'right', fontWeight: 700, color: pend > 0 ? '#f6ad55' : '#68d391' }}>{pend}</td>
                      <td style={{ ...S.td, textAlign: 'right' }}>{it.costo_unitario != null ? `₡${parseFloat(it.costo_unitario).toLocaleString('es-CR')}` : '—'}</td>
                      <td style={{ ...S.td, textAlign: 'right' }}>{it.descuento != null ? `${it.descuento}%` : '—'}</td>
                      <td style={S.td}>{it.fecha_recepcion ? String(it.fecha_recepcion).substring(0, 10) : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <hr style={{ border: 'none', borderTop: `1px solid ${BORDER}`, margin: '18px 0' }} />
          <div style={{ background: '#1a0a0a', border: '1px solid #fc818133', borderRadius: 8, padding: '12px 16px' }}>
            <div style={{ color: '#fc8181', fontWeight: 600, fontSize: '0.82em', marginBottom: 8 }}>⚠️ Zona de peligro</div>
            <p style={{ fontSize: '0.8em', color: MUTED, marginBottom: 10 }}>Eliminar esta orden borrará permanentemente todos sus ítems de Supabase. Esta acción no se puede deshacer.</p>
            <button style={S.btn('#7d1515')} onClick={() => eliminarOrden(detalle.id)}>🗑️ Eliminar esta orden definitivamente</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      {modalWA && <ModalEnviarWhatsApp proveedor={modalWA.proveedor} items={modalWA.items} onClose={() => setModalWA(null)} onEnviado={() => setModalWA(null)} />}
      <p style={{ fontSize: '0.84em', color: MUTED, marginBottom: 14 }}>
        Todas las órdenes generadas en Saturno. Hacé click en una fila para ver el detalle de sus productos.
      </p>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.84em', color: MUTED }}>{ordenes.length} órdenes registradas</span>
        <input style={{ ...S.input, flex: '1 1 220px' }} placeholder="🔍 Buscar por lote..." value={busq} onChange={e => setBusq(e.target.value)} />
      </div>
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: MUTED }}>Cargando...</div>
      ) : ordenesFilt.length === 0 ? (
        <div style={{ ...S.card, textAlign: 'center', color: MUTED, padding: 40 }}>Sin órdenes registradas. Generá órdenes desde Saturno.</div>
      ) : (
        <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 480, border: '1px solid var(--border-soft)', borderRadius: 10 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83em' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}><tr>
              {['Fecha', 'Lote / Nombre', 'Productos', 'Días cobertura', 'Estado', 'Acción'].map(h => <th key={h} style={S.th}>{h}</th>)}
            </tr></thead>
            <tbody>
              {ordenesFilt.map(o => {
                const its = items.filter(it => it.orden_id === o.id)
                const nPend = its.filter(it => it.estado_item === 'pendiente' || it.estado_item === 'parcial').length
                return (
                  <tr key={o.id} style={{ cursor: 'pointer' }} onClick={() => setDetalle(o)}>
                    <td style={S.td}>{o.fecha_orden?.substring(0, 10) || '—'}</td>
                    <td style={{ ...S.td, fontFamily: 'monospace', fontSize: '0.8em', color: GOLD }}>{o.nombre_lote || o.id?.substring(0, 14) || '—'}</td>
                    <td style={{ ...S.td, textAlign: 'right' }}>{o.total_productos || its.length}</td>
                    <td style={{ ...S.td, textAlign: 'right' }}>{o.dias_tribucion || '—'}</td>
                    <td style={S.td}><span style={S.badge(nPend > 0 ? '#f6ad55' : '#68d391')}>{nPend > 0 ? `${nPend} pend.` : '✅ Completa'}</span></td>
                    <td style={S.td}>
                      <div style={{display:'flex',gap:6}}>
                        <button style={S.btnSm()} onClick={e => { e.stopPropagation(); setDetalle(o) }}>🔍 Ver detalle</button>
                        {o.pdf_url && <a href={o.pdf_url} target="_blank" rel="noreferrer" style={{...S.btnSm(), background:'#225F74', color:'#fff', textDecoration:'none', padding:'5px 10px', borderRadius:6, fontSize:'0.78rem'}}>📄 PDF</a>}
                        <button style={{...S.btnSm(), background:'#25D366', color:'#fff', border:'none'}} onClick={async e => {
                          e.stopPropagation()
                          const { data: itsWA } = await supabase.from('ordenes_compra_items').select('*').eq('orden_id', o.id)
                          const its2 = itsWA || []
                          const provNombre = its2[0]?.proveedor || o.nombre_lote?.replace(/^OC /,'').replace(/ \d{4}-\d{2}-\d{2}$/,'') || ''
                          setModalWA({proveedor: provNombre, soloReenvio: true, items: its2.map(it=>({codigo:it.codigo, nombre:it.nombre||it.codigo, cantidad:Number(it.cantidad_ordenada)||1, costo:Number(it.costo_unitario)||0}))})
                        }}>📱</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── TAB 3: PROCESAR COMPRAS RECIBIDAS ───────────────────────────────────────
function TabProcesar({ ordenes, items, loading, recargar }) {
  const [estado, setEstado] = useState('idle')
  const [resumen, setResumen] = useState(null)
  const [fechaCarga, setFechaCarga] = useState(null)
  const [fechaLegible, setFechaLegible] = useState(null)
  const [fechaProcesada, setFechaProcesada] = useState(null)
  const [infoMsg, setInfoMsg] = useState(null)

  const ejecutarMatchRef = useRef(null)

  useEffect(() => {
    async function obtenerFecha() {
      try {
        const { data } = await supabase
          .from('neo_items_comprados')
          .select('fecha_carga')
          .order('fecha_carga', { ascending: false })
          .limit(1)
        if (data && data.length > 0) {
          const fc = data[0].fecha_carga
          setFechaCarga(fc)
          try {
            setFechaLegible(new Date(fc).toLocaleString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Costa_Rica' }))
          } catch { setFechaLegible(fc?.substring(0, 16) || fc) }
          // Auto-ejecutar match al detectar fecha nueva
          ejecutarMatchRef.current = fc
        }
      } catch { /* sin tabla */ }
    }
    obtenerFecha()
  }, [])

  // Auto-procesar cuando llega una nueva fecha_carga
  useEffect(() => {
    if (fechaCarga && ejecutarMatchRef.current === fechaCarga && estado === 'idle') {
      ejecutarMatch()
    }
  }, [fechaCarga])

  async function ejecutarMatch() {
    if (!fechaCarga) return
    setEstado('procesando')
    setInfoMsg(null)

    try {
      const resp = await fetch('/api/procesar-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fecha_carga: fechaCarga }),
      })
      const data = await resp.json()

      if (!resp.ok || data.error) {
        setEstado('error')
        setInfoMsg(`Error: ${data.error || resp.statusText}`)
        return
      }

      if (data.revertidos > 0) {
        setInfoMsg(`↩️ ${data.revertidos} ítem(s) revertidos a pendiente por ser anteriores a la orden.`)
      }

      setResumen({
        completados:        data.completados        ?? 0,
        parciales:          data.parciales          ?? 0,
        sin_match:          data.sin_match          ?? 0,
        ignorados_por_fecha: data.ignorados_por_fecha ?? 0,
      })
      setFechaProcesada(fechaCarga)
      setEstado('done')
      recargar()
    } catch (e) {
      setEstado('error')
      setInfoMsg(`Error: ${e.message}`)
    }
  }

  const yaFueProcesado = fechaProcesada === fechaCarga && fechaCarga !== null
  const ordenesActivas = ordenes.filter(o => items.filter(it => it.orden_id === o.id && (it.estado_item === 'pendiente' || it.estado_item === 'parcial')).length > 0).length
  const nPendientes    = items.filter(it => it.estado_item === 'pendiente' || it.estado_item === 'parcial').length
  const nRecibidos     = items.filter(it => it.estado_item === 'completo').length

  return (
    <div>
      {infoMsg && (
        <div style={{ background: '#63b3ed22', border: '1px solid #63b3ed55', borderRadius: 8, padding: '9px 14px', marginBottom: 12, color: '#63b3ed', fontSize: '0.84em' }}>
          {infoMsg}
        </div>
      )}

      <div style={{ ...S.card, marginBottom: 16 }}>
        <div style={{ fontWeight: 600, color: '#fff', marginBottom: 8 }}>📥 Estado del ciclo de trazabilidad</div>
        <div style={{ fontSize: '0.84em', color: MUTED, marginBottom: 16 }}>
          SOL cruza automáticamente el reporte de compras (subido en <strong style={{ color: TEXT }}>Reportes NEO</strong>) con las órdenes pendientes.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
          {[
            ['📋 Órdenes activas',   ordenesActivas, '#63b3ed'],
            ['📦 Ítems pendientes',  nPendientes,    '#f6ad55'],
            ['✅ Ítems completados', nRecibidos,     '#68d391'],
          ].map(([l, v, c]) => (
            <div key={l} style={{ background: BG, border: `1px solid ${c}33`, borderRadius: 8, padding: '12px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.7em', color: MUTED }}>{l}</div>
              <div style={{ fontSize: '1.5em', fontWeight: 700, color: c }}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={S.card}>
        <div style={{ fontWeight: 600, color: GOLD, fontSize: '0.85em', marginBottom: 12 }}>🔄 Match automático con reporte NEO</div>

        {!fechaCarga ? (
          <div style={{ background: '#1a2535', border: '1px solid #2a3a55', borderRadius: 8, padding: '14px 16px', color: '#7ec8e3', fontSize: '0.88em' }}>
            📭 No hay datos de compras en la nube todavía. Subí el reporte <strong>Lista de ítems comprados</strong> en <strong>Reportes NEO</strong> y volvé acá.
          </div>
        ) : (
          <>
            <p style={{ fontSize: '0.84em', color: MUTED, marginBottom: 14 }}>
              Última carga disponible: <strong style={{ color: TEXT }}>{fechaLegible}</strong>
            </p>

            {!yaFueProcesado ? (
              <button
                style={{ ...S.btn(), opacity: estado === 'procesando' ? 0.6 : 1 }}
                onClick={ejecutarMatch}
                disabled={estado === 'procesando'}
              >
                {estado === 'procesando' ? '⏳ Procesando...' : '🔄 Procesar compras recibidas'}
              </button>
            ) : (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.84em', color: '#68d391' }}>✅ Match completado para esta carga.</span>
                <button style={S.btnSm()} onClick={() => { setFechaProcesada(null); setResumen(null); setInfoMsg(null) }}>🔄 Volver a procesar</button>
              </div>
            )}

            {estado === 'procesando' && (
              <div style={{ fontSize: '0.82em', color: MUTED, marginTop: 10 }}>Cruzando compras con órdenes pendientes...</div>
            )}

            {resumen && (
              <div style={{ marginTop: 16 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
                  {[
                    ['🟢 Completados',        resumen.completados,        '#68d391'],
                    ['🟡 Parciales',           resumen.parciales,          '#f6ad55'],
                    ['⚪ Sin match',           resumen.sin_match,          MUTED],
                    ['📅 Ignorados por fecha', resumen.ignorados_por_fecha,'#63b3ed'],
                  ].map(([l, v, c]) => (
                    <div key={l} style={{ background: BG, border: `1px solid ${c}33`, borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.7em', color: MUTED }}>{l}</div>
                      <div style={{ fontSize: '1.4em', fontWeight: 700, color: c }}>{v}</div>
                    </div>
                  ))}
                </div>
                <p style={{ fontSize: '0.78em', color: MUTED, marginTop: 10 }}>
                  👈 Revisá la pestaña <strong style={{ color: TEXT }}>Alertas de Pendientes</strong> para ver el estado actualizado.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ─── PÁGINA PRINCIPAL ─────────────────────────────────────────────────────────
export default function TrazabilidadPage() {
  const [tab, setTab]         = useState(0)
  const [ordenes, setOrdenes] = useState([])
  const [items, setItems]     = useState([])
  const [loading, setLoading] = useState(true)

  async function cargar() {
    setLoading(true)
    // Cargar pendientes/parciales y completos por separado para superar el límite de 1000 rows
    const [{ data: ords }, { data: itsPend }, { data: itsComp }, { data: cola }] = await Promise.all([
      supabase.from('ordenes_compra').select('*').order('fecha_orden', { ascending: false }),
      supabase.from('ordenes_compra_items').select('*').in('estado_item', ['pendiente', 'parcial']),
      supabase.from('ordenes_compra_items').select('*').eq('estado_item', 'completo').order('fecha_recepcion', { ascending: false }).limit(500),
      supabase.from('cola_neo_uploads').select('proveedor_nombre,pdf_url,numero_sol').not('pdf_url','is',null),
    ])
    // Auto-cancelar ítems pendientes con más de 18 días
    const DIAS_LIMITE = 18
    const ahora = new Date()
    const vencidos = (itsPend||[]).filter(it => {
      const orden = (ords||[]).find(o => o.id === it.orden_id)
      if (!orden?.fecha_orden) return false
      const dias = Math.floor((ahora - new Date(orden.fecha_orden)) / 86400000)
      return dias > DIAS_LIMITE
    })
    if (vencidos.length > 0) {
      const ids = vencidos.map(v => v.id)
      await supabase.from('ordenes_compra_items').update({ estado_item: 'cancelado' }).in('id', ids)
    }
    const itsPendFiltrados = (itsPend||[]).filter(it => !vencidos.some(v => v.id === it.id))
    const its = [...itsPendFiltrados, ...(itsComp||[])]
    // Enriquecer ordenes con pdf_url de cola
    const colaMap = {}
    ;(cola||[]).forEach(r=>{ if(r.pdf_url) colaMap[r.proveedor_nombre] = r.pdf_url })
    const ordsEnriquecidas = (ords||[]).map(o=>({ ...o, pdf_url: colaMap[o.nombre_lote?.replace(/^OC /,'').replace(/ \d{4}-\d{2}-\d{2}$/,'')] || null }))
    setOrdenes(ordsEnriquecidas)
    setItems(its || [])
    setLoading(false)
  }

  useEffect(() => { cargar() }, [])

  const tabs = [
    ['🚨 Alertas de Pendientes',      0],
    ['📋 Historial de Órdenes',       1],
    ['🔄 Procesar Compras Recibidas', 2],
  ]

  return (
    <div style={{ fontFamily: 'DM Sans,sans-serif', color: TEXT }}>
      <div style={{ marginBottom: 6 }}>
        <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: GOLD, display: 'block', marginBottom: 4 }}>
          Trazabilidad · Órdenes
        </span>
        <h1 style={{ fontSize: '1.7rem', fontWeight: 700, color: '#fff', letterSpacing: '-0.03em', lineHeight: 1.2, marginBottom: 4 }}>
          🔴 Nehemías – Trazabilidad
        </h1>
        <p style={{ fontSize: '0.875rem', color: MUTED }}>Los muros reconstruidos · Registro permanente de lo que se ordenó y lo que llegó</p>
      </div>
      <div style={{ fontSize: '0.78em', color: MUTED, marginBottom: 20 }}>
        ⬤ Sesión activa · {new Date().toLocaleDateString('es-CR')} · Los datos se actualizan al generar nuevas órdenes desde Saturno
      </div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: `1px solid ${BORDER}`, overflowX: 'auto' }}>
        {tabs.map(([label, idx]) => (
          <button key={idx} onClick={() => setTab(idx)} style={{
            padding: '10px 18px', border: 'none', background: 'none', cursor: 'pointer',
            fontSize: '0.87em', fontWeight: tab === idx ? 700 : 400,
            color: tab === idx ? GOLD : MUTED,
            borderBottom: tab === idx ? `2px solid ${GOLD}` : '2px solid transparent',
            marginBottom: -1, whiteSpace: 'nowrap', fontFamily: 'DM Sans,sans-serif',
          }}>
            {label}
          </button>
        ))}
      </div>
      {tab === 0 && <TabAlertas   ordenes={ordenes} items={items} setItems={setItems} loading={loading} />}
      {tab === 1 && <TabHistorial ordenes={ordenes} items={items} loading={loading} recargar={cargar} />}
      {tab === 2 && <TabProcesar  ordenes={ordenes} items={items} loading={loading} recargar={cargar} />}
      <div style={{ marginTop: 24, fontSize: '0.7rem', color: '#3a4150', textAlign: 'right' }}>
        Actualizado: {new Date().toLocaleString('es-CR')}
      </div>
    </div>
  )
}
