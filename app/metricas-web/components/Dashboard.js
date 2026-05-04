'use client';
import { useEffect, useState, useCallback } from 'react';
import { S, GOLD, GREEN, RED, BLUE, AMBER, fmtInt, fmtPct, fmtSecs, fmtCRC } from './styles';

async function ga4(metric_type, date_range, traffic_filter = 'external') {
  const params = new URLSearchParams({ metric_type, date_range, traffic_filter });
  const r = await fetch(`/api/metricas-web/ga4?${params}`);
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error || 'error GA4');
  // Adjuntamos el flag SIN spread (que rompía arrays).
  // Para arrays funciona porque podés colgar propiedades sin afectar .map().
  if (j.data && typeof j.data === 'object') {
    j.data._filter_fallback = !!j.filter_fallback;
  }
  return j.data;
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

// Embudo visual del flujo Carrito → Checkout → Compra. Cada barra muestra
// volumen absoluto + % respecto al paso anterior (drop-off por etapa).
function ConversionFunnel({ data }) {
  const steps = [
    { key: 'add_to_cart',     label: '🛒 Agregaron al carrito', color: BLUE,   value: data.add_to_cart },
    { key: 'begin_checkout',  label: '🧾 Iniciaron checkout',   color: AMBER,  value: data.begin_checkout },
    { key: 'purchase',        label: '✅ Compraron',             color: GREEN,  value: data.purchase },
  ];
  const max = Math.max(...steps.map(s => s.value || 0), 1);
  return (
    <div style={{ marginTop: 18, padding: 16, background: 'rgba(0,0,0,0.02)', border: '1px solid rgba(0,0,0,0.06)', borderRadius: 12 }}>
      <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'rgba(0,0,0,0.7)', marginBottom: 12 }}>
        📊 Embudo de conversión
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {steps.map((s, i) => {
          const widthPct = max > 0 ? (s.value / max) * 100 : 0;
          const prev = i > 0 ? steps[i - 1].value : null;
          const dropPct = prev != null && prev > 0 ? ((prev - s.value) / prev) * 100 : null;
          return (
            <div key={s.key}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                <span style={{ fontSize: '0.85rem', color: 'rgba(0,0,0,0.7)' }}>{s.label}</span>
                <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'rgba(0,0,0,0.85)' }}>
                  {fmtInt(s.value)}
                  {dropPct != null && dropPct > 0 && (
                    <span style={{ fontSize: '0.75rem', color: RED, fontWeight: 600, marginLeft: 8 }}>
                      ↓ −{dropPct.toFixed(0)}%
                    </span>
                  )}
                </span>
              </div>
              <div style={{ height: 22, background: 'rgba(0,0,0,0.05)', borderRadius: 6, overflow: 'hidden' }}>
                <div style={{ width: `${widthPct}%`, height: '100%', background: s.color, transition: 'width 0.3s ease' }} />
              </div>
            </div>
          );
        })}
      </div>
      {data.add_to_cart > 0 && (
        <div style={{ marginTop: 12, fontSize: '0.78rem', color: 'rgba(0,0,0,0.55)', lineHeight: 1.5 }}>
          💡 De cada 100 personas que agregaron al carrito,{' '}
          <strong>{((data.purchase / data.add_to_cart) * 100).toFixed(1)}</strong> compraron.
          Las {fmtInt(data.add_to_cart - data.purchase)} restantes <strong>abandonaron</strong> —
          son tu mejor audiencia para retargeting o cupones.
        </div>
      )}
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
      <div style={S.sectionTitle}>🎯 Conversiones del sitio</div>
      <div style={S.sectionCap}>
        Compras hechas <em>online</em> a través del checkout de Nidux. Las ventas en local físico,
        por teléfono o WhatsApp <strong>no aparecen acá</strong> — para esas, ver NEO.
      </div>
      {error && <div style={{ color: RED, fontSize: '0.85rem' }}>⚠️ {error}</div>}
      <FallbackBanner data={data} />
      {!data ? (
        <div style={{ color: 'rgba(0,0,0,0.5)', fontSize: '0.9rem' }}>⏳ Cargando...</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <MetricCard label="🛒 Add to Cart" value={fmtInt(data.add_to_cart)} hint="agregaron al carrito en la web" />
            <MetricCard label="🧾 Iniciaron checkout" value={fmtInt(data.begin_checkout)} hint="empezaron a pagar en la web" />
            <MetricCard label="✅ Compras web" value={fmtInt(data.purchase)} hint="completadas en la web" />
            <MetricCard label="💰 Ingresos web" value={fmtCRC(data.revenue)} hint="suma de compras web (colones)" />
          </div>
          <ConversionFunnel data={data} />
          {data.purchase === 0 && data.revenue > 0 && (
            <div style={{ marginTop: 12, background: 'rgba(255,193,7,0.1)', border: '1px solid rgba(255,193,7,0.4)', color: '#7a5d10', padding: '10px 14px', borderRadius: 10, fontSize: '0.82rem', lineHeight: 1.5 }}>
              ⚠️ Hay revenue registrado pero 0 compras. Esto suele significar que GA4 está
              recibiendo datos importados de otro sistema (POS, ERP) en lugar de eventos
              <code style={{ background: 'rgba(0,0,0,0.05)', padding: '0 4px', borderRadius: 3 }}>purchase</code> reales del sitio. Revisar la fuente en GA4 Admin → Data Import.
            </div>
          )}
        </>
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
      <div style={S.sectionCap}>Solo campañas reales creadas con el generador. Excluye las auto-etiquetas de GA4 como (direct), (organic), (referral) y (not set).</div>
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

function DeviceBreakdownSection({ dateRange }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    let cancelled = false;
    ga4('device_breakdown', dateRange).then(d => { if (!cancelled) setData(d); }).catch(e => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [dateRange]);

  const DEVICE_META = {
    mobile:  { label: 'Móvil',     emoji: '📱', color: BLUE },
    desktop: { label: 'Escritorio', emoji: '💻', color: GOLD },
    tablet:  { label: 'Tablet',     emoji: '📱', color: GREEN },
    smart_tv: { label: 'Smart TV',  emoji: '📺', color: AMBER },
  };

  return (
    <div style={S.card}>
      <div style={S.sectionTitle}>📱 Móvil vs 💻 Escritorio</div>
      <div style={S.sectionCap}>Cómo accede tu audiencia. El % de mobile suele dictar las prioridades de UX y ads.</div>
      {error && <div style={{ color: RED, fontSize: '0.85rem' }}>⚠️ {error}</div>}
      <FallbackBanner data={data} />
      {!data ? (
        <div style={{ color: 'rgba(0,0,0,0.5)', fontSize: '0.9rem' }}>⏳ Cargando...</div>
      ) : (data.breakdown || []).length === 0 ? (
        <div style={{ color: 'rgba(0,0,0,0.5)', fontSize: '0.9rem' }}>Sin datos en este período.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          {(data.breakdown || []).map((row) => {
            const meta = DEVICE_META[row.device] || { label: row.device, emoji: '📊', color: 'rgba(0,0,0,0.5)' };
            return (
              <div key={row.device} style={{ ...S.metric, borderLeft: `4px solid ${meta.color}` }}>
                <div style={{ fontSize: '0.78rem', color: 'rgba(0,0,0,0.5)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                  {meta.emoji} {meta.label}
                </div>
                <div style={{ fontSize: '2rem', fontWeight: 800, color: 'rgba(0,0,0,0.85)', marginTop: 6 }}>
                  {row.pct.toFixed(1)}%
                </div>
                <div style={{ fontSize: '0.82rem', color: 'rgba(0,0,0,0.55)', marginTop: 4 }}>
                  {fmtInt(row.sessions)} sesiones · {fmtInt(row.users)} usuarios
                </div>
                <div style={{ marginTop: 8, height: 6, background: 'rgba(0,0,0,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${row.pct}%`, height: '100%', background: meta.color }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Top productos abandonados en carrito: ranking de productos con más
// add_to_cart pero baja conversión a purchase. Acciona retargeting/cupones.
function AbandonedCartSection({ dateRange }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    ga4('abandoned_cart', dateRange).then(setData).catch(e => setError(e.message));
  }, [dateRange]);

  return (
    <div style={S.card}>
      <div style={S.sectionTitle}>🛒 Top productos abandonados en carrito</div>
      <div style={S.sectionCap}>
        Productos con alta intención (mucho carrito) y baja conversión (poca compra).
        Cuanto más alto el <strong>score de oportunidad</strong>, más sentido tiene apuntarles
        un cupón, retargeting en Meta, o revisar precio/stock.
      </div>
      {error && <div style={{ color: RED, fontSize: '0.85rem' }}>⚠️ {error}</div>}
      <FallbackBanner data={data} />
      {!data ? (
        <div style={{ color: 'rgba(0,0,0,0.5)', fontSize: '0.9rem' }}>⏳ Cargando...</div>
      ) : !data.items || data.items.length === 0 ? (
        <div style={{ color: 'rgba(0,0,0,0.5)', fontSize: '0.9rem' }}>
          Sin datos de carrito en este período. Si el sitio está recibiendo eventos
          <code style={{ background: 'rgba(0,0,0,0.05)', padding: '0 4px', borderRadius: 3, margin: '0 4px' }}>add_to_cart</code>
          con detalle de items, acá aparecen los más abandonados.
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 14 }}>
            <MetricCard label="Total agregados" value={fmtInt(data.summary?.total_added)} hint="ítems al carrito en este período" />
            <MetricCard label="Total abandonados" value={fmtInt(data.summary?.total_abandoned)} hint="agregados que NO se compraron" color={RED} />
            <MetricCard label="Conversión promedio" value={`${(Number(data.summary?.avg_conversion_rate) || 0).toFixed(1)}%`} hint="de carrito a compra" color={GREEN} />
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem' }}>
              <thead>
                <tr style={{ background: 'rgba(0,0,0,0.04)' }}>
                  <th style={th()}>#</th>
                  <th style={th()}>Producto</th>
                  <th style={{ ...th(), textAlign: 'right' }}>Agregados</th>
                  <th style={{ ...th(), textAlign: 'right' }}>Comprados</th>
                  <th style={{ ...th(), textAlign: 'right' }}>Abandonados</th>
                  <th style={{ ...th(), textAlign: 'right' }}>Conv.</th>
                  <th style={{ ...th(), textAlign: 'right' }}>Score</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((it, i) => {
                  const isHot = it.opportunity_score >= 5 && it.conversion_rate < 30;
                  const noConv = it.purchased === 0 && it.added > 0;
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)', background: isHot ? 'rgba(255,193,7,0.06)' : 'transparent' }}>
                      <td style={td()}>{i + 1}</td>
                      <td style={td()}>
                        <div style={{ fontWeight: 500 }}>{it.item_name || <span style={{ color: 'rgba(0,0,0,0.4)' }}>(sin nombre)</span>}</div>
                        {it.item_id && <div style={{ fontSize: '0.72rem', color: 'rgba(0,0,0,0.4)' }}>id: {it.item_id}</div>}
                      </td>
                      <td style={{ ...td(), textAlign: 'right', fontWeight: 700 }}>{fmtInt(it.added)}</td>
                      <td style={{ ...td(), textAlign: 'right', color: noConv ? RED : GREEN, fontWeight: 700 }}>{fmtInt(it.purchased)}</td>
                      <td style={{ ...td(), textAlign: 'right', color: RED, fontWeight: 700 }}>{fmtInt(it.abandoned)}</td>
                      <td style={{ ...td(), textAlign: 'right' }}>{(Number(it.conversion_rate) || 0).toFixed(1)}%</td>
                      <td style={{ ...td(), textAlign: 'right', fontWeight: 800, color: isHot ? AMBER : 'rgba(0,0,0,0.6)' }}>
                        {(Number(it.opportunity_score) || 0).toFixed(1)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 12, fontSize: '0.78rem', color: 'rgba(0,0,0,0.5)', lineHeight: 1.5 }}>
            💡 <strong>Cómo leer:</strong> filas amarillas son oportunidades calientes (score alto + baja conversión).
            Score = abandonos × (1 − tasa de conversión). Más alto = más urgente accionar.
          </div>
        </>
      )}
    </div>
  );
}

// Info-card que explica cómo armar la audiencia de retargeting en Meta usando
// el Pixel ya instalado en el sitio. No requiere código nuevo — todo se hace
// desde Meta Ads Manager.
function MetaRetargetingInfo() {
  return (
    <div style={{ ...S.card, background: 'rgba(225,48,108,0.06)', border: '1px solid rgba(225,48,108,0.25)' }}>
      <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#9c1e4a', marginBottom: 8 }}>
        📣 ¿Cómo recuperar a los que abandonaron?
      </div>
      <div style={{ fontSize: '0.88rem', color: '#7c1740', lineHeight: 1.6 }}>
        El <strong>Meta Pixel ya está instalado</strong> en depositojimenezcr.com y trackea
        AddToCart, InitiateCheckout y Purchase. Para retargetearlos sin escribir código:
        <ol style={{ marginTop: 8, marginBottom: 6, paddingLeft: 22 }}>
          <li>Entrar a <a href="https://business.facebook.com/adsmanager/audiences" target="_blank" rel="noreferrer" style={{ color: '#9c1e4a', fontWeight: 600 }}>Meta Ads Manager → Audiencias</a>.</li>
          <li>Crear nueva → <em>Audiencia personalizada</em> → fuente <em>Sitio web</em> → píxel de Depósito Jiménez.</li>
          <li>Condición 1: <em>Personas que activaron <strong>AddToCart</strong> en los últimos 30 días</em>.</li>
          <li>Condición 2 (excluir): <em>Personas que activaron <strong>Purchase</strong> en los últimos 30 días</em>.</li>
          <li>Guardar como <em>Carrito Abandonado 30d</em>.</li>
          <li>En <em>Campañas</em> → nueva campaña con esa audiencia + creativo con cupón.</li>
        </ol>
        <strong>Tip:</strong> priorizá los SKUs del Top de la tabla de arriba — esos son los que más conversión potencial tienen porque ya hay intención demostrada.
        <br /><br />
        <strong>Para email/WhatsApp con cupón al cliente específico:</strong> el dato del cliente (email/teléfono) lo guarda <strong>Nidux</strong>, no GA4. Andá al admin de Nidux → buscá <em>Carritos abandonados</em> o <em>Pedidos pendientes</em> — ahí están los contactos de quien arrancó el checkout.
      </div>
    </div>
  );
}

export default function Dashboard({ dateRange }) {
  return (
    <div>
      <LiveSection dateRange={dateRange} />
      <SummarySection dateRange={dateRange} />
      <DeviceBreakdownSection dateRange={dateRange} />
      <TopProductsSection dateRange={dateRange} />
      <TrafficSourcesSection dateRange={dateRange} />
      <ConversionsSection dateRange={dateRange} />
      <AbandonedCartSection dateRange={dateRange} />
      <MetaRetargetingInfo />
      <CampaignsPerformanceSection dateRange={dateRange} />
    </div>
  );
}
