'use client';
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { fmtCRC, fmtPct, fmtNum } from '../../lib/pricing';

const SEMAFORO = {
  CRITICO: { color: '#C0392B', label: 'CRÍTICO' },
  Alerta:  { color: '#E8A317', label: 'Alerta' },
  OK:      { color: '#27AE60', label: 'OK' },
  Exceso:  { color: '#9ca3af', label: 'Exceso' },
};
const PERIODOS = [12, 24, 36];

export default function OrigenRiesgo() {
  const [meses, setMeses] = useState(12);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filtroSem, setFiltroSem] = useState('todos'); // todos | criticos | alerta+
  const [search, setSearch] = useState('');
  const [filtroProv, setFiltroProv] = useState('Todos');
  const [sort, setSort] = useState({ key: null, dir: null }); // null = orden natural (urgencia)

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true); setError(null);
      try {
        const { data, error } = await supabase.rpc('sol_riesgo_quiebre_importado', { util_min: 200000, meses });
        if (error) throw error;
        if (!cancel) setData(Array.isArray(data) ? data : []);
      } catch (e) {
        if (!cancel) { setError(e.message || String(e)); setData([]); }
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [meses]);

  const COLS = useMemo(() => ([
    { key: 'producto',        label: 'Producto',          align: 'left',   type: 'str' },
    { key: 'proveedor',       label: 'Proveedor',         align: 'left',   type: 'str' },
    { key: 'lead_dias',       label: 'Lead (días)',       align: 'right',  type: 'num' },
    { key: 'venta_12m',       label: `Venta ${meses}m`,   align: 'right',  type: 'num' },
    { key: 'utilidad_12m',    label: `Utilidad ${meses}m`, align: 'right', type: 'num' },
    { key: 'margen_pct',      label: 'Margen',            align: 'right',  type: 'num' },
    { key: 'existencias',     label: 'Existencias',       align: 'right',  type: 'num' },
    { key: 'meses_cobertura', label: 'Cobertura (meses)', align: 'right',  type: 'num' },
    { key: 'orden_urgencia',  label: 'Semáforo',          align: 'center', type: 'num' },
  ]), [meses]);

  const criticos = useMemo(() => data.filter(r => r.semaforo === 'CRITICO').length, [data]);

  const proveedores = useMemo(() => {
    const s = new Set(data.map(r => r.proveedor).filter(Boolean));
    return ['Todos', ...Array.from(s).sort((a, b) => a.localeCompare(b))];
  }, [data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.filter(r => {
      if (filtroSem === 'criticos' && r.semaforo !== 'CRITICO') return false;
      if (filtroSem === 'alerta+' && r.semaforo !== 'CRITICO' && r.semaforo !== 'Alerta') return false;
      if (filtroProv !== 'Todos' && r.proveedor !== filtroProv) return false;
      if (!q) return true;
      return (`${r.codigo_interno} ${r.producto} ${r.proveedor}`).toLowerCase().includes(q);
    });
  }, [data, filtroSem, filtroProv, search]);

  const sorted = useMemo(() => {
    if (!sort.key) return filtered; // orden natural: urgencia, luego utilidad desc
    const col = COLS.find(c => c.key === sort.key);
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      let av = a[sort.key], bv = b[sort.key];
      const an = av == null, bn = bv == null;
      if (an && bn) return 0;
      if (an) return 1;   // nulos siempre al final
      if (bn) return -1;
      if (col?.type === 'str') return String(av).localeCompare(String(bv)) * dir;
      return (Number(av) - Number(bv)) * dir;
    });
  }, [filtered, sort, COLS]);

  const toggleSort = (key, type) => {
    setSort(s => {
      if (s.key !== key) return { key, dir: type === 'str' ? 'asc' : 'desc' };
      if (s.dir === 'desc') return { key, dir: 'asc' };
      if (s.dir === 'asc') return { key: null, dir: null }; // 3er click: vuelve al orden natural
      return { key, dir: 'desc' };
    });
  };

  const exportCSV = () => {
    const headers = ['Codigo', 'Producto', 'Proveedor', 'Lead (dias)', `Venta ${meses}m`, `Utilidad ${meses}m`, 'Margen %', 'Existencias', 'Cobertura (meses)', 'Semaforo'];
    const esc = (v) => {
      const s = v == null ? '' : String(v);
      return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = sorted.map(r => [
      r.codigo_interno, r.producto, r.proveedor, r.lead_dias, r.venta_12m, r.utilidad_12m,
      r.margen_pct, r.existencias, r.meses_cobertura ?? '', r.semaforo,
    ].map(esc).join(','));
    const csv = '﻿' + [headers.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `riesgo_quiebre_importado_${meses}m_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      {/* Período + contador de críticos */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#6E2238', textTransform: 'uppercase', letterSpacing: 0.5 }}>Período</span>
        {PERIODOS.map(m => (
          <button key={m} onClick={() => setMeses(m)}
            style={{
              padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
              border: '1px solid ' + (meses === m ? '#6E2238' : 'rgba(110,34,56,0.2)'),
              background: meses === m ? '#6E2238' : 'white', color: meses === m ? 'white' : '#6E2238', cursor: 'pointer',
            }}>{m}m</button>
        ))}
        <div style={{
          marginLeft: 8,
          background: criticos > 0 ? '#fef2f2' : '#f0fdf4',
          border: '1px solid ' + (criticos > 0 ? '#fecaca' : '#bbf7d0'),
          borderRadius: 10, padding: '7px 14px', fontSize: 13, fontWeight: 700,
          color: criticos > 0 ? '#C0392B' : '#27AE60',
        }}>
          {criticos > 0 ? `${fmtNum(criticos)} productos en estado CRÍTICO` : 'Sin productos críticos'}
        </div>
        {loading && <span style={{ fontSize: 12, color: '#9ca3af' }}>Cargando…</span>}
      </div>

      {/* Buscador + filtros */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 14 }}>
        <input type="text" placeholder="Buscar producto, proveedor o código…" value={search} onChange={e => setSearch(e.target.value)}
          style={{ padding: '7px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 12, minWidth: 280 }} />

        <select value={filtroProv} onChange={e => setFiltroProv(e.target.value)}
          style={{ padding: '7px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 12, cursor: 'pointer', maxWidth: 260 }}>
          {proveedores.map(p => <option key={p} value={p}>{p === 'Todos' ? 'Todos los proveedores' : p}</option>)}
        </select>

        <select value={filtroSem} onChange={e => setFiltroSem(e.target.value)}
          style={{ padding: '7px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 12, cursor: 'pointer' }}>
          <option value="todos">Todos los semáforos</option>
          <option value="criticos">Solo críticos</option>
          <option value="alerta+">Alerta+</option>
        </select>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 12, color: '#6b7280' }}>{fmtNum(sorted.length)} de {fmtNum(data.length)} productos</span>
          <button onClick={exportCSV} disabled={!sorted.length}
            style={{
              padding: '7px 14px', fontSize: 12, fontWeight: 700, border: 'none', borderRadius: 8,
              background: sorted.length ? '#1B3A5C' : '#9ca3af', color: 'white',
              cursor: sorted.length ? 'pointer' : 'not-allowed',
            }}>⬇ Exportar CSV</button>
        </div>
      </div>

      {error && <div style={{ padding: 10, background: '#fee2e2', color: '#991b1b', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>⚠️ {error}</div>}

      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: '#6b7280' }}>Cargando…</div>
      ) : (
        <div style={{ overflow: 'auto', maxHeight: '60vh', border: '1px solid #e5e7eb', borderRadius: 10, background: 'white' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead style={{ position: 'sticky', top: 0, background: '#5E2733', zIndex: 2 }}>
              <tr>
                {COLS.map(c => {
                  const active = sort.key === c.key;
                  const arrow = active ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : '';
                  return (
                    <th key={c.key} onClick={() => toggleSort(c.key, c.type)}
                      title="Clic para ordenar"
                      style={{
                        padding: '8px 10px', color: active ? '#f5d76e' : 'white', fontSize: 11, fontWeight: 700,
                        textTransform: 'uppercase', letterSpacing: 0.4, textAlign: c.align, whiteSpace: 'nowrap',
                        cursor: 'pointer', userSelect: 'none',
                      }}>
                      {c.label}<span style={{ opacity: active ? 1 : 0.35 }}>{active ? arrow : ' ⇅'}</span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {sorted.map(r => {
                const sem = SEMAFORO[r.semaforo] || { color: '#9ca3af', label: r.semaforo };
                return (
                  <tr key={r.codigo_interno} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={cell} title={r.producto}>{(r.producto || '').slice(0, 70)}</td>
                    <td style={{ ...cell, color: '#6b7280', fontSize: 11 }}>{r.proveedor}</td>
                    <td style={cellR}>{fmtNum(r.lead_dias, 0)}</td>
                    <td style={cellR}>{fmtCRC(r.venta_12m)}</td>
                    <td style={cellR}>{fmtCRC(r.utilidad_12m)}</td>
                    <td style={cellR}>{fmtPct(r.margen_pct)}</td>
                    <td style={cellR}>{fmtNum(r.existencias, 0)}</td>
                    <td style={cellR}>{r.meses_cobertura == null ? '—' : fmtNum(r.meses_cobertura, 1)}</td>
                    <td style={{ ...cell, textAlign: 'center' }}>
                      <span style={{
                        display: 'inline-block', padding: '2px 10px', borderRadius: 12, fontSize: 11,
                        fontWeight: 700, background: sem.color, color: 'white', whiteSpace: 'nowrap',
                      }}>{sem.label}</span>
                    </td>
                  </tr>
                );
              })}
              {sorted.length === 0 && (
                <tr><td colSpan={COLS.length} style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>Sin productos</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const cell = { padding: '6px 10px', color: '#1f2937', whiteSpace: 'nowrap' };
const cellR = { ...cell, textAlign: 'right' };
