#!/usr/bin/env node
/**
 * health_check.mjs — Monitoreo automático del sistema SOL.
 *
 * Corre 3×/día (8am, 1pm y 4pm CR) vía GitHub Actions. Verifica:
 *   1. sync_status: cada reporte crítico corrió en su horario esperado
 *      (y no quedó marcado como fallido por el daemon)
 *   2. /api/procesar-match responde OK (env vars OK, RLS OK, upserts OK)
 *   3. neo_items_comprados tiene datos recientes
 *   4. neo_lista_items.ultima_venta tiene ventas de los últimos días
 *      (detecta mismatch tipo "última venta dic-2025" cuando en realidad
 *      hubo ventas más recientes pero el reporte Lista de ítems no se
 *      sincronizó o NEO no refrescó las fechas resumen)
 *   5. cola_neo_uploads: sin filas stuck en error (3+ intentos) ni
 *      pendientes viejas (>3h sin procesar) — detecta que las OC de SOL
 *      llegan y el daemon com.sol.sync-daemon las sube a NEO.
 *
 * Si algo falla → manda mensaje a Telegram (@SOL_DJ_BOT).
 *
 * Secrets requeridos: SUPABASE_URL, SUPABASE_SERVICE_KEY,
 *                     TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, APP_URL
 */

import { writeFileSync } from 'node:fs';

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

// Backstop absoluto para reportes sin horario declarado abajo.
const HORAS_SYNC_CRITICO = 30;
const DIAS_MAX_SIN_VENTAS = 4; // si hace 4+ días sin ventas cargadas, algo pasa
const REPORTES_CRITICOS = ['items_comprados', 'items_lista_general', 'minimos_maximos'];

// Horarios (hora CR) en que el daemon de la Mac corre cada reporte — mismos
// valores que SCHEDULE en scripts/sync_daemon.py. Si un horario ya venció hace
// más de GRACIA_HORAS y sync_status sigue con una hora ANTERIOR a ese horario,
// esa corrida no pasó → alerta.
// Antes se miraba solo un umbral plano de 30h: un reporte que corre 3×/día podía
// estar caído más de un día entero sin que nadie se enterara.
const SLOTS_ESPERADOS = {
  minimos_maximos: [[8, 5], [12, 5], [16, 5]],
  items_lista_general: [[8, 0], [12, 0], [16, 0]],
  items_comprados: [[10, 0], [16, 0]],
};
const GRACIA_HORAS = 2;      // margen: NEO es lento y los reportes corren en fila
const CR_OFFSET_H = 6;       // Costa Rica = UTC-6 todo el año (sin horario de verano)

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

/** Último horario esperado (en ms UTC) que ya venció con la gracia cumplida.
 *  Salta los domingos, igual que el scheduler del daemon. */
function ultimoSlotEsperado(slots, ahora = Date.now()) {
  for (let d = 0; d < 8; d++) {
    // Fecha calendario en CR del día que estamos mirando.
    const cr = new Date(ahora - d * 86_400_000 - CR_OFFSET_H * 3_600_000);
    if (cr.getUTCDay() === 0) continue; // domingo: el daemon no corre
    const vencidos = slots
      .map(([h, m]) =>
        Date.UTC(cr.getUTCFullYear(), cr.getUTCMonth(), cr.getUTCDate(), h + CR_OFFSET_H, m),
      )
      .filter((t) => t + GRACIA_HORAS * 3_600_000 <= ahora)
      .sort((a, b) => b - a);
    if (vencidos.length) return vencidos[0];
  }
  return null;
}

/** "16:05 del 24/8" — para que la alerta diga qué corrida se saltó. */
function fmtCR(ms) {
  const d = new Date(ms - CR_OFFSET_H * 3_600_000);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm} del ${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
}

const alertas = [];

// 1. Última sincronización de reportes críticos
try {
  const rows = await supaGet(
    `sync_status?id=in.(${REPORTES_CRITICOS.join(',')})&select=id,ultima_sync,exitoso`,
  );
  for (const r of rows) {
    const h = horasAtras(r.ultima_sync);
    const slot = SLOTS_ESPERADOS[r.id] ? ultimoSlotEsperado(SLOTS_ESPERADOS[r.id]) : null;
    const ultima = r.ultima_sync ? new Date(r.ultima_sync).getTime() : 0;

    if (slot !== null && ultima < slot) {
      alertas.push(
        `🔴 <b>${r.id}</b> se saltó la corrida de las ${fmtCR(slot)} — última sync hace <b>${h.toFixed(1)}h</b> (${r.ultima_sync || 'nunca'})`,
      );
    } else if (h > HORAS_SYNC_CRITICO) {
      alertas.push(
        `🔴 <b>${r.id}</b> sin sincronizar hace <b>${h.toFixed(1)}h</b> (último: ${r.ultima_sync || 'nunca'})`,
      );
    }
    // Independiente de la frescura: el daemon marca exitoso=false cuando el
    // downloader revienta, aunque ultima_sync siga siendo reciente.
    if (r.exitoso === false) {
      alertas.push(`⚠️ <b>${r.id}</b> falló en la última corrida (el daemon la marcó como fallida)`);
    }
  }
} catch (e) {
  alertas.push(`🔴 Error consultando <code>sync_status</code>: ${e.message}`);
}

// 2. /api/procesar-match: debe devolver 200 con campo "persistidos"
try {
  const res = await fetch(`${APP_URL}/api/procesar-match`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-sol-key': SUPABASE_SERVICE_KEY },
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

// 4. Frescura de ventas NEO — detecta el bug tipo "última venta dic-2025"
// El reporte "Lista de ítems" (tabla neo_lista_items) es el que alimenta
// la columna "Última Venta" de la UI de Inteligencia. Si la venta más
// reciente registrada ahí tiene más de DIAS_MAX_SIN_VENTAS días, el sync
// se está rompiendo o NEO dejó de refrescar el reporte resumen.
try {
  const rows = await supaGet(
    'neo_lista_items?select=ultima_venta&order=ultima_venta.desc.nullslast&limit=1',
  );
  if (!rows.length) {
    alertas.push('🔴 <b>neo_lista_items</b> está vacía — la UI no va a poder mostrar últimas ventas');
  } else {
    const fechaRaw = rows[0].ultima_venta;
    if (!fechaRaw) {
      alertas.push('🔴 <b>neo_lista_items.ultima_venta</b> no tiene ningún valor — revisá el sync del reporte Lista de ítems');
    } else {
      const fechaMax = new Date(fechaRaw);
      if (isNaN(fechaMax.getTime())) {
        alertas.push(`⚠️ Fecha ilegible en <b>neo_lista_items.ultima_venta</b>: <code>${fechaRaw}</code>`);
      } else {
        const diasSinVentas = Math.floor((Date.now() - fechaMax.getTime()) / 86400000);
        if (diasSinVentas > DIAS_MAX_SIN_VENTAS) {
          alertas.push(
            `🔴 La venta más reciente en <b>neo_lista_items</b> es del <b>${fechaRaw}</b> (${diasSinVentas} días atrás).\n` +
            `💡 El reporte "Lista de ítems" no está trayendo ventas recientes. ` +
            `Revisá el LaunchAgent <code>com.sol.neo-lista-items</code> o corré <code>python3 scripts/neo_lista_items_downloader.py</code> manualmente.`,
          );
        }
      }
    }
  }
} catch (e) {
  alertas.push(`🔴 Error consultando <code>neo_lista_items</code>: ${e.message}`);
}

// 5. Pipeline de OC: SOL → cola_neo_uploads → NEO
// Cubre dos fallas: (a) OCs stuck en error con 3+ intentos (daemon no
// las puede reintentar) y (b) OCs pendientes viejas (daemon no está
// consumiendo la cola).
try {
  const stuckError = await supaGet(
    'cola_neo_uploads?select=id,numero_sol,detalle,intentos&estado=eq.error&intentos=gte.3&limit=5',
  );
  if (stuckError.length > 0) {
    const detalle = stuckError
      .map(r => `<code>${r.numero_sol || r.id}</code>${r.detalle ? ' — ' + r.detalle.slice(0, 80) : ''}`)
      .join('\n   ');
    alertas.push(
      `🔴 <b>${stuckError.length}</b> OC stuck en <code>cola_neo_uploads</code> con 3+ intentos fallidos:\n   ${detalle}\n` +
      `💡 Revisá el log del uploader en la Mac: <code>tail -100 ~/Documents/neo-sync/oc-uploader.log</code>`,
    );
  }

  const hace3h = new Date(Date.now() - 3 * 3600_000).toISOString();
  const stuckPend = await supaGet(
    `cola_neo_uploads?select=id,numero_sol,created_at&estado=eq.pendiente&created_at=lt.${hace3h}&limit=5`,
  );
  if (stuckPend.length > 0) {
    const detalle = stuckPend
      .map(r => `<code>${r.numero_sol || r.id}</code> (${r.created_at})`)
      .join('\n   ');
    alertas.push(
      `🔴 <b>${stuckPend.length}</b> OC pendientes sin procesar hace >3h:\n   ${detalle}\n` +
      `💡 El daemon <code>com.sol.sync-daemon</code> no está corriendo. En la Mac: <code>launchctl list | grep com.sol.sync-daemon</code>`,
    );
  }
} catch (e) {
  alertas.push(`🔴 Error consultando <code>cola_neo_uploads</code>: ${e.message}`);
}

// 6. Latido del sync-daemon: escribe un heartbeat en daemon_heartbeat cada ~60s.
// Si está viejo (>90 min), el daemon murió y KeepAlive no pudo levantarlo
// (ej. la M1 apagada o sin red). Es la red de seguridad final.
try {
  const rows = await supaGet('daemon_heartbeat?select=last_beat&limit=1');
  const beat = rows.length ? rows[0].last_beat : null;
  const min = beat ? (Date.now() - new Date(beat).getTime()) / 60000 : Infinity;
  if (min > 90) {
    alertas.push(
      `🔴 El <b>sync-daemon</b> de la M1 no late hace <b>${isFinite(min) ? min.toFixed(0) + ' min' : 'nunca'}</b> (último latido: ${beat || 'nunca'}).\n` +
      `💡 El servidor M1 puede estar apagado/sin red, o el daemon caído. Revisá la M1 y: <code>launchctl kickstart -k gui/$(id -u)/com.sol.sync-daemon</code>`,
    );
  }
} catch (e) {
  alertas.push(`🔴 Error consultando <code>daemon_heartbeat</code>: ${e.message}`);
}

// 7. Anti-duplicación: las tablas con clave única de negocio NO deben tener
// duplicados reales (sin NULL). Si aparecen, dos procesos están subiendo doble
// (lo que pasó con el cron oculto de la M2). La función cuenta por clave natural.
try {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/sol_duplicados_criticos`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  if (!res.ok) throw new Error(`rpc HTTP ${res.status}`);
  const dup = await res.json();
  const tablas = [
    ['neo_items_facturados (ventas)', dup.facturados],
    ['neo_movimientos_contables', dup.movimientos],
    ['neo_lista_items', dup.lista],
  ];
  for (const [t, n] of tablas) {
    if (n > 0) {
      alertas.push(
        `🔴 <b>DUPLICADOS</b> en <b>${t}</b>: ${n} grupo(s) repetido(s) por clave de negocio.\n` +
        `💡 Algo está subiendo doble (¿dos procesos/máquinas a la vez?). Revisá el daemon y que no haya otro uploader/sync corriendo.`,
      );
    }
  }
} catch (e) {
  alertas.push(`🔴 Error consultando duplicados (<code>sol_duplicados_criticos</code>): ${e.message}`);
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
// Respaldo (regla #8): dejar el mensaje en un archivo para que el workflow lo
// mande también por EMAIL — 2º canal, por si Telegram está caído.
try { writeFileSync('health-alert.txt', mensaje); } catch { /* no crítico */ }
await telegram(mensaje);
process.exit(1);
