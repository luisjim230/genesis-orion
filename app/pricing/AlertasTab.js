'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { fmtCRC, fmtPct, fmtNum } from '../../lib/pricing';

// Lógica de alerta:
// Para los SKUs clase A, comparamos el margen del período actual contra
// el margen ponderado de los últimos 90 días en la base.
// Si la caída es >= caidaMin pp, lo marcamos como alerta.

export default function AlertasTab({ rows, inicio, fin }) {
  const [caidaMin, setCaidaMin] = useState(3); // pp
  const [thresholds, setThresholds] = useState({});
  const [logs, setLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // SKUs clase A
  const claseA = useMemo(() => rows.filter(r => r._clase === 'A'), [rows]);

  // Cargar thresholds + log
  useEffect(() => {
    supabase.from('pricing_thresholds_skus').select('*').then(({ data }) => {
      if (data) setThresholds(Object.fromEntries(data.map(t => [t.codigo_interno, t.margen_minimo_pct])));
    });
  }, []);

  const cargarLogs = useCallback(async () => {
    setLoadingLogs(true);
    const { data } = await supabase
      .from('pricing_alertas_log')
      .select('*')
      .order('fecha_alerta', { ascending: false })
      .limit(50);
    setLogs(data || []);
    setLoadingLogs(false);
  }, []);
  useEffect(() => {
    let cancel = false;
    (async () => {
      const { data } = await supabase
        .from('pricing_alertas_log')
        .select('*')
        .order('fecha_alerta', { ascending: false })
        .limit(50);
      if (!cancel) setLogs(data || []);
    })();
    return () => { cancel = true; };
  }, []);

  // Detectar alertas comparando margen actual vs threshold default (margen actual - caidaMin)
  // No tenemos baseline 90d en cliente, así que usamos el margen del período como referencia y
  // alertamos si está por debajo del threshold del SKU (si existe) o por debajo de un mínimo
  // razonable definido por el usuario (corte 30% por defecto, ajustable con caidaMin como pp del cuadrante).
  const alertas = useMemo(() => {
    const out = [];
    claseA.forEach(r => {
      const margenActual = Number(r.margen_pct || 0);
      const minPersonal = thresholds[r.codigo_interno];
      const baseline = (() => {
        if (typeof minPersonal === 'number') return minPersonal;
        // baseline implícita = banda de margen del SKU - tolerancia
        if (r._banda === 'Alto') return 40;
        if (r._banda === 'Medio') return 28;
        return 22;
      })();
      const caida = baseline - margenActual;
      if (caida >= caidaMin) {
        out.push({ ...r, _baseline: baseline, _caida: caida });
      }
    });
    return out.sort((a, b) => b._caida - a._caida);
  }, [claseA, thresholds, caidaMin]);

  const setTh = async (sku, nombre, val) => {
    if (val === '' || val === null) {
      await supabase.from('pricing_thresholds_skus').delete().eq('codigo_interno', sku);
      setThresholds(prev => { const n = { ...prev }; delete n[sku]; return n; });
    } else {
      const num = parseFloat(val);
      if (!isFinite(num)) return;
      await supabase.from('pricing_thresholds_skus').upsert({
        codigo_interno: sku, margen_minimo_pct: num, comentario: nombre, actualizado_en: new Date().toISOString(),
      }, { onConflict: 'codigo_interno' });
      setThresholds(prev => ({ ...prev, [sku]: num }));
    }
  };

  return (
    <div>
      <div style={{
        background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 10, padding: 12, marginBottom: 14, fontSize: 12, color: '#92400e',
      }}>
        🚨 Mostramos los <b>SKUs clase A</b> (los que llevan el 80% de la venta) cuyo margen actual cayó por debajo
        del threshold. Por default usamos un threshold según la banda del SKU (Alto: 40%, Medio: 28%, Bajo: 22%).
        Podés fijar un threshold personalizado por SKU en la columna &laquo;Umbral SKU&raquo;.
      </div>

      <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 12, color: '#374151' }}>
          Caída mínima para alertar (pp):
          <input type="number" min={0} step={0.5} value={caidaMin}
            onChange={e => setCaidaMin(parseFloat(e.target.value) || 0)}
            style={{ marginLeft: 8, padding: '5px 10px', border: '1px solid #d1d5db', borderRadius: 6, width: 80, fontSize: 12 }} />
        </label>
        <div style={{ marginLeft: 'auto', fontSize: 12, color: '#6b7280' }}>
          {fmtNum(alertas.length)} alertas activas · {fmtNum(claseA.length)} SKUs clase A monitoreados
        </div>
      </div>

      <div style={{ overflow: 'auto', maxHeight: '50vh', border: '1px solid #e5e7eb', borderRadius: 10, background: 'white', marginBottom: 16 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead style={{ position: 'sticky', top: 0, background: '#5E2733', zIndex: 2 }}>
            <tr>
              {['SKU','Nombre','Categoría','Margen actual','Umbral implícito','Umbral SKU','Caída pp','Venta período','Utilidad'].map(h => (
                <th key={h} style={{ padding: '8px 10px', color: 'white', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {alertas.length === 0 && (
              <tr><td colSpan={9} style={{ padding: 20, textAlign: 'center', color: '#10b981', fontWeight: 600 }}>
                ✅ No hay alertas activas — todos los SKUs clase A están dentro del threshold.
              </td></tr>
            )}
            {alertas.map(r => (
              <tr key={r.codigo_interno} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={cellMono}>{r.codigo_interno}</td>
                <td style={cell} title={r.nombre}>{(r.nombre || '').slice(0, 60)}</td>
                <td style={{ ...cell, color: '#6b7280', fontSize: 11 }}>{r.categoria}</td>
                <td style={{ ...cell, color: '#dc2626', fontWeight: 700 }}>{fmtPct(r.margen_pct)}</td>
                <td style={cell}>{fmtPct(r._baseline)}</td>
                <td style={cell}>
                  <input
                    type="number"
                    placeholder="—"
                    defaultValue={thresholds[r.codigo_interno] ?? ''}
                    onBlur={e => setTh(r.codigo_interno, r.nombre, e.target.value)}
                    style={{ width: 70, padding: '3px 6px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 11 }}
                  />
                </td>
                <td style={{ ...cell, fontWeight: 700, color: '#dc2626' }}>-{r._caida.toFixed(1)} pp</td>
                <td style={{ ...cell, textAlign: 'right' }}>{fmtCRC(r.venta_neta)}</td>
                <td style={{ ...cell, textAlign: 'right' }}>{fmtCRC(r.utilidad_neta)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Histórico de alertas enviadas por Telegram */}
      <div style={{ marginTop: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#5E2733', margin: 0 }}>📬 Historial de alertas enviadas por Telegram</h3>
          <button onClick={cargarLogs} disabled={loadingLogs} style={{
            padding: '5px 10px', fontSize: 11, borderRadius: 6, border: '1px solid #d1d5db',
            background: 'white', cursor: 'pointer',
          }}>{loadingLogs ? 'Cargando…' : 'Refrescar'}</button>
        </div>
        <div style={{ overflow: 'auto', maxHeight: 240, border: '1px solid #e5e7eb', borderRadius: 8, background: 'white' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead style={{ position: 'sticky', top: 0, background: '#f3f4f6' }}>
              <tr>
                {['Fecha','SKU','Nombre','Margen baseline','Margen actual','Caída','Telegram'].map(h => (
                  <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#374151', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 && <tr><td colSpan={7} style={{ padding: 20, textAlign: 'center', color: '#9ca3af' }}>Sin alertas registradas todavía. El job diario las irá poblando.</td></tr>}
              {logs.map(l => (
                <tr key={l.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={cell}>{l.fecha_alerta}</td>
                  <td style={cellMono}>{l.codigo_interno}</td>
                  <td style={cell}>{(l.nombre || '').slice(0, 40)}</td>
                  <td style={cell}>{fmtPct(l.margen_baseline_pct)}</td>
                  <td style={{ ...cell, color: '#dc2626' }}>{fmtPct(l.margen_actual_pct)}</td>
                  <td style={{ ...cell, color: '#dc2626', fontWeight: 700 }}>-{Number(l.caida_pp).toFixed(1)} pp</td>
                  <td style={cell}>{l.enviada_telegram ? '✅' : '⏸️'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const cell = { padding: '6px 10px', color: '#1f2937', whiteSpace: 'nowrap' };
const cellMono = { ...cell, fontFamily: "'JetBrains Mono','Menlo',monospace" };
