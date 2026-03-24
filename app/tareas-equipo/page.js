'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/useAuth';

const TEAM = ['Luis Jimenez','Rebeca Jimenez','Marcela','Alejandra','Laura','Anthony Nuñez'];
const GOLD = '#c8a84b';
const card = {background:'rgba(255,255,255,0.55)',backdropFilter:'blur(24px) saturate(1.8)',WebkitBackdropFilter:'blur(24px) saturate(1.8)',border:'1px solid rgba(255,255,255,0.6)',borderRadius:20,padding:'20px',marginBottom:'16px',boxShadow:'0 4px 30px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.8)'};
const priColors = {alta:'#e53e3e',media:GOLD,baja:'#38a169'};
const priIcons = {alta:'\ud83d\udd34',media:'\ud83d\udfe1',baja:'\ud83d\udfe2'};
const estadoColors = {pendiente:'#ed8936',en_proceso:'#3182ce',finalizada:'#38a169',cancelada:'#a0aec0'};
const fmt = d => d ? new Date(d+'T00:00:00').toLocaleDateString('es-CR',{day:'2-digit',month:'2-digit',year:'numeric'}) : '';
const fmtDT = d => d ? new Date(d).toLocaleDateString('es-CR',{day:'2-digit',month:'2-digit',year:'numeric'}) : '';
const today = () => new Date().toISOString().split('T')[0];
const daysBetween = (a,b) => Math.round((new Date(b)-new Date(a))/(86400000));

const blank = () => ({titulo:'',descripcion:'',asignado_a:'',solicitado_por:'',prioridad:'media',fecha_limite:'',observaciones:''});

export default function TareasEquipoPage(){
  const {perfil} = useAuth();
  const [tareas,setTareas] = useState([]);
  const [tab,setTab] = useState('activas');
  const [showForm,setShowForm] = useState(false);
  const [form,setForm] = useState(blank());
  const [editId,setEditId] = useState(null);
  const [loading,setLoading] = useState(true);

  const fetchTareas = async () => {
    const {data} = await supabase.from('tareas_equipo').select('*').order('creado_en',{ascending:false});
    setTareas(data||[]); setLoading(false);
  };
  useEffect(()=>{fetchTareas()},[]);

  const save = async () => {
    if(!form.titulo.trim()) return alert('El titulo es requerido');
    const row = {...form, solicitado_por:form.solicitado_por||perfil?.nombre||''};
    if(editId){
      await supabase.from('tareas_equipo').update({...row,actualizado_en:new Date().toISOString()}).eq('id',editId);
      setEditId(null);
    } else {
      await supabase.from('tareas_equipo').insert({...row,estado:'pendiente',fecha_solicitud:today()});
    }
    setForm(blank()); setShowForm(false); fetchTareas();
  };

  const updateEstado = async (id,estado) => {
    const upd = {estado,actualizado_en:new Date().toISOString()};
    if(estado==='finalizada') upd.fecha_finalizada = new Date().toISOString();
    await supabase.from('tareas_equipo').update(upd).eq('id',id);
    fetchTareas();
  };

  const startEdit = t => {
    setForm({titulo:t.titulo,descripcion:t.descripcion||'',asignado_a:t.asignado_a||'',solicitado_por:t.solicitado_por||'',prioridad:t.prioridad||'media',fecha_limite:t.fecha_limite||'',observaciones:t.observaciones||''});
    setEditId(t.id); setShowForm(true); window.scrollTo({top:0,behavior:'smooth'});
  };

  const pendientes = tareas.filter(t=>t.estado==='pendiente');
  const enProceso = tareas.filter(t=>t.estado==='en_proceso');
  const finalizadas = tareas.filter(t=>t.estado==='finalizada');
  const vencidas = tareas.filter(t=>(t.estado==='pendiente'||t.estado==='en_proceso')&&t.fecha_limite&&t.fecha_limite<today());

  const sortActivas = arr => [...arr].sort((a,b)=>{
    const po = {alta:0,media:1,baja:2};
    if(po[a.prioridad]!==po[b.prioridad]) return po[a.prioridad]-po[b.prioridad];
    if(a.fecha_limite&&b.fecha_limite) return a.fecha_limite.localeCompare(b.fecha_limite);
    if(a.fecha_limite) return -1; if(b.fecha_limite) return 1;
    return (b.fecha_solicitud||'').localeCompare(a.fecha_solicitud||'');
  });

  const filtered = tab==='activas' ? sortActivas(tareas.filter(t=>t.estado==='pendiente'||t.estado==='en_proceso'))
    : tab==='finalizadas' ? [...finalizadas].sort((a,b)=>(b.fecha_finalizada||'').localeCompare(a.fecha_finalizada||''))
    : tareas;

  const btn = (label,onClick,bg=GOLD,color='#fff') => (
    <button onClick={onClick} style={{background:bg,color,border:bg==='transparent'?'1px solid rgba(0,0,0,0.15)':'none',borderRadius:10,padding:'8px 18px',cursor:'pointer',fontFamily:'Rubik,sans-serif',fontSize:13,fontWeight:500}} >{label}</button>
  );

  const kpi = (label,count,color) => (
    <div style={{...card,flex:1,textAlign:'center',minWidth:120}}>
      <div style={{fontSize:28,fontWeight:700,color,fontFamily:'Rubik,sans-serif'}}>{count}</div>
      <div style={{fontSize:12,color:'rgba(0,0,0,0.5)',fontFamily:'Rubik,sans-serif',marginTop:4}}>{label}</div>
    </div>
  );

  const renderForm = () => (
    <div style={{...card,marginBottom:24}}>
      <div style={{fontSize:16,fontWeight:600,color:'rgba(0,0,0,0.85)',fontFamily:'Rubik,sans-serif',marginBottom:14}}>{editId?'Editar Tarea':'Nueva Tarea'}</div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
        <div style={{gridColumn:'1/-1'}}>
          <label style={lbl}>Titulo *</label>
          <input value={form.titulo} onChange={e=>setForm({...form,titulo:e.target.value})} style={inp} placeholder="Titulo de la tarea"/>
        </div>
        <div style={{gridColumn:'1/-1'}}>
          <label style={lbl}>Descripcion</label>
          <textarea value={form.descripcion} onChange={e=>setForm({...form,descripcion:e.target.value})} style={{...inp,minHeight:60,resize:'vertical'}} />
        </div>
        <div>
          <label style={lbl}>Asignado a</label>
          <select value={form.asignado_a} onChange={e=>setForm({...form,asignado_a:e.target.value})} style={inp}>
            <option value="">Seleccionar...</option>
            {TEAM.map(m=><option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>Solicitado por</label>
          <select value={form.solicitado_por} onChange={e=>setForm({...form,solicitado_por:e.target.value})} style={inp}>
            <option value="">Seleccionar...</option>
            {TEAM.map(m=><option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>Prioridad</label>
          <div style={{display:'flex',gap:10,marginTop:4}}>
            {['alta','media','baja'].map(p=>(
              <label key={p} style={{display:'flex',alignItems:'center',gap:4,cursor:'pointer',fontSize:13,fontFamily:'Rubik,sans-serif',color:priColors[p],fontWeight:form.prioridad===p?700:400}}>
                <input type="radio" name="prioridad" checked={form.prioridad===p} onChange={()=>setForm({...form,prioridad:p})} />{p.charAt(0).toUpperCase()+p.slice(1)}
              </label>
            ))}
          </div>
        </div>
        <div>
          <label style={lbl}>Fecha limite</label>
          <input type="date" value={form.fecha_limite} onChange={e=>setForm({...form,fecha_limite:e.target.value})} style={inp}/>
        </div>
        <div style={{gridColumn:'1/-1'}}>
          <label style={lbl}>Observaciones</label>
          <textarea value={form.observaciones} onChange={e=>setForm({...form,observaciones:e.target.value})} style={{...inp,minHeight:50,resize:'vertical'}} />
        </div>
      </div>
      <div style={{display:'flex',gap:10,marginTop:14}}>
        {btn('Guardar',save)}
        {btn('Cancelar',()=>{setShowForm(false);setEditId(null);setForm(blank())},'transparent','rgba(0,0,0,0.6)')}
      </div>
    </div>
  );

  const renderTask = t => {
    const overdue = (t.estado==='pendiente'||t.estado==='en_proceso')&&t.fecha_limite&&t.fecha_limite<today();
    const dias = t.estado==='finalizada'&&t.fecha_solicitud&&t.fecha_finalizada ? daysBetween(t.fecha_solicitud,t.fecha_finalizada) : null;
    return (
      <div key={t.id} style={{...card,display:'flex',gap:14,alignItems:'flex-start'}}>
        <div style={{minWidth:36,textAlign:'center'}}>
          <span style={{fontSize:18}}>{priIcons[t.prioridad]||priIcons.media}</span>
          <div style={{fontSize:9,color:priColors[t.prioridad],fontWeight:600,fontFamily:'Rubik,sans-serif',marginTop:2}}>{(t.prioridad||'media').toUpperCase()}</div>
        </div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontWeight:600,fontSize:15,color:'rgba(0,0,0,0.85)',fontFamily:'Rubik,sans-serif'}}>{t.titulo}</div>
          {t.descripcion && <div style={{fontSize:13,color:'rgba(0,0,0,0.55)',fontFamily:'Rubik,sans-serif',marginTop:4}}>{t.descripcion.length>100?t.descripcion.slice(0,100)+'...':t.descripcion}</div>}
          <div style={{display:'flex',flexWrap:'wrap',gap:14,marginTop:8,fontSize:12,color:'rgba(0,0,0,0.5)',fontFamily:'Rubik,sans-serif'}}>
            {t.asignado_a && <span>Asignado a: <b>{t.asignado_a}</b></span>}
            {t.solicitado_por && <span>Solicitado por: <b>{t.solicitado_por}</b></span>}
            {t.fecha_limite && <span style={{color:overdue?'#e53e3e':'inherit',fontWeight:overdue?600:400}}>{'\ud83d\udcc5'} Limite: {fmt(t.fecha_limite)}{overdue?' (Vencida)':''}</span>}
          </div>
          {t.estado==='finalizada' && <div style={{fontSize:12,color:'#38a169',fontFamily:'Rubik,sans-serif',marginTop:6}}>Finalizada el {fmtDT(t.fecha_finalizada)}{dias!==null?` (${dias} dias)`:''}</div>}
        </div>
        <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:6}}>
          <span style={{fontSize:11,fontWeight:600,color:'#fff',background:estadoColors[t.estado]||'#a0aec0',borderRadius:8,padding:'3px 10px',fontFamily:'Rubik,sans-serif',whiteSpace:'nowrap'}}>{(t.estado||'').replace('_',' ')}</span>
          <div style={{display:'flex',gap:4}}>
            {t.estado==='pendiente' && btn('\u25b6 Iniciar',()=>updateEstado(t.id,'en_proceso'),'#3182ce')}
            {t.estado==='en_proceso' && btn('\u2705 Finalizar',()=>updateEstado(t.id,'finalizada'),'#38a169')}
            <button onClick={()=>startEdit(t)} style={{background:'transparent',border:'1px solid rgba(0,0,0,0.12)',borderRadius:8,padding:'6px 10px',cursor:'pointer',fontSize:14}} title="Editar">{'\u270f\ufe0f'}</button>
          </div>
        </div>
      </div>
    );
  };

  const lbl = {fontSize:12,color:'rgba(0,0,0,0.5)',fontFamily:'Rubik,sans-serif',display:'block',marginBottom:4};
  const inp = {width:'100%',padding:'9px 12px',borderRadius:10,border:'1px solid rgba(0,0,0,0.12)',fontSize:14,fontFamily:'Rubik,sans-serif',background:'rgba(255,255,255,0.7)',outline:'none',boxSizing:'border-box'};

  if(loading) return <div style={{textAlign:'center',padding:60,fontFamily:'Rubik,sans-serif',color:'rgba(0,0,0,0.4)'}}>Cargando tareas...</div>;

  const tabStyle = (active) => ({padding:'8px 20px',borderRadius:10,border:'none',cursor:'pointer',fontFamily:'Rubik,sans-serif',fontSize:13,fontWeight:active?600:400,background:active?GOLD:'rgba(255,255,255,0.5)',color:active?'#fff':'rgba(0,0,0,0.55)',transition:'all 0.2s'});

  // Auto-fill solicitado_por on first render
  useEffect(()=>{if(perfil?.nombre && !form.solicitado_por && showForm && !editId) setForm(f=>({...f,solicitado_por:perfil.nombre}))},[perfil,showForm,editId]);

  return (
    <div style={{maxWidth:900,margin:'0 auto',padding:'0 16px'}}>
      <div style={{marginBottom:24}}>
        <h1 style={{fontSize:26,fontWeight:700,color:'rgba(0,0,0,0.85)',fontFamily:'Rubik,sans-serif',margin:0}}>{'\ud83d\udccb'} Tareas del Equipo</h1>
        <p style={{fontSize:14,color:'rgba(0,0,0,0.5)',fontFamily:'Rubik,sans-serif',margin:'4px 0 0'}}>Asignacion y seguimiento de tareas internas</p>
      </div>

      <div style={{display:'flex',gap:8,marginBottom:20,flexWrap:'wrap',alignItems:'center'}}>
        <button style={tabStyle(tab==='activas')} onClick={()=>setTab('activas')}>Activas ({pendientes.length+enProceso.length})</button>
        <button style={tabStyle(tab==='finalizadas')} onClick={()=>setTab('finalizadas')}>Finalizadas ({finalizadas.length})</button>
        <button style={tabStyle(tab==='todas')} onClick={()=>setTab('todas')}>Todas ({tareas.length})</button>
        <div style={{flex:1}}/>
        {!showForm && btn('+ Nueva Tarea',()=>{setEditId(null);setForm(blank());setShowForm(true)})}
      </div>

      <div style={{display:'flex',gap:12,marginBottom:20,flexWrap:'wrap'}}>
        {kpi('Pendientes',pendientes.length,'#ed8936')}
        {kpi('En Proceso',enProceso.length,'#3182ce')}
        {kpi('Finalizadas',finalizadas.length,'#38a169')}
        {kpi('Vencidas',vencidas.length,'#e53e3e')}
      </div>

      {showForm && renderForm()}

      {filtered.length === 0
        ? <div style={{...card,textAlign:'center',color:'rgba(0,0,0,0.4)',fontFamily:'Rubik,sans-serif',padding:40}}>No hay tareas en esta vista</div>
        : filtered.map(renderTask)
      }
    </div>
  );
}
