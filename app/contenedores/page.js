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
  badge: (c) => ({ background: c+'22', color: c, border: `1px solid ${c}55`, borderRadius: '20px', padding: '3px 10px', fontSize: '0.72em', fontWeight: 600 }),
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

const ESTADOS_ACTIVOS = ['🏭 En producción', '🚢 En el mar', '🛳️ En puerto', '🚛 En tránsito CR', '🏬 En bodega'];
const TIPOS_CONT = ['20 pies', '40 pies', '40 pies HC', '45 pies'];

function fmtFecha(s) { return s ? s.substring(0, 10) : '—'; }
function fmtUSD(n) { return n ? `$${Number(n).toLocaleString('es-CR', { minimumFractionDigits: 2 })}` : '—'; }

const FORM_INIT = {
  proveedor: '', numero_contenedor: '', tipo_contenedor: '40 pies',
  fecha_embarque: '', fecha_eta: '', fecha_llegada_cr: '', fecha_retiro: '',
  estado: '🚢 En el mar', puerto_origen: '', naviera: '', bl_numero: '',
  adelanto_usd: '', pago_final_usd: '', flete_usd: '', impuestos_crc: '',
  transporte_crc: '', otros_crc: '', tipo_cambio: '',
  documentos_recibidos: false, despacho_aduanal: false, exonerado: false,
  notas: '',
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
    // Cargar TC compra BAC para conversión USD→CRC
    fetch('/api/mercado?fuente=bac')
      .then(r => r.json())
      .then(j => { if (j.ok && j.data?.compra) setTcBAC(j.data); })
      .catch(() => {});
  }, []);

  async function cargar() {
    setLoading(true);
    const { data: activos } = await supabase.from('neptuno_envios').select('*').neq('estado', '✅ Cerrado').order('created_at', { ascending: false });
    const { data: hist } = await supabase.from('neptuno_envios').select('*').eq('estado', '✅ Cerrado').order('created_at', { ascending: false }).limit(50);
    setEnvios(activos || []);
    setHistorial(hist || []);
    setLoading(false);
  }

  function setF(k, v) { setForm(f => ({ ...f, [k]: v })); }

  function mostrarMsg(texto, tipo = 'ok') {
    setMsg({ texto, tipo });
    setTimeout(() => setMsg(null), 3500);
  }

  async function guardar() {
    if (!form.proveedor || !form.numero_contenedor) { mostrarMsg('Proveedor y número de contenedor son requeridos.', 'err'); return; }
    setSaving(true);
    const payload = { ...form, adelanto_usd: form.adelanto_usd || null, pago_final_usd: form.pago_final_usd || null, flete_usd: form.flete_usd || null, impuestos_crc: form.impuestos_crc || null, transporte_crc: form.transporte_crc || null, otros_crc: form.otros_crc || null, tipo_cambio: form.tipo_cambio || null };
    if (editId) {
      await supabase.from('neptuno_envios').update(payload).eq('id', editId);
      mostrarMsg('Contenedor actualizado.');
    } else {
      await supabase.from('neptuno_envios').insert([payload]);
      mostrarMsg('Contenedor registrado.');
    }
    setForm(FORM_INIT); setEditId(null); setSaving(false);
    cargar(); setTab(0);
  }

  function editar(env) {
    setForm({ ...FORM_INIT, ...env });
    setEditId(env.id);
    setTab(1);
  }

  async function cerrar(id) {
    await supabase.from('neptuno_envios').update({ estado: '✅ Cerrado' }).eq('id', id);
    mostrarMsg('Contenedor cerrado y movido a historial.');
    cargar();
  }

  async function reactivar(id) {
    await supabase.from('neptuno_envios').update({ estado: '🏬 En bodega' }).eq('id', id);
    mostrarMsg('Contenedor reactivado.');
    cargar();
  }

  async function eliminar(id) {
    if (!confirm('¿Eliminar este registro permanentemente?')) return;
    await supabase.from('neptuno_envios').delete().eq('id', id);
    mostrarMsg('Registro eliminado.');
    cargar();
  }

  const totalFlete = envios.reduce((s, e) => s + (parseFloat(e.flete_usd) || 0), 0);
  const totalAdelanto = envios.reduce((s, e) => s + (parseFloat(e.adelanto_usd) || 0), 0);
  const tcCompra = tcBAC?.compra || null;
  const aCRC = (usd) => tcCompra ? `  ·  ₡${(usd * tcCompra).toLocaleString('es-CR', { maximumFractionDigits: 0 })}` : '';

  return (
    <div style={S.page}>
      <div style={S.title}>🌊 Jonás – Contenedores</div>
      <div style={S.sub}>Trazabilidad de importaciones · Corporación Rojimo S.A.</div>

      {msg && (
        <div style={{ background: msg.tipo === 'ok' ? '#68d39122' : '#fc818122', border: `1px solid ${msg.tipo === 'ok' ? '#68d391' : '#fc8181'}55`, borderRadius: '8px', padding: '10px 16px', marginBottom: '16px', color: msg.tipo === 'ok' ? '#68d391' : '#fc8181', fontSize: '0.85em' }}>
          {msg.tipo === 'ok' ? '✅' : '❌'} {msg.texto}
        </div>
      )}

      <div style={S.tabBar}>
        {['📦 Envíos Activos', '➕ Nuevo Envío', '📋 Historial'].map((t, i) => (
          <button key={i} style={S.tab(tab === i)} onClick={() => { setTab(i); setEditId(null); if (i !== 1) setForm(FORM_INIT); }}>{t}</button>
        ))}
      </div>

      {tab === 0 && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '12px', marginBottom: '20px' }}>
            {[['📦 Envíos activos', envios.length, '#63b3ed', ''], ['💵 Flete total activo', fmtUSD(totalFlete), '#c8a84b', aCRC(totalFlete)], ['💰 Adelantos pagados', fmtUSD(totalAdelanto), '#68d391', aCRC(totalAdelanto)]].map(([l, v, c, crc]) => (
              <div key={l} style={{ background: '#161920', border: `1px solid ${c}33`, borderTop: `3px solid ${c}`, borderRadius: '10px', padding: '14px 16px' }}>
                <div style={{ fontSize: '0.72em', color: '#5a6a80', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{l}</div>
                <div style={{ fontSize: '1.6em', fontWeight: 700, color: '#fff', marginTop: '4px' }}>{v}</div>
                {crc && <div style={{ fontSize: '0.75em', color: '#4ec9b0', marginTop: '2px' }}>{crc}{tcBAC?.esFallback ? ' ~' : ''}</div>}
              </div>
            ))}
          </div>

          {loading ? <div style={{ textAlign: 'center', padding: '40px', color: '#5a6a80' }}>Cargando...</div> : envios.length === 0 ? (
            <div style={{ ...S.card, textAlign: 'center', color: '#5a6a80', padding: '40px' }}>No hay envíos activos. <span style={{ color: '#c8a84b', cursor: 'pointer' }} onClick={() => setTab(1)}>Registrá uno →</span></div>
          ) : envios.map(env => (
            <div key={env.id} style={{ ...S.card, borderLeft: `3px solid ${ESTADOS[env.estado] || '#5a6a80'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, color: '#fff', fontSize: '1em' }}>{env.numero_contenedor || env.proveedor}</span>
                    <span style={S.badge(ESTADOS[env.estado] || '#5a6a80')}>{env.estado}</span>
                    {env.tipo_contenedor && <span style={{ fontSize: '0.78em', color: '#5a6a80' }}>{env.tipo_contenedor}</span>}
                  </div>
                  <div style={{ fontSize: '0.85em', color: '#c9d1e0', marginTop: '4px' }}>{env.proveedor}</div>
                  {env.naviera && <div style={{ fontSize: '0.78em', color: '#5a6a80' }}>{env.naviera} · {env.puerto_origen}</div>}
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button style={S.btnSm()} onClick={() => setExpandido(expandido === env.id ? null : env.id)}>🔍 {expandido === env.id ? 'Menos' : 'Ver'}</button>
                  <button style={S.btnSm()} onClick={() => editar(env)}>✏️ Editar</button>
                  <button style={S.btnSm('#1e2330')} onClick={() => cerrar(env.id)}>📁 Cerrar</button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: '8px', marginTop: '14px' }}>
                {[['🚢 Embarque', fmtFecha(env.fecha_embarque), null], ['📅 ETA', fmtFecha(env.fecha_eta), null], ['🏳️ Llegada CR', fmtFecha(env.fecha_llegada_cr), null], ['🚛 Retiro', fmtFecha(env.fecha_retiro), null], ['💵 Flete', fmtUSD(env.flete_usd), env.flete_usd], ['💰 Adelanto', fmtUSD(env.adelanto_usd), env.adelanto_usd]].map(([l, v, usd]) => (
                  <div key={l} style={{ background: '#0f1115', borderRadius: '8px', padding: '8px 10px' }}>
                    <div style={{ fontSize: '0.65em', color: '#5a6a80' }}>{l}</div>
                    <div style={{ fontSize: '0.9em', fontWeight: 600, color: '#fff', marginTop: '2px' }}>{v}</div>
                    {usd && tcCompra && <div style={{ fontSize: '0.7em', color: '#4ec9b0', marginTop: '1px' }}>₡{(parseFloat(usd) * tcCompra).toLocaleString('es-CR', { maximumFractionDigits: 0 })}</div>}
                  </div>
                ))}
              </div>

              {expandido === env.id && (
                <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid #1e2330' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: '8px', marginBottom: '10px' }}>
                    {[['BL Número', env.bl_numero, null], ['Pago final', fmtUSD(env.pago_final_usd), env.pago_final_usd], ['Impuestos', env.impuestos_crc ? `₡${Number(env.impuestos_crc).toLocaleString()}` : '—', null], ['Transporte CR', env.transporte_crc ? `₡${Number(env.transporte_crc).toLocaleString()}` : '—', null], ['Otros', env.otros_crc ? `₡${Number(env.otros_crc).toLocaleString()}` : '—', null], ['TC BAC (compra)', tcCompra ? `₡${tcCompra.toFixed(2)}` : (env.tipo_cambio ? `₡${env.tipo_cambio}` : '—'), null]].map(([l, v, usd]) => (
                      <div key={l} style={{ background: '#0f1115', borderRadius: '8px', padding: '8px 10px' }}>
                        <div style={{ fontSize: '0.65em', color: '#5a6a80' }}>{l}</div>
                        <div style={{ fontSize: '0.87em', color: '#fff' }}>{v || '—'}</div>
                        {usd && tcCompra && <div style={{ fontSize: '0.72em', color: '#4ec9b0', marginTop: '2px' }}>₡{(parseFloat(usd) * tcCompra).toLocaleString('es-CR', { maximumFractionDigits: 0 })}</div>}
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: '12px', marginBottom: '8px', flexWrap: 'wrap' }}>
                    {[['📄 Docs recibidos', env.documentos_recibidos], ['🛃 Despacho aduanal', env.despacho_aduanal], ['✅ Exonerado', env.exonerado]].map(([l, v]) => (
                      <span key={l} style={{ fontSize: '0.78em', color: v ? '#68d391' : '#5a6a80' }}>{v ? '✅' : '⬜'} {l}</span>
                    ))}
                  </div>
                  {env.notas && <div style={{ fontSize: '0.82em', color: '#8899aa', background: '#0f1115', borderRadius: '8px', padding: '10px' }}>📝 {env.notas}</div>}
                  <div style={{ marginTop: '10px' }}>
                    <button style={S.btnSm('#3d1515')} onClick={() => eliminar(env.id)}>🗑️ Eliminar registro</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 1 && (
        <div style={S.card}>
          <div style={{ fontWeight: 700, color: '#fff', marginBottom: '20px', fontSize: '1.05em' }}>{editId ? '✏️ Editar contenedor' : '➕ Registrar nuevo contenedor'}</div>
          <div style={{ fontWeight: 600, color: '#c8a84b', fontSize: '0.8em', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px' }}>Datos generales</div>
          <div style={S.grid2}>
            {[['proveedor', 'Proveedor / Exportador', 'text'], ['numero_contenedor', 'Número de contenedor', 'text'], ['naviera', 'Naviera', 'text'], ['puerto_origen', 'Puerto de origen', 'text'], ['bl_numero', 'BL / AWB número', 'text']].map(([k, l, t]) => (
              <div key={k}><label style={S.label}>{l}</label><input style={S.input} type={t} value={form[k]} onChange={e => setF(k, e.target.value)} /></div>
            ))}
            <div><label style={S.label}>Tipo de contenedor</label>
              <select style={S.input} value={form.tipo_contenedor} onChange={e => setF('tipo_contenedor', e.target.value)}>
                {TIPOS_CONT.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div><label style={S.label}>Estado</label>
              <select style={S.input} value={form.estado} onChange={e => setF('estado', e.target.value)}>
                {Object.keys(ESTADOS).map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <hr style={S.divider} />
          <div style={{ fontWeight: 600, color: '#c8a84b', fontSize: '0.8em', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px' }}>Fechas</div>
          <div style={S.grid2}>
            {[['fecha_embarque', 'Fecha de embarque'], ['fecha_eta', 'ETA (fecha estimada llegada)'], ['fecha_llegada_cr', 'Fecha llegada a CR'], ['fecha_retiro', 'Fecha de retiro']].map(([k, l]) => (
              <div key={k}><label style={S.label}>{l}</label><input style={S.input} type="date" value={form[k] || ''} onChange={e => setF(k, e.target.value)} /></div>
            ))}
          </div>

          <hr style={S.divider} />
          <div style={{ fontWeight: 600, color: '#c8a84b', fontSize: '0.8em', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px' }}>Pagos y costos</div>
          <div style={S.grid3}>
            {[['adelanto_usd', 'Adelanto (USD)'], ['pago_final_usd', 'Pago final (USD)'], ['flete_usd', 'Flete (USD)'], ['impuestos_crc', 'Impuestos (CRC)'], ['transporte_crc', 'Transporte CR (CRC)'], ['otros_crc', 'Otros costos (CRC)'], ['tipo_cambio', 'Tipo de cambio']].map(([k, l]) => (
              <div key={k}><label style={S.label}>{l}</label><input style={S.input} type="number" value={form[k] || ''} onChange={e => setF(k, e.target.value)} /></div>
            ))}
          </div>

          <hr style={S.divider} />
          <div style={{ fontWeight: 600, color: '#c8a84b', fontSize: '0.8em', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px' }}>Documentos y estado</div>
          <div style={{ display: 'flex', gap: '24px', marginBottom: '16px', flexWrap: 'wrap' }}>
            {[['documentos_recibidos', '📄 Documentos recibidos'], ['despacho_aduanal', '🛃 Despacho aduanal completo'], ['exonerado', '✅ Exonerado']].map(([k, l]) => (
              <label key={k} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.87em', color: '#c9d1e0' }}>
                <input type="checkbox" checked={!!form[k]} onChange={e => setF(k, e.target.checked)} style={{ accentColor: '#c8a84b', width: '16px', height: '16px' }} />
                {l}
              </label>
            ))}
          </div>
          <div><label style={S.label}>Notas</label><textarea style={{ ...S.input, minHeight: '80px', resize: 'vertical' }} value={form.notas || ''} onChange={e => setF('notas', e.target.value)} /></div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
            <button style={S.btn()} onClick={guardar} disabled={saving}>{saving ? 'Guardando...' : editId ? '💾 Actualizar' : '💾 Guardar'}</button>
            <button style={S.btnSm()} onClick={() => { setForm(FORM_INIT); setEditId(null); setTab(0); }}>Cancelar</button>
          </div>
        </div>
      )}

      {tab === 2 && (
        <div>
          <div style={{ fontSize: '0.82em', color: '#5a6a80', marginBottom: '14px' }}>{historial.length} contenedores cerrados</div>
          {historial.length === 0 ? <div style={{ ...S.card, textAlign: 'center', color: '#5a6a80', padding: '30px' }}>Sin historial aún.</div> : (
            <div style={{ overflowX: 'auto' }}>
              <table style={S.table}>
                <thead><tr>{['Contenedor', 'Proveedor', 'Tipo', 'Embarque', 'Llegada CR', 'Flete USD', 'Acciones'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {historial.map(env => (
                    <tr key={env.id}>
                      <td style={S.td}><span style={{ fontWeight: 600 }}>{env.numero_contenedor || '—'}</span></td>
                      <td style={S.td}>{env.proveedor}</td>
                      <td style={S.td}>{env.tipo_contenedor || '—'}</td>
                      <td style={S.td}>{fmtFecha(env.fecha_embarque)}</td>
                      <td style={S.td}>{fmtFecha(env.fecha_llegada_cr)}</td>
                      <td style={S.td}>{fmtUSD(env.flete_usd)}</td>
                      <td style={S.td}>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button style={S.btnSm()} onClick={() => reactivar(env.id)}>↩️ Reactivar</button>
                          <button style={S.btnSm('#3d1515')} onClick={() => eliminar(env.id)}>🗑️</button>
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
