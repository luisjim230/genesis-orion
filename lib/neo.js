// Helper para cruzar datos de GA4 con NEO (sistema de ventas).
// Las páginas de producto en depositojimenezcr.com tienen el patrón:
//   /products/{codigo_interno}/{slug-del-producto}
// Por ejemplo: /products/5410/azulejo-oporto-verde → codigo_interno = "5410"
//
// NEO guarda las ventas en `neo_items_facturados` con:
//   codigo_interno, fecha, cantidad_facturada, cantidad_devuelta,
//   precio_unitario, item, vendedor, cliente
//
// Usamos esto para detectar "demanda WhatsApp no convertida":
// productos consultados muchas veces por el equipo (vía GA4 internal traffic)
// pero con bajas ventas reales en NEO.

import { createClient } from '@supabase/supabase-js';

let _admin;
function getAdmin() {
  if (_admin) return _admin;
  _admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  return _admin;
}

// Extrae el codigo_interno de una pagePath de GA4.
export function extractCodigoInterno(pagePath) {
  if (!pagePath) return null;
  const m = String(pagePath).match(/\/products\/([^\/]+)/i);
  if (!m) return null;
  return m[1].trim();
}

// Convierte un date_range del módulo (ej: "7d") a un objeto { startDate, endDate }
// como fechas ISO (YYYY-MM-DD) para query a NEO.
export function dateRangeToISO(range) {
  const today = new Date();
  const r = String(range || '7d').toLowerCase();
  const days = {
    'today': 0, 'yesterday': 1, '7d': 7, '14d': 14, '28d': 28,
    '30d': 30, '90d': 90, 'this_month': 30,
  }[r] ?? 7;

  const end = new Date(today);
  const start = new Date(today);
  if (r === 'yesterday') {
    start.setDate(start.getDate() - 1);
    end.setDate(end.getDate() - 1);
  } else if (r === 'today') {
    // start = end = hoy
  } else {
    start.setDate(start.getDate() - days);
  }

  const fmt = (d) => d.toISOString().slice(0, 10);
  return { startDate: fmt(start), endDate: fmt(end) };
}

// Dado un array de codigo_interno y un rango de fechas, devuelve un Map con
//   { codigo: { units_sold, revenue, transactions, last_sale_date } }
// Si un código no tuvo ventas en el período, no aparece en el Map (= 0 ventas).
export async function getSalesByCodigos(codigos, range) {
  const cleanCodigos = (codigos || []).map(c => String(c).trim()).filter(Boolean);
  if (cleanCodigos.length === 0) return new Map();

  const { startDate, endDate } = dateRangeToISO(range);

  const { data, error } = await getAdmin()
    .from('neo_items_facturados')
    .select('codigo_interno,cantidad_facturada,cantidad_devuelta,precio_unitario,fecha,total')
    .in('codigo_interno', cleanCodigos)
    .gte('fecha', startDate)
    .lte('fecha', endDate);

  if (error) {
    console.error('[neo] error getSalesByCodigos:', error.message);
    return new Map();
  }

  const map = new Map();
  for (const row of data || []) {
    const cod = String(row.codigo_interno || '').trim();
    if (!cod) continue;
    const cur = map.get(cod) || { units_sold: 0, revenue: 0, transactions: 0, last_sale_date: null };
    const qty = (Number(row.cantidad_facturada) || 0) - (Number(row.cantidad_devuelta) || 0);
    cur.units_sold += qty;
    cur.revenue += Number(row.total) || 0;
    cur.transactions += 1;
    if (!cur.last_sale_date || row.fecha > cur.last_sale_date) cur.last_sale_date = row.fecha;
    map.set(cod, cur);
  }
  return map;
}

// Dado un array de codigo_interno, devuelve info de cada producto desde
// la lista maestra (neo_lista_items): nombre, marca, etc.
export async function getProductsInfo(codigos) {
  const cleanCodigos = (codigos || []).map(c => String(c).trim()).filter(Boolean);
  if (cleanCodigos.length === 0) return new Map();

  const { data, error } = await getAdmin()
    .from('neo_lista_items')
    .select('codigo_interno,item,marca,categoria,existencias,precio_con_imp,ultima_venta,ultima_compra')
    .in('codigo_interno', cleanCodigos);

  if (error) {
    console.error('[neo] error getProductsInfo:', error.message);
    return new Map();
  }

  const map = new Map();
  for (const row of data || []) {
    map.set(String(row.codigo_interno || '').trim(), row);
  }
  return map;
}
