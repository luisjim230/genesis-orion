'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { S, usd } from './estilos';
import Expediente from './expediente';
import Mercaderia from './mercaderia';
import Documentos from './documentos';


const ESTADOS = {
  '🏭 En producción':        '#f6ad55',
  '⏳ Esperando despacho':   '#ed8936',
  '🚢 En el mar':            '#63b3ed',
  '🏝️ En puerto de destino': '#b794f4',
  '🚛 En aduana':            '#fc8181',
  '✅ Entregado':            '#68d391',
};
const ESTADOS_LIST = Object.keys(ESTADOS);
const INCOTERMS = ['FOB','CIF','EXW','DAP'];

const fmtF = (s) => s ? String(s).substring(0,10) : '—';
const chk = (v) => v ? '✅' : '❌';

function diasParaETA(eta) {
  if (!eta) return null;
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  const d = new Date(eta); d.setHours(0,0,0,0);
  return Math.round((d - hoy) / 86400000);
}
function semaforoETA(dias) {
  if (dias === null) return null;
  if (dias < 0)  return { label:`🔴 Atrasado ${Math.abs(dias)} día(s)`, color:'#fc8181' };
  if (dias === 0) return { label:'🔥 ¡Llega HOY!', color:'#f6ad55' };
  if (dias <= 5)  return { label:`🟡 Faltan ${dias} día(s)`, color:'#f6ad55' };
  return { label:`🟢 Faltan ${dias} día(s)`, color:'#68d391' };
}
function calcTotales(c) {
  const comprometido =
    (parseFloat(c.adelanto_monto)||0) + (parseFloat(c.final_monto)||0) +
    (parseFloat(c.flete_monto)||0)    + (parseFloat(c.impuestos_monto)||0) +
    (parseFloat(c.transporte_local_monto)||0);
  const pendiente =
    (!c.adelanto_pago ? (parseFloat(c.adelanto_monto)||0) : 0) +
    (!c.final_pago    ? (parseFloat(c.final_monto)||0)    : 0) +
    (!c.flete_pago && c.incoterm !== 'CIF' ? (parseFloat(c.flete_monto)||0) : 0) +
    (!c.impuestos_pago        ? (parseFloat(c.impuestos_monto)||0)        : 0) +
    (!c.transporte_local_pago ? (parseFloat(c.transporte_local_monto)||0) : 0);
  const docs = ['doc_bl','doc_factura','doc_packing','doc_cert','doc_poliza'].filter(k=>c[k]).length;
  return { comprometido, pendiente, docs };
}

const FORM_INIT = {
  nombre:'', proveedor:'', naviero:'', bl_num:'',
  pi_num:'', puerto_origen:'', puerto_destino:'', contenedor_tipo:'',
  mercaderia_monto:'', cbm_total:'', resumen:'',
  estado:'🚢 En el mar', incoterm:'FOB', tlc:false,
  etd:'', eta:'',
  adelanto_monto:'', adelanto_pago:false,
  final_monto:'',    final_pago:false,
  flete_monto:'',    flete_pago:false,
  impuestos_monto:'', impuestos_pago:false,
  transporte_local_monto:'', transporte_local_pago:false,
  doc_bl:false, doc_factura:false, doc_packing:false, doc_cert:false, doc_poliza:false,
  notas:'', archivado:false,
};

export default function Contenedores() {
  const [tab, setTab]           = useState(0);
  const [envios, setEnvios]     = useState([]);
  const [historial, setHistorial] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [form, setForm]         = useState(FORM_INIT);
  const [editId, setEditId]     = useState(null);
  const [expandido, setExpandido] = useState(null);
  const [saving, setSaving]     = useState(false);
  const [msg, setMsg]           = useState(null);
  const [buscar, setBuscar]     = useState('');
  const [tcBac, setTcBac]       = useState(null);

  function mostrarMsg(texto, tipo='ok') { setMsg({texto,tipo}); setTimeout(()=>setMsg(null), 4000); }

  async function cargar() {
    setLoading(true);
    const { data: a, error: e1 } = await supabase.from('neptuno_envios').select('*').eq('archivado', false).order('eta', { ascending:true });
    const { data: h, error: e2 } = await supabase.from('neptuno_envios').select('*').eq('archivado', true).order('actualizado', { ascending:false }).limit(50);
    if (e1 || e2) mostrarMsg('Error Supabase: '+(e1?.message||e2?.message), 'err');
    setEnvios(a||[]);
    setHistorial(h||[]);
    setLoading(false);
  }

  useEffect(() => {
    cargar();
    fetch('/api/mercado?fuente=bccr_ref')
      .then(r=>r.json())
      .then(j=>{ if(j.ok && j.data?.venta) setTcBac(j.data.venta); })
      .catch(()=>{});
  }, []);

  function setF(k,v) { setForm(f=>({...f,[k]:v})); }

  async function guardar() {
    if (!form.nombre.trim()) { mostrarMsg('El nombre del envío es requerido.','err'); return; }
    setSaving(true);
    const payload = {
      ...form,
      adelanto_monto: form.adelanto_monto !== '' ? parseFloat(form.adelanto_monto) : 0,
      final_monto:    form.final_monto    !== '' ? parseFloat(form.final_monto)    : 0,
      flete_monto:    form.flete_monto    !== '' ? parseFloat(form.flete_monto)    : 0,
      impuestos_monto: form.impuestos_monto !== '' ? parseFloat(form.impuestos_monto) : 0,
      transporte_local_monto: form.transporte_local_monto !== '' ? parseFloat(form.transporte_local_monto) : 0,
      mercaderia_monto: form.mercaderia_monto !== '' && form.mercaderia_monto !== null ? parseFloat(form.mercaderia_monto) : null,
      cbm_total:        form.cbm_total        !== '' && form.cbm_total        !== null ? parseFloat(form.cbm_total)        : null,
      etd: form.etd || null,
      eta: form.eta || null,
      actualizado: new Date().toLocaleDateString('es-CR', { timeZone:'America/Costa_Rica', day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }),
    };
    const { error } = editId
      ? await supabase.from('neptuno_envios').update(payload).eq('id', editId)
      : await supabase.from('neptuno_envios').insert([{ ...payload, creado: new Date().toLocaleDateString('es-CR',{timeZone:'America/Costa_Rica',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}) }]);
    if (error) { mostrarMsg('Error: '+error.message,'err'); setSaving(false); return; }
    mostrarMsg(editId ? 'Expediente actualizado.' : '¡Envío registrado!');
    setForm(FORM_INIT); setEditId(null); setSaving(false);
    cargar(); setTab(0);
  }

  function editar(env) {
    setForm({ ...FORM_INIT, ...env,
      adelanto_monto: env.adelanto_monto ?? '',
      final_monto:    env.final_monto    ?? '',
      flete_monto:    env.flete_monto    ?? '',
      impuestos_monto: env.impuestos_monto ?? '',
      transporte_local_monto: env.transporte_local_monto ?? '',
      mercaderia_monto: env.mercaderia_monto ?? '',
      cbm_total:        env.cbm_total ?? '',
    });
    setEditId(env.id); setTab(1);
  }

  async function archivar(id) {
    if (!confirm('¿Archivar este envío?')) return;
    await supabase.from('neptuno_envios').update({ archivado:true, actualizado: new Date().toLocaleDateString('es-CR') }).eq('id',id);
    mostrarMsg('Envío archivado.'); cargar();
  }

  async function desarchivar(id) {
    await supabase.from('neptuno_envios').update({ archivado:false }).eq('id',id);
    mostrarMsg('Envío devuelto a activos.'); cargar();
  }

  async function eliminar(id) {
    if (!confirm('¿Eliminar permanentemente?')) return;
    await supabase.from('neptuno_envios').delete().eq('id',id);
    mostrarMsg('Eliminado.'); cargar();
  }

  // KPIs globales
  const totalComprometido = envios.reduce((s,c)=>s+(parseFloat(c.adelanto_monto)||0)+(parseFloat(c.final_monto)||0)+(parseFloat(c.flete_monto)||0)+(parseFloat(c.impuestos_monto)||0)+(parseFloat(c.transporte_local_monto)||0), 0);
  const totalPendiente    = envios.reduce((s,c)=>s+calcTotales(c).pendiente, 0);

  const histFiltrado = buscar
    ? historial.filter(c => [c.nombre,c.proveedor,c.bl_num].join(' ').toLowerCase().includes(buscar.toLowerCase()))
    : historial;

  return (
    <div style={S.page}>
      <div style={S.title}>🌊 Jonás – Contenedores</div>
      <div style={S.sub}>Trazabilidad de importaciones · Corporación Rojimo S.A.</div>

      {msg && (
        <div style={{background:msg.tipo==='ok'?'#68d39122':'#fc818122',border:'1px solid '+(msg.tipo==='ok'?'#68d391':'#fc8181')+'55',borderRadius:'8px',padding:'10px 16px',marginBottom:'16px',color:msg.tipo==='ok'?'#68d391':'#fc8181',fontSize:'0.85em'}}>
          {msg.tipo==='ok'?'✅':'❌'} {msg.texto}
        </div>
      )}

      <div style={S.tabBar}>
        {['🌊 Envíos Activos','➕ Nuevo Envío','📦 Mercadería','📎 Documentos','⚓ Historial'].map((t,i)=>(
          <button key={i} style={S.tab(tab===i)} onClick={()=>{ setTab(i); if(i!==1){ setEditId(null); setForm(FORM_INIT); } }}>{t}</button>
        ))}
      </div>

      {/* ── TAB 0: ACTIVOS ── */}
      {tab===0 && (
        <div>
          <div style={{fontSize:'0.8em',color:'var(--text-muted)',marginBottom:'16px'}}>Todo lo que está en tránsito, en producción o en aduana.</div>

          {/* KPIs */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'12px',marginBottom:'24px'}}>
            <div style={S.kpi('#63b3ed')}>
              <div style={S.mLabel}>Envíos activos</div>
              <div style={S.metric}>{envios.length}</div>
            </div>
            <div style={S.kpi('#c8a84b')}>
              <div style={S.mLabel}>Total comprometido</div>
              <div style={S.metric}>{usd(totalComprometido)}</div>
              {tcBac && <div style={{fontSize:'0.78em',color:'#c8a84b',marginTop:'4px'}}>₡{Math.round(totalComprometido*tcBac).toLocaleString('es-CR')} <span style={{fontSize:'0.75em',color:'var(--text-muted)'}}>TC BAC ₡{tcBac.toFixed(2)}</span></div>}
            </div>
            <div style={S.kpi(totalPendiente>0?'#fc8181':'#68d391')}>
              <div style={S.mLabel}>Pendiente de pago</div>
              <div style={S.metric}>{usd(totalPendiente)}</div>
              {tcBac && <div style={{fontSize:'0.78em',color:totalPendiente>0?'#fc8181':'#68d391',marginTop:'4px'}}>₡{Math.round(totalPendiente*tcBac).toLocaleString('es-CR')} <span style={{fontSize:'0.75em',color:'var(--text-muted)'}}>TC BAC ₡{tcBac.toFixed(2)}</span></div>}
              <div style={S.mDelta(totalPendiente>0)}>{totalPendiente>0?'⚠️ Por pagar':'✅ Al día'}</div>
            </div>
          </div>

          {loading ? <div style={{textAlign:'center',padding:'40px',color:'var(--text-muted)'}}>Cargando...</div>
          : envios.length===0 ? (
            <div style={{...S.card,textAlign:'center',color:'var(--text-muted)',padding:'40px'}}>
              No hay envíos activos. <span style={{color:'#c8a84b',cursor:'pointer'}} onClick={()=>setTab(1)}>Registrá uno →</span>
            </div>
          ) : envios.map(env=>{
            const {comprometido, pendiente, docs} = calcTotales(env);
            const dias = diasParaETA(env.eta);
            const sem  = semaforoETA(dias);
            const color = ESTADOS[env.estado]||'#5a6a80';
            return (
              <div key={env.id} style={{...S.card, borderLeft:'3px solid '+color, marginBottom:'12px'}}>
                {/* Header */}
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:'10px',marginBottom:'14px'}}>
                  <div>
                    <div style={{display:'flex',alignItems:'center',gap:'10px',flexWrap:'wrap'}}>
                      <span style={{fontWeight:700,color:'var(--text-primary)',fontSize:'1.05em'}}>🚢 {env.nombre}</span>
                      <span style={S.badge(color)}>{env.estado}</span>
                      {env.incoterm && <span style={{fontSize:'0.78em',color:'#c8a84b',fontWeight:600}}>{env.incoterm}</span>}
                    </div>
                    <div style={{fontSize:'0.82em',color:'#8899aa',marginTop:'3px'}}>{env.proveedor}{env.naviero?' · '+env.naviero:''}{env.bl_num?' · BL: '+env.bl_num:''}</div>
                  </div>
                  <div style={{display:'flex',gap:'8px',flexWrap:'wrap'}}>
                    <button style={S.btnSm()} onClick={()=>editar(env)}>✏️ Editar</button>
                    <button style={S.btnSm('#f5eaea')} onClick={()=>archivar(env.id)}>⚓ Archivar</button>
                    <button style={S.btnSm()} onClick={()=>setExpandido(expandido===env.id?null:env.id)}>📋 {expandido===env.id?'Cerrar':'Expediente'}</button>
                  </div>
                </div>

                {/* 6 métricas — igual al Streamlit */}
                <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:'8px'}}>
                  {[
                    ['ETA', fmtF(env.eta), sem],
                    ['ETD', fmtF(env.etd), null],
                    ['Comprometido', usd(comprometido), null],
                    ['Pendiente', usd(pendiente), pendiente>0?{label:'⚠️ Por pagar',color:'#f6ad55'}:{label:'✅ Al día',color:'#68d391'}],
                    ['Docs', docs+'/5', null],
                    ['TLC', env.tlc?'✅ Sí':'❌ No', null],
                  ].map(([l,v,delta])=>(
                    <div key={l} style={{background:'var(--cream)',borderRadius:'8px',padding:'8px 10px'}}>
                      <div style={{fontSize:'0.65em',color:'var(--text-muted)',textTransform:'uppercase'}}>{l}</div>
                      <div style={{fontSize:'0.92em',fontWeight:600,color:'var(--text-primary)',marginTop:'2px'}}>{v}</div>
                      {delta && <div style={{fontSize:'0.68em',color:delta.color,marginTop:'2px'}}>{delta.label}</div>}
                    </div>
                  ))}
                </div>

                {/* Expediente expandido */}
                {expandido===env.id && (
                  <div style={{marginTop:'16px',paddingTop:'16px',borderTop:'1px solid #1e2330'}}>
                    <div style={S.grid3}>
                      {/* General */}
                      <div>
                        <div style={{fontSize:'0.75em',color:'#c8a84b',fontWeight:700,textTransform:'uppercase',marginBottom:'8px'}}>🏭 General</div>
                        {[['Proveedor',env.proveedor],['Naviero',env.naviero],['BL',env.bl_num],['Incoterm',env.incoterm],['TLC',chk(env.tlc)],['N° PI',env.pi_num],['Ruta',[env.puerto_origen,env.puerto_destino].filter(Boolean).join(' → ')],['Contenedor',env.contenedor_tipo],['CBM',env.cbm_total]].map(([l,v])=>(
                          <div key={l} style={{fontSize:'0.82em',marginBottom:'4px',color:'var(--text-primary)'}}><span style={{color:'var(--text-muted)'}}>{l}:</span> {v||'—'}</div>
                        ))}
                      </div>
                      {/* Pagos */}
                      <div>
                        <div style={{fontSize:'0.75em',color:'#c8a84b',fontWeight:700,textTransform:'uppercase',marginBottom:'8px'}}>💰 Pagos</div>
                        {[
                          ['Adelanto', env.adelanto_monto, env.adelanto_pago],
                          ['Pago final', env.final_monto, env.final_pago],
                          ['Flete int\'l', env.flete_monto, env.flete_pago],
                          ['Impuestos', env.impuestos_monto, env.impuestos_pago, env.impuestos_estimado ? 'estimado '+usd(env.impuestos_estimado) : null],
                          ['Transp. local', env.transporte_local_monto, env.transporte_local_pago],
                        ].map(([l,m,p,extra])=>(
                          <div key={l} style={{fontSize:'0.82em',marginBottom:'4px',color:'var(--text-primary)'}}>
                            <span style={{color:'var(--text-muted)'}}>{l}:</span> {usd(m)} {chk(p)}
                            {extra && <span style={{color:'#c8a84b',fontSize:'0.9em'}}> · {extra}</span>}
                          </div>
                        ))}
                      </div>
                      {/* Documentos */}
                      <div>
                        <div style={{fontSize:'0.75em',color:'#c8a84b',fontWeight:700,textTransform:'uppercase',marginBottom:'8px'}}>📄 Documentos</div>
                        {[['BL original',env.doc_bl],['Factura comercial',env.doc_factura],['Packing list',env.doc_packing],['Cert. de origen',env.doc_cert],['Póliza de seguro',env.doc_poliza]].map(([l,v])=>(
                          <div key={l} style={{fontSize:'0.82em',marginBottom:'4px',color:v?'#68d391':'#5a6a80'}}>{chk(v)} {l}</div>
                        ))}
                      </div>
                    </div>
                    {env.notas && <div style={{marginTop:'12px',background:'var(--cream)',borderRadius:'8px',padding:'10px',fontSize:'0.82em',color:'#8899aa'}}>📝 {env.notas}</div>}

                    <Expediente envio={env} onEnvioActualizado={cargar}/>

                    <div style={{marginTop:'14px',fontSize:'0.72em',color:'#3a4a5a'}}>Creado: {env.creado||'—'} · Actualizado: {env.actualizado||'—'}</div>
                    <button style={{...S.btnSm('#fff5f5'),marginTop:'10px'}} onClick={()=>eliminar(env.id)}>🗑️ Eliminar registro</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── TAB 1: FORMULARIO ── */}
      {tab===1 && (
        <div style={S.card}>
          <div style={{fontWeight:700,color:'var(--text-primary)',marginBottom:'20px',fontSize:'1.05em'}}>{editId?'✏️ Editar expediente':'➕ Registrar nuevo envío'}</div>

          <div style={{fontWeight:600,color:'#c8a84b',fontSize:'0.8em',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:'12px'}}>📋 Datos generales</div>
          <div style={S.grid3}>
            {[['nombre','Nombre del envío','text'],['proveedor','Proveedor / origen','text'],['naviero','Naviero / línea marítima','text'],['bl_num','Número de BL / tracking','text'],['pi_num','N° de PI / contrato','text'],['puerto_origen','Puerto de origen','text'],['puerto_destino','Puerto de destino','text'],['contenedor_tipo','Contenedor (ej. 1x40HQ)','text']].map(([k,l])=>(
              <div key={k}><label style={S.label}>{l}</label><input style={S.input} type="text" value={form[k]||''} onChange={e=>setF(k,e.target.value)}/></div>
            ))}
            <div><label style={S.label}>Estado del envío</label>
              <select style={S.input} value={form.estado} onChange={e=>setF('estado',e.target.value)}>
                {ESTADOS_LIST.map(s=><option key={s}>{s}</option>)}
              </select>
            </div>
            <div><label style={S.label}>Incoterm</label>
              <select style={S.input} value={form.incoterm} onChange={e=>setF('incoterm',e.target.value)}>
                {INCOTERMS.map(t=><option key={t}>{t}</option>)}
              </select>
            </div>
            <div><label style={S.label}>Valor de la mercadería (USD)</label><input style={S.input} type="number" value={form.mercaderia_monto||''} onChange={e=>setF('mercaderia_monto',e.target.value)}/></div>
            <div><label style={S.label}>CBM total</label><input style={S.input} type="number" step="0.001" value={form.cbm_total||''} onChange={e=>setF('cbm_total',e.target.value)}/></div>
            <div><label style={S.label}>ETD (fecha de salida)</label><input style={S.input} type="date" value={form.etd||''} onChange={e=>setF('etd',e.target.value)}/></div>
            <div><label style={S.label}>ETA (fecha llegada estimada)</label><input style={S.input} type="date" value={form.eta||''} onChange={e=>setF('eta',e.target.value)}/></div>
            <div style={{display:'flex',alignItems:'center',gap:'10px',paddingTop:'20px'}}>
              <input type="checkbox" id="tlc" checked={!!form.tlc} onChange={e=>setF('tlc',e.target.checked)} style={{accentColor:'#c8a84b',width:'16px',height:'16px'}}/>
              <label htmlFor="tlc" style={{cursor:'pointer',fontSize:'0.87em',color:'var(--text-primary)'}}>✅ Aplica TLC</label>
            </div>
          </div>

          <hr style={S.divider}/>
          <div style={{fontWeight:600,color:'#c8a84b',fontSize:'0.8em',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:'12px'}}>💰 Pagos</div>
          <div style={S.grid3}>
            {[
              ['adelanto_monto','adelanto_pago','Adelanto al proveedor (USD)','Adelanto pagado'],
              ['final_monto','final_pago','Pago final al proveedor (USD)','Pago final realizado'],
              form.incoterm==='CIF'
                ? [null, null, 'Flete internacional','ℹ️ CIF: flete incluido en precio']
                : ['flete_monto','flete_pago','Flete internacional (USD)','Flete pagado'],
              ['impuestos_monto','impuestos_pago','Impuestos de aduana (USD)','Impuestos pagados'],
              ['transporte_local_monto','transporte_local_pago','Transporte local (USD)','Transporte pagado'],
            ].map(([km,kb,lm,lb], i)=>(
              <div key={i} style={{background:'var(--cream)',borderRadius:'8px',padding:'12px'}}>
                <div style={{fontSize:'0.75em',color:'#c8a84b',fontWeight:600,marginBottom:'8px'}}>{lm}</div>
                {km ? (
                  <>
                    <input style={S.input} type="number" min="0" step="100" placeholder="0.00" value={form[km]||''} onChange={e=>setF(km,e.target.value)}/>
                    <label style={{display:'flex',alignItems:'center',gap:'8px',marginTop:'8px',cursor:'pointer',fontSize:'0.83em',color:'var(--text-primary)'}}>
                      <input type="checkbox" checked={!!form[kb]} onChange={e=>setF(kb,e.target.checked)} style={{accentColor:'#c8a84b'}}/>
                      {lb}
                    </label>
                  </>
                ) : (
                  <div style={{fontSize:'0.82em',color:'var(--text-muted)',paddingTop:'8px'}}>{lb}</div>
                )}
              </div>
            ))}
          </div>

          <hr style={S.divider}/>
          <div style={{fontWeight:600,color:'#c8a84b',fontSize:'0.8em',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:'12px'}}>📄 Documentos</div>
          <div style={{display:'flex',gap:'20px',flexWrap:'wrap',marginBottom:'16px'}}>
            {[['doc_bl','📄 BL original'],['doc_factura','🧾 Factura comercial'],['doc_packing','📦 Packing list'],['doc_cert','📜 Cert. de origen'],['doc_poliza','🛡️ Póliza de seguro']].map(([k,l])=>(
              <label key={k} style={{display:'flex',alignItems:'center',gap:'8px',cursor:'pointer',fontSize:'0.87em',color:'var(--text-primary)'}}>
                <input type="checkbox" checked={!!form[k]} onChange={e=>setF(k,e.target.checked)} style={{accentColor:'#c8a84b',width:'16px',height:'16px'}}/>
                {l}
              </label>
            ))}
          </div>

          <div style={{marginBottom:'14px'}}><label style={S.label}>📦 Qué viene en esta carga</label>
            <textarea style={{...S.input,minHeight:'60px',resize:'vertical'}} placeholder="Se llena solo cuando subís la proforma, pero lo podés escribir vos." value={form.resumen||''} onChange={e=>setF('resumen',e.target.value)}/>
          </div>

          <div><label style={S.label}>📝 Notas del expediente</label>
            <textarea style={{...S.input,minHeight:'80px',resize:'vertical'}} placeholder="Observaciones, contactos, incidencias..." value={form.notas||''} onChange={e=>setF('notas',e.target.value)}/>
          </div>

          <div style={{display:'flex',gap:'10px',marginTop:'20px'}}>
            <button style={S.btn()} onClick={guardar} disabled={saving}>{saving?'Guardando...':editId?'💾 Guardar expediente':'💾 Guardar expediente'}</button>
            <button style={S.btnSm()} onClick={()=>{ setForm(FORM_INIT); setEditId(null); setTab(0); }}>Cancelar</button>
          </div>
        </div>
      )}

      {/* ── TAB 2: MERCADERÍA EN TRÁNSITO ── */}
      {tab===2 && (
        <div>
          <div style={{fontSize:'0.8em',color:'var(--text-muted)',marginBottom:'16px'}}>Todo lo que viene en camino, producto por producto. Sale de las proformas y facturas que subís.</div>
          <Mercaderia/>
        </div>
      )}

      {/* ── TAB 3: DOCUMENTOS ── */}
      {tab===3 && (
        <div>
          <div style={{fontSize:'0.8em',color:'var(--text-muted)',marginBottom:'16px'}}>Subí las proformas y facturas de tus órdenes. El sistema las lee, te dice a qué contenedor van y compara contra lo que ya cargaste a mano.</div>
          <Documentos envios={envios} onCambio={cargar}/>
        </div>
      )}

      {/* ── TAB 4: HISTORIAL ── */}
      {tab===4 && (
        <div>
          <div style={{marginBottom:'16px'}}>
            <input style={{...S.input,maxWidth:'360px'}} placeholder="🔍 Buscar por nombre, proveedor, BL..." value={buscar} onChange={e=>setBuscar(e.target.value)}/>
          </div>
          <div style={{fontSize:'0.82em',color:'var(--text-muted)',marginBottom:'14px'}}>{histFiltrado.length} contenedor(es) archivado(s)</div>
          {histFiltrado.length===0 ? (
            <div style={{...S.card,textAlign:'center',color:'var(--text-muted)',padding:'30px'}}>Sin historial aún.</div>
          ) : histFiltrado.map(env=>{
            const {comprometido, pendiente, docs} = calcTotales(env);
            const color = ESTADOS[env.estado]||'#5a6a80';
            return (
              <div key={env.id} style={{...S.card,borderLeft:'3px solid '+color,marginBottom:'12px'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:'10px',marginBottom:'12px'}}>
                  <div>
                    <div style={{fontWeight:700,color:'var(--text-primary)'}}>🚢 {env.nombre}</div>
                    <div style={{fontSize:'0.82em',color:'#8899aa'}}>{env.proveedor}{env.naviero?' · '+env.naviero:''}</div>
                  </div>
                  <div style={{display:'flex',gap:'8px'}}>
                    <button style={S.btnSm()} onClick={()=>desarchivar(env.id)}>🌊 Devolver a activos</button>
                    <button style={S.btnSm('#fff5f5')} onClick={()=>eliminar(env.id)}>🗑️</button>
                  </div>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:'8px'}}>
                  {[['ETA',fmtF(env.eta)],['ETD',fmtF(env.etd)],['Comprometido',usd(comprometido)],['Pendiente',usd(pendiente)],['Docs',docs+'/5'],['TLC',env.tlc?'✅ Sí':'❌ No']].map(([l,v])=>(
                    <div key={l} style={{background:'var(--cream)',borderRadius:'8px',padding:'8px 10px'}}>
                      <div style={{fontSize:'0.65em',color:'var(--text-muted)',textTransform:'uppercase'}}>{l}</div>
                      <div style={{fontSize:'0.9em',fontWeight:600,color:'var(--text-primary)',marginTop:'2px'}}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
