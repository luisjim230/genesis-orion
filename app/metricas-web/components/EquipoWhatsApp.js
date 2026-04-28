'use client';
import { useEffect, useState } from 'react';
import { S, GOLD, GREEN, RED, BLUE, TEAL, fmtInt, fmtPct } from './styles';

const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

async function ga4(metric_type, date_range, traffic_filter = 'internal') {
  const params = new URLSearchParams({ metric_type, date_range, traffic_filter });
  const r = await fetch(`/api/metricas-web/ga4?${params}`);
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error || 'error GA4');
  return j.data;
}

function Heatmap({ matrix }) {
  // matrix: array de { day_of_week (0=dom), hour (0-23), sessions }
  const grid = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  let max = 0;
  matrix.forEach(c => {
    if (c.day_of_week >= 0 && c.day_of_week < 7 && c.hour >= 0 && c.hour < 24) {
      grid[c.day_of_week][c.hour] = c.sessions;
      if (c.sessions > max) max = c.sessions;
    }
  });
  const cell = (v) => {
    const t = max ? v / max : 0;
    const a = 0.05 + t * 0.85;
    return `rgba(34, 95, 116, ${a})`;
  };
  return (
    <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
      <table style={{ borderCollapse: 'separate', borderSpacing: 2, fontSize: '0.7rem' }}>
        <thead>
          <tr>
            <th style={{ width: 36 }} />
            {Array.from({ length: 24 }, (_, h) => (
              <th key={h} style={{ width: 22, color: 'rgba(0,0,0,0.4)', fontWeight: 500 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.map((row, d) => (
            <tr key={d}>
              <td style={{ color: 'rgba(0,0,0,0.55)', fontWeight: 600, paddingRight: 6, textAlign: 'right' }}>{DAYS[d]}</td>
              {row.map((v, h) => (
                <td key={h} title={`${DAYS[d]} ${h}:00 — ${v} sesiones`}
                  style={{ width: 22, height: 22, background: cell(v), borderRadius: 4, color: t => v > max * 0.5 ? '#fff' : 'rgba(0,0,0,0.6)', textAlign: 'center', fontWeight: 600 }}>
                  {v > 0 ? v : ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: 8, fontSize: '0.72rem', color: 'rgba(0,0,0,0.45)' }}>
        Más oscuro = más actividad del equipo. Cifras = sesiones internas en esa hora.
      </div>
    </div>
  );
}

function MetricCard({ label, value, sub, color = TEAL }) {
  return (
    <div style={{ ...S.metric, borderLeft: `4px solid ${color}` }}>
      <div style={{ fontSize: '0.78rem', color: 'rgba(0,0,0,0.5)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: '1.7rem', fontWeight: 800, color: 'rgba(0,0,0,0.85)', marginTop: 6 }}>{value}</div>
      {sub && <div style={{ fontSize: '0.78rem', color: 'rgba(0,0,0,0.45)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function th() { return { textAlign: 'left', padding: '10px 12px', fontSize: '0.78rem', fontWeight: 600, color: 'rgba(0,0,0,0.55)', textTransform: 'uppercase', letterSpacing: '0.04em' }; }
function td() { return { padding: '10px 12px', color: 'rgba(0,0,0,0.78)' }; }

function trendBadge(t) {
  if (t === 'up')   return <span style={{ color: GREEN, fontWeight: 700 }}>▲ sube</span>;
  if (t === 'down') return <span style={{ color: RED, fontWeight: 700 }}>▼ baja</span>;
  return <span style={{ color: 'rgba(0,0,0,0.4)' }}>→ estable</span>;
}

export default function EquipoWhatsApp({ dateRange }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [filterUnsold, setFilterUnsold] = useState(false);

  useEffect(() => {
    let cancelled = false;
    ga4('internal_team_activity', dateRange, 'internal')
      .then(d => { if (!cancelled) { setData(d); setError(null); } })
      .catch(e => { if (!cancelled) { setError(e.message); setData(null); } });
    return () => { cancelled = true; };
  }, [dateRange]);

  return (
    <div>
      <div style={{ ...S.card, background: 'rgba(61,142,248,0.08)', border: '1px solid rgba(61,142,248,0.25)' }}>
        <div style={{ fontSize: '1rem', fontWeight: 600, color: '#1a4d8f', marginBottom: 6 }}>📱 Lectura de demanda WhatsApp</div>
        <div style={{ fontSize: '0.88rem', color: '#1a4d8f', lineHeight: 1.5 }}>
          Esta sección muestra los productos que tu equipo consulta en el sitio para responder a clientes por WhatsApp.
          Te ayuda a identificar qué pregunta más el mercado, sobre todo lo que se consulta mucho pero se vende poco.
        </div>
      </div>

      {error && <div style={{ ...S.card, color: RED }}>⚠️ {error}</div>}

      {data ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
            <MetricCard label="Búsquedas del equipo" value={fmtInt(data.summary.total_searches)} sub="sesiones internas en el período" />
            <MetricCard label="Productos únicos" value={fmtInt(data.summary.unique_products)} sub="distintos consultados" color={GOLD} />
            <MetricCard label="Promedio por día" value={data.summary.avg_per_day.toFixed(1)} sub="búsquedas internas" color={BLUE} />
            <MetricCard label="Hora pico" value={data.summary.peak_hour !== null ? `${data.summary.peak_hour}:00` : '—'} sub="del día con más actividad" color={GREEN} />
          </div>

          <div style={S.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <div style={S.sectionTitle}>🔎 Top 30 productos consultados por el equipo</div>
                <div style={S.sectionCap}>Ordenados por veces consultados. Cruzá con NEO para detectar consultas no convertidas.</div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', color: 'rgba(0,0,0,0.6)', cursor: 'pointer' }}>
                <input type="checkbox" checked={filterUnsold} onChange={e => setFilterUnsold(e.target.checked)} />
                Mostrar solo no convertidos (próximamente)
              </label>
            </div>
            {data.top_products.length === 0 ? (
              <div style={{ color: 'rgba(0,0,0,0.5)', fontSize: '0.9rem', marginTop: 12 }}>
                Sin actividad interna registrada todavía. Cuando los empleados marquen sus dispositivos como internos y naveguen el sitio, aparecerá acá.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                  <thead>
                    <tr style={{ background: 'rgba(0,0,0,0.04)' }}>
                      <th style={th()}>#</th>
                      <th style={th()}>Producto</th>
                      <th style={{ ...th(), textAlign: 'right' }}>Consultas</th>
                      <th style={{ ...th(), textAlign: 'right' }}>% del total</th>
                      <th style={{ ...th(), textAlign: 'right' }}>Tendencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.top_products.map((p, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                        <td style={td()}>{i + 1}</td>
                        <td style={td()}>
                          <a href={`https://depositojimenezcr.com${p.path}`} target="_blank" rel="noreferrer" style={{ color: 'rgba(0,0,0,0.85)', textDecoration: 'none', fontWeight: 500 }}>
                            {p.product_name}
                          </a>
                        </td>
                        <td style={{ ...td(), textAlign: 'right', fontWeight: 700 }}>{fmtInt(p.views)}</td>
                        <td style={{ ...td(), textAlign: 'right', color: 'rgba(0,0,0,0.55)' }}>{p.pct_total.toFixed(1)}%</td>
                        <td style={{ ...td(), textAlign: 'right' }}>{trendBadge(p.trend)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div style={S.card}>
            <div style={S.sectionTitle}>🗓️ Mapa de calor: ¿cuándo consulta el equipo?</div>
            <div style={S.sectionCap}>Útil para staffing y para saber en qué momentos se concentra la demanda WhatsApp.</div>
            <Heatmap matrix={data.heatmap} />
          </div>
        </>
      ) : !error && (
        <div style={S.card}><div style={{ color: 'rgba(0,0,0,0.5)', fontSize: '0.9rem' }}>⏳ Consultando GA4...</div></div>
      )}
    </div>
  );
}
