#!/usr/bin/env node
/**
 * GUARDIÁN DE SEGURIDAD — corre solo todos los días y avisa por Telegram.
 *
 * Existe porque el 27/8/2026 se descubrió que los datos de SOL (contabilidad,
 * planilla, bancos, usuarios) estaban abiertos a internet sin login, y nadie se
 * enteró hasta que un empleado comentó de pasada que veía algo que no le tocaba.
 * Depender de que a alguien se le ocurra pedir una revisión no es un control.
 *
 * Este script intenta ACTIVAMENTE entrar como un extraño y grita si entra.
 * No revisa configuración: prueba de verdad, contra producción.
 *
 * Qué prueba, sin login y con la clave pública que cualquiera saca del
 * navegador:
 *   1. Leer las tablas sensibles por la API de la base.
 *   2. Escribir en ellas.
 *   3. Leer las vistas que resumen plata (estado de resultados, etc.).
 *   4. Pegarle a las rutas /api que devuelven datos.
 *   5. Crear un usuario administrador.
 *   6. Disparar los refresh pesados que barren cientos de miles de filas.
 * Y al revés, que lo que TIENE que funcionar siga funcionando:
 *   7. Login, Club y Rifa en pie.
 *
 * Sale con código 1 si algo se abrió, para que el workflow quede en rojo.
 *
 * Env: SUPABASE_URL, SUPABASE_ANON_KEY, APP_URL, TELEGRAM_BOT_TOKEN,
 *      TELEGRAM_CHAT_ID
 */

const {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_KEY,
  APP_URL = 'https://sol.depositojimenez.com',
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID,
} = process.env;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Faltan SUPABASE_URL o SUPABASE_ANON_KEY');
  process.exit(1);
}

const anon = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` };
const SERVICE_KEY = SUPABASE_SERVICE_KEY;
const huecos = [];
const rotos = [];

const t = (ms) => AbortSignal.timeout(ms);

async function pedir(url, opts = {}, ms = 20000) {
  try {
    return await fetch(url, { ...opts, signal: t(ms), cache: 'no-store' });
  } catch (e) {
    return { ok: false, status: 0, _err: e.message };
  }
}

// ── 1 y 3. Lectura directa de tablas y vistas sensibles ─────────────────────
const TABLAS = [
  ['conta_asientos', 'asientos contables'],
  ['conta_facturas', 'facturas'],
  ['rrhh_empleados', 'planilla de empleados'],
  ['fin_bancos', 'cuentas bancarias'],
  ['fin_cuentas_cobrar', 'cuentas por cobrar'],
  ['usuarios_sol', 'usuarios de SOL'],
  ['cp_facturas', 'facturas de proveedores'],
  ['boveda_accesos', 'bóveda de contraseñas'],
  ['per_estado_resultados', 'estado de resultados'],
  ['incomodidad_gasto_detalle', 'detalle de gastos'],
  ['neo_items_facturados', 'ventas'],
  ['zz_neo_antiguedad_saldos_clientes', 'deudas de clientes'],
  ['profecias_panel', 'panel de profecías'],
];

for (const [tabla, humano] of TABLAS) {
  const r = await pedir(`${SUPABASE_URL}/rest/v1/${tabla}?select=*&limit=1`, { headers: anon });
  if (r.ok) {
    const filas = await r.json().catch(() => []);
    if (Array.isArray(filas) && filas.length > 0) {
      huecos.push(`Se puede LEER <b>${humano}</b> (<code>${tabla}</code>) sin iniciar sesión`);
    }
  }
}

// ── 2. Escritura sin login ──────────────────────────────────────────────────
// Filtro que no matchea nada: si el permiso está mal, devuelve 204 sin tocar
// un solo dato. Nunca modifica nada.
for (const tabla of ['usuarios_sol', 'conta_asientos', 'rrhh_empleados', 'fin_bancos']) {
  const r = await pedir(
    `${SUPABASE_URL}/rest/v1/${tabla}?id=eq.00000000-0000-0000-0000-000000000000`,
    { method: 'PATCH', headers: { ...anon, 'Content-Type': 'application/json' }, body: '{}' }
  );
  if (r.status === 204 || r.status === 200) {
    huecos.push(`Se puede ESCRIBIR en <code>${tabla}</code> sin iniciar sesión`);
  }
}

// ── 4. Rutas /api que devuelven datos ───────────────────────────────────────
const RUTAS = [
  ['/api/contabilidad/asientos', 'asientos contables'],
  ['/api/contabilidad/facturas', 'facturas'],
  ['/api/compras-proveedor/proveedores', 'proveedores'],
  ['/api/compras-proveedor/compras', 'compras a proveedor'],
  ['/api/incomodidad/config', 'panel de incomodidad'],
  ['/api/admin/usuarios', 'usuarios de SOL'],
  ['/api/profecias/panel', 'profecías'],
  ['/api/metricas-web/ga4', 'métricas web'],
  ['/api/boveda', 'bóveda de contraseñas'],
  ['/api/rifa-admin', 'administración de la rifa'],
];

for (const [ruta, humano] of RUTAS) {
  const r = await pedir(`${APP_URL}${ruta}`, {}, 25000);
  if (r.ok) huecos.push(`<code>${ruta}</code> devuelve <b>${humano}</b> sin iniciar sesión`);
}

// ── 5. Crear un usuario administrador sin login ─────────────────────────────
// Manda datos inválidos a propósito: lo que importa es si RECHAZA por falta de
// permiso (401/403) o si llega a procesar el pedido.
{
  const r = await pedir(`${APP_URL}/api/admin/crear-usuario`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre: '', password: '', rol: 'admin' }),
  }, 25000);
  if (r.status !== 401 && r.status !== 403 && r.status !== 0) {
    huecos.push(`<code>/api/admin/crear-usuario</code> NO exige permiso (devolvió ${r.status}): cualquiera podría crearse un usuario admin`);
  }
}

// ── 6. Refresh pesados (barren ~786k filas: es plata en disco) ──────────────
for (const fn of ['refresh_mv_items_por_vend_mes', 'refresh_profecias_panel', 'bi_recalcular_resumen']) {
  const r = await pedir(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST', headers: { ...anon, 'Content-Type': 'application/json' }, body: '{}',
  });
  if (r.ok) huecos.push(`Cualquiera puede disparar <code>${fn}</code> sin login (barre cientos de miles de filas)`);
}

// ── 6.5 Pantallas vacías: los admin TIENEN que ver los datos ────────────────
// El 28/8/2026 el dueño vio la posición de bancos en cero y creyó que se habían
// borrado. Los datos estaban: la base se los filtraba porque su usuario no tenía
// ficha, y porque varias tablas estaban gateadas con un módulo que no era el de
// la pantalla. Un candado que esconde datos a quien SÍ debe verlos es tan grave
// como uno que no cierra, y se nota tarde. Por eso se chequea al revés también:
// que cada admin lea de verdad las tablas que sostienen las pantallas de plata.
if (SERVICE_KEY) {
  const svc = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
  const r = await pedir(`${SUPABASE_URL}/rest/v1/rpc/sol_diagnostico_pantallas`, {
    method: 'POST', headers: { ...svc, 'Content-Type': 'application/json' }, body: '{}',
  });
  if (r.ok) {
    const filas = await r.json().catch(() => []);
    for (const f of filas || []) {
      rotos.push(`<b>${f.nombre}</b> (${f.rol}) no ve <code>${f.tabla}</code>, que sí tiene datos`);
    }
  }
}

// ── 7. Lo que TIENE que seguir funcionando ──────────────────────────────────
const VIVOS = [
  [`${APP_URL}/login`, 'la pantalla de login', {}],
  ['https://rifa.depositojimenez.com/', 'la página pública de la Rifa', {}],
];
for (const [url, humano] of VIVOS) {
  const r = await pedir(url, {}, 25000);
  if (!r.ok) rotos.push(`${humano} no responde (${r.status || r._err})`);
}
for (const fn of ['rifa_patrocinadores_publicos']) {
  const r = await pedir(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST', headers: { ...anon, 'Content-Type': 'application/json' }, body: '{}',
  });
  if (!r.ok) rotos.push(`La Rifa pública no puede consultar (<code>${fn}</code> devolvió ${r.status})`);
}

// ── Aviso ───────────────────────────────────────────────────────────────────
async function telegram(texto) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  await pedir(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: texto, parse_mode: 'HTML' }),
  });
}

const hoy = new Date().toLocaleDateString('es-CR', { timeZone: 'America/Costa_Rica' });

if (huecos.length === 0 && rotos.length === 0) {
  console.log(`✅ ${hoy}: SOL cerrado. ${TABLAS.length} tablas, ${RUTAS.length} rutas y 3 procesos pesados probados sin login: ninguno dejó pasar.`);
  process.exit(0);
}

let msg = '';
if (huecos.length) {
  msg += `🚨 <b>SOL: hay datos abiertos sin login</b> (${hoy})\n\n`;
  msg += huecos.map((h, i) => `${i + 1}. ${h}`).join('\n');
  msg += '\n\n<b>Esto lo ve cualquiera en internet.</b> Hay que cerrarlo hoy.';
}
if (rotos.length) {
  if (msg) msg += '\n\n';
  msg += `⚠️ <b>SOL: algo que debería funcionar está caído</b> (${hoy})\n\n`;
  msg += rotos.map((r, i) => `${i + 1}. ${r}`).join('\n');
}

console.error(msg.replace(/<[^>]+>/g, ''));
await telegram(msg);
process.exit(1);
