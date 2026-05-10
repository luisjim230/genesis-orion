import { sb, jsonError, fetchAll } from '../_lib.js';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  try {
    const url = new URL(req.url);
    const filtros = {
      categoria: url.searchParams.getAll('categoria').filter(Boolean),
      proveedor: url.searchParams.getAll('proveedor').filter(Boolean),
      madurez: url.searchParams.getAll('madurez').filter(Boolean),
      semaforo: url.searchParams.getAll('semaforo').filter(Boolean),
      clasificacion: url.searchParams.getAll('clasificacion').filter(Boolean),
      busqueda: (url.searchParams.get('busqueda') || '').trim(),
      solo_sugerencia: url.searchParams.get('solo_sugerencia') === '1',
      ocultar_pausados: url.searchParams.get('ocultar_pausados') === '1',
      ocultar_ocultos: url.searchParams.get('ocultar_ocultos') === '1',
    };

    const data = await fetchAll((from, to) => {
      let q = sb().from('profecias_panel').select('*').range(from, to);
      if (filtros.categoria.length) q = q.in('categoria', filtros.categoria);
      if (filtros.proveedor.length) q = q.in('ultimo_proveedor', filtros.proveedor);
      if (filtros.madurez.length) q = q.in('madurez', filtros.madurez);
      if (filtros.semaforo.length) q = q.in('semaforo', filtros.semaforo);
      if (filtros.clasificacion.length) q = q.in('clasificacion_manual', filtros.clasificacion);
      if (filtros.solo_sugerencia) q = q.gt('cantidad_sugerida', 0);
      if (filtros.ocultar_pausados) q = q.eq('proveedor_pausado', false);
      if (filtros.ocultar_ocultos) q = q.eq('oculto_compras', false);
      return q;
    });

    // Búsqueda flexible (palabras desordenadas, AND entre todas)
    let filtrados = data;
    if (filtros.busqueda) {
      const palabras = filtros.busqueda.toLowerCase().split(/\s+/).filter(Boolean);
      filtrados = data.filter((row) => {
        const haystack = `${row.codigo_interno} ${row.item || ''} ${row.marca || ''} ${row.categoria || ''}`.toLowerCase();
        return palabras.every((p) => haystack.includes(p));
      });
    }

    return Response.json({
      ok: true,
      total: filtrados.length,
      filas: filtrados,
      calculado_en: filtrados[0]?.calculado_en || null,
    });
  } catch (e) {
    return jsonError(e.message);
  }
}
