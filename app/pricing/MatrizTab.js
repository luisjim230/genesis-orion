'use client';
import { useMemo, useState } from 'react';
import { fmtCRC, fmtNum, fmtPct, RECOMENDACIONES } from '../../lib/pricing';

export default function MatrizTab({ rows }) {
  const [cuadranteSel, setCuadranteSel] = useState(null);

  const matriz = useMemo(() => {
    const m = {};
    ['A','B','C'].forEach(c => {
      ['Alto','Medio','Bajo'].forEach(b => {
        m[`${c}-${b}`] = { count: 0, venta: 0, util: 0, skus: [] };
      });
    });
    rows.forEach(r => {
      const k = `${r._clase}-${r._banda}`;
      const cell = m[k];
      cell.count += 1;
      cell.venta += Number(r.venta_neta || 0);
      cell.util += Number(r.utilidad_neta || 0);
      cell.skus.push(r);
    });
    return m;
  }, [rows]);

  const cuadranteData = cuadranteSel ? matriz[cuadranteSel] : null;
  const skusOrdenados = cuadranteData
    ? [...cuadranteData.skus].sort((a, b) => Number(b.venta_neta || 0) - Number(a.venta_neta || 0))
    : [];

  return (
    <div>
      <div style={{ marginBottom: 12, fontSize: 13, color: '#374151' }}>
        Cruzá <b>rotación (clase A/B/C según volumen de ventas)</b> contra <b>banda de margen</b> (Alto ≥45%, Medio 30-45%, Bajo &lt;30%).
        Hacé clic en un cuadrante para ver los SKUs.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '60px repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
        <div></div>
        <HeaderCell>Margen Alto</HeaderCell>
        <HeaderCell>Margen Medio</HeaderCell>
        <HeaderCell>Margen Bajo</HeaderCell>
        {['A','B','C'].map(c => (
          <Row key={c} clase={c} matriz={matriz} onSelect={setCuadranteSel} sel={cuadranteSel} />
        ))}
      </div>

      {cuadranteData && (
        <div style={{
          background: 'white', borderRadius: 12, border: '2px solid ' + (RECOMENDACIONES[cuadranteSel]?.color || '#5E2733'),
          padding: 16, marginTop: 14,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>Cuadrante</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#5E2733' }}>
                {RECOMENDACIONES[cuadranteSel]?.emoji} {cuadranteSel}
              </div>
              <div style={{ fontSize: 13, color: RECOMENDACIONES[cuadranteSel]?.color, fontWeight: 600, marginTop: 4 }}>
                {RECOMENDACIONES[cuadranteSel]?.text}
              </div>
            </div>
            <button onClick={() => setCuadranteSel(null)} style={{
              padding: '4px 10px', borderRadius: 8, border: '1px solid #d1d5db',
              background: 'white', cursor: 'pointer', fontSize: 11,
            }}>Cerrar</button>
          </div>
          <div style={{ display: 'flex', gap: 16, fontSize: 12, marginBottom: 10, color: '#6b7280' }}>
            <span><b>{fmtNum(cuadranteData.count)}</b> SKUs</span>
            <span>Venta total: <b style={{ color: '#1f2937' }}>{fmtCRC(cuadranteData.venta)}</b></span>
            <span>Utilidad total: <b style={{ color: '#1f2937' }}>{fmtCRC(cuadranteData.util)}</b></span>
          </div>
          <div style={{ overflow: 'auto', maxHeight: 380, border: '1px solid #e5e7eb', borderRadius: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead style={{ position: 'sticky', top: 0, background: '#f3f4f6' }}>
                <tr>
                  <th style={th}>SKU</th><th style={th}>Nombre</th><th style={th}>Categoría</th>
                  <th style={{ ...th, textAlign: 'right' }}>Unidades</th>
                  <th style={{ ...th, textAlign: 'right' }}>Venta</th>
                  <th style={{ ...th, textAlign: 'right' }}>Utilidad</th>
                  <th style={{ ...th, textAlign: 'right' }}>Margen</th>
                </tr>
              </thead>
              <tbody>
                {skusOrdenados.slice(0, 200).map(r => (
                  <tr key={r.codigo_interno} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ ...td, fontFamily: 'monospace' }}>{r.codigo_interno}</td>
                    <td style={td} title={r.nombre}>{(r.nombre || '').slice(0, 50)}</td>
                    <td style={{ ...td, color: '#6b7280', fontSize: 11 }}>{r.categoria}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{fmtNum(r.qty_neta, 0)}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{fmtCRC(r.venta_neta)}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{fmtCRC(r.utilidad_neta)}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{fmtPct(r.margen_pct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {skusOrdenados.length > 200 && (
              <div style={{ padding: 8, textAlign: 'center', fontSize: 11, color: '#9ca3af', background: '#f9fafb' }}>
                Mostrando 200 de {fmtNum(skusOrdenados.length)} SKUs
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function HeaderCell({ children }) {
  return <div style={{
    padding: '10px 12px', textAlign: 'center', fontWeight: 700, fontSize: 12,
    color: '#5E2733', background: 'rgba(94,39,51,0.06)', borderRadius: 8,
  }}>{children}</div>;
}
function Row({ clase, matriz, onSelect, sel }) {
  return (
    <>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#5E2733', fontSize: 14,
        background: 'rgba(94,39,51,0.06)', borderRadius: 8,
      }}>{clase}</div>
      {['Alto','Medio','Bajo'].map(b => {
        const k = `${clase}-${b}`;
        const c = matriz[k];
        const rec = RECOMENDACIONES[k];
        const isSel = sel === k;
        return (
          <button
            key={k}
            onClick={() => onSelect(isSel ? null : k)}
            style={{
              padding: 12, borderRadius: 10,
              border: '2px solid ' + (isSel ? rec.color : 'transparent'),
              background: rec.color + '15',
              cursor: 'pointer', textAlign: 'left',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
          >
            <div style={{ fontSize: 18, marginBottom: 4 }}>{rec.emoji}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: rec.color, marginBottom: 2 }}>{k}</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#1f2937' }}>{fmtNum(c.count)} SKUs</div>
            <div style={{ fontSize: 11, color: '#374151', marginTop: 2 }}>{fmtCRC(c.venta)}</div>
            <div style={{ fontSize: 10, color: '#6b7280', marginTop: 4, lineHeight: 1.3, height: 26, overflow: 'hidden' }}>{rec.text}</div>
          </button>
        );
      })}
    </>
  );
}
const th = { padding: '8px 10px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.3, whiteSpace: 'nowrap' };
const td = { padding: '6px 10px', color: '#1f2937', whiteSpace: 'nowrap' };
