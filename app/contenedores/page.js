'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

const S = {
  page: { background: '#0f1115', minHeight: '100vh', padding: '28px', fontFamily: 'DM Sans, sans-serif', color: '#c9d1e0' },
  title: { fontSize: '1.7em', fontWeight: 700, color: '#ffffff', margin: 0 },
  sub: { fontSize: '0.82em', color: '#5a6a80', marginTop: '4px', marginBottom: '24px' },
  card: { background: '#161920', border: '1px solid #1e2330', borderRadius: '12px', padding: '20px', marginBottom: '16px' },
  tabBar: { display: 'flex', gap: '4px', marginBottom: '20px', borderBottom: '1px solid #1e2330' },
  tab: (a) => ({ padding: '10px 18px', cursor: 'pointer', border: 'none', background: 'none', color: a ? '#c8a84b' : '#5a6a80', fontWeight: a ? 700 : 400, borderBottom: a ? '2px solid #c8a84b' : '2px solid transparent', fontSize: '0.88em', fontFamily: 'inherit' }),
  btn: (c='#c8a84b') => ({ background: c, color: '#fff', border: 'none', borderRadius: '8px', padding: '9px 18px', cursor: 'pointer', fontSize: '0.85em', fontWeight: 600, fontFamily: 'inherit' }),
  btnSm: (c='#252a35') => ({ background: c, color: '#c9d1e0', border: '1px solid #1e2330', borderRadius: '6px', padding: '5px 12px', cursor: 'pointer', fontSize: '0.78em', fontFamily: 'inherit' }),
  input: { background: '#0f1115', border: '1px solid #1e2330', borderRadius: '8px', padding: '9px 12px', color: '#c9d1e0', fontSize: '0.87em', width: '100%', boxSizing: 'border-box', fontFamily: 'inherit' },
  label: { fontSize: '0.75em', color: '#5a6a80', display: 'block', marginBottom: '4px', fontWeight: 500 },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' },
  grid3: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px' },
  divider: { border: 'none', borderTop: '1px solid #1e2330', margin: '20px 0' },
  badge: (c) => ({ background: c+'22', color: c, border: '1px solid '+c+'55', borderRadius: '20px', padding: '3px 10px', fontSize: '0.72em', fontWeight: 600 }),
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '0.83em' },
  th: { textAlign: 'left', padding: '9px 12px', background: '#0f1115', color: '#5a6a80', fontSize: '0.75em', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '2px solid #1e2330' },
  td: { padding: '9px 12px', borderBottom: '1px solid #1e2330', color: '#c9d1e0', verticalAlign: 'middle' },
};

const ESTADOS = {
  '🏭 En producción': '#f6ad55',
  '🚢 En el mar': '#63b3ed',
  '🛳️ En puerto': '#b794f4',
  '🚛 En tránsito CR': '#68d391',
  '🏬 En bodega': '#68d391',
  '✅ Cerrado': '#5a6a80',
};

const INCOTERMS = ['FOB', 'CIF', 'EXW', 'CFR', 'DDP', 'FCA', 'DAP'];

function fmtFecha(s) { return s ? String(s).substring(0, 10) : '—'; }
function fmtUSD(n) { return (n !== null && n !== undefined && n !== '' && Number(n) !== 0) ? '$'+Number(n).toLocaleString('es-CR', { minimumFractionDigits: 2 }) : '—'; }
function fmtCRC(n) { return (n !== null && n !== undefined && n !== '' && Number(n) !== 0) ? '₡'+Number(n).toLocaleString('es-CR', { maximumFractionDigits: 0 }) : '—'; }

// Estructura REAL de neptuno_envios:
// _pago campos son boolean (¿ya se pagó?)
// tlc es boolean (¿tiene contenedor?)
const FORM_INIT = {
  nombre: '', proveedor: '', naviero: '', bl_num: '',
  estado: '🚢 En el mar', incoterm: 'FOB',
  etd: '', eta: '',
  adelanto_monto: '', adelanto_pago: false,
  final_monto: '',    final_pago: false,
  flete_monto: '',    flete_pago: false,
  impuestos_monto: '', impuestos_pago: false,
  transporte_local_monto: '', transporte_local_pago: false,
  tlc: false,
  doc_bl: false, doc_factura: false, doc_packing: false, doc_cert: false, doc_poliza: false,
  notas: '', archivado: false,
};

export default function Contenedores() {
  const [tab, setTab] = useState(0);
  const [envios, setEnvios] = useState([]);
  const [historial, setHistorial] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(FORM_INIT);
  const [editId, setEditId] = useState(null);
  const [expandido, setExpandido] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [tcBAC, setTcBAC] = useState(null);

  useEffect(() => {
    cargar();
    fetch('/api/mercado?fuente=bac')
      .then(r => r.json())
      .then(j => { if (j.ok && j.data?.compra) setTcBAC(j.data); })
      .catch(() => {});
  }, []);

  async function cargar() {
    setLoading(true);
    const { data: activos, error: e1 } = await supabase
      .from('neptuno_envios').select('*')
      .neq('estado', '✅ Cerrado')
      .eq('archivado', false)
      .order('creado', { ascending: false });
    const { data: hist, error: e2 } = await supabase
      .from('neptuno_envios').select('*')
      .or('estado.eq.✅ Cerrado,archivado.eq.true')
      .order('creado', { ascending: false }).limit(50);
    if (e1 || e2) mostrarMsg('Error Supabase: ' + (e1?.message || e2?.message), 'err');
    setEnvios(activos || []);
    setHistorial(hist || []);
    setLoading(false);
  }

  function setF(k, v) { setForm(f => ({ ...f, [k]: v })); }
  function mostrarMsg(texto, tipo='ok') { setMsg({ texto, tipo }); setTimeout(() => setMsg(null), 4000); }

  async function guardar() {
    if (!form.proveedor) { mostrarMsg('El proveedor es requerido.', 'err'); return; }
    setSaving(true);
    const payload = {
      ...form,
      adelanto_monto: form.adelanto_monto !== '' ? parseFloat(form.adelanto_monto) : null,
      final_monto:    form.final_monto !== ''    ? parseFloat(form.final_monto)    : null,
      flete_monto:    form.flete_monto !== ''    ? parseFloat(form.flete_monto)    : null,
      impuestos_monto: form.impuestos_monto !== '' ? parseFloat(form.impuestos_monto) : null,
      transporte_local_monto: form.transporte_local_monto !== '' ? parseFloat(form.transporte_local_monto) : null,
      etd: form.etd || null,
      eta: form.eta || null,
    };
    const { error } = editId
      ? await supabase.from('neptuno_envios').update(payload).eq('id', editId)
      : await supabase.from('neptuno_envios').insert([payload]);
    if (error) { mostrarMsg('Error: ' + error.message, 'err'); setSaving(false); return; }
    mostrarMsg(editId ? 'Contenedor actualizado.' : 'Contenedor registrado.');
    setForm(FORM_INIT); setEditId(null); setSaving(false);
    cargar(); setTab(0);
  }

  function editar(env) {
    setForm({
      ...FORM_INIT, ...env,
      adelanto_monto: env.adelanto_monto ?? '',
      final_monto:    env.final_monto ?? '',
      flete_monto:    env.flete_monto ?? '',
      impuestos_monto: env.impuestos_monto ?? '',
      transporte_local_monto: env.transporte_local_monto ?? '',
    });
    setEditId(env.id); setTab(1);
  }

  async function cerrar(id) {
    if (!confirm('¿Mover al historial?')) return;
    await supabase.from('neptuno_envios').update({ estado: '✅ Cerrado' }).eq('id', id);
    mostrarMsg('Contenedor cerrado.'); cargar();
  }

  async function reactivar(id) {
    await supabase.from('neptuno_envios').update({ estado: '🏬 En bodega', archivado: false }).eq('id', id);
    mostrarMsg('Contenedor reactivado.'); cargar();
  }

  async function eliminar(id) {
    if (!confirm('¿Eliminar permanentemente?')) return;
    await supabase.from('neptuno_envios').delete().eq('id', id);
    mostrarMsg('Registro eliminado.'); cargar();
  }

  const tcCompra = tcBAC?.compra || null;
  const toCRC = (usd) => tcCompra && usd ? ' · ₡'+(parseFloat(usd)*tcCompra).toLocaleString('es-CR',{maximumFractionDigits:0}) : '';
  const totalFlete    = envios.reduce((s,e) => s+(parseFloat(e.flete_monto)||0), 0);
  const totalAdelanto = envios.reduce((s,e) => s+(parseFloat(e.adelanto_monto)||0), 0);

  const chk = (v, label) => (
    <span style={{fontSize:'0.82em', color: v ? '#68d391' : '#5a6a80'}}>{v ? '✅' : '⬜'} {label}</span>
  );

  return (
    <div style={S.page}>
      <div style={S.title}>🌊 Jonás – Contenedores</div>
      <div style={S.sub}>
        Trazabilidad de importaciones · Corporación Rojimo S.A.
        {tcCompra && <span style={{color:'#c8a84b',marginLeft:'12px'}}>💱 TC BAC compra: ₡{tcCompra.toFixed(2)}{tcBAC?.esFallback?' ~':''}</span>}
      </div>

      {msg && (
        <div style={{background:msg.tipo==='ok'?'#68d39122':'#fc818122',border:'1px solid '+(msg.tipo==='ok'?'#68d391':'#fc8181')+'55',borderRadius:'8px',padding:'10px 16px',marginBottom:'16px',color:msg.tipo==='ok'?'#68d391':'#fc8181',fontSize:'0.85em'}}>
          {msg.tipo==='ok'?'✅':'❌'} {msg.texto}
        </div>
      )}

      <div style={S.tabBar}>
        {['📦 Envíos Activos','➕ Nuevo Envío','📋 Historial'].map((t,i) => (
          <button key={i} style={S.tab(tab===i)} onClick={()=>{ setTab(i); setEditId(null); if(i!==1) setForm(FORM_INIT); }}>{t}</button>
        ))}
      </div>

      {/* ── Tab 0: Activos ── */}
      {tab===0 && (
        <div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'12px',marginBottom:'20px'}}>
            {[
              ['📦 Envíos activos', envios.length, '#63b3ed', ''],
              ['💵 Flete total', fmtUSD(totalFlete), '#c8a84b', toCRC(totalFlete)],
              ['💰 Adelantos', fmtUSD(totalAdelanto), '#68d391', toCRC(totalAdelanto)],
            ].map(([l,v,c,crc])=>(
              <div key={l} style={{background:'#161920',border:'1px solid '+c+'33',borderTop:'3px solid '+c,borderRadius:'10px',padding:'14px 16px'}}>
                <div style={{fontSize:'0.72em',color:'#5a6a80',textTransform:'uppercase',letterSpacing:'0.06em'}}>{l}</div>
                <div style={{fontSize:'1.6em',fontWeight:700,color:'#fff',marginTop:'4px'}}>{v}</div>
                {crc && <div style={{fontSize:'0.75em',color:'#4ec9b0',marginTop:'2px'}}>{crc}</div>}
              </div>
            ))}
          </div>

          {loading ? <div style={{textAlign:'center',padding:'40px',color:'#5a6a80'}}>Cargando...</div>
          : envios.length===0 ? (
            <div style={{...S.card,textAlign:'center',color:'#5a6a80',padding:'40px'}}>
              No hay envíos activos. <span style={{color:'#c8a84b',cursor:'pointer'}} onClick={()=>setTab(1)}>Registrá uno →</span>
            </div>
          ) : envios.map(env=>(
            <div key={env.id} style={{...S.card,borderLeft:'3px solid '+(ESTADOS[env.estado]||'#5a6a80')}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:'10px'}}>
                <div>
                  <div style={{display:'flex',alignItems:'center',gap:'10px',flexWrap:'wrap'}}>
                    <span style={{fontWeight:700,color:'#fff',fontSize:'1em'}}>{env.nombre||env.proveedor}</span>
                    <span style={S.badge(ESTADOS[env.estado]||'#5a6a80')}>{env.estado}</span>
                    {env.incoterm && <span style={{fontSize:'0.78em',color:'#c8a84b'}}>{env.incoterm}</span>}
                  </div>
                  <div style={{fontSize:'0.85em',color:'#c9d1e0',marginTop:'4px'}}>{env.proveedor}</div>
                  {env.naviero && <div style={{fontSize:'0.78em',color:'#5a6a80'}}>{env.naviero} · BL: {env.bl_num||'—'}</div>}
                </div>
                <div style={{display:'flex',gap:'8px',flexWrap:'wrap'}}>
                  <button style={S.btnSm()} onClick={()=>setExpandido(expandido===env.id?null:env.id)}>🔍 {expandido===env.id?'Menos':'Ver'}</button>
                  <button style={S.btnSm()} onClick={()=>editar(env)}>✏️ Editar</button>
                  <button style={S.btnSm('#1e2330')} onClick={()=>cerrar(env.id)}>📁 Cerrar</button>
                </div>
              </div>

              {/* Datos principales */}
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))',gap:'8px',marginTop:'14px'}}>
                {[
                  ['🚢 ETD', fmtFecha(env.etd), null],
                  ['📅 ETA', fmtFecha(env.eta), null],
                  ['💵 Flete', fmtUSD(env.flete_monto), env.flete_monto],
                  ['💰 Adelanto', fmtUSD(env.adelanto_monto), env.adelanto_monto],
                  ['🧾 Impuestos', fmtCRC(env.impuestos_monto), null],
                  ['🚛 Transporte CR', fmtCRC(env.transporte_local_monto), null],
                ].map(([l,v,usd])=>(
                  <div key={l} style={{background:'#0f1115',borderRadius:'8px',padding:'8px 10px'}}>
                    <div style={{fontSize:'0.65em',color:'#5a6a80'}}>{l}</div>
                    <div style={{fontSize:'0.9em',fontWeight:600,color:'#fff',marginTop:'2px'}}>{v}</div>
                    {usd && tcCompra && <div style={{fontSize:'0.7em',color:'#4ec9b0',marginTop:'1px'}}>₡{(parseFloat(usd)*tcCompra).toLocaleString('es-CR',{maximumFractionDigits:0})}</div>}
                  </div>
                ))}
              </div>

              {/* Estado de pagos — checkboxes */}
              <div style={{display:'flex',gap:'16px',marginTop:'10px',flexWrap:'wrap'}}>
                {chk(env.flete_pago,   '💵 Flete pagado')}
                {chk(env.adelanto_pago,'💰 Adelanto pagado')}
                {chk(env.final_pago,   '✔️ Final pagado')}
                {chk(env.impuestos_pago,'🧾 Impuestos pagados')}
                {chk(env.transporte_local_pago,'🚛 Transporte pagado')}
              </div>

              {expandido===env.id && (
                <div style={{marginTop:'14px',paddingTop:'14px',borderTop:'1px solid #1e2330'}}>
                  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))',gap:'8px',marginBottom:'12px'}}>
                    {[
                      ['Pago final', fmtUSD(env.final_monto), env.final_monto],
                      ['TC BAC compra', tcCompra?'₡'+tcCompra.toFixed(2):'—', null],
                    ].map(([l,v,usd])=>(
                      <div key={l} style={{background:'#0f1115',borderRadius:'8px',padding:'8px 10px'}}>
                        <div style={{fontSize:'0.65em',color:'#5a6a80'}}>{l}</div>
                        <div style={{fontSize:'0.87em',color:'#fff'}}>{v||'—'}</div>
                        {usd&&tcCompra&&<div style={{fontSize:'0.72em',color:'#4ec9b0',marginTop:'2px'}}>₡{(parseFloat(usd)*tcCompra).toLocaleString('es-CR',{maximumFractionDigits:0})}</div>}
                      </div>
                    ))}
                  </div>

                  <div style={{marginBottom:'10px'}}>
                    <div style={{fontSize:'0.75em',color:'#5a6a80',marginBottom:'6px',fontWeight:600,textTransform:'uppercase'}}>Documentos</div>
                    <div style={{display:'flex',gap:'12px',flexWrap:'wrap'}}>
                      {chk(env.doc_bl,'📄 BL')}
                      {chk(env.doc_factura,'🧾 Factura')}
                      {chk(env.doc_packing,'📦 Packing')}
                      {chk(env.doc_cert,'📜 Certificados')}
                      {chk(env.doc_poliza,'🛡️ Póliza')}
                    </div>
                  </div>

                  {env.notas && <div style={{fontSize:'0.82em',color:'#8899aa',background:'#0f1115',borderRadius:'8px',padding:'10px'}}>📝 {env.notas}</div>}
                  <div style={{marginTop:'10px'}}>
                    <button style={S.btnSm('#3d1515')} onClick={()=>eliminar(env.id)}>🗑️ Eliminar</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Tab 1: Formulario ── */}
      {tab===1 && (
        <div style={S.card}>
          <div style={{fontWeight:700,color:'#fff',marginBottom:'20px',fontSize:'1.05em'}}>{editId?'✏️ Editar contenedor':'➕ Registrar nuevo contenedor'}</div>

          <div style={{fontWeight:600,color:'#c8a84b',fontSize:'0.8em',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:'12px'}}>Datos generales</div>
          <div style={S.grid2}>
            {[['nombre','Número de contenedor / ID'],['proveedor','Proveedor / Exportador'],['naviero','Naviero / Línea naviera'],['bl_num','BL / AWB número']].map(([k,l])=>(
              <div key={k}><label style={S.label}>{l}</label><input style={S.input} type="text" value={form[k]||''} onChange={e=>setF(k,e.target.value)}/></div>
            ))}
            <div><label style={S.label}>INCOTERM</label>
              <select style={S.input} value={form.incoterm||'FOB'} onChange={e=>setF('incoterm',e.target.value)}>
                {INCOTERMS.map(t=><option key={t}>{t}</option>)}
              </select>
            </div>
            <div><label style={S.label}>Estado</label>
              <select style={S.input} value={form.estado} onChange={e=>setF('estado',e.target.value)}>
                {Object.keys(ESTADOS).map(s=><option key={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <hr style={S.divider}/>
          <div style={{fontWeight:600,color:'#c8a84b',fontSize:'0.8em',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:'12px'}}>Fechas</div>
          <div style={S.grid2}>
            {[['etd','ETD (fecha de embarque)'],['eta','ETA (fecha estimada llegada)']].map(([k,l])=>(
              <div key={k}><label style={S.label}>{l}</label><input style={S.input} type="date" value={form[k]||''} onChange={e=>setF(k,e.target.value)}/></div>
            ))}
          </div>

          <hr style={S.divider}/>
          <div style={{fontWeight:600,color:'#c8a84b',fontSize:'0.8em',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:'12px'}}>Pagos y costos</div>
          <div style={S.grid2}>
            {[
              ['adelanto_monto','Adelanto (USD)','adelanto_pago','Adelanto pagado'],
              ['final_monto','Pago final (USD)','final_pago','Final pagado'],
              ['flete_monto','Flete (USD)','flete_pago','Flete pagado'],
              ['impuestos_monto','Impuestos (CRC)','impuestos_pago','Impuestos pagados'],
              ['transporte_local_monto','Transporte local (CRC)','transporte_local_pago','Transporte pagado'],
            ].map(([km,lm,kb,lb])=>(
              <div key={km} style={{background:'#0f1115',borderRadius:'8px',padding:'12px',display:'flex',flexDirection:'column',gap:'8px'}}>
                <div><label style={S.label}>{lm}</label>
                  <input style={S.input} type="number" value={form[km]||''} onChange={e=>setF(km,e.target.value)}/>
                </div>
                <label style={{display:'flex',alignItems:'center',gap:'8px',cursor:'pointer',fontSize:'0.85em',color:'#c9d1e0'}}>
                  <input type="checkbox" checked={!!form[kb]} onChange={e=>setF(kb,e.target.checked)} style={{accentColor:'#c8a84b',width:'15px',height:'15px'}}/>
                  {lb}
                </label>
              </div>
            ))}
          </div>

          <hr style={S.divider}/>
          <div style={{fontWeight:600,color:'#c8a84b',fontSize:'0.8em',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:'12px'}}>Documentos</div>
          <div style={{display:'flex',gap:'20px',marginBottom:'16px',flexWrap:'wrap'}}>
            {[['doc_bl','📄 BL'],['doc_factura','🧾 Factura'],['doc_packing','📦 Packing'],['doc_cert','📜 Certificados'],['doc_poliza','🛡️ Póliza']].map(([k,l])=>(
              <label key={k} style={{display:'flex',alignItems:'center',gap:'8px',cursor:'pointer',fontSize:'0.87em',color:'#c9d1e0'}}>
                <input type="checkbox" checked={!!form[k]} onChange={e=>setF(k,e.target.checked)} style={{accentColor:'#c8a84b',width:'16px',height:'16px'}}/>
                {l}
              </label>
            ))}
          </div>
          <div><label style={S.label}>Notas</label><textarea style={{...S.input,minHeight:'80px',resize:'vertical'}} value={form.notas||''} onChange={e=>setF('notas',e.target.value)}/></div>

          <div style={{display:'flex',gap:'10px',marginTop:'20px'}}>
            <button style={S.btn()} onClick={guardar} disabled={saving}>{saving?'Guardando...':editId?'💾 Actualizar':'💾 Guardar'}</button>
            <button style={S.btnSm()} onClick={()=>{ setForm(FORM_INIT); setEditId(null); setTab(0); }}>Cancelar</button>
          </div>
        </div>
      )}

      {/* ── Tab 2: Historial ── */}
      {tab===2 && (
        <div>
          <div style={{fontSize:'0.82em',color:'#5a6a80',marginBottom:'14px'}}>{historial.length} contenedores en historial</div>
          {historial.length===0 ? <div style={{...S.card,textAlign:'center',color:'#5a6a80',padding:'30px'}}>Sin historial aún.</div> : (
            <div style={{overflowX:'auto'}}>
              <table style={S.table}>
                <thead><tr>{['Contenedor','Proveedor','Estado','ETD','ETA','Flete USD','Acciones'].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {historial.map(env=>(
                    <tr key={env.id}>
                      <td style={S.td}><span style={{fontWeight:600}}>{env.nombre||'—'}</span></td>
                      <td style={S.td}>{env.proveedor}</td>
                      <td style={S.td}><span style={S.badge(ESTADOS[env.estado]||'#5a6a80')}>{env.estado}</span></td>
                      <td style={S.td}>{fmtFecha(env.etd)}</td>
                      <td style={S.td}>{fmtFecha(env.eta)}</td>
                      <td style={S.td}>{fmtUSD(env.flete_monto)}</td>
                      <td style={S.td}>
                        <div style={{display:'flex',gap:'6px'}}>
                          <button style={S.btnSm()} onClick={()=>reactivar(env.id)}>↩️ Reactivar</button>
                          <button style={S.btnSm('#3d1515')} onClick={()=>eliminar(env.id)}>🗑️</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
