import { sb, jsonError } from '../_lib.js';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  try {
    const body = await req.json();
    const items = Array.isArray(body.items) ? body.items : [];
    if (!items.length) return jsonError('items vacío', 400);

    const codigos = [...new Set(items.map((i) => String(i.codigo_interno || '').trim()).filter(Boolean))];
    if (!codigos.length) return jsonError('items sin codigo_interno', 400);

    const { data: panelRows } = await sb()
      .from('profecias_panel')
      .select('codigo_interno, ultimo_proveedor, madurez, velocidad_90d, velocidad_30d, existencias, cantidad_sugerida, ultimo_costo, clasificacion_manual')
      .in('codigo_interno', codigos);
    const panelMap = new Map((panelRows || []).map((p) => [p.codigo_interno, p]));

    const hoy = new Date().toISOString().slice(0, 10);
    const filas = items.map((it) => {
      const panel = panelMap.get(String(it.codigo_interno).trim()) || {};
      const cantidad_firmada = parseFloat(it.cantidad_firmada);
      const costo = parseFloat(it.costo_unitario_estimado || panel.ultimo_costo || 0) || 0;
      const cant = Number.isFinite(cantidad_firmada) ? cantidad_firmada : (panel.cantidad_sugerida ?? 0);
      return {
        codigo_interno: String(it.codigo_interno).trim(),
        fecha_decision: hoy,
        proveedor: it.proveedor || panel.ultimo_proveedor || null,
        madurez_al_momento: panel.madurez || null,
        velocidad_observada: panel.velocidad_90d ?? panel.velocidad_30d ?? null,
        existencias_al_momento: panel.existencias ?? null,
        cantidad_sugerida: panel.cantidad_sugerida ?? null,
        cantidad_firmada: cant,
        costo_unitario_estimado: costo,
        inversion_estimada: cant * costo,
        clasificacion_manual_al_momento: panel.clasificacion_manual || 'normal',
        notas: it.notas || null,
        orden_compra_id: it.orden_compra_id || body.orden_compra_id || null,
      };
    });

    const { data, error } = await sb()
      .from('profecias_historial_decisiones')
      .insert(filas)
      .select();
    if (error) throw error;

    return Response.json({ ok: true, total: data.length });
  } catch (e) {
    return jsonError(e.message);
  }
}
