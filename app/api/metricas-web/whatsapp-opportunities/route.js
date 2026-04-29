// Endpoint que cruza la actividad interna del equipo en GA4 con las ventas reales
// de NEO (`neo_items_facturados`) para detectar "demanda WhatsApp no convertida":
// productos que el equipo consultó muchas veces (= clientes preguntan) pero que
// se vendieron poco o nada en el período.
//
// Query params:
//   date_range (default 30d): rango temporal. Mismo rango aplica a GA4 (consultas
//     internas) y a NEO (ventas).
//
// Devuelve:
//   {
//     ok: true,
//     data: [
//       {
//         codigo_interno, product_name, marca, categoria, existencias,
//         consultas, units_sold, revenue, conversion_score,
//         opportunity_score, last_sale_date, ga4_path
//       },
//       ...
//     ]
//   }
//
// `opportunity_score` = consultas / (units_sold + 1). Más alto = más "oportunidad".
import { NextResponse } from 'next/server';
import {
  getGA4Client, getPropertyResource, buildTrafficFilter, parseDateRange,
} from '../../../../lib/ga4';
import { extractCodigoInterno, getSalesByCodigos, getProductsInfo } from '../../../../lib/neo';

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

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const date_range = (searchParams.get('date_range') || '30d').trim();

    if (!process.env.GA4_PROPERTY_ID || !process.env.GA4_SERVICE_ACCOUNT_JSON) {
      return NextResponse.json({ error: 'GA4 no está configurado' }, { status: 503 });
    }

    const client = getGA4Client();
    const property = getPropertyResource();

    // 1) Pedimos a GA4 los productos consultados por el equipo (traffic_filter=internal).
    const dr = parseDateRange(date_range);
    const internalFilter = buildTrafficFilter('internal');
    // Excluye SOL — solo cuenta navegación en el sitio público.
    const publicHostFilter = {
      filter: {
        fieldName: 'hostName',
        stringFilter: { matchType: 'CONTAINS', value: 'depositojimenezcr.com', caseSensitive: false },
      },
    };
    const productFilter = {
      filter: {
        fieldName: 'pagePath',
        stringFilter: { matchType: 'CONTAINS', value: '/products/', caseSensitive: false },
      },
    };
    const dimensionFilter = { andGroup: { expressions: [internalFilter, publicHostFilter, productFilter] } };

    let topInternal = [];
    let filterFallback = false;
    try {
      const [resp] = await client.runReport({
        property,
        dateRanges: [dr],
        dimensions: [{ name: 'pagePath' }, { name: 'pageTitle' }],
        metrics: [{ name: 'screenPageViews' }, { name: 'sessions' }],
        orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
        limit: 100,
        dimensionFilter,
      });
      topInternal = rowsToObjects(resp);
    } catch (e) {
      const msg = String(e?.message || e);
      if (/not a valid dimension/i.test(msg) && /traffic_type/i.test(msg)) {
        // Fallback: la dimensión todavía no se reconoce. Devolvemos array vacío
        // con flag, así la UI puede avisar.
        filterFallback = true;
        topInternal = [];
      } else {
        throw e;
      }
    }

    // 2) Extraemos codigo_interno de cada pagePath.
    const productEntries = topInternal.map(p => ({
      path: p.pagePath,
      title: p.pageTitle,
      consultas: Number(p.screenPageViews) || 0,
      sessions_internas: Number(p.sessions) || 0,
      codigo_interno: extractCodigoInterno(p.pagePath),
    })).filter(p => p.codigo_interno);

    const codigos = [...new Set(productEntries.map(p => p.codigo_interno))];

    // 3) Buscamos en NEO las ventas y el catálogo en paralelo.
    const [salesMap, infoMap] = await Promise.all([
      getSalesByCodigos(codigos, date_range),
      getProductsInfo(codigos),
    ]);

    // 4) Combinamos.
    const merged = productEntries.map(p => {
      const sales = salesMap.get(p.codigo_interno) || { units_sold: 0, revenue: 0, transactions: 0, last_sale_date: null };
      const info = infoMap.get(p.codigo_interno) || {};
      const opportunity_score = p.consultas / (sales.units_sold + 1);
      // conversion_rate: ventas por consulta. Cuanto más bajo, peor convierte.
      const conversion_rate = p.consultas > 0 ? sales.units_sold / p.consultas : 0;
      return {
        codigo_interno: p.codigo_interno,
        ga4_path: p.path,
        product_name: info.item || p.title || p.codigo_interno,
        marca: info.marca || null,
        categoria: info.categoria || null,
        existencias: Number(info.existencias) || 0,
        precio: Number(info.precio_con_imp) || null,
        ultima_venta: info.ultima_venta || null,
        last_sale_date: sales.last_sale_date,
        consultas: p.consultas,
        sessions_internas: p.sessions_internas,
        units_sold: sales.units_sold,
        revenue: sales.revenue,
        transactions: sales.transactions,
        conversion_rate,
        opportunity_score,
      };
    });

    // Ordenar por opportunity_score descendente (más oportunidad arriba).
    merged.sort((a, b) => b.opportunity_score - a.opportunity_score);

    return NextResponse.json({
      ok: true,
      filter_fallback: filterFallback,
      date_range,
      total_products: merged.length,
      data: merged,
    });
  } catch (e) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
