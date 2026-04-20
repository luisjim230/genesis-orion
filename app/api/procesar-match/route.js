import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

let _sb;
function getDb() { if (!_sb) _sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } }); return _sb; }

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
    await request.json().catch(() => ({}));

    // ── Cargar fechas de órdenes por separado (no depender de joins FK) ────
    const { data: todasOrdenes } = await getDb()
      .from('ordenes_compra')
      .select('id, fecha_orden');
    const fechaOrdenMap = {};
    for (const o of (todasOrdenes || [])) {
      if (o.id && o.fecha_orden) fechaOrdenMap[o.id] = o.fecha_orden;
    }

    // 1. Revertir matchs inválidos (recepción anterior a la fecha de orden)
    const { data: itemsConFecha } = await getDb()
      .from('ordenes_compra_items')
      .select('id, fecha_recepcion, orden_id')
      .in('estado_item', ['parcial', 'completo']);

    let revertidos = 0;
    if (itemsConFecha?.length) {
      const aRevertir = [];
      for (const item of itemsConFecha) {
        if (!item.fecha_recepcion) continue;
        const fechaOrdenRaw = fechaOrdenMap[item.orden_id];
        if (!fechaOrdenRaw) continue;
        const fRecep = parseFecha(item.fecha_recepcion);
        const fOrden = parseFecha(fechaOrdenRaw);
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

    // 2. Traer TODAS las compras históricas de NEO
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

    // 3. Ítems pendientes/parciales (sin join — fechas ya están en fechaOrdenMap)
    const { data: itemsPend } = await getDb()
      .from('ordenes_compra_items')
      .select('id, orden_id, codigo, cantidad_ordenada, cantidad_recibida, estado_item, creado_en')
      .in('estado_item', ['pendiente', 'parcial'])
      .order('creado_en', { ascending: false });

    const res = { completados: 0, parciales: 0, sin_match: 0, ignorados_por_fecha: 0, revertidos };

    if (!itemsPend || itemsPend.length === 0) {
      return NextResponse.json({ ok: true, ...res });
    }

    // 4. Agrupar compras por código (exacto y normalizado como fallback)
    const comprasPorCodigo = {};
    const comprasPorCodigoNorm = {};

    for (const c of todos) {
      const codExacto = String(c.codigo_interno || '').trim();
      if (!codExacto) continue;
      const codNorm = codExacto.toUpperCase();
      const fechaCompra = parseFecha(c.fecha);
      if (!fechaCompra) continue;
      const entrada = { cantidad: parseFloat(c.cantidad_comprada) || 0, fecha: fechaCompra };
      if (!comprasPorCodigo[codExacto]) comprasPorCodigo[codExacto] = [];
      comprasPorCodigo[codExacto].push(entrada);
      if (!comprasPorCodigoNorm[codNorm]) comprasPorCodigoNorm[codNorm] = [];
      comprasPorCodigoNorm[codNorm].push(entrada);
    }

    // 5. Agrupar OC items por código y ordenar por fecha de orden (FIFO: más antiguo primero)
    const itemsPorCodigo = {};
    for (const item of itemsPend) {
      const cod = String(item.codigo || '').trim();
      if (!cod) continue;
      if (!itemsPorCodigo[cod]) itemsPorCodigo[cod] = [];
      itemsPorCodigo[cod].push(item);
    }
    for (const cod of Object.keys(itemsPorCodigo)) {
      itemsPorCodigo[cod].sort((a, b) => {
        const fA = parseFecha(fechaOrdenMap[a.orden_id]);
        const fB = parseFecha(fechaOrdenMap[b.orden_id]);
        if (!fA && !fB) return 0;
        if (!fA) return 1;
        if (!fB) return -1;
        return fA - fB;
      });
    }

    // 6. Match FIFO — cada unidad comprada se asigna UNA SOLA VEZ a la OC más antigua
    const actualizaciones = [];

    for (const cod of Object.keys(itemsPorCodigo)) {
      const codNorm = cod.toUpperCase();
      const comprasBase = comprasPorCodigo[cod] || comprasPorCodigoNorm[codNorm];

      if (!comprasBase || comprasBase.length === 0) {
        res.sin_match += itemsPorCodigo[cod].length;
        console.warn(`[procesar-match] Sin compras para código "${cod}"`);
        continue;
      }

      const comprasOrdenadas = [...comprasBase].sort((a, b) => a.fecha - b.fecha);
      const disponibles = comprasOrdenadas.map(c => ({ ...c, restante: c.cantidad }));

      for (const item of itemsPorCodigo[cod]) {
        const fechaOrdenRaw = fechaOrdenMap[item.orden_id];
        const fechaOrden = parseFecha(fechaOrdenRaw);

        if (!fechaOrden) {
          console.warn(`[procesar-match] Sin fecha de orden para item ${item.id} (orden_id=${item.orden_id}) — ignorado`);
          res.ignorados_por_fecha++;
          continue;
        }

        const fechaOrdenDia = new Date(fechaOrden);
        fechaOrdenDia.setUTCHours(0, 0, 0, 0);

        const cantOrdenada = parseFloat(item.cantidad_ordenada) || 0;
        let cantRecibida = 0;
        let fechaRecep = null;

        for (const disp of disponibles) {
          if (disp.fecha < fechaOrdenDia) continue;
          if (disp.restante <= 0) continue;
          if (cantRecibida >= cantOrdenada) break;

          const consumir = Math.min(disp.restante, cantOrdenada - cantRecibida);
          cantRecibida += consumir;
          disp.restante -= consumir;
          if (!fechaRecep || disp.fecha > fechaRecep) fechaRecep = disp.fecha;
        }

        if (cantRecibida === 0) {
          res.sin_match++;
          continue;
        }

        const nuevoEstado = cantRecibida >= cantOrdenada ? 'completo' : 'parcial';
        res[nuevoEstado === 'completo' ? 'completados' : 'parciales']++;

        actualizaciones.push({
          id:                item.id,
          cantidad_recibida: cantRecibida,
          estado_item:       nuevoEstado,
          fecha_recepcion:   fechaRecep ? fechaRecep.toISOString() : null,
        });
      }
    }

    // Bulk upsert en lotes de 500
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
