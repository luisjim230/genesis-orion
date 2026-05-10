'use client';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { fmtNum, fmtMoney, SemaforoBadge, MadurezBadge } from './ui.js';

const SEMAFOROS_PEDIR = new Set(['rojo_critico', 'rojo', 'amarillo']);

export default function PlanProveedorTab({ filas, onSeleccionar }) {
  const [whatsapp, setWhatsapp] = useState({}); // proveedor -> numero
  const [ultimasOrdenes, setUltimasOrdenes] = useState({}); // proveedor -> { fecha }
  const [expandidos, setExpandidos] = useState({});
  const [generando, setGenerando] = useState(null);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    cargarKommo();
    cargarUltimasOrdenes();
  }, []);

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

  async function cargarUltimasOrdenes() {
    try {
      let all = [];
      let offset = 0;
      const BATCH = 1000;
      while (true) {
        const { data } = await supabase
          .from('ordenes_compra_items')
          .select('proveedor, creado_en')
          .order('creado_en', { ascending: false })
          .range(offset, offset + BATCH - 1);
        if (!data?.length) break;
        all = all.concat(data);
        if (data.length < BATCH) break;
        offset += BATCH;
        if (offset > 5000) break; // suficiente para últimas 5k entradas
      }
      const map = {};
      for (const r of all) {
        const k = (r.proveedor || '').trim().toUpperCase();
        if (!k || !r.creado_en) continue;
        if (!map[k] || new Date(r.creado_en) > new Date(map[k])) map[k] = r.creado_en;
      }
      setUltimasOrdenes(map);
    } catch (_) {}
  }

  const grupos = useMemo(() => {
    const map = new Map();
    for (const f of filas) {
      if (!(f.cantidad_sugerida > 0 || SEMAFOROS_PEDIR.has(f.semaforo))) continue;
      if (f.proveedor_pausado) continue;
      const key = f.ultimo_proveedor || 'SIN PROVEEDOR';
      if (!map.has(key)) {
        map.set(key, {
          proveedor: key,
          tipo_proveedor: f.tipo_proveedor,
          lead_time_dias: f.lead_time_dias,
          items: [],
        });
      }
      map.get(key).items.push(f);
    }
    const arr = [...map.values()].map((g) => {
      const rojo_critico = g.items.filter((i) => i.semaforo === 'rojo_critico').length;
      const rojo = g.items.filter((i) => i.semaforo === 'rojo').length;
      const amarillo = g.items.filter((i) => i.semaforo === 'amarillo').length;
      const recienN = g.items.filter((i) => i.madurez === 'recien_nacido').length;
      const inversion = g.items.reduce((s, i) => s + (Number(i.cantidad_sugerida) || 0) * (Number(i.ultimo_costo) || 0), 0);
      const total_unidades = g.items.reduce((s, i) => s + (Number(i.cantidad_sugerida) || 0), 0);
      return { ...g, rojo_critico, rojo, amarillo, recienN, inversion, total_unidades };
    });
    arr.sort((a, b) => (b.rojo_critico + b.rojo) - (a.rojo_critico + a.rojo) || b.inversion - a.inversion);
    return arr;
  }, [filas]);

  function toggle(prov) {
    setExpandidos((p) => ({ ...p, [prov]: !p[prov] }));
  }

  async function generarOrden(prov) {
    if (!confirm(`Generar borrador de orden para ${prov.proveedor} con ${prov.items.length} SKUs?`)) return;
    setGenerando(prov.proveedor);
    setMsg(null);
    try {
      const items = prov.items.map((i) => ({
        codigo: i.codigo_interno,
        nombre: i.item,
        proveedor: i.ultimo_proveedor,
        cantidad: Number(i.cantidad_sugerida) || 0,
        costo_unitario: Number(i.ultimo_costo) || 0,
      }));
      const r = await fetch('/api/profecias/generar-orden', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proveedor: prov.proveedor, items, nombre_lote: `Profecías · ${prov.proveedor} · ${new Date().toISOString().slice(0,10)}` }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error || 'Error');
      setMsg({ tipo: 'ok', txt: `Orden creada (${j.total} ítems). Revisala en el módulo de Compras.` });
    } catch (e) {
      setMsg({ tipo: 'err', txt: e.message });
    } finally {
      setGenerando(null);
    }
  }

  function abrirWhatsApp(prov) {
    const numero = whatsapp[prov.proveedor.trim().toUpperCase()];
    if (!numero) {
      alert('No hay WhatsApp registrado para este proveedor en Kommo.');
      return;
    }
    const limpio = numero.replace(/[^\d]/g, '');
    const lineas = prov.items.slice(0, 25).map((i) => `${i.codigo_interno} — ${fmtNum(Number(i.cantidad_sugerida) || 0, 0)} u (${i.item.slice(0, 60)})`);
    const cabecera = `Hola, ¿podemos preparar el siguiente pedido?\n\n`;
    const cuerpo = lineas.join('\n');
    const cola = prov.items.length > 25 ? `\n\n…y ${prov.items.length - 25} más.` : '';
    const texto = encodeURIComponent(cabecera + cuerpo + cola);
    window.open(`https://wa.me/${limpio}?text=${texto}`, '_blank');
  }

  return (
    <div>
      {msg && (
        <div style={{
          padding: '8px 12px', borderRadius: 6, marginBottom: 10, fontSize: 12,
          background: msg.tipo === 'ok' ? '#C6F6D5' : '#FED7D7', color: msg.tipo === 'ok' ? '#22543D' : '#822727',
        }}>{msg.txt}</div>
      )}
      {grupos.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', color: '#718096', background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0' }}>
          No hay proveedores con SKUs pendientes.
        </div>
      )}
      <div style={{ display: 'grid', gap: 12 }}>
        {grupos.map((g) => {
          const ult = ultimasOrdenes[g.proveedor.trim().toUpperCase()];
          const dias = ult ? Math.floor((Date.now() - new Date(ult).getTime()) / 86400000) : null;
          const wa = whatsapp[g.proveedor.trim().toUpperCase()];
          return (
            <div key={g.proveedor} style={{
              background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
              padding: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#1c1f26' }}>{g.proveedor}</div>
                  <div style={{ fontSize: 12, color: '#4a5568', marginTop: 2 }}>
                    {g.tipo_proveedor === 'extranjero' ? '🌐 Extranjero' : '🇨🇷 Nacional'} · Lead time {g.lead_time_dias} días
                    {ult && <> · Última orden: hace {dias} d</>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button onClick={() => toggle(g.proveedor)} style={btnSec}>
                    {expandidos[g.proveedor] ? 'Ocultar detalle' : `Ver detalle (${g.items.length})`}
                  </button>
                  <button onClick={() => generarOrden(g)} disabled={generando === g.proveedor} style={btnPri}>
                    {generando === g.proveedor ? 'Generando…' : 'Generar borrador'}
                  </button>
                  {wa && (
                    <button onClick={() => abrirWhatsApp(g)} style={btnWa}>WhatsApp</button>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                <Stat label="🔴 Rojos" valor={g.rojo + g.rojo_critico} color="#E53E3E" />
                <Stat label="🟡 Amarillos" valor={g.amarillo} color="#D69E2E" />
                {g.recienN > 0 && <Stat label="🆕 Recién n." valor={g.recienN} color="#805AD5" />}
                <Stat label="📦 Unidades" valor={fmtNum(g.total_unidades, 0)} />
                <Stat label="💰 Inversión est." valor={fmtMoney(g.inversion)} highlight />
              </div>

              {expandidos[g.proveedor] && (
                <div style={{ marginTop: 12, overflowX: 'auto', maxHeight: 480, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 6 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#f7fafc', color: '#1c1f26' }}>
                        <th style={th}>Sem.</th>
                        <th style={th}>Código</th>
                        <th style={th}>Nombre</th>
                        <th style={th}>Madurez</th>
                        <th style={{ ...th, textAlign: 'right' }}>Exist.</th>
                        <th style={{ ...th, textAlign: 'right' }}>Dem./mes</th>
                        <th style={{ ...th, textAlign: 'right' }}>Sugerida</th>
                        <th style={{ ...th, textAlign: 'right' }}>Costo</th>
                        <th style={{ ...th, textAlign: 'right' }}>Inv.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.items.map((i) => (
                        <tr key={i.codigo_interno} style={{ borderBottom: '1px solid #f0f2f5', cursor: 'pointer' }} onClick={() => onSeleccionar(i.codigo_interno)}>
                          <td style={td}><SemaforoBadge value={i.semaforo} mini /></td>
                          <td style={{ ...td, fontFamily: 'monospace', fontWeight: 600 }}>{i.codigo_interno}</td>
                          <td style={td}>{i.item}</td>
                          <td style={td}><MadurezBadge value={i.madurez} /></td>
                          <td style={tdNum}>{fmtNum(i.existencias, 0)}</td>
                          <td style={tdNum}>{fmtNum(i.demanda_proyectada, 1)}</td>
                          <td style={{ ...tdNum, color: '#c8a84b', fontWeight: 700 }}>{fmtNum(i.cantidad_sugerida, 0)}</td>
                          <td style={tdNum}>{fmtMoney(i.ultimo_costo, i.moneda)}</td>
                          <td style={tdNum}>{fmtMoney((Number(i.cantidad_sugerida) || 0) * (Number(i.ultimo_costo) || 0), i.moneda)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
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
      border: '1px solid #e2e8f0',
      minWidth: 110,
    }}>
      <div style={{ fontSize: 10, color: '#718096', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: color || '#1c1f26' }}>{valor}</div>
    </div>
  );
}

const th = { padding: '8px 10px', textAlign: 'left', fontSize: 11, fontWeight: 600, letterSpacing: 0.3, textTransform: 'uppercase', whiteSpace: 'nowrap' };
const td = { padding: '6px 10px', verticalAlign: 'middle' };
const tdNum = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
const btnPri = { padding: '6px 12px', borderRadius: 6, border: 'none', background: '#c8a84b', color: '#1c1f26', fontWeight: 700, cursor: 'pointer', fontSize: 12 };
const btnSec = { padding: '6px 12px', borderRadius: 6, border: '1px solid #cbd5e0', background: '#fff', cursor: 'pointer', fontSize: 12 };
const btnWa  = { padding: '6px 12px', borderRadius: 6, border: 'none', background: '#25D366', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 };
