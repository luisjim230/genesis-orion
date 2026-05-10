import { sb, jsonError } from '../_lib.js';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { data, error } = await sb().from('profecias_config').select('*').eq('id', 1).single();
    if (error) throw error;
    return Response.json({ ok: true, config: data });
  } catch (e) {
    return jsonError(e.message);
  }
}

export async function PUT(req) {
  try {
    const body = await req.json();
    const allow = [
      'safety_stock_dias_extranjero',
      'safety_stock_dias_nacional',
      'ciclo_pedido_dias_extranjero',
      'ciclo_pedido_dias_nacional',
      'factor_ajuste_promocion',
      'factor_recien_nacido_conservador',
      'factor_recien_nacido_agresivo',
      'dias_alerta_stockout',
      'dias_alerta_descontinuar',
      'tipo_cambio_referencia',
    ];
    const patch = {};
    for (const k of allow) if (body[k] !== undefined && body[k] !== null) patch[k] = body[k];
    patch.actualizado_en = new Date().toISOString();

    const { data, error } = await sb()
      .from('profecias_config')
      .update(patch)
      .eq('id', 1)
      .select()
      .single();
    if (error) throw error;
    return Response.json({ ok: true, config: data });
  } catch (e) {
    return jsonError(e.message);
  }
}
