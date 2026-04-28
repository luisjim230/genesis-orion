// Endpoint de alerta diaria.
// Pensado para ser disparado por Vercel Cron a las 9am Costa Rica (15 UTC).
// Genera un resumen del día anterior + top oportunidades WhatsApp y lo
// manda al chat de Telegram configurado.
//
// También se puede pegar manualmente con curl:
//   curl -X POST https://sol.depositojimenez.com/api/metricas-web/alerts/daily?token=XXX
//
// Seguridad: por defecto Vercel Cron envía un header `Authorization: Bearer
// <CRON_SECRET>` que verificamos. En llamada manual, aceptamos query param
// `token` que matchea CRON_SECRET.

import { NextResponse } from 'next/server';
import {
  getGA4Client, getPropertyResource, buildTrafficFilter, parseDateRange, getPreviousRange, pctChange,
} from '../../../../../lib/ga4';
import { extractCodigoInterno, getSalesByCodigos, getProductsInfo } from '../../../../../lib/neo';
import { sendTelegram, escHtml } from '../../../../../lib/telegram';

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

function fmtInt(n) { return Number(n || 0).toLocaleString('es-CR'); }
function fmtPctSigned(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`;
}

async function buildSummary() {
  const client = getGA4Client();
  const property = getPropertyResource();

  // ── Resumen externo ayer vs antes de ayer ──────────────────────────────
  const filter = buildTrafficFilter('external');
  const dr = parseDateRange('yesterday');
  const prev = { startDate: '2daysAgo', endDate: '2daysAgo' };

  let yesterday, previous, filterFallback = false;

  const baseReq = (dateRange) => ({
    property,
    dateRanges: [dateRange],
    metrics: [
      { name: 'sessions' }, { name: 'totalUsers' },
      { name: 'screenPageViews' }, { name: 'engagedSessions' },
    ],
    dimensionFilter: filter,
  });

  try {
    const [curResp] = await client.runReport(baseReq(dr));
    const [prevResp] = await client.runReport(baseReq(prev));
    yesterday = (curResp.rows?.[0]?.metricValues || []).map(v => Number(v.value) || 0);
    previous = (prevResp.rows?.[0]?.metricValues || []).map(v => Number(v.value) || 0);
  } catch (e) {
    const msg = String(e?.message || e);
    if (/not a valid dimension/i.test(msg) && /traffic_type/i.test(msg)) {
      // Fallback sin filtro.
      filterFallback = true;
      const [curResp] = await client.runReport({ ...baseReq(dr), dimensionFilter: undefined });
      const [prevResp] = await client.runReport({ ...baseReq(prev), dimensionFilter: undefined });
      yesterday = (curResp.rows?.[0]?.metricValues || []).map(v => Number(v.value) || 0);
      previous = (prevResp.rows?.[0]?.metricValues || []).map(v => Number(v.value) || 0);
    } else {
      throw e;
    }
  }

  // ── Top oportunidades WhatsApp (últimos 7 días) ─────────────────────────
  let opportunities = [];
  try {
    const dr7 = parseDateRange('7d');
    const internalFilter = buildTrafficFilter('internal');
    const productFilter = {
      filter: {
        fieldName: 'pagePath',
        stringFilter: { matchType: 'CONTAINS', value: '/products/', caseSensitive: false },
      },
    };
    const [resp] = await client.runReport({
      property,
      dateRanges: [dr7],
      dimensions: [{ name: 'pagePath' }, { name: 'pageTitle' }],
      metrics: [{ name: 'screenPageViews' }],
      orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
      limit: 30,
      dimensionFilter: { andGroup: { expressions: [internalFilter, productFilter] } },
    });
    const products = rowsToObjects(resp).map(r => ({
      consultas: Number(r.screenPageViews) || 0,
      title: r.pageTitle,
      path: r.pagePath,
      codigo_interno: extractCodigoInterno(r.pagePath),
    })).filter(p => p.codigo_interno && p.consultas >= 3);

    if (products.length > 0) {
      const codigos = [...new Set(products.map(p => p.codigo_interno))];
      const [salesMap, infoMap] = await Promise.all([
        getSalesByCodigos(codigos, '7d'),
        getProductsInfo(codigos),
      ]);
      opportunities = products.map(p => {
        const sales = salesMap.get(p.codigo_interno) || { units_sold: 0 };
        const info = infoMap.get(p.codigo_interno) || {};
        return {
          codigo: p.codigo_interno,
          name: info.item || p.title || p.codigo_interno,
          consultas: p.consultas,
          units_sold: sales.units_sold,
          existencias: Number(info.existencias) || 0,
          score: p.consultas / (sales.units_sold + 1),
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    }
  } catch { /* ignorar — la dimensión puede no estar lista */ }

  return { yesterday, previous, filterFallback, opportunities };
}

function buildMessage({ yesterday, previous, filterFallback, opportunities }) {
  const ySessions = yesterday[0] || 0;
  const yUsers    = yesterday[1] || 0;
  const yViews    = yesterday[2] || 0;
  const yEngaged  = yesterday[3] || 0;

  const sessionsDiff = pctChange(ySessions, previous[0]);
  const usersDiff    = pctChange(yUsers,    previous[1]);

  let msg = `🌅 <b>Resumen de ayer · Depósito Jiménez</b>\n\n`;
  if (filterFallback) {
    msg += `<i>⏳ Dimensión interno/externo todavía propagándose en GA4. Cifras mostradas son de TODO el tráfico (incluye equipo).</i>\n\n`;
  } else {
    msg += `<i>Solo tráfico externo (clientes), excluye equipo interno.</i>\n\n`;
  }
  msg += `📊 <b>Sesiones:</b> ${fmtInt(ySessions)} (${fmtPctSigned(sessionsDiff)} vs anteayer)\n`;
  msg += `👥 <b>Usuarios:</b> ${fmtInt(yUsers)} (${fmtPctSigned(usersDiff)})\n`;
  msg += `📄 <b>Vistas de página:</b> ${fmtInt(yViews)}\n`;
  msg += `🔥 <b>Sesiones con engagement:</b> ${fmtInt(yEngaged)}\n`;

  if (opportunities && opportunities.length > 0) {
    msg += `\n💡 <b>Top oportunidades WhatsApp (7 días)</b>\n`;
    msg += `<i>Productos consultados por el equipo pero con pocas/ninguna venta.</i>\n\n`;
    opportunities.forEach((o, i) => {
      const stockNote = o.existencias <= 0 && o.consultas > 0 ? ' ⚠️ sin stock' : '';
      msg += `${i + 1}. <b>${escHtml(o.name)}</b>\n`;
      msg += `   ${o.consultas} consultas · ${o.units_sold} ventas${stockNote}\n`;
    });
  }

  msg += `\n📈 <a href="https://sol.depositojimenez.com/metricas-web">Abrir dashboard completo</a>`;
  return msg;
}

async function authorize(req) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return { ok: true }; // si no está seteado, permitimos (dev)
  const auth = req.headers.get('authorization') || '';
  if (auth === `Bearer ${expected}`) return { ok: true };
  const url = new URL(req.url);
  if (url.searchParams.get('token') === expected) return { ok: true };
  return { ok: false };
}

export async function POST(req) {
  const authz = await authorize(req);
  if (!authz.ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return runDaily();
}

export async function GET(req) {
  // Vercel Cron usa GET por default
  const authz = await authorize(req);
  if (!authz.ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return runDaily();
}

async function runDaily() {
  try {
    if (!process.env.GA4_PROPERTY_ID || !process.env.GA4_SERVICE_ACCOUNT_JSON) {
      return NextResponse.json({ error: 'GA4 no configurado' }, { status: 503 });
    }
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      return NextResponse.json({ error: 'TELEGRAM_BOT_TOKEN no configurado' }, { status: 503 });
    }

    const summary = await buildSummary();
    const message = buildMessage(summary);
    const result = await sendTelegram(message);

    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error, message }, { status: 502 });
    }
    return NextResponse.json({ ok: true, message });
  } catch (e) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
