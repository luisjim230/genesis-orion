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

export default function OrigenRiesgo() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filtro, setFiltro] = useState('todos'); // todos | criticos | alerta+

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true); setError(null);
      try {
        const { data, error } = await supabase.rpc('sol_riesgo_quiebre_importado', { util_min: 200000 });
        if (error) throw error;
        if (!cancel) setData(Array.isArray(data) ? data : []);
      } catch (e) {
        if (!cancel) { setError(e.message || String(e)); setData([]); }
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, []);

  const criticos = useMemo(() => data.filter(r => r.semaforo === 'CRITICO').length, [data]);

  const filtered = useMemo(() => {
    if (filtro === 'criticos') return data.filter(r => r.semaforo === 'CRITICO');
    if (filtro === 'alerta+')  return data.filter(r => r.semaforo === 'CRITICO' || r.semaforo === 'Alerta');
    return data;
  }, [data, filtro]);

  const exportCSV = () => {
    const headers = ['Codigo', 'Producto', 'Proveedor', 'Lead (dias)', 'Venta 12m', 'Utilidad 12m', 'Margen %', 'Existencias', 'Cobertura (meses)', 'Semaforo'];
    const esc = (v) => {
      const s = v == null ? '' : String(v);
      return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = filtered.map(r => [
      r.codigo_interno, r.producto, r.proveedor, r.lead_dias, r.venta_12m, r.utilidad_12m,
      r.margen_pct, r.existencias, r.meses_cobertura ?? '', r.semaforo,
    ].map(esc).join(','));
    const csv = '﻿' + [headers.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `riesgo_quiebre_importado_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 14 }}>
        <div style={{
          background: criticos > 0 ? '#fef2f2' : '#f0fdf4',
          border: '1px solid ' + (criticos > 0 ? '#fecaca' : '#bbf7d0'),
          borderRadius: 10, padding: '8px 14px', fontSize: 13, fontWeight: 700,
          color: criticos > 0 ? '#C0392B' : '#27AE60',
        }}>
          {criticos > 0 ? `${fmtNum(criticos)} productos en estado CRÍTICO` : 'Sin productos críticos'}
        </div>

        <select value={filtro} onChange={e => setFiltro(e.target.value)}
          style={{ padding: '7px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 12, cursor: 'pointer' }}>
          <option value="todos">Todos</option>
          <option value="criticos">Solo críticos</option>
          <option value="alerta+">Alerta+</option>
        </select>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 12, color: '#6b7280' }}>{fmtNum(filtered.length)} productos</span>
          <button onClick={exportCSV} disabled={!filtered.length}
            style={{
              padding: '7px 14px', fontSize: 12, fontWeight: 700, border: 'none', borderRadius: 8,
              background: filtered.length ? '#1B3A5C' : '#9ca3af', color: 'white',
              cursor: filtered.length ? 'pointer' : 'not-allowed',
            }}>⬇ Exportar CSV</button>
        </div>
      </div>

      {error && <div style={{ padding: 10, background: '#fee2e2', color: '#991b1b', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>⚠️ {error}</div>}

      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: '#6b7280' }}>Cargando…</div>
      ) : (
        <div style={{ overflow: 'auto', maxHeight: '62vh', border: '1px solid #e5e7eb', borderRadius: 10, background: 'white' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead style={{ position: 'sticky', top: 0, background: '#5E2733', zIndex: 2 }}>
              <tr>
                {[['Producto', 'left'], ['Proveedor', 'left'], ['Lead (días)', 'right'], ['Venta 12m', 'right'], ['Utilidad 12m', 'right'], ['Margen', 'right'], ['Existencias', 'right'], ['Cobertura (meses)', 'right'], ['Semáforo', 'center']].map(([h, al]) => (
                  <th key={h} style={{ padding: '8px 10px', color: 'white', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, textAlign: al, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
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
              {filtered.length === 0 && (
                <tr><td colSpan={9} style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>Sin productos</td></tr>
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
