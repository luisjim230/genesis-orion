#!/usr/bin/env node
/**
 * send_pricing_alerts.mjs
 *
 * Job diario que detecta erosión de margen en SKUs clase A y envía alerta
 * por Telegram al chat operativo. Cada alerta queda guardada en
 * pricing_alertas_log para historial.
 *
 * Lógica:
 *   1. Calcula margen ponderado de los últimos 30 días vía pricing_dataset
 *   2. Calcula margen baseline ponderado de los últimos 90 días previos
 *      al período corto (90d previos al -30d).
 *   3. Para cada SKU clase A (Pareto del baseline 90d), si margen actual
 *      cayó >= 3pp respecto al baseline, lo registra y lo manda por Telegram.
 *   4. Compara con alertas enviadas en los últimos 7 días para no spamear.
 *
 * Variables de entorno requeridas:
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY
 *   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
 */

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY,
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID,
} = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) throw new Error('Missing SUPABASE_URL / SUPABASE_SERVICE_KEY');
if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) throw new Error('Missing TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID');

const CAIDA_MIN_PP = 3;
const CLASE_A_PCT = 0.80;

function fmtDate(d) { return d.toISOString().slice(0, 10); }
function fmtCRC(n) {
  const v = Number(n) || 0;
  return '₡' + v.toLocaleString('es-CR', { maximumFractionDigits: 0 });
}
function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function rpc(name, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`RPC ${name} ${r.status}: ${await r.text()}`);
  return r.json();
}

async function fetchTable(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
  });
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`);
  return r.json();
}

async function insertLogs(rows) {
  if (rows.length === 0) return;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/pricing_alertas_log`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(rows),
  });
  if (!r.ok) throw new Error(`Insert log ${r.status}: ${await r.text()}`);
}

async function sendTelegram(text) {
  const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });
  const j = await r.json();
  if (!j.ok) throw new Error(`Telegram ${j.error_code}: ${j.description}`);
}

function clasificarA(rows, metric) {
  const sorted = [...rows].sort((a, b) => Number(b[metric] || 0) - Number(a[metric] || 0));
  const total = sorted.reduce((s, r) => s + Number(r[metric] || 0), 0);
  let acum = 0;
  const claseA = new Set();
  for (const r of sorted) {
    acum += Number(r[metric] || 0);
    claseA.add(r.codigo_interno);
    if (total > 0 && acum / total >= CLASE_A_PCT) break;
  }
  return claseA;
}

async function main() {
  const today = new Date();
  const end = fmtDate(today);
  const start30 = fmtDate(new Date(today.getTime() - 30 * 86400000));
  const start120 = fmtDate(new Date(today.getTime() - 120 * 86400000));
  const end120 = fmtDate(new Date(today.getTime() - 31 * 86400000));

  console.log(`Pricing alerts run: actual ${start30}..${end} · baseline ${start120}..${end120}`);

  const [actual, baseline] = await Promise.all([
    rpc('pricing_dataset', { p_start: start30,  p_end: end }),
    rpc('pricing_dataset', { p_start: start120, p_end: end120 }),
  ]);

  const claseA = clasificarA(baseline, 'venta_neta');
  const baselineMap = Object.fromEntries(baseline.map(r => [r.codigo_interno, r]));
  const thresholdRows = await fetchTable('pricing_thresholds_skus?select=codigo_interno,margen_minimo_pct');
  const thresholds = Object.fromEntries(thresholdRows.map(t => [t.codigo_interno, Number(t.margen_minimo_pct)]));

  const last7 = fmtDate(new Date(today.getTime() - 7 * 86400000));
  const recent = await fetchTable(`pricing_alertas_log?fecha_alerta=gte.${last7}&select=codigo_interno`);
  const recentSet = new Set(recent.map(r => r.codigo_interno));

  const alertas = [];
  for (const r of actual) {
    if (!claseA.has(r.codigo_interno)) continue;
    if (recentSet.has(r.codigo_interno)) continue;
    const base = baselineMap[r.codigo_interno];
    const margenActual = Number(r.margen_pct || 0);
    let margenBaseline;
    if (typeof thresholds[r.codigo_interno] === 'number') {
      margenBaseline = thresholds[r.codigo_interno];
    } else if (base && base.margen_pct != null) {
      margenBaseline = Number(base.margen_pct);
    } else {
      continue;
    }
    const caida = margenBaseline - margenActual;
    if (caida >= CAIDA_MIN_PP) {
      alertas.push({
        codigo_interno: r.codigo_interno,
        nombre: (r.nombre || '').slice(0, 200),
        categoria: r.categoria,
        margen_baseline_pct: Number(margenBaseline.toFixed(2)),
        margen_actual_pct: Number(margenActual.toFixed(2)),
        caida_pp: Number(caida.toFixed(2)),
        venta_periodo: Number(r.venta_neta || 0),
        utilidad_periodo: Number(r.utilidad_neta || 0),
        enviada_telegram: false,
      });
    }
  }

  alertas.sort((a, b) => b.caida_pp - a.caida_pp);
  console.log(`${alertas.length} alertas detectadas`);

  if (alertas.length === 0) {
    console.log('Sin alertas hoy. No se manda Telegram.');
    return;
  }

  // Mensaje Telegram (top 10)
  const top = alertas.slice(0, 10);
  let msg = `🚨 <b>PRICING — Alertas de erosión de margen</b>\n`;
  msg += `<i>${end} · ${alertas.length} SKUs clase A con caída ≥${CAIDA_MIN_PP}pp</i>\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;
  for (const a of top) {
    msg += `<b>${esc(a.codigo_interno)}</b> ${esc((a.nombre || '').slice(0, 50))}\n`;
    msg += `  Margen: ${a.margen_baseline_pct}% → <b>${a.margen_actual_pct}%</b> `;
    msg += `(<b>-${a.caida_pp.toFixed(1)}pp</b>)\n`;
    msg += `  Venta 30d: ${fmtCRC(a.venta_periodo)} · Utilidad: ${fmtCRC(a.utilidad_periodo)}\n\n`;
  }
  if (alertas.length > 10) msg += `<i>+${alertas.length - 10} más en SOL → Pricing → Alertas</i>\n`;

  await sendTelegram(msg);
  alertas.forEach(a => { a.enviada_telegram = true; });
  await insertLogs(alertas);

  console.log(`✅ ${alertas.length} alertas enviadas + logueadas`);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
