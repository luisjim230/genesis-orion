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
// Se usa tanto desde los botones "Recalcular" del UI como desde el cron
// diario. Cada RPC se ejecuta en paralelo y los errores se reportan por
// separado sin abortar al resto: la idea es que un solo botón sincronice
// inventario, consumo, ventas e indicadores BI en un único click.
const TAREAS = [
  { nombre: 'profecias_panel', rpc: 'refresh_profecias_panel' },
  { nombre: 'mv_consumo_mensual', rpc: 'refresh_mv_consumo_mensual' },
  { nombre: 'mv_items_por_vend_mes', rpc: 'refresh_mv_items_por_vend_mes' },
  { nombre: 'bi_resumen_producto', rpc: 'bi_recalcular_resumen' },
];

async function correrTarea(t) {
  const t0 = Date.now();
  try {
    const { data, error } = await sb().rpc(t.rpc);
    if (error) return { ...t, ok: false, ms: Date.now() - t0, error: error.message };
    return { ...t, ok: true, ms: Date.now() - t0, resultado: data ?? null };
  } catch (e) {
    return { ...t, ok: false, ms: Date.now() - t0, error: e.message };
  }
}

export async function POST() {
  const t0 = Date.now();
  const resultados = await Promise.all(TAREAS.map(correrTarea));
  const okCount = resultados.filter(r => r.ok).length;
  return Response.json({
    ok: okCount === TAREAS.length,
    ms: Date.now() - t0,
    total: TAREAS.length,
    exitosas: okCount,
    fallidas: TAREAS.length - okCount,
    detalle: resultados,
  });
}

export async function GET() { return POST(); }
