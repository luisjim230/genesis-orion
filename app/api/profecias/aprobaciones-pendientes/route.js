import { sb, jsonError, fetchAll } from '../_lib.js';

export const dynamic = 'force-dynamic';

// GET aprobaciones con estado='aprobado', agrupadas por proveedor.
// Query opcional: ?proveedor=NOMBRE
export async function GET(req) {
  try {
    const url = new URL(req.url);
    const proveedorFiltro = (url.searchParams.get('proveedor') || '').trim();

    const aprobaciones = await fetchAll((from, to) => {
      let q = sb().from('profecias_aprobaciones')
        .select('*')
        .eq('estado', 'aprobado')
        .order('aprobado_en', { ascending: false })
        .range(from, to);
      if (proveedorFiltro) q = q.eq('proveedor', proveedorFiltro);
      return q;
    });

    if (!aprobaciones.length) {
      return Response.json({ ok: true, total: 0, grupos: [] });
    }

    // Enriquecer con datos del panel (item, lead time, tipo)
    const codigos = [...new Set(aprobaciones.map((a) => a.codigo_interno))];
    const { data: panelRows } = await sb()
      .from('profecias_panel')
      .select('codigo_interno, item, ultimo_proveedor, lead_time_dias, tipo_proveedor, existencias, ultimo_costo, moneda, semaforo, madurez')
      .in('codigo_interno', codigos);
    const panelMap = new Map((panelRows || []).map((p) => [p.codigo_interno, p]));

    const map = new Map();
    for (const a of aprobaciones) {
      const p = panelMap.get(a.codigo_interno) || {};
      const provKey = a.proveedor || p.ultimo_proveedor || 'SIN PROVEEDOR';
      if (!map.has(provKey)) {
        map.set(provKey, {
          proveedor: provKey,
          lead_time_dias: p.lead_time_dias ?? null,
          tipo_proveedor: p.tipo_proveedor ?? null,
          items: [],
        });
      }
      map.get(provKey).items.push({
        id: a.id,
        codigo_interno: a.codigo_interno,
        item: p.item || null,
        existencias_actual: p.existencias ?? null,
        existencias_al_momento: a.existencias_al_momento,
        cantidad_sugerida_original: a.cantidad_sugerida_original,
        cantidad_aprobada: a.cantidad_aprobada,
        costo_unitario_estimado: a.costo_unitario_estimado,
        inversion_estimada: a.inversion_estimada,
        moneda: p.moneda || 'CRC',
        madurez_al_momento: a.madurez_al_momento,
        semaforo_al_momento: a.semaforo_al_momento,
        semaforo_actual: p.semaforo ?? null,
        aprobado_en: a.aprobado_en,
        notas: a.notas,
      });
    }

    const grupos = [...map.values()].map((g) => {
      const num_items = g.items.length;
      const total_unidades = g.items.reduce((s, i) => s + (Number(i.cantidad_aprobada) || 0), 0);
      const inversion_total = g.items.reduce((s, i) => s + (Number(i.inversion_estimada) || 0), 0);
      return { ...g, totales: { num_items, total_unidades, inversion_total } };
    });
    grupos.sort((a, b) => b.totales.inversion_total - a.totales.inversion_total);

    return Response.json({
      ok: true,
      total: aprobaciones.length,
      proveedores: grupos.length,
      grupos,
    });
  } catch (e) {
    return jsonError(e.message);
  }
}
