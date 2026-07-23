'use client'
import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../../lib/useAuth'

// ── Paleta / estilo "vidrio esmerilado dorado" (calcado de los demás módulos) ─
const GOLD = '#c8a84b'
const BG_GRADIENT = 'linear-gradient(135deg, #e8ecf4, #d5dde8, #e0e7f0, #edf1f7)'
const CARD_BG = 'rgba(255,255,255,0.55)'
const CARD_BLUR = 'blur(24px)'
const BORDER = 'rgba(255,255,255,0.35)'
const TEXT = '#1a1a2e'
const MUTED = '#6b7280'
const WHITE = '#ffffff'

const ESTADO_META = {
  pendiente: { color: '#f59e0b', label: 'Pendiente' },
  pagada:    { color: '#22c55e', label: 'Pagada' },
  rechazada: { color: '#ef4444', label: 'Rechazada' },
  anulada:   { color: '#9ca3af', label: 'Anulada' },
}
const METODO_LABEL = { sinpe_movil: 'SINPE Móvil', transferencia: 'Transferencia' }

const S = {
  card: { background: CARD_BG, backdropFilter: CARD_BLUR, WebkitBackdropFilter: CARD_BLUR, border: `1px solid ${BORDER}`, borderRadius: 16, padding: '20px 24px', marginBottom: 16 },
  badge: (c) => ({ background: c + '18', color: c, border: `1px solid ${c}44`, borderRadius: 20, padding: '3px 12px', fontSize: '0.74em', fontWeight: 600, whiteSpace: 'nowrap', display: 'inline-block' }),
  input: { background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(0,0,0,0.1)', borderRadius: 10, padding: '9px 14px', color: TEXT, fontSize: '0.85em', fontFamily: 'Rubik, sans-serif', outline: 'none', width: '100%', boxSizing: 'border-box' },
  textarea: { background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(0,0,0,0.1)', borderRadius: 10, padding: '9px 14px', color: TEXT, fontSize: '0.85em', fontFamily: 'Rubik, sans-serif', outline: 'none', width: '100%', boxSizing: 'border-box', minHeight: 70, resize: 'vertical' },
  select: { background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(0,0,0,0.1)', borderRadius: 10, padding: '9px 14px', color: TEXT, fontSize: '0.85em', fontFamily: 'Rubik, sans-serif', outline: 'none', width: '100%', boxSizing: 'border-box' },
  btn: (c = GOLD) => ({ background: c, color: WHITE, border: 'none', borderRadius: 10, padding: '9px 20px', cursor: 'pointer', fontSize: '0.84em', fontWeight: 600, fontFamily: 'Rubik, sans-serif', display: 'inline-flex', alignItems: 'center', gap: 6 }),
  btnOutline: { background: 'rgba(255,255,255,0.5)', color: TEXT, border: '1px solid rgba(0,0,0,0.12)', borderRadius: 10, padding: '8px 16px', cursor: 'pointer', fontSize: '0.84em', fontWeight: 600, fontFamily: 'Rubik, sans-serif' },
  label: { fontSize: '0.72em', fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5, display: 'block' },
}

function fmt(monto, moneda) {
  try { return new Intl.NumberFormat('es-CR', { style: 'currency', currency: moneda }).format(Number(monto)) }
  catch { return `${moneda} ${Number(monto).toFixed(2)}` }
}
function dias(fecha) { return Math.max(0, Math.floor((new Date() - new Date(fecha)) / 86400000)) }

// ═══════════════════════════════════════════════════════════════════════════
export default function DevolucionesPage() {
  const { perfil, loading: authLoading, puedeVer } = useAuth()
  const [vista, setVista] = useState('lista')
  const [editando, setEditando] = useState(null)
  const [datos, setDatos] = useState({ devoluciones: [], resumen: null })
  const [loading, setLoading] = useState(true)
  const [filtros, setFiltros] = useState({ estado: 'pendiente', metodo: 'todos', moneda: 'todos', q: '', desde: '', hasta: '' })
  const [modal, setModal] = useState(null) // { tipo:'pagar'|'rechazar'|'anular', dev }
  const [toast, setToast] = useState(null)

  const esGerente = perfil?.rol === 'admin' || puedeVer('devoluciones-aprobar')

  function aviso(texto, ok = true) { setToast({ texto, ok }); setTimeout(() => setToast(null), 3500) }

  async function cargar() {
    setLoading(true)
    const sp = new URLSearchParams()
    Object.entries(filtros).forEach(([k, v]) => { if (v) sp.set(k, v) })
    try {
      const r = await fetch(`/api/devoluciones?${sp.toString()}`)
      const j = await r.json()
      if (j.ok) setDatos({ devoluciones: j.devoluciones, resumen: j.resumen })
    } catch (_) { /* noop */ }
    setLoading(false)
  }
  useEffect(() => { if (perfil) cargar() /* eslint-disable-next-line */ }, [perfil, filtros])

  function volver() { setVista('lista'); setEditando(null); cargar() }

  if (authLoading) return <Pantalla texto="Cargando…" />
  if (!perfil) return <Pantalla texto="Iniciá sesión para continuar." />
  if (!puedeVer('devoluciones')) {
    return <Pantalla texto="🔒 No tenés permiso para ver Devoluciones. Pedíselo a un admin." />
  }

  return (
    <div style={{ background: BG_GRADIENT, minHeight: '100vh', fontFamily: 'Rubik, sans-serif', color: TEXT }}>
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '24px 28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
          <div>
            <span style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: GOLD }}>Finanzas · SOL</span>
            <h1 style={{ fontSize: '1.7rem', fontWeight: 700, margin: '4px 0 0' }}>💸 Devoluciones de dinero</h1>
            <p style={{ fontSize: '0.85rem', color: MUTED, margin: '4px 0 0' }}>Control de reintegros a clientes · que no se olvide ninguna transferencia</p>
          </div>
          {vista === 'lista' && (
            <button style={S.btn()} onClick={() => { setEditando(null); setVista('form') }}>+ Nueva devolución</button>
          )}
        </div>

        {vista === 'lista' && (
          <VistaLista
            datos={datos} loading={loading} filtros={filtros} setFiltros={setFiltros}
            esGerente={esGerente} perfil={perfil}
            onEditar={(d) => { setEditando(d); setVista('form') }}
            onModal={(tipo, dev) => setModal({ tipo, dev })}
          />
        )}
        {vista === 'form' && (
          <FormDevolucion editando={editando} perfil={perfil} onVolver={volver} aviso={aviso} />
        )}
      </div>

      {modal && (
        <ModalAccion modal={modal} perfil={perfil} onClose={() => setModal(null)}
          onHecho={(msg) => { setModal(null); aviso(msg); cargar() }} onError={(m) => aviso(m, false)} />
      )}
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: toast.ok ? '#16a34a' : '#dc2626', color: '#fff', padding: '10px 20px', borderRadius: 12, fontSize: '0.85em', fontWeight: 600, zIndex: 2000, boxShadow: '0 8px 24px rgba(0,0,0,0.2)' }}>{toast.texto}</div>
      )}
    </div>
  )
}

function Pantalla({ texto }) {
  return (
    <div style={{ background: BG_GRADIENT, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Rubik, sans-serif' }}>
      <div style={{ ...S.card, padding: 40, textAlign: 'center', color: MUTED, maxWidth: 420 }}>{texto}</div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
function VistaLista({ datos, loading, filtros, setFiltros, esGerente, perfil, onEditar, onModal }) {
  const r = datos.resumen
  const kpis = [
    { label: 'Pendiente ₡', valor: r ? fmt(r.pendiente_crc, 'CRC') : '—', color: '#f59e0b' },
    { label: 'Pendiente $', valor: r ? fmt(r.pendiente_usd, 'USD') : '—', color: '#f59e0b' },
    { label: 'Sin pagar', valor: r ? r.cant_pendientes : '—', color: GOLD },
    { label: 'Pagado este mes ₡', valor: r ? fmt(r.pagado_mes_crc, 'CRC') : '—', color: '#22c55e' },
  ]
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
        {kpis.map((k, i) => (
          <div key={i} style={{ ...S.card, marginBottom: 0, padding: '16px 18px' }}>
            <div style={{ fontSize: '0.72em', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{k.label}</div>
            <div style={{ fontSize: '1.35em', fontWeight: 700, color: k.color }}>{k.valor}</div>
          </div>
        ))}
      </div>

      <div style={{ ...S.card, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Campo label="Estado" w={150}>
          <select style={S.select} value={filtros.estado} onChange={e => setFiltros({ ...filtros, estado: e.target.value })}>
            <option value="todos">Todos</option>
            <option value="pendiente">Pendiente</option>
            <option value="pagada">Pagada</option>
            <option value="rechazada">Rechazada</option>
            <option value="anulada">Anulada</option>
          </select>
        </Campo>
        <Campo label="Método" w={150}>
          <select style={S.select} value={filtros.metodo} onChange={e => setFiltros({ ...filtros, metodo: e.target.value })}>
            <option value="todos">Todos</option>
            <option value="sinpe_movil">SINPE Móvil</option>
            <option value="transferencia">Transferencia</option>
          </select>
        </Campo>
        <Campo label="Moneda" w={110}>
          <select style={S.select} value={filtros.moneda} onChange={e => setFiltros({ ...filtros, moneda: e.target.value })}>
            <option value="todos">Todas</option>
            <option value="CRC">₡ CRC</option>
            <option value="USD">$ USD</option>
          </select>
        </Campo>
        <Campo label="Desde" w={150}><input type="date" style={S.input} value={filtros.desde} onChange={e => setFiltros({ ...filtros, desde: e.target.value })} /></Campo>
        <Campo label="Hasta" w={150}><input type="date" style={S.input} value={filtros.hasta} onChange={e => setFiltros({ ...filtros, hasta: e.target.value })} /></Campo>
        <Campo label="Buscar cliente / ref ERP" w={220}><input style={S.input} placeholder="Nombre o referencia…" value={filtros.q} onChange={e => setFiltros({ ...filtros, q: e.target.value })} /></Campo>
      </div>

      {loading ? (
        <div style={{ ...S.card, textAlign: 'center', color: MUTED, padding: 30 }}>Cargando…</div>
      ) : datos.devoluciones.length === 0 ? (
        <div style={{ ...S.card, textAlign: 'center', color: MUTED, padding: 40 }}>No hay devoluciones con estos filtros.</div>
      ) : (
        datos.devoluciones.map(d => (
          <Fila key={d.id} d={d} esGerente={esGerente} perfil={perfil} onEditar={onEditar} onModal={onModal} />
        ))
      )}
    </>
  )
}

function Campo({ label, w, children }) {
  return (
    <div style={{ flex: `1 1 ${w || 160}px`, minWidth: w || 160 }}>
      <label style={S.label}>{label}</label>
      {children}
    </div>
  )
}

function Fila({ d, esGerente, perfil, onEditar, onModal }) {
  const meta = ESTADO_META[d.estado] || ESTADO_META.anulada
  const destino = d.metodo === 'sinpe_movil' ? d.sinpe_numero : d.iban
  const dd = dias(d.creado_en)
  const atraso = d.estado === 'pendiente' && dd >= 2
  const propio = !d.creado_por_id || d.creado_por_id === perfil?.id || d.creado_por === perfil?.nombre
  const puedeEditar = ['pendiente', 'rechazada'].includes(d.estado)

  return (
    <div style={{ ...S.card, borderLeft: `4px solid ${meta.color}`, display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
      <div style={{ flex: '1 1 340px', minWidth: 260 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
          <span style={{ fontSize: '1.05em', fontWeight: 700 }}>{d.cliente_nombre}</span>
          <span style={S.badge(meta.color)}>{meta.label}</span>
          {atraso && <span style={S.badge('#ef4444')}>⏰ {dd} días sin pagar</span>}
        </div>
        <div style={{ fontSize: '1.25em', fontWeight: 700, color: TEXT, marginBottom: 4 }}>{fmt(d.monto, d.moneda)}</div>
        <div style={{ fontSize: '0.82em', color: MUTED, lineHeight: 1.6 }}>
          <div>{METODO_LABEL[d.metodo]} · <b style={{ color: TEXT }}>{destino}</b>{d.banco ? ` · ${d.banco}` : ''}</div>
          {d.titular_cuenta && <div>Titular: <b style={{ color: TEXT }}>{d.titular_cuenta}</b></div>}
          {d.motivo && <div>Motivo: {d.motivo}</div>}
          {d.cliente_identificacion && <div>Cédula: {d.cliente_identificacion}</div>}
          {d.referencia_erp && <div>Ref ERP: {d.referencia_erp}</div>}
          {d.nota_credito && <div>NC: {d.nota_credito}</div>}
          <div>Creada {new Date(d.creado_en).toLocaleDateString('es-CR')} por {d.creado_por || '—'}</div>
          {d.estado === 'pagada' && <div style={{ color: '#16a34a' }}>✓ Pagada {d.pagado_en ? new Date(d.pagado_en).toLocaleDateString('es-CR') : ''} por {d.pagado_por || '—'}{d.referencia_pago ? ` · comprobante ${d.referencia_pago}` : ''}</div>}
          {d.estado === 'rechazada' && d.motivo_rechazo && <div style={{ color: '#dc2626' }}>✗ Rechazo: {d.motivo_rechazo}</div>}
          {d.notas && <div style={{ fontStyle: 'italic' }}>“{d.notas}”</div>}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end', justifyContent: 'center' }}>
        <a href={`/api/devoluciones/${d.id}/recibo`} target="_blank" rel="noreferrer" style={{ ...S.btnOutline, textDecoration: 'none', display: 'inline-block' }}>📄 Ver recibo</a>
        {esGerente && d.estado === 'pendiente' && (
          <>
            <button style={S.btn('#22c55e')} onClick={() => onModal('pagar', d)}>✓ Marcar como pagada</button>
            <button style={S.btn('#ef4444')} onClick={() => onModal('rechazar', d)}>✗ Rechazar</button>
          </>
        )}
        {propio && puedeEditar && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={S.btnOutline} onClick={() => onEditar(d)}>{d.estado === 'rechazada' ? '✏️ Corregir y reenviar' : '✏️ Editar'}</button>
            <button style={{ ...S.btnOutline, color: '#dc2626' }} onClick={() => onModal('anular', d)}>Anular</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
function FormDevolucion({ editando, perfil, onVolver, aviso }) {
  const e = editando || {}
  const [f, setF] = useState({
    cliente_nombre: e.cliente_nombre || '', cliente_identificacion: e.cliente_identificacion || '',
    titular_cuenta: e.titular_cuenta || '', motivo: e.motivo || '',
    monto: e.monto || '', moneda: e.moneda || 'CRC', metodo: e.metodo || 'sinpe_movil',
    sinpe_numero: e.sinpe_numero || '', iban: e.iban || '', banco: e.banco || '',
    referencia_erp: e.referencia_erp || '', nota_credito: e.nota_credito || '', notas: e.notas || '',
  })
  const [file, setFile] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')

  function set(k, v) { setF({ ...f, [k]: v }) }

  function validar() {
    if (f.cliente_nombre.trim().length < 3) return 'El nombre del cliente debe tener al menos 3 caracteres.'
    if (f.titular_cuenta.trim().length < 3) return 'Indicá el nombre del titular de la cuenta o SINPE.'
    if (f.motivo.trim().length < 5) return 'Indicá el motivo de la devolución (mínimo 5 caracteres).'
    const m = Number(f.monto)
    if (!(m > 0)) return 'El monto debe ser mayor a 0.'
    if (f.metodo === 'sinpe_movil') {
      if (!/^\d{8}$/.test(String(f.sinpe_numero).replace(/[\s\-()]/g, ''))) return 'El SINPE Móvil debe tener 8 dígitos.'
    } else {
      if (!/^CR\d{20}$/.test(String(f.iban).replace(/\s/g, '').toUpperCase())) return 'La cuenta IBAN debe ser CR + 20 dígitos.'
    }
    if (!editando && !file) return 'Adjuntá el PDF del recibo.'
    if (file && file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) return 'El recibo debe ser un PDF.'
    if (file && file.size > 10 * 1024 * 1024) return 'El PDF supera los 10 MB.'
    return ''
  }

  async function guardar() {
    const err = validar()
    if (err) { setError(err); return }
    setError(''); setEnviando(true)
    try {
      const fd = new FormData()
      Object.entries(f).forEach(([k, v]) => fd.append(k, v ?? ''))
      fd.append('actor_nombre', perfil?.nombre || perfil?.email || '')
      fd.append('actor_id', perfil?.id || '')
      if (file) fd.append('recibo', file)
      const url = editando ? `/api/devoluciones/${editando.id}` : '/api/devoluciones'
      const r = await fetch(url, { method: editando ? 'PATCH' : 'POST', body: fd })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Error al guardar.')
      aviso(editando ? 'Devolución actualizada.' : 'Devolución registrada.')
      onVolver()
    } catch (ex) {
      setError(ex.message); setEnviando(false)
    }
  }

  return (
    <div style={{ ...S.card, maxWidth: 720 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <h2 style={{ fontSize: '1.15em', fontWeight: 700, margin: 0 }}>{editando ? (editando.estado === 'rechazada' ? 'Corregir y reenviar' : 'Editar devolución') : 'Nueva devolución'}</h2>
        <button style={S.btnOutline} onClick={onVolver}>← Volver</button>
      </div>

      {editando?.estado === 'rechazada' && editando.motivo_rechazo && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: '0.85em', color: '#dc2626' }}>
          <b>Motivo del rechazo:</b> {editando.motivo_rechazo}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={S.label}>Nombre del cliente *</label>
          <input style={S.input} value={f.cliente_nombre} onChange={ev => set('cliente_nombre', ev.target.value)} placeholder="Ej. Ferretería La Central" />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={S.label}>Motivo de la devolución *</label>
          <textarea style={S.textarea} value={f.motivo} onChange={ev => set('motivo', ev.target.value)} placeholder="Ej. Producto defectuoso, cliente canceló la compra, cobro duplicado…" />
        </div>
        <div>
          <label style={S.label}>Identificación (opcional)</label>
          <input style={S.input} value={f.cliente_identificacion} onChange={ev => set('cliente_identificacion', ev.target.value)} placeholder="Cédula física / jurídica" />
        </div>
        <div>
          <label style={S.label}>Referencia ERP (opcional)</label>
          <input style={S.input} value={f.referencia_erp} onChange={ev => set('referencia_erp', ev.target.value)} placeholder="N.º de recibo del ERP" />
        </div>
        <div>
          <label style={S.label}>N.º de Nota de Crédito (opcional)</label>
          <input style={S.input} value={f.nota_credito} onChange={ev => set('nota_credito', ev.target.value)} placeholder="NC asociada, si aplica" />
        </div>
        <div>
          <label style={S.label}>Monto *</label>
          <input style={S.input} type="number" step="0.01" min="0" value={f.monto} onChange={ev => set('monto', ev.target.value)} placeholder="0.00" />
        </div>
        <div>
          <label style={S.label}>Moneda *</label>
          <select style={S.select} value={f.moneda} onChange={ev => set('moneda', ev.target.value)}>
            <option value="CRC">₡ Colones (CRC)</option>
            <option value="USD">$ Dólares (USD)</option>
          </select>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={S.label}>Método de reintegro *</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {['sinpe_movil', 'transferencia'].map(m => (
              <button key={m} type="button" onClick={() => set('metodo', m)}
                style={{ ...(f.metodo === m ? S.btn() : S.btnOutline), flex: 1, justifyContent: 'center' }}>
                {METODO_LABEL[m]}
              </button>
            ))}
          </div>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={S.label}>Nombre del titular de la cuenta / SINPE *</label>
          <input style={S.input} value={f.titular_cuenta} onChange={ev => set('titular_cuenta', ev.target.value)} placeholder="A nombre de quién está la cuenta o el SINPE" />
        </div>
        {f.metodo === 'sinpe_movil' ? (
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={S.label}>Número SINPE Móvil * (8 dígitos)</label>
            <input style={S.input} value={f.sinpe_numero} onChange={ev => set('sinpe_numero', ev.target.value)} placeholder="88887777" inputMode="numeric" />
          </div>
        ) : (
          <>
            <div>
              <label style={S.label}>Cuenta IBAN * (CR + 20 dígitos)</label>
              <input style={S.input} value={f.iban} onChange={ev => set('iban', ev.target.value)} placeholder="CR0000000000000000000" />
            </div>
            <div>
              <label style={S.label}>Banco (opcional)</label>
              <input style={S.input} value={f.banco} onChange={ev => set('banco', ev.target.value)} placeholder="Ej. BAC, BN, BCR…" />
            </div>
          </>
        )}
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={S.label}>Notas (opcional)</label>
          <textarea style={S.textarea} value={f.notas} onChange={ev => set('notas', ev.target.value)} placeholder="Observaciones…" />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={S.label}>Recibo PDF del ERP {editando ? '(dejá vacío para conservar el actual)' : '*'}</label>
          <div style={{ border: `2px dashed ${file ? GOLD : 'rgba(0,0,0,0.15)'}`, borderRadius: 12, padding: 18, textAlign: 'center', background: 'rgba(255,255,255,0.4)' }}
            onDragOver={ev => ev.preventDefault()}
            onDrop={ev => { ev.preventDefault(); const dropped = ev.dataTransfer.files?.[0]; if (dropped) setFile(dropped) }}>
            <input id="recibo-input" type="file" accept="application/pdf" style={{ display: 'none' }} onChange={ev => setFile(ev.target.files?.[0] || null)} />
            <label htmlFor="recibo-input" style={{ cursor: 'pointer', color: file ? TEXT : MUTED, fontSize: '0.85em' }}>
              {file ? `📄 ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)` : '📎 Arrastrá el PDF acá o hacé clic para elegirlo'}
            </label>
          </div>
          {editando?.recibo_nombre && !file && <div style={{ fontSize: '0.78em', color: MUTED, marginTop: 6 }}>Actual: {editando.recibo_nombre}</div>}
        </div>
      </div>

      {error && <div style={{ color: '#dc2626', fontSize: '0.85em', marginTop: 14, fontWeight: 600 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <button style={{ ...S.btn(), opacity: enviando ? 0.6 : 1 }} disabled={enviando} onClick={guardar}>
          {enviando ? 'Guardando…' : (editando ? (editando.estado === 'rechazada' ? 'Reenviar' : 'Guardar cambios') : 'Registrar devolución')}
        </button>
        <button style={S.btnOutline} onClick={onVolver} disabled={enviando}>Cancelar</button>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
function ModalAccion({ modal, perfil, onClose, onHecho, onError }) {
  const { tipo, dev } = modal
  const [ref, setRef] = useState('')
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const destino = dev.metodo === 'sinpe_movil' ? dev.sinpe_numero : dev.iban

  async function confirmar() {
    if (tipo === 'rechazar' && motivo.trim().length < 5) { setError('El motivo debe tener al menos 5 caracteres.'); return }
    setError(''); setEnviando(true)
    try {
      const body = { accion: tipo, actor_nombre: perfil?.nombre || perfil?.email || '', actor_id: perfil?.id || '' }
      if (tipo === 'pagar') body.referencia_pago = ref.trim()
      if (tipo === 'rechazar' || tipo === 'anular') body.motivo = motivo.trim()
      const r = await fetch(`/api/devoluciones/${dev.id}/estado`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Error.')
      const msg = tipo === 'pagar' ? 'Pago confirmado.' : tipo === 'rechazar' ? 'Devolución rechazada.' : 'Devolución anulada.'
      onHecho(msg)
    } catch (ex) { setError(ex.message); setEnviando(false) }
  }

  const titulo = { pagar: 'Confirmar pago', rechazar: 'Rechazar devolución', anular: 'Anular devolución' }[tipo]
  const colorBtn = { pagar: '#22c55e', rechazar: '#ef4444', anular: '#ef4444' }[tipo]

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1500, padding: 16 }}>
      <div onClick={ev => ev.stopPropagation()} style={{ background: '#fff', borderRadius: 18, padding: '24px 26px', maxWidth: 440, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <h3 style={{ margin: '0 0 14px', fontSize: '1.15em', fontWeight: 700, fontFamily: 'Rubik, sans-serif', color: TEXT }}>{titulo}</h3>

        <div style={{ background: '#f8fafc', borderRadius: 12, padding: '14px 16px', marginBottom: 16, fontSize: '0.86em', color: TEXT, lineHeight: 1.7 }}>
          <div><b>Cliente:</b> {dev.cliente_nombre}</div>
          <div><b>Monto:</b> {fmt(dev.monto, dev.moneda)}</div>
          <div><b>Método:</b> {METODO_LABEL[dev.metodo]}</div>
          <div><b>Destino:</b> {destino}{dev.banco ? ` · ${dev.banco}` : ''}</div>
          {dev.titular_cuenta && <div><b>Titular:</b> {dev.titular_cuenta}</div>}
          {dev.motivo && <div><b>Motivo:</b> {dev.motivo}</div>}
          {dev.nota_credito && <div><b>NC:</b> {dev.nota_credito}</div>}
        </div>

        {tipo === 'pagar' && (
          <div style={{ marginBottom: 14 }}>
            <label style={S.label}>Referencia del comprobante (opcional)</label>
            <input style={S.input} value={ref} onChange={ev => setRef(ev.target.value)} placeholder="N.º de comprobante SINPE / transferencia" />
          </div>
        )}
        {(tipo === 'rechazar') && (
          <div style={{ marginBottom: 14 }}>
            <label style={S.label}>Motivo del rechazo * (mín. 5 caracteres)</label>
            <textarea style={S.textarea} value={motivo} onChange={ev => setMotivo(ev.target.value)} placeholder="Ej. cuenta IBAN incorrecta…" />
          </div>
        )}
        {tipo === 'anular' && (
          <p style={{ fontSize: '0.85em', color: MUTED, marginBottom: 14 }}>¿Seguro que querés anular esta devolución? El recibo se conserva para auditoría.</p>
        )}

        {error && <div style={{ color: '#dc2626', fontSize: '0.83em', marginBottom: 12, fontWeight: 600 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button style={S.btnOutline} onClick={onClose} disabled={enviando}>Cancelar</button>
          <button style={{ ...S.btn(colorBtn), opacity: enviando ? 0.6 : 1 }} disabled={enviando} onClick={confirmar}>
            {enviando ? '…' : (tipo === 'pagar' ? 'Confirmar pago' : tipo === 'rechazar' ? 'Rechazar' : 'Anular')}
          </button>
        </div>
      </div>
    </div>
  )
}
