import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export async function POST(request) {
  try {
    const { fecha_carga } = await request.json();
    if (!fecha_carga) return NextResponse.json({ error: 'fecha_carga requerida' }, { status: 400 });

    // 1. Revertir matchs inválidos (recepción anterior a la orden)
    const { data: itemsConFecha } = await supabase
      .from('ordenes_compra_items')
      .select('id, fecha_recepcion, orden_id, ordenes_compra(fecha_orden)')
      .in('estado_item', ['parcial', 'completo']);

    let revertidos = 0;
    if (itemsConFecha?.length) {
      for (const item of itemsConFecha) {
        if (!item.fecha_recepcion) continue;
        const fechaOrden = item.ordenes_compra?.fecha_orden;
        if (!fechaOrden) continue;
        if (new Date(item.fecha_recepcion) <= new Date(fechaOrden)) {
          await supabase.from('ordenes_compra_items').update({
            cantidad_recibida: 0, estado_item: 'pendiente', fecha_recepcion: null,
          }).eq('id', item.id);
          revertidos++;
        }
      }
    }

    // 2. Traer compras NEO con paginación
    const PAGE_SIZE = 1000;
    let todos = [];
    let offset = 0;
    while (true) {
      const { data } = await supabase
        .from('neo_items_comprados')
        .select('codigo_interno, cantidad_comprada, fecha')
        .eq('fecha_carga', fecha_carga)
        .range(offset, offset + PAGE_SIZE - 1);
      if (!data || data.length === 0) break;
      todos = todos.concat(data);
      if (data.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    if (todos.length === 0) {
      return NextResponse.json({ ok: false, error: 'Sin datos en neo_items_comprados para esta carga' });
    }

    // 3. Traer ítems pendientes/parciales
    const { data: itemsPend } = await supabase
      .from('ordenes_compra_items')
      .select('*, ordenes_compra(fecha_orden)')
      .in('estado_item', ['pendiente', 'parcial'])
      .order('creado_en', { ascending: false });

    const res = { completados: 0, parciales: 0, sin_match: 0, ignorados_por_fecha: 0, revertidos };

    if (!itemsPend || itemsPend.length === 0) {
      return NextResponse.json({ ok: true, ...res });
    }

    // 4. Agrupar compras por código
    const comprasPorCodigo = {};
    for (const c of todos) {
      const cod = String(c.codigo_interno || '').trim();
      if (!cod) continue;
      if (!comprasPorCodigo[cod]) comprasPorCodigo[cod] = [];
      comprasPorCodigo[cod].push({
        cantidad: parseFloat(c.cantidad_comprada) || 0,
        fecha: c.fecha ? new Date(c.fecha) : null,
      });
    }

    // 5. Ejecutar match
    for (const item of itemsPend) {
      const cod = String(item.codigo || '').trim();
      const compras = comprasPorCodigo[cod];
      if (!compras || compras.length === 0) { res.sin_match++; continue; }

      let fechaOrden = null;
      try {
        const fo = item.ordenes_compra?.fecha_orden || item.fecha_orden;
        if (fo) fechaOrden = new Date(fo);
      } catch {}

      const validas = fechaOrden
        ? compras.filter(c => c.fecha && c.fecha > fechaOrden)
        : compras;

      if (validas.length === 0) { res.ignorados_por_fecha++; continue; }

      const cantRecibida = validas.reduce((s, c) => s + c.cantidad, 0);
      const fechaRecep   = validas.reduce((mx, c) => (!mx || (c.fecha && c.fecha > mx) ? c.fecha : mx), null);
      const cantOrdenada = parseFloat(item.cantidad_ordenada) || 0;
      const nuevoEstado  = cantRecibida >= cantOrdenada ? 'completo' : 'parcial';
      res[nuevoEstado === 'completo' ? 'completados' : 'parciales']++;

      await supabase.from('ordenes_compra_items').update({
        cantidad_recibida: cantRecibida,
        estado_item:       nuevoEstado,
        fecha_recepcion:   fechaRecep ? fechaRecep.toISOString() : null,
      }).eq('id', item.id);
    }

    console.log('[procesar-match] Resultado:', res);
    return NextResponse.json({ ok: true, ...res });

  } catch (e) {
    console.error('[procesar-match] Error:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
