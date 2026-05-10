import { sb, jsonError } from '../_lib.js';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  try {
    const body = await req.json();
    const codigo_interno = String(body.codigo_interno || '').trim();
    if (!codigo_interno) return jsonError('codigo_interno requerido', 400);

    // Tomamos snapshot del panel para registrar el contexto de la decisión
    const { data: panel } = await sb()
      .from('profecias_panel')
      .select('*')
      .eq('codigo_interno', codigo_interno)
      .single();

    const cantidad_firmada = parseFloat(body.cantidad_firmada);
    const costo_unitario_estimado = parseFloat(body.costo_unitario_estimado || panel?.ultimo_costo || 0) || 0;

    const fila = {
      codigo_interno,
      fecha_decision: new Date().toISOString().slice(0, 10),
      proveedor: body.proveedor || panel?.ultimo_proveedor || null,
      madurez_al_momento: panel?.madurez || null,
      velocidad_observada: panel?.velocidad_90d ?? panel?.velocidad_30d ?? null,
      existencias_al_momento: panel?.existencias ?? null,
      cantidad_sugerida: panel?.cantidad_sugerida ?? null,
      cantidad_firmada: Number.isFinite(cantidad_firmada) ? cantidad_firmada : (panel?.cantidad_sugerida ?? 0),
      costo_unitario_estimado,
      inversion_estimada: (Number.isFinite(cantidad_firmada) ? cantidad_firmada : (panel?.cantidad_sugerida ?? 0)) * costo_unitario_estimado,
      clasificacion_manual_al_momento: panel?.clasificacion_manual || 'normal',
      notas: body.notas || null,
      orden_compra_id: body.orden_compra_id || null,
    };

    const { data, error } = await sb()
      .from('profecias_historial_decisiones')
      .insert(fila)
      .select()
      .single();
    if (error) throw error;

    return Response.json({ ok: true, decision: data });
  } catch (e) {
    return jsonError(e.message);
  }
}
