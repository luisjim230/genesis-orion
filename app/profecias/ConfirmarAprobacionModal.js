'use client';
import { useMemo, useState } from 'react';
import { fmtMoney, fmtNum } from './ui.js';

export default function ConfirmarAprobacionModal({ items, onClose, onConfirmar, aprobando }) {
  const [notas, setNotas] = useState('');

  const resumen = useMemo(() => {
    const provs = new Map();
    let inv = 0;
    for (const it of items) {
      const k = it.proveedor || 'SIN PROVEEDOR';
      if (!provs.has(k)) provs.set(k, { proveedor: k, num: 0, inv: 0 });
      const cur = provs.get(k);
      cur.num += 1;
      const sub = (Number(it.cantidad_aprobada) || 0) * (Number(it.costo_unitario_estimado) || 0);
      cur.inv += sub;
      inv += sub;
    }
    return {
      n_items: items.length,
      n_prov: provs.size,
      inv_total: inv,
      por_prov: [...provs.values()].sort((a, b) => b.inv - a.inv),
    };
  }, [items]);

  return (
    <>
      <div onClick={!aprobando ? onClose : undefined} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 300,
      }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: 'min(560px, 95vw)', maxHeight: '90vh', background: '#fff',
        borderRadius: 10, boxShadow: '0 20px 60px rgba(0,0,0,0.25)', zIndex: 301,
        display: 'flex', flexDirection: 'column',
      }}>
        <header style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0', background: '#1c1f26', color: '#fff', borderRadius: '10px 10px 0 0' }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>
            Confirmar aprobación de <span style={{ color: '#c8a84b' }}>{resumen.n_items}</span> SKUs
          </div>
        </header>

        <div style={{ padding: 18, overflowY: 'auto', flex: 1 }}>
          <p style={{ margin: '0 0 14px', fontSize: 13, color: '#1c1f26' }}>
            Vas a aprobar la compra de los siguientes SKUs.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>
            <Stat label="SKUs" valor={resumen.n_items} />
            <Stat label="Proveedores" valor={resumen.n_prov} />
            <Stat label="Inversión est." valor={fmtMoney(resumen.inv_total)} highlight />
          </div>

          {resumen.por_prov.length > 1 && (
            <>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#4a5568', marginBottom: 6 }}>Detalle por proveedor:</div>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 6, marginBottom: 14, maxHeight: 180, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <tbody>
                    {resumen.por_prov.map((p) => (
                      <tr key={p.proveedor} style={{ borderBottom: '1px solid #f0f2f5' }}>
                        <td style={{ padding: '6px 10px' }}>{p.proveedor}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'right', color: '#718096' }}>{p.num} SKUs</td>
                        <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 600 }}>{fmtMoney(p.inv)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#4a5568', marginBottom: 4 }}>
            Notas opcionales:
          </label>
          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Contexto, criterio aplicado, etc."
            rows={3}
            style={{
              width: '100%', padding: '8px 10px', border: '1px solid #cbd5e0', borderRadius: 6,
              fontSize: 13, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box',
            }}
          />

          <div style={{
            background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 6,
            padding: '10px 12px', marginTop: 14, fontSize: 12, color: '#92400E',
          }}>
            ⚠️ Esto NO genera órdenes todavía. Los SKUs se moverán a <strong>Plan por Proveedor</strong> donde podés revisarlos y generar las órdenes finales.
          </div>
        </div>

        <footer style={{ padding: '12px 18px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} disabled={aprobando} style={btnSec}>Cancelar</button>
          <button onClick={() => onConfirmar({ notas: notas || null })} disabled={aprobando} style={btnPri}>
            {aprobando ? 'Aprobando…' : 'Confirmar aprobación'}
          </button>
        </footer>
      </div>
    </>
  );
}

function Stat({ label, valor, highlight }) {
  return (
    <div style={{
      padding: '8px 10px', borderRadius: 6,
      background: highlight ? 'rgba(200,168,75,0.15)' : '#f7fafc', border: '1px solid #e2e8f0',
    }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#718096', letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: '#1c1f26' }}>{valor}</div>
    </div>
  );
}

const btnPri = { padding: '8px 16px', borderRadius: 6, border: 'none', background: '#c8a84b', color: '#1c1f26', fontWeight: 700, cursor: 'pointer', fontSize: 13 };
const btnSec = { padding: '8px 16px', borderRadius: 6, border: '1px solid #cbd5e0', background: '#fff', cursor: 'pointer', fontSize: 13 };
