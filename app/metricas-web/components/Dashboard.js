'use client';
import { useEffect, useState, useCallback } from 'react';
import { S, GOLD, GREEN, RED, BLUE, AMBER, fmtInt, fmtPct, fmtSecs, fmtUSD } from './styles';

async function ga4(metric_type, date_range, traffic_filter = 'external') {
  const params = new URLSearchParams({ metric_type, date_range, traffic_filter });
  const r = await fetch(`/api/metricas-web/ga4?${params}`);
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error || 'error GA4');
  // Adjuntamos el flag de fallback al objeto data para que la UI pueda avisar.
  return { ...j.data, _filter_fallback: j.filter_fallback };
}

function MetricCard({ label, value, pct, hint, color = GOLD }) {
  const positive = pct === undefined || pct >= 0;
  return (
    <div style={S.metric}>
      <div style={{ fontSize: '0.78rem', color: 'rgba(0,0,0,0.5)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: '1.7rem', fontWeight: 800, color: 'rgba(0,0,0,0.85)', marginTop: 6 }}>{value}</div>
      {pct !== undefined && (
        <div style={{ fontSize: '0.82rem', marginTop: 4, color: positive ? GREEN : RED, fontWeight: 600 }}>
          {positive ? '▲' : '▼'} {fmtPct(pct)} <span style={{ color: 'rgba(0,0,0,0.4)', fontWeight: 400 }}>vs período anterior</span>
        </div>
      )}
      {hint && <div style={{ fontSize: '0.75rem', color: 'rgba(0,0,0,0.4)', marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

function LiveSection({ dateRange }) {
  // GA4 Realtime API NO soporta filtro por dimensión custom traffic_type.
  // Por eso solo mostramos el total (interno + externo combinados).
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const d = await ga4('active_users_realtime', dateRange, 'all');
      setData(d);
    } catch (e) { setError(e.message); }
  }, [dateRange]);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => { if (!cancelled) refresh(); });
    const id = setInterval(() => { if (!cancelled) refresh(); }, 30000);
    return () => { cancelled = true; clearInterval(id); };
  }, [refresh]);

  return (
    <div style={S.card}>
      <div style={S.sectionTitle}>🟢 En vivo</div>
      <div style={S.sectionCap}>Auto-refresh cada 30 segundos · Total combinado (GA4 no permite separar interno/externo en tiempo real).</div>
      {error && <div style={{ background: 'rgba(192,64,64,0.1)', border: '1px solid rgba(192,64,64,0.3)', color: RED, padding: '10px 14px', borderRadius: 10, marginBottom: 12, fontSize: '0.85rem' }}>⚠️ {error}</div>}
      <div style={{ ...S.cardInner, background: 'rgba(46,125,79,0.06)', border: '1px solid rgba(46,125,79,0.25)' }}>
        <div style={{ fontSize: '0.85rem', color: GREEN, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Usuarios activos ahora</div>
        <div style={{ fontSize: '3.4rem', fontWeight: 900, color: GREEN, lineHeight: 1.1, marginTop: 4 }}>
          {data ? fmtInt(data.active_users) : '...'}
        </div>
        <div style={{ fontSize: '0.82rem', color: 'rgba(0,0,0,0.5)', marginTop: 4 }}>incluye visitantes externos (clientes) y miembros del equipo</div>
      </div>
      {data?.last_pages?.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: '0.78rem', color: 'rgba(0,0,0,0.5)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, marginBottom: 8 }}>Páginas más vistas en este momento</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {data.last_pages.map((p, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', padding: '6px 10px', background: 'rgba(255,255,255,0.5)', borderRadius: 8 }}>
                <span style={{ color: 'rgba(0,0,0,0.75)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title || '(sin título)'}</span>
                <span style={{ color: 'rgba(0,0,0,0.45)' }}>{fmtInt(p.views)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FallbackBanner({ data }) {
  if (!data?._filter_fallback) return null;
  return (
    <div style={{ background: 'rgba(255,193,7,0.12)', border: '1px solid rgba(255,193,7,0.4)', color: '#7a5d10', padding: '8px 12px', borderRadius: 10, fontSize: '0.78rem', marginBottom: 10 }}>
      ⏳ La dimensión de tráfico custom todavía está propagándose en GA4 (puede tardar hasta 24h). Mientras tanto, mostramos el total sin filtrar interno/externo.
    </div>
  );
}

function SummarySection({ dateRange }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    ga4('summary', dateRange)
      .then(d => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch(e => { if (!cancelled) { setError(e.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [dateRange]);

  return (
    <div style={S.card}>
      <div style={S.sectionTitle}>📊 Resumen del período</div>
      <div style={S.sectionCap}>Tráfico externo (excluye navegación interna del equipo).</div>
      {error && <div style={{ color: RED, fontSize: '0.85rem' }}>⚠️ {error}</div>}
      <FallbackBanner data={data} />
      {loading ? (
        <div style={{ color: 'rgba(0,0,0,0.5)', fontSize: '0.9rem' }}>⏳ Consultando GA4...</div>
      ) : data ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <MetricCard label="Sesiones" value={fmtInt(data.sessions.current)} pct={data.sessions.pct} />
          <MetricCard label="Usuarios" value={fmtInt(data.users.current)} pct={data.users.pct} />
          <MetricCard label="Vistas de página" value={fmtInt(data.pageviews.current)} pct={data.pageviews.pct} />
          <MetricCard label="Duración promedio" value={fmtSecs(data.avg_session_duration.current)} pct={data.avg_session_duration.pct} />
        </div>
      ) : null}
    </div>
  );
}

function TopProductsSection({ dateRange }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    ga4('top_products', dateRange).then(setData).catch(e => setError(e.message));
  }, [dateRange]);

  return (
    <div style={S.card}>
      <div style={S.sectionTitle}>🏆 Top productos</div>
      <div style={S.sectionCap}>Las 10 páginas de producto más vistas en el período.</div>
      {error && <div style={{ color: RED, fontSize: '0.85rem' }}>⚠️ {error}</div>}
      <FallbackBanner data={data} />
      {!data ? (
        <div style={{ color: 'rgba(0,0,0,0.5)', fontSize: '0.9rem' }}>⏳ Cargando...</div>
      ) : data.length === 0 ? (
        <div style={{ color: 'rgba(0,0,0,0.5)', fontSize: '0.9rem' }}>Sin datos para este período.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
            <thead>
              <tr style={{ background: 'rgba(0,0,0,0.04)' }}>
                <th style={th()}>#</th>
                <th style={th()}>Producto</th>
                <th style={{ ...th(), textAlign: 'right' }}>Vistas</th>
                <th style={{ ...th(), textAlign: 'right' }}>Sesiones</th>
                <th style={{ ...th(), textAlign: 'right' }}>Usuarios</th>
              </tr>
            </thead>
            <tbody>
              {data.slice(0, 10).map((p, i) => (
                <tr key={i} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                  <td style={td()}>{i + 1}</td>
                  <td style={td()}>
                    <a href={`https://depositojimenezcr.com${p.path}`} target="_blank" rel="noreferrer" style={{ color: 'rgba(0,0,0,0.8)', textDecoration: 'none' }}>
                      {p.product_name}
                    </a>
                  </td>
                  <td style={{ ...td(), textAlign: 'right', fontWeight: 700 }}>{fmtInt(p.views)}</td>
                  <td style={{ ...td(), textAlign: 'right' }}>{fmtInt(p.sessions)}</td>
                  <td style={{ ...td(), textAlign: 'right' }}>{fmtInt(p.users)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TrafficSourcesSection({ dateRange }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    ga4('traffic_sources', dateRange).then(setData).catch(e => setError(e.message));
  }, [dateRange]);

  const total = data ? data.reduce((s, x) => s + x.sessions, 0) : 0;
  const top10 = data ? data.slice(0, 10) : [];
  const colors = [GOLD, BLUE, GREEN, AMBER, '#9b87f5', '#e1306c', '#225F74', '#ED6E2E', '#5E2733', '#666'];

  return (
    <div style={S.card}>
      <div style={S.sectionTitle}>🌐 Fuentes de tráfico</div>
      <div style={S.sectionCap}>De dónde vienen tus visitantes externos.</div>
      {error && <div style={{ color: RED, fontSize: '0.85rem' }}>⚠️ {error}</div>}
      <FallbackBanner data={data} />
      {!data ? (
        <div style={{ color: 'rgba(0,0,0,0.5)', fontSize: '0.9rem' }}>⏳ Cargando...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem' }}>
              <thead>
                <tr style={{ background: 'rgba(0,0,0,0.04)' }}>
                  <th style={th()}>Fuente</th>
                  <th style={th()}>Medio</th>
                  <th style={{ ...th(), textAlign: 'right' }}>Sesiones</th>
                  <th style={{ ...th(), textAlign: 'right' }}>%</th>
                </tr>
              </thead>
              <tbody>
                {top10.map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                    <td style={td()}>
                      <span style={{ display: 'inline-block', width: 10, height: 10, background: colors[i % colors.length], borderRadius: 3, marginRight: 6 }} />
                      {r.source}
                    </td>
                    <td style={td()}>{r.medium}</td>
                    <td style={{ ...td(), textAlign: 'right', fontWeight: 700 }}>{fmtInt(r.sessions)}</td>
                    <td style={{ ...td(), textAlign: 'right', color: 'rgba(0,0,0,0.55)' }}>{total ? ((r.sessions / total) * 100).toFixed(1) : '0'}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <DonutChart data={top10.map((r, i) => ({ label: r.source, value: r.sessions, color: colors[i % colors.length] }))} total={total} />
        </div>
      )}
    </div>
  );
}

function DonutChart({ data, total }) {
  if (!data || data.length === 0 || total === 0) {
    return <div style={{ ...S.cardInner, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(0,0,0,0.4)' }}>Sin datos</div>;
  }
  const size = 200;
  const cx = size / 2, cy = size / 2, r = 80, strokeW = 30;
  const C = 2 * Math.PI * r;
  // Pre-computa los arcos sin reasignar variables — usa reduce.
  const arcs = data.reduce((acc, d) => {
    const len = (d.value / total) * C;
    return {
      list: [...acc.list, { color: d.color, dasharray: `${len} ${C - len}`, dashoffset: -acc.offset }],
      offset: acc.offset + len,
    };
  }, { list: [], offset: 0 }).list;
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
      <svg width={size} height={size}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth={strokeW} />
        {arcs.map((a, i) => (
          <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={a.color}
            strokeWidth={strokeW} strokeDasharray={a.dasharray} strokeDashoffset={a.dashoffset}
            transform={`rotate(-90 ${cx} ${cy})`} />
        ))}
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize="14" fill="rgba(0,0,0,0.5)">Total</text>
        <text x={cx} y={cy + 16} textAnchor="middle" fontSize="20" fontWeight="800" fill="rgba(0,0,0,0.85)">{fmtInt(total)}</text>
      </svg>
    </div>
  );
}

function ConversionsSection({ dateRange }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    ga4('conversions', dateRange).then(setData).catch(e => setError(e.message));
  }, [dateRange]);

  return (
    <div style={S.card}>
      <div style={S.sectionTitle}>🎯 Conversiones</div>
      <div style={S.sectionCap}>Eventos clave del embudo de compra.</div>
      {error && <div style={{ color: RED, fontSize: '0.85rem' }}>⚠️ {error}</div>}
      <FallbackBanner data={data} />
      {!data ? (
        <div style={{ color: 'rgba(0,0,0,0.5)', fontSize: '0.9rem' }}>⏳ Cargando...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <MetricCard label="🛒 Add to Cart" value={fmtInt(data.add_to_cart)} />
          <MetricCard label="🧾 Iniciaron checkout" value={fmtInt(data.begin_checkout)} />
          <MetricCard label="✅ Compras" value={fmtInt(data.purchase)} />
          <MetricCard label="💰 Revenue" value={fmtUSD(data.revenue)} />
        </div>
      )}
    </div>
  );
}

function CampaignsPerformanceSection({ dateRange }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    ga4('campaigns_performance', dateRange).then(setData).catch(e => setError(e.message));
  }, [dateRange]);

  return (
    <div style={S.card}>
      <div style={S.sectionTitle}>📣 Rendimiento de campañas (UTMs)</div>
      <div style={S.sectionCap}>Solo sesiones con utm_campaign definido.</div>
      {error && <div style={{ color: RED, fontSize: '0.85rem' }}>⚠️ {error}</div>}
      <FallbackBanner data={data} />
      {!data ? (
        <div style={{ color: 'rgba(0,0,0,0.5)', fontSize: '0.9rem' }}>⏳ Cargando...</div>
      ) : data.length === 0 ? (
        <div style={{ color: 'rgba(0,0,0,0.5)', fontSize: '0.9rem' }}>Aún no hay sesiones con UTM en este período. Empezá a usar el Generador de Links.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem' }}>
            <thead>
              <tr style={{ background: 'rgba(0,0,0,0.04)' }}>
                <th style={th()}>Campaña</th>
                <th style={th()}>Fuente</th>
                <th style={th()}>Medio</th>
                <th style={{ ...th(), textAlign: 'right' }}>Sesiones</th>
                <th style={{ ...th(), textAlign: 'right' }}>Usuarios</th>
                <th style={{ ...th(), textAlign: 'right' }}>Engaged</th>
                <th style={{ ...th(), textAlign: 'right' }}>Conv.</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r, i) => (
                <tr key={i} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                  <td style={{ ...td(), fontWeight: 600 }}>{r.campaign}</td>
                  <td style={td()}>{r.source}</td>
                  <td style={td()}>{r.medium}</td>
                  <td style={{ ...td(), textAlign: 'right', fontWeight: 700 }}>{fmtInt(r.sessions)}</td>
                  <td style={{ ...td(), textAlign: 'right' }}>{fmtInt(r.users)}</td>
                  <td style={{ ...td(), textAlign: 'right' }}>{fmtInt(r.engaged_sessions)}</td>
                  <td style={{ ...td(), textAlign: 'right', color: GREEN, fontWeight: 700 }}>{fmtInt(r.conversions)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function th() {
  return { textAlign: 'left', padding: '10px 12px', fontSize: '0.78rem', fontWeight: 600, color: 'rgba(0,0,0,0.55)', textTransform: 'uppercase', letterSpacing: '0.04em' };
}
function td() {
  return { padding: '10px 12px', color: 'rgba(0,0,0,0.78)' };
}

export default function Dashboard({ dateRange }) {
  return (
    <div>
      <LiveSection dateRange={dateRange} />
      <SummarySection dateRange={dateRange} />
      <TopProductsSection dateRange={dateRange} />
      <TrafficSourcesSection dateRange={dateRange} />
      <ConversionsSection dateRange={dateRange} />
      <CampaignsPerformanceSection dateRange={dateRange} />
    </div>
  );
}
