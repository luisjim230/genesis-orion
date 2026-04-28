// Helper para enviar mensajes a Telegram desde el backend.
// Usa las mismas variables de entorno que ya tiene el resto del sistema:
//   TELEGRAM_BOT_TOKEN
//   TELEGRAM_CHAT_ID_METRICAS  (chat dedicado a alertas de Métricas Web,
//                               cae a TELEGRAM_CHAT_ID si no está definido)
//
// El mensaje se envía con parse_mode HTML.

export async function sendTelegram(message, opts = {}) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = opts.chatId
    || process.env.TELEGRAM_CHAT_ID_METRICAS
    || process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    return { ok: false, error: 'TELEGRAM_BOT_TOKEN o chat_id no configurados' };
  }
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
    const j = await r.json();
    if (!j.ok) return { ok: false, error: `Telegram ${j.error_code}: ${j.description}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// Escape HTML para evitar inyección en mensajes con datos dinámicos.
export function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
