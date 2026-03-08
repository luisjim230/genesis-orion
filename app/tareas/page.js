'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://xeeieqjqmtoiutfnltqu.supabase.co';
const SUPABASE_KEY = 'sb_publishable_TX8OYawDu3vjd1Upet2GbQ_SURnQqRs';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

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
  divider: { border: 'none', borderTop: '1px solid #1e2330', margin: '20px 0' },
  badge: (c) => ({ background: c+'22', color: c, border: `1px solid ${c}55`, borderRadius: '20px', padding: '3px 10px', fontSize: '0.72em', fontWeight: 600 }),
};

const PRIORIDAD = { Alta: '#fc8181', Media: '#f6ad55', Baja: '#68d391' };
const PRIORIDAD_ICON = { Alta: '🔴', Media: '🟡', Baja: '🟢' };
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function diasRestantes(fecha) {
  if (!fecha) return null;
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  const f = new Date(fecha + 'T00:00:00');
  return Math.ceil((f - hoy) / 86400000);
}

function colorDias(d) {
  if (d === null) return '#5a6a80';
  if (d < 0) return '#fc8181';
  if (d <= 3) return '#f6ad55';
  return '#68d391';
}

const TAREA_INIT = { titulo: '', descripcion: '', prioridad: 'Media', fecha_vencimiento: '', responsable: '', categoria: '' };
const RECUR_INIT = { titulo: '', descripcion: '', dia_mes: '1', responsable: '' };

export default function Tareas() {
  const [tab, setTab] = useState(0);
  const [tareas, setTareas] = useState([]);
  const [completadas, setCompletadas] = useState([]);
  const [recurrentes, setRecurrentes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(TAREA_INIT);
  const [editId, setEditId] = useState(null);
  const [showRecurForm, setShowRecurForm] = useState(false);
  const [recurForm, setRecurForm] = useState(RECUR_INIT);
  const [editRecurId, setEditRecurId] = useState(null);
  const [msg, setMsg] = useState(null);
  const [calMes, setCalMes] = useState(new Date().getMonth());
  const [calAnio, setCalAnio] = useState(new Date().getFullYear());

  useEffect(() => { cargar(); }, []);

  async function cargar() {
    setLoading(true);
    const [{ data: pend }, { data: comp }, { data: recur }] = await Promise.all([
      supabase.from('vega_tareas').select('*').eq('completada', false).order('fecha_vencimiento', { ascending: true, nullsFirst: false }),
      supabase.from('vega_tareas').select('*').eq('completada', true).order('updated_at', { ascending: false }).limit(30),
      supabase.from('vega_recurrentes').select('*').order('dia_mes', { ascending: true }),
    ]);
    setTareas(pend || []); setCompletadas(comp || []); setRecurrentes(recur || []);
    setLoading(false);
  }

  function mostrarMsg(texto, tipo='ok') { setMsg({ texto, tipo }); setTimeout(() => setMsg(null), 3000); }
  function setF(k, v) { setForm(f => ({ ...f, [k]: v })); }
  function setR(k, v) { setRecurForm(f => ({ ...f, [k]: v })); }

  async function guardarTarea() {
    if (!form.titulo) { mostrarMsg('El título es requerido.', 'err'); return; }
    if (editId) {
      await supabase.from('vega_tareas').update({ ...form }).eq('id', editId);
      mostrarMsg('Tarea actualizada.');
    } else {
      await supabase.from('vega_tareas').insert([{ ...form, completada: false }]);
      mostrarMsg('Tarea creada.');
    }
    setForm(TAREA_INIT); setEditId(null); setShowForm(false); cargar();
  }

  async function completar(id) {
    await supabase.from('vega_tareas').update({ completada: true }).eq('id', id);
    mostrarMsg('✅ Tarea completada.');
    cargar();
  }

  async function reabrir(id) {
    await supabase.from('vega_tareas').update({ completada: false }).eq('id', id);
    mostrarMsg('Tarea reabierta.');
    cargar();
  }

  async function eliminarTarea(id) {
    if (!confirm('¿Eliminar esta tarea?')) return;
    await supabase.from('vega_tareas').delete().eq('id', id);
    cargar();
  }

  async function guardarRecur() {
    if (!recurForm.titulo) { mostrarMsg('El título es requerido.', 'err'); return; }
    if (editRecurId) {
      await supabase.from('vega_recurrentes').update({ ...recurForm }).eq('id', editRecurId);
    } else {
      await supabase.from('vega_recurrentes').insert([{ ...recurForm }]);
    }
    setRecurForm(RECUR_INIT); setEditRecurId(null); setShowRecurForm(false);
    mostrarMsg('Tarea recurrente guardada.'); cargar();
  }

  async function eliminarRecur(id) {
    if (!confirm('¿Eliminar tarea recurrente?')) return;
    await supabase.from('vega_recurrentes').delete().eq('id', id);
    cargar();
  }

  // Calendario
  const primerDia = new Date(calAnio, calMes, 1).getDay();
  const diasEnMes = new Date(calAnio, calMes + 1, 0).getDate();
  const tareasDelMes = tareas.filter(t => {
    if (!t.fecha_vencimiento) return false;
    const f = new Date(t.fecha_vencimiento + 'T00:00:00');
    return f.getMonth() === calMes && f.getFullYear() === calAnio;
  });
  function tareasDelDia(dia) { return tareasDelMes.filter(t => new Date(t.fecha_vencimiento + 'T00:00:00').getDate() === dia); }

  return (
    <div style={S.page}>
      <div style={S.title}>✨ Matusalén – Tareas</div>
      <div style={S.sub}>Gestión de tareas y recordatorios · Corporación Rojimo S.A.</div>

      {msg && <div style={{ background: msg.tipo==='ok'?'#68d39122':'#fc818122', border: `1px solid ${msg.tipo==='ok'?'#68d391':'#fc8181'}55`, borderRadius: '8px', padding: '10px 16px', marginBottom: '16px', color: msg.tipo==='ok'?'#68d391':'#fc8181', fontSize: '0.85em' }}>{msg.tipo==='ok'?'✅':'❌'} {msg.texto}</div>}

      <div style={S.tabBar}>
        {['📋 Pendientes', '🔁 Recurrentes', '📅 Calendario', '✅ Completadas'].map((t, i) => (
          <button key={i} style={S.tab(tab===i)} onClick={() => setTab(i)}>{t}</button>
        ))}
      </div>

      {tab === 0 && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div style={{ fontSize: '0.85em', color: '#5a6a80' }}>{tareas.length} tareas pendientes</div>
            <button style={S.btn()} onClick={() => { setForm(TAREA_INIT); setEditId(null); setShowForm(!showForm); }}>➕ Nueva tarea</button>
          </div>

          {showForm && (
            <div style={S.card}>
              <div style={{ fontWeight: 700, color: '#fff', marginBottom: '16px' }}>{editId ? '✏️ Editar tarea' : '➕ Nueva tarea'}</div>
              <div style={{ marginBottom: '12px' }}><label style={S.label}>Título *</label><input style={S.input} value={form.titulo} onChange={e => setF('titulo', e.target.value)} /></div>
              <div style={{ marginBottom: '12px' }}><label style={S.label}>Descripción</label><textarea style={{ ...S.input, minHeight: '70px', resize: 'vertical' }} value={form.descripcion} onChange={e => setF('descripcion', e.target.value)} /></div>
              <div style={S.grid2}>
                <div><label style={S.label}>Prioridad</label>
                  <select style={S.input} value={form.prioridad} onChange={e => setF('prioridad', e.target.value)}>
                    {Object.keys(PRIORIDAD).map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div><label style={S.label}>Fecha de vencimiento</label><input style={S.input} type="date" value={form.fecha_vencimiento} onChange={e => setF('fecha_vencimiento', e.target.value)} /></div>
                <div><label style={S.label}>Responsable</label><input style={S.input} value={form.responsable} onChange={e => setF('responsable', e.target.value)} /></div>
                <div><label style={S.label}>Categoría</label><input style={S.input} value={form.categoria} onChange={e => setF('categoria', e.target.value)} /></div>
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
                <button style={S.btn()} onClick={guardarTarea}>💾 Guardar</button>
                <button style={S.btnSm()} onClick={() => { setShowForm(false); setForm(TAREA_INIT); setEditId(null); }}>Cancelar</button>
              </div>
            </div>
          )}

          {loading ? <div style={{ textAlign: 'center', padding: '40px', color: '#5a6a80' }}>Cargando...</div> : tareas.length === 0 ? (
            <div style={{ ...S.card, textAlign: 'center', color: '#5a6a80', padding: '40px' }}>🎉 Sin tareas pendientes</div>
          ) : tareas.map(t => {
            const d = diasRestantes(t.fecha_vencimiento);
            const dc = colorDias(d);
            return (
              <div key={t.id} style={{ ...S.card, borderLeft: `3px solid ${PRIORIDAD[t.prioridad] || '#5a6a80'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 700, color: '#fff' }}>{t.titulo}</span>
                      <span style={S.badge(PRIORIDAD[t.prioridad] || '#5a6a80')}>{PRIORIDAD_ICON[t.prioridad]} {t.prioridad}</span>
                      {t.categoria && <span style={S.badge('#63b3ed')}>{t.categoria}</span>}
                    </div>
                    {t.descripcion && <div style={{ fontSize: '0.84em', color: '#8899aa', marginBottom: '6px' }}>{t.descripcion}</div>}
                    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '0.78em' }}>
                      {t.fecha_vencimiento && <span style={{ color: dc }}>📅 {t.fecha_vencimiento} {d !== null && `· ${d < 0 ? `Vencida hace ${Math.abs(d)}d` : d === 0 ? 'Vence hoy' : `${d}d restantes`}`}</span>}
                      {t.responsable && <span style={{ color: '#5a6a80' }}>👤 {t.responsable}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                    <button style={S.btnSm('#1a3a1a')} onClick={() => completar(t.id)}>✅</button>
                    <button style={S.btnSm()} onClick={() => { setForm({ titulo: t.titulo, descripcion: t.descripcion||'', prioridad: t.prioridad, fecha_vencimiento: t.fecha_vencimiento||'', responsable: t.responsable||'', categoria: t.categoria||'' }); setEditId(t.id); setShowForm(true); }}>✏️</button>
                    <button style={S.btnSm('#3d1515')} onClick={() => eliminarTarea(t.id)}>🗑️</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === 1 && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div style={{ fontSize: '0.85em', color: '#5a6a80' }}>{recurrentes.length} tareas recurrentes</div>
            <button style={S.btn()} onClick={() => { setRecurForm(RECUR_INIT); setEditRecurId(null); setShowRecurForm(!showRecurForm); }}>➕ Nueva recurrente</button>
          </div>

          {showRecurForm && (
            <div style={S.card}>
              <div style={{ fontWeight: 700, color: '#fff', marginBottom: '16px' }}>{editRecurId ? '✏️ Editar' : '➕ Nueva tarea recurrente'}</div>
              <div style={{ marginBottom: '12px' }}><label style={S.label}>Título *</label><input style={S.input} value={recurForm.titulo} onChange={e => setR('titulo', e.target.value)} /></div>
              <div style={{ marginBottom: '12px' }}><label style={S.label}>Descripción</label><textarea style={{ ...S.input, minHeight: '60px', resize: 'vertical' }} value={recurForm.descripcion} onChange={e => setR('descripcion', e.target.value)} /></div>
              <div style={S.grid2}>
                <div><label style={S.label}>Día del mes (1-31)</label><input style={S.input} type="number" min="1" max="31" value={recurForm.dia_mes} onChange={e => setR('dia_mes', e.target.value)} /></div>
                <div><label style={S.label}>Responsable</label><input style={S.input} value={recurForm.responsable} onChange={e => setR('responsable', e.target.value)} /></div>
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
                <button style={S.btn()} onClick={guardarRecur}>💾 Guardar</button>
                <button style={S.btnSm()} onClick={() => { setShowRecurForm(false); setRecurForm(RECUR_INIT); }}>Cancelar</button>
              </div>
            </div>
          )}

          {recurrentes.length === 0 ? (
            <div style={{ ...S.card, textAlign: 'center', color: '#5a6a80', padding: '40px' }}>Sin tareas recurrentes registradas.</div>
          ) : recurrentes.map(r => {
            const hoy = new Date().getDate();
            const dia = parseInt(r.dia_mes);
            const diff = dia - hoy;
            const color = diff < 0 ? '#fc8181' : diff <= 3 ? '#f6ad55' : '#68d391';
            const label = diff < 0 ? `Venció hace ${Math.abs(diff)}d` : diff === 0 ? 'Vence hoy' : `${diff}d restantes`;
            return (
              <div key={r.id} style={{ ...S.card, borderLeft: `3px solid ${color}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontWeight: 700, color: '#fff', marginBottom: '4px' }}>🔁 {r.titulo}</div>
                    {r.descripcion && <div style={{ fontSize: '0.84em', color: '#8899aa', marginBottom: '6px' }}>{r.descripcion}</div>}
                    <div style={{ fontSize: '0.78em', display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
                      <span style={{ color }}>📅 Día {r.dia_mes} de cada mes · {label}</span>
                      {r.responsable && <span style={{ color: '#5a6a80' }}>👤 {r.responsable}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button style={S.btnSm()} onClick={() => { setRecurForm({ titulo: r.titulo, descripcion: r.descripcion||'', dia_mes: r.dia_mes, responsable: r.responsable||'' }); setEditRecurId(r.id); setShowRecurForm(true); }}>✏️</button>
                    <button style={S.btnSm('#3d1515')} onClick={() => eliminarRecur(r.id)}>🗑️</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === 2 && (
        <div style={S.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <button style={S.btnSm()} onClick={() => { if (calMes === 0) { setCalMes(11); setCalAnio(y => y-1); } else setCalMes(m => m-1); }}>◀</button>
            <div style={{ fontWeight: 700, color: '#fff', fontSize: '1.05em' }}>{MESES[calMes]} {calAnio}</div>
            <button style={S.btnSm()} onClick={() => { if (calMes === 11) { setCalMes(0); setCalAnio(y => y+1); } else setCalMes(m => m+1); }}>▶</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '4px', marginBottom: '8px' }}>
            {['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'].map(d => <div key={d} style={{ textAlign: 'center', fontSize: '0.72em', color: '#5a6a80', fontWeight: 600, padding: '4px' }}>{d}</div>)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '4px' }}>
            {Array.from({ length: primerDia }).map((_, i) => <div key={'e'+i} />)}
            {Array.from({ length: diasEnMes }).map((_, i) => {
              const dia = i + 1;
              const tds = tareasDelDia(dia);
              const hoy = new Date(); const esHoy = hoy.getDate()===dia && hoy.getMonth()===calMes && hoy.getFullYear()===calAnio;
              return (
                <div key={dia} style={{ background: esHoy ? '#252a35' : '#0f1115', border: `1px solid ${esHoy ? '#c8a84b' : '#1e2330'}`, borderRadius: '6px', padding: '6px', minHeight: '64px' }}>
                  <div style={{ fontSize: '0.78em', fontWeight: esHoy ? 700 : 400, color: esHoy ? '#c8a84b' : '#5a6a80', marginBottom: '4px' }}>{dia}</div>
                  {tds.map(t => <div key={t.id} style={{ fontSize: '0.65em', background: (PRIORIDAD[t.prioridad]||'#5a6a80')+'33', color: PRIORIDAD[t.prioridad]||'#5a6a80', borderRadius: '3px', padding: '2px 4px', marginBottom: '2px', lineHeight: 1.3 }}>{t.titulo.substring(0,18)}</div>)}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === 3 && (
        <div>
          <div style={{ fontSize: '0.85em', color: '#5a6a80', marginBottom: '14px' }}>{completadas.length} tareas completadas</div>
          {completadas.length === 0 ? <div style={{ ...S.card, textAlign: 'center', color: '#5a6a80', padding: '30px' }}>Sin tareas completadas.</div> : completadas.map(t => (
            <div key={t.id} style={{ ...S.card, opacity: 0.7 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 600, color: '#c9d1e0', textDecoration: 'line-through' }}>✅ {t.titulo}</div>
                  {t.fecha_vencimiento && <div style={{ fontSize: '0.78em', color: '#5a6a80', marginTop: '3px' }}>📅 {t.fecha_vencimiento}</div>}
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button style={S.btnSm()} onClick={() => reabrir(t.id)}>↩️ Reabrir</button>
                  <button style={S.btnSm('#3d1515')} onClick={() => eliminarTarea(t.id)}>🗑️</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
