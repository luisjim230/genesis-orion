'use client'
import { useAuth } from '../../lib/useAuth'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

const fmt = (n) => Number(n || 0).toLocaleString('es-CR', { style: 'currency', currency: 'CRC', minimumFractionDigits: 0, maximumFractionDigits: 0 })
const fmtNum = (n) => Number(n || 0).toLocaleString('es-CR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
const today = () => new Date().toISOString().split('T')[0]

const EMPTY_FORM = {
  fecha: today(),
  numero_caja: '',
  efectivo: '',
  tarjeta: '',
  transferencia: '',
  credito: '',
  otros: '',
  total_sistema: '',
  observaciones: '',
  incidencias: '',
}

export default function CajasAurora() {
  const { perfil } = useAuth()
  const [registros, setRegistros] = useState([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [editId, setEditId] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)
  const [filtroMes, setFiltroMes] = useState(new Date().getMonth())
  const [filtroAnio, setFiltroAnio] = useState(new Date().getFullYear())
  const [vista, setVista] = useState('lista') // 'lista' | 'form'
  const [confirm, setConfirm] = useState(null)

  const fetchRegistros = useCallback(async () => {
    setLoading(true)
    const desde = `${filtroAnio}-${String(filtroMes + 1).padStart(2,'0')}-01`
    const hasta = `${filtroAnio}-${String(filtroMes + 1).padStart(2,'0')}-31`
    const { data, error } = await supabase
      .from('cajas_aurora')
      .select('*')
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .order('fecha', { ascending: false })
    if (!error) setRegistros(data || [])
    setLoading(false)
  }, [filtroMes, filtroAnio])

  useEffect(() => { fetchRegistros() }, [fetchRegistros])

  const calcDiferencia = (f) => {
    const sumado = Number(f.efectivo||0) + Number(f.tarjeta||0) + Number(f.transferencia||0) + Number(f.credito||0) + Number(f.otros||0)
    const sistema = Number(f.total_sistema||0)
    return sistema > 0 ? sumado - sistema : 0
  }

  const totalMes = (campo) => registros.reduce((a,r) => a + Number(r[campo]||0), 0)

  const handleSave = async () => {
    if (!form.fecha) { setMsg({ tipo: 'error', texto: 'La fecha es requerida.' }); return }
    setSaving(true)
    const payload = {
      fecha: form.fecha,
      numero_caja: form.numero_caja || null,
      efectivo: Number(form.efectivo||0),
      tarjeta: Number(form.tarjeta||0),
      transferencia: Number(form.transferencia||0),
      credito: Number(form.credito||0),
      otros: Number(form.otros||0),
      total_sistema: Number(form.total_sistema||0),
      diferencia: calcDiferencia(form),
      observaciones: form.observaciones || null,
      incidencias: form.incidencias || null,
      updated_at: new Date().toISOString(),
    }
    let error
    if (editId) {
      ({ error } = await supabase.from('cajas_aurora').update(payload).eq('id', editId))
    } else {
      ({ error } = await supabase.from('cajas_aurora').insert(payload))
    }
    setSaving(false)
    if (error) { setMsg({ tipo: 'error', texto: 'Error al guardar: ' + error.message }); return }
    setMsg({ tipo: 'ok', texto: editId ? 'Registro actualizado.' : 'Registro guardado.' })
    setForm(EMPTY_FORM)
    setEditId(null)
    setVista('lista')
    fetchRegistros()
    setTimeout(() => setMsg(null), 3000)
  }

  const handleEdit = (r) => {
    setForm({
      fecha: r.fecha,
      numero_caja: r.numero_caja || '',
      efectivo: r.efectivo || '',
      tarjeta: r.tarjeta || '',
      transferencia: r.transferencia || '',
      credito: r.credito || '',
      otros: r.otros || '',
      total_sistema: r.total_sistema || '',
      observaciones: r.observaciones || '',
      incidencias: r.incidencias || '',
    })
    setEditId(r.id)
    setVista('form')
  }

  const handleDelete = async (id) => {
    const { error } = await supabase.from('cajas_aurora').delete().eq('id', id)
    if (!error) { fetchRegistros(); setConfirm(null) }
  }

  const anioOpts = []
  for (let y = 2024; y <= new Date().getFullYear() + 1; y++) anioOpts.push(y)

  const dif = calcDiferencia(form)
  const difColor = dif === 0 ? s.difOk : dif > 0 ? s.difPos : s.difNeg
  const difLabel = dif === 0 ? 'Cuadrado ✓' : dif > 0 ? `Sobrante: ${fmt(dif)}` : `Faltante: ${fmt(Math.abs(dif))}`

  return (
    <div style={s.page}>
      {/* HEADER */}
      <div style={s.header}>
        <div style={s.headerLeft}>
          <div style={s.logoCircle}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="#0f1115">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/>
            </svg>
          </div>
          <div>
            <div style={s.brandName}>Cajas Aurora</div>
            <div style={s.brandSub}>Bitácora financiera diaria</div>
          </div>
        </div>
        <div style={s.headerRight}>
          <select style={s.selMes} value={filtroMes} onChange={e => setFiltroMes(Number(e.target.value))}>
            {MESES.map((m,i) => <option key={i} value={i}>{m}</option>)}
          </select>
          <select style={s.selAnio} value={filtroAnio} onChange={e => setFiltroAnio(Number(e.target.value))}>
            {anioOpts.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          {vista === 'lista'
            ? <button style={s.btnPrimary} onClick={() => { setForm(EMPTY_FORM); setEditId(null); setVista('form') }}>+ Nuevo registro</button>
            : <button style={s.btnSecondary} onClick={() => { setVista('lista'); setEditId(null); setForm(EMPTY_FORM) }}>← Volver</button>
          }
        </div>
      </div>

      {msg && (
        <div style={msg.tipo === 'ok' ? s.msgOk : s.msgErr}>{msg.texto}</div>
      )}

      {/* RESUMEN MES */}
      {vista === 'lista' && (
        <>
          <div style={s.resumenGrid}>
            {[
              { label: 'Efectivo', val: totalMes('efectivo'), color: '#4caf7d' },
              { label: 'Tarjeta', val: totalMes('tarjeta'), color: '#5b9bd5' },
              { label: 'Transferencia', val: totalMes('transferencia'), color: '#c8a84b' },
              { label: 'Crédito', val: totalMes('credito'), color: '#e8a030' },
              { label: 'Otros', val: totalMes('otros'), color: '#8b8a85' },
              { label: 'Total mes', val: totalMes('efectivo')+totalMes('tarjeta')+totalMes('transferencia')+totalMes('credito')+totalMes('otros'), color: '#c8a84b', big: true },
            ].map((c,i) => (
              <div key={i} style={{ ...s.sumCard, ...(c.big ? s.sumCardBig : {}) }}>
                <div style={s.sumLabel}>{c.label}</div>
                <div style={{ ...s.sumVal, color: c.color }}>{fmt(c.val)}</div>
              </div>
            ))}
          </div>

          {/* LISTA */}
          <div style={s.section}>
            <div style={s.sectionTitle}>{MESES[filtroMes]} {filtroAnio} — {registros.length} registro{registros.length !== 1 ? 's' : ''}</div>
            {loading && <div style={s.loading}>Cargando...</div>}
            {!loading && registros.length === 0 && (
              <div style={s.empty}>No hay registros este mes. ¡Creá el primero!</div>
            )}
            {registros.map(r => {
              const difR = Number(r.diferencia||0)
              return (
                <div key={r.id} style={s.card}>
                  <div style={s.cardTop}>
                    <div style={s.cardFecha}>{new Date(r.fecha + 'T12:00:00').toLocaleDateString('es-CR', { weekday:'long', day:'numeric', month:'long' })}</div>
                    {r.numero_caja && <div style={s.cajaBadge}>Caja #{r.numero_caja}</div>}
                    <div style={{ ...s.difBadge, background: difR === 0 ? 'rgba(76,175,125,0.12)' : difR > 0 ? 'rgba(91,155,213,0.12)' : 'rgba(224,82,82,0.12)', color: difR === 0 ? '#4caf7d' : difR > 0 ? '#5b9bd5' : '#e05252' }}>
                      {difR === 0 ? 'Cuadrado ✓' : difR > 0 ? `+${fmt(difR)}` : fmt(difR)}
                    </div>
                  </div>
                  <div style={s.cardMontos}>
                    {r.efectivo > 0 && <div style={s.montoItem}><span style={s.montoLabel}>Efectivo</span><span style={{ ...s.montoVal, color:'#4caf7d' }}>{fmt(r.efectivo)}</span></div>}
                    {r.tarjeta > 0 && <div style={s.montoItem}><span style={s.montoLabel}>Tarjeta</span><span style={{ ...s.montoVal, color:'#5b9bd5' }}>{fmt(r.tarjeta)}</span></div>}
                    {r.transferencia > 0 && <div style={s.montoItem}><span style={s.montoLabel}>Transferencia</span><span style={{ ...s.montoVal, color:'#c8a84b' }}>{fmt(r.transferencia)}</span></div>}
                    {r.credito > 0 && <div style={s.montoItem}><span style={s.montoLabel}>Crédito</span><span style={{ ...s.montoVal, color:'#e8a030' }}>{fmt(r.credito)}</span></div>}
                    {r.otros > 0 && <div style={s.montoItem}><span style={s.montoLabel}>Otros</span><span style={{ ...s.montoVal, color:'#8b8a85' }}>{fmt(r.otros)}</span></div>}
                    <div style={{ ...s.montoItem, borderLeft: '1px solid rgba(200,168,75,0.3)', paddingLeft: 12, marginLeft: 4 }}>
                      <span style={s.montoLabel}>Sistema</span>
                      <span style={s.montoVal}>{fmt(r.total_sistema)}</span>
                    </div>
                  </div>
                  {(r.observaciones || r.incidencias) && (
                    <div style={s.cardObs}>
                      {r.observaciones && <div style={s.obsItem}><span style={s.obsLabel}>Obs:</span> {r.observaciones}</div>}
                      {r.incidencias && <div style={{ ...s.obsItem, color:'#e8a030' }}><span style={s.obsLabel}>⚠ Incidencias:</span> {r.incidencias}</div>}
                    </div>
                  )}
                  <div style={s.cardActions}>
                    <button style={s.btnEdit} onClick={() => handleEdit(r)}>Editar</button>
                    {perfil?.rol === "admin" && <button style={s.btnDel} onClick={() => setConfirm(r.id)}>Eliminar</button>}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* FORMULARIO */}
      {vista === 'form' && (
        <div style={s.formWrap}>
          <div style={s.formTitle}>{editId ? 'Editar registro' : 'Nuevo registro de caja'}</div>

          <div style={s.formGrid2}>
            <div style={s.field}>
              <label style={s.label}>Fecha *</label>
              <input style={s.input} type="date" value={form.fecha} onChange={e => setForm(f=>({...f, fecha:e.target.value}))} />
            </div>
            <div style={s.field}>
              <label style={s.label}>Número de caja</label>
              <input style={s.input} type="text" placeholder="Ej: 2964" value={form.numero_caja} onChange={e => setForm(f=>({...f, numero_caja:e.target.value}))} />
            </div>
          </div>

          <div style={s.sectionTitle}>Montos recibidos</div>
          <div style={s.formGrid3}>
            {[
              { key:'efectivo', label:'Efectivo', color:'#4caf7d' },
              { key:'tarjeta', label:'Tarjeta', color:'#5b9bd5' },
              { key:'transferencia', label:'Transferencia', color:'#c8a84b' },
              { key:'credito', label:'N. Crédito', color:'#e8a030' },
              { key:'otros', label:'Otros', color:'#8b8a85' },
            ].map(({ key, label, color }) => (
              <div key={key} style={s.field}>
                <label style={{ ...s.label, color }}>{label}</label>
                <input style={s.input} type="number" placeholder="0" value={form[key]} onChange={e => setForm(f=>({...f, [key]:e.target.value}))} />
              </div>
            ))}
          </div>

          <div style={s.sectionTitle}>Cuadre de caja</div>
          <div style={s.formGrid2}>
            <div style={s.field}>
              <label style={s.label}>Total según sistema</label>
              <input style={s.input} type="number" placeholder="0" value={form.total_sistema} onChange={e => setForm(f=>({...f, total_sistema:e.target.value}))} />
            </div>
            <div style={{ ...s.field, display:'flex', flexDirection:'column', justifyContent:'flex-end' }}>
              <div style={{ ...s.difBox, ...difColor }}>{difLabel}</div>
            </div>
          </div>

          <div style={s.sectionTitle}>Notas</div>
          <div style={s.field}>
            <label style={s.label}>Observaciones generales</label>
            <textarea style={s.textarea} rows={2} placeholder="Ej: Sobran ₡5.896 en efectivo — mal cobrado" value={form.observaciones} onChange={e => setForm(f=>({...f, observaciones:e.target.value}))} />
          </div>
          <div style={s.field}>
            <label style={{ ...s.label, color:'#e8a030' }}>Incidencias / errores de cobro</label>
            <textarea style={s.textarea} rows={3} placeholder="Ej: Marianela Borquero #52662 - efectivo ₡5000 malfact. &#10;Peraza #2634 - nulo mal fact ₡23.705" value={form.incidencias} onChange={e => setForm(f=>({...f, incidencias:e.target.value}))} />
          </div>

          <div style={s.formActions}>
            <button style={s.btnPrimary} onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando...' : editId ? 'Actualizar' : 'Guardar registro'}
            </button>
            <button style={s.btnSecondary} onClick={() => { setVista('lista'); setEditId(null); setForm(EMPTY_FORM) }}>Cancelar</button>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE */}
      {confirm && (
        <div style={s.overlay}>
          <div style={s.confirmBox}>
            <div style={s.confirmTitle}>¿Eliminar este registro?</div>
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
  selMes: { background:'#252830', border:'1px solid rgba(200,168,75,0.2)', color:'#f0ede6', padding:'7px 10px', borderRadius:8, fontSize:13, outline:'none' },
  selAnio: { background:'#252830', border:'1px solid rgba(200,168,75,0.2)', color:'#f0ede6', padding:'7px 10px', borderRadius:8, fontSize:13, outline:'none', width:80 },
  btnPrimary: { background:'#c8a84b', color:'#0f1115', border:'none', borderRadius:8, padding:'8px 18px', fontSize:13, fontWeight:700, cursor:'pointer', letterSpacing:0.5 },
  btnSecondary: { background:'transparent', color:'#8b8a85', border:'1px solid rgba(200,168,75,0.2)', borderRadius:8, padding:'8px 16px', fontSize:13, cursor:'pointer' },
  btnEdit: { background:'transparent', color:'#c8a84b', border:'1px solid rgba(200,168,75,0.3)', borderRadius:7, padding:'5px 14px', fontSize:12, cursor:'pointer' },
  btnDel: { background:'transparent', color:'#e05252', border:'1px solid rgba(224,82,82,0.25)', borderRadius:7, padding:'5px 14px', fontSize:12, cursor:'pointer' },
  btnDanger: { background:'#e05252', color:'#fff', border:'none', borderRadius:8, padding:'8px 18px', fontSize:13, fontWeight:700, cursor:'pointer' },
  msgOk: { margin:'12px 28px 0', background:'rgba(76,175,125,0.12)', border:'1px solid rgba(76,175,125,0.3)', color:'#4caf7d', borderRadius:8, padding:'10px 16px', fontSize:13 },
  msgErr: { margin:'12px 28px 0', background:'rgba(224,82,82,0.1)', border:'1px solid rgba(224,82,82,0.3)', color:'#e05252', borderRadius:8, padding:'10px 16px', fontSize:13 },
  resumenGrid: { display:'grid', gridTemplateColumns:'repeat(6, 1fr)', gap:10, padding:'20px 28px 0' },
  sumCard: { background:'#1c1f26', border:'1px solid rgba(200,168,75,0.15)', borderRadius:10, padding:'12px 14px' },
  sumCardBig: { background:'#1a1e27', border:'1px solid rgba(200,168,75,0.3)' },
  sumLabel: { fontSize:10, color:'#8b8a85', letterSpacing:0.8, textTransform:'uppercase', marginBottom:4 },
  sumVal: { fontSize:15, fontWeight:700 },
  section: { padding:'20px 28px 0' },
  sectionTitle: { fontSize:11, color:'#8b8a85', textTransform:'uppercase', letterSpacing:1, marginBottom:12, marginTop:20 },
  loading: { color:'#8b8a85', fontSize:14, padding:'20px 0' },
  empty: { color:'#8b8a85', fontSize:14, padding:'30px 0', textAlign:'center' },
  card: { background:'#1c1f26', border:'1px solid rgba(200,168,75,0.15)', borderRadius:12, padding:'16px 18px', marginBottom:12 },
  cardTop: { display:'flex', alignItems:'center', gap:10, marginBottom:12, flexWrap:'wrap' },
  cardFecha: { fontSize:14, fontWeight:600, color:'#f0ede6', flex:1 },
  cajaBadge: { fontSize:11, background:'rgba(200,168,75,0.12)', color:'#c8a84b', borderRadius:20, padding:'3px 10px', letterSpacing:0.5 },
  difBadge: { fontSize:11, borderRadius:20, padding:'3px 10px', fontWeight:600 },
  cardMontos: { display:'flex', gap:16, flexWrap:'wrap', marginBottom:10 },
  montoItem: { display:'flex', flexDirection:'column', gap:2 },
  montoLabel: { fontSize:10, color:'#8b8a85', letterSpacing:0.5 },
  montoVal: { fontSize:14, fontWeight:600, color:'#f0ede6' },
  cardObs: { background:'rgba(255,255,255,0.03)', borderRadius:8, padding:'10px 12px', marginBottom:10 },
  obsItem: { fontSize:12, color:'#8b8a85', lineHeight:1.6 },
  obsLabel: { fontWeight:600, marginRight:4 },
  cardActions: { display:'flex', gap:8, justifyContent:'flex-end' },
  formWrap: { padding:'24px 28px' },
  formTitle: { fontSize:17, fontWeight:700, color:'#c8a84b', marginBottom:20 },
  formGrid2: { display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:4 },
  formGrid3: { display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap:12, marginBottom:4 },
  field: { marginBottom:14 },
  label: { display:'block', fontSize:11, color:'#8b8a85', letterSpacing:0.5, marginBottom:5 },
  input: { width:'100%', background:'#1c1f26', border:'1px solid rgba(200,168,75,0.2)', borderRadius:8, color:'#f0ede6', padding:'9px 12px', fontSize:13, outline:'none', boxSizing:'border-box' },
  textarea: { width:'100%', background:'#1c1f26', border:'1px solid rgba(200,168,75,0.2)', borderRadius:8, color:'#f0ede6', padding:'9px 12px', fontSize:13, outline:'none', resize:'vertical', fontFamily:'sans-serif', boxSizing:'border-box' },
  difBox: { borderRadius:10, padding:'11px 16px', fontSize:14, fontWeight:700, textAlign:'center', marginTop:6 },
  difOk: { background:'rgba(76,175,125,0.12)', color:'#4caf7d', border:'1px solid rgba(76,175,125,0.25)' },
  difPos: { background:'rgba(91,155,213,0.12)', color:'#5b9bd5', border:'1px solid rgba(91,155,213,0.25)' },
  difNeg: { background:'rgba(224,82,82,0.1)', color:'#e05252', border:'1px solid rgba(224,82,82,0.25)' },
  formActions: { display:'flex', gap:12, marginTop:24 },
  overlay: { position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 },
  confirmBox: { background:'#1c1f26', border:'1px solid rgba(200,168,75,0.3)', borderRadius:14, padding:'28px 32px', maxWidth:340, width:'90%' },
  confirmTitle: { fontSize:16, fontWeight:700, color:'#f0ede6', marginBottom:8 },
  confirmSub: { fontSize:13, color:'#8b8a85', marginBottom:20 },
  confirmActions: { display:'flex', gap:10 },
}
