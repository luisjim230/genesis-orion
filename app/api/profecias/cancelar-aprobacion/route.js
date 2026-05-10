import { sb, jsonError } from '../_lib.js';

export const dynamic = 'force-dynamic';

// POST cancelar UNA o VARIAS aprobaciones (devolverlas a pendiente).
// Body: { id?, ids?: [], motivo? }
export async function POST(req) {
  try {
    const body = await req.json();
    const ids = Array.isArray(body.ids) && body.ids.length
      ? body.ids.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0)
      : (body.id ? [Number(body.id)].filter((n) => Number.isFinite(n) && n > 0) : []);
    if (!ids.length) return jsonError('id o ids requeridos', 400);

    const { data, error } = await sb()
      .from('profecias_aprobaciones')
      .update({
        estado: 'cancelado',
        cancelado_en: new Date().toISOString(),
        motivo_cancelacion: body.motivo || null,
      })
      .in('id', ids)
      .eq('estado', 'aprobado') // sólo se cancelan las que están aprobadas (no las en_orden)
      .select();
    if (error) throw error;

    sb().rpc('refresh_profecias_panel').then(() => {}, () => {});

    return Response.json({ ok: true, count: data.length, ids: data.map((r) => r.id) });
  } catch (e) {
    return jsonError(e.message);
  }
}
