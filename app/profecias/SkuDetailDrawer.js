'use client';
import { useEffect, useState } from 'react';
import { fmtFecha, fmtMoney, fmtNum, MadurezBadge, SemaforoBadge, ConfianzaIndicator, COLORES } from './ui.js';
import ClasificacionDropdown from './ClasificacionDropdown.js';

function MiniChart({ datos }) {
  if (!datos?.length) return <div style={{ color: '#999', fontSize: 12, padding: 16 }}>Sin ventas en los últimos 24 meses.</div>;
  const W = 600, H = 180, P = 28;
  const max = Math.max(1, ...datos.map((d) => d.unidades));
  const bw = (W - P * 2) / Math.max(datos.length, 1);
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6 }}>
      {[0.25, 0.5, 0.75, 1].map((p) => (
        <line key={p} x1={P} x2={W - P} y1={H - P - p * (H - P * 2)} y2={H - P - p * (H - P * 2)} stroke="#edf2f7" />
      ))}
      {datos.map((d, i) => {
        const h = (d.unidades / max) * (H - P * 2);
        return (
          <g key={d.mes}>
            <rect
              x={P + i * bw + 2}
              y={H - P - h}
              width={Math.max(bw - 4, 1)}
              height={h}
              fill={COLORES.oro}
              opacity={0.85}
            >
              <title>{`${d.mes}: ${fmtNum(d.unidades, 0)} u · ${fmtMoney(d.monto)}`}</title>
            </rect>
            {i % 3 === 0 && (
              <text x={P + i * bw + bw / 2} y={H - 8} fontSize={9} textAnchor="middle" fill="#718096">{d.mes.slice(2)}</text>
            )}
          </g>
        );
      })}
      <text x={P} y={14} fontSize={11} fill="#1c1f26" fontWeight={600}>Unidades por mes (máx {fmtNum(max, 0)})</text>
    </svg>
  );
}

export default function SkuDetailDrawer({ codigo, onClose, onClasificacionChange }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (!codigo) return;
    setLoading(true);
    setErr(null);
    fetch(`/api/profecias/sku/${encodeURIComponent(codigo)}`)
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) throw new Error(j.error || 'Error');
        setData(j);
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [codigo]);

  if (!codigo) return null;

  const p = data?.panel;

  return (
    <>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200,
      }} />
      <aside style={{
        position: 'fixed', top: 0, right: 0, width: 'min(720px, 100vw)', height: '100vh',
        background: '#fff', boxShadow: '-8px 0 30px rgba(0,0,0,0.15)', zIndex: 201,
        display: 'flex', flexDirection: 'column',
      }}>
        <header style={{
          padding: '14px 18px', borderBottom: '1px solid #e2e8f0',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: '#1c1f26', color: '#fff',
        }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Detalle SKU</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#c8a84b' }}>{codigo}</div>
          </div>
          <button onClick={onClose} style={{
            border: 'none', background: 'transparent', color: '#fff',
            fontSize: 22, cursor: 'pointer',
          }}>×</button>
        </header>

        <div style={{ overflowY: 'auto', padding: 18, flex: 1 }}>
          {loading && <div>Cargando…</div>}
          {err && <div style={{ color: '#E53E3E' }}>{err}</div>}
          {p && (
            <>
              <h2 style={{ margin: '0 0 6px', fontSize: 16, color: '#1c1f26' }}>{p.item}</h2>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', fontSize: 12, color: '#4a5568', marginBottom: 14 }}>
                <span><strong>Proveedor:</strong> {p.ultimo_proveedor}</span>
                <span>·</span>
                <span><strong>Categoría:</strong> {p.categoria || '—'}</span>
                <span>·</span>
                <span><strong>Marca:</strong> {p.marca || '—'}</span>
                <MadurezBadge value={p.madurez} />
                <ConfianzaIndicator value={p.confianza} />
                <SemaforoBadge value={p.semaforo} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
                <Card titulo="Existencias" valor={fmtNum(p.existencias, 0)} />
                <Card titulo="Proyección/mes" valor={p.datos_insuficientes ? 'decisión 🔬' : fmtNum(p.demanda_proyectada, 1)} highlight />
                <Card titulo="Meses cobertura" valor={p.meses_cobertura == null ? '—' : `${fmtNum(p.meses_cobertura, 1)} m`} />
                <Card titulo="Lead time" valor={`${p.lead_time_dias} d`} />
                <Card titulo="Punto reorden" valor={fmtNum(p.punto_reorden, 0)} />
                <Card titulo="Cant. sugerida" valor={fmtNum(p.cantidad_sugerida, 0)} highlight />
                <Card titulo="Vendido 30d" valor={fmtNum(p.vendido_30d, 0)} />
                <Card titulo="Vendido 90d" valor={fmtNum(p.vendido_90d, 0)} />
                <Card titulo="Vendido 180d" valor={fmtNum(p.vendido_180d, 0)} />
                <Card titulo="Ritmo 30d" valor={p.velocidad_30d == null ? '—' : fmtNum(p.velocidad_30d, 1)} sub={p.tiene_outliers && p.velocidad_ajustada_30d != null ? `aj. ${fmtNum(p.velocidad_ajustada_30d, 1)}` : null} />
                <Card titulo="Ritmo 90d" valor={p.velocidad_90d == null ? '—' : fmtNum(p.velocidad_90d, 1)} sub={p.tiene_outliers && p.velocidad_ajustada_90d != null ? `aj. ${fmtNum(p.velocidad_ajustada_90d, 1)}` : null} />
                <Card titulo="Ritmo 180d" valor={p.velocidad_180d == null ? '—' : fmtNum(p.velocidad_180d, 1)} sub={p.tiene_outliers && p.velocidad_ajustada_180d != null ? `aj. ${fmtNum(p.velocidad_ajustada_180d, 1)}` : null} />
                <Card titulo="Días de vida" valor={p.dias_vida} />
                <Card titulo="Primera venta" valor={fmtFecha(p.primera_venta)} />
                <Card titulo="Última venta" valor={fmtFecha(p.ultima_venta)} />
              </div>

              {(p.datos_insuficientes || p.tiene_outliers) && (
                <div style={{
                  display: 'flex', gap: 16, marginBottom: 14, padding: '8px 12px',
                  background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 6,
                  fontSize: 12, color: '#92400E', flexWrap: 'wrap',
                }}>
                  {p.datos_insuficientes && <span>🔬 Datos insuficientes — proyección automática deshabilitada (menos de 7 días de vida).</span>}
                  {p.tiene_outliers && <span>📊 Hay facturas atípicas (mayoreo). Mediana por factura: {fmtNum(p.mediana_factura, 1)} u sobre {p.num_facturas} facturas. La proyección usa el ritmo ajustado (sin outliers).</span>}
                </div>
              )}

              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
                <span style={{ fontSize: 13, color: '#4a5568' }}><strong>Clasificación:</strong></span>
                <ClasificacionDropdown
                  codigo={codigo}
                  value={p.clasificacion_manual}
                  onChange={(v) => onClasificacionChange?.(codigo, v)}
                />
                {p.notas_estado && (
                  <span style={{ fontSize: 12, color: '#718096', fontStyle: 'italic' }}>“{p.notas_estado}”</span>
                )}
              </div>

              <h3 style={{ fontSize: 13, color: '#1c1f26', margin: '20px 0 8px' }}>Ventas mensuales (últimos 24 meses)</h3>
              <MiniChart datos={data.historico_mensual} />

              <h3 style={{ fontSize: 13, color: '#1c1f26', margin: '20px 0 8px' }}>Decisiones registradas</h3>
              {data.decisiones?.length ? (
                <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                  <thead style={{ background: '#f7fafc' }}>
                    <tr>
                      <th style={th}>Fecha</th>
                      <th style={th}>Madurez</th>
                      <th style={th}>Sugerida</th>
                      <th style={th}>Firmada</th>
                      <th style={th}>Inv. estimada</th>
                      <th style={th}>Resultado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.decisiones.map((d) => (
                      <tr key={d.id}>
                        <td style={td}>{fmtFecha(d.fecha_decision)}</td>
                        <td style={td}>{d.madurez_al_momento || '—'}</td>
                        <td style={td}>{fmtNum(d.cantidad_sugerida, 0)}</td>
                        <td style={td}>{fmtNum(d.cantidad_firmada, 0)}</td>
                        <td style={td}>{fmtMoney(d.inversion_estimada)}</td>
                        <td style={td}>{d.resultado || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <div style={{ color: '#718096', fontSize: 12 }}>Sin decisiones registradas.</div>}
            </>
          )}
        </div>
      </aside>
    </>
  );
}

const th = { textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #e2e8f0', fontSize: 11, color: '#4a5568' };
const td = { padding: '6px 8px', borderBottom: '1px solid #f0f2f5' };

function Card({ titulo, valor, sub, highlight }) {
  return (
    <div style={{
      padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 6,
      background: highlight ? 'rgba(200,168,75,0.12)' : '#fff',
    }}>
      <div style={{ fontSize: 10, color: '#718096', textTransform: 'uppercase', letterSpacing: 0.4 }}>{titulo}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: '#1c1f26' }}>{valor}</div>
      {sub && <div style={{ fontSize: 10, color: '#0369a1', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
