'use client';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';

// ── Estilos ────────────────────────────────────────────────────────────────
const S = {
  page:      { background:'var(--cream)', minHeight:'100vh', padding:'28px 32px', fontFamily:'DM Sans, sans-serif', color:'var(--text-primary)' },
  header:    { marginBottom:'24px' },
  title:     { fontSize:'1.7rem', fontWeight:700, color:'var(--text-primary)', margin:0 },
  caption:   { fontSize:'0.82rem', color:'var(--text-muted)', marginTop:'4px' },
  tabs:      { display:'flex', gap:'8px', marginBottom:'24px', borderBottom:'1px solid var(--border-soft)', paddingBottom:'0' },
  tab:       { padding:'8px 18px', borderRadius:'8px 8px 0 0', border:'none', cursor:'pointer', fontSize:'0.9rem', fontWeight:500, transition:'all .2s', background:'transparent', color:'var(--text-muted)', marginBottom:'-1px' },
  tabActive: { background:'var(--cream)', color:'var(--orange)', borderBottom:'2px solid var(--orange)' },
  card:      { background:'#fff', borderRadius:'12px', padding:'20px', marginBottom:'12px', border:'1px solid var(--border-soft)' },
  expander:  { background:'#fff', borderRadius:'12px', border:'1px solid var(--border-soft)', marginBottom:'16px', overflow:'hidden' },
  expanderHeader: { padding:'12px 16px', cursor:'pointer', display:'flex', justifyContent:'space-between', alignItems:'center', color:'var(--orange)', fontWeight:600, fontSize:'0.9rem' },
  expanderBody: { padding:'16px', borderTop:'1px solid var(--border-soft)' },
  input:     { background:'var(--cream)', border:'1px solid var(--border)', borderRadius:'8px', color:'var(--text-primary)', padding:'8px 12px', fontSize:'0.9rem', width:'100%', outline:'none', boxSizing:'border-box' },
  textarea:  { background:'var(--cream)', border:'1px solid var(--border)', borderRadius:'8px', color:'var(--text-primary)', padding:'8px 12px', fontSize:'0.9rem', width:'100%', outline:'none', resize:'vertical', minHeight:'70px', boxSizing:'border-box' },
  select:    { background:'var(--cream)', border:'1px solid var(--border)', borderRadius:'8px', color:'var(--text-primary)', padding:'8px 12px', fontSize:'0.9rem', width:'100%', outline:'none' },
  btnPrimary:{ background:'var(--orange)', color:'#fff', border:'none', borderRadius:'8px', padding:'9px 18px', fontWeight:700, cursor:'pointer', fontSize:'0.9rem', width:'100%' },
  btnDanger: { background:'#3a1a1a', color:'#ff6b6b', border:'1px solid #5a2a2a', borderRadius:'8px', padding:'6px 12px', cursor:'pointer', fontSize:'0.85rem' },
  btnGhost:  { background:'transparent', border:'none', cursor:'pointer', fontSize:'1.1rem', padding:'4px 8px' },
  label:     { fontSize:'0.82rem', color:'var(--text-muted)', marginBottom:'4px', display:'block' },
  divider:   { border:'none', borderTop:'1px solid var(--border-soft)', margin:'16px 0' },
  badge:     (color) => ({ background:color, color:'var(--text-primary)', padding:'2px 8px', borderRadius:'10px', fontSize:'0.78rem', fontWeight:600, display:'inline-block' }),
  row:       { display:'flex', gap:'12px', alignItems:'flex-start' },
  calCell:   (bg, border, color) => ({ background:bg, border:`2px solid ${border}`, borderRadius:'8px', padding:'6px', textAlign:'center', minHeight:'70px', color, margin:'2px', fontSize:'0.8rem' }),
  info:      { background:'#EBF8FF', border:'1px solid #BEE3F8', borderRadius:'8px', padding:'12px 16px', color:'#2C5282', fontSize:'0.88rem', marginTop:'8px' },
};

const PRIORIDADES = ['🔴 Alta', '🟡 Media', '🟢 Baja'];
const PRIOR_COLOR = { '🔴 Alta':'#FF4B4B', '🟡 Media':'#FFA500', '🟢 Baja':'#21C354' };
const PRIOR_ORDEN = { '🔴 Alta':0, '🟡 Media':1, '🟢 Baja':2 };

function Badge({ prioridad }) {
  return <span style={S.badge(PRIOR_COLOR[prioridad] || '#888')}>{prioridad}</span>;
}

function Expander({ titulo, children, defaultOpen=false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={S.expander}>
      <div style={S.expanderHeader} onClick={()=>setOpen(!open)}>
        <span>{titulo}</span>
        <span style={{ fontSize:'0.8rem' }}>{open ? '▲' : '▼'}</span>
      </div>
      {open && <div style={S.expanderBody}>{children}</div>}
    </div>
  );
}

// ── Tab 1: Pendientes ──────────────────────────────────────────────────────
function TabPendientes() {
  const [tareas, setTareas]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [filtro, setFiltro]       = useState('Todas');
  const [titulo, setTitulo]       = useState('');
  const [notas, setNotas]         = useState('');
  const [prior, setPrior]         = useState('🔴 Alta');
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg]             = useState('');

  const cargar = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('vega_tareas').select('*').eq('estado','activa');
    const sorted = (data||[]).sort((a,b)=>(PRIOR_ORDEN[a.prioridad]||9)-(PRIOR_ORDEN[b.prioridad]||9));
    setTareas(sorted);
    setLoading(false);
  }, []);

  useEffect(()=>{ cargar(); }, [cargar]);

  const ahora = () => {
    const now = new Date();
    return `${String(now.getDate()).padStart(2,'0')}/${String(now.getMonth()+1).padStart(2,'0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  };

  const agregar = async () => {
    if (!titulo.trim()) { setMsg('⚠️ La tarea necesita un nombre.'); return; }
    setGuardando(true);
    const id = Date.now().toString();
    await supabase.from('vega_tareas').upsert({
      id, titulo:titulo.trim(), prioridad:prior, notas:notas.trim(),
      estado:'activa', creada:ahora(), completada:null
    });
    setTitulo(''); setNotas(''); setPrior('🔴 Alta');
    setMsg('✅ Tarea agregada.'); setGuardando(false);
    cargar();
    setTimeout(()=>setMsg(''), 3000);
  };

  const completar = async (tarea) => {
    await supabase.from('vega_tareas').update({ estado:'completada', completada:ahora() }).eq('id', tarea.id);
    cargar();
  };

  const eliminar = async (id) => {
    await supabase.from('vega_tareas').delete().eq('id', id);
    cargar();
  };

  const filtradas = filtro === 'Todas' ? tareas : tareas.filter(t=>t.prioridad===filtro);

  return (
    <div>
      <h3 style={{ color:'var(--text-primary)', marginTop:0 }}>📖 Tareas pendientes</h3>

      <Expander titulo="✍️ Agregar nueva tarea">
        <div style={{ display:'grid', gridTemplateColumns:'1fr 200px', gap:'16px' }}>
          <div>
            <label style={S.label}>Tarea</label>
            <input style={S.input} placeholder="¿Qué hay que hacer?" value={titulo} onChange={e=>setTitulo(e.target.value)}/>
            <div style={{ marginTop:'10px' }}>
              <label style={S.label}>Notas (opcional)</label>
              <textarea style={S.textarea} placeholder="Contexto, detalles..." value={notas} onChange={e=>setNotas(e.target.value)}/>
            </div>
          </div>
          <div>
            <label style={S.label}>Prioridad</label>
            <select style={S.select} value={prior} onChange={e=>setPrior(e.target.value)}>
              {PRIORIDADES.map(p=><option key={p}>{p}</option>)}
            </select>
            <div style={{ marginTop:'32px' }}>
              <button style={S.btnPrimary} onClick={agregar} disabled={guardando}>
                {guardando ? 'Guardando...' : '➕ Agregar'}
              </button>
            </div>
          </div>
        </div>
        {msg && <div style={{ marginTop:'10px', color: msg.startsWith('⚠️') ? '#FFA500' : '#21C354', fontSize:'0.88rem' }}>{msg}</div>}
      </Expander>

      <hr style={S.divider}/>
      <div style={{ display:'flex', gap:'8px', marginBottom:'16px', flexWrap:'wrap' }}>
        {['Todas','🔴 Alta','🟡 Media','🟢 Baja'].map(f=>(
          <button key={f}
            style={{ ...S.tab, ...(filtro===f ? S.tabActive : {}), borderRadius:'20px', marginBottom:0 }}
            onClick={()=>setFiltro(f)}>
            {f}
          </button>
        ))}
      </div>

      {loading ? <div style={{ color:'var(--text-muted)' }}>Cargando...</div>
      : filtradas.length===0
        ? <div style={S.info}>🕊️ No hay tareas pendientes.</div>
        : <>
          <div style={{ color:'var(--text-muted)', fontSize:'0.85rem', marginBottom:'12px' }}>
            <strong style={{ color:'var(--text-primary)' }}>{filtradas.length}</strong> tarea(s) pendiente(s)
          </div>
          {filtradas.map(t=>(
            <div key={t.id} style={{ ...S.card, display:'flex', gap:'12px', alignItems:'flex-start' }}>
              <input type="checkbox" style={{ marginTop:'4px', cursor:'pointer', accentColor:'#c8a84b' }}
                onChange={()=>completar(t)}/>
              <div style={{ flex:1 }}>
                <div style={{ marginBottom:'4px' }}>
                  <Badge prioridad={t.prioridad}/>&nbsp;&nbsp;
                  <strong style={{ color:'var(--text-primary)' }}>{t.titulo}</strong>
                </div>
                {t.notas && <div style={{ fontSize:'0.83rem', color:'var(--text-muted)', marginBottom:'4px' }}>📝 {t.notas}</div>}
                <div style={{ fontSize:'0.78rem', color:'var(--text-muted)' }}>Creada el {t.creada}</div>
              </div>
              <button style={S.btnGhost} onClick={()=>eliminar(t.id)} title="Eliminar">🗑️</button>
            </div>
          ))}
        </>
      }
    </div>
  );
}

// ── Tab 2: Recurrentes ────────────────────────────────────────────────────
function TabRecurrentes() {
  const [recs, setRecs]           = useState([]);
  const [loading, setLoading]     = useState(true);
  const [dia, setDia]             = useState(1);
  const [titulo, setTitulo]       = useState('');
  const [notas, setNotas]         = useState('');
  const [msg, setMsg]             = useState('');
  const [guardando, setGuardando] = useState(false);

  const hoy = new Date();
  const diasMes = new Date(hoy.getFullYear(), hoy.getMonth()+1, 0).getDate();
  const nombreMes = hoy.toLocaleString('es-CR', { month:'long', year:'numeric' });

  const cargar = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('vega_recurrentes').select('*');
    const sorted = (data||[]).sort((a,b)=>a.dia-b.dia);
    setRecs(sorted);
    setLoading(false);
  }, []);

  useEffect(()=>{ cargar(); }, [cargar]);

  const guardar = async () => {
    if (!titulo.trim()) { setMsg('⚠️ La tarea necesita un nombre.'); return; }
    setGuardando(true);
    await supabase.from('vega_recurrentes').upsert({
      id: Date.now().toString(), dia: parseInt(dia), titulo:titulo.trim(), notas:notas.trim()
    });
    setTitulo(''); setNotas(''); setDia(1);
    setMsg('✅ Tarea recurrente guardada.'); setGuardando(false);
    cargar();
    setTimeout(()=>setMsg(''), 3000);
  };

  const eliminar = async (id) => {
    await supabase.from('vega_recurrentes').delete().eq('id', id);
    cargar();
  };

  const hoyDate = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());

  return (
    <div>
      <h3 style={{ color:'var(--text-primary)', marginTop:0 }}>📜 Tareas recurrentes</h3>
      <div style={{ fontSize:'0.83rem', color:'var(--text-muted)', marginBottom:'16px' }}>Las tareas que se repiten cada mes.</div>

      <Expander titulo="⚡ Agregar tarea mensual recurrente">
        <div style={{ display:'grid', gridTemplateColumns:'100px 1fr', gap:'16px' }}>
          <div>
            <label style={S.label}>Día del mes</label>
            <input style={S.input} type="number" min={1} max={31} value={dia} onChange={e=>setDia(e.target.value)}/>
          </div>
          <div>
            <label style={S.label}>Tarea recurrente</label>
            <input style={S.input} placeholder="Ej: Pagar leasing Toyota" value={titulo} onChange={e=>setTitulo(e.target.value)}/>
            <div style={{ marginTop:'10px' }}>
              <label style={S.label}>Notas</label>
              <input style={S.input} placeholder="Detalles adicionales..." value={notas} onChange={e=>setNotas(e.target.value)}/>
            </div>
          </div>
        </div>
        <div style={{ marginTop:'14px' }}>
          <button style={{ ...S.btnPrimary, width:'auto', padding:'9px 24px' }} onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando...' : '⚡ Guardar recurrente'}
          </button>
        </div>
        {msg && <div style={{ marginTop:'10px', color: msg.startsWith('⚠️') ? '#FFA500' : '#21C354', fontSize:'0.88rem' }}>{msg}</div>}
      </Expander>

      <hr style={S.divider}/>
      <h4 style={{ color:'var(--orange)', textTransform:'capitalize' }}>📅 {nombreMes}</h4>

      {loading ? <div style={{ color:'var(--text-muted)' }}>Cargando...</div>
      : recs.length===0
        ? <div style={S.info}>📭 No hay tareas recurrentes todavía.</div>
        : recs.map(rec => {
            const diaEfectivo = Math.min(rec.dia, diasMes);
            const fecha = new Date(hoy.getFullYear(), hoy.getMonth(), diaEfectivo);
            const pasado = fecha < hoyDate;
            const esHoy  = fecha.getTime() === hoyDate.getTime();
            const diasFaltan = Math.round((fecha - hoyDate) / 86400000);

            let bg='#1a2a35', border='#3d8ef8', color='#e0e0e0', icono='⏳';
            if (esHoy)  { bg='#3a2e00'; border='#FFA500'; color='#ffe08a'; icono='🔥'; }
            if (pasado) { bg='#2a2a2a'; border='#555';    color='#888';    icono='✅'; }

            return (
              <div key={rec.id} style={{ display:'flex', gap:'8px', alignItems:'center', marginBottom:'10px' }}>
                <div style={{ flex:1, background:bg, border:`1px solid ${border}`, borderRadius:'8px', padding:'10px 14px', color, borderLeft:`4px solid ${border}` }}>
                  <div>
                    {icono} <strong>Día {rec.dia}</strong> — {rec.titulo}
                    {esHoy  && <span style={{ color:'#FFA500', fontWeight:'bold', marginLeft:'8px' }}>¡HOY!</span>}
                    {!pasado && !esHoy && <span style={{ color:'#2C5282', fontWeight:'bold', marginLeft:'8px' }}>faltan {diasFaltan} día(s)</span>}
                  </div>
                  {rec.notas && <div style={{ fontSize:'0.8rem', color:'var(--text-muted)', marginTop:'4px' }}>📝 {rec.notas}</div>}
                </div>
                <button style={S.btnGhost} onClick={()=>eliminar(rec.id)}>🗑️</button>
              </div>
            );
          })
      }
    </div>
  );
}

// ── Tab 3: Calendario ─────────────────────────────────────────────────────
function TabCalendario() {
  const [recs, setRecs]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [diaVer, setDiaVer]   = useState(new Date().getDate());

  const hoy = new Date();
  const hoyDate = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const diasMes = new Date(hoy.getFullYear(), hoy.getMonth()+1, 0).getDate();
  const nombreMes = hoy.toLocaleString('es-CR', { month:'long', year:'numeric' });
  const primerDia = new Date(hoy.getFullYear(), hoy.getMonth(), 1).getDay();
  const offsetLun = (primerDia + 6) % 7;

  useEffect(()=>{
    supabase.from('vega_recurrentes').select('*').then(({data})=>{
      setRecs(data||[]);
      setLoading(false);
    });
  }, []);

  const mapaDias = {};
  recs.forEach(r => {
    const d = Math.min(r.dia, diasMes);
    if (!mapaDias[d]) mapaDias[d] = [];
    mapaDias[d].push(r);
  });

  const diasSemana = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];

  const renderCelda = (dia) => {
    if (!dia) return <div style={{ minHeight:'70px' }}/>;
    const fecha = new Date(hoy.getFullYear(), hoy.getMonth(), dia);
    const esHoy = fecha.getTime() === hoyDate.getTime();
    const pasado = fecha < hoyDate;
    const tareasD = mapaDias[dia] || [];
    const n = tareasD.length;

    let bg='#1e2530', border='#333', color='#8899aa';
    if (esHoy)        { bg='#3a2e00'; border='#FFA500'; color='#ffe08a'; }
    else if (pasado)  { bg='#1e1e1e'; border='#555';    color='#666'; }
    else if (n > 0)   { bg='#1a2a35'; border='#3d8ef8'; color='#e0e0e0'; }

    return (
      <div style={S.calCell(bg, border, color)}>
        <div style={{ fontWeight:'bold', fontSize:'1rem' }}>{dia}</div>
        {n > 0 && <div style={{ fontSize:'0.6rem', color:'#3d8ef8' }}>{'● '.repeat(Math.min(n,3))}</div>}
        {tareasD.slice(0,2).map((t,i)=>(
          <div key={i} style={{ fontSize:'0.6rem', color:'#2C5282', overflow:'hidden', whiteSpace:'nowrap', textOverflow:'ellipsis' }}>
            {t.titulo.length>12 ? t.titulo.slice(0,12)+'…' : t.titulo}
          </div>
        ))}
        {n > 2 && <div style={{ fontSize:'0.6rem', color:'#888' }}>+más</div>}
      </div>
    );
  };

  // construir semanas
  const celdas = [...Array(offsetLun).fill(null), ...Array.from({length:diasMes},(_,i)=>i+1)];
  while (celdas.length % 7 !== 0) celdas.push(null);
  const semanas = [];
  for (let i=0; i<celdas.length; i+=7) semanas.push(celdas.slice(i,i+7));

  const tareasDelDia = mapaDias[diaVer] || [];

  return (
    <div>
      <h3 style={{ color:'var(--text-primary)', marginTop:0 }}>📅 Calendario de Pagos</h3>
      <div style={{ fontSize:'0.83rem', color:'var(--text-muted)', marginBottom:'16px' }}>Vista mensual compacta de tus tareas recurrentes.</div>
      <h4 style={{ color:'var(--orange)', textTransform:'capitalize', marginBottom:'12px' }}>{nombreMes}</h4>

      {loading ? <div style={{ color:'var(--text-muted)' }}>Cargando...</div> : <>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(7, 1fr)', gap:'2px', marginBottom:'4px' }}>
          {diasSemana.map(d=>(
            <div key={d} style={{ textAlign:'center', fontWeight:'bold', color:'var(--text-muted)', fontSize:'0.82rem', padding:'4px 0' }}>{d}</div>
          ))}
        </div>
        {semanas.map((sem,i)=>(
          <div key={i} style={{ display:'grid', gridTemplateColumns:'repeat(7, 1fr)', gap:'2px', marginBottom:'2px' }}>
            {sem.map((dia,j)=><div key={j}>{renderCelda(dia)}</div>)}
          </div>
        ))}

        <hr style={S.divider}/>
        <h4 style={{ color:'var(--text-primary)' }}>🔍 Detalle del día</h4>
        <div style={{ display:'flex', alignItems:'center', gap:'12px', marginBottom:'12px' }}>
          <label style={S.label}>Ver tareas del día:</label>
          <input style={{ ...S.input, width:'80px' }} type="number" min={1} max={diasMes} value={diaVer} onChange={e=>setDiaVer(parseInt(e.target.value))}/>
        </div>

        {tareasDelDia.length > 0
          ? tareasDelDia.map((t,i)=>(
            <div key={i} style={{ background:'#1a2a35', borderRadius:'8px', padding:'12px', margin:'6px 0', borderLeft:'4px solid #3d8ef8' }}>
              <div style={{ fontWeight:'bold', color:'#e0e0e0' }}>⏰ Día {t.dia} — {t.titulo}</div>
              {t.notas && <div style={{ fontSize:'0.83rem', color:'var(--text-muted)', marginTop:'4px' }}>📝 {t.notas}</div>}
            </div>
          ))
          : <div style={S.info}>📭 El día {diaVer} no tiene tareas recurrentes.</div>
        }
      </>}
    </div>
  );
}

// ── Tab 4: Completadas ────────────────────────────────────────────────────
function TabCompletadas() {
  const [completadas, setCompletadas] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [buscar, setBuscar]           = useState('');
  const [confirmando, setConfirmando] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('vega_tareas').select('*').eq('estado','completada');
    const sorted = (data||[]).sort((a,b)=>(b.completada||'').localeCompare(a.completada||''));
    setCompletadas(sorted);
    setLoading(false);
  }, []);

  useEffect(()=>{ cargar(); }, [cargar]);

  const borrarTodas = async () => {
    await supabase.from('vega_tareas').delete().eq('estado','completada');
    setConfirmando(false);
    cargar();
  };

  const filtradas = buscar
    ? completadas.filter(t => t.titulo.toLowerCase().includes(buscar.toLowerCase()) || (t.notas||'').toLowerCase().includes(buscar.toLowerCase()))
    : completadas;

  return (
    <div>
      <h3 style={{ color:'var(--text-primary)', marginTop:0 }}>🍞 Tareas completadas</h3>

      {loading ? <div style={{ color:'var(--text-muted)' }}>Cargando...</div>
      : completadas.length===0
        ? <div style={S.info}>🕊️ Ninguna tarea completada todavía.</div>
        : <>
          <div style={{ color:'var(--text-muted)', fontSize:'0.85rem', marginBottom:'12px' }}>
            <strong style={{ color:'var(--text-primary)' }}>{completadas.length}</strong> tarea(s) completada(s)
          </div>
          <input style={{ ...S.input, maxWidth:'350px', marginBottom:'16px' }}
            placeholder="🔍 Buscar..." value={buscar} onChange={e=>setBuscar(e.target.value)}/>

          {filtradas.map(t=>(
            <div key={t.id} style={{ ...S.card, opacity:0.75 }}>
              <div style={{ marginBottom:'6px' }}>
                <s style={{ color:'var(--text-muted)' }}>{t.titulo}</s>&nbsp;&nbsp;
                <Badge prioridad={t.prioridad}/>
              </div>
              <div style={{ display:'flex', gap:'20px', fontSize:'0.78rem', color:'var(--text-muted)' }}>
                <span>📅 Creada: {t.creada}</span>
                <span>✅ Completada: {t.completada || '—'}</span>
              </div>
              {t.notas && <div style={{ fontSize:'0.8rem', color:'var(--text-muted)', marginTop:'4px' }}>📝 {t.notas}</div>}
            </div>
          ))}

          <hr style={S.divider}/>
          {!confirmando
            ? <button style={{ ...S.btnDanger }} onClick={()=>setConfirmando(true)}>🔥 Borrar historial de completadas</button>
            : <div style={{ display:'flex', gap:'12px', alignItems:'center' }}>
                <span style={{ color:'#ff6b6b', fontSize:'0.88rem' }}>¿Estás seguro? Esto borrará todas las completadas.</span>
                <button style={{ ...S.btnDanger }} onClick={borrarTodas}>Sí, borrar</button>
                <button style={{ background:'var(--cream)', border:'1px solid var(--border)', color:'var(--text-primary)', borderRadius:'8px', padding:'6px 12px', cursor:'pointer' }} onClick={()=>setConfirmando(false)}>Cancelar</button>
              </div>
          }
        </>
      }
    </div>
  );
}

// ── Vista principal ───────────────────────────────────────────────────────
export default function VegaTareas() {
  const [tab, setTab] = useState(0);
  const tabs = ['📖 Pendientes', '📜 Recurrentes', '📅 Calendario', '🍞 Completadas'];

  const ahora = new Date().toLocaleString('es-CR');

  return (
    <div style={S.page}>
      <div style={S.header}>
        <h1 style={S.title}>⭐ Vega – Tareas</h1>
        <div style={S.caption}>☁️ Sincronizado en la nube · {ahora} · SOL</div>
      </div>

      <div style={S.tabs}>
        {tabs.map((t,i)=>(
          <button key={i} style={{ ...S.tab, ...(tab===i ? S.tabActive : {}) }} onClick={()=>setTab(i)}>{t}</button>
        ))}
      </div>

      {tab===0 && <TabPendientes/>}
      {tab===1 && <TabRecurrentes/>}
      {tab===2 && <TabCalendario/>}
      {tab===3 && <TabCompletadas/>}
    </div>
  );
}
