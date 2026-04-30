'use client';
import { useEffect, useState } from 'react';
import { S, GOLD, GREEN, RED, BLUE, TEAL, AMBER, fmtInt, fmtPct } from './styles';

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
  (matrix || []).forEach(c => {
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

// Banner de diagnóstico que explica por qué no hay datos cuando los hay en el
// sitio público pero ninguno marcado como interno. Cubre 3 casos:
//   A) GA4 no ve NADA del sitio (raro: GA4_PROPERTY_ID mal o el sitio no manda).
//   B) GA4 ve sesiones del sitio pero 0 internas → Nidux no manda traffic_type.
//   C) Hay sesiones internas pero nadie tocó /products/ → equipo no abrió fichas.
function DiagnosticBanner({ summary }) {
  if (!summary) return null;
  const internal = Number(summary.total_searches) || 0;
  const publicTotal = Number(summary.public_total_sessions) || 0;
  const publicProducts = Number(summary.public_product_sessions) || 0;
  const productsConsulted = Number(summary.unique_products) || 0;
  const internalPct = Number(summary.internal_pct) || 0;
  // Si el caché es de antes del deploy de hoy, no tiene los campos de diagnóstico.
  // En ese caso no mostramos banner — esperamos a que se refresque el caché.
  const hasDiagnosticData = summary.public_total_sessions !== undefined;
  if (!hasDiagnosticData) return null;

  // Caso A: GA4 no detecta ni el sitio público.
  if (publicTotal === 0 && internal === 0) {
    return (
      <div style={{ ...S.card, background: 'rgba(192,64,64,0.08)', border: '1px solid rgba(192,64,64,0.3)' }}>
        <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#7a1d1d', marginBottom: 6 }}>🚨 GA4 no detecta tráfico del sitio público</div>
        <div style={{ fontSize: '0.85rem', color: '#7a1d1d', lineHeight: 1.5 }}>
          GA4 no está recibiendo eventos desde <strong>depositojimenezcr.com</strong> en este período.
          Esto puede ser: GA4_PROPERTY_ID mal configurado, o que el tag G-237EPSVR3Z no esté activo en Nidux.
          Verificar en GA4 → Realtime cuando alguien abra el sitio.
        </div>
      </div>
    );
  }

  // Caso B: hay tráfico público pero 0 internas → snippet de Nidux no funciona.
  if (publicTotal > 0 && internal === 0) {
    return (
      <div style={{ ...S.card, background: 'rgba(192,64,64,0.08)', border: '1px solid rgba(192,64,64,0.3)' }}>
        <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#7a1d1d', marginBottom: 6 }}>
          🚨 GA4 ve {fmtInt(publicTotal)} sesiones del sitio pero 0 marcadas como internas
        </div>
        <div style={{ fontSize: '0.85rem', color: '#7a1d1d', lineHeight: 1.5 }}>
          Nidux no está mandando el flag <code style={{ background: 'rgba(0,0,0,0.06)', padding: '0 4px', borderRadius: 3 }}>traffic_type=internal</code>.
          Las consultas del equipo se están contando como tráfico orgánico de clientes (eso te ensucia los datos).
          <div style={{ marginTop: 8, padding: 10, background: 'rgba(255,255,255,0.5)', borderRadius: 8 }}>
            <strong>Para arreglarlo:</strong> ir a la tab <strong>Configuración</strong> de este módulo → copiar el snippet
            actualizado de Nidux → pegarlo en el panel admin de Nidux <strong>antes</strong> del tag de GA4 → guardar.
            Después un empleado tiene que volver a abrir <a href="/marcar-interno" target="_blank" rel="noreferrer" style={{ color: '#0066cc' }}>/marcar-interno</a> para
            re-aplicar el flag.
          </div>
        </div>
      </div>
    );
  }

  // Caso C: hay internas pero nadie tocó productos.
  if (internal > 0 && productsConsulted === 0 && publicProducts > 0) {
    return (
      <div style={{ ...S.card, background: 'rgba(255,193,7,0.08)', border: '1px solid rgba(255,193,7,0.4)' }}>
        <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#7a5d10', marginBottom: 6 }}>
          ⚠️ {fmtInt(internal)} sesiones internas — pero ninguna abrió ficha de producto
        </div>
        <div style={{ fontSize: '0.85rem', color: '#7a5d10', lineHeight: 1.5 }}>
          El equipo entró al sitio pero solo navegó la home/categorías. Para que aparezcan acá los productos
          consultados, el empleado tiene que abrir <strong>la URL específica del producto</strong>{' '}
          (ej: <code style={{ background: 'rgba(0,0,0,0.06)', padding: '0 4px', borderRadius: 3 }}>depositojimenezcr.com/products/5410/...</code>).
          En cambio el sitio público sí recibió {fmtInt(publicProducts)} sesiones de clientes en fichas de producto.
        </div>
      </div>
    );
  }

  // Caso especial: nada en absoluto (raro porque ya cubierto arriba).
  if (internal === 0) {
    return (
      <div style={{ ...S.card, background: 'rgba(255,193,7,0.08)', border: '1px solid rgba(255,193,7,0.4)' }}>
        <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#7a5d10', marginBottom: 6 }}>⚠️ Aún no hay actividad interna</div>
        <div style={{ fontSize: '0.85rem', color: '#7a5d10', lineHeight: 1.5 }}>
          Cada empleado tiene que abrir <a href="/marcar-interno" target="_blank" rel="noreferrer" style={{ color: '#0066cc', textDecoration: 'underline' }}>sol.depositojimenez.com/marcar-interno</a> una
          vez por navegador, y después navegar <strong>depositojimenezcr.com</strong> para que la actividad quede registrada acá.
        </div>
      </div>
    );
  }

  // Todo bien: pequeño badge con el porcentaje interno detectado.
  return (
    <div style={{ ...S.card, background: 'rgba(46,125,79,0.06)', border: '1px solid rgba(46,125,79,0.25)', padding: '10px 14px' }}>
      <div style={{ fontSize: '0.85rem', color: '#1f5e3a', lineHeight: 1.5 }}>
        ✓ Configuración OK — <strong>{internalPct.toFixed(1)}%</strong> del tráfico del sitio se detecta
        como equipo interno ({fmtInt(internal)} de {fmtInt(publicTotal)} sesiones).
      </div>
    </div>
  );
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

      {data && <DiagnosticBanner summary={data.summary} />}

      {data ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
            <MetricCard label="Consultas al sitio" value={fmtInt(data.summary?.total_searches)} sub="sesiones internas en sitio público" />
            <MetricCard label="Productos únicos" value={fmtInt(data.summary?.unique_products)} sub="distintos consultados" color={GOLD} />
            <MetricCard label="Promedio por día" value={(Number(data.summary?.avg_per_day) || 0).toFixed(1)} sub="consultas internas/día" color={BLUE} />
            <MetricCard label="Hora pico" value={data.summary?.peak_hour != null ? `${data.summary.peak_hour}:00` : '—'} sub="del día con más actividad" color={GREEN} />
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
            {(data.top_products || []).length === 0 ? (
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
                    {(data.top_products || []).map((p, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                        <td style={td()}>{i + 1}</td>
                        <td style={td()}>
                          <a href={`https://depositojimenezcr.com${p.path}`} target="_blank" rel="noreferrer" style={{ color: 'rgba(0,0,0,0.85)', textDecoration: 'none', fontWeight: 500 }}>
                            {p.product_name}
                          </a>
                        </td>
                        <td style={{ ...td(), textAlign: 'right', fontWeight: 700 }}>{fmtInt(p.views)}</td>
                        <td style={{ ...td(), textAlign: 'right', color: 'rgba(0,0,0,0.55)' }}>{(Number(p.pct_total) || 0).toFixed(1)}%</td>
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

          <OpportunitiesSection dateRange={dateRange} />
        </>
      ) : !error && (
        <div style={S.card}><div style={{ color: 'rgba(0,0,0,0.5)', fontSize: '0.9rem' }}>⏳ Consultando GA4...</div></div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Sección "Demanda WhatsApp NO convertida":
// Cruza GA4 (consultas internas del equipo) con NEO (ventas reales).
// Muestra productos consultados muchas veces pero vendidos poco/nada.
// ──────────────────────────────────────────────────────────────────────────
function OpportunitiesSection({ dateRange }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [onlyZeroSales, setOnlyZeroSales] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/metricas-web/whatsapp-opportunities?date_range=${dateRange}`)
      .then(r => r.json())
      .then(j => {
        if (cancelled) return;
        if (j?.error) { setError(j.error); setData(null); }
        else { setData(j); setError(null); }
        setLoading(false);
      })
      .catch(e => { if (!cancelled) { setError(e.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [dateRange]);

  if (loading) {
    return (
      <div style={S.card}>
        <div style={S.sectionTitle}>💡 Demanda WhatsApp NO convertida</div>
        <div style={S.sectionCap}>Cruzando consultas del equipo (GA4) con ventas reales (NEO)...</div>
        <div style={{ color: 'rgba(0,0,0,0.5)', fontSize: '0.9rem' }}>⏳ Cargando...</div>
      </div>
    );
  }
  if (error) {
    return (
      <div style={S.card}>
        <div style={S.sectionTitle}>💡 Demanda WhatsApp NO convertida</div>
        <div style={{ color: RED, fontSize: '0.85rem' }}>⚠️ {error}</div>
      </div>
    );
  }
  if (data?.filter_fallback || (data?.data?.length || 0) === 0) {
    return (
      <div style={S.card}>
        <div style={S.sectionTitle}>💡 Demanda WhatsApp NO convertida</div>
        <div style={{ background: 'rgba(255,193,7,0.12)', border: '1px solid rgba(255,193,7,0.4)', color: '#7a5d10', padding: '10px 14px', borderRadius: 10, fontSize: '0.85rem' }}>
          {data?.filter_fallback
            ? '⏳ La dimensión traffic_type todavía está propagándose en GA4. Esta sección va a empezar a tener datos en cuanto Google la reconozca (hasta 24h post-registro) y el equipo navegue el sitio.'
            : 'Sin actividad interna registrada en este período. Cuando los empleados marquen sus dispositivos como internos y empiecen a consultar productos, aparecen acá.'}
        </div>
      </div>
    );
  }

  const rows = data.data.filter(r => onlyZeroSales ? r.units_sold === 0 : true);
  const top10 = rows.slice(0, 30);

  return (
    <div style={S.card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={S.sectionTitle}>💡 Demanda WhatsApp NO convertida</div>
          <div style={S.sectionCap}>
            Productos que el equipo consulta mucho pero se venden poco. Top {top10.length} ordenados por <strong>oportunidad</strong> (consultas / ventas).
          </div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', color: 'rgba(0,0,0,0.6)', cursor: 'pointer' }}>
          <input type="checkbox" checked={onlyZeroSales} onChange={e => setOnlyZeroSales(e.target.checked)} />
          Solo productos con 0 ventas
        </label>
      </div>

      <div style={{ overflowX: 'auto', marginTop: 12 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem' }}>
          <thead>
            <tr style={{ background: 'rgba(0,0,0,0.04)' }}>
              <th style={th()}>#</th>
              <th style={th()}>Producto</th>
              <th style={th()}>Marca</th>
              <th style={{ ...th(), textAlign: 'right' }}>Consultas</th>
              <th style={{ ...th(), textAlign: 'right' }}>Vendidos</th>
              <th style={{ ...th(), textAlign: 'right' }}>Stock</th>
              <th style={{ ...th(), textAlign: 'right' }}>Score</th>
            </tr>
          </thead>
          <tbody>
            {top10.map((r, i) => {
              const isHotOpp = r.opportunity_score >= 5 && r.consultas >= 5;
              const noStock = r.existencias <= 0;
              const noSales = r.units_sold === 0;
              return (
                <tr key={i} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)', background: isHotOpp ? 'rgba(255,193,7,0.06)' : 'transparent' }}>
                  <td style={td()}>{i + 1}</td>
                  <td style={td()}>
                    <a href={`https://depositojimenezcr.com${r.ga4_path}`} target="_blank" rel="noreferrer" style={{ color: 'rgba(0,0,0,0.85)', textDecoration: 'none', fontWeight: 500 }}>
                      {r.product_name}
                    </a>
                    <div style={{ fontSize: '0.72rem', color: 'rgba(0,0,0,0.4)', marginTop: 2 }}>
                      cód: {r.codigo_interno}{r.categoria ? ` · ${r.categoria}` : ''}
                    </div>
                  </td>
                  <td style={td()}>{r.marca || <span style={{ color: 'rgba(0,0,0,0.4)' }}>—</span>}</td>
                  <td style={{ ...td(), textAlign: 'right', fontWeight: 700 }}>{fmtInt(r.consultas)}</td>
                  <td style={{ ...td(), textAlign: 'right', fontWeight: 700, color: noSales ? RED : GREEN }}>
                    {fmtInt(r.units_sold)}
                  </td>
                  <td style={{ ...td(), textAlign: 'right', color: noStock ? RED : 'rgba(0,0,0,0.7)', fontWeight: noStock ? 700 : 400 }}>
                    {fmtInt(r.existencias)}{noStock && r.consultas > 0 ? ' ⚠️' : ''}
                  </td>
                  <td style={{ ...td(), textAlign: 'right', fontWeight: 800, color: isHotOpp ? AMBER : 'rgba(0,0,0,0.6)' }}>
                    {r.opportunity_score.toFixed(1)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 12, fontSize: '0.78rem', color: 'rgba(0,0,0,0.5)', lineHeight: 1.5 }}>
        💡 <strong>Cómo leer:</strong> filas amarillas son oportunidades calientes (5+ consultas, score alto).
        Stock con ⚠️ = consultado pero sin existencias. Score = consultas ÷ (ventas + 1) — cuanto más alto, peor convierte.
      </div>
    </div>
  );
}
