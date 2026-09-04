import { requireUserOrMachine } from '../../../lib/auth-server'
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

let _sb;
function sb() {
  if (!_sb) _sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  return _sb;
}

// Refresca todas las vistas/tablas derivadas del catálogo NEO.
// Se usa desde el botón "Recalcular" del UI y desde el daemon de la Mac,
// que lo llama después de cada sync exitoso.
//
// UNA POR VEZ, NO EN PARALELO. Cada RPC barre las 786k filas de
// neo_items_facturados; lanzarlas las 4 juntas multiplicaba el Disk IO y
// dejaba a Supabase sin aire para atender a la app: el 4/9/2026 SOL quedó
// "cargando" 10 minutos con las 4 corriendo a la vez y hubo que matarlas a
// mano. En fila tardan lo mismo en total, pero entre una y otra la base
// sigue respondiendo.
//
// El p_force (saltear el throttle de
// supabase/migrations/20260819_disk_io_throttle_refresh.sql) ahora es opt-in:
// solo cuando una persona apretó "Recalcular". El daemon llama sin force
// después de cada sync — varias veces por día — y ahí el throttle es
// justamente lo que evita reconstruir todo de nuevo al pedo. El force solo lo
// acepta la base si viene con service key; desde el navegador se ignora.
const TAREAS = [
  { nombre: 'profecias_panel', rpc: 'refresh_profecias_panel' },
  { nombre: 'mv_consumo_mensual', rpc: 'refresh_mv_consumo_mensual' },
  { nombre: 'mv_items_por_vend_mes', rpc: 'refresh_mv_items_por_vend_mes' },
  { nombre: 'bi_resumen_producto', rpc: 'bi_recalcular_resumen' },
];

async function correrTarea(t, force) {
  const t0 = Date.now();
  try {
    const { data, error } = await sb().rpc(t.rpc, { p_force: force });
    if (error) return { ...t, ok: false, ms: Date.now() - t0, error: error.message };
    return { ...t, ok: true, ms: Date.now() - t0, resultado: data ?? null };
  } catch (e) {
    return { ...t, ok: false, ms: Date.now() - t0, error: e.message };
  }
}

export async function POST(request) {
  const _g = await requireUserOrMachine(request); if (_g.response) return _g.response;

  // force solo si el llamador lo pide explícitamente (botón "Recalcular").
  const body = await request.json().catch(() => ({}));
  const force = body?.force === true;

  const t0 = Date.now();
  const resultados = [];
  for (const t of TAREAS) resultados.push(await correrTarea(t, force));
  const okCount = resultados.filter(r => r.ok).length;
  return Response.json({
    ok: okCount === TAREAS.length,
    ms: Date.now() - t0,
    force,
    total: TAREAS.length,
    exitosas: okCount,
    fallidas: TAREAS.length - okCount,
    detalle: resultados,
  });
}

// Sin handler GET: un refresco forzado no debe poder dispararse desde una
// navegación del navegador o un <img> (CSRF). El daemon y los crons usan POST.
