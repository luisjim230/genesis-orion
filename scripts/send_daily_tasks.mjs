#!/usr/bin/env node
/**
 * send_daily_tasks.mjs
 *
 * Envía por Telegram las tareas del día a las 10:00 AM hora Costa Rica.
 * Incluye:
 *   - Tareas activas (vega_tareas con estado='activa')
 *   - Tareas recurrentes que caen hoy (vega_recurrentes con dia = día del mes)
 *
 * Corre de lun a sáb (domingo se omite).
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

// Prioridad: emoji viene embebido en el texto. Orden: Alta > Media > Baja > otros.
function prioridadOrden(p) {
  if (!p) return 9;
  const s = p.toLowerCase();
  if (s.includes("alta"))  return 1;
  if (s.includes("media")) return 2;
  if (s.includes("baja"))  return 3;
  return 9;
}

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
  const diaSem = hoy.getDay();

  const [activas, recurrentes] = await Promise.all([
    supaFetch(`vega_tareas?estado=eq.activa&select=titulo,prioridad,notas,creada`),
    supaFetch(`vega_recurrentes?dia=eq.${diaMes}&select=titulo,notas`),
  ]);

  activas.sort((a, b) => prioridadOrden(a.prioridad) - prioridadOrden(b.prioridad));

  // Construir mensaje HTML
  let msg = `<b>📋 Tareas del día</b>\n`;
  msg += `<i>${esc(fechaHuman(hoy))}</i>\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;

  if (activas.length === 0 && recurrentes.length === 0) {
    msg += `🕊️ <i>No hay tareas pendientes para hoy.</i>`;
  } else {
    if (activas.length > 0) {
      msg += `<b>Pendientes (${activas.length})</b>\n`;
      for (const t of activas) {
        msg += `\n${esc(t.prioridad || "·")}  <b>${esc(t.titulo)}</b>`;
        if (t.notas && t.notas.trim()) {
          msg += `\n   <i>${esc(t.notas)}</i>`;
        }
        msg += `\n`;
      }
    }

    if (recurrentes.length > 0) {
      if (activas.length > 0) msg += `\n━━━━━━━━━━━━━━━━━━━━\n\n`;
      msg += `<b>🔁 Recurrentes de hoy (día ${diaMes})</b>\n`;
      for (const r of recurrentes) {
        msg += `\n• <b>${esc(r.titulo)}</b>`;
        if (r.notas && r.notas.trim()) {
          msg += `  <i>${esc(r.notas)}</i>`;
        }
      }
    }
  }

  console.log(`📋 ${activas.length} activas · ${recurrentes.length} recurrentes del día ${diaMes}`);

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

  console.log("✅ Tareas enviadas");
}

main().catch(e => { console.error("❌", e.message); process.exit(1); });
