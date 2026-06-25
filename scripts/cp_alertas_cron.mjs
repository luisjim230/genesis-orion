#!/usr/bin/env node
/**
 * cp_alertas_cron.mjs
 *
 * Job diario del módulo Compras a Proveedor. Llama a la función SQL
 * cp_generar_alertas() (idempotente) que detecta:
 *   - PAGO_SIN_FACTURA / PAGO_SIN_FACTURA_CRITICO
 *   - COMPRA_SIN_PAGO
 *   - COTIZACION_VENCIDA
 *   - FACTURA_HUERFANA
 * y devuelve SÓLO las alertas nuevas de esta corrida. Si hay nuevas, manda un
 * resumen por Telegram. Si no hay nada nuevo, no molesta.
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
} = process.env

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) throw new Error('Missing SUPABASE_URL / SUPABASE_SERVICE_KEY')

const TIPO_LABEL = {
  PAGO_SIN_FACTURA: 'Pago sin factura',
  PAGO_SIN_FACTURA_CRITICO: 'Pago sin factura (crítico)',
  COMPRA_SIN_PAGO: 'Compra sin pago',
  COTIZACION_VENCIDA: 'Cotización vencida',
  DISCREPANCIA_MONTO: 'Discrepancia de monto',
  FACTURA_HUERFANA: 'Factura huérfana',
}
const SEV_EMOJI = { ALTA: '🔴', MEDIA: '🟠', BAJA: '🟡' }

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

async function rpc(name) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
    body: JSON.stringify({}),
  })
  if (!r.ok) throw new Error(`RPC ${name} ${r.status}: ${await r.text()}`)
  return r.json()
}

async function sendTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log('Telegram no configurado; se omite el envío.')
    return
  }
  const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: 'HTML', disable_web_page_preview: true }),
  })
  const j = await r.json()
  if (!j.ok) throw new Error(`Telegram ${j.error_code}: ${j.description}`)
}

async function main() {
  const nuevas = await rpc('cp_generar_alertas')
  console.log(`${nuevas.length} alertas nuevas`)
  if (!nuevas.length) {
    console.log('Sin novedades. No se manda Telegram.')
    return
  }

  const porSev = { ALTA: [], MEDIA: [], BAJA: [] }
  for (const a of nuevas) (porSev[a.severidad] || porSev.MEDIA).push(a)

  let msg = `🧾 <b>COMPRAS A PROVEEDOR — Alertas nuevas</b>\n`
  msg += `<i>${nuevas.length} alerta(s) detectada(s) hoy</i>\n`
  msg += `━━━━━━━━━━━━━━━━━━━━\n`
  for (const sev of ['ALTA', 'MEDIA', 'BAJA']) {
    const arr = porSev[sev]
    if (!arr.length) continue
    msg += `\n${SEV_EMOJI[sev]} <b>${sev}</b> (${arr.length})\n`
    for (const a of arr.slice(0, 12)) {
      msg += `• ${esc(TIPO_LABEL[a.tipo] || a.tipo)}: ${esc(a.mensaje)}\n`
    }
    if (arr.length > 12) msg += `  <i>+${arr.length - 12} más…</i>\n`
  }
  msg += `\n👉 SOL → Compras a Proveedor → Alertas`

  await sendTelegram(msg)
  console.log('✅ Resumen enviado por Telegram')
}

main().catch(e => { console.error('❌', e.message); process.exit(1) })
