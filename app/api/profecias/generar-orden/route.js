import { sb, jsonError } from '../_lib.js';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  try {
    const body = await req.json();
    const proveedor = String(body.proveedor || '').trim();
    const items = Array.isArray(body.items) ? body.items.filter((i) => parseFloat(i.cantidad) > 0) : [];
    if (!items.length) return jsonError('items vacío', 400);

    const ahora = new Date().toISOString();
    const nombreLote = body.nombre_lote || `Profecías · ${proveedor || 'mixto'} · ${ahora.slice(0, 10)}`;
    const diasTribucion = parseInt(body.dias_tribucion) || null;

    const { data: orden, error: e1 } = await sb()
      .from('ordenes_compra')
      .insert({
        fecha_orden: ahora,
        nombre_lote: nombreLote,
        dias_tribucion: diasTribucion,
        total_productos: items.length,
        creado_en: ahora,
      })
      .select()
      .single();
    if (e1) throw e1;

    const codigos = items.map((i) => String(i.codigo).trim());
    const { data: panelRows } = await sb()
      .from('profecias_panel')
      .select('codigo_interno, item, ultimo_proveedor, madurez, velocidad_90d, velocidad_30d, existencias, cantidad_sugerida, ultimo_costo, clasificacion_manual')
      .in('codigo_interno', codigos);
    const panelMap = new Map((panelRows || []).map((p) => [p.codigo_interno, p]));

    const itemsRows = items.map((i) => {
      const p = panelMap.get(String(i.codigo).trim()) || {};
      return {
        orden_id: orden.id,
        codigo: String(i.codigo).trim(),
        nombre: i.nombre || p.item || '',
        proveedor: i.proveedor || p.ultimo_proveedor || proveedor || '',
        cantidad_ordenada: parseFloat(i.cantidad) || 0,
        costo_unitario: parseFloat(i.costo_unitario || p.ultimo_costo || 0) || 0,
        descuento: parseFloat(i.descuento) || 0,
        dias_tribucion: diasTribucion,
        cantidad_recibida: 0,
        estado_item: 'pendiente',
        creado_en: ahora,
      };
    });
    const { error: e2 } = await sb().from('ordenes_compra_items').insert(itemsRows);
    if (e2) throw e2;

    const decisionRows = items.map((i) => {
      const p = panelMap.get(String(i.codigo).trim()) || {};
      const cant = parseFloat(i.cantidad) || 0;
      const costo = parseFloat(i.costo_unitario || p.ultimo_costo || 0) || 0;
      return {
        codigo_interno: String(i.codigo).trim(),
        fecha_decision: ahora.slice(0, 10),
        proveedor: i.proveedor || p.ultimo_proveedor || proveedor || null,
        madurez_al_momento: p.madurez || null,
        velocidad_observada: p.velocidad_90d ?? p.velocidad_30d ?? null,
        existencias_al_momento: p.existencias ?? null,
        cantidad_sugerida: p.cantidad_sugerida ?? null,
        cantidad_firmada: cant,
        costo_unitario_estimado: costo,
        inversion_estimada: cant * costo,
        clasificacion_manual_al_momento: p.clasificacion_manual || 'normal',
        notas: i.notas || null,
        orden_compra_id: orden.id,
      };
    });
    await sb().from('profecias_historial_decisiones').insert(decisionRows);

    return Response.json({ ok: true, orden_id: orden.id, total: items.length });
  } catch (e) {
    return jsonError(e.message);
  }
}
