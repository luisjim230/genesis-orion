'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { enriquecer, periodoPresets, fmtCRC, fmtPct, fmtNum } from '../../lib/pricing';
import ParetoTab from './ParetoTab';
import MatrizTab from './MatrizTab';
import AlertasTab from './AlertasTab';
import MuertosTab from './MuertosTab';
import OrigenTab from './OrigenTab';
import RevisionComprasTab from './RevisionComprasTab';

const TABS = [
  { id: 'pareto',   label: '📊 Pareto Ventas / Utilidad' },
  { id: 'matriz',   label: '🎯 Matriz ABC × Margen' },
  { id: 'alertas',  label: '🚨 Alertas de Margen' },
  { id: 'revision', label: '🛒 Revisión de Compras' },
  { id: 'muertos',  label: '🪦 Productos Muertos' },
  { id: 'origen',   label: '🌍 Origen' },
];

export default function PricingPage() {
  const presets = useMemo(() => periodoPresets(), []);
  const [tab, setTab] = useState('pareto');
  const [presetKey, setPresetKey] = useState('12m');
  const [inicio, setInicio] = useState(presets.find(p => p.key === '12m').start);
  const [fin, setFin] = useState(presets.find(p => p.key === '12m').end);
  const [dataset, setDataset] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const aplicarPreset = (key) => {
    const p = presets.find(x => x.key === key);
    if (!p) return;
    setPresetKey(key);
    setInicio(p.start);
    setFin(p.end);
  };

  const cargarDataset = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { data, error } = await supabase.rpc('pricing_dataset_json', { p_start: inicio, p_end: fin });
      if (error) throw error;
      setDataset(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.message || String(e));
      setDataset([]);
    } finally {
      setLoading(false);
    }
  }, [inicio, fin]);

  useEffect(() => { cargarDataset(); }, [cargarDataset]);

  const enriquecidoVenta = useMemo(() => enriquecer(dataset, 'venta_neta'), [dataset]);
  const enriquecidoUtilidad = useMemo(() => enriquecer(dataset, 'utilidad_neta'), [dataset]);

  const totales = useMemo(() => {
    const venta = dataset.reduce((s, r) => s + Number(r.venta_neta || 0), 0);
    const costo = dataset.reduce((s, r) => s + Number(r.costo_neto || 0), 0);
    const util = venta - costo;
    const qty = dataset.reduce((s, r) => s + Number(r.qty_neta || 0), 0);
    return {
      skus: dataset.length,
      venta, costo, util, qty,
      margen: venta > 0 ? (util / venta) * 100 : 0,
    };
  }, [dataset]);

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1600, margin: '0 auto' }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: '#5E2733', margin: 0 }}>
          💲 Pricing
        </h1>
        <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
          Análisis Pareto, matriz ABC×Margen, alertas de erosión y productos muertos. Actualización en vivo desde NEO.
        </div>
      </div>

      {/* Selector de período */}
      <div style={{
        background: 'rgba(255,255,255,0.6)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(94,39,51,0.1)',
        borderRadius: 14,
        padding: '14px 18px',
        marginBottom: 14,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 12,
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#5E2733', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Período
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {presets.map(p => (
            <button
              key={p.key}
              onClick={() => aplicarPreset(p.key)}
              style={{
                padding: '6px 12px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                border: '1px solid ' + (presetKey === p.key ? '#5E2733' : 'rgba(94,39,51,0.2)'),
                background: presetKey === p.key ? '#5E2733' : 'white',
                color: presetKey === p.key ? 'white' : '#5E2733',
                cursor: 'pointer',
              }}
            >{p.label}</button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="date"
            value={inicio}
            onChange={e => { setInicio(e.target.value); setPresetKey('custom'); }}
            style={inputStyle}
          />
          <span style={{ color: '#9ca3af' }}>→</span>
          <input
            type="date"
            value={fin}
            onChange={e => { setFin(e.target.value); setPresetKey('custom'); }}
            style={inputStyle}
          />
        </div>
        <button onClick={cargarDataset} disabled={loading} style={{
          padding: '7px 14px',
          borderRadius: 8,
          fontSize: 12,
          fontWeight: 700,
          border: 'none',
          background: loading ? '#9ca3af' : '#c8a84b',
          color: 'white',
          cursor: loading ? 'wait' : 'pointer',
        }}>{loading ? 'Cargando…' : 'Refrescar'}</button>
      </div>

      {/* KPIs */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: 10,
        marginBottom: 14,
      }}>
        <KpiCard label="SKUs con venta" value={fmtNum(totales.skus)} color="#5E2733" />
        <KpiCard label="Venta neta" value={fmtCRC(totales.venta)} color="#1d4ed8" />
        <KpiCard label="Utilidad bruta" value={fmtCRC(totales.util)} color="#10b981" />
        <KpiCard label="Margen ponderado" value={fmtPct(totales.margen)} color="#c8a84b" />
        <KpiCard label="Unidades" value={fmtNum(totales.qty, 0)} color="#7c3aed" />
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex',
        gap: 4,
        borderBottom: '2px solid rgba(94,39,51,0.1)',
        marginBottom: 16,
        flexWrap: 'wrap',
      }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '10px 18px',
              fontSize: 13,
              fontWeight: 700,
              border: 'none',
              background: 'transparent',
              color: tab === t.id ? '#5E2733' : '#6b7280',
              borderBottom: '3px solid ' + (tab === t.id ? '#c8a84b' : 'transparent'),
              cursor: 'pointer',
              marginBottom: -2,
            }}
          >{t.label}</button>
        ))}
      </div>

      {error && (
        <div style={{ padding: 12, background: '#fee2e2', color: '#991b1b', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          ⚠️ {error}
        </div>
      )}

      {tab === 'origen' ? (
        <OrigenTab />
      ) : tab === 'revision' ? (
        <RevisionComprasTab />
      ) : loading && dataset.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center', color: '#6b7280' }}>Cargando dataset…</div>
      ) : (
        <>
          {tab === 'pareto'  && <ParetoTab  rows={dataset} ventaEnr={enriquecidoVenta} utilEnr={enriquecidoUtilidad} />}
          {tab === 'matriz'  && <MatrizTab  rows={enriquecidoVenta} />}
          {tab === 'alertas' && <AlertasTab rows={enriquecidoVenta} inicio={inicio} fin={fin} />}
          {tab === 'muertos' && <MuertosTab />}
        </>
      )}
    </div>
  );
}

const inputStyle = {
  padding: '6px 10px',
  borderRadius: 8,
  border: '1px solid rgba(94,39,51,0.2)',
  fontSize: 12,
  background: 'white',
  outline: 'none',
};

function KpiCard({ label, value, color }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.7)',
      backdropFilter: 'blur(20px)',
      border: '1px solid rgba(255,255,255,0.6)',
      borderRadius: 12,
      padding: '12px 14px',
      boxShadow: '0 2px 8px rgba(94,39,51,0.06)',
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color, marginTop: 4 }}>{value}</div>
    </div>
  );
}
