// Endpoint unificado para métricas GA4.
// Query params:
//   metric_type    (requerido): summary | active_users_realtime | top_products |
//                              traffic_sources | conversions | campaigns_performance |
//                              internal_team_activity
//   date_range     (default 7d): today | yesterday | 7d | 14d | 28d | 30d | 90d
//   traffic_filter (default external): external | internal | all
//
// Cachea en ga4_metrics_cache excepto realtime. TTL configurable por tipo.
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  getGA4Client,
  getPropertyResource,
  buildTrafficFilter,
  parseDateRange,
  getPreviousRange,
  pctChange,
} from '../../../../lib/ga4';

// TTL del caché por tipo de métrica.
const CACHE_TTL_SECONDS = {
  summary:               5 * 60,   // 5 min
  top_products:          15 * 60,  // 15 min
  traffic_sources:       15 * 60,
  conversions:           10 * 60,
  campaigns_performance: 15 * 60,
  internal_team_activity: 10 * 60,
};

let _admin = null;
function getAdmin() {
  if (_admin) return _admin;
  _admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  return _admin;
}

async function readCache(metric_type, date_range, traffic_filter) {
  const { data } = await getAdmin()
    .from('ga4_metrics_cache')
    .select('*')
    .eq('metric_type', metric_type)
    .eq('date_range', date_range)
    .eq('traffic_filter', traffic_filter)
    .gt('expires_at', new Date().toISOString())
    .order('fetched_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.data || null;
}

async function writeCache(metric_type, date_range, traffic_filter, data) {
  const ttl = CACHE_TTL_SECONDS[metric_type] || 600;
  const expires_at = new Date(Date.now() + ttl * 1000).toISOString();
  await getAdmin().from('ga4_metrics_cache').insert({
    metric_type, date_range, traffic_filter, data, expires_at,
  });
  // Limpieza oportunista de entradas vencidas.
  await getAdmin().from('ga4_metrics_cache')
    .delete()
    .lt('expires_at', new Date().toISOString());
}

function rowsToObjects(report) {
  if (!report || !report.rows) return [];
  const dimNames = (report.dimensionHeaders || []).map(h => h.name);
  const metNames = (report.metricHeaders || []).map(h => h.name);
  return report.rows.map(r => {
    const obj = {};
    (r.dimensionValues || []).forEach((v, i) => { obj[dimNames[i]] = v.value; });
    (r.metricValues || []).forEach((v, i) => { obj[metNames[i]] = v.value; });
    return obj;
  });
}

async function fetchSummary(client, property, range, traffic) {
  const filter = buildTrafficFilter(traffic);
  const dr = parseDateRange(range);
  const prev = getPreviousRange(range);
  const baseReq = (dateRange) => ({
    property,
    dateRanges: [dateRange],
    metrics: [
      { name: 'sessions' },
      { name: 'totalUsers' },
      { name: 'screenPageViews' },
      { name: 'averageSessionDuration' },
    ],
    ...(filter ? { dimensionFilter: filter } : {}),
  });
  const [curResp] = await client.runReport(baseReq(dr));
  const [prevResp] = await client.runReport(baseReq(prev));
  const cur = (curResp.rows?.[0]?.metricValues || []).map(v => Number(v.value) || 0);
  const old = (prevResp.rows?.[0]?.metricValues || []).map(v => Number(v.value) || 0);
  return {
    sessions:               { current: cur[0] || 0, previous: old[0] || 0, pct: pctChange(cur[0], old[0]) },
    users:                  { current: cur[1] || 0, previous: old[1] || 0, pct: pctChange(cur[1], old[1]) },
    pageviews:              { current: cur[2] || 0, previous: old[2] || 0, pct: pctChange(cur[2], old[2]) },
    avg_session_duration:   { current: cur[3] || 0, previous: old[3] || 0, pct: pctChange(cur[3], old[3]) },
  };
}

async function fetchTopProducts(client, property, range, traffic) {
  const filter = buildTrafficFilter(traffic);
  const dr = parseDateRange(range);
  // Combinamos el filtro de traffic con un filtro adicional de pagePath que contenga "/products/".
  const productFilter = {
    filter: {
      fieldName: 'pagePath',
      stringFilter: { matchType: 'CONTAINS', value: '/products/', caseSensitive: false },
    },
  };
  const dimensionFilter = filter
    ? { andGroup: { expressions: [filter, productFilter] } }
    : productFilter;
  const [resp] = await client.runReport({
    property,
    dateRanges: [dr],
    dimensions: [{ name: 'pagePath' }, { name: 'pageTitle' }],
    metrics: [{ name: 'screenPageViews' }, { name: 'sessions' }, { name: 'totalUsers' }],
    orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
    limit: 30,
    dimensionFilter,
  });
  return rowsToObjects(resp).map(r => ({
    path: r.pagePath,
    title: r.pageTitle,
    views: Number(r.screenPageViews) || 0,
    sessions: Number(r.sessions) || 0,
    users: Number(r.totalUsers) || 0,
    product_name: extractProductName(r.pagePath, r.pageTitle),
  }));
}

function extractProductName(pagePath, pageTitle) {
  if (pageTitle && pageTitle.trim() && !pageTitle.toLowerCase().includes('depósito jiménez')) {
    // El título suele venir como "Producto X — Depósito Jiménez".
    return pageTitle.split('—')[0].split('|')[0].trim();
  }
  // Fallback: extraer del slug del path /products/ID/slug-del-producto
  if (!pagePath) return '(sin nombre)';
  const m = pagePath.match(/\/products\/[^\/]+\/([^\/?#]+)/i);
  if (m) return m[1].replace(/-/g, ' ').replace(/_/g, ' ');
  return pagePath;
}

async function fetchTrafficSources(client, property, range, traffic) {
  const filter = buildTrafficFilter(traffic);
  const dr = parseDateRange(range);
  const [resp] = await client.runReport({
    property,
    dateRanges: [dr],
    dimensions: [{ name: 'sessionSource' }, { name: 'sessionMedium' }],
    metrics: [{ name: 'sessions' }, { name: 'totalUsers' }, { name: 'engagedSessions' }],
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    limit: 25,
    ...(filter ? { dimensionFilter: filter } : {}),
  });
  return rowsToObjects(resp).map(r => ({
    source: r.sessionSource,
    medium: r.sessionMedium,
    sessions: Number(r.sessions) || 0,
    users: Number(r.totalUsers) || 0,
    engaged_sessions: Number(r.engagedSessions) || 0,
  }));
}

async function fetchConversions(client, property, range, traffic) {
  const filter = buildTrafficFilter(traffic);
  const dr = parseDateRange(range);
  // Filtramos por nombre de evento (add_to_cart | begin_checkout | purchase).
  const eventFilter = {
    filter: {
      fieldName: 'eventName',
      inListFilter: { values: ['add_to_cart', 'begin_checkout', 'purchase'], caseSensitive: false },
    },
  };
  const dimensionFilter = filter
    ? { andGroup: { expressions: [filter, eventFilter] } }
    : eventFilter;
  const [resp] = await client.runReport({
    property,
    dateRanges: [dr],
    dimensions: [{ name: 'eventName' }],
    metrics: [
      { name: 'eventCount' },
      { name: 'eventValue' },
      { name: 'totalUsers' },
    ],
    dimensionFilter,
  });
  const rows = rowsToObjects(resp);
  const byEvent = { add_to_cart: 0, begin_checkout: 0, purchase: 0 };
  let revenue = 0;
  rows.forEach(r => {
    const ev = r.eventName;
    if (ev in byEvent) byEvent[ev] = Number(r.eventCount) || 0;
    if (ev === 'purchase') revenue += Number(r.eventValue) || 0;
  });
  // Intento adicional con métricas estándar e-commerce (totalRevenue / purchaseRevenue).
  try {
    const [resp2] = await client.runReport({
      property,
      dateRanges: [dr],
      metrics: [{ name: 'totalRevenue' }, { name: 'transactions' }],
      ...(filter ? { dimensionFilter: filter } : {}),
    });
    const m = (resp2.rows?.[0]?.metricValues || []).map(v => Number(v.value) || 0);
    if (m[0]) revenue = m[0];
  } catch { /* prop sin e-commerce: ignorar */ }
  return { ...byEvent, revenue };
}

async function fetchCampaigns(client, property, range, traffic) {
  const filter = buildTrafficFilter(traffic);
  const dr = parseDateRange(range);
  const notSetFilter = {
    notExpression: {
      filter: {
        fieldName: 'sessionCampaignName',
        stringFilter: { matchType: 'EXACT', value: '(not set)', caseSensitive: false },
      },
    },
  };
  const dimensionFilter = filter
    ? { andGroup: { expressions: [filter, notSetFilter] } }
    : notSetFilter;
  const [resp] = await client.runReport({
    property,
    dateRanges: [dr],
    dimensions: [
      { name: 'sessionCampaignName' },
      { name: 'sessionSource' },
      { name: 'sessionMedium' },
    ],
    metrics: [
      { name: 'sessions' },
      { name: 'totalUsers' },
      { name: 'engagedSessions' },
      { name: 'conversions' },
    ],
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    limit: 50,
    dimensionFilter,
  });
  return rowsToObjects(resp).map(r => ({
    campaign: r.sessionCampaignName,
    source: r.sessionSource,
    medium: r.sessionMedium,
    sessions: Number(r.sessions) || 0,
    users: Number(r.totalUsers) || 0,
    engaged_sessions: Number(r.engagedSessions) || 0,
    conversions: Number(r.conversions) || 0,
  }));
}

async function fetchRealtime(client, property, traffic) {
  const filter = buildTrafficFilter(traffic);
  // Usuarios activos ahora.
  const [usersResp] = await client.runRealtimeReport({
    property,
    metrics: [{ name: 'activeUsers' }],
    ...(filter ? { dimensionFilter: filter } : {}),
  });
  const activeUsers = Number(usersResp.rows?.[0]?.metricValues?.[0]?.value) || 0;

  // Últimas 5 páginas vistas (por unifiedScreenName / unifiedPageScreen).
  let lastPages = [];
  try {
    const [pagesResp] = await client.runRealtimeReport({
      property,
      dimensions: [{ name: 'unifiedScreenName' }],
      metrics: [{ name: 'screenPageViews' }],
      orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
      limit: 5,
      ...(filter ? { dimensionFilter: filter } : {}),
    });
    lastPages = rowsToObjects(pagesResp).map(r => ({
      title: r.unifiedScreenName,
      views: Number(r.screenPageViews) || 0,
    }));
  } catch { /* algunas propiedades no exponen unifiedScreenName */ }
  return { active_users: activeUsers, last_pages: lastPages };
}

async function fetchInternalTeamActivity(client, property, range) {
  // Solo tiene sentido con traffic_filter=internal — el caller debe forzarlo.
  const filter = buildTrafficFilter('internal');
  const dr = parseDateRange(range);
  const prev = getPreviousRange(range);

  // Top productos consultados por el equipo.
  const productFilter = {
    filter: {
      fieldName: 'pagePath',
      stringFilter: { matchType: 'CONTAINS', value: '/products/', caseSensitive: false },
    },
  };
  const dimensionFilter = { andGroup: { expressions: [filter, productFilter] } };

  const [topResp] = await client.runReport({
    property,
    dateRanges: [dr],
    dimensions: [{ name: 'pagePath' }, { name: 'pageTitle' }],
    metrics: [{ name: 'screenPageViews' }, { name: 'sessions' }],
    orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
    limit: 30,
    dimensionFilter,
  });
  const top = rowsToObjects(topResp).map(r => ({
    path: r.pagePath,
    title: r.pageTitle,
    views: Number(r.screenPageViews) || 0,
    sessions: Number(r.sessions) || 0,
    product_name: extractProductName(r.pagePath, r.pageTitle),
  }));
  const totalViews = top.reduce((s, x) => s + x.views, 0);
  top.forEach(x => { x.pct_total = totalViews ? (x.views / totalViews) * 100 : 0; });

  // Top productos del período anterior (para tendencia).
  const [prevResp] = await client.runReport({
    property,
    dateRanges: [prev],
    dimensions: [{ name: 'pagePath' }],
    metrics: [{ name: 'screenPageViews' }],
    dimensionFilter,
    limit: 100,
  });
  const prevMap = {};
  rowsToObjects(prevResp).forEach(r => { prevMap[r.pagePath] = Number(r.screenPageViews) || 0; });
  top.forEach(x => {
    const before = prevMap[x.path] || 0;
    if (before === 0 && x.views > 0) x.trend = 'up';
    else if (x.views > before * 1.10) x.trend = 'up';
    else if (x.views < before * 0.90) x.trend = 'down';
    else x.trend = 'flat';
    x.previous_views = before;
  });

  // Heatmap por hora del día y día de la semana.
  const [heatResp] = await client.runReport({
    property,
    dateRanges: [dr],
    dimensions: [{ name: 'dayOfWeek' }, { name: 'hour' }],
    metrics: [{ name: 'sessions' }],
    dimensionFilter: filter,
  });
  const heatmap = rowsToObjects(heatResp).map(r => ({
    day_of_week: Number(r.dayOfWeek), // 0=domingo
    hour: Number(r.hour),
    sessions: Number(r.sessions) || 0,
  }));

  // Resumen interno.
  const [sumResp] = await client.runReport({
    property,
    dateRanges: [dr],
    metrics: [{ name: 'sessions' }, { name: 'screenPageViews' }, { name: 'totalUsers' }],
    dimensionFilter: filter,
  });
  const sm = (sumResp.rows?.[0]?.metricValues || []).map(v => Number(v.value) || 0);
  const totalSessions = sm[0] || 0;
  const totalPageviews = sm[1] || 0;

  // Hora pico.
  const byHour = {};
  heatmap.forEach(r => { byHour[r.hour] = (byHour[r.hour] || 0) + r.sessions; });
  const peakHour = Object.entries(byHour).sort((a, b) => b[1] - a[1])[0];

  // Días en el rango (para promedio/día).
  const days = {
    'today':1,'yesterday':1,'7d':7,'14d':14,'28d':28,'30d':30,'90d':90,'this_month':30,
  }[String(range || '7d').toLowerCase()] || 7;

  return {
    summary: {
      total_searches: totalSessions,
      total_pageviews: totalPageviews,
      unique_products: top.length,
      avg_per_day: days ? totalSessions / days : 0,
      peak_hour: peakHour ? Number(peakHour[0]) : null,
    },
    top_products: top,
    heatmap,
  };
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const metric_type = (searchParams.get('metric_type') || '').trim();
    const date_range = (searchParams.get('date_range') || '7d').trim();
    let traffic_filter = (searchParams.get('traffic_filter') || 'external').trim().toLowerCase();
    if (!['external', 'internal', 'all'].includes(traffic_filter)) traffic_filter = 'external';

    if (!metric_type) {
      return NextResponse.json({ error: 'metric_type requerido' }, { status: 400 });
    }

    // Validación de configuración GA4.
    if (!process.env.GA4_PROPERTY_ID || !process.env.GA4_SERVICE_ACCOUNT_JSON) {
      return NextResponse.json({
        error: 'GA4 no está configurado',
        hint: 'Definir GA4_PROPERTY_ID y GA4_SERVICE_ACCOUNT_JSON en variables de entorno.',
      }, { status: 503 });
    }

    // 1) Caché (excepto realtime).
    if (metric_type !== 'active_users_realtime') {
      const cached = await readCache(metric_type, date_range, traffic_filter);
      if (cached) {
        return NextResponse.json({ ok: true, cached: true, data: cached });
      }
    }

    // 2) Fetch real.
    const client = getGA4Client();
    const property = getPropertyResource();
    let data;
    switch (metric_type) {
      case 'summary':
        data = await fetchSummary(client, property, date_range, traffic_filter);
        break;
      case 'active_users_realtime':
        data = await fetchRealtime(client, property, traffic_filter);
        break;
      case 'top_products':
        data = await fetchTopProducts(client, property, date_range, traffic_filter);
        break;
      case 'traffic_sources':
        data = await fetchTrafficSources(client, property, date_range, traffic_filter);
        break;
      case 'conversions':
        data = await fetchConversions(client, property, date_range, traffic_filter);
        break;
      case 'campaigns_performance':
        data = await fetchCampaigns(client, property, date_range, traffic_filter);
        break;
      case 'internal_team_activity':
        data = await fetchInternalTeamActivity(client, property, date_range);
        break;
      default:
        return NextResponse.json({ error: `metric_type desconocido: ${metric_type}` }, { status: 400 });
    }

    // 3) Cachear (excepto realtime).
    if (metric_type !== 'active_users_realtime') {
      await writeCache(metric_type, date_range, traffic_filter, data);
    }

    return NextResponse.json({ ok: true, cached: false, data });
  } catch (e) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
