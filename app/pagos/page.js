'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'

const CRC = (n) => '₡' + Math.round(parseFloat(n) || 0).toLocaleString('es-CR')
const N = (v) => parseFloat(v) || 0

const TIPO_CONFIG = {
  transferencia: { label: 'Transferencia', color: '#0C447C', bg: '#E6F1FB', border: '#B5D4F4' },
  efectivo:      { label: 'Efectivo',       color: '#276749', bg: '#EAF3DE', border: '#C0DD97' },
  conjunto:      { label: 'Conjunto',       color: '#554200', bg: '#FAEEDA', border: '#FAC775' },
  no_pagar:      { label: 'No pagar',       color: '#4B1528', bg: '#FBEAF0', border: '#F4C0D1' },
}

const S = {
  page:    { background: 'var(--cream)', minHeight: '100vh', fontFamily: 'DM Sans, sans-serif', color: 'var(--text-primary)' },
  topbar:  { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 28px', background: '#fff', borderBottom: '1px solid var(--border-soft)', gap: 12, flexWrap: 'wrap' },
  tabs:    { display: 'flex', gap: 0, borderBottom: '1px solid var(--border-soft)', background: '#fff', padding: '0 28px' },
  tab:     (a) => ({ padding: '10px 18px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '0.88rem', fontWeight: a ? 600 : 400, color: a ? 'var(--orange)' : 'var(--text-muted)', borderBottom: a ? '2px solid var(--orange)' : '2px solid transparent', marginBottom: -1, fontFamily: 'DM Sans, sans-serif', whiteSpace: 'nowrap' }),
  content: { padding: '24px 28px' },
  card:    { background: '#fff', border: '1px solid var(--border-soft)', borderRadius: 12, marginBottom: 10, overflow: 'hidden' },
  btn:     (c = 'var(--orange)') => ({ background: c, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, fontFamily: 'DM Sans, sans-serif' }),
  btnGhost:{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontSize: '0.85rem', fontFamily: 'DM Sans, sans-serif', color: 'var(--text-primary)' },
  input:   { background: 'var(--cream)', border: '1px solid var(--border)', borderRadius: 7, padding: '6px 10px', fontSize: '0.83rem', fontFamily: 'DM Sans, sans-serif', color: 'var(--text-primary)', outline: 'none', width: '100%', boxSizing: 'border-box' },
  kpi:     { background: 'var(--cream)', borderRadius: 10, padding: '12px 16px' },
  th:      { padding: '8px 14px', fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', background: 'var(--cream)', borderBottom: '1px solid var(--border-soft)', textAlign: 'left', whiteSpace: 'nowrap' },
  td:      { padding: '10px 14px', borderBottom: '1px solid var(--border-soft)', fontSize: '0.85rem', verticalAlign: 'middle' },
}

function Pill({ tipo }) {
  const c = TIPO_CONFIG[tipo] || TIPO_CONFIG.transferencia
  return (
    <span style={{ background: c.bg, color: c.color, border: `1px solid ${c.border}`, borderRadius: 20, padding: '3px 10px', fontSize: '0.72rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
      {c.label}
    </span>
  )
}

// ── Modal nueva sesión ────────────────────────────────────────────────────────
function ModalNuevaSesion({ onClose, onCreated }) {
  const [nombre, setNombre] = useState('')
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10))
  const [responsable, setResponsable] = useState('')
  const [saving, setSaving] = useState(false)

  async function crear() {
    if (!nombre.trim()) return
    setSaving(true)
    const { data, error } = await supabase.from('pagos_sesion').insert({
      nombre: nombre.trim(),
      fecha,
      responsable: responsable.trim() || null,
      estado: 'borrador',
    }).select().single()
    setSaving(false)
    if (!error) onCreated(data)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: '#fff', borderRadius: 14, padding: '28px 32px', width: 400, maxWidth: '95vw', border: '1px solid var(--border-soft)' }}>
        <div style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: 20 }}>Nueva sesión de pagos</div>
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>NOMBRE DE LA SESIÓN *</label>
          <input style={S.input} placeholder="Ej: Semana 17 marzo 2026" value={nombre} onChange={e => setNombre(e.target.value)} autoFocus />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>FECHA</label>
          <input style={S.input} type="date" value={fecha} onChange={e => setFecha(e.target.value)} />
        </div>
        <div style={{ marginBottom: 24 }}>
          <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>RESPONSABLE</label>
          <input style={S.input} placeholder="Ej: Andrea" value={responsable} onChange={e => setResponsable(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button style={S.btnGhost} onClick={onClose}>Cancelar</button>
          <button style={S.btn()} onClick={crear} disabled={saving || !nombre.trim()}>{saving ? 'Creando...' : 'Crear sesión'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Tab Detalle por proveedor ─────────────────────────────────────────────────
function TabDetalle({ sesion, items, onRefresh }) {
  const [expandidos, setExpandidos] = useState({})
  const [saving, setSaving] = useState(false)
  const [nuevoProveedor, setNuevoProveedor] = useState('')
  const [agregandoProv, setAgregandoProv] = useState(false)

  const bloqueado = sesion?.estado === 'pagado'

  const porProveedor = {}
  for (const it of items) {
    if (!porProveedor[it.proveedor]) porProveedor[it.proveedor] = []
    porProveedor[it.proveedor].push(it)
  }

  const toggleExpand = (prov) => setExpandidos(p => ({ ...p, [prov]: !p[prov] }))

  async function agregarFila(proveedor) {
    setSaving(true)
    await supabase.from('pagos_items').insert({
      sesion_id: sesion.id,
      proveedor,
      monto: 0,
      orden: (porProveedor[proveedor]?.length || 0),
    })
    setSaving(false)
    onRefresh()
  }

  async function actualizarItem(id, campo, valor) {
    await supabase.from('pagos_items').update({ [campo]: valor }).eq('id', id)
    onRefresh()
  }

  async function eliminarItem(id) {
    await supabase.from('pagos_items').delete().eq('id', id)
    onRefresh()
  }

  async function eliminarProveedor(prov) {
    if (!confirm(`¿Eliminar "${prov}" y todas sus facturas de esta sesión?`)) return
    const ids = porProveedor[prov].map(it => it.id)
    for (const id of ids) {
      await supabase.from('pagos_items').delete().eq('id', id)
    }
    onRefresh()
  }

  async function agregarProveedor() {
    if (!nuevoProveedor.trim()) return
    setSaving(true)
    await supabase.from('pagos_items').insert({
      sesion_id: sesion.id,
      proveedor: nuevoProveedor.trim().toUpperCase(),
      monto: 0,
      orden: 0,
    })
    setNuevoProveedor('')
    setAgregandoProv(false)
    setSaving(false)
    onRefresh()
  }

  const proveedores = Object.keys(porProveedor).sort()
  const totalSesion = items.reduce((s, it) => s + N(it.monto), 0)

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 20 }}>
        {[
          ['Proveedores', proveedores.length, 'var(--orange)'],
          ['Total sesión', CRC(totalSesion), 'var(--text-primary)'],
          ['Facturas', items.length, '#225F74'],
          ['Estado', sesion?.estado === 'pagado' ? '✅ Pagado' : '🔄 Borrador', sesion?.estado === 'pagado' ? '#276749' : '#854F0B'],
        ].map(([l, v, c]) => (
          <div key={l} style={S.kpi}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 4 }}>{l}</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 700, color: c }}>{v}</div>
          </div>
        ))}
      </div>

      {proveedores.map(prov => {
        const its = porProveedor[prov]
        const total = its.reduce((s, it) => s + N(it.monto), 0)
        const isOpen = expandidos[prov] !== false
        return (
          <div key={prov} style={S.card}>
            <div onClick={() => toggleExpand(prov)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', cursor: 'pointer', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{isOpen ? '▼' : '▶'}</span>
                <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>{prov}</span>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{its.length} factura{its.length !== 1 ? 's' : ''}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{CRC(total)}</span>
                {!bloqueado && <button onClick={e => { e.stopPropagation(); eliminarProveedor(prov) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e74c3c', fontSize: '0.75rem', padding: '2px 6px', borderRadius: 6, fontWeight: 600 }} title="Eliminar proveedor">🗑</button>}
              </div>
            </div>

            {isOpen && (
              <div style={{ borderTop: '1px solid var(--border-soft)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 130px 1fr 32px', gap: 8, padding: '6px 16px', background: 'var(--cream)', fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  <span>N° Factura</span><span style={{ textAlign: 'right' }}>Monto (₡)</span><span>Nota / observación</span><span></span>
                </div>
                {its.map(it => (
                  <div key={it.id} style={{ display: 'grid', gridTemplateColumns: '1fr 130px 1fr 32px', gap: 8, padding: '8px 16px', borderTop: '1px solid var(--border-soft)', alignItems: 'center' }}>
                    <input
                      style={S.input}
                      placeholder="F-00000"
                      defaultValue={it.numero_factura || ''}
                      disabled={bloqueado}
                      onBlur={e => e.target.value !== (it.numero_factura || '') && actualizarItem(it.id, 'numero_factura', e.target.value)}
                    />
                    <input
                      style={{ ...S.input, textAlign: 'right' }}
                      type="number"
                      placeholder="0"
                      defaultValue={it.monto || ''}
                      disabled={bloqueado}
                      onBlur={e => N(e.target.value) !== N(it.monto) && actualizarItem(it.id, 'monto', N(e.target.value))}
                    />
                    <input
                      style={S.input}
                      placeholder="pronto pago, NC, mercadería…"
                      defaultValue={it.nota || ''}
                      disabled={bloqueado}
                      onBlur={e => e.target.value !== (it.nota || '') && actualizarItem(it.id, 'nota', e.target.value)}
                    />
                    {!bloqueado && (
                      <button onClick={() => eliminarItem(it.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1rem', padding: 0 }}>×</button>
                    )}
                  </div>
                ))}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', background: 'var(--cream)', borderTop: '1px solid var(--border-soft)' }}>
                  {!bloqueado ? (
                    <button onClick={() => agregarFila(prov)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.82rem', color: 'var(--orange)', fontFamily: 'DM Sans, sans-serif', padding: 0 }}>+ agregar factura</button>
                  ) : <span />}
                  <span style={{ fontSize: '0.85rem' }}>Subtotal: <strong>{CRC(total)}</strong></span>
                </div>
              </div>
            )}
          </div>
        )
      })}

      {!bloqueado && (
        <div style={{ marginTop: 12 }}>
          {agregandoProv ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input style={{ ...S.input, maxWidth: 280 }} placeholder="Nombre del proveedor" value={nuevoProveedor} onChange={e => setNuevoProveedor(e.target.value)} onKeyDown={e => e.key === 'Enter' && agregarProveedor()} autoFocus />
              <button style={S.btn()} onClick={agregarProveedor} disabled={saving}>Agregar</button>
              <button style={S.btnGhost} onClick={() => { setAgregandoProv(false); setNuevoProveedor('') }}>Cancelar</button>
            </div>
          ) : (
            <button style={S.btn('#225F74')} onClick={() => setAgregandoProv(true)}>+ Agregar proveedor</button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Tab Resumen ejecutivo ─────────────────────────────────────────────────────
function TabResumen({ sesion, items, onRefresh, onCerrar }) {
  const bloqueado = sesion?.estado === 'pagado'
  const [cerrando, setCerrando] = useState(false)
  const [confirmCerrar, setConfirmCerrar] = useState(false)
  const [filtroTipo, setFiltroTipo] = useState('todos')

  const porProveedor = {}
  for (const it of items) {
    if (!porProveedor[it.proveedor]) {
      porProveedor[it.proveedor] = { monto: 0, tipo_pago: it.tipo_pago || 'transferencia', estado_pago: it.estado_pago || 'pendiente', notas: [], ids: [] }
    }
    porProveedor[it.proveedor].monto += N(it.monto)
    porProveedor[it.proveedor].ids.push(it.id)
    if (it.nota) porProveedor[it.proveedor].notas.push(it.nota)
  }
  const proveedores = Object.keys(porProveedor).sort()
  const total = Object.values(porProveedor).reduce((s, p) => s + p.monto, 0)
  const totalTransf = Object.values(porProveedor).filter(p => p.tipo_pago === 'transferencia').reduce((s, p) => s + p.monto, 0)
  const totalEfect = Object.values(porProveedor).filter(p => p.tipo_pago === 'efectivo').reduce((s, p) => s + p.monto, 0)
  const totalConjunto = Object.values(porProveedor).filter(p => p.tipo_pago === 'conjunto').reduce((s, p) => s + p.monto, 0)

  async function actualizarTipoPago(prov, tipo_pago) {
    const ids = porProveedor[prov].ids
    for (const id of ids) {
      await supabase.from('pagos_items').update({ tipo_pago }).eq('id', id)
    }
    onRefresh()
  }

  async function actualizarEstado(prov, estado_pago) {
    const ids = porProveedor[prov].ids
    for (const id of ids) {
      await supabase.from('pagos_items').update({ estado_pago }).eq('id', id)
    }
    onRefresh()
  }

  async function cerrarSesion() {
    setCerrando(true)
    await supabase.from('pagos_sesion').update({
      estado: 'pagado',
      cerrado_en: new Date().toISOString(),
      total,
    }).eq('id', sesion.id)
    setCerrando(false)
    setConfirmCerrar(false)
    onCerrar()
                    }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 20 }}>
        {[
          ['Total sesión', CRC(total), 'var(--text-primary)'],
          ['Transferencias', CRC(totalTransf), '#0C447C'],
          ['Efectivo', CRC(totalEfect), '#276749'],
          ['Conjunto', CRC(totalConjunto), '#854F0B'],
        ].map(([l, v, c]) => (
          <div key={l} style={S.kpi}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 4 }}>{l}</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 700, color: c }}>{v}</div>
          </div>
        ))}
      </div>

      {/* Filtros de tipo de pago */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {[
          ['todos', 'Todos', 'var(--text-primary)', proveedores.length],
          ['efectivo', '💵 Efectivo', '#276749', proveedores.filter(p => porProveedor[p].tipo_pago === 'efectivo').length],
          ['transferencia', '🏦 Transferencia', '#0C447C', proveedores.filter(p => porProveedor[p].tipo_pago === 'transferencia').length],
          ['conjunto', '🤝 Conjunto', '#854F0B', proveedores.filter(p => porProveedor[p].tipo_pago === 'conjunto').length],
          ['no_pagar', '🚫 No pagar', '#999', proveedores.filter(p => porProveedor[p].tipo_pago === 'no_pagar').length],
        ].map(([key, label, color, count]) => (
          <button key={key} onClick={() => setFiltroTipo(key)} style={{
            padding: '6px 14px', borderRadius: 20, fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', border: 'none',
            background: filtroTipo === key ? color : 'var(--cream)',
            color: filtroTipo === key ? '#fff' : 'var(--text-muted)',
            transition: 'all 0.15s',
          }}>{label} ({count})</button>
        ))}
      </div>

      <div style={{ ...S.card, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr>
              <th style={S.th}>Proveedor</th>
              <th style={{ ...S.th, textAlign: 'right' }}>Total</th>
              <th style={S.th}>Tipo de pago</th>
              <th style={S.th}>Estado</th>
              <th style={S.th}>Notas facturas</th>
            </tr>
          </thead>
          <tbody>
            {proveedores
              .filter(prov => filtroTipo === 'todos' || porProveedor[prov].tipo_pago === filtroTipo)
              .sort((a, b) => {
                const orden = { efectivo: 0, conjunto: 1, transferencia: 2, no_pagar: 3 }
                const oa = orden[porProveedor[a].tipo_pago] ?? 9
                const ob = orden[porProveedor[b].tipo_pago] ?? 9
                return oa !== ob ? oa - ob : a.localeCompare(b)
              })
              .map((prov, i) => {
              const p = porProveedor[prov]
              const esEfectivo = p.tipo_pago === 'efectivo'
              const esNoPagar = p.tipo_pago === 'no_pagar'
              return (
                <tr key={prov} style={{
                  background: esEfectivo ? '#e6f9ed' : esNoPagar ? '#fde8e8' : i % 2 === 0 ? '#fff' : 'var(--cream)',
                  borderLeft: esEfectivo ? '4px solid #22c55e' : esNoPagar ? '4px solid #e74c3c' : '4px solid transparent',
                }}>
                  <td style={{ ...S.td, fontWeight: 600, color: esNoPagar ? '#e74c3c' : 'inherit', textDecoration: esNoPagar ? 'line-through' : 'none' }}>
                    {esEfectivo && <span style={{ marginRight: 6 }}>💵</span>}
                    {esNoPagar && <span style={{ marginRight: 6 }}>🚫</span>}
                    {prov}
                  </td>
                  <td style={{ ...S.td, textAlign: 'right', fontWeight: 700, color: esEfectivo ? '#276749' : esNoPagar ? '#e74c3c' : 'inherit' }}>{CRC(p.monto)}</td>
                  <td style={S.td}>
                    {bloqueado ? <Pill tipo={p.tipo_pago} /> : (
                      <select
                        value={p.tipo_pago}
                        onChange={e => actualizarTipoPago(prov, e.target.value)}
                        style={{ ...S.input, width: 'auto', cursor: 'pointer' }}
                      >
                        <option value="transferencia">Transferencia</option>
                        <option value="efectivo">Efectivo</option>
                        <option value="conjunto">Conjunto</option>
                        <option value="no_pagar">No pagar</option>
                      </select>
                    )}
                  </td>
                  <td style={S.td}>
                    {bloqueado ? <Pill tipo={p.estado_pago === 'confirmado' ? 'transferencia' : 'conjunto'} /> : (
                      <select
                        value={p.estado_pago}
                        onChange={e => actualizarEstado(prov, e.target.value)}
                        style={{ ...S.input, width: 'auto', cursor: 'pointer' }}
                      >
                        <option value="pendiente">Pendiente</option>
                        <option value="confirmado">Confirmado</option>
                      </select>
                    )}
                  </td>
                  <td style={{ ...S.td, fontSize: '0.78rem', color: 'var(--text-muted)', maxWidth: 200 }}>
                    {p.notas.join(' · ') || '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr style={{ background: '#FDF0F0' }}>
              <td style={{ ...S.td, fontWeight: 700 }}>TOTAL</td>
              <td style={{ ...S.td, textAlign: 'right', fontWeight: 700, fontSize: '1rem' }}>{CRC(total)}</td>
              <td style={S.td} colSpan={3}></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {!bloqueado && (
        <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
          <button style={S.btn('#276749')} onClick={() => setConfirmCerrar(true)}>✅ Marcar como pagado</button>
        </div>
      )}

      {bloqueado && (
        <div style={{ marginTop: 16, background: '#EAF3DE', border: '1px solid #C0DD97', borderRadius: 10, padding: '12px 18px', color: '#27500A', fontSize: '0.85rem' }}>
          ✅ Esta sesión fue cerrada el {sesion?.cerrado_en ? new Date(sesion.cerrado_en).toLocaleString('es-CR', { timeZone: 'America/Costa_Rica', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}. No se puede editar.
        </div>
      )}

      {confirmCerrar && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: '28px 32px', width: 380, maxWidth: '95vw', border: '1px solid var(--border-soft)' }}>
            <div style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: 10 }}>¿Marcar sesión como pagada?</div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 24 }}>
              La sesión <strong>"{sesion?.nombre}"</strong> se sellará con total {CRC(total)} y pasará al historial. No podrá editarse.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button style={S.btnGhost} onClick={() => setConfirmCerrar(false)}>Cancelar</button>
              <button style={S.btn('#276749')} onClick={cerrarSesion} disabled={cerrando}>{cerrando ? 'Cerrando...' : '✅ Sí, marcar pagado'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
                     }

// ── Tab Historial ─────────────────────────────────────────────────────────────
function TabHistorial({ sesionActivaId, onVerSesion }) {
  const [sesiones, setSesiones] = useState([])
  const [loading, setLoading] = useState(true)
  const [detalleId, setDetalleId] = useState(null)
  const [detalleItems, setDetalleItems] = useState([])

  useEffect(() => {
    supabase.from('pagos_sesion').select('*').eq('estado', 'pagado').order('cerrado_en', { ascending: false }).then(({ data }) => {
      setSesiones(data || [])
      setLoading(false)
    })
  }, [sesionActivaId])

  async function verDetalle(id) {
    if (detalleId === id) { setDetalleId(null); return }
    const { data } = await supabase.from('pagos_items').select('*').eq('sesion_id', id).order('proveedor')
    setDetalleItems(data || [])
    setDetalleId(id)
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Cargando...</div>
  if (!sesiones.length) return (
    <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
      <div style={{ fontSize: '2rem', marginBottom: 12 }}>📋</div>
      <div>Aún no hay sesiones cerradas. Cuando marcás una sesión como pagada aparece acá.</div>
    </div>
  )

  const porProveedor = (items) => {
    const map = {}
    for (const it of items) {
      if (!map[it.proveedor]) map[it.proveedor] = { monto: 0, tipo_pago: it.tipo_pago }
      map[it.proveedor].monto += N(it.monto)
    }
    return map
  }

  return (
    <div>
      <div style={{ ...S.card, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr>
              <th style={S.th}>Sesión</th>
              <th style={S.th}>Fecha</th>
              <th style={S.th}>Responsable</th>
              <th style={{ ...S.th, textAlign: 'right' }}>Total pagado</th>
              <th style={S.th}>Cerrada</th>
              <th style={S.th}></th>
            </tr>
          </thead>
          <tbody>
            {sesiones.map((s, i) => (
              <>
                <tr key={s.id} style={{ background: i % 2 === 0 ? '#fff' : 'var(--cream)' }}>
                  <td style={{ ...S.td, fontWeight: 600 }}>{s.nombre}</td>
                  <td style={S.td}>{s.fecha}</td>
                  <td style={{ ...S.td, color: 'var(--text-muted)' }}>{s.responsable || '—'}</td>
                  <td style={{ ...S.td, textAlign: 'right', fontWeight: 700, color: '#276749' }}>{CRC(s.total)}</td>
                  <td style={{ ...S.td, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    {s.cerrado_en ? new Date(s.cerrado_en).toLocaleDateString('es-CR', { timeZone: 'America/Costa_Rica', day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'}
                  </td>
                  <td style={S.td}>
                    <button style={S.btnGhost} onClick={() => verDetalle(s.id)}>{detalleId === s.id ? 'Cerrar' : 'Ver detalle'}</button>
                  </td>
                </tr>
                {detalleId === s.id && (
                  <tr key={s.id + '-det'}>
                    <td colSpan={6} style={{ padding: 0, background: 'var(--cream)' }}>
                      <div style={{ padding: '12px 20px' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                          <thead>
                            <tr>
                              <th style={{ ...S.th, fontSize: '0.65rem' }}>Proveedor</th>
                              <th style={{ ...S.th, textAlign: 'right', fontSize: '0.65rem' }}>Total</th>
                              <th style={{ ...S.th, fontSize: '0.65rem' }}>Tipo pago</th>
                              <th style={{ ...S.th, fontSize: '0.65rem' }}>Notas</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Object.entries(porProveedor(detalleItems)).sort(([a], [b]) => a.localeCompare(b)).map(([prov, data]) => (
                              <tr key={prov}>
                                <td style={{ ...S.td, fontWeight: 600, fontSize: '0.82rem' }}>{prov}</td>
                                <td style={{ ...S.td, textAlign: 'right', fontWeight: 600, fontSize: '0.82rem' }}>{CRC(data.monto)}</td>
                                <td style={S.td}><Pill tipo={data.tipo_pago} /></td>
                                <td style={{ ...S.td, fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                                  {detalleItems.filter(it => it.proveedor === prov && it.nota).map(it => it.nota).join(' · ') || '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Página principal ────────────────────────────────────────────────────────
export default function PagosPage() {
  const [tab, setTab] = useState('detalle')
  const [sesion, setSesion] = useState(null)
  const [sesiones, setSesiones] = useState([])
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)

  const cargarSesiones = useCallback(async () => {
    const { data } = await supabase.from('pagos_sesion').select('*').order('creado_en', { ascending: false }).limit(20)
    setSesiones(data || [])
    if (!sesion && data?.length) {
      const borrador = data.find(s => s.estado === 'borrador') || data[0]
      setSesion(borrador)
    }
    setLoading(false)
  }, [sesion])

  const cargarItems = useCallback(async () => {
    if (!sesion) return
    const { data } = await supabase.from('pagos_items').select('*').eq('sesion_id', sesion.id).order('proveedor').order('orden')
    setItems(data || [])
  }, [sesion])

  useEffect(() => { cargarSesiones() }, [])
  useEffect(() => { cargarItems() }, [sesion])

  function onCreated(nueva) {
    setSesion(nueva)
    setShowModal(false)
    cargarSesiones()
    setTab('detalle')
  }

  function onRefresh() { cargarItems(); cargarSesiones() }
  function onCerrar() { cargarSesiones(); cargarItems(); setTab('detalle') }

  const borradores = sesiones.filter(s => s.estado === 'borrador')

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Cargando...</div>

  return (
    <div style={S.page}>
      {showModal && <ModalNuevaSesion onClose={() => setShowModal(false)} onCreated={onCreated} />}

      <div style={S.topbar}>
        <div>
          <div style={{ fontSize: '0.68rem', color: 'var(--orange)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 2 }}>Finanzas · SOL</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>💸 Coordinación de pagos</div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {sesiones.length > 0 && (
            <select
              value={sesion?.id || ''}
              onChange={e => { const s = sesiones.find(x => x.id === e.target.value); setSesion(s) }}
              style={{ ...S.input, width: 'auto', cursor: 'pointer', maxWidth: 260 }}
            >
              {sesiones.map(s => (
                <option key={s.id} value={s.id}>{s.nombre} {s.estado === 'pagado' ? '✅' : '🔄'}</option>
              ))}
            </select>
          )}
          <button style={S.btn()} onClick={() => setShowModal(true)}>+ Nueva sesión</button>
        </div>
      </div>

      {sesion && (
        <div style={{ padding: '10px 28px', background: '#fff', borderBottom: '1px solid var(--border-soft)', display: 'flex', alignItems: 'center', gap: 16, fontSize: '0.83rem', flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--text-muted)' }}>Sesión activa:</span>
          <strong>{sesion.nombre}</strong>
          <span style={{ color: 'var(--text-muted)' }}>·</span>
          <span style={{ color: 'var(--text-muted)' }}>{sesion.fecha}</span>
          {sesion.responsable && <><span style={{ color: 'var(--text-muted)' }}>· Responsable:</span><span>{sesion.responsable}</span></>}
          <span style={{
            background: sesion.estado === 'pagado' ? '#EAF3DE' : '#FAEEDA',
            color: sesion.estado === 'pagado' ? '#27500A' : '#633806',
            border: `1px solid ${sesion.estado === 'pagado' ? '#C0DD97' : '#FAC775'}`,
            borderRadius: 20, padding: '2px 10px', fontSize: '0.72rem', fontWeight: 600
          }}>
            {sesion.estado === 'pagado' ? '✅ Pagado' : '🔄 Borrador'}
          </span>
        </div>
      )}

      <div style={S.tabs}>
        {[['detalle', 'Detalle por proveedor'], ['resumen', 'Resumen ejecutivo'], ['historial', 'Historial']].map(([k, l]) => (
          <button key={k} style={S.tab(tab === k)} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      <div style={S.content}>
        {!sesion ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '2rem', marginBottom: 12 }}>💸</div>
            <div style={{ marginBottom: 16 }}>No hay sesiones. Creá la primera para empezar.</div>
            <button style={S.btn()} onClick={() => setShowModal(true)}>+ Nueva sesión</button>
          </div>
        ) : tab === 'detalle' ? (
          <TabDetalle sesion={sesion} items={items} onRefresh={onRefresh} />
        ) : tab === 'resumen' ? (
          <TabResumen sesion={sesion} items={items} onRefresh={onRefresh} onCerrar={onCerrar} />
        ) : (
          <TabHistorial sesionActivaId={sesion?.id} onVerSesion={id => { const s = sesiones.find(x => x.id === id); if (s) { setSesion(s); setTab('detalle') } }} />
        )}
      </div>
    </div>
  )
}
