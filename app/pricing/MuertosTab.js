'use client';
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { fmtCRC, fmtNum, fmtPct } from '../../lib/pricing';

export default function MuertosTab() {
  const [diasMuerto, setDiasMuerto] = useState(180);
  const [costoCapital, setCostoCapital] = useState(15);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [filtroCat, setFiltroCat] = useState('Todas');

  const cargar = async () => {
    setLoading(true); setError(null);
    try {
      const { data, error } = await supabase.rpc('pricing_productos_muertos', { p_dias: diasMuerto });
      if (error) throw error;
      setData(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { cargar(); }, [diasMuerto]);

  const categorias = useMemo(() => {
    const s = new Set(data.map(r => r.categoria || 'SIN CATEGORIA'));
    return ['Todas', ...Array.from(s).sort()];
  }, [data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.filter(r => {
      if (filtroCat !== 'Todas' && r.categoria !== filtroCat) return false;
      if (!q) return true;
      return (r.codigo_interno + ' ' + r.nombre + ' ' + (r.proveedor || '')).toLowerCase().includes(q);
    }).sort((a, b) => Number(b.capital_inmovilizado || 0) - Number(a.capital_inmovilizado || 0));
  }, [data, search, filtroCat]);

  const totalCapital = filtered.reduce((s, r) => s + Number(r.capital_inmovilizado || 0), 0);
  const costoOportunidad = totalCapital * (costoCapital / 100);

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 14 }}>
        <label style={{ fontSize: 12, color: '#374151' }}>
          Días sin venta:
          <select value={diasMuerto} onChange={e => setDiasMuerto(parseInt(e.target.value))}
            style={{ marginLeft: 8, padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12 }}>
            <option value={90}>≥ 90 días</option>
            <option value={180}>≥ 180 días (6 meses)</option>
            <option value={365}>≥ 365 días (1 año)</option>
            <option value={730}>≥ 730 días (2 años)</option>
          </select>
        </label>
        <label style={{ fontSize: 12, color: '#374151' }}>
          Costo capital anual %:
          <input type="number" value={costoCapital} onChange={e => setCostoCapital(parseFloat(e.target.value) || 0)}
            style={{ marginLeft: 8, padding: '5px 10px', border: '1px solid #d1d5db', borderRadius: 6, width: 70, fontSize: 12 }} />
        </label>
        <input type="text" placeholder="Buscar SKU, nombre, proveedor…" value={search} onChange={e => setSearch(e.target.value)}
          style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12, minWidth: 240 }} />
        <select value={filtroCat} onChange={e => setFiltroCat(e.target.value)}
          style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12, minWidth: 200, cursor: 'pointer' }}>
          {categorias.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <button onClick={cargar} disabled={loading} style={{
          padding: '6px 12px', fontSize: 12, fontWeight: 700, border: 'none', borderRadius: 6,
          background: loading ? '#9ca3af' : '#c8a84b', color: 'white', cursor: loading ? 'wait' : 'pointer',
        }}>{loading ? 'Cargando…' : 'Refrescar'}</button>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 14 }}>
        <KpiCard label="SKUs muertos" value={fmtNum(filtered.length)} color="#dc2626" />
        <KpiCard label="Capital inmovilizado" value={fmtCRC(totalCapital)} color="#dc2626" />
        <KpiCard label="Costo oportunidad anual" value={fmtCRC(costoOportunidad)} color="#f97316" />
      </div>

      {error && <div style={{ padding: 10, background: '#fee2e2', color: '#991b1b', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>⚠️ {error}</div>}

      <div style={{ overflow: 'auto', maxHeight: '60vh', border: '1px solid #e5e7eb', borderRadius: 10, background: 'white' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead style={{ position: 'sticky', top: 0, background: '#5E2733', zIndex: 2 }}>
            <tr>
              {['SKU','Nombre','Categoría','Existencias','Último costo','Capital inmovil.','Última venta','Días sin venta','Costo oport. anual'].map(h => (
                <th key={h} style={{ padding: '8px 10px', color: 'white', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 1000).map(r => (
              <tr key={r.codigo_interno} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={cellMono}>{r.codigo_interno}</td>
                <td style={cell} title={r.nombre}>{(r.nombre || '').slice(0, 60)}</td>
                <td style={{ ...cell, color: '#6b7280', fontSize: 11 }}>{r.categoria}</td>
                <td style={{ ...cell, textAlign: 'right' }}>{fmtNum(r.existencias, 0)}</td>
                <td style={{ ...cell, textAlign: 'right' }}>{fmtCRC(r.ultimo_costo)}</td>
                <td style={{ ...cell, textAlign: 'right', fontWeight: 700, color: '#dc2626' }}>{fmtCRC(r.capital_inmovilizado)}</td>
                <td style={{ ...cell, fontSize: 11 }}>{r.ultima_venta || 'Nunca'}</td>
                <td style={{ ...cell, textAlign: 'right' }}>{r.dias_sin_venta >= 99999 ? '∞' : fmtNum(r.dias_sin_venta, 0)}</td>
                <td style={{ ...cell, textAlign: 'right' }}>{fmtCRC(Number(r.capital_inmovilizado) * costoCapital / 100)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length > 1000 && (
          <div style={{ padding: 8, textAlign: 'center', fontSize: 11, color: '#9ca3af', background: '#f9fafb' }}>
            Mostrando 1000 de {fmtNum(filtered.length)} SKUs
          </div>
        )}
      </div>
    </div>
  );
}

function KpiCard({ label, value, color }) {
  return (
    <div style={{
      background: 'white', border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 14px',
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color, marginTop: 4 }}>{value}</div>
    </div>
  );
}
const cell = { padding: '6px 10px', color: '#1f2937', whiteSpace: 'nowrap' };
const cellMono = { ...cell, fontFamily: "'JetBrains Mono','Menlo',monospace" };
