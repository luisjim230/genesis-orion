'use client';
import { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { fmtNum, fmtMoney } from './ui.js';

export default function PlanProveedorTab({ onSeleccionar, onCambio }) {
  const [grupos, setGrupos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [whatsapp, setWhatsapp] = useState({});
  const [expandidos, setExpandidos] = useState({});
  const [seleccion, setSeleccion] = useState({}); // id_aprobacion -> bool
  const [generando, setGenerando] = useState(null);
  const [cancelando, setCancelando] = useState(false);
  const [msg, setMsg] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const r = await fetch('/api/profecias/aprobaciones-pendientes');
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error || 'Error');
      setGrupos(j.grupos || []);
      // Limpiar selección obsoleta
      setSeleccion((prev) => {
        const idsValidos = new Set();
        for (const g of (j.grupos || [])) for (const it of g.items) idsValidos.add(it.id);
        const next = {};
        for (const k of Object.keys(prev)) if (idsValidos.has(Number(k))) next[k] = prev[k];
        return next;
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); cargarKommo(); }, [cargar]);

  async function cargarKommo() {
    try {
      const { data } = await supabase
        .from('kommo_proveedores')
        .select('nombre_proveedor, whatsapp')
        .eq('activo', true);
      const map = {};
      for (const r of data || []) {
        if (r.whatsapp && r.nombre_proveedor) map[r.nombre_proveedor.trim().toUpperCase()] = r.whatsapp;
      }
      setWhatsapp(map);
    } catch (_) {}
  }

  function toggleGrupo(prov) {
    setExpandidos((p) => ({ ...p, [prov]: !p[prov] }));
  }

  function toggleItem(id) {
    setSeleccion((p) => ({ ...p, [id]: !p[id] }));
  }

  function seleccionarGrupo(grupo, val) {
    setSeleccion((prev) => {
      const cur = { ...prev };
      for (const it of grupo.items) cur[it.id] = val;
      return cur;
    });
  }

  const totales = useMemo(() => {
    let n = 0, inv = 0;
    for (const g of grupos) for (const it of g.items) {
      if (seleccion[it.id]) { n += 1; inv += Number(it.inversion_estimada) || 0; }
    }
    return { n, inv };
  }, [grupos, seleccion]);

  async function generarOrden(grupo) {
    const seleccionados = grupo.items.filter((it) => seleccion[it.id]);
    const items = seleccionados.length ? seleccionados : grupo.items;
    const inv = items.reduce((s, i) => s + (Number(i.inversion_estimada) || 0), 0);
    if (!confirm(`Generar orden para ${grupo.proveedor}: ${items.length} SKUs · ${fmtMoney(inv)}\n\n¿Continuar?`)) return;

    setGenerando(grupo.proveedor);
    setMsg(null);
    try {
      const r = await fetch('/api/profecias/generar-orden', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proveedor: grupo.proveedor,
          ids_aprobaciones: items.map((i) => i.id),
        }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error || 'Error');
      setMsg({ tipo: 'ok', txt: `Orden ${j.orden_id.slice(0, 8)}… creada con ${j.num_items} ítems · ${fmtMoney(j.inversion_total)}` });
      await cargar();
      onCambio?.();
    } catch (e) {
      setMsg({ tipo: 'err', txt: e.message });
    } finally {
      setGenerando(null);
    }
  }

  async function quitarSeleccionados(grupo) {
    const ids = grupo.items.filter((it) => seleccion[it.id]).map((it) => it.id);
    if (!ids.length) {
      setMsg({ tipo: 'err', txt: 'Seleccioná al menos un SKU para quitar.' });
      return;
    }
    const motivo = prompt(`Quitar ${ids.length} SKUs aprobados de ${grupo.proveedor}.\n\nMotivo (opcional):`, '');
    if (motivo === null) return;

    setCancelando(true);
    setMsg(null);
    try {
      const r = await fetch('/api/profecias/cancelar-aprobacion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, motivo: motivo || null }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error || 'Error');
      setMsg({ tipo: 'ok', txt: `${j.count} SKUs devueltos a Necesidad de Compra.` });
      await cargar();
      onCambio?.();
    } catch (e) {
      setMsg({ tipo: 'err', txt: e.message });
    } finally {
      setCancelando(false);
    }
  }

  function abrirWhatsApp(grupo) {
    const numero = whatsapp[grupo.proveedor.trim().toUpperCase()];
    if (!numero) {
      alert('No hay WhatsApp registrado para este proveedor en Kommo.');
      return;
    }
    const limpio = numero.replace(/[^\d]/g, '');
    const seleccionados = grupo.items.filter((it) => seleccion[it.id]);
    const lineas = (seleccionados.length ? seleccionados : grupo.items).slice(0, 30)
      .map((i) => `- SKU ${i.codigo_interno}: ${fmtNum(Number(i.cantidad_aprobada) || 0, 0)} unidades`);
    const inv = (seleccionados.length ? seleccionados : grupo.items)
      .reduce((s, i) => s + (Number(i.inversion_estimada) || 0), 0);
    const cabecera = `Hola, le confirmamos orden de pedido:\n\n`;
    const cierre = `\n\nTotal estimado: ${fmtMoney(inv)}\nFavor confirmar disponibilidad y tiempo de entrega.`;
    const texto = encodeURIComponent(cabecera + lineas.join('\n') + cierre);
    window.open(`https://wa.me/${limpio}?text=${texto}`, '_blank');
  }

  if (cargando) return <div style={{ padding: 40, textAlign: 'center', color: '#718096' }}>Cargando aprobaciones…</div>;
  if (error) return <div style={{ padding: 16, background: '#FED7D7', color: '#822727', borderRadius: 6 }}>Error: {error}</div>;

  if (!grupos.length) {
    return (
      <div style={{
        padding: 40, textAlign: 'center', color: '#718096',
        background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0',
      }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#1c1f26' }}>No hay aprobaciones pendientes.</div>
        <div style={{ marginTop: 4 }}>Aprobá SKUs desde <strong>Necesidad de Compra</strong> y aparecerán acá listos para generar la orden.</div>
      </div>
    );
  }

  return (
    <div>
      <div style={{
        background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
        padding: '8px 12px', marginBottom: 12, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
        fontSize: 12, color: '#4a5568',
      }}>
        <span>📋 <strong>{grupos.reduce((s, g) => s + g.items.length, 0)}</strong> SKUs aprobados en {grupos.length} proveedor{grupos.length !== 1 ? 'es' : ''}</span>
        <span style={{ marginLeft: 'auto' }}>
          {totales.n > 0 && <>Seleccionados: <strong>{totales.n}</strong> · {fmtMoney(totales.inv)}</>}
        </span>
      </div>

      {msg && (
        <div style={{
          padding: '8px 12px', borderRadius: 6, marginBottom: 10, fontSize: 12,
          background: msg.tipo === 'ok' ? '#C6F6D5' : '#FED7D7', color: msg.tipo === 'ok' ? '#22543D' : '#822727',
        }}>{msg.txt}</div>
      )}

      <div style={{ display: 'grid', gap: 12 }}>
        {grupos.map((g) => {
          const wa = whatsapp[g.proveedor.trim().toUpperCase()];
          const todosSel = g.items.every((it) => seleccion[it.id]);
          return (
            <div key={g.proveedor} style={{
              background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
              padding: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#1c1f26' }}>{g.proveedor}</div>
                  <div style={{ fontSize: 12, color: '#4a5568', marginTop: 2 }}>
                    {g.tipo_proveedor === 'extranjero' ? '🌐 Extranjero' : '🇨🇷 Nacional'} · Lead time {g.lead_time_dias ?? '—'} días
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button onClick={() => toggleGrupo(g.proveedor)} style={btnSec}>
                    {expandidos[g.proveedor] ? 'Ocultar' : `Ver detalle (${g.items.length})`}
                  </button>
                  <button onClick={() => generarOrden(g)} disabled={generando === g.proveedor} style={btnPri}>
                    {generando === g.proveedor ? 'Generando…' : 'Generar borrador de orden'}
                  </button>
                  {wa && (
                    <button onClick={() => abrirWhatsApp(g)} style={btnWa}>WhatsApp</button>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                <Stat label="✅ SKUs aprobados" valor={g.totales.num_items} color="#38A169" />
                <Stat label="📦 Unidades" valor={fmtNum(g.totales.total_unidades, 0)} />
                <Stat label="💰 Inversión est." valor={fmtMoney(g.totales.inversion_total)} highlight />
              </div>

              {expandidos[g.proveedor] && (
                <>
                  <div style={{ marginTop: 12, overflowX: 'auto', maxHeight: 480, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 6 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: '#f7fafc', color: '#1c1f26' }}>
                          <th style={th}><input type="checkbox" checked={todosSel} onChange={(e) => seleccionarGrupo(g, e.target.checked)} /></th>
                          <th style={th}>Código</th>
                          <th style={th}>Nombre</th>
                          <th style={{ ...th, textAlign: 'right' }}>Cant. aprobada</th>
                          <th style={{ ...th, textAlign: 'right' }}>Costo unit.</th>
                          <th style={{ ...th, textAlign: 'right' }}>Total</th>
                          <th style={th}>Aprobado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.items.map((it) => (
                          <tr key={it.id} style={{ borderBottom: '1px solid #f0f2f5' }}>
                            <td style={td}><input type="checkbox" checked={!!seleccion[it.id]} onChange={() => toggleItem(it.id)} /></td>
                            <td style={{ ...td, fontFamily: 'monospace', fontWeight: 600, cursor: 'pointer' }} onClick={() => onSeleccionar(it.codigo_interno)}>{it.codigo_interno}</td>
                            <td style={{ ...td, cursor: 'pointer' }} onClick={() => onSeleccionar(it.codigo_interno)}>{it.item || '—'}</td>
                            <td style={{ ...tdNum, color: '#c8a84b', fontWeight: 700 }}>{fmtNum(it.cantidad_aprobada, 0)}</td>
                            <td style={tdNum}>{fmtMoney(it.costo_unitario_estimado, it.moneda)}</td>
                            <td style={tdNum}>{fmtMoney(it.inversion_estimada, it.moneda)}</td>
                            <td style={{ ...td, fontSize: 11, color: '#718096' }}>
                              {it.aprobado_en ? new Date(it.aprobado_en).toLocaleDateString('es-CR', { day: '2-digit', month: 'short' }) : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                    <button onClick={() => quitarSeleccionados(g)} disabled={cancelando} style={btnDanger}>
                      {cancelando ? 'Quitando…' : 'Quitar seleccionados'}
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, valor, color, highlight }) {
  return (
    <div style={{
      padding: '6px 10px', borderRadius: 6,
      background: highlight ? 'rgba(200,168,75,0.15)' : '#f7fafc',
      border: '1px solid #e2e8f0', minWidth: 110,
    }}>
      <div style={{ fontSize: 10, color: '#718096', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: color || '#1c1f26' }}>{valor}</div>
    </div>
  );
}

const th = { padding: '8px 10px', textAlign: 'left', fontSize: 11, fontWeight: 600, letterSpacing: 0.3, textTransform: 'uppercase', whiteSpace: 'nowrap' };
const td = { padding: '6px 10px', verticalAlign: 'middle' };
const tdNum = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
const btnPri    = { padding: '6px 12px', borderRadius: 6, border: 'none', background: '#c8a84b', color: '#1c1f26', fontWeight: 700, cursor: 'pointer', fontSize: 12 };
const btnSec    = { padding: '6px 12px', borderRadius: 6, border: '1px solid #cbd5e0', background: '#fff', cursor: 'pointer', fontSize: 12 };
const btnWa     = { padding: '6px 12px', borderRadius: 6, border: 'none', background: '#25D366', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 };
const btnDanger = { padding: '6px 12px', borderRadius: 6, border: '1px solid #FC8181', background: '#FFF5F5', color: '#822727', cursor: 'pointer', fontSize: 12 };
