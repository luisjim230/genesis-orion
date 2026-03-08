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
  divider: { border: 'none', borderTop: '1px solid #1e2330', margin: '20px 0' },
  badge: (c) => ({ background: c+'22', color: c, border: `1px solid ${c}55`, borderRadius: '20px', padding: '3px 10px', fontSize: '0.72em', fontWeight: 600 }),
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '0.83em' },
  th: { textAlign: 'left', padding: '9px 12px', background: '#0f1115', color: '#5a6a80', fontSize: '0.75em', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '2px solid #1e2330' },
  td: { padding: '9px 12px', borderBottom: '1px solid #1e2330', color: '#c9d1e0', verticalAlign: 'middle' },
};

function diasDesde(fecha) {
  if (!fecha) return null;
  const f = new Date(fecha); const hoy = new Date();
  return Math.floor((hoy - f) / 86400000);
}

function colorSemaforo(dias, limVerde, limAmarillo) {
  if (dias === null) return '#5a6a80';
  if (dias <= limVerde) return '#68d391';
  if (dias <= limAmarillo) return '#f6ad55';
  return '#fc8181';
}

export default function Trazabilidad() {
  const [tab, setTab] = useState(0);
  const [ordenes, setOrdenes] = useState([]);
  const [items, setItems] = useState([]);
  const [comprados, setComprados] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ordenDetalle, setOrdenDetalle] = useState(null);
  const [limVerde, setLimVerde] = useState(30);
  const [limAmarillo, setLimAmarillo] = useState(60);
  const [filtroProv, setFiltroProv] = useState('');
  const [msg, setMsg] = useState(null);
  const [procesando, setProcesando] = useState(false);

  useEffect(() => { cargar(); }, []);

  async function cargar() {
    setLoading(true);
    const [{ data: ords }, { data: its }, { data: comp }] = await Promise.all([
      supabase.from('ordenes_compra').select('*').order('fecha_orden', { ascending: false }),
      supabase.from('ordenes_compra_items').select('*'),
      supabase.from('neo_items_comprados').select('*').order('fecha_carga', { ascending: false }).limit(2000),
    ]);
    setOrdenes(ords || []); setItems(its || []); setComprados(comp || []);
    setLoading(false);
  }

  function mostrarMsg(texto, tipo='ok') { setMsg({ texto, tipo }); setTimeout(() => setMsg(null), 4000); }

  // Items pendientes: cruza ordenes_compra_items con neo_items_comprados
  const itemsPendientes = items.filter(it => {
    if (it.recibido) return false;
    return true;
  }).map(it => {
    const orden = ordenes.find(o => o.id === it.orden_id);
    const dias = diasDesde(orden?.fecha_orden);
    return { ...it, orden, dias };
  }).filter(it => {
    if (!filtroProv) return true;
    return (it.orden?.proveedor || '').toLowerCase().includes(filtroProv.toLowerCase());
  }).sort((a, b) => (b.dias || 0) - (a.dias || 0));

  const alertasRojo = itemsPendientes.filter(it => (it.dias || 0) > limAmarillo).length;
  const alertasAmarillo = itemsPendientes.filter(it => (it.dias || 0) > limVerde && (it.dias || 0) <= limAmarillo).length;

  async function marcarRecibido(itemId) {
    await supabase.from('ordenes_compra_items').update({ recibido: true, fecha_recibido: new Date().toISOString().split('T')[0] }).eq('id', itemId);
    mostrarMsg('Ítem marcado como recibido.');
    cargar();
  }

  async function eliminarOrden(ordenId) {
    if (!confirm('¿Eliminar esta orden y todos sus ítems?')) return;
    await supabase.from('ordenes_compra_items').delete().eq('orden_id', ordenId);
    await supabase.from('ordenes_compra').delete().eq('id', ordenId);
    setOrdenDetalle(null);
    mostrarMsg('Orden eliminada.');
    cargar();
  }

  const proveedores = [...new Set(ordenes.map(o => o.proveedor).filter(Boolean))];

  return (
    <div style={S.page}>
      <div style={S.title}>🔴 Nehemías – Trazabilidad</div>
      <div style={S.sub}>Seguimiento de órdenes de compra · Corporación Rojimo S.A.</div>

      {msg && <div style={{ background: msg.tipo==='ok'?'#68d39122':'#fc818122', border: `1px solid ${msg.tipo==='ok'?'#68d391':'#fc8181'}55`, borderRadius: '8px', padding: '10px 16px', marginBottom: '16px', color: msg.tipo==='ok'?'#68d391':'#fc8181', fontSize: '0.85em' }}>{msg.tipo==='ok'?'✅':'❌'} {msg.texto}</div>}

      <div style={S.tabBar}>
        {['🚨 Alertas Pendientes', '📋 Historial de Órdenes', '📥 Procesar Recibidas'].map((t, i) => (
          <button key={i} style={S.tab(tab===i)} onClick={() => setTab(i)}>{t}</button>
        ))}
      </div>

      {tab === 0 && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '12px', marginBottom: '20px' }}>
            {[['📦 Ítems pendientes', itemsPendientes.length, '#63b3ed'], ['🟡 En seguimiento', alertasAmarillo, '#f6ad55'], ['🔴 Vencidos', alertasRojo, '#fc8181']].map(([l,v,c]) => (
              <div key={l} style={{ background: '#161920', border: `1px solid ${c}33`, borderTop: `3px solid ${c}`, borderRadius: '10px', padding: '14px 16px' }}>
                <div style={{ fontSize: '0.72em', color: '#5a6a80', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{l}</div>
                <div style={{ fontSize: '1.8em', fontWeight: 700, color: '#fff', marginTop: '4px' }}>{v}</div>
              </div>
            ))}
          </div>

          <div style={{ ...S.card, marginBottom: '16px' }}>
            <div style={{ fontWeight: 600, color: '#c8a84b', fontSize: '0.8em', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px' }}>⚙️ Configuración de semáforo</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px', alignItems: 'center' }}>
              <div><label style={S.label}>🟢 Verde hasta (días)</label><input style={S.input} type="number" value={limVerde} onChange={e => setLimVerde(Number(e.target.value))} /></div>
              <div><label style={S.label}>🟡 Amarillo hasta (días)</label><input style={S.input} type="number" value={limAmarillo} onChange={e => setLimAmarillo(Number(e.target.value))} /></div>
              <div><label style={S.label}>Filtrar proveedor</label>
                <select style={S.input} value={filtroProv} onChange={e => setFiltroProv(e.target.value)}>
                  <option value="">Todos</option>
                  {proveedores.map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
            </div>
          </div>

          {loading ? <div style={{ textAlign: 'center', padding: '40px', color: '#5a6a80' }}>Cargando...</div> : itemsPendientes.length === 0 ? (
            <div style={{ ...S.card, textAlign: 'center', color: '#68d391', padding: '40px' }}>✅ Sin ítems pendientes de recibir.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={S.table}>
                <thead><tr>{['Producto','Proveedor','Cant. Pedida','Cant. Recibida','Pendiente','Fecha Orden','Días','Acción'].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {itemsPendientes.map(it => {
                    const c = colorSemaforo(it.dias, limVerde, limAmarillo);
                    const pendiente = (parseFloat(it.cantidad_pedida)||0) - (parseFloat(it.cantidad_recibida)||0);
                    return (
                      <tr key={it.id}>
                        <td style={S.td}><span style={{ fontWeight: 600 }}>{it.nombre_producto || it.codigo_producto}</span></td>
                        <td style={S.td}>{it.orden?.proveedor || '—'}</td>
                        <td style={{ ...S.td, textAlign: 'right' }}>{it.cantidad_pedida}</td>
                        <td style={{ ...S.td, textAlign: 'right' }}>{it.cantidad_recibida || 0}</td>
                        <td style={{ ...S.td, textAlign: 'right', fontWeight: 700, color: '#f6ad55' }}>{pendiente}</td>
                        <td style={S.td}>{it.orden?.fecha_orden?.substring(0,10) || '—'}</td>
                        <td style={S.td}><span style={{ ...S.badge(c) }}>{it.dias ?? '?'}d</span></td>
                        <td style={S.td}><button style={S.btnSm('#1a3a1a')} onClick={() => marcarRecibido(it.id)}>✅ Recibido</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 1 && (
        <div>
          {ordenDetalle ? (
            <div>
              <button style={{ ...S.btnSm(), marginBottom: '16px' }} onClick={() => setOrdenDetalle(null)}>← Volver</button>
              <div style={S.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
                  <div>
                    <div style={{ fontWeight: 700, color: '#fff', fontSize: '1.1em' }}>{ordenDetalle.proveedor}</div>
                    <div style={{ fontSize: '0.82em', color: '#5a6a80', marginTop: '3px' }}>Orden #{ordenDetalle.numero_orden || ordenDetalle.id?.substring(0,8)} · {ordenDetalle.fecha_orden?.substring(0,10)}</div>
                    {ordenDetalle.notas && <div style={{ fontSize: '0.82em', color: '#8899aa', marginTop: '6px' }}>📝 {ordenDetalle.notas}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <span style={S.badge('#63b3ed')}>{ordenDetalle.estado || 'Activa'}</span>
                  </div>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={S.table}>
                    <thead><tr>{['Producto','Código','Cantidad pedida','Cantidad recibida','Pendiente','Recibido','Fecha recibido'].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
                    <tbody>
                      {items.filter(it => it.orden_id === ordenDetalle.id).map(it => {
                        const pendiente = (parseFloat(it.cantidad_pedida)||0) - (parseFloat(it.cantidad_recibida)||0);
                        return (
                          <tr key={it.id}>
                            <td style={S.td}>{it.nombre_producto || '—'}</td>
                            <td style={S.td}>{it.codigo_producto || '—'}</td>
                            <td style={{ ...S.td, textAlign: 'right' }}>{it.cantidad_pedida}</td>
                            <td style={{ ...S.td, textAlign: 'right' }}>{it.cantidad_recibida || 0}</td>
                            <td style={{ ...S.td, textAlign: 'right', color: pendiente > 0 ? '#f6ad55' : '#68d391', fontWeight: 700 }}>{pendiente}</td>
                            <td style={S.td}>{it.recibido ? <span style={S.badge('#68d391')}>✅ Sí</span> : <span style={S.badge('#f6ad55')}>⏳ No</span>}</td>
                            <td style={S.td}>{it.fecha_recibido || '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <hr style={S.divider} />
                <div style={{ background: '#1a0a0a', border: '1px solid #fc818133', borderRadius: '8px', padding: '12px 16px' }}>
                  <div style={{ color: '#fc8181', fontWeight: 600, fontSize: '0.82em', marginBottom: '8px' }}>⚠️ Zona de peligro</div>
                  <button style={S.btn('#7d1515')} onClick={() => eliminarOrden(ordenDetalle.id)}>🗑️ Eliminar esta orden</button>
                </div>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: '0.85em', color: '#5a6a80', marginBottom: '14px' }}>{ordenes.length} órdenes registradas</div>
              {loading ? <div style={{ textAlign: 'center', padding: '40px', color: '#5a6a80' }}>Cargando...</div> : ordenes.length === 0 ? (
                <div style={{ ...S.card, textAlign: 'center', color: '#5a6a80', padding: '40px' }}>Sin órdenes registradas. Creá órdenes desde Saturno.</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={S.table}>
                    <thead><tr>{['Proveedor','Número','Fecha','Estado','Ítems','Días','Acción'].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
                    <tbody>
                      {ordenes.map(o => {
                        const its = items.filter(it => it.orden_id === o.id);
                        const pendientes = its.filter(it => !it.recibido).length;
                        const dias = diasDesde(o.fecha_orden);
                        const c = colorSemaforo(dias, limVerde, limAmarillo);
                        return (
                          <tr key={o.id}>
                            <td style={S.td}><span style={{ fontWeight: 600 }}>{o.proveedor}</span></td>
                            <td style={S.td}>{o.numero_orden || o.id?.substring(0,8)}</td>
                            <td style={S.td}>{o.fecha_orden?.substring(0,10) || '—'}</td>
                            <td style={S.td}><span style={S.badge(pendientes > 0 ? '#f6ad55' : '#68d391')}>{pendientes > 0 ? `${pendientes} pend.` : '✅ Completa'}</span></td>
                            <td style={{ ...S.td, textAlign: 'center' }}>{its.length}</td>
                            <td style={S.td}><span style={S.badge(c)}>{dias ?? '?'}d</span></td>
                            <td style={S.td}><button style={S.btnSm()} onClick={() => setOrdenDetalle(o)}>🔍 Ver</button></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {tab === 2 && (
        <div>
          <div style={{ ...S.card, marginBottom: '16px', background: '#161920' }}>
            <div style={{ fontWeight: 600, color: '#fff', marginBottom: '8px' }}>📥 Procesar ítems recibidos desde NEO</div>
            <div style={{ fontSize: '0.84em', color: '#5a6a80', marginBottom: '16px' }}>
              Este tab cruza los datos de NEO (ítems comprados) con las órdenes de compra registradas en Génesis. Marcá los ítems como recibidos para cerrar el ciclo.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '12px' }}>
              {[['📋 Órdenes activas', ordenes.filter(o => items.filter(it=>it.orden_id===o.id && !it.recibido).length>0).length, '#63b3ed'],
                ['📦 Ítems pendientes', itemsPendientes.length, '#f6ad55'],
                ['✅ Ítems recibidos', items.filter(it=>it.recibido).length, '#68d391']].map(([l,v,c]) => (
                <div key={l} style={{ background: '#0f1115', border: `1px solid ${c}33`, borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.7em', color: '#5a6a80' }}>{l}</div>
                  <div style={{ fontSize: '1.5em', fontWeight: 700, color: c }}>{v}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={S.card}>
            <div style={{ fontWeight: 600, color: '#c8a84b', fontSize: '0.85em', marginBottom: '12px' }}>📦 Ítems pendientes de confirmar recepción</div>
            {itemsPendientes.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#68d391', padding: '30px' }}>✅ Todos los ítems han sido recibidos.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={S.table}>
                  <thead><tr>{['Producto','Proveedor','Cant. Pedida','Días en espera','Acción'].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {itemsPendientes.slice(0,30).map(it => {
                      const c = colorSemaforo(it.dias, limVerde, limAmarillo);
                      return (
                        <tr key={it.id}>
                          <td style={S.td}><span style={{ fontWeight: 600 }}>{it.nombre_producto || it.codigo_producto}</span></td>
                          <td style={S.td}>{it.orden?.proveedor || '—'}</td>
                          <td style={{ ...S.td, textAlign: 'right' }}>{it.cantidad_pedida}</td>
                          <td style={S.td}><span style={S.badge(c)}>{it.dias ?? '?'}d</span></td>
                          <td style={S.td}>
                            <button style={S.btn('#1a5a1a')} onClick={() => marcarRecibido(it.id)}>✅ Confirmar recepción</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
