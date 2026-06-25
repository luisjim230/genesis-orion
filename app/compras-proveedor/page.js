'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../lib/useAuth'

// ── Design system (consistente con el resto de SOL) ─────────────────────────
const BG = '#0f1115', SURF = '#1c1f26', SURF2 = '#22262f', SURF3 = '#2a2f3a'
const BORDER = 'rgba(255,255,255,0.08)'
const TEXT = 'rgba(253,244,244,0.88)', MUTED = 'rgba(253,244,244,0.40)'
const GOLD = '#ED6E2E'
const GREEN = '#68d391', RED = '#fc8181', BLUE = '#63b3ed', AMBER = '#c8a84b', PURPLE = '#b794f4'

const ESTADO_COLOR = { ABIERTA: BLUE, PAGADA: AMBER, FACTURADA: GREEN, CERRADA: MUTED }
const SEV_COLOR = { ALTA: RED, MEDIA: GOLD, BAJA: AMBER }
const API = '/api/compras-proveedor'

const S = {
  input: { background: SURF2, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 12px', color: TEXT, fontSize: '0.85em', fontFamily: 'DM Sans,sans-serif', outline: 'none', width: '100%', boxSizing: 'border-box' },
  btn: (c = GOLD) => ({ background: c, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontSize: '0.82em', fontWeight: 600, fontFamily: 'DM Sans,sans-serif' }),
  btnSm: (c = SURF2, tc = TEXT, bc = BORDER) => ({ background: c, color: tc, border: `1px solid ${bc}`, borderRadius: 6, padding: '5px 11px', cursor: 'pointer', fontSize: '0.77em', fontFamily: 'DM Sans,sans-serif' }),
  th: { textAlign: 'left', padding: '9px 12px', background: SURF2, color: MUTED, fontSize: '0.68em', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: `1px solid ${BORDER}`, whiteSpace: 'nowrap' },
  td: { padding: '10px 12px', borderBottom: `1px solid ${BORDER}`, color: TEXT, fontSize: '0.84em', verticalAlign: 'middle' },
  label: { fontSize: '0.72em', color: MUTED, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' },
  card: { background: SURF, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '18px 20px' },
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function fmtCRC(n) { return '₡' + Math.round(Number(n) || 0).toLocaleString('es-CR') }
function fmtDate(d) { return d ? new Date(d + (String(d).length <= 10 ? 'T00:00:00' : '')).toLocaleDateString('es-CR') : '—' }
function fmtDateTime(d) { return d ? new Date(d).toLocaleString('es-CR', { dateStyle: 'short', timeStyle: 'short' }) : '—' }

async function api(path, opts = {}) {
  const res = await fetch(API + path, opts)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`)
  return data
}

function Badge({ color, children }) {
  return <span style={{ background: color + '22', color, border: `1px solid ${color}44`, borderRadius: 20, padding: '2px 9px', fontSize: '0.72em', fontWeight: 600, whiteSpace: 'nowrap' }}>{children}</span>
}
function Msg({ msg }) {
  if (!msg) return null
  return <div style={{ background: msg.ok ? GREEN + '22' : RED + '22', border: `1px solid ${(msg.ok ? GREEN : RED)}55`, borderRadius: 8, padding: '9px 14px', marginBottom: 14, color: msg.ok ? GREEN : RED, fontSize: '0.84em' }}>{msg.t}</div>
}
function Field({ label, children }) {
  return <div><label style={S.label}>{label}</label>{children}</div>
}
function Modal({ children, onClose, width = 720 }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1000, padding: '40px 16px', overflowY: 'auto' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: SURF, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '22px 24px', maxWidth: width, width: '100%' }}>{children}</div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
export default function ComprasProveedorPage() {
  const { perfil, loading, puedeVer } = useAuth()
  const [tab, setTab] = useState('dashboard')

  if (loading) return <div style={{ padding: 40, color: MUTED, fontFamily: 'DM Sans,sans-serif' }}>Cargando…</div>
  if (!puedeVer('compras-proveedor')) {
    return (
      <div style={{ padding: 40, fontFamily: 'DM Sans,sans-serif', color: TEXT }}>
        <h2>🔒 Sin acceso</h2>
        <p style={{ color: MUTED }}>No tenés permiso para ver Compras a Proveedor. Pedíselo a un admin.</p>
      </div>
    )
  }

  const TABS = [
    ['dashboard', '📊 Dashboard'], ['compras', '🧾 Compras'], ['proveedores', '🏭 Proveedores'],
    ['factura', '📥 Subir factura'], ['alertas', '🔔 Alertas'], ['reportes', '📈 Reportes'],
  ]

  return (
    <div style={{ fontFamily: 'DM Sans,sans-serif', color: TEXT, padding: '28px 32px', minHeight: '100vh', background: BG, margin: '-32px -36px', minWidth: 'calc(100% + 72px)' }}>
      <div style={{ marginBottom: 22 }}>
        <span style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: GOLD, display: 'block', marginBottom: 4 }}>Finanzas · SOL</span>
        <h1 style={{ fontSize: '1.7rem', fontWeight: 700, color: TEXT, letterSpacing: '-0.02em', margin: 0 }}>🧾 Control de Compras a Proveedor</h1>
        <p style={{ fontSize: '0.82rem', color: MUTED, marginTop: 4 }}>Pago → factura: controlá el limbo documental · Depósito Jiménez</p>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 22, flexWrap: 'wrap' }}>
        {TABS.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{ ...S.btnSm(tab === k ? GOLD : SURF2, tab === k ? '#fff' : MUTED, tab === k ? GOLD : BORDER), padding: '7px 14px', fontSize: '0.82em', fontWeight: 600 }}>{l}</button>
        ))}
      </div>

      {tab === 'dashboard' && <Dashboard go={setTab} />}
      {tab === 'compras' && <ComprasTab perfil={perfil} />}
      {tab === 'proveedores' && <ProveedoresTab />}
      {tab === 'factura' && <FacturaTab perfil={perfil} />}
      {tab === 'alertas' && <AlertasTab />}
      {tab === 'reportes' && <ReportesTab />}
    </div>
  )
}

// ── Dashboard ───────────────────────────────────────────────────────────────
function Dashboard({ go }) {
  const [rep, setRep] = useState(null)
  const [alertas, setAlertas] = useState([])
  const [compras, setCompras] = useState({ total: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      try {
        const [r, a, c] = await Promise.all([
          api('/reportes'),
          api('/alertas?resuelta=false'),
          api('/compras?estado=ABIERTA'),
        ])
        setRep(r); setAlertas(a); setCompras(c)
      } catch (e) { /* noop */ }
      setLoading(false)
    })()
  }, [])

  if (loading) return <div style={{ color: MUTED }}>Cargando…</div>
  const sev = { ALTA: 0, MEDIA: 0, BAJA: 0 }
  alertas.forEach(a => { sev[a.severidad] = (sev[a.severidad] || 0) + 1 })

  const cards = [
    ['Compras abiertas', compras.total || 0, BLUE],
    ['Saldo documental', fmtCRC(rep?.saldo_total || 0), GOLD],
    ['Alertas activas', alertas.length, alertas.length ? RED : GREEN],
    ['Pagos sin factura', rep?.pagos_sin_factura || 0, AMBER],
  ]

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 22 }}>
        {cards.map(([l, v, c]) => (
          <div key={l} style={{ background: SURF, border: `1px solid ${c}33`, borderTop: `3px solid ${c}`, borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ fontSize: '0.7em', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{l}</div>
            <div style={{ fontSize: '1.6em', fontWeight: 700, color: c, marginTop: 4 }}>{v}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
        {['ALTA', 'MEDIA', 'BAJA'].map(s => (
          <div key={s} style={{ ...S.card, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px' }}>
            <Badge color={SEV_COLOR[s]}>{s}</Badge>
            <span style={{ fontSize: '1.4em', fontWeight: 700, color: SEV_COLOR[s] }}>{sev[s] || 0}</span>
          </div>
        ))}
      </div>

      <div style={S.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: '0.95em' }}>🔔 Últimas alertas</h3>
          <button style={S.btnSm()} onClick={() => go('alertas')}>Ver todas →</button>
        </div>
        {alertas.length === 0 ? <p style={{ color: GREEN, fontSize: '0.85em' }}>✅ Todo en orden, sin alertas activas.</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {alertas.slice(0, 8).map(a => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: SURF2, borderRadius: 8, borderLeft: `3px solid ${SEV_COLOR[a.severidad]}` }}>
                <Badge color={SEV_COLOR[a.severidad]}>{a.severidad}</Badge>
                <span style={{ fontSize: '0.82em', flex: 1 }}>{a.mensaje}</span>
                <span style={{ fontSize: '0.72em', color: MUTED }}>{a.compra?.proveedor?.nombre || a.factura?.numero_factura || ''}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

// ── Proveedores ─────────────────────────────────────────────────────────────
function ProveedoresTab() {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState(null)
  const [form, setForm] = useState(blank())
  const [editId, setEditId] = useState(null)
  function blank() { return { nombre: '', cedula_juridica: '', contacto: '', email: '', telefono: '', dias_alerta_pago_sin_factura: 8, activo: true } }
  function show(t, ok = true) { setMsg({ t, ok }); setTimeout(() => setMsg(null), 3500) }

  const cargar = useCallback(async () => {
    setLoading(true)
    try { setList(await api('/proveedores')) } catch (e) { show(e.message, false) }
    setLoading(false)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  async function guardar() {
    if (!form.nombre.trim()) return show('El nombre es obligatorio.', false)
    try {
      if (editId) await api(`/proveedores/${editId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      else await api('/proveedores', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      show('✅ Proveedor guardado.'); setForm(blank()); setEditId(null); cargar()
    } catch (e) { show(e.message, false) }
  }

  return (
    <>
      <div style={{ ...S.card, marginBottom: 20 }}>
        <h3 style={{ marginTop: 0, fontSize: '0.95em' }}>{editId ? '✏️ Editar proveedor' : '➕ Nuevo proveedor'}</h3>
        <Msg msg={msg} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 12 }}>
          <Field label="Nombre *"><input style={S.input} value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} placeholder="Proveedor de zinc S.A." /></Field>
          <Field label="Cédula jurídica"><input style={S.input} value={form.cedula_juridica || ''} onChange={e => setForm({ ...form, cedula_juridica: e.target.value })} /></Field>
          <Field label="Contacto"><input style={S.input} value={form.contacto || ''} onChange={e => setForm({ ...form, contacto: e.target.value })} /></Field>
          <Field label="Email"><input style={S.input} value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Teléfono"><input style={S.input} value={form.telefono || ''} onChange={e => setForm({ ...form, telefono: e.target.value })} /></Field>
          <Field label="Días para alertar pago sin factura"><input type="number" min={1} style={S.input} value={form.dias_alerta_pago_sin_factura} onChange={e => setForm({ ...form, dias_alerta_pago_sin_factura: e.target.value })} /></Field>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button style={S.btn()} onClick={guardar}>{editId ? '💾 Guardar cambios' : '💾 Crear proveedor'}</button>
          {editId && <button style={S.btnSm()} onClick={() => { setForm(blank()); setEditId(null) }}>Cancelar</button>}
        </div>
      </div>

      <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
        {loading ? <div style={{ padding: 30, color: MUTED }}>Cargando…</div> : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['Proveedor', 'Cédula', 'Contacto', 'Alerta (días)', 'Estado', ''].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
            <tbody>
              {list.map(p => (
                <tr key={p.id}>
                  <td style={{ ...S.td, fontWeight: 500 }}>{p.nombre}</td>
                  <td style={{ ...S.td, color: MUTED, fontFamily: 'monospace', fontSize: '0.8em' }}>{p.cedula_juridica || '—'}</td>
                  <td style={{ ...S.td, color: MUTED }}>{p.contacto || p.email || p.telefono || '—'}</td>
                  <td style={S.td}>{p.dias_alerta_pago_sin_factura}</td>
                  <td style={S.td}><Badge color={p.activo ? GREEN : MUTED}>{p.activo ? 'Activo' : 'Inactivo'}</Badge></td>
                  <td style={S.td}><button style={S.btnSm()} onClick={() => { setEditId(p.id); setForm({ ...p }) }}>✏️ Editar</button></td>
                </tr>
              ))}
              {list.length === 0 && <tr><td colSpan={6} style={{ ...S.td, textAlign: 'center', color: MUTED }}>Sin proveedores todavía.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}

// ── Compras ─────────────────────────────────────────────────────────────────
function ComprasTab({ perfil }) {
  const [proveedores, setProveedores] = useState([])
  const [data, setData] = useState({ compras: [], total: 0 })
  const [loading, setLoading] = useState(true)
  const [filtros, setFiltros] = useState({ estado: '', proveedor_id: '', alerta: '', q: '' })
  const [nueva, setNueva] = useState(false)
  const [detalle, setDetalle] = useState(null)
  const [msg, setMsg] = useState(null)
  function show(t, ok = true) { setMsg({ t, ok }); setTimeout(() => setMsg(null), 3500) }

  const cargar = useCallback(async () => {
    setLoading(true)
    const p = new URLSearchParams()
    Object.entries(filtros).forEach(([k, v]) => { if (v) p.set(k, v) })
    try { setData(await api('/compras?' + p.toString())) } catch (e) { show(e.message, false) }
    setLoading(false)
  }, [filtros])
  useEffect(() => { cargar() }, [cargar])
  useEffect(() => { api('/proveedores').then(setProveedores).catch(() => {}) }, [])

  return (
    <>
      <Msg msg={msg} />
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <select style={{ ...S.input, width: 'auto' }} value={filtros.estado} onChange={e => setFiltros({ ...filtros, estado: e.target.value })}>
          <option value="">Todos los estados</option>
          {['ABIERTA', 'PAGADA', 'FACTURADA', 'CERRADA'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select style={{ ...S.input, width: 'auto' }} value={filtros.proveedor_id} onChange={e => setFiltros({ ...filtros, proveedor_id: e.target.value })}>
          <option value="">Todos los proveedores</option>
          {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82em', color: MUTED, cursor: 'pointer' }}>
          <input type="checkbox" checked={filtros.alerta === 'true'} onChange={e => setFiltros({ ...filtros, alerta: e.target.checked ? 'true' : '' })} style={{ accentColor: GOLD }} />
          Sólo con alerta
        </label>
        <input style={{ ...S.input, width: 220 }} placeholder="Buscar descripción / cliente…" value={filtros.q} onChange={e => setFiltros({ ...filtros, q: e.target.value })} />
        <div style={{ flex: 1 }} />
        <button style={S.btn()} onClick={() => setNueva(true)}>➕ Nueva compra</button>
      </div>

      <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
        {loading ? <div style={{ padding: 30, color: MUTED }}>Cargando…</div> : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['Descripción', 'Proveedor', 'Cliente', 'Cotizado', 'Estado', 'Alertas', 'Creada', ''].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
            <tbody>
              {data.compras.map(c => {
                const alerta = c.bandera_alerta_vencida || c.bandera_discrepancia
                return (
                  <tr key={c.id} style={{ background: alerta ? RED + '0d' : undefined }}>
                    <td style={{ ...S.td, fontWeight: 500, maxWidth: 280 }}>{c.descripcion}</td>
                    <td style={{ ...S.td, color: MUTED }}>{c.proveedor?.nombre || '—'}</td>
                    <td style={{ ...S.td, color: MUTED }}>{c.cliente_nombre || '—'}</td>
                    <td style={S.td}>{c.monto_cotizado ? fmtCRC(c.monto_cotizado) : '—'}</td>
                    <td style={S.td}><Badge color={ESTADO_COLOR[c.estado]}>{c.estado}</Badge></td>
                    <td style={S.td}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {c.bandera_alerta_vencida && <Badge color={RED}>vencida</Badge>}
                        {c.bandera_discrepancia && <Badge color={GOLD}>discrepancia</Badge>}
                        {!alerta && <span style={{ color: MUTED, fontSize: '0.8em' }}>—</span>}
                      </div>
                    </td>
                    <td style={{ ...S.td, color: MUTED, fontSize: '0.78em' }}>{fmtDate(c.created_at)}</td>
                    <td style={S.td}><button style={S.btnSm()} onClick={() => setDetalle(c.id)}>Ver</button></td>
                  </tr>
                )
              })}
              {data.compras.length === 0 && <tr><td colSpan={8} style={{ ...S.td, textAlign: 'center', color: MUTED }}>Sin compras con esos filtros.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
      <div style={{ marginTop: 8, fontSize: '0.78em', color: MUTED }}>{data.total} compra(s)</div>

      {nueva && <NuevaCompra proveedores={proveedores} onClose={() => setNueva(false)} onSaved={() => { setNueva(false); cargar(); show('✅ Compra creada.') }} />}
      {detalle && <DetalleCompra id={detalle} perfil={perfil} onClose={() => setDetalle(null)} onChange={cargar} />}
    </>
  )
}

function NuevaCompra({ proveedores, onClose, onSaved }) {
  const [f, setF] = useState({ proveedor_id: '', descripcion: '', cliente_nombre: '', venta_cliente_ref: '', cantidad: '', unidad: 'm', monto_cotizado: '', fecha_cotizacion: '', notas: '' })
  const [msg, setMsg] = useState(null)
  const [saving, setSaving] = useState(false)
  async function guardar() {
    if (!f.proveedor_id) return setMsg({ t: 'Seleccioná un proveedor.', ok: false })
    if (!f.descripcion.trim()) return setMsg({ t: 'La descripción es obligatoria.', ok: false })
    setSaving(true)
    try { await api('/compras', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) }); onSaved() }
    catch (e) { setMsg({ t: e.message, ok: false }); setSaving(false) }
  }
  return (
    <Modal onClose={onClose}>
      <h3 style={{ marginTop: 0 }}>➕ Nueva compra</h3>
      <Msg msg={msg} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 12 }}>
        <Field label="Proveedor *">
          <select style={S.input} value={f.proveedor_id} onChange={e => setF({ ...f, proveedor_id: e.target.value })}>
            <option value="">Seleccioná…</option>
            {proveedores.filter(p => p.activo).map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </Field>
        <Field label="Factura del vendedor al cliente"><input style={S.input} value={f.venta_cliente_ref} onChange={e => setF({ ...f, venta_cliente_ref: e.target.value })} placeholder="N° factura NEO" /></Field>
        <Field label="Cliente final"><input style={S.input} value={f.cliente_nombre} onChange={e => setF({ ...f, cliente_nombre: e.target.value })} /></Field>
        <Field label="Cotizado (₡)"><input type="number" style={S.input} value={f.monto_cotizado} onChange={e => setF({ ...f, monto_cotizado: e.target.value })} /></Field>
        <Field label="Cantidad"><input type="number" style={S.input} value={f.cantidad} onChange={e => setF({ ...f, cantidad: e.target.value })} /></Field>
        <Field label="Unidad"><input style={S.input} value={f.unidad} onChange={e => setF({ ...f, unidad: e.target.value })} placeholder="m, unid…" /></Field>
        <Field label="Fecha cotización"><input type="date" style={S.input} value={f.fecha_cotizacion} onChange={e => setF({ ...f, fecha_cotizacion: e.target.value })} /></Field>
      </div>
      <div style={{ marginTop: 12 }}>
        <Field label="Descripción *"><textarea style={{ ...S.input, minHeight: 60, resize: 'vertical' }} value={f.descripcion} onChange={e => setF({ ...f, descripcion: e.target.value })} placeholder="lámina zinc 3.66m calibre 26…" /></Field>
      </div>
      <div style={{ marginTop: 12, display: 'flex', gap: 10 }}>
        <button style={S.btn(saving ? '#555' : GOLD)} onClick={guardar} disabled={saving}>{saving ? 'Guardando…' : '💾 Crear compra'}</button>
        <button style={S.btnSm()} onClick={onClose}>Cancelar</button>
      </div>
    </Modal>
  )
}

function DetalleCompra({ id, perfil, onClose, onChange }) {
  const [d, setD] = useState(null)
  const [msg, setMsg] = useState(null)
  const [pagoForm, setPagoForm] = useState(null)
  function show(t, ok = true) { setMsg({ t, ok }); setTimeout(() => setMsg(null), 4000) }
  const cargar = useCallback(async () => { try { setD(await api(`/compras/${id}`)) } catch (e) { show(e.message, false) } }, [id])
  useEffect(() => { cargar() }, [cargar])

  async function borrarPago(pid) {
    if (!confirm('¿Eliminar este pago? El comprobante queda archivado pero se desvincula.')) return
    try { await api(`/pagos/${pid}`, { method: 'DELETE' }); show('Pago eliminado.'); cargar(); onChange?.() } catch (e) { show(e.message, false) }
  }
  async function cerrarCompra() {
    if (!confirm('¿Marcar la compra como CERRADA?')) return
    try { await api(`/compras/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ estado: 'CERRADA' }) }); show('Compra cerrada.'); cargar(); onChange?.() } catch (e) { show(e.message, false) }
  }
  async function borrarCompra() {
    if (!confirm('¿Eliminar la compra? Sólo se puede si no tiene pagos.')) return
    try { await api(`/compras/${id}`, { method: 'DELETE' }); onChange?.(); onClose() } catch (e) { show(e.message, false) }
  }

  if (!d) return <Modal onClose={onClose}><div style={{ color: MUTED }}>Cargando…</div></Modal>
  const c = d.compra

  return (
    <Modal onClose={onClose} width={820}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
            <Badge color={ESTADO_COLOR[c.estado]}>{c.estado}</Badge>
            {c.bandera_alerta_vencida && <Badge color={RED}>pago vencido</Badge>}
            {c.bandera_discrepancia && <Badge color={GOLD}>discrepancia</Badge>}
          </div>
          <h3 style={{ margin: '4px 0', fontSize: '1.05em' }}>{c.descripcion}</h3>
          <div style={{ fontSize: '0.8em', color: MUTED }}>{c.proveedor?.nombre} · {c.cliente_nombre || 'sin cliente'} {c.venta_cliente_ref ? `· fact. ${c.venta_cliente_ref}` : ''}</div>
        </div>
        <button style={S.btnSm()} onClick={onClose}>✕</button>
      </div>
      <Msg msg={msg} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 16 }}>
        {[['Cotizado', c.monto_cotizado ? fmtCRC(c.monto_cotizado) : '—'], ['Pagado', fmtCRC(d.suma_pagos)], ['Facturado', fmtCRC(d.suma_facturado)]].map(([l, v]) => (
          <div key={l} style={{ background: SURF2, borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ fontSize: '0.68em', color: MUTED, textTransform: 'uppercase' }}>{l}</div>
            <div style={{ fontSize: '1.1em', fontWeight: 700, marginTop: 2 }}>{v}</div>
          </div>
        ))}
      </div>

      {/* Pagos */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h4 style={{ margin: 0, fontSize: '0.9em' }}>💸 Pagos</h4>
        {['ABIERTA', 'PAGADA'].includes(c.estado) && <button style={S.btnSm(GOLD, '#fff', GOLD)} onClick={() => setPagoForm({ monto: '', fecha_pago: new Date().toISOString().slice(0, 10), referencia_bancaria: '', banco_origen: '', file: null })}>+ Registrar pago</button>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
        {d.pagos.length === 0 && <span style={{ color: MUTED, fontSize: '0.82em' }}>Sin pagos registrados.</span>}
        {d.pagos.map(p => (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: SURF2, borderRadius: 8 }}>
            <span style={{ fontWeight: 600 }}>{fmtCRC(p.monto)}</span>
            <span style={{ fontSize: '0.78em', color: MUTED }}>{fmtDate(p.fecha_pago)}</span>
            {p.referencia_bancaria && <span style={{ fontSize: '0.75em', color: MUTED, fontFamily: 'monospace' }}>ref {p.referencia_bancaria}</span>}
            {(p.link && p.link.length) ? <Badge color={GREEN}>facturado</Badge> : <Badge color={AMBER}>sin factura</Badge>}
            <div style={{ flex: 1 }} />
            {p.comprobante && <a href={`${API}/archivos/${p.comprobante.id}`} target="_blank" rel="noreferrer" style={{ ...S.btnSm(SURF3, BLUE, BLUE + '44'), textDecoration: 'none' }}>📄 PDF</a>}
            <button style={S.btnSm(SURF3, RED, RED + '33')} onClick={() => borrarPago(p.id)}>🗑</button>
          </div>
        ))}
      </div>

      {pagoForm && <RegistrarPago id={id} perfil={perfil} form={pagoForm} setForm={setPagoForm} onDone={(m) => { setPagoForm(null); show(m || '✅ Pago registrado.'); cargar(); onChange?.() }} onCancel={() => setPagoForm(null)} />}

      {/* Facturas */}
      <h4 style={{ margin: '4px 0 8px', fontSize: '0.9em' }}>🧾 Facturas vinculadas</h4>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
        {d.facturas.length === 0 && <span style={{ color: MUTED, fontSize: '0.82em' }}>Ninguna factura vinculada todavía.</span>}
        {d.facturas.map(f => (
          <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: SURF2, borderRadius: 8 }}>
            <span style={{ fontWeight: 600 }}>{f.numero_factura}</span>
            <span style={{ fontSize: '0.8em', color: MUTED }}>{fmtCRC(f.monto_total)} · {fmtDate(f.fecha_factura)}</span>
            <div style={{ flex: 1 }} />
            {f.archivo && <a href={`${API}/archivos/${f.archivo.id}`} target="_blank" rel="noreferrer" style={{ ...S.btnSm(SURF3, BLUE, BLUE + '44'), textDecoration: 'none' }}>📄 PDF</a>}
          </div>
        ))}
      </div>

      {/* Timeline */}
      <h4 style={{ margin: '4px 0 8px', fontSize: '0.9em' }}>🕑 Línea de tiempo</h4>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 16 }}>
        {d.eventos.map((e, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, fontSize: '0.8em' }}>
            <span style={{ color: MUTED, minWidth: 110 }}>{fmtDateTime(e.ts)}</span>
            <span>{e.texto}</span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, borderTop: `1px solid ${BORDER}`, paddingTop: 14 }}>
        {c.estado === 'FACTURADA' && <button style={S.btn(GREEN)} onClick={cerrarCompra}>✓ Cerrar compra</button>}
        {d.pagos.length === 0 && <button style={S.btnSm(SURF3, RED, RED + '33')} onClick={borrarCompra}>🗑 Eliminar compra</button>}
      </div>
    </Modal>
  )
}

function RegistrarPago({ id, perfil, form, setForm, onDone, onCancel }) {
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)
  async function subir() {
    if (!(Number(form.monto) > 0)) return setErr('El monto debe ser mayor a 0.')
    if (!form.fecha_pago) return setErr('Falta la fecha de pago.')
    if (!form.file) return setErr('Adjuntá el PDF del comprobante.')
    setSaving(true); setErr(null)
    const fd = new FormData()
    fd.append('pdf', form.file)
    fd.append('monto', form.monto)
    fd.append('fecha_pago', form.fecha_pago)
    fd.append('referencia_bancaria', form.referencia_bancaria || '')
    fd.append('banco_origen', form.banco_origen || '')
    fd.append('uploaded_by', perfil?.nombre || perfil?.email || '')
    try {
      const r = await api(`/compras/${id}/pagos`, { method: 'POST', body: fd })
      onDone(r.warning ? '✅ Pago registrado. ' + r.warning : '✅ Pago registrado.')
    } catch (e) { setErr(e.message); setSaving(false) }
  }
  return (
    <div style={{ background: SURF3, border: `1px solid ${GOLD}44`, borderRadius: 10, padding: 14, marginBottom: 16 }}>
      <div style={{ fontWeight: 600, marginBottom: 10, fontSize: '0.88em' }}>Registrar pago (transferencia)</div>
      {err && <div style={{ color: RED, fontSize: '0.8em', marginBottom: 8 }}>{err}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
        <Field label="Monto (₡) *"><input type="number" style={S.input} value={form.monto} onChange={e => setForm({ ...form, monto: e.target.value })} /></Field>
        <Field label="Fecha de pago *"><input type="date" style={S.input} value={form.fecha_pago} onChange={e => setForm({ ...form, fecha_pago: e.target.value })} /></Field>
        <Field label="Referencia bancaria"><input style={S.input} value={form.referencia_bancaria} onChange={e => setForm({ ...form, referencia_bancaria: e.target.value })} /></Field>
        <Field label="Banco origen"><input style={S.input} value={form.banco_origen} onChange={e => setForm({ ...form, banco_origen: e.target.value })} /></Field>
      </div>
      <div style={{ marginTop: 10 }}>
        <Field label="Comprobante PDF *"><input type="file" accept="application/pdf" onChange={e => setForm({ ...form, file: e.target.files[0] })} style={{ ...S.input, padding: 6 }} /></Field>
      </div>
      <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
        <button style={S.btn(saving ? '#555' : GOLD)} onClick={subir} disabled={saving}>{saving ? 'Subiendo…' : '💾 Guardar pago'}</button>
        <button style={S.btnSm()} onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  )
}

// ── Subir factura + match ───────────────────────────────────────────────────
function FacturaTab({ perfil }) {
  const [proveedores, setProveedores] = useState([])
  const [f, setF] = useState({ proveedor_id: '', numero_factura: '', fecha_factura: new Date().toISOString().slice(0, 10), monto_total: '', notas: '', file: null })
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)
  const [match, setMatch] = useState(null) // { factura, sugerencia_fuerte, alternativas, todos_los_candidatos }
  const [sel, setSel] = useState({}) // pago_id -> monto_aplicado
  function show(t, ok = true) { setMsg({ t, ok }); setTimeout(() => setMsg(null), 5000) }

  useEffect(() => { api('/proveedores').then(setProveedores).catch(() => {}) }, [])

  async function subir() {
    if (!f.proveedor_id) return show('Seleccioná un proveedor.', false)
    if (!f.numero_factura.trim()) return show('Falta el número de factura.', false)
    if (!(Number(f.monto_total) > 0)) return show('El monto total debe ser mayor a 0.', false)
    if (!f.file) return show('Adjuntá el PDF de la factura.', false)
    setSaving(true)
    const fd = new FormData()
    fd.append('pdf', f.file)
    fd.append('proveedor_id', f.proveedor_id)
    fd.append('numero_factura', f.numero_factura.trim())
    fd.append('fecha_factura', f.fecha_factura)
    fd.append('monto_total', f.monto_total)
    fd.append('notas', f.notas || '')
    fd.append('uploaded_by', perfil?.nombre || perfil?.email || '')
    try {
      const r = await api('/facturas', { method: 'POST', body: fd })
      setMatch(r)
      const pre = {}
      if (r.sugerencia_fuerte) r.sugerencia_fuerte.forEach(pid => {
        const pago = r.todos_los_candidatos.find(p => p.id === pid)
        pre[pid] = pago ? pago.monto : ''
      })
      setSel(pre)
      show('✅ Factura subida. Revisá las sugerencias de conciliación.')
    } catch (e) { show(e.message, false) }
    setSaving(false)
  }

  function toggle(pago) {
    setSel(prev => {
      const n = { ...prev }
      if (n[pago.id] !== undefined) delete n[pago.id]
      else n[pago.id] = pago.monto
      return n
    })
  }

  async function confirmar() {
    const links = Object.entries(sel).map(([pago_id, monto_aplicado]) => ({ pago_id: Number(pago_id), monto_aplicado: Number(monto_aplicado) }))
    if (!links.length) return show('Seleccioná al menos un pago.', false)
    try {
      const r = await api(`/facturas/${match.factura.id}/match`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(links) })
      show(r.conciliada ? '✅ Conciliada. Compras actualizadas.' : '⚠️ ' + (r.warning || 'Registrado con discrepancia.'), r.conciliada)
      setMatch(null); setSel({})
      setF({ proveedor_id: '', numero_factura: '', fecha_factura: new Date().toISOString().slice(0, 10), monto_total: '', notas: '', file: null })
    } catch (e) { show(e.message, false) }
  }

  const sumSel = Object.values(sel).reduce((s, v) => s + (Number(v) || 0), 0)
  const target = match ? Number(match.factura.monto_total) : 0
  const cuadra = match && Math.round(sumSel * 100) === Math.round(target * 100)

  return (
    <>
      <Msg msg={msg} />
      {!match ? (
        <div style={{ ...S.card, maxWidth: 720 }}>
          <h3 style={{ marginTop: 0, fontSize: '0.95em' }}>📥 Subir factura del proveedor</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 12 }}>
            <Field label="Proveedor *">
              <select style={S.input} value={f.proveedor_id} onChange={e => setF({ ...f, proveedor_id: e.target.value })}>
                <option value="">Seleccioná…</option>
                {proveedores.filter(p => p.activo).map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </Field>
            <Field label="Número de factura *"><input style={S.input} value={f.numero_factura} onChange={e => setF({ ...f, numero_factura: e.target.value })} /></Field>
            <Field label="Fecha de factura *"><input type="date" style={S.input} value={f.fecha_factura} onChange={e => setF({ ...f, fecha_factura: e.target.value })} /></Field>
            <Field label="Monto total (₡) *"><input type="number" style={S.input} value={f.monto_total} onChange={e => setF({ ...f, monto_total: e.target.value })} /></Field>
          </div>
          <div style={{ marginTop: 12 }}>
            <Field label="PDF de la factura *"><input type="file" accept="application/pdf" onChange={e => setF({ ...f, file: e.target.files[0] })} style={{ ...S.input, padding: 6 }} /></Field>
          </div>
          <div style={{ marginTop: 12 }}>
            <button style={S.btn(saving ? '#555' : GOLD)} onClick={subir} disabled={saving}>{saving ? 'Subiendo…' : '📥 Subir y buscar match'}</button>
          </div>
        </div>
      ) : (
        <div style={{ ...S.card }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1em' }}>🔗 Conciliar factura {match.factura.numero_factura}</h3>
              <div style={{ fontSize: '0.82em', color: MUTED, marginTop: 2 }}>Total a cubrir: <strong style={{ color: TEXT }}>{fmtCRC(target)}</strong></div>
            </div>
            <button style={S.btnSm()} onClick={() => { setMatch(null); setSel({}) }}>✕ Cerrar</button>
          </div>

          {match.sugerencia_fuerte && <div style={{ background: GREEN + '18', border: `1px solid ${GREEN}44`, borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: '0.82em', color: GREEN }}>💡 Sugerencia fuerte: {match.sugerencia_fuerte.length} pago(s) suman exactamente el total. Ya quedaron preseleccionados.</div>}
          {!match.sugerencia_fuerte && match.alternativas?.length > 1 && <div style={{ background: AMBER + '18', border: `1px solid ${AMBER}44`, borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: '0.82em', color: AMBER }}>Hay {match.alternativas.length} combinaciones posibles que cuadran. Elegí cuál corresponde.</div>}
          {!match.sugerencia_fuerte && (!match.alternativas || match.alternativas.length === 0) && <div style={{ background: SURF2, borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: '0.82em', color: MUTED }}>No hay combinación exacta. Seleccioná manualmente los pagos a conciliar.</div>}

          {match.alternativas?.length > 1 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              {match.alternativas.map((combo, i) => (
                <button key={i} style={S.btnSm()} onClick={() => { const n = {}; combo.forEach(pid => { const p = match.todos_los_candidatos.find(x => x.id === pid); n[pid] = p ? p.monto : '' }); setSel(n) }}>Opción {i + 1} · {combo.length} pago(s)</button>
              ))}
            </div>
          )}

          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 14 }}>
            <thead><tr>{['', 'Pago', 'Fecha', 'Compra', 'Monto', 'Aplicar (₡)'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
            <tbody>
              {match.todos_los_candidatos.length === 0 && <tr><td colSpan={6} style={{ ...S.td, textAlign: 'center', color: MUTED }}>No hay pagos sin factura de este proveedor en los últimos 90 días.</td></tr>}
              {match.todos_los_candidatos.map(p => {
                const on = sel[p.id] !== undefined
                return (
                  <tr key={p.id} style={{ background: on ? GOLD + '12' : undefined }}>
                    <td style={S.td}><input type="checkbox" checked={on} onChange={() => toggle(p)} style={{ accentColor: GOLD }} /></td>
                    <td style={S.td}>#{p.id}</td>
                    <td style={{ ...S.td, color: MUTED }}>{fmtDate(p.fecha_pago)}</td>
                    <td style={{ ...S.td, color: MUTED, fontSize: '0.8em', maxWidth: 220 }}>{p.compra?.descripcion}</td>
                    <td style={{ ...S.td, fontWeight: 600 }}>{fmtCRC(p.monto)}</td>
                    <td style={S.td}>{on ? <input type="number" style={{ ...S.input, width: 120, padding: '5px 8px' }} value={sel[p.id]} onChange={e => setSel({ ...sel, [p.id]: e.target.value })} /> : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <button style={S.btn(cuadra ? GREEN : GOLD)} onClick={confirmar}>{cuadra ? '✓ Conciliar (cuadra exacto)' : '⚠️ Conciliar con discrepancia'}</button>
            <span style={{ fontSize: '0.84em', color: cuadra ? GREEN : AMBER }}>Seleccionado: {fmtCRC(sumSel)} / {fmtCRC(target)} {cuadra ? '✓' : `(dif ${fmtCRC(Math.abs(target - sumSel))})`}</span>
          </div>
        </div>
      )}
    </>
  )
}

// ── Alertas ─────────────────────────────────────────────────────────────────
function AlertasTab() {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [verResueltas, setVerResueltas] = useState(false)
  const cargar = useCallback(async () => {
    setLoading(true)
    try { setList(await api('/alertas?resuelta=' + (verResueltas ? 'true' : 'false'))) } catch (e) { /* noop */ }
    setLoading(false)
  }, [verResueltas])
  useEffect(() => { cargar() }, [cargar])

  async function resolver(a, resuelta) {
    try { await api(`/alertas/${a.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resuelta }) }); cargar() } catch (e) { /* noop */ }
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center' }}>
        <button style={S.btnSm(!verResueltas ? GOLD : SURF2, !verResueltas ? '#fff' : MUTED, !verResueltas ? GOLD : BORDER)} onClick={() => setVerResueltas(false)}>Activas</button>
        <button style={S.btnSm(verResueltas ? GOLD : SURF2, verResueltas ? '#fff' : MUTED, verResueltas ? GOLD : BORDER)} onClick={() => setVerResueltas(true)}>Resueltas</button>
      </div>
      <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
        {loading ? <div style={{ padding: 30, color: MUTED }}>Cargando…</div> : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['Sev.', 'Tipo', 'Mensaje', 'Proveedor / Factura', 'Fecha', ''].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
            <tbody>
              {list.map(a => (
                <tr key={a.id}>
                  <td style={S.td}><Badge color={SEV_COLOR[a.severidad]}>{a.severidad}</Badge></td>
                  <td style={{ ...S.td, fontSize: '0.78em', color: MUTED }}>{a.tipo}</td>
                  <td style={S.td}>{a.mensaje}</td>
                  <td style={{ ...S.td, color: MUTED, fontSize: '0.8em' }}>{a.compra?.proveedor?.nombre || a.factura?.numero_factura || '—'}</td>
                  <td style={{ ...S.td, color: MUTED, fontSize: '0.78em' }}>{fmtDate(a.created_at)}</td>
                  <td style={S.td}>{a.resuelta ? <button style={S.btnSm()} onClick={() => resolver(a, false)}>Reabrir</button> : <button style={S.btnSm(GREEN + '22', GREEN, GREEN + '44')} onClick={() => resolver(a, true)}>✓ Resolver</button>}</td>
                </tr>
              ))}
              {list.length === 0 && <tr><td colSpan={6} style={{ ...S.td, textAlign: 'center', color: verResueltas ? MUTED : GREEN }}>{verResueltas ? 'Sin alertas resueltas.' : '✅ Sin alertas activas.'}</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}

// ── Reportes ────────────────────────────────────────────────────────────────
function ReportesTab() {
  const [rep, setRep] = useState(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => { (async () => { try { setRep(await api('/reportes')) } catch (e) { /* noop */ } setLoading(false) })() }, [])
  if (loading) return <div style={{ color: MUTED }}>Cargando…</div>
  if (!rep) return <div style={{ color: RED }}>No se pudo cargar el reporte.</div>

  const maxAging = Math.max(1, ...rep.aging.map(a => a.monto))

  return (
    <>
      <div style={{ ...S.card, marginBottom: 18 }}>
        <div style={{ fontSize: '0.72em', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Saldo documental total (pagado sin factura recibida)</div>
        <div style={{ fontSize: '2em', fontWeight: 700, color: GOLD, marginTop: 4 }}>{fmtCRC(rep.saldo_total)}</div>
        <div style={{ fontSize: '0.8em', color: MUTED }}>{rep.pagos_sin_factura} pago(s) pendientes de factura</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        <div style={S.card}>
          <h3 style={{ marginTop: 0, fontSize: '0.92em' }}>📅 Aging de pagos sin factura</h3>
          {rep.aging.map(a => (
            <div key={a.rango} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82em', marginBottom: 3 }}>
                <span style={{ color: a.rango === '+60' ? RED : a.rango === '31-60' ? GOLD : TEXT }}>{a.rango} días {a.pagos ? `· ${a.pagos} pago(s)` : ''}</span>
                <strong>{fmtCRC(a.monto)}</strong>
              </div>
              <div style={{ height: 8, background: SURF2, borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(a.monto / maxAging) * 100}%`, background: a.rango === '+60' ? RED : a.rango === '31-60' ? GOLD : a.rango === '16-30' ? AMBER : GREEN }} />
              </div>
            </div>
          ))}
        </div>

        <div style={S.card}>
          <h3 style={{ marginTop: 0, fontSize: '0.92em' }}>🏭 Saldo por proveedor</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['Proveedor', 'Pagos', 'Saldo'].map(h => <th key={h} style={{ ...S.th, background: 'transparent' }}>{h}</th>)}</tr></thead>
            <tbody>
              {rep.por_proveedor.map(p => (
                <tr key={p.proveedor_id}>
                  <td style={S.td}>{p.nombre}</td>
                  <td style={{ ...S.td, color: MUTED }}>{p.pagos}</td>
                  <td style={{ ...S.td, fontWeight: 600 }}>{fmtCRC(p.saldo)}</td>
                </tr>
              ))}
              {rep.por_proveedor.length === 0 && <tr><td colSpan={3} style={{ ...S.td, textAlign: 'center', color: GREEN }}>✅ Nada pendiente.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
