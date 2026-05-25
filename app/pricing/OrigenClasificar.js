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

function PorProveedor({ usuario, notify }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(null);

  const cargar = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('clasificacion_origen_proveedor')
      .select('*')
      .order('venta_12m', { ascending: false });
    if (error) notify(error.message, false);
    setRows(Array.isArray(data) ? data : []);
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

  return (
    <div>
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
              {[['Proveedor', 'left'], ['Venta 12m', 'right'], ['Origen', 'left'], ['País', 'left'], ['Notas', 'left']].map(([h, al]) => (
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
              <tr><td colSpan={5} style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>Sin proveedores</td></tr>
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
