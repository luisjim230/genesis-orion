'use client';
import { useMemo, useState } from 'react';
import { fmtCRC, fmtPct, fmtNum } from '../../lib/pricing';

const CLASE_COLOR = { A: '#10b981', B: '#3b82f6', C: '#9ca3af' };

export default function ParetoTab({ rows, ventaEnr, utilEnr }) {
  const [metric, setMetric] = useState('venta_neta'); // 'venta_neta' | 'utilidad_neta'
  const [search, setSearch] = useState('');
  const [filtroCat, setFiltroCat] = useState('Todas');
  const [filtroClase, setFiltroClase] = useState('Todas');

  const data = metric === 'venta_neta' ? ventaEnr : utilEnr;
  const setVentaA = useMemo(() => new Set(ventaEnr.filter(r => r._clase === 'A').map(r => r.codigo_interno)), [ventaEnr]);
  const setUtilA  = useMemo(() => new Set(utilEnr.filter(r => r._clase === 'A').map(r => r.codigo_interno)), [utilEnr]);

  const categorias = useMemo(() => {
    const s = new Set(data.map(r => r.categoria || 'SIN CATEGORIA'));
    return ['Todas', ...Array.from(s).sort()];
  }, [data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.filter(r => {
      if (filtroClase !== 'Todas' && r._clase !== filtroClase) return false;
      if (filtroCat !== 'Todas' && r.categoria !== filtroCat) return false;
      if (!q) return true;
      return (r.codigo_interno + ' ' + r.nombre + ' ' + (r.marca || '')).toLowerCase().includes(q);
    });
  }, [data, search, filtroCat, filtroClase]);

  // Solapamientos
  const solap = useMemo(() => ({
    ventaUtil: ventaEnr.filter(r => r._clase === 'A' && setUtilA.has(r.codigo_interno)).length,
    soloVenta: ventaEnr.filter(r => r._clase === 'A' && !setUtilA.has(r.codigo_interno)).length,
    soloUtil:  utilEnr.filter(r => r._clase === 'A' && !setVentaA.has(r.codigo_interno)).length,
  }), [ventaEnr, utilEnr, setVentaA, setUtilA]);

  // Resumen ABC
  const resumen = useMemo(() => {
    const total = data.reduce((s, r) => s + Number(r[metric] || 0), 0);
    const acc = { A: { n: 0, v: 0 }, B: { n: 0, v: 0 }, C: { n: 0, v: 0 } };
    data.forEach(r => { acc[r._clase].n += 1; acc[r._clase].v += Number(r[metric] || 0); });
    return { total, ...acc };
  }, [data, metric]);

  return (
    <div>
      {/* Toggle metric + filtros */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', borderRadius: 10, border: '1px solid rgba(94,39,51,0.2)', overflow: 'hidden' }}>
          <ToggleBtn active={metric === 'venta_neta'} onClick={() => setMetric('venta_neta')}>Pareto Ventas</ToggleBtn>
          <ToggleBtn active={metric === 'utilidad_neta'} onClick={() => setMetric('utilidad_neta')}>Pareto Utilidad</ToggleBtn>
        </div>
        <input
          type="text"
          placeholder="Buscar SKU, nombre, marca…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={inputStyle}
        />
        <select value={filtroCat} onChange={e => setFiltroCat(e.target.value)} style={selectStyle}>
          {categorias.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filtroClase} onChange={e => setFiltroClase(e.target.value)} style={selectStyle}>
          <option value="Todas">Todas las clases</option>
          <option value="A">Clase A</option>
          <option value="B">Clase B</option>
          <option value="C">Clase C</option>
        </select>
        <div style={{ marginLeft: 'auto', fontSize: 12, color: '#6b7280' }}>
          {fmtNum(filtered.length)} de {fmtNum(data.length)} SKUs
        </div>
      </div>

      {/* Resumen ABC */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr) auto', gap: 10, marginBottom: 12 }}>
        {['A', 'B', 'C'].map(c => (
          <div key={c} style={{
            background: 'white',
            border: `2px solid ${CLASE_COLOR[c]}`,
            borderRadius: 10,
            padding: '10px 14px',
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: CLASE_COLOR[c], textTransform: 'uppercase' }}>Clase {c}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4 }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#5E2733' }}>{fmtNum(resumen[c].n)} SKUs</div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>{fmtPct((resumen[c].v / (resumen.total || 1)) * 100)}</div>
            </div>
            <div style={{ fontSize: 12, color: '#374151', marginTop: 2 }}>{fmtCRC(resumen[c].v)}</div>
          </div>
        ))}
        <div style={{
          background: 'rgba(200,168,75,0.1)', border: '1px solid rgba(200,168,75,0.3)',
          borderRadius: 10, padding: '10px 14px', minWidth: 200,
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#92400e', textTransform: 'uppercase' }}>Cruce Pareto Venta vs Utilidad</div>
          <div style={{ fontSize: 11, color: '#374151', marginTop: 4, lineHeight: 1.5 }}>
            <div>✅ En ambos: <b>{solap.ventaUtil}</b></div>
            <div>📈 Solo en venta: <b>{solap.soloVenta}</b> <span style={{ color: '#9ca3af' }}>(candidatos a subir precio)</span></div>
            <div>💎 Solo en utilidad: <b>{solap.soloUtil}</b> <span style={{ color: '#9ca3af' }}>(joyas ocultas)</span></div>
          </div>
        </div>
      </div>

      {/* Tabla Pareto */}
      <div style={{ overflow: 'auto', maxHeight: '60vh', border: '1px solid #e5e7eb', borderRadius: 10, background: 'white' }}>
        <table style={tableStyle}>
          <thead style={{ position: 'sticky', top: 0, background: '#5E2733', zIndex: 2 }}>
            <tr>
              <Th>#</Th>
              <Th>SKU</Th>
              <Th>Nombre</Th>
              <Th>Categoría</Th>
              <Th align="right">Unidades</Th>
              <Th align="right">{metric === 'venta_neta' ? 'Venta' : 'Utilidad'}</Th>
              <Th align="right">{metric === 'venta_neta' ? 'Margen %' : 'Venta'}</Th>
              <Th align="right">% indiv.</Th>
              <Th align="right">% acum.</Th>
              <Th align="center">Clase</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 1000).map(r => (
              <tr key={r.codigo_interno} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <Td>{r._rank}</Td>
                <Td mono>{r.codigo_interno}</Td>
                <Td title={r.nombre}>{(r.nombre || '').slice(0, 60)}</Td>
                <Td style={{ color: '#6b7280', fontSize: 11 }}>{r.categoria}</Td>
                <Td align="right">{fmtNum(r.qty_neta, 0)}</Td>
                <Td align="right" bold>{fmtCRC(metric === 'venta_neta' ? r.venta_neta : r.utilidad_neta)}</Td>
                <Td align="right">
                  {metric === 'venta_neta' ? fmtPct(r.margen_pct) : fmtCRC(r.venta_neta)}
                </Td>
                <Td align="right">{fmtPct(r._pct_individual * 100, 2)}</Td>
                <Td align="right">{fmtPct(r._pct_acumulado * 100, 1)}</Td>
                <Td align="center">
                  <span style={{
                    padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700,
                    background: CLASE_COLOR[r._clase] + '22', color: CLASE_COLOR[r._clase],
                  }}>{r._clase}</span>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length > 1000 && (
          <div style={{ padding: 10, textAlign: 'center', fontSize: 11, color: '#9ca3af', background: '#f9fafb' }}>
            Mostrando 1000 de {fmtNum(filtered.length)} resultados. Refiná los filtros para ver más.
          </div>
        )}
      </div>
    </div>
  );
}

const inputStyle = {
  padding: '7px 12px', borderRadius: 8, border: '1px solid rgba(94,39,51,0.2)',
  fontSize: 12, minWidth: 240, outline: 'none', background: 'white',
};
const selectStyle = { ...inputStyle, minWidth: 180, cursor: 'pointer' };
const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: 12 };

function Th({ children, align = 'left' }) {
  return <th style={{
    padding: '8px 10px', textAlign: align, fontSize: 11, fontWeight: 700,
    color: 'white', textTransform: 'uppercase', letterSpacing: 0.4, whiteSpace: 'nowrap',
  }}>{children}</th>;
}
function Td({ children, align = 'left', mono, bold, ...rest }) {
  return <td style={{
    padding: '6px 10px', textAlign: align,
    fontFamily: mono ? "'JetBrains Mono','Menlo',monospace" : undefined,
    fontWeight: bold ? 700 : 400,
    color: '#1f2937', whiteSpace: 'nowrap',
    ...rest.style,
  }} {...rest}>{children}</td>;
}
function ToggleBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding: '7px 16px', fontSize: 12, fontWeight: 700, border: 'none',
      background: active ? '#5E2733' : 'white', color: active ? 'white' : '#5E2733',
      cursor: 'pointer',
    }}>{children}</button>
  );
}
