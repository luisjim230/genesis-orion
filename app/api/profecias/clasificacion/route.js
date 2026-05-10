import { sb, jsonError } from '../_lib.js';

export const dynamic = 'force-dynamic';

const VALIDAS = ['normal', 'en_promocion', 'falta_promocion', 'dormido_discontinuar', 'estacional'];

export async function POST(req) {
  try {
    const body = await req.json();
    const codigo_interno = String(body.codigo_interno || '').trim();
    const clasificacion_manual = String(body.clasificacion_manual || 'normal');
    if (!codigo_interno) return jsonError('codigo_interno requerido', 400);
    if (!VALIDAS.includes(clasificacion_manual)) return jsonError('clasificacion_manual inválida', 400);

    const payload = {
      codigo_interno,
      clasificacion_manual,
      ciclo_pedido_dias: body.ciclo_pedido_dias ?? null,
      safety_stock_dias: body.safety_stock_dias ?? null,
      notas: body.notas ?? null,
      actualizado_por: body.actualizado_por || null,
      actualizado_en: new Date().toISOString(),
    };

    const { data, error } = await sb()
      .from('profecias_estado_skus')
      .upsert(payload, { onConflict: 'codigo_interno' })
      .select()
      .single();

    if (error) throw error;

    // Refresh para que el panel refleje el cambio (no bloquea respuesta si falla)
    sb().rpc('refresh_profecias_panel').then(() => {}, () => {});

    return Response.json({ ok: true, estado: data });
  } catch (e) {
    return jsonError(e.message);
  }
}
