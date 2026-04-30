#!/usr/bin/env node
/**
 * check_stock_alert.mjs
 *
 * Verifica el stock del producto AKIRO AISLANTE FIBRA DE VIDRIO.
 * Si las existencias están en o por debajo del umbral, manda alerta por Telegram.
 *
 * Corre Lun-Sáb 9:30am y 4:30pm hora Costa Rica (después de cada sync NEO).
 *
 * Variables de entorno:
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY (o SUPABASE_ANON_KEY)
 *   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
 */

const PRODUCTOS_VIGILADOS = [
  {
    codigo: "351100300992504",
    nombre: "AKIRO AISLANTE FIBRA DE VIDRIO 2 1/2 — 3 ROLLOS 40CM × 15m (R8)",
    umbral: 340,
  },
];

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY,
  SUPABASE_ANON_KEY,
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID,
} = process.env;

const SUPA_KEY = SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPA_KEY) throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_KEY");
if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) throw new Error("Missing TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID");

async function supaFetch(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
  });
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`);
  return r.json();
}

async function telegram(text) {
  const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });
  const j = await r.json();
  if (!j.ok) throw new Error(`Telegram ${j.error_code}: ${j.description}`);
}

function fmtFecha(iso) {
  const d = new Date(iso);
  return d.toLocaleString("es-CR", { timeZone: "America/Costa_Rica" });
}

async function main() {
  const alertas = [];

  for (const prod of PRODUCTOS_VIGILADOS) {
    const rows = await supaFetch(
      `neo_minimos_maximos?codigo=eq.${prod.codigo}&select=existencias,fecha_carga,promedio_mensual,ultima_compra,ultimo_proveedor&order=fecha_carga.desc&limit=1`
    );
    if (rows.length === 0) {
      console.error(`⚠️ ${prod.codigo} no encontrado en Supabase`);
      continue;
    }
    const r = rows[0];
    const existencias = Math.floor(r.existencias || 0);
    const fechaCarga = fmtFecha(r.fecha_carga);
    const promMensual = Math.round(r.promedio_mensual || 0);
    const ultCompra = r.ultima_compra || "—";
    const ultProv = (r.ultimo_proveedor || "—").trim();

    console.log(`📦 ${prod.codigo} → ${existencias} u. (umbral ${prod.umbral})`);

    if (existencias <= prod.umbral) {
      const diasRestantes = promMensual > 0
        ? Math.round(existencias / (promMensual / 30))
        : null;
      alertas.push(
        `📦 <b>${prod.nombre}</b>\n` +
        `\n` +
        `🔴 <b>${existencias} unidades</b> · umbral ${prod.umbral}\n` +
        (diasRestantes !== null
          ? `⏱ Quedan aprox. <b>${diasRestantes} días</b> al ritmo actual (${promMensual}/mes)\n`
          : ``) +
        `\n` +
        `🛒 Última compra: ${ultCompra}\n` +
        `🏭 Proveedor: ${ultProv}\n` +
        `📅 Datos al ${fechaCarga}`
      );
    }
  }

  if (alertas.length === 0) {
    console.log("✅ Todos los productos vigilados arriba del umbral");
    return;
  }

  const msg = `<b>⚠️ Stock bajo</b>\n\n${alertas.join("\n\n━━━━━━━━━━━━━━━━━━━━\n\n")}`;
  await telegram(msg);
  console.log(`✅ Alerta enviada: ${alertas.length} producto(s)`);
}

main().catch(e => { console.error("❌", e.message); process.exit(1); });
