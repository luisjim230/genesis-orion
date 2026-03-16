'use client'
import { useAuth } from '../../lib/useAuth'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const ESTADOS = [
  { val: 'pendiente',         label: 'Pendiente',                  color: '#8b8a85' },
  { val: 'entregado_ok',      label: 'Entregado — Todo bien',       color: '#4caf7d' },
  { val: 'entregado_dev',     label: 'Entregado — Dev. producto',   color: '#e8a030' },
  { val: 'entregado_falta',   label: 'Entregado — Faltó producto',  color: '#e05252' },
  { val: 'entregado_parcial', label: 'Entrega parcial',             color: '#5b9bd5' },
]
const FORMAS_PAGO = ['Efectivo','Transferencia','Tarjeta','Crédito','Pendiente','Sin cobro']

const fmt = (n) => Number(n||0).toLocaleString('es-CR',{style:'currency',currency:'CRC',minimumFractionDigits:0,maximumFractionDigits:0})
const today = () => new Date().toISOString().split('T')[0]

const estadoInfo = (val) => ESTADOS.find(e => e.val === val) || ESTADOS[0]

const EMPTY_FORM = {
  fecha: today(),
  numero_factura: '',
  nombre_cliente: '',
  lugar_entrega: '',
  estado: 'pendiente',
  chofer: '',
  monto_cobrar: '',
  forma_pago: '',
  monto_cobrado: '',
  saldo_pendiente: '',
  facturador: '',
  observaciones: '',
  responsable_problema: '',
}

export default function EntregasTrazabilidad() {
  const { perfil } = useAuth()
  const [registros, setRegistros] = useState([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [editId, setEditId] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)
  const [filtroMes, setFiltroMes] = useState(new Date().getMonth())
  const [filtroAnio, setFiltroAnio] = useState(new Date().getFullYear())
  const [filtroEstado, setFiltroEstado] = useState('todos')
  const [pagina, setPagina] = useState(1)
  const [busqueda, setBusqueda] = useState('')
  const [vista, setVista] = useState('lista')
  const [confirm, setConfirm] = useState(null)
  const [expandido, setExpandido] = useState(null)

  const fetchRegistros = useCallback(async () => {
    setLoading(true)
    const desde = `${filtroAnio}-${String(filtroMes+1).padStart(2,'0')}-01`
    const hasta = `${filtroAnio}-${String(filtroMes+1).padStart(2,'0')}-31`
    const { data, error } = await supabase
      .from('entregas_trazabilidad')
      .select('*')
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .order('fecha', { ascending: false })
    if (!error) setRegistros(data || [])
    setLoading(false)
  }, [filtroMes, filtroAnio])

  useEffect(() => { fetchRegistros() }, [fetchRegistros])

  const registrosFiltrados = registros.filter(r => {
    const matchEstado = filtroEstado === 'todos' || r.estado === filtroEstado
    const q = busqueda.toLowerCase()
    const matchBusq = !q || r.nombre_cliente?.toLowerCase().includes(q) || r.numero_factura?.toLowerCase().includes(q) || r.chofer?.toLowerCase().includes(q) || r.facturador?.toLowerCase().includes(q) || r.lugar_entrega?.toLowerCase().includes(q)
    return matchEstado && matchBusq
  })

  const calcSaldo = (f) => {
    const cobrar = Number(f.monto_cobrar||0)
    const cobrado = Number(f.monto_cobrado||0)
    return cobrar - cobrado
  }

  const handleSave = async () => {
    if (!form.nombre_cliente) { setMsg({tipo:'error',texto:'El nombre del cliente es requerido.'}); return }
    setSaving(true)
    const saldo = calcSaldo(form)
    const payload = {
      fecha: form.fecha,
      numero_factura: form.numero_factura || null,
      nombre_cliente: form.nombre_cliente,
      lugar_entrega: form.lugar_entrega || null,
      estado: form.estado,
      chofer: form.chofer || null,
      monto_cobrar: Number(form.monto_cobrar||0),
      forma_pago: form.forma_pago || null,
      monto_cobrado: Number(form.monto_cobrado||0),
      saldo_pendiente: saldo,
      facturador: form.facturador || null,
      observaciones: form.observaciones || null,
        responsable_problema: form.responsable_problema || null,
      updated_at: new Date().toISOString(),
    }
    let error
    if (editId) {
      ({ error } = await supabase.from('entregas_trazabilidad').update(payload).eq('id', editId))
    } else {
      ({ error } = await supabase.from('entregas_trazabilidad').insert(payload))
    }
    setSaving(false)
    if (error) { setMsg({tipo:'error',texto:'Error: '+error.message}); return }
    setMsg({tipo:'ok',texto: editId ? 'Entrega actualizada.' : 'Entrega registrada.'})
    setForm(EMPTY_FORM); setEditId(null); setVista('lista')
    fetchRegistros()
    setTimeout(() => setMsg(null), 3000)
  }

  const handleEdit = (r) => {
    setForm({
      fecha: r.fecha,
      numero_factura: r.numero_factura || '',
      nombre_cliente: r.nombre_cliente || '',
      lugar_entrega: r.lugar_entrega || '',
      estado: r.estado || 'pendiente',
      chofer: r.chofer || '',
      monto_cobrar: r.monto_cobrar || '',
      forma_pago: r.forma_pago || '',
      monto_cobrado: r.monto_cobrado || '',
      saldo_pendiente: r.saldo_pendiente || '',
      facturador: r.facturador || '',
      observaciones: r.observaciones || '',
      responsable_problema: r.responsable_problema || '',
    })
    setEditId(r.id); setVista('form')
  }

  const handleDelete = async (id) => {
    const { error } = await supabase.from('entregas_trazabilidad').delete().eq('id', id)
    if (!error) { fetchRegistros(); setConfirm(null) }
  }

  const anioOpts = []
  for (let y = 2024; y <= new Date().getFullYear()+1; y++) anioOpts.push(y)

  const totCobrar = registrosFiltrados.reduce((a,r) => a+Number(r.monto_cobrar||0), 0)
  const totCobrado = registrosFiltrados.reduce((a,r) => a+Number(r.monto_cobrado||0), 0)
  const totSaldo = registrosFiltrados.reduce((a,r) => a+Number(r.saldo_pendiente||0), 0)
  const cntPendiente = registrosFiltrados.filter(r => r.estado === 'pendiente').length

  const saldoForm = calcSaldo(form)

  return (
    <div style={s.page}>
      {/* HEADER */}
      <div style={s.header}>
        <div style={s.headerLeft}>
          <div style={s.logoCircle}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="#0f1115">
              <path d="M20 8h-3V4H3c-1.1 0-2 .9-2 2v11h2c0 1.66 1.34 3 3 3s3-1.34 3-3h6c0 1.66 1.34 3 3 3s3-1.34 3-3h2v-5l-3-4zm-.5 1.5 1.96 2.5H17V9.5h2.5zM6 18c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm2.22-3c-.55-.61-1.33-1-2.22-1s-1.67.39-2.22 1H3V6h12v9H8.22zM18 18c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z"/>
            </svg>
          </div>
          <div>
            <div style={s.brandName}>Entregas · Trazabilidad</div>
            <div style={s.brandSub}>Módulo Transportes</div>
          </div>
        </div>
        <div style={s.headerRight}>
          <select style={s.sel} value={filtroMes} onChange={e => setFiltroMes(Number(e.target.value))}>
            {MESES.map((m,i) => <option key={i} value={i}>{m}</option>)}
          </select>
          <select style={{ ...s.sel, width:80 }} value={filtroAnio} onChange={e => setFiltroAnio(Number(e.target.value))}>
            {anioOpts.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          {vista === 'lista'
            ? <button style={s.btnPrimary} onClick={() => { setForm(EMPTY_FORM); setEditId(null); setVista('form') }}>+ Nueva entrega</button>
            : <button style={s.btnSecondary} onClick={() => { setVista('lista'); setEditId(null); setForm(EMPTY_FORM) }}>← Volver</button>
          }
        </div>
      </div>

      {msg && <div style={msg.tipo==='ok' ? s.msgOk : s.msgErr}>{msg.texto}</div>}

      {vista === 'lista' && (
        <>
          {/* RESUMEN */}
          <div style={s.resumenGrid}>
            <div style={s.sumCard}><div style={s.sumLabel}>Por cobrar</div><div style={{ ...s.sumVal, color:'#c8a84b' }}>{fmt(totCobrar)}</div></div>
            <div style={s.sumCard}><div style={s.sumLabel}>Cobrado</div><div style={{ ...s.sumVal, color:'#4caf7d' }}>{fmt(totCobrado)}</div></div>
            <div style={{ ...s.sumCard, ...(totSaldo > 0 ? { border:'1px solid rgba(224,82,82,0.3)' } : {}) }}>
              <div style={s.sumLabel}>Saldo pendiente</div>
              <div style={{ ...s.sumVal, color: totSaldo > 0 ? '#e05252' : '#4caf7d' }}>{fmt(totSaldo)}</div>
            </div>
            <div style={s.sumCard}><div style={s.sumLabel}>Entregas</div><div style={{ ...s.sumVal, color:'#f0ede6' }}>{registrosFiltrados.length}</div></div>
            {cntPendiente > 0 && (
              <div style={{ ...s.sumCard, border:'1px solid rgba(232,160,48,0.3)' }}>
                <div style={s.sumLabel}>Pendientes</div>
                <div style={{ ...s.sumVal, color:'#e8a030' }}>{cntPendiente}</div>
              </div>
            )}
          </div>

          {/* FILTROS */}
          <div style={s.filtros}>
            <input style={s.busq} type="text" placeholder="Buscar cliente, factura, chofer..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
            <div style={s.estadoFiltros}>
              <button style={{ ...s.fBtn, ...(filtroEstado==='todos' ? s.fBtnActive : {}) }} onClick={() => setFiltroEstado('todos')}>Todos</button>
              {ESTADOS.map(e => (
                <button key={e.val} style={{ ...s.fBtn, ...(filtroEstado===e.val ? { ...s.fBtnActive, borderColor: e.color, color: e.color } : {}) }} onClick={() => setFiltroEstado(e.val)}>
                  {e.label}
                </button>
              ))}
            </div>
          </div>

          {/* LISTA */}
          <div style={s.section}>
            {loading && <div style={s.loading}>Cargando...</div>}
            {!loading && registrosFiltrados.length === 0 && (
              <div style={s.empty}>No hay entregas que coincidan con los filtros.</div>
            )}
            {registrosFiltrados.slice((pagina-1)*20, pagina*20).map(r => {
              const est = estadoInfo(r.estado)
              const isExp = expandido === r.id
              const saldo = Number(r.saldo_pendiente||0)
              return (
                <div key={r.id} style={{ ...s.card, borderLeft:`3px solid ${est.color}` }}>
                  <div style={s.cardHeader} onClick={() => setExpandido(isExp ? null : r.id)}>
                    <div style={s.cardLeft}>
                      <div style={s.cardFecha}>{new Date(r.fecha+'T12:00:00').toLocaleDateString('es-CR',{day:'numeric',month:'short'})}</div>
                      <div>
                        <div style={s.cardCliente}>{r.nombre_cliente}</div>
                        <div style={s.cardSub}>
                          {r.numero_factura && <span style={s.factBadge}>#{r.numero_factura}</span>}
                          {r.lugar_entrega && <span style={s.lugarText}>{r.lugar_entrega}</span>}
                          {r.chofer && <span style={s.choferText}>· {r.chofer}</span>}
                        </div>
                      </div>
                    </div>
                    <div style={s.cardRight}>
                      <div style={{ ...s.estBadge, background: est.color+'22', color: est.color }}>{est.label}</div>
                      {saldo > 0 && <div style={s.saldoBadge}>Saldo: {fmt(saldo)}</div>}
                      <div style={s.factuBadge}>{r.facturador}</div>
                      <span style={s.expandIcon}>{isExp ? '▲' : '▼'}</span>
                    </div>
                  </div>

                  {isExp && (
                    <div style={s.cardDetail}>
                      <div style={s.detailGrid}>
                        <div style={s.detItem}><span style={s.detLabel}>Por cobrar</span><span style={s.detVal}>{fmt(r.monto_cobrar)}</span></div>
                        <div style={s.detItem}><span style={s.detLabel}>Forma pago</span><span style={s.detVal}>{r.forma_pago || '—'}</span></div>
                        <div style={s.detItem}><span style={s.detLabel}>Cobrado</span><span style={{ ...s.detVal, color:'#4caf7d' }}>{fmt(r.monto_cobrado)}</span></div>
                        <div style={s.detItem}><span style={s.detLabel}>Saldo</span><span style={{ ...s.detVal, color: saldo > 0 ? '#e05252' : '#4caf7d' }}>{fmt(saldo)}</span></div>
                        <div style={s.detItem}><span style={s.detLabel}>Facturador</span><span style={s.detVal}>{r.facturador || '—'}</span></div>
                        <div style={s.detItem}><span style={s.detLabel}>Chofer</span><span style={s.detVal}>{r.chofer || '—'}</span></div>
                        {r.responsable_problema && <div style={s.detItem}><span style={s.detLabel}>Responsable</span><span style={{...s.detVal,color:'#e05252',fontWeight:600}}>{r.responsable_problema}</span></div>}
                      </div>
                      {r.observaciones && (
                        <div style={s.detObs}><span style={s.detLabel}>Observaciones: </span>{r.observaciones}</div>
                      )}
                      <div style={s.detActions}>
                        <button style={s.btnEdit} onClick={() => handleEdit(r)}>Editar</button>
                        {perfil?.rol === "admin" && <button style={s.btnDel} onClick={() => setConfirm(r.id)}>Eliminar</button>}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
            {registrosFiltrados.length > 20 && (
              <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:16,padding:'24px 0'}}>
                <button onClick={()=>setPagina(p=>Math.max(1,p-1))} disabled={pagina===1} style={{padding:'8px 20px',borderRadius:8,border:'1px solid #EAE0E0',background:pagina===1?'#f5f0f0':'#fff',color:pagina===1?'#ccc':'#5E2733',cursor:pagina===1?'default':'pointer',fontWeight:600,fontSize:'0.88rem'}}>← Anterior</button>
                <span style={{fontSize:'0.85rem',color:'#8a7070'}}>Página {pagina} de {Math.ceil(registrosFiltrados.length/20)}</span>
                <button onClick={()=>setPagina(p=>Math.min(Math.ceil(registrosFiltrados.length/20),p+1))} disabled={pagina===Math.ceil(registrosFiltrados.length/20)} style={{padding:'8px 20px',borderRadius:8,border:'1px solid #EAE0E0',background:pagina===Math.ceil(registrosFiltrados.length/20)?'#f5f0f0':'#fff',color:pagina===Math.ceil(registrosFiltrados.length/20)?'#ccc':'#5E2733',cursor:pagina===Math.ceil(registrosFiltrados.length/20)?'default':'pointer',fontWeight:600,fontSize:'0.88rem'}}>Siguiente →</button>
              </div>
            )}
          </div>
        </>
      )}

      {/* FORMULARIO */}
      {vista === 'form' && (
        <div style={s.formWrap}>
          <div style={s.formTitle}>{editId ? 'Editar entrega' : 'Nueva entrega'}</div>

          <div style={s.formGrid3}>
            <div style={s.field}><label style={s.label}>Fecha *</label><input style={s.input} type="date" value={form.fecha} onChange={e => setForm(f=>({...f,fecha:e.target.value}))} /></div>
            <div style={s.field}><label style={s.label}>N° Factura</label><input style={s.input} type="text" placeholder="Ej: 89847" value={form.numero_factura} onChange={e => setForm(f=>({...f,numero_factura:e.target.value}))} /></div>
            <div style={s.field}><label style={s.label}>Facturador / Vendedor</label><input style={s.input} type="text" placeholder="Ej: PAMELA" value={form.facturador} onChange={e => setForm(f=>({...f,facturador:e.target.value}))} /></div>
          </div>

          <div style={s.formGrid2}>
            <div style={s.field}><label style={s.label}>Nombre del cliente *</label><input style={s.input} type="text" placeholder="Nombre completo" value={form.nombre_cliente} onChange={e => setForm(f=>({...f,nombre_cliente:e.target.value}))} /></div>
            <div style={s.field}><label style={s.label}>Lugar de entrega</label><input style={s.input} type="text" placeholder="Ej: EL NAZARENO, CAJETA..." value={form.lugar_entrega} onChange={e => setForm(f=>({...f,lugar_entrega:e.target.value}))} /></div>
          </div>

          <div style={s.formGrid2}>
            <div style={s.field}>
              <label style={s.label}>Estado de la entrega</label>
              <select style={s.input} value={form.estado} onChange={e => setForm(f=>({...f,estado:e.target.value}))}>
                {ESTADOS.map(e => <option key={e.val} value={e.val}>{e.label}</option>)}
              </select>
            </div>
            <div style={s.field}><label style={s.label}>Chofer</label><input style={s.input} type="text" placeholder="Ej: OLMAN, DYLAN..." value={form.chofer} onChange={e => setForm(f=>({...f,chofer:e.target.value}))} /></div>
          </div>

          <div style={s.sectionTitle}>Cobro</div>
          <div style={s.formGrid3}>
            {form.estado !== 'pendiente' && form.estado !== 'entregado_ok' && (
              <div style={s.field}><label style={s.label}>Responsable del problema</label><select style={s.input} value={form.responsable_problema} onChange={e => setForm(f=>({...f,responsable_problema:e.target.value}))}><option value=''>— Seleccionar —</option><option>Chofer</option><option>Bodega / Despacho</option><option>Facturador</option><option>Cliente</option><option>Otro</option></select></div>
            )}
            <div style={s.field}>
              <label style={s.label}>¿Hay cobro pendiente?</label>
              <div style={{display:'flex',gap:8}}>
                <button type="button" onClick={()=>setForm(f=>({...f,monto_cobrar:'',_hay_cobro:false,forma_pago:'Sin cobro'}))} style={{flex:1,padding:'8px 0',borderRadius:8,border:'none',cursor:'pointer',fontWeight:600,fontSize:13,background:form._hay_cobro===false?'#c8a84b':'rgba(255,255,255,0.08)',color:form._hay_cobro===false?'#0f1115':'#eee',transition:'all 0.2s'}}>✅ Ya cancelado</button>
                <button type="button" onClick={()=>setForm(f=>({...f,_hay_cobro:true,forma_pago:''}))} style={{flex:1,padding:'8px 0',borderRadius:8,border:'none',cursor:'pointer',fontWeight:600,fontSize:13,background:form._hay_cobro===true?'#e05252':'rgba(255,255,255,0.08)',color:form._hay_cobro===true?'#fff':'#eee',transition:'all 0.2s'}}>💰 Sí, hay cobro</button>
              </div>
            </div>
            {form._hay_cobro===true && (
              <div style={s.field}><label style={s.label}>Monto a cobrar</label><input style={s.input} type="number" placeholder="0" value={form.monto_cobrar} onChange={e => setForm(f=>({...f,monto_cobrar:e.target.value}))} autoFocus /></div>
            )}
            <div style={s.field}>
              <label style={s.label}>Forma de pago</label>
              <select style={s.input} value={form.forma_pago} onChange={e => setForm(f=>({...f,forma_pago:e.target.value}))}>
                <option value="">— Seleccionar —</option>
                {FORMAS_PAGO.map(fp => <option key={fp} value={fp}>{fp}</option>)}
              </select>
            </div>
            <div style={s.field}><label style={s.label}>Monto cobrado</label><input style={s.input} type="number" placeholder="0" value={form.monto_cobrado} onChange={e => setForm(f=>({...f,monto_cobrado:e.target.value}))} /></div>
          </div>

          {(form.monto_cobrar || form.monto_cobrado) && (
            <div style={{ ...s.difBox, ...(saldoForm <= 0 ? s.difOk : s.difNeg) }}>
              {saldoForm <= 0 ? 'Cobro completo ✓' : `Saldo pendiente: ${fmt(saldoForm)}`}
            </div>
          )}

          <div style={s.field}>
            <label style={s.label}>Observaciones</label>
            <textarea style={s.textarea} rows={3} placeholder="Notas sobre la entrega, devoluciones, acuerdos especiales..." value={form.observaciones} onChange={e => setForm(f=>({...f,observaciones:e.target.value}))} />
          </div>

          <div style={s.formActions}>
            <button style={s.btnPrimary} onClick={handleSave} disabled={saving}>{saving ? 'Guardando...' : editId ? 'Actualizar' : 'Guardar entrega'}</button>
            <button style={s.btnSecondary} onClick={() => { setVista('lista'); setEditId(null); setForm(EMPTY_FORM) }}>Cancelar</button>
          </div>
        </div>
      )}

      {confirm && (
        <div style={s.overlay}>
          <div style={s.confirmBox}>
            <div style={s.confirmTitle}>¿Eliminar esta entrega?</div>
            <div style={s.confirmSub}>Esta acción no se puede deshacer.</div>
            <div style={s.confirmActions}>
              <button style={s.btnDanger} onClick={() => handleDelete(confirm)}>Sí, eliminar</button>
              <button style={s.btnSecondary} onClick={() => setConfirm(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const s = {
  page: { background:'#FDF4F4', minHeight:'100vh', color:'#1a1a1a', fontFamily:'sans-serif', padding:'0 0 40px' },
  header: { background:'#5E2733', borderBottom:'1px solid rgba(200,168,75,0.18)', padding:'16px 28px', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12 },
  headerLeft: { display:'flex', alignItems:'center', gap:12 },
  logoCircle: { width:36, height:36, background:'#c8a84b', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center' },
  brandName: { fontSize:18, fontWeight:700, color:'#c8a84b', letterSpacing:1 },
  brandSub: { fontSize:11, color:'#8b8a85', letterSpacing:0.5, marginTop:1 },
  headerRight: { display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' },
  sel: { background:'#252830', border:'1px solid rgba(200,168,75,0.2)', color:'#f0ede6', padding:'7px 10px', borderRadius:8, fontSize:13, outline:'none' },
  btnPrimary: { background:'#c8a84b', color:'#0f1115', border:'none', borderRadius:8, padding:'8px 18px', fontSize:13, fontWeight:700, cursor:'pointer' },
  btnSecondary: { background:'transparent', color:'#8b8a85', border:'1px solid rgba(200,168,75,0.2)', borderRadius:8, padding:'8px 16px', fontSize:13, cursor:'pointer' },
  btnEdit: { background:'transparent', color:'#c8a84b', border:'1px solid rgba(200,168,75,0.3)', borderRadius:7, padding:'5px 14px', fontSize:12, cursor:'pointer' },
  btnDel: { background:'transparent', color:'#e05252', border:'1px solid rgba(224,82,82,0.25)', borderRadius:7, padding:'5px 14px', fontSize:12, cursor:'pointer' },
  btnDanger: { background:'#e05252', color:'#fff', border:'none', borderRadius:8, padding:'8px 18px', fontSize:13, fontWeight:700, cursor:'pointer' },
  msgOk: { margin:'12px 28px 0', background:'rgba(76,175,125,0.12)', border:'1px solid rgba(76,175,125,0.3)', color:'#4caf7d', borderRadius:8, padding:'10px 16px', fontSize:13 },
  msgErr: { margin:'12px 28px 0', background:'rgba(224,82,82,0.1)', border:'1px solid rgba(224,82,82,0.3)', color:'#e05252', borderRadius:8, padding:'10px 16px', fontSize:13 },
  resumenGrid: { display:'flex', gap:10, padding:'20px 28px 0', flexWrap:'wrap' },
  sumCard: { background:'#1c1f26', border:'1px solid rgba(200,168,75,0.15)', borderRadius:10, padding:'12px 16px', minWidth:130 },
  sumLabel: { fontSize:10, color:'#8b8a85', letterSpacing:0.8, textTransform:'uppercase', marginBottom:4 },
  sumVal: { fontSize:16, fontWeight:700 },
  filtros: { padding:'16px 28px 0' },
  busq: { width:'100%', background:'#1c1f26', border:'1px solid rgba(200,168,75,0.2)', borderRadius:9, color:'#f0ede6', padding:'9px 14px', fontSize:13, outline:'none', marginBottom:10, boxSizing:'border-box' },
  estadoFiltros: { display:'flex', gap:8, flexWrap:'wrap' },
  fBtn: { background:'transparent', border:'1px solid rgba(200,168,75,0.2)', color:'#8b8a85', borderRadius:20, padding:'5px 14px', fontSize:11, cursor:'pointer' },
  fBtnActive: { background:'rgba(200,168,75,0.1)', borderColor:'#c8a84b', color:'#c8a84b' },
  section: { padding:'16px 28px 0' },
  loading: { color:'#8b8a85', fontSize:14, padding:'20px 0' },
  empty: { color:'#8b8a85', fontSize:14, padding:'30px 0', textAlign:'center' },
  card: { background:'#1c1f26', border:'1px solid rgba(200,168,75,0.12)', borderRadius:11, marginBottom:9, overflow:'hidden' },
  cardHeader: { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'13px 16px', cursor:'pointer', gap:12 },
  cardLeft: { display:'flex', alignItems:'center', gap:14, flex:1, minWidth:0 },
  cardFecha: { fontSize:12, color:'#8b8a85', minWidth:36, textAlign:'center', lineHeight:1.3 },
  cardCliente: { fontSize:14, fontWeight:600, color:'#f0ede6' },
  cardSub: { display:'flex', alignItems:'center', gap:6, marginTop:2, flexWrap:'wrap' },
  factBadge: { fontSize:11, background:'rgba(200,168,75,0.12)', color:'#c8a84b', borderRadius:4, padding:'1px 7px' },
  lugarText: { fontSize:11, color:'#8b8a85' },
  choferText: { fontSize:11, color:'#8b8a85' },
  cardRight: { display:'flex', alignItems:'center', gap:8, flexShrink:0, flexWrap:'wrap' },
  estBadge: { fontSize:11, borderRadius:20, padding:'3px 10px', fontWeight:600 },
  saldoBadge: { fontSize:11, background:'rgba(224,82,82,0.1)', color:'#e05252', borderRadius:20, padding:'3px 10px' },
  factuBadge: { fontSize:11, color:'#8b8a85' },
  expandIcon: { fontSize:10, color:'#8b8a85' },
  cardDetail: { borderTop:'1px solid rgba(200,168,75,0.1)', padding:'14px 16px' },
  detailGrid: { display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:10 },
  detItem: { display:'flex', flexDirection:'column', gap:2 },
  detLabel: { fontSize:10, color:'#8b8a85', letterSpacing:0.5 },
  detVal: { fontSize:13, fontWeight:600, color:'#f0ede6' },
  detObs: { fontSize:12, color:'#8b8a85', background:'rgba(255,255,255,0.03)', borderRadius:7, padding:'8px 10px', marginBottom:10, lineHeight:1.5 },
  detActions: { display:'flex', gap:8, justifyContent:'flex-end' },
  formWrap: { padding:'24px 28px' },
  formTitle: { fontSize:17, fontWeight:700, color:'#c8a84b', marginBottom:20 },
  formGrid2: { display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:4 },
  formGrid3: { display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:4 },
  field: { marginBottom:14 },
  label: { display:'block', fontSize:11, color:'#8b8a85', letterSpacing:0.5, marginBottom:5 },
  input: { width:'100%', background:'#1c1f26', border:'1px solid rgba(200,168,75,0.2)', borderRadius:8, color:'#f0ede6', padding:'9px 12px', fontSize:13, outline:'none', boxSizing:'border-box' },
  textarea: { width:'100%', background:'#1c1f26', border:'1px solid rgba(200,168,75,0.2)', borderRadius:8, color:'#f0ede6', padding:'9px 12px', fontSize:13, outline:'none', resize:'vertical', fontFamily:'sans-serif', boxSizing:'border-box' },
  sectionTitle: { fontSize:11, color:'#8b8a85', textTransform:'uppercase', letterSpacing:1, marginBottom:12, marginTop:8 },
  difBox: { borderRadius:9, padding:'10px 16px', fontSize:13, fontWeight:700, marginBottom:14 },
  difOk: { background:'rgba(76,175,125,0.1)', color:'#4caf7d', border:'1px solid rgba(76,175,125,0.25)' },
  difNeg: { background:'rgba(224,82,82,0.08)', color:'#e05252', border:'1px solid rgba(224,82,82,0.25)' },
  formActions: { display:'flex', gap:12, marginTop:8 },
  overlay: { position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 },
  confirmBox: { background:'#1c1f26', border:'1px solid rgba(200,168,75,0.3)', borderRadius:14, padding:'28px 32px', maxWidth:340, width:'90%' },
  confirmTitle: { fontSize:16, fontWeight:700, color:'#f0ede6', marginBottom:8 },
  confirmSub: { fontSize:13, color:'#8b8a85', marginBottom:20 },
  confirmActions: { display:'flex', gap:10 },
}
