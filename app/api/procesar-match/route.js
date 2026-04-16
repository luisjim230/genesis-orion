import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

let _sb;
function getDb() { if (!_sb) _sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY); return _sb; }

// Parse robusto: acepta "2026-03-09", "09/03/2026", serial Excel, ISO string
function parseFecha(val) {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;

  const s = String(val).trim();
  if (!s) return null;

  // Serial Excel (número) ej: 44929
  const num = Number(s);
  if (!isNaN(num) && num > 40000 && num < 60000) {
    return new Date(Math.round((num - 25569) * 86400 * 1000));
  }

  // Formato DD/MM/YYYY (el que usa NEO en algunos exports)
  const dmyMatch = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    return new Date(`${y}-${m}-${d}T00:00:00Z`);
  }

  // ISO / YYYY-MM-DD
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export async function POST(request) {
  try {
    await request.json().catch(() => ({})); // fecha_carga ya no se usa como filtro

    // 1. Revertir matchs inválidos (recepción anterior a la fecha de orden)
    const { data: itemsConFecha } = await getDb()
      .from('ordenes_compra_items')
      .select('id, fecha_recepcion, orden_id, ordenes_compra(fecha_orden)')
      .in('estado_item', ['parcial', 'completo']);

    let revertidos = 0;
    if (itemsConFecha?.length) {
      const aRevertir = [];
      for (const item of itemsConFecha) {
        if (!item.fecha_recepcion) continue;
        const fechaOrden = item.ordenes_compra?.fecha_orden;
        if (!fechaOrden) continue;
        const fRecep = parseFecha(item.fecha_recepcion);
        const fOrden = parseFecha(fechaOrden);
        if (!fRecep || !fOrden) continue;
        if (fRecep < fOrden) {
          aRevertir.push({ id: item.id, cantidad_recibida: 0, estado_item: 'pendiente', fecha_recepcion: null });
          revertidos++;
        }
      }
      if (aRevertir.length > 0) {
        await getDb().from('ordenes_compra_items').upsert(aRevertir, { onConflict: 'id' });
      }
    }

    // 2. Traer TODAS las compras históricas de NEO (sin filtrar por fecha_carga)
    const PAGE_SIZE = 1000;
    let todos = [];
    let offset = 0;
    while (true) {
      const { data } = await getDb()
        .from('neo_items_comprados')
        .select('codigo_interno, cantidad_comprada, fecha')
        .range(offset, offset + PAGE_SIZE - 1);
      if (!data || data.length === 0) break;
      todos = todos.concat(data);
      if (data.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    if (todos.length === 0) {
      return NextResponse.json({ ok: false, error: 'Sin datos en neo_items_comprados' });
    }

    // 3. Ítems pendientes/parciales
    const { data: itemsPend } = await getDb()
      .from('ordenes_compra_items')
      .select('*, ordenes_compra(fecha_orden)')
      .in('estado_item', ['pendiente', 'parcial'])
      .order('creado_en', { ascending: false });

    const res = { completados: 0, parciales: 0, sin_match: 0, ignorados_por_fecha: 0, revertidos };

    if (!itemsPend || itemsPend.length === 0) {
      return NextResponse.json({ ok: true, ...res });
    }

    // 4. Agrupar compras por código con fecha parseada
    //    CRÍTICO: si la fecha no se puede parsear, omitir la compra.
    //    No podemos saber si es anterior o posterior a la orden sin fecha válida.
    const comprasPorCodigo = {};
    for (const c of todos) {
      const cod = String(c.codigo_interno || '').trim();
      if (!cod) continue;
      const fechaCompra = parseFecha(c.fecha);
      if (!fechaCompra) {
        console.warn(`[procesar-match] Fecha no parseable código ${cod}: "${c.fecha}" — omitido`);
        continue;
      }
      if (!comprasPorCodigo[cod]) comprasPorCodigo[cod] = [];
      comprasPorCodigo[cod].push({
        cantidad: parseFloat(c.cantidad_comprada) || 0,
        fecha: fechaCompra,
      });
    }

    // 5. Match — SOLO compras ESTRICTAMENTE POSTERIORES a la fecha de la orden
    const actualizaciones = [];
    for (const item of itemsPend) {
      const cod = String(item.codigo || '').trim();
      const compras = comprasPorCodigo[cod];
      if (!compras || compras.length === 0) { res.sin_match++; continue; }

      const foRaw = item.ordenes_compra?.fecha_orden || item.fecha_orden;
      const fechaOrden = parseFecha(foRaw);

      if (!fechaOrden) {
        console.warn(`[procesar-match] Orden sin fecha para item ${item.id} código ${cod} — ignorado`);
        res.ignorados_por_fecha++;
        continue;
      }

      // Comparar solo por fecha calendario (ignorar hora), para que compras del mismo día siempre matcheen
      const fechaOrdenDia = new Date(fechaOrden); fechaOrdenDia.setUTCHours(0, 0, 0, 0);
      const validas = compras.filter(c => c.fecha >= fechaOrdenDia);

      if (validas.length === 0) {
        res.ignorados_por_fecha++;
        continue;
      }

      const cantRecibida = validas.reduce((s, c) => s + c.cantidad, 0);
      const fechaRecep   = validas.reduce((mx, c) => (!mx || c.fecha > mx ? c.fecha : mx), null);
      const cantOrdenada = parseFloat(item.cantidad_ordenada) || 0;
      const nuevoEstado  = cantRecibida >= cantOrdenada ? 'completo' : 'parcial';
      res[nuevoEstado === 'completo' ? 'completados' : 'parciales']++;

      actualizaciones.push({
        id:               item.id,
        cantidad_recibida: cantRecibida,
        estado_item:       nuevoEstado,
        fecha_recepcion:   fechaRecep ? fechaRecep.toISOString() : null,
      });
    }

    // Bulk upsert en lotes de 500 para no exceder límites
    const BATCH = 500;
    for (let i = 0; i < actualizaciones.length; i += BATCH) {
      await getDb().from('ordenes_compra_items').upsert(actualizaciones.slice(i, i + BATCH), { onConflict: 'id' });
    }

    console.log('[procesar-match] Resultado:', res);
    return NextResponse.json({ ok: true, ...res });

  } catch (e) {
    console.error('[procesar-match] Error:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
