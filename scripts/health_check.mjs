#!/usr/bin/env node
/**
 * health_check.mjs — Monitoreo automático del sistema SOL.
 *
 * Corre cada 2h vía GitHub Actions. Verifica:
 *   1. sync_status: última sincronización <6h para ítems críticos
 *   2. /api/procesar-match responde OK (env vars OK, RLS OK, upserts OK)
 *   3. neo_items_comprados tiene datos recientes
 *
 * Si algo falla → manda mensaje a Telegram (@SOL_DJ_BOT).
 *
 * Secrets requeridos: SUPABASE_URL, SUPABASE_SERVICE_KEY,
 *                     TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, APP_URL
 */

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY,
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID,
  APP_URL = 'https://genesis-orion.vercel.app',
} = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
  console.error('Faltan secrets requeridos.');
  process.exit(1);
}

const HORAS_SYNC_CRITICO = 6;
const REPORTES_CRITICOS = ['items_comprados', 'minimos_maximos'];

async function supaGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`Supabase ${path}: ${res.status}`);
  return res.json();
}

async function telegram(text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });
}

function horasAtras(iso) {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / 3600_000;
}

const alertas = [];

// 1. Última sincronización de reportes críticos
try {
  const rows = await supaGet(
    `sync_status?id=in.(${REPORTES_CRITICOS.join(',')})&select=id,ultima_sync,exitoso`,
  );
  for (const r of rows) {
    const h = horasAtras(r.ultima_sync);
    if (h > HORAS_SYNC_CRITICO) {
      alertas.push(
        `🔴 <b>${r.id}</b> sin sincronizar hace <b>${h.toFixed(1)}h</b> (último: ${r.ultima_sync || 'nunca'})`,
      );
    } else if (r.exitoso === false) {
      alertas.push(`⚠️ <b>${r.id}</b> falló en la última sincronización`);
    }
  }
} catch (e) {
  alertas.push(`🔴 Error consultando <code>sync_status</code>: ${e.message}`);
}

// 2. /api/procesar-match: debe devolver 200 con campo "persistidos"
try {
  const res = await fetch(`${APP_URL}/api/procesar-match`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
    redirect: 'follow',
  });
  const body = await res.json();
  if (!res.ok || body.error) {
    alertas.push(
      `🔴 <b>/api/procesar-match</b> devolvió error ${res.status}: <code>${body.error || 'sin mensaje'}</code>\n💡 Revisá env vars en Vercel (SUPABASE_SERVICE_ROLE_KEY)`,
    );
  } else if (body.persistidos === undefined) {
    // Versión vieja desplegada — no propaga persistencia
    alertas.push(
      `⚠️ <b>/api/procesar-match</b> corre pero no reporta <code>persistidos</code>. Deploy viejo en Vercel — hay que redeployear.`,
    );
  }
} catch (e) {
  alertas.push(`🔴 <b>/api/procesar-match</b> no respondió: ${e.message}`);
}

// 3. Frescura de compras NEO
try {
  const rows = await supaGet(
    'neo_items_comprados?select=fecha_carga&order=fecha_carga.desc&limit=1',
  );
  if (!rows.length) {
    alertas.push('🔴 <b>neo_items_comprados</b> está vacía');
  } else {
    const h = horasAtras(rows[0].fecha_carga);
    if (h > HORAS_SYNC_CRITICO) {
      alertas.push(
        `🔴 Snapshot de <b>neo_items_comprados</b> tiene ${h.toFixed(1)}h de antigüedad`,
      );
    }
  }
} catch (e) {
  alertas.push(`🔴 Error consultando <code>neo_items_comprados</code>: ${e.message}`);
}

// Resultado
if (alertas.length === 0) {
  console.log('✅ Todos los checks OK');
  process.exit(0);
}

const mensaje =
  `<b>🚨 SOL Health Check — alertas</b>\n\n` +
  alertas.map((a, i) => `${i + 1}. ${a}`).join('\n\n') +
  `\n\n⏰ ${new Date().toLocaleString('es-CR', { timeZone: 'America/Costa_Rica' })}`;

console.error(mensaje);
await telegram(mensaje);
process.exit(1);
