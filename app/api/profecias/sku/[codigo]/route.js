import { sb, jsonError, fetchAll } from '../../_lib.js';

export const dynamic = 'force-dynamic';

export async function GET(_req, { params }) {
  try {
    const { codigo } = await params;
    if (!codigo) return jsonError('codigo requerido', 400);

    const [{ data: panel }, { data: lista }, { data: estado }, decisiones] = await Promise.all([
      sb().from('profecias_panel').select('*').eq('codigo_interno', codigo).single(),
      sb().from('neo_lista_items').select('descripcion, marca, tipo, categoria, proveedor, codigo_cabys, costo_sin_imp, moneda_costo, precio_con_imp').eq('codigo_interno', codigo).limit(1).maybeSingle(),
      sb().from('profecias_estado_skus').select('*').eq('codigo_interno', codigo).maybeSingle(),
      sb().from('profecias_historial_decisiones').select('*').eq('codigo_interno', codigo).order('fecha_decision', { ascending: false }).limit(50),
    ]);

    if (!panel) return jsonError('SKU no encontrado en profecias_panel', 404);

    // Histórico mensual últimos 24 meses
    const hace24m = new Date();
    hace24m.setMonth(hace24m.getMonth() - 24);
    const fechaCorte = hace24m.toISOString().slice(0, 10);

    const ventas = await fetchAll((from, to) =>
      sb().from('neo_items_facturados')
        .select('fecha_real, cantidad_facturada, cantidad_devuelta, total')
        .eq('codigo_interno', codigo)
        .gte('fecha_real', fechaCorte)
        .order('fecha_real', { ascending: true })
        .range(from, to)
    );

    const mensual = new Map();
    for (const v of ventas) {
      if (!v.fecha_real) continue;
      const ym = v.fecha_real.slice(0, 7);
      const neto = (parseFloat(v.cantidad_facturada) || 0) - (parseFloat(v.cantidad_devuelta) || 0);
      const monto = parseFloat(v.total) || 0;
      const cur = mensual.get(ym) || { mes: ym, unidades: 0, monto: 0 };
      cur.unidades += neto;
      cur.monto += monto;
      mensual.set(ym, cur);
    }
    const historico_mensual = Array.from(mensual.values())
      .map((m) => ({ ...m, unidades: Math.round(m.unidades * 100) / 100, monto: Math.round(m.monto * 100) / 100 }))
      .sort((a, b) => a.mes.localeCompare(b.mes));

    return Response.json({
      ok: true,
      panel,
      lista_items: lista || null,
      estado: estado || null,
      historico_mensual,
      decisiones: decisiones?.data || [],
    });
  } catch (e) {
    return jsonError(e.message);
  }
}
