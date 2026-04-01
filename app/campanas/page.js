'use client';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';

const S = {
  page: { background: 'var(--cream)', minHeight: '100vh', padding: '28px 32px', fontFamily: 'DM Sans, sans-serif', color: 'var(--text-primary)' },
  title: { fontSize: '1.7rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 },
  caption: { fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '4px', marginBottom: '24px' },
  section: { fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px', marginTop: '8px' },
  subCap: { fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '16px' },
  divider: { border: 'none', borderTop: '1px solid var(--border-soft)', margin: '24px 0' },
  card: { background: '#fff', borderRadius: '12px', padding: '16px', border: '1px solid var(--border-soft)' },
  badge: { display: 'inline-block', borderRadius: 20, padding: '2px 10px', fontSize: '0.72rem', fontWeight: 600 },
  kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px', marginBottom: '20px' },
  periodBar: { display: 'flex', gap: '6px', marginBottom: '20px', flexWrap: 'wrap' },
  periodBtn: (active) => ({
    padding: '6px 14px', borderRadius: 8, border: active ? '1px solid var(--orange)' : '1px solid var(--border)',
    background: active ? 'var(--orange)' : '#fff', color: active ? '#fff' : 'var(--text-primary)',
    fontSize: '0.82rem', cursor: 'pointer', fontWeight: active ? 600 : 400, fontFamily: 'DM Sans, sans-serif',
  }),
};

const PERIODS = [
  { label: 'Hoy', days: 1 },
  { label: '7 días', days: 7 },
  { label: '30 días', days: 30 },
  { label: '90 días', days: 90 },
  { label: '6 meses', days: 180 },
];

function fmt$(v) { return v != null ? `$${Number(v).toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '$0.00'; }
function fmtN(v) { return v != null ? Number(v).toLocaleString('es-CR') : '0'; }
function fmtPct(v) { return v != null ? `${Number(v).toFixed(2)}%` : '0%'; }

function KpiCard({ icon, label, value, sub, accent }) {
  const colors = {
    orange: { bg: '#FFF5EE', border: '#ED6E2E33', iconBg: '#ED6E2E22', color: '#ED6E2E' },
    green: { bg: '#F0FFF4', border: '#38A16933', iconBg: '#38A16922', color: '#38A169' },
    blue: { bg: '#EBF8FF', border: '#3182CE33', iconBg: '#3182CE22', color: '#3182CE' },
    purple: { bg: '#FAF5FF', border: '#805AD533', iconBg: '#805AD522', color: '#805AD5' },
    teal: { bg: '#E6FFFA', border: '#31979533', iconBg: '#31979522', color: '#319795' },
    red: { bg: '#FFF5F5', border: '#E53E3E33', iconBg: '#E53E3E22', color: '#E53E3E' },
  };
  const c = colors[accent] || colors.orange;
  return (
    <div style={{ ...S.card, background: c.bg, borderColor: c.border }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ background: c.iconBg, borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem' }}>{icon}</span>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>{label}</span>
      </div>
      <div style={{ fontSize: '1.4rem', fontWeight: 700, color: c.color }}>{value}</div>
      {sub && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function SemaforoTag({ status }) {
  const map = {
    verde: { bg: '#C6F6D5', color: '#22543D', label: 'Óptimo' },
    amarillo: { bg: '#FEFCBF', color: '#744210', label: 'Revisar' },
    rojo: { bg: '#FED7D7', color: '#9B2C2C', label: 'Alerta' },
  };
  const s = map[status] || map.rojo;
  return <span style={{ ...S.badge, background: s.bg, color: s.color }}>{s.label}</span>;
}

function calcSemaforo(c) {
  const msgs = c.messaging_connections || 0;
  const spend = c.spend || 0;
  const costoMsg = msgs > 0 ? spend / msgs : 999;
  if (msgs >= 50 && costoMsg < 0.50) return 'verde';
  if (msgs > 0 && (costoMsg > 0.50 || (c.post_reactions > 10 && msgs < 10))) return 'amarillo';
  if (spend > 20 && msgs < 5) return 'rojo';
  if (msgs > 0) return 'verde';
  return 'amarillo';
}

function AlertCard({ icon, text, type }) {
  const colors = {
    warning: { bg: '#FFFBEB', border: '#F6E05E55', color: '#744210' },
    danger: { bg: '#FFF5F5', border: '#FC818155', color: '#9B2C2C' },
    info: { bg: '#EBF8FF', border: '#63B3ED55', color: '#2A4365' },
    success: { bg: '#F0FFF4', border: '#68D39155', color: '#22543D' },
  };
  const c = colors[type] || colors.info;
  return (
    <div style={{ ...S.card, background: c.bg, borderColor: c.border, display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 16px', marginBottom: 8 }}>
      <span style={{ fontSize: '1.1rem', flexShrink: 0, marginTop: 1 }}>{icon}</span>
      <span style={{ fontSize: '0.82rem', color: c.color, lineHeight: 1.5 }}>{text}</span>
    </div>
  );
}

// ─── Sortable table hook ──────────────────────────────────────────
function useSortable(data, defaultCol, defaultDir = 'desc') {
  const [col, setCol] = useState(defaultCol);
  const [dir, setDir] = useState(defaultDir);

  function toggle(c) {
    if (col === c) setDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setCol(c); setDir('desc'); }
  }

  const sorted = [...data].sort((a, b) => {
    const av = a[col] ?? 0;
    const bv = b[col] ?? 0;
    if (typeof av === 'string') return dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    return dir === 'asc' ? av - bv : bv - av;
  });

  function Th({ children, field, style }) {
    const active = col === field;
    return (
      <th onClick={() => toggle(field)} style={{
        padding: '10px 10px', textAlign: 'right', fontWeight: 600,
        color: active ? 'var(--orange)' : 'var(--text-secondary)',
        cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
        ...style,
      }}>
        {children} {active ? (dir === 'desc' ? ' ↓' : ' ↑') : ' ↕'}
      </th>
    );
  }

  return { sorted, Th, col, dir };
}

export default function CampanasPage() {
  const [insights, setInsights] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [syncLog, setSyncLog] = useState([]);
  const [pixelEvents, setPixelEvents] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [periodo, setPeriodo] = useState(30);

  const cargar = useCallback(async () => {
    setCargando(true);
    const since = new Date();
    since.setDate(since.getDate() - periodo);
    const sinceStr = since.toISOString().split('T')[0];

    const [insRes, campRes, logRes, pixRes] = await Promise.allSettled([
      supabase.from('meta_insights_daily')
        .select('*')
        .gte('date', sinceStr)
        .order('date', { ascending: false }),
      supabase.from('meta_campaigns')
        .select('*')
        .order('name'),
      supabase.from('meta_sync_log')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(5),
      supabase.from('meta_pixel_events')
        .select('*')
        .order('date', { ascending: false })
        .limit(50),
    ]);

    if (insRes.status === 'fulfilled') setInsights(insRes.value.data || []);
    if (campRes.status === 'fulfilled') setCampaigns(campRes.value.data || []);
    if (logRes.status === 'fulfilled') setSyncLog(logRes.value.data || []);
    if (pixRes.status === 'fulfilled') setPixelEvents(pixRes.value.data || []);

    setCargando(false);
  }, [periodo]);

  useEffect(() => { cargar(); }, [cargar]);

  // ─── Aggregate KPIs ────────────────────────────────────────────
  const totalSpend = insights.reduce((a, r) => a + (r.spend || 0), 0);
  const totalMsgs = insights.reduce((a, r) => a + (r.messaging_connections || 0), 0);
  const totalConvos = insights.reduce((a, r) => a + (r.conversations_started || 0), 0);
  const totalPurchases = insights.reduce((a, r) => a + (r.purchases || 0), 0);
  const totalPurchaseValue = insights.reduce((a, r) => a + (r.purchase_value || 0), 0);
  const totalReactions = insights.reduce((a, r) => a + (r.post_reactions || 0), 0);
  const totalImpressions = insights.reduce((a, r) => a + (r.impressions || 0), 0);
  const avgCTR = totalImpressions > 0 ? (insights.reduce((a, r) => a + (r.clicks || 0), 0) / totalImpressions * 100) : 0;
  const costoMsg = totalMsgs > 0 ? totalSpend / totalMsgs : 0;
  const roas = totalSpend > 0 ? totalPurchaseValue / totalSpend : 0;

  // ─── Group by campaign ─────────────────────────────────────────
  const byCampaign = {};
  insights.forEach(r => {
    if (!byCampaign[r.campaign_id]) {
      byCampaign[r.campaign_id] = {
        campaign_id: r.campaign_id,
        campaign_name: r.campaign_name,
        spend: 0, messaging_connections: 0, conversations_started: 0,
        purchases: 0, purchase_value: 0, post_reactions: 0,
        post_saves: 0, impressions: 0, clicks: 0, video_views: 0,
      };
    }
    const c = byCampaign[r.campaign_id];
    c.spend += r.spend || 0;
    c.messaging_connections += r.messaging_connections || 0;
    c.conversations_started += r.conversations_started || 0;
    c.purchases += r.purchases || 0;
    c.purchase_value += r.purchase_value || 0;
    c.post_reactions += r.post_reactions || 0;
    c.post_saves += r.post_saves || 0;
    c.impressions += r.impressions || 0;
    c.clicks += r.clicks || 0;
    c.video_views += r.video_views || 0;
  });
  const campListRaw = Object.values(byCampaign);

  // ─── Alerts ────────────────────────────────────────────────────
  const alerts = [];

  // Campaign alerts
  campList.forEach(c => {
    if (c.spend > 20 && c.messaging_connections < 5) {
      alerts.push({ icon: '🔴', text: `"${c.campaign_name}" lleva ${fmt$(c.spend)} de gasto con solo ${c.messaging_connections} mensajes WA.`, type: 'danger' });
    }
  });

  // Cost per message comparison (would need historical data for real comparison)
  if (costoMsg > 0.75) {
    alerts.push({ icon: '⚠️', text: `El costo por mensaje WA está en ${fmt$(costoMsg)} — por encima del objetivo de $0.50.`, type: 'warning' });
  }

  // Pixel alerts
  const pixelMain = pixelEvents.filter(e => e.pixel_id === '2872277373015010');
  const pixelMoneo = pixelEvents.filter(e => e.pixel_id === '654302754772118');

  if (pixelMoneo.length > 0) {
    alerts.push({ icon: '⚠️', text: 'El pixel "MONEO" (654302754772118) sigue activo. Tener 2 pixels duplica eventos y confunde audiencias — desactivarlo.', type: 'warning' });
  }

  const purchaseEvents = pixelMain.filter(e => e.event_name === 'Purchase');
  const contactEvents = pixelMain.filter(e => e.event_name === 'Contact');
  const viewContentEvents = pixelMain.filter(e => e.event_name === 'ViewContent');

  if (purchaseEvents.length > 0 && purchaseEvents.reduce((a, e) => a + (e.event_count || 0), 0) < 10) {
    alerts.push({ icon: '⚠️', text: 'El evento Purchase del pixel está mal configurado — muy pocos disparos. Verificar implementación.', type: 'warning' });
  }
  if (contactEvents.length === 0 || contactEvents.reduce((a, e) => a + (e.event_count || 0), 0) < 5) {
    alerts.push({ icon: '🔧', text: 'El evento Contact del pixel no está disparando al hacer clic en WhatsApp. Configurar urgente.', type: 'danger' });
  }
  if (viewContentEvents.length === 0) {
    alerts.push({ icon: '🔧', text: 'El evento ViewContent NO está configurado — crítico para retargeting de productos.', type: 'danger' });
  }

  // Token expiry (approximately May 30, 2026)
  const tokenExpiry = new Date('2026-05-30');
  const daysToExpiry = Math.floor((tokenExpiry - new Date()) / (1000 * 60 * 60 * 24));
  if (daysToExpiry <= 30 && daysToExpiry > 0) {
    alerts.push({ icon: '🔑', text: `El token de Meta expira en ${daysToExpiry} días (${tokenExpiry.toLocaleDateString('es-CR')}). Renovar antes.`, type: 'warning' });
  } else if (daysToExpiry <= 0) {
    alerts.push({ icon: '🔑', text: 'El token de Meta está expirado. La sincronización no funciona hasta que se renueve.', type: 'danger' });
  }

  // Sync status
  const lastSync = syncLog[0];

  if (alerts.length === 0 && !cargando && insights.length > 0) {
    alerts.push({ icon: '✅', text: 'Todo en orden. Campañas funcionando normalmente.', type: 'success' });
  }

  // ─── Sort for insights table ─────────────────────────────────────
  const insSort = useSortable(campListRaw, 'spend');
  const campList = insSort.sorted;
  const InsThR = insSort.Th; // right-aligned sortable header

  // ─── Sort for all-campaigns table ────────────────────────────────
  const campSort = useSortable(campaigns, 'name', 'asc');
  const sortedCampaigns = campSort.sorted;
  const CampThR = campSort.Th;

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={S.title}>📣 Campañas</h1>
          <p style={S.caption}>Meta Ads — rendimiento de campañas de Facebook e Instagram</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {lastSync && (
            <span style={{ fontSize: '0.72rem', color: lastSync.status === 'ok' ? '#38A169' : lastSync.status === 'parcial' ? '#D69E2E' : '#E53E3E' }}>
              {lastSync.status === 'ok' ? '✅' : lastSync.status === 'parcial' ? '⚠️' : '❌'}{' '}
              Sync: {new Date(lastSync.started_at).toLocaleDateString('es-CR', { day: 'numeric', month: 'short' })}{' '}
              {new Date(lastSync.started_at).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
      </div>

      {/* Period selector */}
      <div style={S.periodBar}>
        {PERIODS.map(p => (
          <button key={p.days} style={S.periodBtn(periodo === p.days)} onClick={() => setPeriodo(p.days)}>
            {p.label}
          </button>
        ))}
      </div>

      {cargando ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '2rem', marginBottom: 12 }}>⏳</div>
          Cargando datos de campañas...
        </div>
      ) : (
        <>
          {/* ── KPIs: solo cuando hay insights ─────────────────────── */}
          {insights.length > 0 && (
            <>
              <div style={S.kpiGrid}>
                <KpiCard icon="💰" label="Gasto total" value={fmt$(totalSpend)} accent="orange" />
                <KpiCard icon="💬" label="Mensajes WA" value={fmtN(totalMsgs)} sub="KPI principal" accent="green" />
                <KpiCard icon="📊" label="Costo / Mensaje" value={fmt$(costoMsg)} sub={costoMsg < 0.50 ? 'Dentro del objetivo' : 'Sobre objetivo ($0.50)'} accent={costoMsg < 0.50 ? 'teal' : 'red'} />
                <KpiCard icon="🗣️" label="Conversaciones" value={fmtN(totalConvos)} accent="blue" />
                <KpiCard icon="🛒" label="Compras web" value={fmtN(totalPurchases)} sub={`${fmt$(totalPurchaseValue)} (accidental)`} accent="purple" />
                <KpiCard icon="📈" label="ROAS" value={`${roas.toFixed(1)}x`} sub={roas >= 3 ? 'Positivo' : 'Mejorable'} accent={roas >= 3 ? 'green' : 'orange'} />
              </div>
              <hr style={S.divider} />
            </>
          )}

          {/* ── Banner cuando no hay insights aún ──────────────────── */}
          {insights.length === 0 && (
            <div style={{ ...S.card, background: '#FFFBEB', borderColor: '#F6E05E55', display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px', marginBottom: 20 }}>
              <span style={{ fontSize: '1.4rem' }}>⏳</span>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.88rem', color: '#744210' }}>Sincronización de métricas en progreso</div>
                <div style={{ fontSize: '0.78rem', color: '#92400E', marginTop: 2 }}>
                  Los datos de gasto, mensajes y conversiones aparecerán aquí cuando termine el backfill. Las campañas ya están sincronizadas.
                </div>
              </div>
            </div>
          )}

          {/* ── Alertas — siempre visibles ─────────────────────────── */}
          {alerts.length > 0 && (
            <>
              <h2 style={S.section}>🚨 Alertas y estado</h2>
              <p style={S.subCap}>Campañas, pixel y configuración</p>
              {alerts.map((a, i) => <AlertCard key={i} {...a} />)}
              <hr style={S.divider} />
            </>
          )}

          {/* ── Tabla principal: insights agrupados si existen ─────── */}
          {insights.length > 0 && (
            <>
              <h2 style={S.section}>📋 Campañas del período</h2>
              <p style={S.subCap}>{campList.length} campañas con actividad en los últimos {periodo} días</p>
              <div style={{ ...S.card, padding: 0, overflow: 'auto', marginBottom: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                  <thead>
                    <tr style={{ background: '#FAFAFA', borderBottom: '2px solid var(--border-soft)' }}>
                      <InsThR field="campaign_name" style={{ textAlign: 'left', padding: '10px 14px' }}>Campaña</InsThR>
                      <InsThR field="spend">Gasto</InsThR>
                      <InsThR field="messaging_connections">Msgs WA</InsThR>
                      <InsThR field="spend_per_msg">$/Msg</InsThR>
                      <InsThR field="conversations_started">Convos</InsThR>
                      <InsThR field="purchases">Compras</InsThR>
                      <InsThR field="purchase_value">Valor</InsThR>
                      <InsThR field="post_reactions">Reacciones</InsThR>
                      <InsThR field="impressions">Impresiones</InsThR>
                      <th style={{ padding: '10px 10px', textAlign: 'center', fontWeight: 600, color: 'var(--text-secondary)' }}>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campList.map((c, i) => {
                      const costoM = c.messaging_connections > 0 ? c.spend / c.messaging_connections : null;
                      return (
                        <tr key={c.campaign_id} style={{ borderBottom: '1px solid var(--border-soft)', background: i % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                          <td style={{ padding: '10px 14px', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>{c.campaign_name}</td>
                          <td style={{ padding: '10px 10px', textAlign: 'right' }}>{fmt$(c.spend)}</td>
                          <td style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 600, color: c.messaging_connections > 0 ? '#38A169' : 'var(--text-muted)' }}>{fmtN(c.messaging_connections)}</td>
                          <td style={{ padding: '10px 10px', textAlign: 'right', color: costoM != null && costoM < 0.50 ? '#38A169' : costoM != null ? '#E53E3E' : 'var(--text-muted)' }}>{costoM != null ? fmt$(costoM) : '—'}</td>
                          <td style={{ padding: '10px 10px', textAlign: 'right' }}>{fmtN(c.conversations_started)}</td>
                          <td style={{ padding: '10px 10px', textAlign: 'right' }}>{fmtN(c.purchases)}</td>
                          <td style={{ padding: '10px 10px', textAlign: 'right' }}>{c.purchase_value > 0 ? fmt$(c.purchase_value) : '—'}</td>
                          <td style={{ padding: '10px 10px', textAlign: 'right' }}>{fmtN(c.post_reactions)}</td>
                          <td style={{ padding: '10px 10px', textAlign: 'right' }}>{fmtN(c.impressions)}</td>
                          <td style={{ padding: '10px 10px', textAlign: 'center' }}><SemaforoTag status={calcSemaforo(c)} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <hr style={S.divider} />
            </>
          )}

          {/* ── Tabla de campañas desde meta_campaigns (siempre) ───── */}
          <h2 style={S.section}>📂 Todas las campañas</h2>
          <p style={S.subCap}>{campaigns.length} campañas sincronizadas desde Meta Ads</p>
          <div style={{ ...S.card, padding: 0, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ background: '#FAFAFA', borderBottom: '2px solid var(--border-soft)' }}>
                  <CampThR field="name" style={{ textAlign: 'left', padding: '10px 14px' }}>Nombre</CampThR>
                  <CampThR field="objective" style={{ textAlign: 'left', padding: '10px 12px' }}>Objetivo</CampThR>
                  <CampThR field="status" style={{ textAlign: 'center', padding: '10px 12px' }}>Estado</CampThR>
                  <CampThR field="daily_budget">Presupuesto/día</CampThR>
                  <CampThR field="created_time" style={{ textAlign: 'left', padding: '10px 12px' }}>Creada</CampThR>
                </tr>
              </thead>
              <tbody>
                {sortedCampaigns.map((c, i) => (
                  <tr key={c.id} style={{ borderBottom: '1px solid var(--border-soft)', background: i % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                    <td style={{ padding: '10px 14px', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>{c.name}</td>
                    <td style={{ padding: '10px 12px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{c.objective?.replace(/_/g, ' ') || '—'}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <span style={{ ...S.badge,
                        background: c.status === 'ACTIVE' ? '#C6F6D5' : c.status === 'PAUSED' ? '#FEFCBF' : '#EDF2F7',
                        color: c.status === 'ACTIVE' ? '#22543D' : c.status === 'PAUSED' ? '#744210' : '#718096',
                      }}>{c.status === 'ACTIVE' ? 'Activa' : c.status === 'PAUSED' ? 'Pausada' : c.status || '—'}</span>
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>{c.daily_budget ? fmt$(c.daily_budget) : '—'}</td>
                    <td style={{ padding: '10px 12px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {c.created_time ? new Date(c.created_time).toLocaleDateString('es-CR', { day: 'numeric', month: 'short', year: '2-digit' }) : '—'}
                    </td>
                  </tr>
                ))}
                {campaigns.length === 0 && (
                  <tr><td colSpan={5} style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>Sin campañas sincronizadas</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <hr style={S.divider} />

          {/* ── Pixel — siempre visible ────────────────────────────── */}
          <h2 style={S.section}>🔎 Estado del Pixel</h2>
          <p style={S.subCap}>Eventos del pixel principal · Luis Jimenez DEPJIM Pixel</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 20 }}>
            {(() => {
              const mainPixel = pixelEvents.filter(e => e.pixel_id === '2872277373015010');
              return ['PageView', 'AddToCart', 'InitiateCheckout', 'Purchase', 'Contact', 'ViewContent', 'Lead'].map(name => {
                const total = mainPixel.filter(e => e.event_name === name).reduce((a, e) => a + (e.event_count || 0), 0);
                const ok = total > 10;
                const missing = total === 0;
                return (
                  <div key={name} style={{ ...S.card, padding: '12px', textAlign: 'center', borderColor: missing ? '#FC818155' : ok ? '#68D39155' : '#F6E05E55', background: missing ? '#FFF5F5' : ok ? '#F0FFF4' : '#FFFBEB' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 4 }}>{name}</div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 700, color: missing ? '#E53E3E' : ok ? '#38A169' : '#D69E2E' }}>
                      {missing ? '❌' : ok ? fmtN(total) : `⚠️ ${fmtN(total)}`}
                    </div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 2 }}>
                      {missing ? 'No configurado' : ok ? 'Activo' : 'Pocos disparos'}
                    </div>
                  </div>
                );
              });
            })()}
          </div>

          {/* ── Sync log ───────────────────────────────────────────── */}
          <hr style={S.divider} />
          <h2 style={S.section}>🔄 Últimas sincronizaciones</h2>
          <p style={S.subCap}>Registro de las últimas ejecuciones del sync</p>
          <div style={{ ...S.card, padding: 0, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ background: '#FAFAFA', borderBottom: '2px solid var(--border-soft)' }}>
                  <th style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Fecha</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Tipo</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 600, color: 'var(--text-secondary)' }}>Estado</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, color: 'var(--text-secondary)' }}>Registros</th>
                  <th style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Detalle</th>
                </tr>
              </thead>
              <tbody>
                {syncLog.map((s, i) => (
                  <tr key={s.id} style={{ borderBottom: '1px solid var(--border-soft)', background: i % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                    <td style={{ padding: '8px 14px' }}>{new Date(s.started_at).toLocaleDateString('es-CR', { day: 'numeric', month: 'short' })} {new Date(s.started_at).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' })}</td>
                    <td style={{ padding: '8px 10px' }}>{s.sync_type}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                      <span style={{ ...S.badge, background: s.status === 'ok' ? '#C6F6D5' : s.status === 'parcial' ? '#FEFCBF' : '#FED7D7', color: s.status === 'ok' ? '#22543D' : s.status === 'parcial' ? '#744210' : '#9B2C2C' }}>
                        {s.status}
                      </span>
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>{fmtN(s.records_synced)}</td>
                    <td style={{ padding: '8px 14px', color: s.error_message ? '#E53E3E' : 'var(--text-muted)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.error_message || '✓ Sin errores'}</td>
                  </tr>
                ))}
                {syncLog.length === 0 && (
                  <tr><td colSpan={5} style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>Sin sincronizaciones aún</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
