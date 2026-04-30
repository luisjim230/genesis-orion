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
  device_breakdown:      30 * 60,
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
  // Filtramos por nombre de evento (add_to_cart | begin_checkout | purchase) Y exigimos
  // que vengan del hostname del sitio público (depositojimenezcr.com). Esto evita contar:
  //   1) eventos disparados desde SOL (sol.depositojimenez.com),
  //   2) datos importados a GA4 desde sistemas offline (POS, ERP) que no tienen hostName web.
  const eventFilter = {
    filter: {
      fieldName: 'eventName',
      inListFilter: { values: ['add_to_cart', 'begin_checkout', 'purchase'], caseSensitive: false },
    },
  };
  const publicHostFilter = {
    filter: {
      fieldName: 'hostName',
      stringFilter: { matchType: 'CONTAINS', value: 'depositojimenezcr.com', caseSensitive: false },
    },
  };
  const expressions = [eventFilter, publicHostFilter];
  if (filter) expressions.unshift(filter);
  const dimensionFilter = { andGroup: { expressions } };

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
    // Revenue = SUMA del eventValue de los eventos `purchase` reales del sitio.
    // Deliberadamente NO usamos la métrica `totalRevenue` de GA4 porque puede incluir
    // ingresos importados offline que no representan compras hechas en la web.
    if (ev === 'purchase') revenue += Number(r.eventValue) || 0;
  });
  return { ...byEvent, revenue };
}

async function fetchCampaigns(client, property, range, traffic) {
  const filter = buildTrafficFilter(traffic);
  const dr = parseDateRange(range);
  // Excluye los nombres "fantasma" que GA4 auto-asigna cuando no hay UTM real:
  // (not set), (organic), (direct), (referral). Solo nos interesan las campañas
  // que el equipo creó explícitamente con el generador de links.
  const realCampaignsOnly = {
    notExpression: {
      filter: {
        fieldName: 'sessionCampaignName',
        stringFilter: { matchType: 'BEGINS_WITH', value: '(', caseSensitive: false },
      },
    },
  };
  const dimensionFilter = filter
    ? { andGroup: { expressions: [filter, realCampaignsOnly] } }
    : realCampaignsOnly;
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

async function fetchDeviceBreakdown(client, property, range, traffic) {
  const filter = buildTrafficFilter(traffic);
  const dr = parseDateRange(range);
  const [resp] = await client.runReport({
    property,
    dateRanges: [dr],
    dimensions: [{ name: 'deviceCategory' }],
    metrics: [{ name: 'sessions' }, { name: 'totalUsers' }, { name: 'screenPageViews' }, { name: 'engagementRate' }],
    ...(filter ? { dimensionFilter: filter } : {}),
  });
  const rows = rowsToObjects(resp).map(r => ({
    device: r.deviceCategory || 'unknown',
    sessions: Number(r.sessions) || 0,
    users: Number(r.totalUsers) || 0,
    pageviews: Number(r.screenPageViews) || 0,
    engagement_rate: Number(r.engagementRate) || 0,
  }));
  const totalSessions = rows.reduce((s, x) => s + x.sessions, 0);
  rows.forEach(x => { x.pct = totalSessions ? (x.sessions / totalSessions) * 100 : 0; });
  rows.sort((a, b) => b.sessions - a.sessions);
  return { breakdown: rows, total_sessions: totalSessions };
}

async function fetchRealtime(client, property, traffic) {
  // GA4 Realtime API NO soporta dimensiones custom como customEvent:traffic_type.
  // Por lo tanto, ignoramos `traffic` aquí y devolvemos siempre el total.
  // Es una limitación permanente de Google, no un bug.
  const [usersResp] = await client.runRealtimeReport({
    property,
    metrics: [{ name: 'activeUsers' }],
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
    });
    lastPages = rowsToObjects(pagesResp).map(r => ({
      title: r.unifiedScreenName,
      views: Number(r.screenPageViews) || 0,
    }));
  } catch { /* algunas propiedades no exponen unifiedScreenName */ }
  return { active_users: activeUsers, last_pages: lastPages, filter_unsupported: true };
}

async function fetchInternalTeamActivity(client, property, range) {
  // Filtros aplicados a TODAS las queries de esta tab:
  // 1) traffic_type=internal → solo el equipo (no clientes).
  // 2) hostName contiene "depositojimenezcr.com" → solo el sitio público,
  //    excluye el tráfico de SOL (sol.depositojimenez.com) que sería ruido —
  //    nos importa qué consulta el equipo en el e-commerce, no su uso de SOL.
  const filter = buildTrafficFilter('internal');
  const publicHostFilter = {
    filter: {
      fieldName: 'hostName',
      stringFilter: { matchType: 'CONTAINS', value: 'depositojimenezcr.com', caseSensitive: false },
    },
  };
  const baseFilter = { andGroup: { expressions: [filter, publicHostFilter] } };
  // Filtro auxiliar para diagnóstico: solo hostname público, SIN filtrar por traffic_type.
  // Sirve para detectar el caso en que GA4 ve sesiones del sitio pero ninguna queda
  // marcada como interna (=> Nidux no está mandando el flag).
  const publicOnlyFilter = publicHostFilter;
  const dr = parseDateRange(range);
  const prev = getPreviousRange(range);

  // Top productos consultados por el equipo (en el sitio público).
  const productFilter = {
    filter: {
      fieldName: 'pagePath',
      stringFilter: { matchType: 'CONTAINS', value: '/products/', caseSensitive: false },
    },
  };
  const dimensionFilter = { andGroup: { expressions: [filter, publicHostFilter, productFilter] } };

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

  // Heatmap por hora del día y día de la semana — solo sitio público.
  const [heatResp] = await client.runReport({
    property,
    dateRanges: [dr],
    dimensions: [{ name: 'dayOfWeek' }, { name: 'hour' }],
    metrics: [{ name: 'sessions' }],
    dimensionFilter: baseFilter,
  });
  const heatmap = rowsToObjects(heatResp).map(r => ({
    day_of_week: Number(r.dayOfWeek), // 0=domingo
    hour: Number(r.hour),
    sessions: Number(r.sessions) || 0,
  }));

  // Resumen interno — solo sitio público (excluye uso de SOL).
  const [sumResp] = await client.runReport({
    property,
    dateRanges: [dr],
    metrics: [{ name: 'sessions' }, { name: 'screenPageViews' }, { name: 'totalUsers' }],
    dimensionFilter: baseFilter,
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

  // Diagnóstico: cuántas sesiones totales tuvo el sitio público en este período
  // (sin filtrar por internal). Permite detectar configuración rota de Nidux:
  // si hay muchas sesiones en el sitio pero 0 internas, el snippet no está corriendo.
  let publicTotalSessions = 0;
  let publicProductSessions = 0;
  try {
    const [pubResp] = await client.runReport({
      property,
      dateRanges: [dr],
      metrics: [{ name: 'sessions' }],
      dimensionFilter: publicOnlyFilter,
    });
    publicTotalSessions = Number(pubResp.rows?.[0]?.metricValues?.[0]?.value) || 0;

    // Sesiones públicas que tocaron alguna /products/ — sin filtrar por internal.
    const [pubProdResp] = await client.runReport({
      property,
      dateRanges: [dr],
      metrics: [{ name: 'sessions' }],
      dimensionFilter: {
        andGroup: {
          expressions: [
            publicOnlyFilter,
            { filter: { fieldName: 'pagePath', stringFilter: { matchType: 'CONTAINS', value: '/products/', caseSensitive: false } } },
          ],
        },
      },
    });
    publicProductSessions = Number(pubProdResp.rows?.[0]?.metricValues?.[0]?.value) || 0;
  } catch { /* si falla, dejamos en 0 */ }

  return {
    summary: {
      total_searches: totalSessions,
      total_pageviews: totalPageviews,
      unique_products: top.length,
      avg_per_day: days ? totalSessions / days : 0,
      peak_hour: peakHour ? Number(peakHour[0]) : null,
      // Diagnóstico para detectar config rota.
      public_total_sessions: publicTotalSessions,
      public_product_sessions: publicProductSessions,
      internal_pct: publicTotalSessions ? (totalSessions / publicTotalSessions) * 100 : 0,
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
    const fetchOnce = async (filter) => {
      switch (metric_type) {
        case 'summary':                return fetchSummary(client, property, date_range, filter);
        case 'active_users_realtime':  return fetchRealtime(client, property, filter);
        case 'top_products':           return fetchTopProducts(client, property, date_range, filter);
        case 'traffic_sources':        return fetchTrafficSources(client, property, date_range, filter);
        case 'conversions':            return fetchConversions(client, property, date_range, filter);
        case 'campaigns_performance':  return fetchCampaigns(client, property, date_range, filter);
        case 'device_breakdown':       return fetchDeviceBreakdown(client, property, date_range, filter);
        case 'internal_team_activity': return fetchInternalTeamActivity(client, property, date_range);
        default: throw new Error(`metric_type desconocido: ${metric_type}`);
      }
    };
    let data, filter_fallback = false;
    try {
      data = await fetchOnce(traffic_filter);
    } catch (e) {
      const msg = String(e?.message || e);
      // Si el error es porque la dimensión custom traffic_type no se reconoce
      // (suele suceder por hasta 24h post-registro), volvemos a llamar sin filtro.
      // Esto mantiene el dashboard funcional mientras GA4 propaga la dimensión.
      const dimNotReady = /not a valid dimension/i.test(msg) && /traffic_type/i.test(msg);
      if (dimNotReady && traffic_filter !== 'all') {
        data = await fetchOnce('all');
        filter_fallback = true;
      } else {
        throw e;
      }
    }

    // 3) Cachear (excepto realtime). No cacheamos respuestas con fallback,
    // así cuando la dimensión propague el caché no las preserva.
    if (metric_type !== 'active_users_realtime' && !filter_fallback) {
      await writeCache(metric_type, date_range, traffic_filter, data);
    }

    return NextResponse.json({ ok: true, cached: false, filter_fallback, data });
  } catch (e) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
