import { sb, jsonError } from '../_lib.js';

export const dynamic = 'force-dynamic';

// POST convertir aprobaciones a orden de compra real.
// Body: { proveedor, ids_aprobaciones: [], nombre_lote?, dias_tribucion? }
export async function POST(req) {
  try {
    const body = await req.json();
    const proveedor = String(body.proveedor || '').trim();
    const ids = Array.isArray(body.ids_aprobaciones)
      ? body.ids_aprobaciones.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0)
      : [];
    if (!ids.length) return jsonError('ids_aprobaciones requerido', 400);

    const { data: aprobs, error: eAp } = await sb()
      .from('profecias_aprobaciones')
      .select('*')
      .in('id', ids)
      .eq('estado', 'aprobado');
    if (eAp) throw eAp;
    if (!aprobs.length) return jsonError('No se encontraron aprobaciones activas con esos IDs', 400);

    if (proveedor) {
      const ajeno = aprobs.find((a) => (a.proveedor || '').trim().toUpperCase() !== proveedor.toUpperCase());
      if (ajeno) return jsonError(`La aprobación ${ajeno.id} pertenece a otro proveedor (${ajeno.proveedor})`, 400);
    }
    const provDef = proveedor || aprobs[0].proveedor || 'SIN PROVEEDOR';

    // Traer items para tener nombre actual
    const codigos = [...new Set(aprobs.map((a) => a.codigo_interno))];
    const { data: panelRows } = await sb()
      .from('profecias_panel')
      .select('codigo_interno, item')
      .in('codigo_interno', codigos);
    const panelMap = new Map((panelRows || []).map((p) => [p.codigo_interno, p]));

    const ahora = new Date().toISOString();
    const nombreLote = body.nombre_lote || `Profecías · ${provDef} · ${ahora.slice(0, 10)}`;
    const diasTribucion = body.dias_tribucion != null ? parseInt(body.dias_tribucion) : null;

    // 1) Crear orden_compra
    const { data: orden, error: eOrd } = await sb()
      .from('ordenes_compra')
      .insert({
        fecha_orden: ahora,
        nombre_lote: nombreLote,
        dias_tribucion: diasTribucion,
        total_productos: aprobs.length,
        creado_en: ahora,
      })
      .select()
      .single();
    if (eOrd) throw eOrd;

    // 2) Crear ordenes_compra_items
    const itemsRows = aprobs.map((a) => ({
      orden_id: orden.id,
      codigo: a.codigo_interno,
      nombre: panelMap.get(a.codigo_interno)?.item || '',
      proveedor: a.proveedor || provDef,
      cantidad_ordenada: Number(a.cantidad_aprobada) || 0,
      costo_unitario: Number(a.costo_unitario_estimado) || 0,
      descuento: 0,
      dias_tribucion: diasTribucion,
      cantidad_recibida: 0,
      estado_item: 'pendiente',
      creado_en: ahora,
    }));
    const { error: eItems } = await sb().from('ordenes_compra_items').insert(itemsRows);
    if (eItems) {
      // Rollback manual: borrar la orden recién creada
      await sb().from('ordenes_compra').delete().eq('id', orden.id);
      throw eItems;
    }

    // 3) Marcar aprobaciones como en_orden
    const { error: eUpd } = await sb()
      .from('profecias_aprobaciones')
      .update({
        estado: 'en_orden',
        orden_compra_id: orden.id,
        fecha_envio_orden: ahora,
      })
      .in('id', aprobs.map((a) => a.id));
    if (eUpd) {
      await sb().from('ordenes_compra_items').delete().eq('orden_id', orden.id);
      await sb().from('ordenes_compra').delete().eq('id', orden.id);
      throw eUpd;
    }

    sb().rpc('refresh_profecias_panel').then(() => {}, () => {});

    const inversion_total = aprobs.reduce((s, a) => s + (Number(a.inversion_estimada) || 0), 0);
    return Response.json({
      ok: true,
      orden_id: orden.id,
      nombre_lote: nombreLote,
      num_items: aprobs.length,
      inversion_total,
    });
  } catch (e) {
    return jsonError(e.message);
  }
}
