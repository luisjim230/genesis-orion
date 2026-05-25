'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { fmtCRC, fmtPct } from '../../lib/pricing';
import { ORIGEN_COLOR } from './OrigenTab';

const PERIODOS = [12, 24, 36];
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export default function OrigenPanorama() {
  const [meses, setMeses] = useState(12);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const cargar = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { data, error } = await supabase.rpc('sol_analisis_origen', { meses });
      if (error) throw error;
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.message || String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [meses]);

  useEffect(() => { cargar(); }, [cargar]);

  const totales = useMemo(() => {
    const venta = rows.reduce((s, r) => s + Number(r.venta || 0), 0);
    const utilidad = rows.reduce((s, r) => s + Number(r.utilidad || 0), 0);
    return { venta, utilidad, margen: venta > 0 ? (utilidad / venta) * 100 : 0 };
  }, [rows]);

  const maxPct = useMemo(
    () => Math.max(1, ...rows.map(r => Math.max(Number(r.pct_venta || 0), Number(r.pct_util || 0)))),
    [rows]
  );

  return (
    <div>
      {/* Selector de período */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#6E2238', textTransform: 'uppercase', letterSpacing: 0.5 }}>Período</span>
        {PERIODOS.map(m => (
          <button
            key={m}
            onClick={() => setMeses(m)}
            style={{
              padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
              border: '1px solid ' + (meses === m ? '#6E2238' : 'rgba(110,34,56,0.2)'),
              background: meses === m ? '#6E2238' : 'white',
              color: meses === m ? 'white' : '#6E2238', cursor: 'pointer',
            }}
          >{m}m</button>
        ))}
        {loading && <span style={{ fontSize: 12, color: '#9ca3af' }}>Cargando…</span>}
      </div>

      {error && <div style={{ padding: 10, background: '#fee2e2', color: '#991b1b', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>⚠️ {error}</div>}

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginBottom: 16 }}>
        <KpiCard label="Ventas totales" value={fmtCRC(totales.venta)} color="#1B3A5C" />
        <KpiCard label="Utilidad total" value={fmtCRC(totales.utilidad)} color="#27AE60" />
        <KpiCard label="Margen global" value={fmtPct(totales.margen)} color="#E07B39" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
        {/* Tabla por origen */}
        <div style={{ overflow: 'auto', border: '1px solid #e5e7eb', borderRadius: 10, background: 'white' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead style={{ background: '#5E2733' }}>
              <tr>
                {['Origen', 'Ventas', '% Ventas', 'Utilidad', '% Utilidad', 'Margen'].map((h, i) => (
                  <th key={h} style={{ padding: '8px 10px', color: 'white', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, textAlign: i === 0 ? 'left' : 'right', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.origen} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '8px 10px', fontWeight: 800, color: ORIGEN_COLOR[r.origen] || '#1f2937' }}>{cap(r.origen)}</td>
                  <td style={cellR}>{fmtCRC(r.venta)}</td>
                  <td style={cellR}>{fmtPct(r.pct_venta)}</td>
                  <td style={cellR}>{fmtCRC(r.utilidad)}</td>
                  <td style={cellR}>{fmtPct(r.pct_util)}</td>
                  <td style={cellR}>{fmtPct(r.margen)}</td>
                </tr>
              ))}
              {rows.length === 0 && !loading && (
                <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>Sin datos</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Gráfico: % ventas vs % utilidad por origen */}
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, background: 'white', padding: '14px 16px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#5E2733', marginBottom: 4 }}>% Ventas vs % Utilidad</div>
          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 14 }}>Dónde está la utilidad real por origen</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {rows.map(r => {
              const color = ORIGEN_COLOR[r.origen] || '#6b7280';
              return (
                <div key={r.origen}>
                  <div style={{ fontSize: 11, fontWeight: 700, color, marginBottom: 4 }}>{cap(r.origen)}</div>
                  <Bar label="Ventas" pct={Number(r.pct_venta || 0)} max={maxPct} color={color} faded />
                  <Bar label="Utilidad" pct={Number(r.pct_util || 0)} max={maxPct} color={color} />
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 14, marginTop: 14, fontSize: 10, color: '#6b7280' }}>
            <Legenda color="#6b7280" faded label="% Ventas" />
            <Legenda color="#6b7280" label="% Utilidad" />
          </div>
        </div>
      </div>

      <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 12, fontStyle: 'italic' }}>
        Excluye transporte y liquidaciones. Clasificación editable en la pestaña Clasificar.
      </div>
    </div>
  );
}

function Bar({ label, pct, max, color, faded }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
      <span style={{ fontSize: 9, color: '#9ca3af', width: 48, flexShrink: 0, textAlign: 'right' }}>{label}</span>
      <div style={{ flex: 1, background: '#f3f4f6', borderRadius: 4, height: 16, position: 'relative', overflow: 'hidden' }}>
        <div style={{
          width: `${Math.min(100, (pct / max) * 100)}%`, height: '100%',
          background: color, opacity: faded ? 0.4 : 1, borderRadius: 4, transition: 'width 0.3s',
        }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color: '#374151', width: 44, flexShrink: 0 }}>{fmtPct(pct)}</span>
    </div>
  );
}

function Legenda({ color, faded, label }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <span style={{ width: 12, height: 12, borderRadius: 3, background: color, opacity: faded ? 0.4 : 1, display: 'inline-block' }} />
      {label}
    </span>
  );
}

function KpiCard({ label, value, color }) {
  return (
    <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: '14px 16px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color, marginTop: 4 }}>{value}</div>
    </div>
  );
}

const cellR = { padding: '8px 10px', textAlign: 'right', color: '#1f2937', whiteSpace: 'nowrap' };
