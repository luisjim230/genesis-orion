'use client'
import { useAuth } from '../../lib/useAuth'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import PlanificacionDiaria from './PlanificacionDiaria'

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

// Parsear montos al estilo CR: "144.590" = 144590, "4.920.502" = 4920502, "144,60" = 144.60
const parseMontoCR = (val) => {
  if (!val && val !== 0) return 0
  const s = String(val).trim().replace(/[₡\s]/g, '')
  if (!s) return 0
  // Si tiene coma, la coma es decimal (ej: "144,60")
  if (s.includes(',')) {
    const clean = s.replace(/\./g, '').replace(',', '.')
    return Number(clean) || 0
  }
  // Si tiene múltiples puntos, son separadores de miles (ej: "4.920.502")
  const dotCount = (s.match(/\./g) || []).length
  if (dotCount > 1) return Number(s.replace(/\./g, '')) || 0
  // Si tiene un solo punto: si hay exactamente 3 dígitos después, es separador de miles
  if (dotCount === 1) {
    const parts = s.split('.')
    if (parts[1].length === 3) return Number(s.replace('.', '')) || 0
    // Si no, es decimal normal
    return Number(s) || 0
  }
  return Number(s) || 0
}
const fmt = (n) => {
  const num = Number(n || 0)
  return '₡' + Math.round(num).toLocaleString('es-CR')
}
const fmtNum = (n) => Math.round(Number(n || 0)).toLocaleString('es-CR')
const today = () => new Date().toISOString().split('T')[0]

const TURNOS = ['Turno 1', 'Turno 2', 'Turno 3']

// Encode turno + cajera into the observaciones field (no new DB columns needed)
const META_RE = /^META:t=([^;]+);c=([^\n]*)\n?/
const withMeta = (turno, cajera, obs) => `META:t=${turno};c=${cajera || ''}\n${obs || ''}`
const parseMeta = (raw) => {
  if (!raw) return { turno: 'Turno 1', cajera: null, obs: '' }
  const m = raw.match(META_RE)
  if (!m) return { turno: 'Turno 1', cajera: null, obs: raw }
  return { turno: m[1], cajera: m[2] || null, obs: raw.slice(m[0].length) }
}

const EMPTY_FORM = {
  fecha: today(),
  turno: 'Turno 1',
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
  const cajera = perfil?.nombre || perfil?.username || null
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
  const [seccion, setSeccion] = useState('caja') // 'caja' | 'planificacion'

  const fetchRegistros = useCallback(async () => {
    if (!cajera) return
    setLoading(true)
    const desde = `${filtroAnio}-${String(filtroMes + 1).padStart(2,'0')}-01`
    // Primer día del mes siguiente (evita fechas inválidas tipo "2026-04-31")
    const nextMes  = filtroMes === 11 ? 0 : filtroMes + 1
    const nextAnio = filtroMes === 11 ? filtroAnio + 1 : filtroAnio
    const hasta = `${nextAnio}-${String(nextMes + 1).padStart(2,'0')}-01`
    const { data, error } = await supabase
      .from('cajas_aurora')
      .select('*')
      .gte('fecha', desde)
      .lt('fecha', hasta)
      .order('fecha', { ascending: false })
    if (!error) {
      // Parse meta prefix from each record, then filter by cajera client-side
      const processed = (data || [])
        .map(r => {
          const meta = parseMeta(r.observaciones)
          // Legacy records (no META prefix) have cajera=null → belong to Laura
          return { ...r, _turno: meta.turno, _cajera: meta.cajera, _obs: meta.obs }
        })
        .filter(r => {
          if (r._cajera === cajera) return true        // own new record
          if (!r._cajera && cajera === 'Laura') return true  // legacy record → Laura
          return false
        })
      // Sort: fecha DESC, then turno ASC
      processed.sort((a, b) => {
        if (a.fecha !== b.fecha) return b.fecha.localeCompare(a.fecha)
        return a._turno.localeCompare(b._turno)
      })
      setRegistros(processed)
    }
    setLoading(false)
  }, [filtroMes, filtroAnio, cajera])

  useEffect(() => { fetchRegistros() }, [fetchRegistros])

  const calcDiferencia = (f) => {
    const sumado = parseMontoCR(f.efectivo) + parseMontoCR(f.tarjeta) + parseMontoCR(f.transferencia) + parseMontoCR(f.credito) + parseMontoCR(f.otros)
    const sistema = parseMontoCR(f.total_sistema)
    return sistema > 0 ? sumado - sistema : 0
  }

  const totalMes = (campo) => registros.reduce((a,r) => a + Number(r[campo]||0), 0)

  const handleSave = async () => {
    if (!form.fecha) { setMsg({ tipo: 'error', texto: 'La fecha es requerida.' }); return }
    if (!cajera) { setMsg({ tipo: 'error', texto: 'No se pudo identificar la cajera. Recargá la página.' }); return }
    setSaving(true)
    const payload = {
      fecha: form.fecha,
      numero_caja: form.numero_caja || null,
      efectivo: parseMontoCR(form.efectivo),
      tarjeta: parseMontoCR(form.tarjeta),
      transferencia: parseMontoCR(form.transferencia),
      credito: parseMontoCR(form.credito),
      otros: parseMontoCR(form.otros),
      total_sistema: parseMontoCR(form.total_sistema),
      diferencia: calcDiferencia(form),
      // turno and cajera are stored as a metadata prefix inside observaciones
      observaciones: withMeta(form.turno || 'Turno 1', cajera, form.observaciones),
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
      turno: r._turno || 'Turno 1',
      numero_caja: r.numero_caja || '',
      efectivo: r.efectivo || '',
      tarjeta: r.tarjeta || '',
      transferencia: r.transferencia || '',
      credito: r.credito || '',
      otros: r.otros || '',
      total_sistema: r.total_sistema || '',
      observaciones: r._obs || '', // use pre-parsed obs (without META prefix)
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
      {/* TABS PRINCIPALES */}
      <div style={{ display:'flex', gap:8, marginBottom:20 }}>
        {[{id:'caja',label:'Cierre de Caja'},{id:'planificacion',label:'Planificación Diaria'}].map(t => (
          <button key={t.id} onClick={() => setSeccion(t.id)} style={{
            padding:'10px 20px', borderRadius:12, border:'none', cursor:'pointer', fontSize:'0.9rem', fontWeight: seccion===t.id ? 700 : 500,
            background: seccion===t.id ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.3)',
            color: seccion===t.id ? '#c8a84b' : 'rgba(0,0,0,0.4)',
            boxShadow: seccion===t.id ? '0 2px 12px rgba(0,0,0,0.06)' : 'none',
            backdropFilter:'blur(8px)', transition:'all 0.2s',
          }}>{t.label}</button>
        ))}
      </div>

      {seccion === 'planificacion' && <PlanificacionDiaria usuario={cajera} esAdmin={perfil?.rol === 'admin'} />}

      {seccion === 'caja' && <>
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
                    <div style={{ ...s.cajaBadge, background:'rgba(91,75,200,0.1)', color:'#5b4bc8' }}>
                      {r._turno || 'Turno 1'}
                    </div>
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
                  {(r._obs || r.incidencias) && (
                    <div style={s.cardObs}>
                      {r._obs && <div style={s.obsItem}><span style={s.obsLabel}>Obs:</span> {r._obs}</div>}
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
              <label style={s.label}>Turno *</label>
              <div style={{ display:'flex', gap:8 }}>
                {TURNOS.map(t => (
                  <button key={t} type="button" onClick={() => setForm(f=>({...f, turno:t}))} style={{
                    flex:1, padding:'9px 12px', borderRadius:8, border: form.turno===t ? 'none' : '1px solid rgba(0,0,0,0.12)',
                    background: form.turno===t ? 'linear-gradient(135deg, #c8a84b, #a08930)' : 'rgba(255,255,255,0.5)',
                    color: form.turno===t ? '#fff' : 'rgba(0,0,0,0.55)', cursor:'pointer',
                    fontWeight: form.turno===t ? 700 : 400, fontSize:13,
                    boxShadow: form.turno===t ? '0 4px 12px rgba(200,168,75,0.3)' : 'none', transition:'all 0.15s',
                  }}>{t}</button>
                ))}
              </div>
            </div>
          </div>
          <div style={s.formGrid2}>
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
      </>}
    </div>
  )
}

const s = {
  page: { background:'linear-gradient(135deg, #e8ecf4 0%, #d5dde8 30%, #e0e7f0 60%, #edf1f7 100%)', minHeight:'100vh', color:'#1a1a1a', fontFamily:'sans-serif', padding:'0 0 40px' },
  header: { background:'rgba(255,255,255,0.55)', backdropFilter:'blur(24px) saturate(1.8)', WebkitBackdropFilter:'blur(24px) saturate(1.8)', borderBottom:'1px solid rgba(0,0,0,0.06)', padding:'16px 28px', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12, borderRadius:'0 0 20px 20px', boxShadow:'0 4px 30px rgba(0,0,0,0.06)' },
  headerLeft: { display:'flex', alignItems:'center', gap:12 },
  logoCircle: { width:36, height:36, background:'linear-gradient(135deg, #c8a84b, #a08930)', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center' },
  brandName: { fontSize:18, fontWeight:700, color:'#c8a84b', letterSpacing:1 },
  brandSub: { fontSize:11, color:'rgba(0,0,0,0.4)', letterSpacing:0.5, marginTop:1 },
  headerRight: { display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' },
  selMes: { background:'rgba(255,255,255,0.5)', border:'1px solid rgba(0,0,0,0.1)', color:'rgba(0,0,0,0.8)', padding:'7px 10px', borderRadius:8, fontSize:13, outline:'none' },
  selAnio: { background:'rgba(255,255,255,0.5)', border:'1px solid rgba(0,0,0,0.1)', color:'rgba(0,0,0,0.8)', padding:'7px 10px', borderRadius:8, fontSize:13, outline:'none', width:80 },
  btnPrimary: { background:'linear-gradient(135deg, #c8a84b, #a08930)', color:'#fff', border:'none', borderRadius:10, padding:'8px 18px', fontSize:13, fontWeight:700, cursor:'pointer', letterSpacing:0.5, boxShadow:'0 4px 20px rgba(200,168,75,0.25)' },
  btnSecondary: { background:'rgba(255,255,255,0.4)', color:'rgba(0,0,0,0.6)', border:'1px solid rgba(0,0,0,0.1)', borderRadius:10, padding:'8px 16px', fontSize:13, cursor:'pointer', backdropFilter:'blur(8px)' },
  btnEdit: { background:'rgba(255,255,255,0.3)', color:'#c8a84b', border:'1px solid rgba(200,168,75,0.3)', borderRadius:7, padding:'5px 14px', fontSize:12, cursor:'pointer' },
  btnDel: { background:'rgba(239,68,68,0.08)', color:'#dc2626', border:'1px solid rgba(239,68,68,0.2)', borderRadius:7, padding:'5px 14px', fontSize:12, cursor:'pointer' },
  btnDanger: { background:'#dc2626', color:'#fff', border:'none', borderRadius:8, padding:'8px 18px', fontSize:13, fontWeight:700, cursor:'pointer' },
  msgOk: { margin:'12px 28px 0', background:'rgba(34,197,94,0.08)', border:'1px solid rgba(34,197,94,0.2)', color:'#15803d', borderRadius:12, padding:'10px 16px', fontSize:13 },
  msgErr: { margin:'12px 28px 0', background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)', color:'#dc2626', borderRadius:12, padding:'10px 16px', fontSize:13 },
  resumenGrid: { display:'grid', gridTemplateColumns:'repeat(6, 1fr)', gap:10, padding:'20px 28px 0' },
  sumCard: { background:'rgba(255,255,255,0.4)', backdropFilter:'blur(12px)', border:'1px solid rgba(255,255,255,0.5)', borderRadius:14, padding:'12px 14px', boxShadow:'0 2px 12px rgba(0,0,0,0.04)' },
  sumCardBig: { background:'rgba(255,255,255,0.55)', border:'1px solid rgba(200,168,75,0.3)' },
  sumLabel: { fontSize:10, color:'rgba(0,0,0,0.4)', letterSpacing:0.8, textTransform:'uppercase', marginBottom:4 },
  sumVal: { fontSize:15, fontWeight:700 },
  section: { padding:'20px 28px 0' },
  sectionTitle: { fontSize:11, color:'rgba(0,0,0,0.35)', textTransform:'uppercase', letterSpacing:1, marginBottom:12, marginTop:20 },
  loading: { color:'rgba(0,0,0,0.35)', fontSize:14, padding:'20px 0' },
  empty: { color:'rgba(0,0,0,0.35)', fontSize:14, padding:'30px 0', textAlign:'center' },
  card: { background:'rgba(255,255,255,0.55)', backdropFilter:'blur(24px) saturate(1.8)', WebkitBackdropFilter:'blur(24px) saturate(1.8)', border:'1px solid rgba(255,255,255,0.6)', borderRadius:20, padding:'16px 18px', marginBottom:12, boxShadow:'0 4px 30px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.8)' },
  cardTop: { display:'flex', alignItems:'center', gap:10, marginBottom:12, flexWrap:'wrap' },
  cardFecha: { fontSize:14, fontWeight:600, color:'rgba(0,0,0,0.85)', flex:1 },
  cajaBadge: { fontSize:11, background:'rgba(200,168,75,0.12)', color:'#c8a84b', borderRadius:20, padding:'3px 10px', letterSpacing:0.5 },
  difBadge: { fontSize:11, borderRadius:20, padding:'3px 10px', fontWeight:600 },
  cardMontos: { display:'flex', gap:16, flexWrap:'wrap', marginBottom:10 },
  montoItem: { display:'flex', flexDirection:'column', gap:2 },
  montoLabel: { fontSize:10, color:'rgba(0,0,0,0.4)', letterSpacing:0.5 },
  montoVal: { fontSize:14, fontWeight:600, color:'rgba(0,0,0,0.85)' },
  cardObs: { background:'rgba(255,255,255,0.3)', borderRadius:8, padding:'10px 12px', marginBottom:10 },
  obsItem: { fontSize:12, color:'rgba(0,0,0,0.5)', lineHeight:1.6 },
  obsLabel: { fontWeight:600, marginRight:4 },
  cardActions: { display:'flex', gap:8, justifyContent:'flex-end' },
  formWrap: { padding:'24px 28px' },
  formTitle: { fontSize:17, fontWeight:700, color:'rgba(0,0,0,0.85)', marginBottom:20 },
  formGrid2: { display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:4 },
  formGrid3: { display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap:12, marginBottom:4 },
  field: { marginBottom:14 },
  label: { display:'block', fontSize:11, color:'rgba(0,0,0,0.45)', letterSpacing:0.5, marginBottom:5, fontWeight:600 },
  input: { width:'100%', background:'rgba(255,255,255,0.5)', border:'1px solid rgba(0,0,0,0.1)', borderRadius:8, color:'rgba(0,0,0,0.8)', padding:'9px 12px', fontSize:13, outline:'none', boxSizing:'border-box', backdropFilter:'blur(8px)' },
  textarea: { width:'100%', background:'rgba(255,255,255,0.5)', border:'1px solid rgba(0,0,0,0.1)', borderRadius:8, color:'rgba(0,0,0,0.8)', padding:'9px 12px', fontSize:13, outline:'none', resize:'vertical', fontFamily:'sans-serif', boxSizing:'border-box', backdropFilter:'blur(8px)' },
  difBox: { borderRadius:10, padding:'11px 16px', fontSize:14, fontWeight:700, textAlign:'center', marginTop:6 },
  difOk: { background:'rgba(76,175,125,0.12)', color:'#4caf7d', border:'1px solid rgba(76,175,125,0.25)' },
  difPos: { background:'rgba(91,155,213,0.12)', color:'#5b9bd5', border:'1px solid rgba(91,155,213,0.25)' },
  difNeg: { background:'rgba(224,82,82,0.1)', color:'#e05252', border:'1px solid rgba(224,82,82,0.25)' },
  formActions: { display:'flex', gap:12, marginTop:24 },
  overlay: { position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', backdropFilter:'blur(8px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 },
  confirmBox: { background:'rgba(255,255,255,0.85)', backdropFilter:'blur(24px)', border:'1px solid rgba(255,255,255,0.6)', borderRadius:20, padding:'28px 32px', maxWidth:340, width:'90%', boxShadow:'0 8px 40px rgba(0,0,0,0.12)' },
  confirmTitle: { fontSize:16, fontWeight:700, color:'rgba(0,0,0,0.85)', marginBottom:8 },
  confirmSub: { fontSize:13, color:'rgba(0,0,0,0.45)', marginBottom:20 },
  confirmActions: { display:'flex', gap:10 },
}
