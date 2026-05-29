'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { fmtCRC } from '../../lib/pricing';
import { ORIGEN_COLOR } from './OrigenTab';

const ORIGEN_PROV = ['nacional', 'importado', 'combo'];
const ORIGEN_PROD = ['nacional', 'importado', 'combo', 'liquidacion'];
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export default function OrigenClasificar({ usuario }) {
  const [modo, setModo] = useState('proveedor');
  const [toast, setToast] = useState(null);

  const notify = useCallback((msg, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 2600);
  }, []);

  return (
    <div>
      <div style={{ display: 'flex', borderRadius: 10, border: '1px solid rgba(110,34,56,0.2)', overflow: 'hidden', width: 'fit-content', marginBottom: 16 }}>
        {[['proveedor', 'Por Proveedor'], ['producto', 'Por Producto']].map(([id, label]) => (
          <button key={id} onClick={() => setModo(id)} style={{
            padding: '8px 18px', fontSize: 12, fontWeight: 700, border: 'none',
            background: modo === id ? '#6E2238' : 'white', color: modo === id ? 'white' : '#6E2238', cursor: 'pointer',
          }}>{label}</button>
        ))}
      </div>

      {modo === 'proveedor' ? <PorProveedor usuario={usuario} notify={notify} /> : <PorProducto usuario={usuario} notify={notify} />}

      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 1000,
          background: toast.ok ? '#27AE60' : '#C0392B', color: 'white',
          padding: '12px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600,
          boxShadow: '0 6px 20px rgba(0,0,0,0.2)', maxWidth: 360,
        }}>{toast.ok ? '✅ ' : '⚠️ '}{toast.msg}</div>
      )}
    </div>
  );
}

// El campo `tipo` de proveedores_leadtime distingue extranjero vs nacional.
// Lo derivamos del origen para mantener consistencia (combo se trata como nacional/interno).
const tipoDeOrigen = (origen) => (origen === 'importado' ? 'extranjero' : 'nacional');
const norm = (s) => (s || '').trim().toUpperCase();

function PorProveedor({ usuario, notify }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(null);
  const [nuevo, setNuevo] = useState({ proveedor: '', origen: 'nacional', pais: '', lead: '8' });
  const [agregando, setAgregando] = useState(false);

  const cargar = async () => {
    setLoading(true);
    const [clasif, leads] = await Promise.all([
      supabase.from('clasificacion_origen_proveedor').select('*').order('venta_12m', { ascending: false }),
      supabase.from('proveedores_leadtime').select('proveedor, lead_time_dias, activo'),
    ]);
    if (clasif.error) notify(clasif.error.message, false);
    if (leads.error) notify(leads.error.message, false);
    // Mapa de lead time por nombre normalizado (guarda el nombre exacto para escribir en su lugar).
    const ltMap = new Map();
    for (const l of (leads.data || [])) ltMap.set(norm(l.proveedor), { nombre: l.proveedor, dias: l.lead_time_dias });
    const merged = (clasif.data || []).map(r => {
      const lt = ltMap.get(norm(r.proveedor));
      return { ...r, lead_time_dias: lt?.dias ?? null, lt_proveedor: lt?.nombre ?? null };
    });
    setRows(merged);
    setLoading(false);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { cargar(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = q ? rows.filter(r => (r.proveedor || '').toLowerCase().includes(q)) : rows;
    return base.slice(0, 400);
  }, [rows, search]);

  const guardar = async (prov, cambios) => {
    setSaving(prov);
    const patch = { ...cambios, fuente_clasificacion: 'manual', clasificado_por: usuario, actualizado_en: new Date().toISOString() };
    const { error } = await supabase.from('clasificacion_origen_proveedor').update(patch).eq('proveedor', prov);
    setSaving(null);
    if (error) { notify(error.message, false); return; }
    setRows(rs => rs.map(r => (r.proveedor === prov ? { ...r, ...patch } : r)));
    notify(`Proveedor "${prov}" actualizado`);
  };

  // Guarda/edita el lead time (días) de un proveedor en proveedores_leadtime.
  const guardarLead = async (row, diasStr) => {
    const dias = parseInt(diasStr, 10);
    if (!Number.isFinite(dias) || dias < 0) { notify('Lead time inválido', false); return; }
    if (dias === (row.lead_time_dias ?? -1)) return; // sin cambios
    setSaving(row.proveedor);
    const nombreLT = row.lt_proveedor || row.proveedor; // si ya existe, lo actualiza en su lugar
    const reg = { proveedor: nombreLT, lead_time_dias: dias, tipo: tipoDeOrigen(row.origen), activo: true };
    const { error } = await supabase.from('proveedores_leadtime').upsert(reg, { onConflict: 'proveedor' });
    setSaving(null);
    if (error) { notify(error.message, false); return; }
    setRows(rs => rs.map(r => (r.proveedor === row.proveedor ? { ...r, lead_time_dias: dias, lt_proveedor: nombreLT } : r)));
    notify(`Lead time de "${row.proveedor}" = ${dias} días`);
  };

  const agregarProveedor = async () => {
    const prov = nuevo.proveedor.trim();
    if (prov.length < 2) { notify('Escribí el nombre del proveedor', false); return; }
    if (rows.some(r => norm(r.proveedor) === norm(prov))) { notify('Ese proveedor ya existe', false); return; }
    setAgregando(true);
    const ahora = new Date().toISOString();
    const cl = await supabase.from('clasificacion_origen_proveedor').upsert({
      proveedor: prov, origen: nuevo.origen, pais: nuevo.pais.trim() || null,
      fuente_clasificacion: 'manual', clasificado_por: usuario, actualizado_en: ahora,
    }, { onConflict: 'proveedor' });
    if (cl.error) { setAgregando(false); notify(cl.error.message, false); return; }
    const dias = parseInt(nuevo.lead, 10);
    if (Number.isFinite(dias) && dias >= 0) {
      const lt = await supabase.from('proveedores_leadtime').upsert({
        proveedor: prov, lead_time_dias: dias, tipo: tipoDeOrigen(nuevo.origen), activo: true, notas: 'alta manual',
      }, { onConflict: 'proveedor' });
      if (lt.error) { setAgregando(false); notify(lt.error.message, false); return; }
    }
    setAgregando(false);
    setNuevo({ proveedor: '', origen: 'nacional', pais: '', lead: '8' });
    notify(`Proveedor "${prov}" agregado`);
    cargar();
  };

  const inp = { padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 12 };

  return (
    <div>
      {/* Alta manual de proveedor */}
      <div style={{ background: '#EFE6D9', border: '1px solid #e3d4c0', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#6E2238', marginBottom: 10 }}>➕ Agregar proveedor manualmente</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <input type="text" placeholder="Nombre del proveedor" value={nuevo.proveedor}
            onChange={e => setNuevo(n => ({ ...n, proveedor: e.target.value }))}
            style={{ ...inp, minWidth: 240 }} />
          <select value={nuevo.origen} onChange={e => setNuevo(n => ({ ...n, origen: e.target.value }))}
            style={{ ...inp, cursor: 'pointer', fontWeight: 700, color: ORIGEN_COLOR[nuevo.origen] || '#1f2937' }}>
            {ORIGEN_PROV.map(o => <option key={o} value={o}>{cap(o)}</option>)}
          </select>
          <input type="text" placeholder="País (opcional)" value={nuevo.pais}
            onChange={e => setNuevo(n => ({ ...n, pais: e.target.value }))}
            style={{ ...inp, width: 130 }} />
          <input type="number" min="0" placeholder="Lead días" value={nuevo.lead}
            onChange={e => setNuevo(n => ({ ...n, lead: e.target.value }))}
            title="Días de espera para reponer (lead time)"
            style={{ ...inp, width: 100 }} />
          <button onClick={agregarProveedor} disabled={agregando}
            style={{
              padding: '7px 16px', fontSize: 12, fontWeight: 700, border: 'none', borderRadius: 8,
              background: agregando ? '#9ca3af' : '#6E2238', color: 'white', cursor: agregando ? 'not-allowed' : 'pointer',
            }}>{agregando ? 'Agregando…' : 'Agregar'}</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
        <input type="text" placeholder="Buscar proveedor…" value={search} onChange={e => setSearch(e.target.value)}
          style={{ padding: '7px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 12, minWidth: 260 }} />
        <span style={{ fontSize: 12, color: '#6b7280' }}>{filtered.length} de {rows.length}</span>
        {loading && <span style={{ fontSize: 12, color: '#9ca3af' }}>Cargando…</span>}
      </div>

      <div style={{ overflow: 'auto', maxHeight: '60vh', border: '1px solid #e5e7eb', borderRadius: 10, background: 'white' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead style={{ position: 'sticky', top: 0, background: '#5E2733', zIndex: 2 }}>
            <tr>
              {[['Proveedor', 'left'], ['Venta 12m', 'right'], ['Origen', 'left'], ['Lead (días)', 'right'], ['País', 'left'], ['Notas', 'left']].map(([h, al]) => (
                <th key={h} style={{ padding: '8px 10px', color: 'white', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, textAlign: al, whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.proveedor} style={{ borderBottom: '1px solid #f3f4f6', opacity: saving === r.proveedor ? 0.5 : 1 }}>
                <td style={{ padding: '6px 10px', color: '#1f2937' }}>{r.proveedor}</td>
                <td style={{ padding: '6px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtCRC(r.venta_12m)}</td>
                <td style={{ padding: '6px 10px' }}>
                  <select value={ORIGEN_PROV.includes(r.origen) ? r.origen : ''} onChange={e => guardar(r.proveedor, { origen: e.target.value })}
                    style={{
                      padding: '5px 8px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                      border: '1px solid #d1d5db', fontWeight: 700,
                      color: ORIGEN_COLOR[r.origen] || '#6b7280',
                    }}>
                    {!ORIGEN_PROV.includes(r.origen) && <option value="">sin clasificar</option>}
                    {ORIGEN_PROV.map(o => <option key={o} value={o}>{cap(o)}</option>)}
                  </select>
                </td>
                <td style={{ padding: '6px 10px', textAlign: 'right' }}>
                  <input type="number" min="0" defaultValue={r.lead_time_dias ?? ''} placeholder="—"
                    onBlur={e => guardarLead(r, e.target.value)}
                    title="Días de espera para reponer (lead time)"
                    style={{ padding: '5px 8px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12, width: 70, textAlign: 'right' }} />
                </td>
                <td style={{ padding: '6px 10px' }}>
                  <input defaultValue={r.pais || ''} placeholder="—"
                    onBlur={e => { const v = e.target.value.trim(); if (v !== (r.pais || '')) guardar(r.proveedor, { pais: v }); }}
                    style={{ padding: '5px 8px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12, width: 90 }} />
                </td>
                <td style={{ padding: '6px 10px' }}>
                  <input defaultValue={r.notas || ''} placeholder="—"
                    onBlur={e => { const v = e.target.value.trim(); if (v !== (r.notas || '')) guardar(r.proveedor, { notas: v }); }}
                    style={{ padding: '5px 8px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12, width: '100%', minWidth: 160 }} />
                </td>
              </tr>
            ))}
            {filtered.length === 0 && !loading && (
              <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>Sin proveedores</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PorProducto({ usuario, notify }) {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState([]);
  const [overrides, setOverrides] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(null);

  useEffect(() => {
    // Sanea el término: comas y paréntesis tienen sintaxis especial en el filtro .or() de PostgREST.
    const term = q.trim().replace(/[,%()*\\]/g, ' ').trim();
    let cancel = false;
    const t = setTimeout(async () => {
      if (term.length < 2) { if (!cancel) { setRows([]); setOverrides({}); } return; }
      setLoading(true);
      const { data, error } = await supabase
        .from('neo_lista_items')
        .select('codigo_interno, item, categoria, proveedor, existencias')
        .or(`item.ilike.%${term}%,codigo_interno.ilike.%${term}%`)
        .limit(40);
      if (cancel) return;
      if (error) { notify(error.message, false); setLoading(false); return; }
      const items = Array.isArray(data) ? data : [];
      setRows(items);
      const codes = items.map(i => i.codigo_interno);
      if (codes.length) {
        const { data: ovs } = await supabase
          .from('clasificacion_origen_producto')
          .select('codigo_interno, origen')
          .in('codigo_interno', codes);
        if (!cancel) setOverrides(Object.fromEntries((ovs || []).map(o => [o.codigo_interno, o.origen])));
      } else {
        setOverrides({});
      }
      setLoading(false);
    }, 350);
    return () => { cancel = true; clearTimeout(t); };
  }, [q, notify]);

  const asignar = async (item, origen) => {
    setSaving(item.codigo_interno);
    const reg = {
      codigo_interno: item.codigo_interno,
      origen,
      fuente: 'manual',
      clasificado_por: usuario,
      actualizado_en: new Date().toISOString(),
    };
    const { error } = await supabase.from('clasificacion_origen_producto').upsert(reg, { onConflict: 'codigo_interno' });
    setSaving(null);
    if (error) { notify(error.message, false); return; }
    setOverrides(o => ({ ...o, [item.codigo_interno]: origen }));
    notify(`Override "${cap(origen)}" asignado a ${item.codigo_interno}`);
  };

  return (
    <div>
      <div style={{ background: '#EFE6D9', border: '1px solid #e3d4c0', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#6E2238', marginBottom: 14 }}>
        El override por producto <b>gana</b> sobre la clasificación de su proveedor. Útil para combos, liquidaciones y casos especiales.
      </div>

      <input type="text" autoFocus placeholder="Buscar producto por nombre o código…" value={q} onChange={e => setQ(e.target.value)}
        style={{ padding: '9px 14px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, width: '100%', maxWidth: 460, marginBottom: 14 }} />

      {loading && <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 8 }}>Buscando…</div>}

      {rows.length > 0 && (
        <div style={{ overflow: 'auto', maxHeight: '56vh', border: '1px solid #e5e7eb', borderRadius: 10, background: 'white' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead style={{ position: 'sticky', top: 0, background: '#5E2733', zIndex: 2 }}>
              <tr>
                {[['Código', 'left'], ['Producto', 'left'], ['Proveedor', 'left'], ['Existencias', 'right'], ['Override de origen', 'left']].map(([h, al]) => (
                  <th key={h} style={{ padding: '8px 10px', color: 'white', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, textAlign: al, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const ov = overrides[r.codigo_interno];
                return (
                  <tr key={r.codigo_interno} style={{ borderBottom: '1px solid #f3f4f6', opacity: saving === r.codigo_interno ? 0.5 : 1 }}>
                    <td style={{ padding: '6px 10px', fontFamily: "'JetBrains Mono','Menlo',monospace", color: '#1f2937', whiteSpace: 'nowrap' }}>{r.codigo_interno}</td>
                    <td style={{ padding: '6px 10px', color: '#1f2937' }} title={r.item}>{(r.item || '').trim().slice(0, 60)}</td>
                    <td style={{ padding: '6px 10px', color: '#6b7280', fontSize: 11 }}>{(r.proveedor || '').trim()}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right' }}>{r.existencias ?? '—'}</td>
                    <td style={{ padding: '6px 10px' }}>
                      <select value={ov || ''} onChange={e => asignar(r, e.target.value)}
                        style={{
                          padding: '5px 8px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                          border: '1px solid ' + (ov ? (ORIGEN_COLOR[ov] || '#d1d5db') : '#d1d5db'),
                          fontWeight: 700, color: ov ? (ORIGEN_COLOR[ov] || '#6b7280') : '#9ca3af',
                        }}>
                        <option value="" disabled>Asignar…</option>
                        {ORIGEN_PROD.map(o => <option key={o} value={o}>{cap(o)}</option>)}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && q.trim().length >= 2 && rows.length === 0 && (
        <div style={{ padding: 24, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>Sin resultados para “{q.trim()}”.</div>
      )}
    </div>
  );
}
