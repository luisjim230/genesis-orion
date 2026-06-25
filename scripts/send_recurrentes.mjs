#!/usr/bin/env node
/**
 * send_recurrentes.mjs
 *
 * Envía por Telegram las tareas recurrentes (pagos/obligaciones fijas) que
 * caen HOY, según el día del mes (vega_recurrentes.dia = día de hoy).
 *
 * Corre en GitHub Actions (nube), independiente de la Mac del usuario. Esto
 * garantiza la entrega aunque el daemon del reporte matutino esté caído.
 *
 * Corre de lun a sáb (domingo se omite, tienda cerrada).
 *
 * Variables de entorno requeridas:
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY (o SUPABASE_ANON_KEY)
 *   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
 */

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

const DIAS  = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];

function hoyCR() {
  const crStr = new Date().toLocaleString("en-US", { timeZone: "America/Costa_Rica" });
  return new Date(crStr);
}

function fechaHuman(d) {
  return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}, ${d.getFullYear()}`;
}

async function supaFetch(path) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const r = await fetch(url, {
    headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
  });
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`);
  return r.json();
}

function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function main() {
  const hoy = hoyCR();
  const diaMes = hoy.getDate();

  // Domingo se omite (tienda cerrada).
  if (hoy.getDay() === 0) {
    console.log("🕊️ Domingo: se omite el envío.");
    return;
  }

  const recurrentes = await supaFetch(`vega_recurrentes?dia=eq.${diaMes}&select=titulo,notas`);

  let msg = `<b>🔁 Tareas recurrentes de hoy</b>\n`;
  msg += `<i>${esc(fechaHuman(hoy))}</i>\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;

  if (recurrentes.length === 0) {
    msg += `🕊️ <i>No hay pagos ni obligaciones recurrentes para hoy (día ${diaMes}).</i>`;
  } else {
    msg += `<b>Para hoy (día ${diaMes}):</b>\n`;
    for (const r of recurrentes) {
      msg += `\n• <b>${esc(r.titulo)}</b>`;
      if (r.notas && r.notas.trim()) {
        msg += `\n   <i>${esc(r.notas)}</i>`;
      }
    }
  }

  console.log(`🔁 ${recurrentes.length} recurrentes del día ${diaMes}`);

  const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: msg,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });
  const j = await r.json();
  if (!j.ok) throw new Error(`Telegram ${j.error_code}: ${j.description}`);

  console.log("✅ Recurrentes enviadas");
}

main().catch(e => { console.error("❌", e.message); process.exit(1); });
